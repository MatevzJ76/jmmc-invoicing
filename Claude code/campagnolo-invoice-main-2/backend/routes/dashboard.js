const express  = require('express');
const supabase = require('../utils/supabase');
const { requireAuth } = require('./auth');

const router = express.Router();

router.get('/stats', requireAuth(), async (req, res) => {
  try {
    // Build base filter depending on role
    const roleFilter = {};
    if (req.user.role === 'federico') roleFilter.responsible = 'FEDERICO';
    if (req.user.role === 'varga')    roleFilter.responsible = 'VARGA';

    let query = supabase.from('invoices').select('*');
    if (roleFilter.responsible) query = query.eq('responsible', roleFilter.responsible);
    const { data: invoices } = await query;
    const all = invoices || [];

    // KPIs
    const total    = all.length;
    const pending  = all.filter(i => !i.verified_flag && i.status === 'Pending').length;
    const approved = all.filter(i => i.verified_flag).length;
    const toBePaid = all.filter(i => i.verified_flag && i.payment_order === 'To Be Paid').length;

    const totalAmount  = all.reduce((s, i) => s + (i.total || 0), 0);
    const pendingAmount = all.filter(i => i.payment_order === 'To Be Paid')
                             .reduce((s, i) => s + (i.left_to_pay || 0), 0);

    // Due in 7 days
    const today  = new Date();
    const in7    = new Date(today.getTime() + 7 * 86400000);
    const dueSoon = all.filter(i => {
      if (!i.due_date) return false;
      const d = new Date(i.due_date);
      return d >= today && d <= in7 && i.payment_order !== 'Paid';
    }).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

    // By status (donut chart)
    const byStatus = {
      Pending:  all.filter(i => i.status === 'Pending').length,
      Approved: all.filter(i => i.status === 'Approved').length,
      Rejected: all.filter(i => i.status === 'Rejected').length,
    };

    // By cost_type (bar chart — amounts)
    const byCostType = {};
    all.forEach(i => {
      const k = i.cost_type || 'Non classificato';
      byCostType[k] = (byCostType[k] || 0) + (i.total || 0);
    });

    // Monthly trend (last 6 months)
    const monthly = {};
    for (let m = 5; m >= 0; m--) {
      const d  = new Date(today.getFullYear(), today.getMonth() - m, 1);
      const k  = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
      monthly[k] = { count: 0, amount: 0 };
    }
    all.forEach(i => {
      if (!i.inv_date) return;
      const k = i.inv_date.slice(0, 7);
      if (monthly[k]) {
        monthly[k].count++;
        monthly[k].amount += (i.total || 0);
      }
    });

    res.json({
      kpis: { total, pending, approved, toBePaid, totalAmount, pendingAmount },
      dueSoon: dueSoon.slice(0, 10),
      byStatus,
      byCostType,
      monthly,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
