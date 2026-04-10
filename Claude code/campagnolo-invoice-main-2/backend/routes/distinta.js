// ============================================================
// distinta.js — Payment schedule route
// ============================================================
const express  = require('express');
const supabase = require('../utils/supabase');
const { requireAuth } = require('./auth');
const emailService    = require('../services/emailService');
const erClient        = require('../services/erClient');
const pdfService      = require('../services/pdfService');
const { auditLog }    = require('../utils/logger');
const router = express.Router();

// GET /api/distinta — approved invoices awaiting payment, OR all invoices of a specific batch
router.get('/', requireAuth('admin','controller','supervisor'), async (req, res) => {
  try {
    const { batchId } = req.query;
    let query = supabase
      .from('invoices')
      .select('*, payment_records(id, payment_date, payment_amount)')
      .order('due_date', { ascending: true });

    if (batchId && String(batchId).trim()) {
      // Batch view: show ALL invoices of this batch regardless of current payment status.
      // Historical batches may contain invoices already marked as 'pagato' — we still want them visible.
      query = query.eq('distinta_batch_id', String(batchId).trim());
    } else {
      // Default view: approved invoices not yet paid
      query = query
        .eq('status', 'Approved')
        .or('payment_status.neq.pagato,payment_status.is.null');
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/distinta/batches — list of prepared/sent distinta batches with aggregated metadata
router.get('/batches', requireAuth('admin','controller','supervisor'), async (req, res) => {
  try {
    // Only count invoices that are *actually* sent — if an operator manually
    // reset DISTINTA INVIATA to No (distinta_sent_at = NULL), that invoice
    // must not resurrect the batch in the filter.
    const { data, error } = await supabase
      .from('invoices')
      .select('distinta_batch_id, distinta_sent_at, total')
      .not('distinta_batch_id', 'is', null)
      .not('distinta_sent_at', 'is', null);
    if (error) throw error;

    const map = new Map();
    for (const row of (data || [])) {
      const id = row.distinta_batch_id;
      if (!id || !row.distinta_sent_at) continue;
      const cur = map.get(id) || { batch_id: id, sent_at: row.distinta_sent_at, count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(row.total || 0);
      if (row.distinta_sent_at && (!cur.sent_at || row.distinta_sent_at > cur.sent_at)) {
        cur.sent_at = row.distinta_sent_at;
      }
      map.set(id, cur);
    }

    const batches = Array.from(map.values()).sort((a, b) => {
      // Newest first: compare by sent_at desc, fall back to batch_id desc
      const av = a.sent_at || '';
      const bv = b.sent_at || '';
      if (av === bv) return String(b.batch_id).localeCompare(String(a.batch_id));
      return bv.localeCompare(av);
    });

    res.json({ data: batches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/distinta/send-email — send summary and mark invoices as sent
router.post('/send-email', requireAuth('admin','supervisor'), async (req, res) => {
  try {
    const { invoiceIds, note } = req.body; // optional: array of specific IDs to send; optional note

    let q = supabase.from('invoices').select('*').order('due_date', { ascending: true });
    if (invoiceIds && invoiceIds.length > 0) {
      q = q.in('id', invoiceIds);
    } else {
      q = q.eq('status', 'Approved').is('distinta_sent_at', null)
           .or('payment_status.in.(da_pagare,inviato),payment_status.is.null');
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
    await emailService.sendPaymentSummary(invoices, req.user, note);

    // Mark all sent invoices with batch_id, sent_at and notifica
    const ids = invoices.map(i => i.id);
    const { error: updateErr } = await supabase
      .from('invoices')
      .update({ distinta_batch_id: batchId, distinta_sent_at: sentAt, notifica_sent_at: sentAt, payment_status: 'inviato' })
      .in('id', ids);

    if (updateErr) throw updateErr;

    // ── Audit trail: zapiši vpis batch_id + distinta_sent_at za vsako fatturo ──
    for (const inv of invoices) {
      const changes = [
        { field: 'distinta_batch_id', label: 'Batch distinta', oldVal: inv.distinta_batch_id, newVal: batchId },
        { field: 'distinta_sent_at',  label: 'Distinta inviata', oldVal: inv.distinta_sent_at,  newVal: sentAt  },
      ];
      if (inv.payment_status !== 'inviato') {
        changes.push({ field: 'payment_status', label: 'Stato pagamento', oldVal: inv.payment_status, newVal: 'inviato' });
      }
      for (const { field, label, oldVal, newVal } of changes) {
        const oldStr = oldVal != null ? String(oldVal) : '';
        const newStr = newVal != null ? String(newVal) : '';
        if (oldStr === newStr) continue;
        auditLog({
          invoiceId: inv.id,
          erId:      inv.er_id,
          invNumber: inv.inv_number,
          supplier:  inv.supplier,
          total:     inv.total,
          action:    `${label}: "${oldStr || '—'}" → "${newStr || '—'}"`,
          fieldName: field,
          oldValue:  oldVal,
          newValue:  newVal,
          userEmail: req.user.email,
          userName:  req.user.name,
        }).catch(e => console.error('[distinta] audit log failed', e.message));
      }
    }

    // ── Generate distinta PDF for each invoice (fire & forget) ──
    for (const inv of invoices) {
      pdfService.generateDistintaPDF(inv, batchId, sentAt)
        .catch(e => console.error('[distinta] PDF gen failed for', inv.er_id, e.message));
    }

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
