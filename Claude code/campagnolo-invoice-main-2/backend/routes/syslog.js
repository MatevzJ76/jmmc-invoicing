const express  = require('express');
const supabase = require('../utils/supabase');
const { requireAuth } = require('./auth');
const { sysLog } = require('../utils/logger');
const router = express.Router();

// GET /api/syslog
router.get('/', requireAuth('admin'), async (req, res) => {
  try {
    const { level, category, search, page = 1, limit = 100 } = req.query;
    let query = supabase
      .from('system_log')
      .select('*', { count: 'exact' })
      .order('ts', { ascending: false });
    if (level)    query = query.eq('level', level);
    if (category) query = query.eq('category', category);
    if (search)   query = query.or(`action.ilike.%${search}%,detail.ilike.%${search}%,error_msg.ilike.%${search}%`);
    const from = (Number(page) - 1) * Number(limit);
    query = query.range(from, from + Number(limit) - 1);
    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/syslog/clean — delete entries older than 90 days
router.post('/clean', requireAuth('admin'), async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from('system_log')
      .delete({ count: 'exact' })
      .lt('ts', cutoff);
    if (error) throw error;
    await sysLog('INFO', 'SYSTEM', 'System log cleaned', {
      detail: `deleted=${count} entries older than 90 days`,
      userEmail: req.user.email,
    });
    res.json({ ok: true, deleted: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/syslog/export — disabled, export is now handled client-side (XLSX)
// router.get('/export', requireAuth('admin'), async (req, res) => { ... });

module.exports = router;
