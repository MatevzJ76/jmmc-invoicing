const express  = require('express');
const supabase = require('../utils/supabase');
const { requireAuth } = require('./auth');
const { sysLog, auditLog } = require('../utils/logger');
const { importInvoices }   = require('../services/importService');
const { generateApprovalPDF, downloadOriginalPDF, generateDistintaPDF } = require('../services/pdfService');
const emailService = require('../services/emailService');
const syncState    = require('../utils/syncState');
const { responsibleColumns, resolveResponsible } = require('../utils/responsibleResolve');

const router = express.Router();

// UUID detector — used to discriminate between alias-string and FK-uuid in
// query params during the FAZA B dual-read window.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Recognise the Supabase/PostgREST "column does not exist" error so we can
// safely fall back to a payload that omits responsible_user_id when the SQL
// migration has not yet been applied.
function isMissingResponsibleUserIdError(err) {
  if (!err) return false;
  const msg = String(err.message || '');
  return msg.includes('responsible_user_id') ||
         (msg.toLowerCase().includes('column') && msg.toLowerCase().includes('does not exist'));
}

// Helper: try update with full payload, fall back without responsible_user_id.
async function updateInvoiceDualWrite(invoiceId, updates) {
  let { data, error } = await supabase
    .from('invoices').update(updates).eq('id', invoiceId).select().maybeSingle();
  if (error && isMissingResponsibleUserIdError(error)) {
    const fallback = { ...updates };
    delete fallback.responsible_user_id;
    ({ data, error } = await supabase
      .from('invoices').update(fallback).eq('id', invoiceId).select().maybeSingle());
  }
  return { data, error };
}

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
      dateFrom, dateTo, verified, distintaSent, pagamento, notifica,
    } = req.query;

    // Join strategy based on pagamento filter:
    // pagato/parziale  → INNER JOIN (only invoices WITH payment records)
    // in_pagamento     → LEFT JOIN  (used with .is('payment_records.id', null) below)
    // everything else  → normal LEFT JOIN
    const prJoin = (pagamento === 'pagato' || pagamento === 'parziale')
      ? 'payment_records!inner(id, payment_date)'
      : 'payment_records!left(id, payment_date)';

    // FAZA B dual-read: prefer responsible_user_id filter with alias fallback.
    // We build the full query inside a function so the same definition can be
    // re-run with legacy alias filtering if PostgREST reports the FK column
    // does not yet exist on the invoices table.
    const applyResponsibleFilters = (q, useFk) => {
      if (req.user.role === 'revisore') {
        if (useFk && req.user.id) q = q.eq('responsible_user_id', req.user.id);
        else                      q = q.eq('responsible', req.user.responsible);
      }
      if (responsible && ['admin','supervisor','controller','delegato'].includes(req.user.role)) {
        if (responsible === 'NONE') {
          q = useFk ? q.is('responsible_user_id', null) : q.is('responsible', null);
        } else if (useFk && UUID_RE.test(responsible)) {
          q = q.eq('responsible_user_id', responsible);
        } else {
          q = q.eq('responsible', responsible);
        }
      }
      return q;
    };

    const ALLOWED_SORT_FIELDS = [
      'supplier', 'internal_number', 'inv_number', 'inv_date', 'due_date',
      'total', 'already_paid', 'left_to_pay', 'responsible', 'status', 'status_changed_at', 'id',
      'payment_status', 'notifica_sent_at',
    ];
    const sortField = ALLOWED_SORT_FIELDS.includes(req.query.sortField)
      ? req.query.sortField : 'id';
    const sortAsc = req.query.sortDir === 'asc';

    const from = (Number(page) - 1) * Number(limit);
    const to   = from + Number(limit) - 1;
    const orderOpts = sortField === 'payment_status'
      ? { ascending: sortAsc, nullsFirst: sortAsc }
      : { ascending: sortAsc };

    const buildListQuery = (useFk) => {
      let q = supabase
        .from('invoices')
        .select(`*, ${prJoin}`, { count: 'exact' });
      q = applyResponsibleFilters(q, useFk);
      if (status)      q = q.eq('status', status);
      if (costType) {
        if (costType === 'NONE') q = q.is('cost_type', null);
        else                     q = q.eq('cost_type', costType);
      }
      if (dateFrom)    q = q.gte('due_date', dateFrom);
      if (dateTo)      q = q.lte('due_date', dateTo);
      if (search) {
        q = q.or(`supplier.ilike.%${search}%,inv_number.ilike.%${search}%,internal_number.ilike.%${search}%`);
      }
      if (req.query.hasAttachment === 'yes') q = q.not('original_pdf_id', 'is', null);
      if (req.query.hasAttachment === 'no')  q = q.is('original_pdf_id', null);
      if (distintaSent === 'yes') q = q.not('distinta_sent_at', 'is', null);
      if (distintaSent === 'no')  q = q.is('distinta_sent_at', null);
      if (notifica === 'si')      q = q.not('notifica_sent_at', 'is', null);
      if (notifica === 'no')      q = q.is('notifica_sent_at', null);
      if (pagamento === 'inviato')      q = q.not('distinta_sent_at', 'is', null).filter('already_paid', 'eq', 0);
      if (pagamento === 'da_pagare')    q = q.is('distinta_sent_at', null).filter('already_paid', 'eq', 0);
      if (pagamento === 'in_pagamento') q = q.eq('payment_status', 'in_pagamento');
      if (req.query.risolto === 'no')   q = q.is('rejection_resolved_at', null);
      if (req.query.risolto === 'yes')  q = q.not('rejection_resolved_at', 'is', null);
      q = q.range(from, to).order(sortField, orderOpts);
      return q;
    };

    let { data, error, count } = await buildListQuery(true);
    if (error && isMissingResponsibleUserIdError(error)) {
      ({ data, error, count } = await buildListQuery(false));
    }
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

// ── Auto-assign categories from supplier_category_hints ───────
async function autoAssignCategories() {
  // Get all invoices without category assigned
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id, supplier, er_id, inv_number, category_id, cost_type, responsible')
    .is('category_id', null)
    .not('supplier', 'is', null);
  if (error || !invoices?.length) return 0;

  // Get all hints — try with responsible_user_id; fall back if column missing
  let { data: hints, error: hintsErr } = await supabase
    .from('supplier_category_hints')
    .select('supplier, category_id, cost_type, responsible, responsible_user_id')
    .order('usage_count', { ascending: false });
  if (hintsErr && isMissingResponsibleUserIdError(hintsErr)) {
    ({ data: hints } = await supabase
      .from('supplier_category_hints')
      .select('supplier, category_id, cost_type, responsible')
      .order('usage_count', { ascending: false }));
  }
  if (!hints?.length) return 0;

  // Build lookup: supplier → best hint
  const hintMap = {};
  for (const h of hints) {
    if (!hintMap[h.supplier]) hintMap[h.supplier] = h;
  }

  let updated = 0;
  for (const inv of invoices) {
    const hint = hintMap[inv.supplier];
    if (!hint?.category_id) continue;

    // Resolve responsible to BOTH alias and user_id (FAZA B dual-write).
    // Prefer hint.responsible_user_id when the column already exists.
    const respCols = hint.responsible_user_id
      ? { responsible: hint.responsible || null, responsible_user_id: hint.responsible_user_id }
      : await responsibleColumns(hint.responsible);

    const baseUpdate = {
      category_id: hint.category_id,
      cost_type:   hint.cost_type || null,
      responsible: respCols.responsible,
      responsible_user_id: respCols.responsible_user_id,
      updated_at:  new Date().toISOString(),
    };
    let { error: upErr } = await supabase
      .from('invoices').update(baseUpdate).eq('id', inv.id);
    if (upErr && isMissingResponsibleUserIdError(upErr)) {
      const fallback = { ...baseUpdate };
      delete fallback.responsible_user_id;
      ({ error: upErr } = await supabase
        .from('invoices').update(fallback).eq('id', inv.id));
    }

    if (!upErr) {
      await auditLog({
        invoiceId: inv.id,
        erId:      inv.er_id,
        invNumber: inv.inv_number,
        supplier:  inv.supplier,
        action:    `Auto-assegnazione: Categoria "${hint.cost_type || hint.category_id}", Delegato "${hint.responsible || '—'}"`,
        fieldName: 'category_id',
        oldValue:  null,
        newValue:  hint.category_id,
        userEmail: 'system',
        userName:  'Automazione',
      });
      updated++;
    }
  }
  return updated;
}

// ── POST /api/invoices/auto-assign-categories ─────────────────
router.post('/auto-assign-categories', requireAuth('admin', 'supervisor'), async (req, res) => {
  try {
    const updated = await autoAssignCategories();
    await sysLog('INFO', 'SYSTEM', 'Auto-assign categories eseguito manualmente', {
      detail: `Aggiornate ${updated} fatture`,
    });
    res.json({ ok: true, updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/invoices/last-import ─────────────────────────────
// Reads the last successful import timestamp from system_log
router.get('/last-import', requireAuth(), async (req, res) => {
  try {
    // First try: system_log (most reliable — logged on every completed import)
    const { data: logRow, error: logErr } = await supabase
      .from('system_log')
      .select('created_at')
      .eq('category', 'IMPORT')
      .eq('action', 'Batch import complete')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!logErr && logRow?.created_at) {
      return res.json({ last_import_at: logRow.created_at });
    }

    // Fallback: MAX(imported_at) from invoices table
    const { data: invRow, error: invErr } = await supabase
      .from('invoices')
      .select('imported_at')
      .not('imported_at', 'is', null)
      .order('imported_at', { ascending: false })
      .limit(1)
      .single();

    if (!invErr && invRow?.imported_at) {
      return res.json({ last_import_at: invRow.imported_at });
    }

    res.json({ last_import_at: null });
  } catch (err) {
    res.json({ last_import_at: null });
  }
});

// ── POST /api/invoices/import ─────────────────────────────────
router.post('/import', requireAuth('admin', 'supervisor'), async (req, res) => {
  try {
    const { dateFrom, dateTo, batchSize = 20, offset = 0, anno } = req.body;

    // Read import filters from Supabase settings if not provided in body
    let settingDateFrom = null, settingAnno = null;
    try {
      const { data: rows } = await supabase.from('settings').select('key, value');
      const cfg = {};
      (rows || []).forEach(r => { cfg[r.key] = r.value; });
      settingDateFrom = cfg.import_date_from || process.env.IMPORT_DATE_FROM || null;
      settingAnno     = cfg.import_anno      || null;
    } catch {}

    const resolvedDateFrom = dateFrom || settingDateFrom;
    const resolvedAnno     = anno     || settingAnno;

    const result = await importInvoices(
      resolvedDateFrom,
      dateTo || new Date().toISOString().split('T')[0],
      {
        batchSize:      Number(batchSize),
        offset:         Number(offset),
        importDateFrom: resolvedDateFrom || null,
        importAnno:     resolvedAnno     || null,
      }
    );

    // ── Auto-assign categories after import if enabled ─────────
    let autoAssigned = 0;
    try {
      const { data: cfgRows } = await supabase.from('settings').select('key, value');
      const cfg = {};
      (cfgRows || []).forEach(r => { cfg[r.key] = r.value; });
      if (cfg.auto_assign_category === 'true') {
        autoAssigned = await autoAssignCategories();
      }
    } catch (e) {
      console.warn('[auto-assign] failed after import:', e.message);
    }

    res.json({ ok: true, ...result, autoAssigned });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/invoices/notify-delegates ───────────────────────
// Sends ONE batch notification email with all pending + rejected-unresolved invoices.
// Marks all included invoices with notifica_sent_at.
router.post('/notify-delegates', requireAuth(), async (req, res) => {
  try {
    const { note } = req.body;

    // 1. Fetch pending invoices (awaiting delegate approval)
    let pending, error;
    ({ data: pending, error } = await supabase
      .from('invoices')
      .select('id, supplier, inv_number, internal_number, due_date, total, responsible, responsible_user_id, status, status_note')
      .eq('status', 'Pending')
      .not('responsible', 'is', null)
      .is('notifica_sent_at', null)
      .order('due_date', { ascending: true }));
    if (error && isMissingResponsibleUserIdError(error)) {
      ({ data: pending, error } = await supabase
        .from('invoices')
        .select('id, supplier, inv_number, internal_number, due_date, total, responsible, status, status_note')
        .eq('status', 'Pending')
        .not('responsible', 'is', null)
        .is('notifica_sent_at', null)
        .order('due_date', { ascending: true }));
    }
    if (error) throw error;
    pending = pending || [];

    // 2. Fetch rejected-unresolved invoices (need JMMC action)
    const { data: rejectedRaw, error: e2 } = await supabase
      .from('invoices')
      .select('id, supplier, inv_number, internal_number, due_date, total, responsible, status, status_note')
      .eq('status', 'Rejected')
      .is('rejection_resolved_at', null)
      .is('notifica_sent_at', null)
      .order('due_date', { ascending: true });
    if (e2) throw e2;
    const rejected = rejectedRaw || [];

    const totalCount = pending.length + rejected.length;
    if (totalCount === 0)
      return res.json({ ok: true, count: 0, results: [], message: 'Nessuna fattura da notificare' });

    // 3. Collect ALL recipient emails (notifica flag) for the single batch email
    const { data: settingsRows } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['email_recipients', 'email_admin']);

    const allEmails = new Set();
    const recipientsRow = (settingsRows || []).find(r => r.key === 'email_recipients');
    if (recipientsRow) {
      try {
        const list = JSON.parse(recipientsRow.value || '[]');
        for (const entry of list) {
          if (entry.email && entry.notifica !== false) {
            entry.email.split(',').forEach(e => { if (e.trim()) allEmails.add(e.trim()); });
          }
        }
      } catch {}
    }
    // Fallback: admin email
    if (allEmails.size === 0) {
      const adminRow = (settingsRows || []).find(r => r.key === 'email_admin');
      if (adminRow?.value) adminRow.value.split(',').forEach(e => { if (e.trim()) allEmails.add(e.trim()); });
    }
    const toEmails = [...allEmails];
    if (toEmails.length === 0)
      return res.status(400).json({ error: 'Nessun destinatario e-mail configurato' });

    // 4. Send ONE batch email with pending (navy) + rejected (red) sections
    const result = await emailService.sendDelegateNotification({
      pending,
      rejected,
      toEmails,
      sender: req.user,
      note,
    });

    // 5. Mark ALL included invoices as notified
    const sentAt = new Date().toISOString();
    const allIds = [...pending.map(i => i.id), ...rejected.map(i => i.id)];
    if (allIds.length > 0) {
      await supabase.from('invoices').update({ notifica_sent_at: sentAt }).in('id', allIds);
    }
    // Also mark rejected invoices as JMMC-notified for backward compat
    if (rejected.length > 0) {
      await supabase.from('invoices')
        .update({ jmmc_notified_rejected_at: sentAt })
        .in('id', rejected.map(i => i.id));
    }

    await sysLog('INFO', req.user.email, 'Batch notification sent', {
      detail: `pending=${pending.length} rejected=${rejected.length} to=${toEmails.join(',')}`,
    });

    res.json({
      ok: true,
      count: totalCount,
      pendingCount: pending.length,
      rejectedCount: rejected.length,
      results: [result],
    });
  } catch (err) {
    await sysLog('ERROR', 'SYSTEM', 'notify-delegates failed', { error: err });
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/invoices/summary ──────────────────────────────────
router.get('/summary', requireAuth(), async (req, res) => {
  try {
    const { status, responsible, costType, search, dateFrom, dateTo,
            hasAttachment, distintaSent, pagamento, notifica } = req.query;

    const prJoin = (pagamento === 'pagato' || pagamento === 'parziale')
      ? 'payment_records!inner(id)'
      : 'payment_records!left(id)';

    const buildSummaryQuery = (useFk) => {
      const cols = useFk
        ? `total, left_to_pay, status, responsible, responsible_user_id, already_paid, distinta_sent_at, ${prJoin}`
        : `total, left_to_pay, status, responsible, already_paid, distinta_sent_at, ${prJoin}`;
      let query = supabase
        .from('invoices')
        .select(cols);

      // Role-based restriction (FAZA B dual-read)
      if (req.user.role === 'revisore') {
        if (useFk && req.user.id) query = query.eq('responsible_user_id', req.user.id);
        else                      query = query.eq('responsible', req.user.responsible);
      }

      if (status)    query = query.eq('status', status);
      if (responsible && ['admin','supervisor','controller','delegato'].includes(req.user.role)) {
        if (responsible === 'NONE') {
          query = useFk ? query.is('responsible_user_id', null) : query.is('responsible', null);
        } else if (useFk && UUID_RE.test(responsible)) {
          query = query.eq('responsible_user_id', responsible);
        } else {
          query = query.eq('responsible', responsible);
        }
      }
      if (costType)  query = query.eq('cost_type', costType);
      if (dateFrom)  query = query.gte('due_date', dateFrom);
      if (dateTo)    query = query.lte('due_date', dateTo);
      if (search)    query = query.or(`supplier.ilike.%${search}%,inv_number.ilike.%${search}%,internal_number.ilike.%${search}%`);
      if (hasAttachment === 'yes') query = query.not('original_pdf_id', 'is', null);
      if (hasAttachment === 'no')  query = query.is('original_pdf_id', null);
      if (distintaSent === 'yes')  query = query.not('distinta_sent_at', 'is', null);
      if (distintaSent === 'no')   query = query.is('distinta_sent_at', null);
      if (notifica === 'si')       query = query.not('notifica_sent_at', 'is', null);
      if (notifica === 'no')       query = query.is('notifica_sent_at', null);
      if (pagamento === 'inviato')      query = query.not('distinta_sent_at', 'is', null).filter('already_paid', 'eq', 0);
      if (pagamento === 'da_pagare')    query = query.is('distinta_sent_at', null).filter('already_paid', 'eq', 0);
      if (pagamento === 'in_pagamento') query = query.eq('payment_status', 'in_pagamento');
      if (req.query.risolto === 'no')   query = query.is('rejection_resolved_at', null);
      if (req.query.risolto === 'yes')  query = query.not('rejection_resolved_at', 'is', null);
      return query;
    };

    let { data, error } = await buildSummaryQuery(true);
    if (error && isMissingResponsibleUserIdError(error)) {
      ({ data, error } = await buildSummaryQuery(false));
    }
    if (error) throw error;

    const rows = data || [];
    const sum  = (arr, field) => arr.reduce((s, r) => s + (Number(r[field]) || 0), 0);

    // FAZA C #5: prefer FK-based grouping. Resolve "Federico"/"Varga" to user IDs
    // once via the helper (cached). Fall back to alias string match when the FK
    // could not be resolved or rows lack responsible_user_id (legacy data).
    // Revisore non vede gli aggregati per altri delegati: skip resolve.
    const isRevisore = req.user.role === 'revisore';
    const [fed, var_] = isRevisore
      ? [{ alias: null, userId: null }, { alias: null, userId: null }]
      : await Promise.all([
          resolveResponsible('Federico'),
          resolveResponsible('Varga'),
        ]);
    const matchByUser = (r, u) => {
      if (u.userId && r.responsible_user_id) return r.responsible_user_id === u.userId;
      const alias = (u.alias || '').toUpperCase();
      return String(r.responsible || '').toUpperCase() === alias;
    };

    const payload = {
      totale:            sum(rows, 'total'),
      da_pagare:         sum(rows, 'left_to_pay'),
      totale_in_attesa:  sum(rows.filter(r => r.status === 'Pending'),  'total'),
      totale_approvato:  sum(rows.filter(r => r.status === 'Approved'), 'total'),
      totale_rifiutato:  sum(rows.filter(r => r.status === 'Rejected'), 'total'),
    };
    if (!isRevisore) {
      payload.totale_federico = sum(rows.filter(r => matchByUser(r, fed)),  'total');
      payload.totale_varga    = sum(rows.filter(r => matchByUser(r, var_)), 'total');
    }
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/invoices/search-for-link ─────────────────────────
// Search invoices that can be linked to a rejected invoice as its replacement.
// Filters: free-text on supplier/inv_number/internal_number, optional supplier match.
// Excludes the source invoice itself and any already linked-to-it invoice.
router.get('/search-for-link', requireAuth('admin','supervisor'), async (req, res) => {
  try {
    const { q = '', excludeId, supplier } = req.query;
    const term = String(q).trim();
    let query = supabase
      .from('invoices')
      .select('id, internal_number, inv_number, supplier, total, due_date, status, doc_date')
      .order('doc_date', { ascending: false })
      .limit(50);

    if (excludeId) query = query.neq('id', excludeId);
    if (supplier)  query = query.ilike('supplier', `%${supplier}%`);
    if (term) {
      query = query.or(`supplier.ilike.%${term}%,inv_number.ilike.%${term}%,internal_number.ilike.%${term}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/invoices/rifiutate-unresolved ────────────────────
// Returns all invoices currently in status=Rejected whose rejection has NOT
// been resolved yet (rejection_resolved_at IS NULL). Used by the Dashboard
// KPI in Faza 1 and by the resolution UI in Faza 2.
router.get('/rifiutate-unresolved', requireAuth(), async (req, res) => {
  try {
    const buildRifQuery = (useFk) => {
      let query = supabase
        .from('invoices')
        .select('id, er_id, internal_number, inv_number, supplier, total, due_date, responsible, status, status_changed_at, status_note, jmmc_notified_rejected_at, rejection_resolved_at')
        .eq('status', 'Rejected')
        .is('rejection_resolved_at', null)
        .order('status_changed_at', { ascending: false });

      // Revisore: scope to own responsible (FAZA B dual-read)
      if (req.user.role === 'revisore') {
        if (useFk && req.user.id)            query = query.eq('responsible_user_id', req.user.id);
        else if (req.user.responsible)       query = query.eq('responsible', req.user.responsible);
      }
      return query;
    };

    let { data, error } = await buildRifQuery(true);
    if (error && isMissingResponsibleUserIdError(error)) {
      ({ data, error } = await buildRifQuery(false));
    }
    if (error) throw error;
    const rows = data || [];
    const totale = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);
    res.json({ count: rows.length, totale, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/invoices/notify-pending-count ─────────────────────
// Returns pending + rejected-unresolved invoices that haven't been batch-notified yet.
router.get('/notify-pending-count', requireAuth(), async (req, res) => {
  try {
    // 1. Pending invoices awaiting delegate approval
    const { data: pendingData, error: e1 } = await supabase
      .from('invoices')
      .select('id, responsible, total, status')
      .eq('status', 'Pending')
      .not('responsible', 'is', null)
      .is('notifica_sent_at', null);
    if (e1) throw e1;

    // 2. Rejected invoices not yet resolved AND not yet batch-notified
    const { data: rejectedData, error: e2 } = await supabase
      .from('invoices')
      .select('id, responsible, total, status, status_note')
      .eq('status', 'Rejected')
      .is('rejection_resolved_at', null)
      .is('notifica_sent_at', null);
    if (e2) throw e2;

    const pending  = pendingData  || [];
    const rejected = rejectedData || [];

    const byDelegate = {};
    for (const inv of pending) {
      const key = inv.responsible;
      if (!byDelegate[key]) byDelegate[key] = { count: 0, total: 0 };
      byDelegate[key].count++;
      byDelegate[key].total += Number(inv.total) || 0;
    }

    res.json({
      count:         pending.length + rejected.length,
      pendingCount:  pending.length,
      rejectedCount: rejected.length,
      byDelegate,
      total:         pending.reduce((s, i) => s + (Number(i.total) || 0), 0),
      rejectedTotal: rejected.reduce((s, i) => s + (Number(i.total) || 0), 0),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/invoices/suppliers — unique supplier names ───────
router.get('/suppliers', requireAuth('admin', 'supervisor'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('supplier')
      .not('supplier', 'is', null)
      .order('supplier');

    if (error) throw error;
    const unique = [...new Set((data || []).map(r => r.supplier).filter(Boolean))];
    res.json({ suppliers: unique });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/invoices/:id/hint — predlog kategorije ───────────
// Prioriteta: manual+pattern match > manual brez pattern > auto (usage_count)
router.get('/:id/hint', requireAuth('admin', 'supervisor'), async (req, res) => {
  try {
    const { data: inv } = await supabase
      .from('invoices')
      .select('supplier, category_id, inv_number')
      .eq('id', req.params.id)
      .single();

    // Če faktura že ima kategorijo ali nima dobavitelja — ni predloga
    if (!inv?.supplier || inv.category_id)
      return res.json({ hint: null });

    // Fetch all hints for this supplier
    const { data: hints } = await supabase
      .from('supplier_category_hints')
      .select('*, categories(id, cost_type)')
      .eq('supplier', inv.supplier)
      .order('usage_count', { ascending: false });

    if (!hints?.length) return res.json({ hint: null });

    const invNum = inv.inv_number || '';

    // Priority 1: manual hint with matching pattern
    const manualWithPattern = hints.find(h =>
      h.source === 'manual' && h.match_pattern &&
      invNum.includes(h.match_pattern)
    );
    if (manualWithPattern) return res.json({ hint: manualWithPattern });

    // Priority 2: manual hint without pattern
    const manualNoPattern = hints.find(h =>
      h.source === 'manual' && !h.match_pattern
    );
    if (manualNoPattern) return res.json({ hint: manualNoPattern });

    // Priority 3: auto hint (highest usage_count, already sorted)
    const autoHint = hints.find(h => h.source !== 'manual') || hints[0];
    res.json({ hint: autoHint || null });
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

    const { data: paymentRecords } = await supabase
      .from('payment_records')
      .select('*')
      .eq('invoice_id', inv.id)
      .order('payment_date', { ascending: false });

    // If this invoice is linked to a replacement (rejection resolved=linked), fetch summary
    let linkedInvoice = null;
    if (inv.linked_invoice_id) {
      const { data: li } = await supabase
        .from('invoices')
        .select('id, internal_number, inv_number, supplier, total, due_date, status, doc_date')
        .eq('id', inv.linked_invoice_id)
        .single();
      linkedInvoice = li || null;
    }

    res.json({ invoice: inv, items: items || [], audit: audit || [], paymentRecords: paymentRecords || [], linkedInvoice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/invoices/:id/category — set category/status ──────
router.put('/:id/category', requireAuth('admin'), async (req, res) => {
  try {
    const { categoryId, status, responsible, statusNote } = req.body;

    const { data: inv } = await supabase
      .from('invoices').select('*').eq('id', req.params.id).single();
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });

    const clearCategory = categoryId === null && 'categoryId' in req.body;
    let costType = null, catResponsible = null;
    if (categoryId) {
      const { data: cat } = await supabase
        .from('categories').select('cost_type, responsible').eq('id', categoryId).single();
      if (cat) { costType = cat.cost_type; catResponsible = cat.responsible; }
    }

    const newResponsible = clearCategory
      ? null
      : (responsible !== undefined && responsible !== null && responsible !== '')
        ? responsible
        : (catResponsible || null);

    const now = new Date().toISOString();
    const updates = { updated_at: now };
    if (clearCategory) {
      updates.category_id          = null;
      updates.cost_type            = null;
      updates.responsible          = null;
      updates.responsible_user_id  = null;
    } else {
      if (categoryId)     updates.category_id  = categoryId;
      if (costType)       updates.cost_type     = costType;
      if (newResponsible) {
        const respCols = await responsibleColumns(newResponsible);
        updates.responsible         = respCols.responsible;
        updates.responsible_user_id = respCols.responsible_user_id;
      }
    }
    if (status) {
      updates.status             = status;
      updates.status_changed_by      = req.user.email;
      updates.status_changed_by_name = req.user.name;
      updates.status_changed_at      = now;
      updates.status_note            = statusNote || null;
    }

    // Try update with responsible_user_id; gracefully retry without it
    // if the SQL migration has not been applied yet.
    let { error } = await supabase.from('invoices').update(updates).eq('id', req.params.id);
    if (error && isMissingResponsibleUserIdError(error)) {
      const fallback = { ...updates };
      delete fallback.responsible_user_id;
      ({ error } = await supabase.from('invoices').update(fallback).eq('id', req.params.id));
    }
    if (error) throw error;

    // Rejection notification is now handled in the batch "Invia notifica" workflow
    // (POST /notify-delegates) — no instant per-invoice email on rejection.

    // ── Shrani hint po imenu dobavitelja ──────────────────────
    if (categoryId && inv.supplier) {
      try {
        // FAZA C: pass resolved alias (not raw UUID) so the hint stays
        // human-readable in the legacy `responsible` column.
        const hintAlias = updates.responsible !== undefined ? updates.responsible : newResponsible;
        await supabase.rpc('upsert_supplier_hint', {
          p_supplier:    inv.supplier,
          p_category_id: categoryId,
          p_cost_type:   costType       || null,
          p_responsible: hintAlias       || null,
        });
      } catch (hintErr) {
        console.warn('[hint] upsert_supplier_hint failed:', hintErr.message);
      }
    }

    // ── Audit log ─────────────────────────────────────────────
    await logChanges(req.params.id, inv, [
      { field: 'category_id',    label: 'Categoria',            oldVal: inv.cost_type,      newVal: costType },
      { field: 'cost_type',      label: 'Tipo costo',            oldVal: inv.cost_type,      newVal: costType },
      // FAZA C #6: log resolved alias (display name), not raw UUID, when
      // frontend sends responsible_user_id. updates.responsible holds the
      // canonical alias resolved by responsibleColumns().
      { field: 'responsible',    label: 'Delegato al controllo', oldVal: inv.responsible,    newVal: updates.responsible !== undefined ? updates.responsible : newResponsible },
      { field: 'status',         label: 'Stato',                 oldVal: inv.status,         newVal: status },
      { field: 'status_note',    label: 'Nota stato',             oldVal: inv.status_note,    newVal: statusNote || null },
    ], req.user.email, req.user.name);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/invoices/:id/verify ──────────────────────────────
router.put('/:id/verify', requireAuth('admin', 'supervisor', 'controller', 'delegato', 'revisore'), async (req, res) => {
  // Accepts { comment, status?: 'Approved'|'Rejected' }. Default 'Approved'
  // for backward compat. Allows assigned roles (incl. revisore) to both
  // approve and reject without needing edit permission on /category.
  const { comment } = req.body;
  const newStatus = req.body.status === 'Rejected' ? 'Rejected' : 'Approved';

  try {
    const { data: inv, error: fetchErr } = await supabase
      .from('invoices').select('*').eq('id', req.params.id).single();

    if (fetchErr || !inv) return res.status(404).json({ error: 'Invoice not found' });

    // revisore vidi samo svoje — kontroliraj ujemanje (FAZA C: prefer FK)
    if (req.user.role === 'revisore') {
      const okByFk    = inv.responsible_user_id && req.user.id && inv.responsible_user_id === req.user.id;
      const okByAlias = !inv.responsible_user_id && inv.responsible && req.user.responsible &&
                        inv.responsible === req.user.responsible;
      if (!okByFk && !okByAlias)
        return res.status(403).json({ error: 'This invoice is not assigned to you' });
    }

    if (inv.status !== 'Pending')
      return res.status(409).json({ error: 'Invoice already processed. Status is ' + inv.status });

    const changedAt = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from('invoices')
      .update({
        status:                newStatus,
        status_changed_by:      req.user.email,
        status_changed_by_name: req.user.name,
        status_changed_at:      changedAt,
        status_note:            comment || null,
        updated_at:             changedAt,
      })
      .eq('id', req.params.id);

    if (updateErr) throw updateErr;

    await auditLog({
      invoiceId:  inv.id,
      erId:       inv.er_id,
      invNumber:  inv.inv_number,
      supplier:   inv.supplier,
      total:      inv.total,
      action:     newStatus === 'Rejected' ? 'Fattura rifiutata' : 'Controllato e pagabile impostato',
      fieldName:  'status',
      oldValue:   inv.status,
      newValue:   newStatus,
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
        action:     `Nota delegato: "${comment}"`,
        fieldName:  'status_note',
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

    if (newStatus === 'Approved') {
      generateApprovalPDF(updatedInv, items || [], audit || [], req.user)
        .then(() => emailService.sendApprovalNotification(updatedInv, req.user))
        .catch(err => console.error('[VERIFY] PDF/email error:', err.message));
    }
    // Rejection notification is now handled in the batch "Invia notifica" workflow
    // (POST /notify-delegates) — no instant per-invoice email on rejection.

    res.json({ ok: true, invoice: updatedInv });

  } catch (err) {
    await sysLog('ERROR', 'SYSTEM', 'PUT /verify failed', {
      error: err, userEmail: req.user.email, invoiceId: req.params.id,
    });
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/invoices/:id/rejection-resolve (Faza 2) ────────
// JMMC marks a rejected invoice as resolved with one of three resolutions:
//   credit_note  — supplier issued a credit note (close)
//   linked       — link to a replacement invoice (linkedInvoiceId required)
//   closed       — manual close (write off / no replacement)
router.post('/:id/rejection-resolve', requireAuth('admin'), async (req, res) => {
  try {
    const { resolution, note, linkedInvoiceId } = req.body;
    const validResolutions = ['credit_note', 'linked', 'closed'];
    if (!validResolutions.includes(resolution)) {
      return res.status(400).json({ error: `resolution must be one of: ${validResolutions.join(', ')}` });
    }

    const { data: inv, error: fetchErr } = await supabase
      .from('invoices').select('*').eq('id', req.params.id).single();
    if (fetchErr || !inv) return res.status(404).json({ error: 'Invoice not found' });

    if (inv.status !== 'Rejected') {
      return res.status(400).json({ error: 'Invoice is not in Rejected status' });
    }
    if (inv.rejection_resolved_at) {
      return res.status(400).json({ error: 'Rejection already resolved' });
    }

    let linkedInv = null;
    if (resolution === 'linked') {
      if (!linkedInvoiceId) return res.status(400).json({ error: 'linkedInvoiceId is required for resolution=linked' });
      if (linkedInvoiceId === req.params.id) return res.status(400).json({ error: 'Cannot link an invoice to itself' });
      const { data: target, error: tErr } = await supabase
        .from('invoices').select('id, supplier, inv_number, internal_number, linked_invoice_id').eq('id', linkedInvoiceId).single();
      if (tErr || !target) return res.status(400).json({ error: 'Linked invoice not found' });
      // Circular link check (Faza 4): linked invoice must not already point back to us
      if (target.linked_invoice_id === req.params.id) {
        return res.status(400).json({ error: 'Circular link detected: target invoice is already linked to this one' });
      }
      linkedInv = target;
    }

    const now = new Date().toISOString();
    const updates = {
      rejection_resolved_at:      now,
      rejection_resolution:       resolution,
      rejection_resolved_by:      req.user.email,
      rejection_resolved_by_name: req.user.name,
      rejection_resolved_note:    note || null,
      linked_invoice_id:          resolution === 'linked' ? linkedInvoiceId : null,
      updated_at:                 now,
    };

    const { error: upErr } = await supabase.from('invoices').update(updates).eq('id', req.params.id);
    if (upErr) throw upErr;

    // Audit log
    const resLabel = resolution === 'credit_note' ? 'Nota di credito ricevuta'
                   : resolution === 'linked'      ? `Collegata a fattura ${linkedInv?.inv_number || linkedInvoiceId}`
                                                  : 'Chiusa manualmente';
    await auditLog({
      invoiceId: req.params.id,
      erId:      inv.er_id,
      invNumber: inv.inv_number,
      supplier:  inv.supplier,
      total:     inv.total,
      action:    `Rifiuto risolto: ${resLabel}${note ? ' — ' + note : ''}`,
      fieldName: 'rejection_resolved',
      oldValue:  null,
      newValue:  resolution,
      userEmail: req.user.email,
      userName:  req.user.name,
    });

    // Fire-and-forget resolution confirmation email
    (async () => {
      try {
        await emailService.sendRejectionResolved(
          { ...inv, ...updates },
          { name: req.user.name, email: req.user.email },
          { resolution, note: note || '', linkedInvoice: linkedInv },
        );
      } catch (e) {
        console.error('[rejection-resolved-notify] failed:', e.message);
      }
    })();

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/invoices/:id/rejection-unlink (Faza 4) ──────────
// Reopen a previously resolved rejection (clears resolution fields).
router.post('/:id/rejection-unlink', requireAuth('admin'), async (req, res) => {
  try {
    const { data: inv } = await supabase
      .from('invoices').select('*').eq('id', req.params.id).single();
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    if (!inv.rejection_resolved_at) {
      return res.status(400).json({ error: 'Rejection is not resolved — nothing to unlink' });
    }

    const now = new Date().toISOString();
    const { error } = await supabase.from('invoices').update({
      rejection_resolved_at:      null,
      rejection_resolution:       null,
      rejection_resolved_by:      null,
      rejection_resolved_by_name: null,
      rejection_resolved_note:    null,
      linked_invoice_id:          null,
      updated_at:                 now,
    }).eq('id', req.params.id);
    if (error) throw error;

    await auditLog({
      invoiceId: req.params.id,
      erId:      inv.er_id,
      invNumber: inv.inv_number,
      supplier:  inv.supplier,
      total:     inv.total,
      action:    `Rifiuto riaperto (resolution annullata: ${inv.rejection_resolution || '—'})`,
      fieldName: 'rejection_resolved',
      oldValue:  inv.rejection_resolution,
      newValue:  null,
      userEmail: req.user.email,
      userName:  req.user.name,
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/invoices/:id/payment ─────────────────────────────
router.put('/:id/payment', requireAuth('admin'), async (req, res) => {
  try {
    const { paymentStatus, paymentDate, paymentSource } = req.body;

    const { data: inv } = await supabase
      .from('invoices').select('*').eq('id', req.params.id).single();
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });

    const updates = { updated_at: new Date().toISOString() };
    if (paymentStatus !== undefined) updates.payment_status = paymentStatus || null;
    if (paymentDate   !== undefined) updates.payment_date   = paymentDate;
    if (paymentSource !== undefined) updates.payment_source = paymentSource;

    const { error } = await supabase.from('invoices').update(updates).eq('id', req.params.id);
    if (error) throw error;

    await logChanges(req.params.id, inv, [
      { field: 'payment_status', label: 'Stato pagamento',    oldVal: inv.payment_status, newVal: paymentStatus },
      { field: 'payment_date',   label: 'Data pagamento',     oldVal: inv.payment_date,   newVal: paymentDate },
      { field: 'payment_source', label: 'Fonte di pagamento', oldVal: inv.payment_source, newVal: paymentSource },
    ], req.user.email, req.user.name);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/invoices/:id/notifica ────────────────────────────
router.put('/:id/notifica', requireAuth('admin'), async (req, res) => {
  try {
    const { inviato } = req.body;
    const notifica_sent_at = inviato ? new Date().toISOString() : null;
    const updates = { notifica_sent_at };

    const { data: inv } = await supabase
      .from('invoices').select('*').eq('id', req.params.id).single();
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });

    const { error } = await supabase
      .from('invoices').update(updates).eq('id', req.params.id);
    if (error) throw error;

    await logChanges(req.params.id, inv, [
      { field: 'notifica_sent_at', label: 'Notifica inviata', oldVal: inv.notifica_sent_at, newVal: notifica_sent_at },
    ], req.user.email, req.user.name);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/invoices/:id/distinta-status ─────────────────────
router.put('/:id/distinta-status', requireAuth('admin'), async (req, res) => {
  try {
    const { inviato } = req.body;
    const now = new Date();
    const distinta_sent_at = inviato ? now.toISOString() : null;

    const { data: inv } = await supabase
      .from('invoices').select('*').eq('id', req.params.id).single();
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });

    // Ročno nastavljen batch ID: "MANUAL-YYYY-MM-DD-HHmm" — enaka časovna
    // oblika kot avtomatski batch iz Distinta/Conferma, z "MANUAL-" predpono,
    // da je v filtru in audit trailu takoj videti, da ga je nastavil operater
    // ročno in ne workflow "Conferma pagamenti e invia".
    const manualBatchId = inviato
      ? `MANUAL-${now.toISOString().slice(0, 16).replace('T', '-').replace(':', '')}`
      : null;

    const updates = { distinta_sent_at };
    if (inviato) {
      // Ročni SI: zapiši batch_id samo, če ga fattura še nima (ne povozi
      // pravega auto batcha, če ga fattura že ima — v praksi se to ne zgodi,
      // ker ročni reset SI→NO počisti batch_id, a je varovalka vseeno OK).
      if (!inv.distinta_batch_id) {
        updates.distinta_batch_id = manualBatchId;
      }
    } else {
      // Ročni reset SI → NO: fattura mora spet postati izbirljiva za novo distinto.
      // Počisti batch_id, da ne ostane "osirotel" (sicer se pojavi v filtru kot
      // lažni batch in fattura še vedno velja za uvrščeno v distinto).
      updates.distinta_batch_id = null;
      if (inv.payment_status === 'inviato') {
        updates.payment_status = 'da_pagare';
      }
    }

    const { error } = await supabase
      .from('invoices').update(updates).eq('id', req.params.id);
    if (error) throw error;

    const changes = [
      { field: 'distinta_sent_at', label: 'Distinta inviata', oldVal: inv.distinta_sent_at, newVal: distinta_sent_at },
    ];
    if (updates.distinta_batch_id !== undefined && updates.distinta_batch_id !== inv.distinta_batch_id) {
      changes.push({ field: 'distinta_batch_id', label: 'Batch distinta', oldVal: inv.distinta_batch_id, newVal: updates.distinta_batch_id });
    }
    if (updates.payment_status) {
      changes.push({ field: 'payment_status', label: 'Stato pagamento', oldVal: inv.payment_status, newVal: updates.payment_status });
    }
    await logChanges(req.params.id, inv, changes, req.user.email, req.user.name);

    if (inviato) {
      // Ročni set Inviato → generiraj PDF (fire & forget) z istim MANUAL- batch ID
      const batchId = updates.distinta_batch_id || inv.distinta_batch_id || manualBatchId;
      generateDistintaPDF({ ...inv, distinta_sent_at, distinta_batch_id: batchId }, batchId, distinta_sent_at)
        .then(() => auditLog({
          invoiceId:  inv.id,
          erId:       inv.er_id,
          invNumber:  inv.inv_number,
          supplier:   inv.supplier,
          total:      inv.total,
          action:     'Distinta PDF generiran (ročno)',
          fieldName:  'distinta_report',
          oldValue:   null,
          newValue:   'generated',
          userEmail:  req.user.email,
          userName:   req.user.name,
        }))
        .catch(e => console.error('[distinta-status] PDF gen failed', e.message));
    } else {
      // Ročni reset → izbriši stare PDF-je, da bo ob ponovnem pošiljanju svež
      const { error: delErr } = await supabase
        .from('invoice_attachments')
        .delete()
        .eq('invoice_id', req.params.id)
        .eq('attachment_type', 'distinta_report');
      if (delErr) console.error('[distinta-status] PDF delete failed', delErr.message);
      else await auditLog({
        invoiceId:  inv.id,
        erId:       inv.er_id,
        invNumber:  inv.inv_number,
        supplier:   inv.supplier,
        total:      inv.total,
        action:     'Distinta PDF arhiv izbrisan (reset na Da pagare)',
        fieldName:  'distinta_report',
        oldValue:   'exists',
        newValue:   null,
        userEmail:  req.user.email,
        userName:   req.user.name,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/invoices/sync-status ─────────────────────────────
router.get('/sync-status', requireAuth('admin', 'supervisor'), (req, res) => {
  res.json({
    running: syncState.isRunning(),
    what:    syncState.runningWhat(),
  });
});

// ── POST /api/invoices/cancel-sync ────────────────────────────
router.post('/cancel-sync', requireAuth('admin', 'supervisor'), async (req, res) => {
  syncState.requestCancel();
  await sysLog('WARN', 'SYSTEM', 'Sync cancellation requested by user', {
    userEmail: req.user?.email,
    detail: `Was running: ${syncState.runningWhat() || 'unknown'}`,
  });
  res.json({ ok: true });
});

// ── POST /api/invoices/sync-payment-status ────────────────────
router.post('/sync-payment-status', requireAuth('admin', 'supervisor'), async (req, res) => {
  try {
    await sysLog('INFO', 'SYSTEM', 'Manutenzione: sync-payment-status started', {
      userEmail: req.user?.email,
      detail: 'Začetek posodabljanja payment_status za vse račune.',
    });

    // Fetch all invoices
    const { data: invoices, error: invErr } = await supabase
      .from('invoices')
      .select('id, total, already_paid, distinta_sent_at');
    if (invErr) throw invErr;

    // Fetch all payment_records grouped by invoice_id
    const { data: allPR, error: prErr } = await supabase
      .from('payment_records')
      .select('invoice_id');
    if (prErr) throw prErr;

    const prSet = new Set((allPR || []).map(r => r.invoice_id));

    let updated = 0;
    const updates = [];

    for (const inv of (invoices || [])) {
      const hasPaid    = prSet.has(inv.id);
      const alreadyPaid = Number(inv.already_paid) || 0;
      const total       = Number(inv.total) || 0;

      let status;
      if      (alreadyPaid >= total && total > 0)  status = 'pagato';       // plačano v celoti (z ali brez payment_records)
      else if (hasPaid && alreadyPaid < total)     status = 'parziale';     // delno plačano
      else if (!hasPaid && alreadyPaid > 0)        status = 'in_pagamento'; // nalog poslan, brez records
      else if (inv.distinta_sent_at)               status = 'inviato';
      else                                         status = 'da_pagare';

      updates.push({ id: inv.id, payment_status: status });
    }

    // Batch update in chunks of 100
    const chunk = 100;
    for (let i = 0; i < updates.length; i += chunk) {
      const batch = updates.slice(i, i + chunk);
      for (const u of batch) {
        await supabase.from('invoices').update({ payment_status: u.payment_status }).eq('id', u.id);
        updated++;
      }
    }

    await sysLog('INFO', 'SYSTEM', 'Manutenzione: sync-payment-status completed', {
      userEmail: req.user?.email,
      detail: `Posodobljeni payment_status za ${updated} računov na podlagi logike: payment_records, already_paid, distinta_sent_at.`,
    });
    res.json({ ok: true, updated });
  } catch (err) {
    await sysLog('ERROR', 'SYSTEM', 'Manutenzione: sync-payment-status failed', {
      userEmail: req.user?.email,
      error: err,
    });
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/invoices/:id/pdf/:type ───────────────────────────
router.get('/:id/pdf/:type', requireAuth(), async (req, res) => {
  try {
    const type = req.params.type;

    // For 'original': return ALL attachments as an array
    // For 'approval_report': return the latest single attachment
    if (type === 'original') {
      const { data: atts, error } = await supabase
        .from('invoice_attachments')
        .select('id, file_name, file_type, contents_b64, file_size_kb')
        .eq('invoice_id', req.params.id)
        .eq('attachment_type', 'original')
        .order('created_at', { ascending: true });

      if (!error && atts?.length > 0) {
        // Repair original_pdf_id if it was somehow lost (e.g. after refetch or sync race)
        await supabase
          .from('invoices')
          .update({ original_pdf_id: atts[0].id, updated_at: new Date().toISOString() })
          .eq('id', req.params.id)
          .is('original_pdf_id', null);
        return res.json({
          attachments: atts.map(a => ({
            id:          a.id,
            fileName:    a.file_name,
            fileType:    a.file_type,
            contentsB64: a.contents_b64,
            sizeKb:      a.file_size_kb,
          })),
        });
      }

      // Not yet downloaded — fetch from e-računi and store all
      const { data: inv } = await supabase
        .from('invoices').select('er_id').eq('id', req.params.id).single();

      if (!inv) return res.status(404).json({ error: 'Invoice not found' });

      const result = await downloadOriginalPDF(req.params.id, inv.er_id);

      if (result.noAttachment || !result.attachmentId)
        return res.status(404).json({ error: 'No PDF attachment available in e-računi' });

      const ids = result.attachmentIds && result.attachmentIds.length > 0
        ? result.attachmentIds
        : [result.attachmentId];

      const { data: atts2 } = await supabase
        .from('invoice_attachments')
        .select('id, file_name, file_type, contents_b64, file_size_kb')
        .in('id', ids)
        .order('created_at', { ascending: true });

      if (atts2?.length > 0) {
        return res.json({
          attachments: atts2.map(a => ({
            id:          a.id,
            fileName:    a.file_name,
            fileType:    a.file_type,
            contentsB64: a.contents_b64,
            sizeKb:      a.file_size_kb,
          })),
        });
      }

      return res.status(404).json({ error: 'PDF not found' });
    }

    // approval_report / distinta_report / other — single latest record
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

    // distinta_report not found — auto-generate on demand using existing invoice data
    // (handles invoices sent before the PDF feature was deployed)
    if (type === 'distinta_report') {
      const { data: inv } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', req.params.id)
        .single();

      if (!inv?.distinta_sent_at) {
        return res.status(404).json({ error: 'Distinta non ancora inviata' });
      }

      await generateDistintaPDF(inv, inv.distinta_batch_id || '—', inv.distinta_sent_at);

      const { data: att2 } = await supabase
        .from('invoice_attachments')
        .select('file_name, file_type, contents_b64, file_size_kb')
        .eq('invoice_id', req.params.id)
        .eq('attachment_type', 'distinta_report')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (att2?.contents_b64) {
        return res.json({
          fileName:    att2.file_name,
          fileType:    att2.file_type,
          contentsB64: att2.contents_b64,
          sizeKb:      att2.file_size_kb,
        });
      }
    }

    return res.status(404).json({ error: 'PDF not found' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/invoices/:id/pdf/refetch — force re-download all attachments ───
router.post('/:id/pdf/refetch', requireAuth('admin'), async (req, res) => {
  try {
    const invoiceId = req.params.id;

    // Delete existing 'original' attachments so we re-fetch fresh
    await supabase
      .from('invoice_attachments')
      .delete()
      .eq('invoice_id', invoiceId)
      .eq('attachment_type', 'original');

    // Reset original_pdf_id on invoice
    await supabase
      .from('invoices')
      .update({ original_pdf_id: null })
      .eq('id', invoiceId);

    const { data: inv } = await supabase
      .from('invoices').select('er_id').eq('id', invoiceId).single();
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });

    const result = await downloadOriginalPDF(invoiceId, inv.er_id);

    if (result.noAttachment || !result.attachmentId)
      return res.status(404).json({ error: 'No PDF attachment available in e-računi' });

    const ids = result.attachmentIds?.length > 0 ? result.attachmentIds : [result.attachmentId];

    const { data: atts } = await supabase
      .from('invoice_attachments')
      .select('id, file_name, file_type, contents_b64, file_size_kb')
      .in('id', ids)
      .order('created_at', { ascending: true });

    return res.json({
      attachments: (atts || []).map(a => ({
        id:          a.id,
        fileName:    a.file_name,
        fileType:    a.file_type,
        contentsB64: a.contents_b64,
        sizeKb:      a.file_size_kb,
      })),
      count: (atts || []).length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/invoices/download-pdfs — batch PDF download ────
router.post('/download-pdfs', requireAuth('admin', 'supervisor'), async (req, res) => {
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

// ── POST /api/invoices/repair-pdf-ids — fix original_pdf_id where NULL but attachment exists ──
router.post('/repair-pdf-ids', requireAuth('admin', 'supervisor'), async (req, res) => {
  try {
    // Find invoices with original_pdf_id = null but have 'original' attachments
    const { data: broken } = await supabase
      .from('invoices')
      .select('id')
      .is('original_pdf_id', null);

    if (!broken || broken.length === 0) {
      return res.json({ ok: true, repaired: 0, message: 'Nessuna correzione necessaria' });
    }

    let repaired = 0;
    for (const inv of broken) {
      const { data: atts } = await supabase
        .from('invoice_attachments')
        .select('id')
        .eq('invoice_id', inv.id)
        .eq('attachment_type', 'original')
        .order('created_at', { ascending: true })
        .limit(1);

      if (atts && atts.length > 0) {
        await supabase
          .from('invoices')
          .update({ original_pdf_id: atts[0].id, updated_at: new Date().toISOString() })
          .eq('id', inv.id);
        repaired++;
      }
    }

    await sysLog('INFO', 'PDF', `repair-pdf-ids: repaired ${repaired} invoices`, {
      userEmail: req.user?.email,
      detail: `Checked ${broken.length} invoices with null original_pdf_id, repaired ${repaired}`,
    });

    res.json({ ok: true, repaired, checked: broken.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/invoices/notify-delegates ───────────────────────
// Sends pending invoice list to each delegate (Federico / Varga).
// Marks notified invoices with notifica_sent_at.
module.exports = router;
