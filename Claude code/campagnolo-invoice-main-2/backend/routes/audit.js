const express  = require('express');
const supabase = require('../utils/supabase');
const { requireAuth } = require('./auth');

const router = express.Router();

// GET /api/audit — full audit log (admin + auditor only)
router.get('/', requireAuth('admin','supervisor'), async (req, res) => {
  try {
    const { search, userEmail, page = 1, limit = 50 } = req.query;

    let query = supabase
      .from('audit_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (userEmail) query = query.eq('user_email', userEmail);
    if (search) {
      query = query.or(
        `supplier.ilike.%${search}%,inv_number.ilike.%${search}%,user_name.ilike.%${search}%`
      );
    }

    const from = (Number(page) - 1) * Number(limit);
    query = query.range(from, from + Number(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/audit/:invoiceId — audit entries for one invoice
router.get('/:invoiceId', requireAuth('admin','supervisor'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .eq('invoice_id', req.params.invoiceId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
