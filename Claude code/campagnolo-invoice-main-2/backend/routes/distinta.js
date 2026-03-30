// ============================================================
// distinta.js — Payment schedule route
// ============================================================
const express  = require('express');
const supabase = require('../utils/supabase');
const { requireAuth } = require('./auth');
const emailService    = require('../services/emailService');
const erClient        = require('../services/erClient');
const router = express.Router();

// GET /api/distinta — approved invoices awaiting payment
router.get('/', requireAuth('admin','federico','auditor'), async (req, res) => {
  try {
    let query = supabase
      .from('invoices')
      .select('*')
      .eq('status', 'Approved')
      .neq('payment_order', 'Paid')
      .order('due_date', { ascending: true });
    const { data, error } = await query;
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/distinta/send-email — send summary and mark invoices as sent
router.post('/send-email', requireAuth('admin'), async (req, res) => {
  try {
    const { invoiceIds } = req.body; // optional: array of specific IDs to send

    let q = supabase.from('invoices').select('*').order('due_date', { ascending: true });
    if (invoiceIds && invoiceIds.length > 0) {
      q = q.in('id', invoiceIds);
    } else {
      q = q.eq('status', 'Approved').eq('payment_order', 'To Be Paid').is('distinta_sent_at', null);
    }
    const { data: invoices } = await q;

    if (!invoices || invoices.length === 0) {
      return res.json({ ok: true, count: 0 });
    }

    // Generate batch ID: YYYY-MM-DD-HHmm
    const now     = new Date();
    const batchId = now.toISOString().slice(0, 16).replace('T', '-').replace(':', '');
    const sentAt  = now.toISOString();

    // Send email
    await emailService.sendPaymentSummary(invoices, req.user);

    // Mark all sent invoices with batch_id and sent_at
    const ids = invoices.map(i => i.id);
    const { error: updateErr } = await supabase
      .from('invoices')
      .update({ distinta_batch_id: batchId, distinta_sent_at: sentAt })
      .in('id', ids);

    if (updateErr) throw updateErr;

    // ── Write-back remarks to e-računi (fire & forget — doesn't block send) ──
    let erUpdated = 0;
    for (const inv of invoices) {
      if (!inv.er_id) continue;
      try {
        await erClient.updateInvoiceRemarks(inv, `Distinta di pagamento: ${batchId}`);
        erUpdated++;
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        console.warn('[distinta] e-računi remarks update failed for', inv.er_id, e.message);
      }
    }

    res.json({ ok: true, count: invoices.length, batchId, erUpdated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
