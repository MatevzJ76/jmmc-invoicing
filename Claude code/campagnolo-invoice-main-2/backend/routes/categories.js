// ── categories.js ────────────────────────────────────────────
const express  = require('express');
const supabase = require('../utils/supabase');
const { requireAuth } = require('./auth');
const { responsibleColumns } = require('../utils/responsibleResolve');

const router = express.Router();

// Detect "column does not exist" error from Supabase/PostgREST so we can
// gracefully fall back when responsible_user_id has not yet been added to
// the table by the SQL migration.
function isMissingResponsibleUserIdError(err) {
  if (!err) return false;
  const msg = String(err.message || '');
  return msg.includes('responsible_user_id') ||
         (msg.toLowerCase().includes('column') && msg.toLowerCase().includes('does not exist'));
}

router.get('/', requireAuth(), async (req, res) => {
  const { data, error } = await supabase
    .from('categories').select('*').order('cost_type');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

router.post('/', requireAuth('admin'), async (req, res) => {
  const { costType, responsible } = req.body;
  const respCols = await responsibleColumns(responsible);
  // Try with responsible_user_id; fall back if the column doesn't exist yet.
  let { data, error } = await supabase
    .from('categories')
    .insert({ cost_type: costType, ...respCols })
    .select().single();
  if (error && isMissingResponsibleUserIdError(error)) {
    ({ data, error } = await supabase
      .from('categories')
      .insert({ cost_type: costType, responsible: respCols.responsible })
      .select().single());
  }
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
});

router.put('/:id', requireAuth('admin'), async (req, res) => {
  const { costType, responsible, active } = req.body;
  const updates = {};
  if (costType    !== undefined) updates.cost_type   = costType;
  if (active      !== undefined) updates.active      = active;
  updates.updated_at = new Date().toISOString();
  if (responsible !== undefined) {
    const respCols = await responsibleColumns(responsible);
    updates.responsible         = respCols.responsible;
    updates.responsible_user_id = respCols.responsible_user_id;
  }
  let { data, error } = await supabase
    .from('categories').update(updates).eq('id', req.params.id).select().single();
  if (error && isMissingResponsibleUserIdError(error)) {
    const fallback = { ...updates };
    delete fallback.responsible_user_id;
    ({ data, error } = await supabase
      .from('categories').update(fallback).eq('id', req.params.id).select().single());
  }
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
});

router.delete('/:id', requireAuth('admin'), async (req, res) => {
  // Soft delete — just deactivate
  const { error } = await supabase
    .from('categories')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// ── DELETE /api/categories/:id/permanent — hard delete ──────
// Blocca se la categoria è usata in invoices o supplier_category_hints.
router.delete('/:id/permanent', requireAuth('admin'), async (req, res) => {
  try {
    const id = req.params.id;

    // Count invoices referencing this category
    const { count: invoiceCount, error: invErr } = await supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', id);
    if (invErr) throw invErr;
    if ((invoiceCount || 0) > 0) {
      return res.status(409).json({
        error: `Impossibile eliminare: ${invoiceCount} fattur${invoiceCount === 1 ? 'a usa' : 'e usano'} questa categoria.`,
        code: 'used_in_invoices',
        count: invoiceCount,
      });
    }

    // Count supplier_category_hints referencing this category
    const { count: hintCount, error: hErr } = await supabase
      .from('supplier_category_hints')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', id);
    if (hErr) throw hErr;
    if ((hintCount || 0) > 0) {
      return res.status(409).json({
        error: `Impossibile eliminare: ${hintCount} regol${hintCount === 1 ? 'a Fornitori usa' : 'e Fornitori usano'} questa categoria.`,
        code: 'used_in_hints',
        count: hintCount,
      });
    }

    // Safe to hard delete
    const { error: delErr } = await supabase
      .from('categories')
      .delete()
      .eq('id', id);
    if (delErr) throw delErr;

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
