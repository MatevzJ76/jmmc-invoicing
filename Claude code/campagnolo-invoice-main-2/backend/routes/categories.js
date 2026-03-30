// ── categories.js ────────────────────────────────────────────
const express  = require('express');
const supabase = require('../utils/supabase');
const { requireAuth } = require('./auth');

const router = express.Router();

router.get('/', requireAuth(), async (req, res) => {
  const { data, error } = await supabase
    .from('categories').select('*').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

router.post('/', requireAuth('admin'), async (req, res) => {
  const { name, costType, responsible } = req.body;
  const { data, error } = await supabase
    .from('categories')
    .insert({ name, cost_type: costType, responsible })
    .select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
});

router.put('/:id', requireAuth('admin'), async (req, res) => {
  const { name, costType, responsible, active } = req.body;
  const updates = {};
  if (name        !== undefined) updates.name        = name;
  if (costType    !== undefined) updates.cost_type   = costType;
  if (responsible !== undefined) updates.responsible = responsible;
  if (active      !== undefined) updates.active      = active;
  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('categories').update(updates).eq('id', req.params.id).select().single();
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

module.exports = router;
