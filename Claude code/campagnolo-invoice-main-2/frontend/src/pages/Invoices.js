import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../utils/api';
import { useLang } from '../hooks/useLang';
import { useAuth } from '../hooks/useAuth';
import { getDelegatoLabel } from '../utils/delegato';
import InvoiceModal from '../components/InvoiceModal';
import * as XLSX from 'xlsx';

const fmtCur  = n  => n != null ? Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }) : '';
const fmtDate = d  => d ? new Date(d).toLocaleDateString('it-IT') : '';
const fmtDT   = d  => d ? new Date(d).toLocaleString('it-IT') : '';

function isDueSoon(due) {
  if (!due) return false;
  const diff = (new Date(due) - new Date()) / 86400000;
  return diff >= 0 && diff <= 7;
}
function isOverdue(due) {
  if (!due) return false;
  return new Date(due) < new Date();
}

const DEFAULT_FILTERS = { status: '', responsible: '', search: '', hasAttachment: '', distintaSent: '', pagamento: '', notifica: '', costType: '', risolto: '' };
const DEFAULT_SORT    = { field: 'id', dir: 'desc' };
const LIMIT_OPTIONS   = [10, 25, 50, 100];

function loadPrefs(email) {
  try {
    const raw = localStorage.getItem(`invoices_prefs_${email}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function savePrefs(email, filters, sort, limit) {
  try {
    localStorage.setItem(`invoices_prefs_${email}`, JSON.stringify({ filters, sort, limit }));
  } catch {}
}

export default function Invoices() {
  const { t }    = useLang();
  const { user } = useAuth();
  const importCancelRef = useRef(false);
  const pdfCancelRef    = useRef(false);

  const [invoices,     setInvoices]    = useState([]);
  const [count,        setCount]       = useState(0);
  const [page,         setPage]        = useState(1);
  const [limit,        setLimit]       = useState(25);
  const [loading,      setLoading]     = useState(true);
  const [importing,      setImporting]      = useState(false);
  const [importStatus,   setImportStatus]   = useState('');
  const [exporting,      setExporting]      = useState(false);
  const [batchingPDF,    setBatchingPDF]    = useState(false);
  const [selected,       setSelected]       = useState(null);
  const [prefsLoaded,    setPrefsLoaded]    = useState(false);
  const [notifyCount,    setNotifyCount]    = useState(0);
  const [notifyDialog,   setNotifyDialog]   = useState(false);
  const [notifyPreview,  setNotifyPreview]  = useState(null);  // { byDelegate, total }
  const [notifying,      setNotifying]      = useState(false);
  const [notifyResult,   setNotifyResult]   = useState(null);
  const [notifyNote,     setNotifyNote]     = useState('');

  const [filters,      setFilters]      = useState(DEFAULT_FILTERS);
  const [sort,         setSort]         = useState(DEFAULT_SORT);
  const [summary,      setSummary]      = useState(null);
  const [lastImport,   setLastImport]   = useState(null);
  const [responsibles, setResponsibles] = useState([]); // [{ value, label, color }]
  const [categories,   setCategories]   = useState([]);

  const RESP_COLORS = ['#1c2b3a', '#c77d3a', '#2e7d52', '#5a4a8a', '#1a6fa3', '#7a3a3a'];
  useEffect(() => {
    api.get('/api/categories')
      .then(r => setCategories((r.data?.data || r.data || []).filter(c => c.active !== false)))
      .catch(() => {});
    api.get('/api/users').then(r => {
      const seen = new Set();
      const list = (r.data.data || [])
        .filter(u => u.active)
        .map(u => ({ value: (u.responsible || u.name || '').trim(), label: u.name }))
        .filter(u => u.value && !seen.has(u.value.toLowerCase()) && seen.add(u.value.toLowerCase()))
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((u, i) => ({ ...u, color: RESP_COLORS[i % RESP_COLORS.length] }));
      setResponsibles(list);
    }).catch(() => {});
  }, []); // eslint-disable-line

  // ── Ob zagonu: preberi shranjene preference za tega userja ──
  useEffect(() => {
    if (!user?.email) return;
    const prefs = loadPrefs(user.email);
    if (prefs) {
      if (prefs.filters) setFilters(f => ({ ...DEFAULT_FILTERS, ...prefs.filters }));
      if (prefs.sort)    setSort(prefs.sort);
      if (prefs.limit && LIMIT_OPTIONS.includes(Number(prefs.limit)))
        setLimit(Number(prefs.limit));
    }
    setPrefsLoaded(true);
  }, [user?.email]);

  // ── Ob vsaki spremembi filtrov/sorta/limita: shrani ────────
  useEffect(() => {
    if (!user?.email || !prefsLoaded) return;
    savePrefs(user.email, filters, sort, limit);
  }, [filters, sort, limit, user?.email, prefsLoaded]);

  const load = useCallback(async () => {
    if (!prefsLoaded) return;
    setLoading(true);
    try {
      const params = { page, limit, ...filters, sortField: sort.field, sortDir: sort.dir };
      const { data: res } = await api.get('/api/invoices', { params });
      setInvoices(res.data || []);
      setCount(res.count || 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
    // refresh notify badge after every load (inline to avoid before-init reference)
    api.get('/api/invoices/notify-pending-count')
      .then(r => setNotifyCount(r.data.count || 0))
      .catch(() => {});
  }, [page, limit, filters, sort, prefsLoaded, user?.role]);

  useEffect(() => { load(); }, [load]);

  // ── Carica summary KPI — si aggiorna ad ogni cambio filtro ──
  useEffect(() => {
    if (!prefsLoaded) return;
    const params = { ...filters };
    api.get('/api/invoices/summary', { params })
      .then(r => setSummary(r.data))
      .catch(() => {});
  }, [filters, prefsLoaded]);

  // ── Zadnji uvoz iz e-računov ──
  function fetchLastImport() {
    api.get('/api/invoices/last-import')
      .then(r => setLastImport(r.data.last_import_at || null))
      .catch(() => {});
  }
  useEffect(() => {
    fetchLastImport();
    const onDone = () => fetchLastImport();
    window.addEventListener('app-import-done', onDone);
    return () => window.removeEventListener('app-import-done', onDone);
  }, []); // only on mount

  function onLimitChange(val) {
    setLimit(Number(val));
    setPage(1);
  }

  async function handleImport() {
    importCancelRef.current = false;
    setImporting(true);
    setImportStatus(t('invoices.startImport'));
    window.dispatchEvent(new CustomEvent('app-import-start'));

    const onCancel = () => { importCancelRef.current = true; };
    window.addEventListener('app-import-cancel', onCancel);

    try {
      let offset = 0;
      let totalInserted = 0, totalUpdated = 0, totalErrors = 0;
      let totalInvoices = null;
      let iterations = 0;

      while (iterations < 50) {
        if (importCancelRef.current) {
          window.dispatchEvent(new CustomEvent('app-import-done', { detail: {
            inserted: totalInserted, updated: totalUpdated, errors: totalErrors,
            total: totalInvoices, cancelled: true,
          }}));
          return;
        }

        const { data } = await api.post('/api/invoices/import', { batchSize: 20, offset });
        totalInserted += data.inserted || 0;
        totalUpdated  += data.updated  || 0;
        totalErrors   += data.errors   || 0;
        if (data.total) totalInvoices = data.total;

        const processed = Math.min(offset + 20, totalInvoices || offset + 20);
        setImportStatus(`${t('invoices.processing')} ${processed} / ${totalInvoices || '...'}`);
        window.dispatchEvent(new CustomEvent('app-import-progress', { detail: {
          processed, total: totalInvoices,
          inserted: totalInserted, updated: totalUpdated, errors: totalErrors,
        }}));

        if (!data.remaining || data.remaining === 0) break;
        offset += 20;
        iterations++;
        await new Promise(r => setTimeout(r, 300));
      }

      setImportStatus('');
      window.dispatchEvent(new CustomEvent('app-import-done', { detail: {
        inserted: totalInserted, updated: totalUpdated, errors: totalErrors,
        total: totalInvoices,
      }}));
      load();
    } catch (err) {
      setImportStatus('');
      window.dispatchEvent(new CustomEvent('app-import-done', { detail: {
        error: err.response?.data?.error || err.message,
      }}));
    } finally {
      setImporting(false);
      window.removeEventListener('app-import-cancel', onCancel);
    }
  }

  async function handleBatchPDF() {
    pdfCancelRef.current = false;
    setBatchingPDF(true);

    // Listen for cancel request from modal
    function onCancel() { pdfCancelRef.current = true; }
    window.addEventListener('app-pdf-cancel', onCancel);

    window.dispatchEvent(new CustomEvent('app-pdf-start'));

    try {
      let offset = 0;
      let totalDownloaded = 0, totalSkipped = 0, totalErrors = 0, totalRemaining = 0;
      let iterations = 0;
      let cancelled = false;

      while (iterations < 200) {
        if (pdfCancelRef.current) { cancelled = true; break; }

        const { data } = await api.post('/api/invoices/download-pdfs', { batchSize: 10, offset });
        totalDownloaded  += data.downloaded || 0;
        totalSkipped     += data.skipped    || 0;
        totalErrors      += data.errors     || 0;
        totalRemaining    = data.remaining  || 0;

        window.dispatchEvent(new CustomEvent('app-pdf-progress', { detail: {
          downloaded: totalDownloaded,
          skipped:    totalSkipped,
          errors:     totalErrors,
          remaining:  totalRemaining,
          processed:  offset + (data.processed || 0),
        }}));

        if (data.remaining === 0 || data.processed === 0) break;
        offset += data.processed;
        iterations++;
        await new Promise(r => setTimeout(r, 300));
      }

      window.dispatchEvent(new CustomEvent('app-pdf-done', { detail: {
        downloaded: totalDownloaded,
        skipped:    totalSkipped,
        errors:     totalErrors,
        remaining:  totalRemaining,
        cancelled,
      }}));
      load();
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app-pdf-done', { detail: {
        error: err.response?.data?.error || err.message,
      }}));
    } finally {
      setBatchingPDF(false);
      window.removeEventListener('app-pdf-cancel', onCancel);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const params = { page: 1, limit: 9999, ...filters };
      const { data: res } = await api.get('/api/invoices', { params });
      const rows = res.data || [];

      if (rows.length === 0) {
        alert(t('invoices.noExportData'));
        return;
      }

      const wsData = [
        [
          'e-računi ID', 'Protocollo', 'N. Fattura', 'Fornitore', 'Codice Fornitore',
          'Data Fattura', 'Data Ricezione', 'Scadenza',
          'Imponibile', 'IVA', 'Totale', 'Già Pagato', 'Da Pagare',
          'Valuta', 'Metodo Pagamento', 'IBAN', 'Riferimento',
          'Categoria', 'Delegato', 'Anno',
          'Stato', 'Approvato Da', 'Data Approvazione', 'Note Approvazione',
          'Notifica Inviata', 'Distinta Inviata', 'Distinta Batch ID',
          'Stato Pagamento', 'Data Pagamento', 'Note',
        ],
        ...rows.map(inv => [
          inv.er_id            || '',
          inv.internal_number  || '',
          inv.inv_number       || '',
          inv.supplier         || '',
          inv.supplier_code    || '',
          fmtDate(inv.inv_date),
          fmtDate(inv.receival_date),
          fmtDate(inv.due_date),
          inv.net_amount       != null ? Number(inv.net_amount)   : '',
          inv.vat              != null ? Number(inv.vat)          : '',
          inv.total            != null ? Number(inv.total)        : '',
          inv.already_paid     != null ? Number(inv.already_paid) : '',
          inv.left_to_pay      != null ? Number(inv.left_to_pay)  : '',
          inv.currency         || 'EUR',
          inv.payment_method   || '',
          inv.bank_account     || '',
          inv.pay_reference    || '',
          inv.cost_type        || '',
          inv.responsible      || '',
          inv.business_year    || '',
          inv.status                       || '',
          inv.status_changed_by_name       || '',
          fmtDate(inv.status_changed_at),
          inv.status_note                  || '',
          inv.notifica_sent_at ? fmtDate(inv.notifica_sent_at) : '',
          inv.distinta_sent_at ? fmtDate(inv.distinta_sent_at) : '',
          inv.distinta_batch_id            || '',
          inv.payment_status               || '',
          fmtDate(inv.payment_date),
          inv.remarks          || '',
        ]),
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      ws['!cols'] = [
        { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 16 }, { wch: 14 },
        { wch: 14 }, { wch: 14 }, { wch: 12 },
        { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 8  }, { wch: 16 }, { wch: 24 }, { wch: 18 },
        { wch: 18 }, { wch: 16 }, { wch: 6  },
        { wch: 10 }, { wch: 20 }, { wch: 14 }, { wch: 30 },
        { wch: 14 }, { wch: 14 }, { wch: 20 },
        { wch: 16 }, { wch: 14 }, { wch: 30 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Fatture');

      const today = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `fatture_${today}.xlsx`);

    } catch (err) {
      alert(t('invoices.exportError') + ': ' + err.message);
    } finally { setExporting(false); }
  }

  // ── Notify pending count ───────────────────────────────────
  const loadNotifyCount = useCallback(() => {
    api.get('/api/invoices/notify-pending-count')
      .then(r => setNotifyCount(r.data.count || 0))
      .catch(() => {});
  }, [user?.role]);

  useEffect(() => { loadNotifyCount(); }, [loadNotifyCount]);

  async function openNotifyDialog() {
    // Load preview data — same endpoint but just for display
    try {
      const r = await api.get('/api/invoices/notify-pending-count');
      setNotifyCount(r.data.count || 0);
      setNotifyPreview(r.data);
    } catch {}
    setNotifyDialog(true);
    setNotifyResult(null);
  }

  async function handleNotify() {
    setNotifying(true);
    try {
      const r = await api.post('/api/invoices/notify-delegates', { note: notifyNote.trim() || undefined });
      setNotifyResult(r.data);
      setNotifyCount(0);
      load();
    } catch (e) {
      alert(t('common.error') + ': ' + (e.response?.data?.error || e.message));
    } finally { setNotifying(false); }
  }

  function onFilter(key, val) {
    setFilters(f => ({ ...f, [key]: val }));
    setPage(1);
  }

  function resetFilters() {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  }

  const isFiltered = Object.keys(DEFAULT_FILTERS).some(k => filters[k] !== DEFAULT_FILTERS[k]);

  function onSort(field) {
    setSort(s => ({
      field,
      dir: s.field === field && s.dir === 'asc' ? 'desc' : 'asc',
    }));
    setPage(1);
  }

  const totalPages = Math.ceil(count / limit);

  const isRevisore = user.role === 'revisore';
  const COLS = [
    { label: t('invoices.supplier'),    field: 'supplier'      },
    { label: t('invoices.protocol'),     field: 'internal_number' },
    { label: t('invoices.invNumber'),   field: 'inv_number'    },
    { label: t('invoices.date'),        field: 'inv_date',        thStyle: { width: 80 } },
    { label: t('invoices.due'),         field: 'due_date',        thStyle: { width: 80 } },
    { label: t('invoices.total'),       field: 'total',           thStyle: { width: 90 } },
    { label: t('invoices.leftToPay'),    field: 'left_to_pay',    thStyle: { width: 90 } },
    { label: t('invoices.paymentCol'),  field: 'payment_status' },
    { label: t('invoices.category'),    field: 'cost_type'     },
    // Revisore vede solo le sue fatture: la colonna Delegato è ridondante.
    ...(isRevisore ? [] : [{ label: t('invoices.delegShort'), field: 'responsible', thStyle: { width: 68 } }]),
    { label: t('invoices.status'),      field: 'status'            },
    { label: '📎',                      field: null                },
    { label: t('invoices.notifShort'),  field: 'notifica_sent_at',  thStyle: { width: 52 } },
    { label: t('invoices.distShort'),   field: 'distinta_sent_at',  thStyle: { width: 48 } },
  ];

  return (
    <div>
      {/* Header */}
      <div style={S.header}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h1 style={S.pageTitle}>{t('invoices.title')}</h1>
          {lastImport && (
            <span style={{ fontSize: 13, color: '#1c2b3a', fontFamily: 'sans-serif', letterSpacing: 0.1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 15 }}>🔄</span>
              <span style={{ fontWeight: 600, color: '#7a7571' }}>{t('invoices.lastSync')}:</span>
              <span style={{ fontWeight: 700 }}>{new Date(lastImport).toLocaleString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {importing && importStatus && (
            <span style={{ fontSize: 12, color: '#7a7571', fontFamily: 'sans-serif' }}>{importStatus}</span>
          )}
          {!isRevisore && (
            <button style={S.exportBtn} onClick={handleExport} disabled={exporting}>
              {exporting ? '⏳' : '📥 ' + t('invoices.exportXlsx')}
            </button>
          )}
          {!isRevisore && (
            <button
              style={{ ...S.notifyBtn, opacity: notifyCount === 0 ? 0.5 : 1, position: 'relative' }}
              onClick={openNotifyDialog}
              title={notifyCount === 0 ? t('invoices.noneToNotify') : `${notifyCount} ${t('invoices.toNotify')}`}
            >
              {'🔔 ' + t('invoices.notifica')}
              {notifyCount > 0 && (
                <span style={S.notifyBadge}>{notifyCount}</span>
              )}
            </button>
          )}
          <button
            style={{
              ...S.pdfBtn,
              ...(!['admin','supervisor'].includes(user.role) ? { opacity: 0.35, cursor: 'not-allowed', filter: 'grayscale(0.6)' } : {}),
            }}
            onClick={['admin','supervisor'].includes(user.role) ? handleBatchPDF : undefined}
            disabled={batchingPDF || !['admin','supervisor'].includes(user.role)}
            title={!['admin','supervisor'].includes(user.role)
              ? t('invoices.adminOnly')
              : t('invoices.downloadPdfTitle')}
          >
            {batchingPDF ? '⏳ PDF...' : '📎 ' + t('invoices.downloadPdf')}
          </button>
          <button
            style={{
              ...S.importBtn,
              ...(!['admin','supervisor'].includes(user.role) ? { opacity: 0.35, cursor: 'not-allowed', filter: 'grayscale(0.6)' } : {}),
            }}
            onClick={['admin','supervisor'].includes(user.role) ? handleImport : undefined}
            disabled={importing || !['admin','supervisor'].includes(user.role)}
            title={!['admin','supervisor'].includes(user.role)
              ? t('invoices.adminOnly')
              : ''}
          >
            {importing ? '⏳ Import...' : `⬇ ${t('invoices.import')}`}
          </button>
        </div>
      </div>

      {/* KPI summary cards */}
      {summary && (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Gruppo 1: Totali + Delegati */}
          <div style={{ background: '#f0f2f5', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#9e9b97', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontFamily: 'sans-serif' }}>{t('invoices.summary')}</div>
            <div style={S.kpiGrid}>
              <KpiCard label={t('invoices.totalInvoices')}  value={`€ ${fmtCur(summary.totale)}`}            color="#1c2b3a" bg="#ffffff" />
              <KpiCard label={t('invoices.leftToPay')}     value={`€ ${fmtCur(summary.da_pagare)}`}         color="#c0392b" bg="#fdecea" />
            </div>
          </div>
          {/* Gruppo 2: Per stato */}
          <div style={{ background: '#f5f5f0', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#9e9b97', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontFamily: 'sans-serif' }}>{t('invoices.byState')}</div>
            <div style={{ ...S.kpiGrid, gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 0 }}>
              <KpiCard label={t('status.Pending')}   value={`€ ${fmtCur(summary.totale_in_attesa)}`}  color="#6b6560" bg="#eceae6" />
              <KpiCard label={t('status.Approved')}  value={`€ ${fmtCur(summary.totale_approvato)}`}  color="#1d7c4d" bg="#e4f5ec" />
              <KpiCard label={t('status.Rejected')}  value={`€ ${fmtCur(summary.totale_rifiutato)}`}  color="#c0392b" bg="#fdecea" />
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={S.filters}>
        {!isRevisore && (
          <input
            style={S.input}
            placeholder={t('invoices.search')}
            value={filters.search}
            onChange={e => onFilter('search', e.target.value)}
          />
        )}
        <select style={S.select} value={filters.status} onChange={e => onFilter('status', e.target.value)}>
          <option value="">{t('invoices.allStatus')}</option>
          <option value="Pending">{t('status.Pending')}</option>
          <option value="Approved">{t('status.Approved')}</option>
          <option value="Rejected">{t('status.Rejected')}</option>
        </select>
        {['admin','supervisor','controller','delegato'].includes(user.role) && (
          <select style={S.select} value={filters.responsible} onChange={e => onFilter('responsible', e.target.value)}>
            <option value="">{t('invoices.allDelegates')}</option>
            {responsibles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            <option value="NONE">{'— ' + t('invoices.noDelegate')}</option>
          </select>
        )}
        {!isRevisore && (
          <select style={S.select} value={filters.hasAttachment} onChange={e => onFilter('hasAttachment', e.target.value)}>
            <option value="">{t('invoices.allAttach')}</option>
            <option value="yes">{'📎 ' + t('invoices.attachYes')}</option>
            <option value="no">{'📎 ' + t('invoices.attachNo')}</option>
          </select>
        )}
        {!isRevisore && (
          <select style={S.select} value={filters.pagamento} onChange={e => onFilter('pagamento', e.target.value)}>
            <option value="">{t('invoices.payAll')}</option>
            <option value="da_pagare">{'⬜ ' + t('payment.da_pagare')}</option>
            <option value="inviato">{'✉ ' + t('payment.inviato')}</option>
            <option value="in_pagamento">{'🟠 ' + t('payment.in_pagamento')}</option>
            <option value="pagato">{'✅ ' + t('payment.pagato')}</option>
            <option value="parziale">{'🟡 ' + t('payment.parziale')}</option>
          </select>
        )}
        {!isRevisore && (
          <select style={{ ...S.select, maxWidth: 130 }} value={filters.costType} onChange={e => onFilter('costType', e.target.value)}>
            <option value="">{t('invoices.catAll')}</option>
            {categories.map(c => <option key={c.id} value={c.cost_type}>{c.cost_type}</option>)}
            <option value="NONE">{'— ' + t('invoices.noCat')}</option>
          </select>
        )}
        {!isRevisore && (
          <select style={S.select} value={filters.notifica} onChange={e => onFilter('notifica', e.target.value)}>
            <option value="">{t('invoices.notifAll')}</option>
            <option value="si">{'🔔 ' + t('invoices.notifYes')}</option>
            <option value="no">{'— ' + t('invoices.notifNo')}</option>
          </select>
        )}
        {!isRevisore && (
          <select style={S.select} value={filters.distintaSent} onChange={e => onFilter('distintaSent', e.target.value)}>
            <option value="">{t('invoices.distintaAll')}</option>
            <option value="yes">{'✅ ' + t('invoices.distintaYes')}</option>
            <option value="no">{'— ' + t('invoices.distintaNo')}</option>
          </select>
        )}
        {!isRevisore && (
          <select style={S.select} value={filters.risolto} onChange={e => onFilter('risolto', e.target.value)} title="Filtra rifiutate per stato risoluzione">
            <option value="">{'❌ ' + t('rifiutate.filterAll')}</option>
            <option value="no">{'⏳ ' + t('rifiutate.filterUnresolved')}</option>
            <option value="yes">{'✅ ' + t('rifiutate.filterResolved')}</option>
          </select>
        )}
        {isFiltered && (
          <button
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e74c3c', background: '#fff', color: '#e74c3c', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}
            onClick={resetFilters}
          >
            {'× ' + t('invoices.resetFilters')}
          </button>
        )}
        {count > 0 && (
          <span style={{ padding: '8px 4px', fontSize: 13, color: '#7a7571', whiteSpace: 'nowrap', alignSelf: 'center' }}>
            {count} {count === 1 ? t('common.result') : t('common.results')}
          </span>
        )}
      </div>

      {/* Table */}
      <div style={S.tableWrap}>
        {loading ? (
          <div style={S.center}>{t('common.loading')}</div>
        ) : invoices.length === 0 ? (
          <div style={S.center}>{t('invoices.noResults')}</div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr style={S.headerRow}>
                {COLS.map(({ label, field, thStyle }) => (
                  <th
                    key={label}
                    style={{
                      ...S.th,
                      cursor: field ? 'pointer' : 'default',
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
                      ...(field === null ? { width: 36, textAlign: 'center' } : {}),
                      ...thStyle,
                    }}
                    onClick={() => { if (field) onSort(field); }}
                  >
                    {label}
                    {field && (
                      <span style={{ marginLeft: 4, color: sort.field === field ? '#1c2b3a' : '#ccc' }}>
                        {sort.field === field ? (sort.dir === 'asc' ? '▲' : '▼') : '▲▼'}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} style={S.row} onClick={() => setSelected(inv.id)}>
                  <td style={S.td}>{inv.supplier || '—'}</td>
                  <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12 }}>{inv.internal_number || '—'}</td>
                  <td style={S.td}>{inv.inv_number || '—'}</td>
                  <td style={S.td}>{fmtDate(inv.inv_date)}</td>
                  <td style={{ ...S.td, color: isOverdue(inv.due_date) ? '#c0392b' : isDueSoon(inv.due_date) ? '#c77d3a' : undefined, fontWeight: (isOverdue(inv.due_date) || isDueSoon(inv.due_date)) ? 600 : undefined }}>
                    {fmtDate(inv.due_date)}
                    {isOverdue(inv.due_date) && <span style={{ marginLeft: 4, fontSize: 12, color: '#c0392b' }}>⚠</span>}
                    {isDueSoon(inv.due_date) && !isOverdue(inv.due_date) && <span style={{ marginLeft: 4, fontSize: 12, color: '#c77d3a' }}>⚠</span>}
                  </td>
                  <td style={{ ...S.td, fontWeight: 600 }}>€ {fmtCur(inv.total)}</td>
                  <td style={{ ...S.td, textAlign: 'right', fontWeight: 600 }}>
                    {inv.left_to_pay > 0
                      ? <span style={{ color: '#c0392b' }}>€ {fmtCur(inv.left_to_pay)}</span>
                      : <span style={{ color: '#2e7d52' }}>€ {fmtCur(inv.left_to_pay ?? 0)}</span>}
                  </td>
                  <td style={S.td}>
                    {(() => {
                      // Manual override takes precedence
                      if (inv.payment_status) {
                        const cfg = {
                          pagato:       { bg: '#e8f5ec', color: '#2e7d52', label: '✅ ' + t('payment.pagato') },
                          parziale:     { bg: '#fff8e1', color: '#b07d00', label: '🟡 ' + t('payment.parziale') },
                          in_pagamento: { bg: '#fff3e0', color: '#e65c00', label: '🟠 ' + t('payment.in_pagamento') },
                          inviato:      { bg: '#e8f0fb', color: '#1a4fa3', label: '✉ ' + t('payment.inviato') },
                          da_pagare:    { bg: '#f4f3f1', color: '#aaa',    label: t('payment.da_pagare') },
                        }[inv.payment_status] || { bg: '#f4f3f1', color: '#aaa', label: inv.payment_status };
                        return <span title="Stato manuale" style={{ ...S.badge, background: cfg.bg, color: cfg.color }}>
                          {cfg.label}
                        </span>;
                      }
                      const hasPaid     = inv.payment_records && inv.payment_records.length > 0;
                      const alreadyPaid = Number(inv.already_paid) || 0;
                      const total       = Number(inv.total) || 0;
                      const hasInviato  = !!inv.distinta_sent_at;
                      if (alreadyPaid >= total && total > 0) return (
                        <span title={hasPaid ? `Pagato il ${fmtDate(inv.payment_records[0].payment_date)}` : `Già pagato: €${fmtCur(alreadyPaid)}`}
                          style={{ ...S.badge, background: '#e8f5ec', color: '#2e7d52' }}>
                          {'✅ ' + t('payment.pagato')}
                        </span>
                      );
                      if (hasPaid && alreadyPaid < total) return (
                        <span title={`Pagato: €${fmtCur(alreadyPaid)} / €${fmtCur(total)}`}
                          style={{ ...S.badge, background: '#fff8e1', color: '#b07d00' }}>
                          {'🟡 ' + t('payment.parziale')}
                        </span>
                      );
                      if (!hasPaid && alreadyPaid > 0) return (
                        <span title={`Nalog na banki: €${fmtCur(alreadyPaid)}`}
                          style={{ ...S.badge, background: '#fff3e0', color: '#e65c00' }}>
                          {'🟠 ' + t('payment.in_pagamento')}
                        </span>
                      );
                      if (hasInviato) return (
                        <span title={`Batch: ${inv.distinta_batch_id}\n${fmtDT(inv.distinta_sent_at)}`}
                          style={{ ...S.badge, background: '#e8f0fb', color: '#1a4fa3' }}>
                          {'✉ ' + t('payment.inviato')}
                        </span>
                      );
                      return <span style={{ ...S.badge, background: '#f4f3f1', color: '#aaa' }}>{t('payment.da_pagare')}</span>;
                    })()}
                  </td>
                  <td style={{ ...S.td, fontSize: 11, color: '#5a5551' }}>
                    {inv.category_id && inv.responsible ? (inv.cost_type || '—') : t('invoices.noneCategory')}
                  </td>
                  {!isRevisore && (
                    <td style={S.td}>
                      <span style={{ ...S.badge, background: responsibles.find(x => (x.value || '').toLowerCase() === (inv.responsible || '').toLowerCase())?.color || '#aaa' }}>
                        {getDelegatoLabel(inv.responsible, responsibles) || '—'}
                      </span>
                    </td>
                  )}
                  <td style={S.td}>
                    <StatusBadge status={inv.status} t={t} />
                  </td>
                  <td style={{ ...S.td, textAlign: 'center', padding: '11px 6px' }}>
                    <span
                      title={inv.original_pdf_id ? t('invoices.pdfAvail') : t('invoices.pdfNotAvail')}
                      style={{
                        fontSize:   inv.original_pdf_id ? 16 : 13,
                        display:    'inline-block',
                        padding:    inv.original_pdf_id ? '2px 6px' : '1px 4px',
                        borderRadius: 5,
                        background:   inv.original_pdf_id ? '#c8f0d8' : 'transparent',
                        border:       inv.original_pdf_id ? '1px solid #8ecfaa' : 'none',
                        filter:       inv.original_pdf_id ? 'none' : 'grayscale(1) opacity(0.2)',
                      }}
                    >
                      📎
                    </span>
                  </td>
                  <td style={{ ...S.td, textAlign: 'center' }}>
                    {inv.notifica_sent_at
                      ? <span style={{ ...S.badge, background: '#e8f0fb', color: '#1a4fa3' }} title={`Notificato il ${fmtDT(inv.notifica_sent_at)}`}>🔔 Sì</span>
                      : <span style={{ color: '#ccc', fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ ...S.td, textAlign: 'center' }}>
                    {inv.distinta_sent_at
                      ? <span style={{ ...S.badge, background: '#e8f5ec', color: '#2e7d52' }} title={`Batch: ${inv.distinta_batch_id || '—'}\n${fmtDT(inv.distinta_sent_at)}`}>✅ Sì</span>
                      : <span style={{ color: '#ccc', fontSize: 12 }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div style={S.pagination}>
        <div style={S.limitRow}>
          <label style={S.limitLabel}>{t('invoices.rowsPerPage')}:</label>
          <select style={S.limitSelect} value={limit} onChange={e => onLimitChange(e.target.value)}>
            {LIMIT_OPTIONS.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button style={S.pageBtn} disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
            <span style={S.pageInfo}>{page} / {totalPages} ({count} {t('common.results')})</span>
            <button style={S.pageBtn} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
          </div>
        )}
        {totalPages <= 1 && count > 0 && (
          <span style={S.pageInfo}>{count} {t('common.results')}</span>
        )}
      </div>

      {/* Notifica dialog */}
      {notifyDialog && (
        <div style={S.overlay}>
          <div style={S.notifyModal}>
            {/* Header */}
            <div style={{ background: '#1c2b3a', padding: '16px 20px', borderRadius: '8px 8px 0 0', margin: '-24px -24px 16px -24px' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', fontFamily: 'sans-serif' }}>🔔 Notifica Delegati</div>
              <div style={{ fontSize: 12, color: '#c8c4c1', marginTop: 4, fontFamily: 'sans-serif' }}>
                {!notifyResult
                  ? 'Email con fatture in attesa di approvazione — notifica non ancora inviata'
                  : 'Notifiche inviate con successo'}
              </div>
            </div>

            {!notifyResult ? (
              <>
                <div style={{ fontSize: 13, color: '#5a5551', marginBottom: 16, fontFamily: 'sans-serif', lineHeight: 1.5 }}>
                  Verrà inviata <strong>una e-mail riepilogativa</strong> con tutte le fatture in attesa e le fatture rifiutate che richiedono azione.
                </div>

                {/* Riepilogo box */}
                <div style={{ background: '#f4f3f1', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontFamily: 'sans-serif' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1c2b3a', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Riepilogo</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#5a5551' }}>📋 Fatture in attesa di approvazione</span>
                      <span style={{ fontWeight: 700, color: '#1c2b3a' }}>{notifyPreview?.pendingCount ?? notifyCount}</span>
                    </div>
                    {(notifyPreview?.rejectedCount || 0) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: '#c0392b' }}>❌ Fatture rifiutate (azione JMMC)</span>
                        <span style={{ fontWeight: 700, color: '#c0392b' }}>{notifyPreview.rejectedCount}</span>
                      </div>
                    )}
                    {notifyPreview?.total > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, borderTop: '1px solid #e2e0dd', paddingTop: 6, marginTop: 2 }}>
                        <span style={{ color: '#000', fontWeight: 700 }}>Totale</span>
                        <span style={{ fontWeight: 800, color: '#000', fontSize: 15 }}>
                          {notifyCount} fatture · € {Number((notifyPreview.total || 0) + (notifyPreview.rejectedTotal || 0)).toLocaleString('it-IT', { minimumFractionDigits: 2, useGrouping: true })}
                        </span>
                      </div>
                    )}
                    {notifyPreview?.byDelegate && Object.entries(notifyPreview.byDelegate).map(([name, d]) => (
                      <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: '#5a5551' }}>
                          <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#5a5551', marginRight: 5, verticalAlign: 'middle' }}/>
                          {name.charAt(0) + name.slice(1).toLowerCase()} ({d.count})
                        </span>
                        <span style={{ color: '#5a5551', fontWeight: 600 }}>
                          € {Number(d.total).toLocaleString('it-IT', { minimumFractionDigits: 2, useGrouping: true })}
                        </span>
                      </div>
                    ))}
                    {notifyCount === 0 && (
                      <div style={{ fontSize: 12, color: '#2e7d52', marginTop: 4 }}>✅ Nessuna fattura da notificare.</div>
                    )}
                  </div>
                </div>

                {/* Note */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#7a7571', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>
                    Note (opzionale)
                  </label>
                  <textarea
                    value={notifyNote}
                    onChange={e => setNotifyNote(e.target.value)}
                    placeholder="Aggiungi una nota per i delegati…"
                    rows={2}
                    style={{ width: '100%', borderRadius: 6, border: '1px solid #e2e0dd', padding: '8px 10px', fontSize: 13, resize: 'vertical', fontFamily: 'sans-serif', outline: 'none', boxSizing: 'border-box', color: '#2a2421' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button style={S.cancelBtn} onClick={() => { setNotifyDialog(false); setNotifyNote(''); }}>{'✕ ' + t('common.cancel')}</button>
                  <button
                    style={{ ...S.notifyConfirmBtn, opacity: (notifyCount === 0 || notifying) ? 0.5 : 1 }}
                    onClick={handleNotify}
                    disabled={notifyCount === 0 || notifying}
                  >
                    {notifying ? '⏳ Invio...' : '🔔 Invia notifica'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ background: '#e8f5ec', border: '1px solid #b8dfc8', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontFamily: 'sans-serif' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#2e7d52', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{t('invoices.notifyResultTitle')}</div>
                  <div style={{ fontSize: 13, color: '#5a5551', lineHeight: 1.6 }}>
                    {notifyResult.pendingCount > 0 && (
                      <div>📋 {notifyResult.pendingCount} fatture in attesa di approvazione</div>
                    )}
                    {notifyResult.rejectedCount > 0 && (
                      <div style={{ color: '#c0392b' }}>❌ {notifyResult.rejectedCount} fatture rifiutate (azione JMMC)</div>
                    )}
                    <div style={{ marginTop: 6, fontWeight: 700, color: '#2e7d52' }}>
                      ✓ Totale {notifyResult.count} fatture notificate
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button style={S.notifyConfirmBtn} onClick={() => { setNotifyDialog(false); setNotifyResult(null); setNotifyNote(''); }}>{t('common.close')}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {selected && (
        <InvoiceModal
          invoiceId={selected}
          onClose={() => setSelected(null)}
          onRefresh={load}
        />
      )}
    </div>
  );
}

function KpiCard({ label, value, color, bg }) {
  return (
    <div style={{ background: bg, borderRadius: 8, padding: '14px 18px' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: 'sans-serif' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#7a7571', marginTop: 4, fontFamily: 'sans-serif' }}>{label}</div>
    </div>
  );
}

function StatusBadge({ status, t }) {
  const colors = { Pending: '#c77d3a', Approved: '#2e7d52', Rejected: '#c0392b' };
  return (
    <span style={{ ...S.badge, background: colors[status] || '#888' }}>
      {t(`status.${status}`) || status}
    </span>
  );
}

const S = {
  kpiGrid:     { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginBottom: 12 },
  header:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  pageTitle:   { margin: 0, fontSize: 22, fontWeight: 700, color: '#1c2b3a', fontFamily: 'sans-serif' },
  exportBtn:      { padding: '9px 18px', borderRadius: 8, border: '1px solid #1c2b3a', background: '#fff', color: '#1c2b3a', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  pdfBtn:         { padding: '9px 18px', borderRadius: 8, border: '1px solid #2e7d52', background: '#fff', color: '#2e7d52', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  importBtn:      { padding: '9px 18px', borderRadius: 8, border: 'none', background: '#1c2b3a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  notifyBtn:      { padding: '9px 18px', borderRadius: 8, border: '1px solid #c77d3a', background: '#fff', color: '#c77d3a', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  notifyBadge:    { position: 'absolute', top: -6, right: -6, background: '#c0392b', color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 },
  notifyModal:    { background: '#fff', borderRadius: 12, width: '100%', maxWidth: 440, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', fontFamily: 'sans-serif', overflow: 'hidden' },
  notifyConfirmBtn: { padding: '8px 18px', borderRadius: 8, border: 'none', background: '#1c2b3a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  overlay:        { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  cancelBtn:      { padding: '8px 16px', borderRadius: 6, border: '1px solid #e2e0dd', background: '#fff', color: '#c0392b', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  filters:     { display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' },
  input:       { padding: '6px 8px', borderRadius: 8, border: '1px solid #e2e0dd', fontSize: 12, flex: '1 1 180px', outline: 'none' },
  select:      { padding: '6px 8px', borderRadius: 8, border: '1px solid #e2e0dd', fontSize: 12, background: '#fff', cursor: 'pointer' },
  tableWrap:   { background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflowX: 'auto' },
  table:       { width: '100%', minWidth: 1400, borderCollapse: 'collapse', fontFamily: 'sans-serif' },
  headerRow:   { background: '#f4f3f1' },
  th:          { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#7a7571', textTransform: 'uppercase' },
  row:         { borderBottom: '1px solid #f4f3f1', cursor: 'pointer', transition: 'background 0.1s' },
  td:          { padding: '11px 14px', fontSize: 13, color: '#2a2421' },
  badge:       { display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, color: '#fff', fontWeight: 600 },
  center:      { padding: 40, textAlign: 'center', color: '#888', fontFamily: 'sans-serif' },
  pagination:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0' },
  limitRow:    { display: 'flex', alignItems: 'center', gap: 8 },
  limitLabel:  { fontSize: 13, color: '#7a7571', fontFamily: 'sans-serif' },
  limitSelect: { padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e0dd', fontSize: 13, background: '#fff', cursor: 'pointer' },
  pageBtn:     { padding: '6px 12px', border: '1px solid #e2e0dd', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 16 },
  pageInfo:    { fontSize: 13, color: '#7a7571', fontFamily: 'sans-serif' },
};
