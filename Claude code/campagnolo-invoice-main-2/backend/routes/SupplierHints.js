const express  = require('express');
const supabase = require('../utils/supabase');
const { requireAuth } = require('./auth');

const router = express.Router();

// ── GET /api/supplier-hints — seznam vseh zapisov ─────────────
router.get('/', requireAuth('admin'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('supplier_category_hints')
      .select('*, categories(id, name)')
      .order('usage_count', { ascending: false });

    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/supplier-hints/:id — posodobi cost_type ──────────
router.put('/:id', requireAuth('admin'), async (req, res) => {
  try {
    const { costType, categoryId } = req.body;

    const updates = { updated_at: new Date().toISOString() };
    if (costType   !== undefined) updates.cost_type   = costType;
    if (categoryId !== undefined) updates.category_id = categoryId;

    // Če se category_id spremeni, posodobi tudi cost_type iz kategorije
    if (categoryId) {
      const { data: cat } = await supabase
        .from('categories')
        .select('cost_type')
        .eq('id', categoryId)
        .single();
      if (cat?.cost_type) updates.cost_type = cat.cost_type;
    }

    const { error } = await supabase
      .from('supplier_category_hints')
      .update(updates)
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/supplier-hints/:id — briši zapis ──────────────
router.delete('/:id', requireAuth('admin'), async (req, res) => {
  try {
    const { error } = await supabase
      .from('supplier_category_hints')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
