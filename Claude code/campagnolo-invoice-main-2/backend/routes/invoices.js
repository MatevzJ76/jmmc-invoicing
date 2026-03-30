const express  = require('express');
const supabase = require('../utils/supabase');
const { requireAuth } = require('./auth');
const { sysLog, auditLog } = require('../utils/logger');
const { importInvoices }   = require('../services/importService');
const { generateApprovalPDF, downloadOriginalPDF } = require('../services/pdfService');
const emailService = require('../services/emailService');

const router = express.Router();

// ── Audit helper — logs only fields that actually changed ─────
async function logChanges(invoiceId, inv, changes, userEmail, userName) {
  for (const { field, label, oldVal, newVal } of changes) {
    const oldStr = oldVal != null ? String(oldVal) : '';
    const newStr = newVal != null ? String(newVal) : '';
    if (oldStr === newStr) continue;
    await auditLog({
      invoiceId,
      erId:      inv.er_id,
      invNumber: inv.inv_number,
      supplier:  inv.supplier,
      total:     inv.total,
      action:    `${label}: "${oldStr || '—'}" → "${newStr || '—'}"`,
      fieldName: field,
      oldValue:  oldVal,
      newValue:  newVal,
      userEmail,
      userName,
    });
  }
}

// ── GET /api/invoices — list with filters + pagination ────────
router.get('/', requireAuth(), async (req, res) => {
  try {
    const {
      status, responsible, costType, search,
      page = 1, limit = 25,
      dateFrom, dateTo, verified, distintaSent, pagamento,
    } = req.query;

    // Join strategy based on pagamento filter:
    // pagato/parziale  → INNER JOIN (only invoices WITH payment records)
    // in_pagamento     → LEFT JOIN  (used with .is('payment_records.id', null) below)
    // everything else  → normal LEFT JOIN
    const prJoin = (pagamento === 'pagato' || pagamento === 'parziale')
      ? 'payment_records!inner(id, payment_date)'
      : 'payment_records!left(id, payment_date)';
    let query = supabase
      .from('invoices')
      .select(`*, ${prJoin}`, { count: 'exact' });

    if (req.user.role === 'federico') query = query.eq('responsible', 'FEDERICO');
    if (req.user.role === 'varga')    query = query.eq('responsible', 'VARGA');

    if (status)      query = query.eq('status', status);
    if (responsible && ['admin','auditor'].includes(req.user.role)) {
      if (responsible === 'NONE') query = query.is('responsible', null);
      else                        query = query.eq('responsible', responsible);
    }
    if (costType)    query = query.eq('cost_type', costType);
    if (verified !== undefined) query = query.eq('verified_flag', verified === 'true');
    if (dateFrom)    query = query.gte('due_date', dateFrom);
    if (dateTo)      query = query.lte('due_date', dateTo);
    if (search) {
      query = query.or(`supplier.ilike.%${search}%,inv_number.ilike.%${search}%`);
    }
    if (req.query.hasAttachment === 'yes') query = query.not('original_pdf_id', 'is', null);
    if (req.query.hasAttachment === 'no')  query = query.is('original_pdf_id', null);
    if (distintaSent === 'yes') query = query.not('distinta_sent_at', 'is', null);
    if (distintaSent === 'no')  query = query.is('distinta_sent_at', null);
    if (pagamento === 'inviato')   query = query.not('distinta_sent_at', 'is', null).filter('already_paid', 'eq', 0);
    if (pagamento === 'da_pagare') query = query.is('distinta_sent_at', null).filter('already_paid', 'eq', 0);
    if (pagamento === 'in_pagamento') {
      // Anti-join: already_paid > 0 AND no payment_records (LEFT JOIN + null check)
      query = query.gt('already_paid', 0).is('payment_records.id', null);
    }

    const ALLOWED_SORT_FIELDS = [
      'supplier', 'internal_number', 'inv_number', 'inv_date', 'due_date',
      'total', 'already_paid', 'responsible', 'status', 'verified_flag', 'id',
    ];
    const sortField = ALLOWED_SORT_FIELDS.includes(req.query.sortField)
      ? req.query.sortField : 'id';
    const sortAsc = req.query.sortDir === 'asc';

    const from = (Number(page) - 1) * Number(limit);
    const to   = from + Number(limit) - 1;
    query = query.range(from, to).order(sortField, { ascending: sortAsc });

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ data, count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    await sysLog('ERROR', 'SYSTEM', 'GET /invoices failed', { error: err, userEmail: req.user.email });
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/invoices/test-er — network/API test ──────────────
router.get('/test-er', async (req, res) => {
  try {
    const erClient = require('../services/erClient');
    const result = await erClient.callER('ReceivedInvoiceList', {
      dateFrom: '2026-01-01',
      dateTo:   new Date().toISOString().split('T')[0],
    });
    res.json({ status: 'ok', count: Array.isArray(result) ? result.length : 1 });
  } catch (err) {
    res.json({ status: 'error', message: err.message });
  }
});

// ── POST /api/invoices/import ─────────────────────────────────
router.post('/import', requireAuth('admin'), async (req, res) => {
  try {
    const { dateFrom, dateTo, batchSize = 20, offset = 0 } = req.body;
    const result = await importInvoices(
      dateFrom || process.env.IMPORT_DATE_FROM,
      dateTo   || new Date().toISOString().split('T')[0],
      { batchSize: Number(batchSize), offset: Number(offset) }
    );
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/invoices/:id/hint — predlog kategorije ───────────
// Vrne najpogostejšo kategorijo za tega dobavitelja (po imenu)
router.get('/:id/hint', requireAuth('admin'), async (req, res) => {
  try {
    const { data: inv } = await supabase
      .from('invoices')
      .select('supplier, category_id')
      .eq('id', req.params.id)
      .single();

    // Če faktura že ima kategorijo ali nima dobavitelja — ni predloga
    if (!inv?.supplier || inv.category_id)
      return res.json({ hint: null });

    const { data: hint } = await supabase
      .from('supplier_category_hints')
      .select('*, categories(id, name)')
      .eq('supplier', inv.supplier)
      .order('usage_count', { ascending: false })
      .limit(1)
      .maybeSingle();

    res.json({ hint: hint || null });
  } catch (err) {
    res.json({ hint: null });
  }
});

// ── GET /api/invoices/:id ─────────────────────────────────────
router.get('/:id', requireAuth(), async (req, res) => {
  try {
    const { data: inv, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !inv) return res.status(404).json({ error: 'Invoice not found' });

    if (req.user.role === 'federico' && inv.responsible !== 'FEDERICO')
      return res.status(403).json({ error: 'Access denied' });
    if (req.user.role === 'varga' && inv.responsible !== 'VARGA')
      return res.status(403).json({ error: 'Access denied' });

    const { data: items } = await supabase
      .from('invoice_items').select('*').eq('invoice_id', inv.id).order('position');

    const { data: audit } = await supabase
      .from('audit_log').select('*').eq('invoice_id', inv.id)
      .order('created_at', { ascending: false });

    res.json({ invoice: inv, items: items || [], audit: audit || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/invoices/:id/category — set category/status ──────
router.put('/:id/category', requireAuth('admin'), async (req, res) => {
  try {
    const { categoryId, status, responsible, statusComment } = req.body;

    const { data: inv } = await supabase
      .from('invoices').select('*').eq('id', req.params.id).single();
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });

    let costType = null, catName = null, catResponsible = null;
    if (categoryId) {
      const { data: cat } = await supabase
        .from('categories').select('name, cost_type, responsible').eq('id', categoryId).single();
      if (cat) { costType = cat.cost_type; catName = cat.name; catResponsible = cat.responsible; }
    }

    let oldCatName = null;
    if (inv.category_id) {
      const { data: oldCat } = await supabase
        .from('categories').select('name').eq('id', inv.category_id).single();
      if (oldCat) oldCatName = oldCat.name;
    }

    const newResponsible = (responsible !== undefined && responsible !== null && responsible !== '')
      ? responsible
      : (catResponsible || null);

    const updates = { updated_at: new Date().toISOString() };
    if (categoryId)     updates.category_id  = categoryId;
    if (costType)       updates.cost_type     = costType;
    if (newResponsible) updates.responsible   = newResponsible;
    if (status)         updates.status        = status;
    updates.status_comment = (status === 'Rejected' && statusComment) ? statusComment : null;

    const { error } = await supabase.from('invoices').update(updates).eq('id', req.params.id);
    if (error) throw error;

    // ── Shrani hint po imenu dobavitelja ──────────────────────
    if (categoryId && inv.supplier) {
      try {
        await supabase.rpc('upsert_supplier_hint', {
          p_supplier:    inv.supplier,
          p_category_id: categoryId,
          p_cost_type:   costType       || null,
          p_responsible: newResponsible || null,
        });
      } catch (hintErr) {
        console.warn('[hint] upsert_supplier_hint failed:', hintErr.message);
      }
    }

    // ── Audit log ─────────────────────────────────────────────
    await logChanges(req.params.id, inv, [
      { field: 'category_id',    label: 'Categoria',            oldVal: oldCatName,         newVal: catName },
      { field: 'cost_type',      label: 'Tipo costo',            oldVal: inv.cost_type,      newVal: costType },
      { field: 'responsible',    label: 'Delegato al controllo', oldVal: inv.responsible,    newVal: newResponsible },
      { field: 'status',         label: 'Stato',                 oldVal: inv.status,         newVal: status },
      { field: 'status_comment', label: 'Motivo rifiuto',        oldVal: inv.status_comment, newVal: status === 'Rejected' ? statusComment : null },
    ], req.user.email, req.user.name);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/invoices/:id/verify ──────────────────────────────
router.put('/:id/verify', requireAuth('federico', 'varga'), async (req, res) => {
  const { comment } = req.body;

  try {
    const { data: inv, error: fetchErr } = await supabase
      .from('invoices').select('*').eq('id', req.params.id).single();

    if (fetchErr || !inv) return res.status(404).json({ error: 'Invoice not found' });

    const userResponsible = req.user.role.toUpperCase();
    if (inv.responsible !== userResponsible)
      return res.status(403).json({ error: 'This invoice is not assigned to you' });

    if (inv.verified_flag)
      return res.status(409).json({ error: 'Invoice already verified. This action is irreversible.' });

    const verifiedAt = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from('invoices')
      .update({
        verified_flag:    true,
        verified_by:      req.user.email,
        verified_by_name: req.user.name,
        verified_at:      verifiedAt,
        verified_comment: comment || null,
        status:           'Approved',
        updated_at:       verifiedAt,
      })
      .eq('id', req.params.id);

    if (updateErr) throw updateErr;

    await auditLog({
      invoiceId:  inv.id,
      erId:       inv.er_id,
      invNumber:  inv.inv_number,
      supplier:   inv.supplier,
      total:      inv.total,
      action:     'Controllato e pagabile impostato',
      fieldName:  'verified_flag',
      oldValue:   false,
      newValue:   true,
      userEmail:  req.user.email,
      userName:   req.user.name,
    });

    if (comment) {
      await auditLog({
        invoiceId:  inv.id,
        erId:       inv.er_id,
        invNumber:  inv.inv_number,
        supplier:   inv.supplier,
        total:      inv.total,
        action:     `Annotazione delegato: "${comment}"`,
        fieldName:  'verified_comment',
        oldValue:   null,
        newValue:   comment,
        userEmail:  req.user.email,
        userName:   req.user.name,
      });
    }

    const { data: updatedInv } = await supabase
      .from('invoices').select('*').eq('id', req.params.id).single();
    const { data: items } = await supabase
      .from('invoice_items').select('*').eq('invoice_id', req.params.id);
    const { data: audit } = await supabase
      .from('audit_log').select('*').eq('invoice_id', req.params.id)
      .order('created_at', { ascending: true });

    generateApprovalPDF(updatedInv, items || [], audit || [], req.user)
      .then(() => emailService.sendApprovalNotification(updatedInv, req.user))
      .catch(err => console.error('[VERIFY] PDF/email error:', err.message));

    res.json({ ok: true, invoice: updatedInv });

  } catch (err) {
    await sysLog('ERROR', 'SYSTEM', 'PUT /verify failed', {
      error: err, userEmail: req.user.email, invoiceId: req.params.id,
    });
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/invoices/:id/payment ─────────────────────────────
router.put('/:id/payment', requireAuth('admin', 'federico'), async (req, res) => {
  try {
    const { paymentOrder, paymentDate, paymentSource } = req.body;

    if (req.user.role === 'federico' && paymentOrder !== 'Payment Ordered')
      return res.status(403).json({ error: 'Federico can only set Payment Ordered status' });

    const { data: inv } = await supabase
      .from('invoices').select('*').eq('id', req.params.id).single();
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });

    const updates = { updated_at: new Date().toISOString() };
    if (paymentOrder  !== undefined) updates.payment_order  = paymentOrder;
    if (paymentDate   !== undefined) updates.payment_date   = paymentDate;
    if (paymentSource !== undefined) updates.payment_source = paymentSource;

    const { error } = await supabase.from('invoices').update(updates).eq('id', req.params.id);
    if (error) throw error;

    await logChanges(req.params.id, inv, [
      { field: 'payment_order',  label: 'Ordine pagamento',   oldVal: inv.payment_order,  newVal: paymentOrder },
      { field: 'payment_date',   label: 'Data pagamento',     oldVal: inv.payment_date,   newVal: paymentDate },
      { field: 'payment_source', label: 'Fonte di pagamento', oldVal: inv.payment_source, newVal: paymentSource },
    ], req.user.email, req.user.name);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/invoices/:id/pdf/:type ───────────────────────────
router.get('/:id/pdf/:type', requireAuth(), async (req, res) => {
  try {
    const type = req.params.type;

    const { data: att, error } = await supabase
      .from('invoice_attachments')
      .select('file_name, file_type, contents_b64, file_size_kb')
      .eq('invoice_id', req.params.id)
      .eq('attachment_type', type)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!error && att?.contents_b64) {
      return res.json({
        fileName:    att.file_name,
        fileType:    att.file_type,
        contentsB64: att.contents_b64,
        sizeKb:      att.file_size_kb,
      });
    }

    if (type === 'original') {
      const { data: inv } = await supabase
        .from('invoices').select('er_id').eq('id', req.params.id).single();

      if (!inv) return res.status(404).json({ error: 'Invoice not found' });

      const result = await downloadOriginalPDF(req.params.id, inv.er_id);

      if (result.noAttachment || !result.attachmentId)
        return res.status(404).json({ error: 'No PDF attachment available in e-računi' });

      const { data: att2 } = await supabase
        .from('invoice_attachments')
        .select('file_name, file_type, contents_b64, file_size_kb')
        .eq('id', result.attachmentId)
        .single();

      if (att2) return res.json({
        fileName:    att2.file_name,
        fileType:    att2.file_type,
        contentsB64: att2.contents_b64,
        sizeKb:      att2.file_size_kb,
      });
    }

    return res.status(404).json({ error: 'PDF not found' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/invoices/download-pdfs — batch PDF download ────
router.post('/download-pdfs', requireAuth('admin'), async (req, res) => {
  try {
    const { batchSize = 10, offset = 0 } = req.body;

    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, er_id, inv_number', { count: 'exact' })
      .is('original_pdf_id', null)
      .range(offset, offset + batchSize - 1)
      .order('imported_at', { ascending: true });

    if (!invoices || invoices.length === 0) {
      return res.json({ ok: true, processed: 0, remaining: 0, message: 'Tutti i PDF sono già stati scaricati' });
    }

    let downloaded = 0, skipped = 0, errors = 0;

    for (const inv of invoices) {
      try {
        const result = await downloadOriginalPDF(inv.id, inv.er_id);
        if (result.noAttachment) skipped++;
        else if (result.attachmentId) downloaded++;
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        errors++;
        console.error('[download-pdfs] Error for', inv.er_id, err.message);
      }
    }

    const { count: remaining } = await supabase
      .from('invoices')
      .select('id', { count: 'exact' })
      .is('original_pdf_id', null);

    await sysLog('INFO', 'PDF', `Batch PDF download: offset=${offset}`, {
      detail: `downloaded=${downloaded} skipped=${skipped} errors=${errors} remaining=${remaining}`,
    });

    res.json({ ok: true, processed: invoices.length, downloaded, skipped, errors, remaining: remaining || 0 });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
