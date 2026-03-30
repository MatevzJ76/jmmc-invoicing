// ── users.js ─────────────────────────────────────────────────
const express  = require('express');
const supabase = require('../utils/supabase');
const { requireAuth } = require('./auth');

const usersRouter = express.Router();

// GET /api/users/assignable — controller + revisore attivi (per dropdown delegati)
// Accessible to all authenticated users
usersRouter.get('/assignable', requireAuth('admin','supervisor','controller','delegato','revisore'), async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('id,name,responsible,role')
    .in('role', ['controller','revisore'])
    .eq('active', true)
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

usersRouter.get('/', requireAuth('admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('id,email,name,role,responsible,active,created_at')
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

usersRouter.post('/', requireAuth('admin'), async (req, res) => {
  const { email, name, role } = req.body;
  // Per controller e revisore, responsible = name (per filtraggio fatture)
  const responsible = ['controller','revisore'].includes(role) ? name : null;
  const { data, error } = await supabase
    .from('users')
    .insert({ email: email.toLowerCase(), name, role, responsible })
    .select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
});

usersRouter.put('/:id', requireAuth('admin'), async (req, res) => {
  const { name, email, role, active } = req.body;
  const updates = { updated_at: new Date().toISOString() };
  if (name   !== undefined) updates.name   = name;
  if (email  !== undefined) updates.email  = email.toLowerCase();
  if (active !== undefined) updates.active = active;
  if (role   !== undefined) {
    updates.role = role;
    // Auto-sincronizzo responsible = name per controller/revisore
    if (['controller','revisore'].includes(role)) {
      updates.responsible = name !== undefined ? name : null;
    } else {
      updates.responsible = null;
    }
  }
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', req.params.id)
    .select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
});

module.exports = usersRouter;
