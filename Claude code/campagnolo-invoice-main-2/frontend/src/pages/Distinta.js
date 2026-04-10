// ── Distinta.js ───────────────────────────────────────────────
import React, { useEffect, useState, useCallback } from 'react';
import api from '../utils/api';
import { useLang } from '../hooks/useLang';
import { useAuth } from '../hooks/useAuth';
import { getDelegatoLabel } from '../utils/delegato';
import * as XLSX from 'xlsx';
import InvoiceModal from '../components/InvoiceModal';

const fmtCur  = n => n != null ? `€ ${Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, useGrouping: true })}` : '—';
const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '—';
const fmtDT   = d => d ? new Date(d).toLocaleString('it-IT') : '—';

// Batch helpers — used by the batch filter combobox
const formatBatchDate = iso => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const formatBatchLabel = b => b
  ? `${b.batch_id} · ${formatBatchDate(b.sent_at)} · ${b.count} · ${fmtCur(b.total)}`
  : '';

function isDueSoon(due) {
  if (!due) return false;
  const diff = (new Date(due) - new Date()) / 86400000;
  return diff >= 0 && diff <= 7;
}

function isOverdue(due) {
  if (!due) return false;
  return new Date(due) < new Date();
}

const PAGAMENTO_STYLE = {
  pagato:       { bg: '#e8f5ec', color: '#2e7d52' },
  parziale:     { bg: '#fefce8', color: '#a16207' },
  in_pagamento: { bg: '#fff3e0', color: '#c77d3a' },
  inviato:      { bg: '#e8f0fe', color: '#1a6fa3' },
  da_pagare:    { bg: '#f4f3f1', color: '#aaa' },
};

function loadDistintaPrefs(email) {
  try {
    const raw = localStorage.getItem(`distinta_prefs_${email}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveDistintaPrefs(email, prefs) {
  try { localStorage.setItem(`distinta_prefs_${email}`, JSON.stringify(prefs)); } catch {}
}

export function Distinta() {
  const { t }    = useLang();
  const { user } = useAuth();

  const PAGAMENTO_CFG = Object.fromEntries(
    Object.entries(PAGAMENTO_STYLE).map(([k, v]) => [k, { ...v, label: t(`payment.${k}`) }])
  );

  const [rows,        setRows]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [sending,     setSending]     = useState(false);
  const [exporting,   setExporting]   = useState(false);
  const [updatingId,  setUpdatingId]  = useState(null);
  const [selected,    setSelected]    = useState(null);
  const [confirmSend,    setConfirmSend]    = useState(false);
  const [checkedIds,     setCheckedIds]     = useState(new Set());
  const [responsibles,   setResponsibles]   = useState([]); // [{ value, label, email, color }]
  const [sendResult,     setSendResult]     = useState(null);
  const [sendNote,       setSendNote]       = useState('');

  const [filterResp,      setFilterResp]      = useState('');
  const [filterSearch,    setFilterSearch]    = useState('');
  const [filterSent,      setFilterSent]      = useState('');
  const [filterPagamento, setFilterPagamento] = useState('');
  const [filterCat,       setFilterCat]       = useState('');
  const [filterBatch,     setFilterBatch]     = useState('');   // selected distinta_batch_id
  const [batches,         setBatches]         = useState([]);    // [{ batch_id, sent_at, count, total }]
  const [batchQuery,      setBatchQuery]      = useState('');    // search input text
  const [batchOpen,       setBatchOpen]       = useState(false); // dropdown open flag
  const [lastImport,      setLastImport]      = useState(null);
  const [prefsLoaded,     setPrefsLoaded]     = useState(false);
  const [sort, setSort] = useState({ field: null, dir: 'asc' });

  function onSort(field) {
    setSort(s => s.field === field
      ? { field: s.dir === 'asc' ? field : null, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { field, dir: 'asc' });
  }
  function sortIcon(field) {
    if (sort.field !== field) return <span style={{ marginLeft: 4, color: '#ccc' }}>▲▼</span>;
    return <span style={{ marginLeft: 4, color: '#1c2b3a' }}>{sort.dir === 'asc' ? '▲' : '▼'}</span>;
  }

  // Ob zagonu: preberi shranjene filtre
  useEffect(() => {
    if (!user?.email) return;
    const p = loadDistintaPrefs(user.email);
    if (p) {
      if (p.filterResp      !== undefined) setFilterResp(p.filterResp);
      if (p.filterSearch    !== undefined) setFilterSearch(p.filterSearch);
      if (p.filterSent      !== undefined) setFilterSent(p.filterSent);
      if (p.filterPagamento !== undefined) setFilterPagamento(p.filterPagamento);
      if (p.filterCat       !== undefined) setFilterCat(p.filterCat);
      if (p.filterBatch     !== undefined) setFilterBatch(p.filterBatch);
    }
    setPrefsLoaded(true);
  }, [user?.email]);

  // Ob vsaki spremembi: shrani filtre
  useEffect(() => {
    if (!user?.email || !prefsLoaded) return;
    saveDistintaPrefs(user.email, { filterResp, filterSearch, filterSent, filterPagamento, filterCat, filterBatch });
  }, [filterResp, filterSearch, filterSent, filterPagamento, filterCat, filterBatch, user?.email, prefsLoaded]);

  const load = useCallback(() => {
    setLoading(true);
    const params = filterBatch ? { batchId: filterBatch } : {};
    api.get('/api/distinta', { params })
      .then(r => setRows(r.data.data || []))
      .finally(() => setLoading(false));
  }, [filterBatch]);

  useEffect(() => { load(); }, [load]);

  // ── Load distinta batches for combobox filter ──
  const loadBatches = useCallback(() => {
    api.get('/api/distinta/batches')
      .then(r => setBatches(r.data?.data || []))
      .catch(() => setBatches([]));
  }, []);
  useEffect(() => { loadBatches(); }, [loadBatches]);

  // Load responsibles from users table
  const RESP_COLORS = ['#1c2b3a', '#c77d3a', '#2e7d52', '#5a4a8a', '#1a6fa3', '#7a3a3a'];
  useEffect(() => {
    api.get('/api/users').then(r => {
      const seen = new Set();
      const list = (r.data.data || [])
        .filter(u => u.active)
        .map(u => ({ value: (u.responsible || u.name || '').trim(), label: u.name, email: u.email }))
        .filter(u => u.value && !seen.has(u.value.toLowerCase()) && seen.add(u.value.toLowerCase()))
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((u, i) => ({ ...u, color: RESP_COLORS[i % RESP_COLORS.length] }));
      setResponsibles(list);
    }).catch(() => {});
  }, []); // eslint-disable-line

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

  // ── Payment status helper ─────────────────────────────────
  const computePaymentStatus = r => {
    if (r.payment_status) return r.payment_status;
    const hasPaid     = r.payment_records && r.payment_records.length > 0;
    const alreadyPaid = Number(r.already_paid) || 0;
    const total       = Number(r.total) || 0;
    if (alreadyPaid >= total && total > 0) return 'pagato';       // plačano v celoti
    if (hasPaid && alreadyPaid < total)    return 'parziale';     // delno plačano
    if (!hasPaid && alreadyPaid > 0)       return 'in_pagamento'; // nalog poslan
    if (r.distinta_sent_at)                return 'inviato';
    return 'da_pagare';
  };

  // Case-insensitive comparison helper for delegato (data has mixed casing)
  const respEq = (a, b) => (a || '').toLowerCase().trim() === (b || '').toLowerCase().trim();

  // ── Filtered rows ─────────────────────────────────────────
  const filtered = rows.filter(r => {
    if (filterResp === 'NONE') { if (r.responsible) return false; }
    else if (filterResp && !respEq(r.responsible, filterResp)) return false;
    if (filterSent === 'sent'     && !r.notifica_sent_at)  return false;
    if (filterSent === 'not_sent' &&  r.notifica_sent_at)  return false;
    if (filterPagamento && computePaymentStatus(r) !== filterPagamento) return false;
    if (filterCat && (r.cost_type || '') !== filterCat) return false;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      if (!r.supplier?.toLowerCase().includes(q) && !r.inv_number?.toLowerCase().includes(q) && !r.internal_number?.toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    if (!sort.field) return 0;
    const mul = sort.dir === 'asc' ? 1 : -1;
    const PAY_ORDER = { da_pagare: 0, inviato: 1, in_pagamento: 2, parziale: 3, pagato: 4 };
    switch (sort.field) {
      case 'selectable': {
        const sa = (computePaymentStatus(a) !== 'pagato' && !a.distinta_sent_at) ? 1 : 0;
        const sb = (computePaymentStatus(b) !== 'pagato' && !b.distinta_sent_at) ? 1 : 0;
        return mul * (sa - sb);
      }
      case 'supplier':
        return mul * (a.supplier || '').localeCompare(b.supplier || '');
      case 'internal_number':
        return mul * (a.internal_number || '').localeCompare(b.internal_number || '');
      case 'inv_number':
        return mul * (a.inv_number || '').localeCompare(b.inv_number || '');
      case 'due_date':
        return mul * ((a.due_date || '').localeCompare(b.due_date || ''));
      case 'total':
        return mul * ((Number(a.total) || 0) - (Number(b.total) || 0));
      case 'left_to_pay':
        return mul * ((Number(a.left_to_pay) || 0) - (Number(b.left_to_pay) || 0));
      case 'cost_type':
        return mul * (a.cost_type || '').localeCompare(b.cost_type || '');
      case 'responsible':
        return mul * (a.responsible || '').localeCompare(b.responsible || '');
      case 'payment_status': {
        const pa = PAY_ORDER[computePaymentStatus(a)] ?? -1;
        const pb = PAY_ORDER[computePaymentStatus(b)] ?? -1;
        return mul * (pa - pb);
      }
      case 'distinta_sent_at':
        return mul * ((a.distinta_sent_at || '').localeCompare(b.distinta_sent_at || ''));
      default: return 0;
    }
  });

  // ── Checkbox helpers ──────────────────────────────────────
  const isSelectable = r => computePaymentStatus(r) !== 'pagato' && !r.distinta_sent_at;
  const selectable   = filtered.filter(isSelectable);
  const allChecked   = selectable.length > 0 && selectable.every(r => checkedIds.has(r.id));
  const someChecked  = selectable.some(r => checkedIds.has(r.id));
  const toggleAll    = () => setCheckedIds(allChecked
    ? new Set()
    : new Set(selectable.map(r => r.id)));
  const toggleOne    = id => setCheckedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // ── Totals ────────────────────────────────────────────────
  const totalAll     = filtered.reduce((s, r) => s + (r.left_to_pay || 0), 0);
  const totalOrdered = filtered.filter(r => computePaymentStatus(r) === 'in_pagamento').reduce((s, r) => s + (r.left_to_pay || 0), 0);
  const totalByResp  = Object.fromEntries(
    responsibles.map(r => [r.value, filtered.filter(i => respEq(i.responsible, r.value)).reduce((s, i) => s + (i.left_to_pay || 0), 0)])
  );

  // ── Checked totals (for confirm dialog) ──────────────────
  const checkedRows      = rows.filter(r => checkedIds.has(r.id));
  const checkedTotal     = checkedRows.reduce((s, r) => s + (r.left_to_pay || 0), 0);
  const checkedByResp    = responsibles
    .map(r => ({ ...r, rows: checkedRows.filter(row => respEq(row.responsible, r.value)) }))
    .map(r => ({ ...r, total: r.rows.reduce((s, row) => s + (row.left_to_pay || 0), 0) }))
    .filter(r => r.rows.length > 0);
  const checkedHasRejected = checkedRows.some(r => r.status === 'Rejected');

  // ── Send email (after confirm) ────────────────────────────
  async function sendEmail() {
    setSending(true);
    try {
      const invoiceIds = [...checkedIds];
      const r = await api.post('/api/distinta/send-email', { invoiceIds, note: sendNote.trim() || undefined });
      setCheckedIds(new Set());
      await load();
      loadBatches(); // refresh batch list so new batch appears in combobox
      setSendResult(r.data);  // stay in modal, show result view
    } catch (e) {
      alert(t('common.error') + ': ' + (e.response?.data?.error || e.message));
      setConfirmSend(false);
    } finally { setSending(false); }
  }

  // ── XLSX export ───────────────────────────────────────────
  async function handleExport() {
    setExporting(true);
    try {
      const wsData = [
        [t('distinta.xlsSupplier'), t('distinta.xlsProtocol'), t('distinta.xlsInvNumber'), t('distinta.xlsInvDate'), t('distinta.xlsDueDate'),
         t('distinta.xlsTotal'), t('distinta.xlsAlreadyPaid'), t('distinta.xlsLeftToPay'),
         t('distinta.xlsPayMethod'), t('distinta.xlsIban'), t('distinta.xlsReference'),
         t('distinta.category'), t('distinta.xlsDelegate'), t('distinta.xlsPayStatus'), t('distinta.xlsPayDate'), t('distinta.xlsNotes'),
         t('distinta.xlsSentAt'), t('distinta.xlsBatchId')],
        ...filtered.map(r => [
          r.supplier         || '',
          r.internal_number  || '',
          r.inv_number       || '',
          fmtDate(r.inv_date),
          fmtDate(r.due_date),
          r.total            != null ? Number(r.total)        : '',
          r.already_paid     != null ? Number(r.already_paid) : '',
          r.left_to_pay      != null ? Number(r.left_to_pay)  : '',
          r.payment_method   || '',
          r.bank_account     || '',
          r.pay_reference    || '',
          r.cost_type        || '',
          r.responsible      || '',
          PAGAMENTO_CFG[computePaymentStatus(r)]?.label || computePaymentStatus(r),
          fmtDate(r.payment_date),
          r.remarks          || '',
          r.distinta_sent_at ? fmtDT(r.distinta_sent_at) : '',
          r.distinta_batch_id || '',
        ]),
        ['', '', '', '', t('distinta.xlsTotalLabel'), totalAll, '', '', '', '', '', '', '', '', '', '', ''],
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [
        { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 16 }, { wch: 26 }, { wch: 22 },
        { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 30 },
        { wch: 18 }, { wch: 20 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, t('distinta.xlsSheetName'));
      const today = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `distinta_pagamenti_${today}.xlsx`);
    } catch (e) {
      alert(t('distinta.exportError') + ': ' + e.message);
    } finally { setExporting(false); }
  }

  const hasActiveFilters = filterResp || filterSearch || filterSent || filterPagamento || filterCat || filterBatch;

  return (
    <div style={S.page}>

      {/* Header */}
      <div style={S.header}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h1 style={S.title}>{t('distinta.title')}</h1>
          {lastImport && (
            <span style={{ fontSize: 11, color: '#9a9490', fontFamily: 'sans-serif', letterSpacing: 0.1 }}>
              🔄 {t('distinta.lastSync')}: {new Date(lastImport).toLocaleString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={S.exportBtn} onClick={handleExport} disabled={exporting}>
            {exporting ? '⏳' : `📥 ${t('distinta.exportXlsx')}`}
          </button>
          {['admin','supervisor'].includes(user.role) && (
            <button
              style={{ ...S.primaryBtn, opacity: checkedIds.size === 0 ? 0.5 : 1 }}
              onClick={() => setConfirmSend(true)}
              disabled={sending || checkedIds.size === 0}
              title={checkedIds.size === 0 ? t('distinta.selectMin') : ''}
            >
              {sending ? `⏳ ${t('distinta.sending')}` : `✅ ${t('distinta.confirmSend')} (${checkedIds.size})`}
            </button>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ ...S.kpiGrid, gridTemplateColumns: 'repeat(3,1fr)' }}>
        <KpiCard label={t('distinta.total')} value={fmtCur(totalAll)}     color="#1c2b3a" bg="#f4f3f1" />
        <KpiCard label={t('distinta.selectedForPayment')} value={fmtCur(checkedTotal)} color={checkedRows.length > 0 ? '#fff' : '#888'} bg={checkedRows.length > 0 ? '#2e7d52' : '#e2e0dd'} labelColor={checkedRows.length > 0 ? 'rgba(255,255,255,0.8)' : undefined} />
        <KpiCard label={t('distinta.ordersInProgress')}  value={fmtCur(totalOrdered)} color="#1a6fa3" bg="#e8f0fe" />
      </div>

      {/* Filters */}
      <div style={S.filters}>
        <input
          style={S.input}
          placeholder={t('distinta.search')}
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
        />
        {['admin', 'supervisor', 'controller'].includes(user.role) && (
          <select style={S.select} value={filterResp} onChange={e => setFilterResp(e.target.value)}>
            <option value="">{t('distinta.allResponsibles')}</option>
            {responsibles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            <option value="NONE">— {t('distinta.noResponsible')}</option>
          </select>
        )}
        <select style={S.select} value={filterSent} onChange={e => setFilterSent(e.target.value)}>
          <option value="">{t('distinta.sentAll')}</option>
          <option value="sent">✉ {t('distinta.sentYes')}</option>
          <option value="not_sent">⬜ {t('distinta.sentNo')}</option>
        </select>
        {/* Batch combobox filter */}
        <div style={{ position: 'relative' }}>
          <input
            style={{ ...S.select, minWidth: 300, paddingRight: filterBatch ? 26 : 8 }}
            placeholder={t('distinta.batchAll')}
            value={filterBatch
              ? formatBatchLabel(batches.find(b => b.batch_id === filterBatch))
              : batchQuery}
            readOnly={!!filterBatch}
            onChange={e => { setBatchQuery(e.target.value); setBatchOpen(true); }}
            onFocus={() => { if (!filterBatch) setBatchOpen(true); }}
            onBlur={() => setTimeout(() => setBatchOpen(false), 150)}
          />
          {filterBatch && (
            <button
              style={S.clearBatchBtn}
              onClick={() => { setFilterBatch(''); setBatchQuery(''); }}
              title={t('distinta.clearBatch')}
            >✕</button>
          )}
          {batchOpen && !filterBatch && (
            <div style={S.batchDropdown}>
              {batches.length === 0 ? (
                <div style={{ padding: 12, color: '#aaa', fontSize: 12 }}>{t('distinta.noBatches')}</div>
              ) : (
                batches
                  .filter(b => {
                    if (!batchQuery) return true;
                    const q = batchQuery.toLowerCase();
                    return (b.batch_id || '').toLowerCase().includes(q)
                        || formatBatchDate(b.sent_at).toLowerCase().includes(q);
                  })
                  .slice(0, 50)
                  .map(b => (
                    <div
                      key={b.batch_id}
                      style={S.batchRow}
                      onMouseDown={() => {
                        setFilterBatch(b.batch_id);
                        setBatchOpen(false);
                        setBatchQuery('');
                      }}
                    >
                      <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1c2b3a' }}>{b.batch_id}</span>
                      <span style={{ color: '#7a7571', marginLeft: 6 }}>· {formatBatchDate(b.sent_at)}</span>
                      <span style={{ color: '#7a7571', marginLeft: 6 }}>· {b.count} {t('distinta.fatture')}</span>
                      <span style={{ fontWeight: 700, color: '#1c2b3a', marginLeft: 'auto' }}>{fmtCur(b.total)}</span>
                    </div>
                  ))
              )}
            </div>
          )}
        </div>
        <select style={S.select} value={filterPagamento} onChange={e => setFilterPagamento(e.target.value)}>
          <option value="">{t('distinta.paymentAll')}</option>
          <option value="da_pagare">⬜ {t('payment.da_pagare')}</option>
          <option value="inviato">✉ {t('payment.inviato')}</option>
          <option value="in_pagamento">🟠 {t('payment.in_pagamento')}</option>
          <option value="pagato">✅ {t('payment.pagato')}</option>
          <option value="parziale">🟡 {t('payment.parziale')}</option>
        </select>
        <select style={S.select} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="">{t('distinta.allCategories')}</option>
          {[...new Set(rows.map(r => r.cost_type).filter(Boolean))].sort().map(ct =>
            <option key={ct} value={ct}>{ct}</option>
          )}
        </select>
        {hasActiveFilters && (
          <button style={S.clearBtn} onClick={() => {
            setFilterResp(''); setFilterSearch(''); setFilterSent(''); setFilterPagamento(''); setFilterCat('');
            setFilterBatch(''); setBatchQuery('');
          }}>
            ✕ {t('distinta.reset')}
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#7a7571', alignSelf: 'center' }}>
          {filtered.length} {t('distinta.invoiceCount')}
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div style={S.center}>{t('common.loading')}</div>
      ) : filtered.length === 0 ? (
        <div style={S.center}>{t('distinta.empty')}</div>
      ) : (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr style={S.headerRow}>
                <th style={{ ...S.th, width: 56, userSelect: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
                      onChange={toggleAll}
                      title={t('distinta.selectAll')}
                      style={{ width: 18, height: 18, cursor: 'pointer', flexShrink: 0 }}
                    />
                    <span
                      onClick={() => onSort('selectable')}
                      title={t('distinta.sortSelect')}
                      style={{ cursor: 'pointer', lineHeight: 1 }}
                    >{sortIcon('selectable')}</span>
                  </div>
                </th>
                <th style={{ ...S.th, cursor: 'pointer', userSelect: 'none' }} onClick={() => onSort('supplier')}>
                  {t('distinta.supplier')}{sortIcon('supplier')}
                </th>
                <th style={{ ...S.th, cursor: 'pointer', userSelect: 'none' }} onClick={() => onSort('internal_number')}>
                  {t('distinta.protocol')}{sortIcon('internal_number')}
                </th>
                <th style={{ ...S.th, cursor: 'pointer', userSelect: 'none' }} onClick={() => onSort('inv_number')}>
                  {t('distinta.invNumber')}{sortIcon('inv_number')}
                </th>
                <th style={{ ...S.th, cursor: 'pointer', userSelect: 'none' }} onClick={() => onSort('due_date')}>
                  {t('distinta.dueDate')}{sortIcon('due_date')}
                </th>
                <th style={{ ...S.th, cursor: 'pointer', userSelect: 'none' }} onClick={() => onSort('total')}>
                  {t('distinta.totalCol')}{sortIcon('total')}
                </th>
                <th style={{ ...S.th, cursor: 'pointer', userSelect: 'none' }} onClick={() => onSort('left_to_pay')}>
                  {t('distinta.leftToPay')}{sortIcon('left_to_pay')}
                </th>
                <th style={{ ...S.th, cursor: 'pointer', userSelect: 'none' }} onClick={() => onSort('cost_type')}>
                  {t('distinta.category')}{sortIcon('cost_type')}
                </th>
                {['admin', 'supervisor', 'controller'].includes(user.role) && (
                  <th style={{ ...S.th, cursor: 'pointer', userSelect: 'none' }} onClick={() => onSort('responsible')}>
                    {t('distinta.delegate')}{sortIcon('responsible')}
                  </th>
                )}
                <th style={{ ...S.th, cursor: 'pointer', userSelect: 'none' }} onClick={() => onSort('payment_status')}>
                  {t('distinta.paymentCol')}{sortIcon('payment_status')}
                </th>
                <th style={{ ...S.th, cursor: 'pointer', userSelect: 'none' }} onClick={() => onSort('distinta_sent_at')}>
                  {t('distinta.sentAt')}{sortIcon('distinta_sent_at')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const overdue = isOverdue(r.due_date);
                const dueSoon = isDueSoon(r.due_date);
                return (
                  <tr
                    key={r.id}
                    style={{ ...S.row, cursor: 'pointer', background: checkedIds.has(r.id) ? '#f0f7ff' : undefined }}
                    onClick={() => setSelected(r.id)}
                  >
                    <td style={{ ...S.td, textAlign: 'center', width: 36 }} onClick={e => e.stopPropagation()}>
                      {isSelectable(r) ? (
                        <input
                          type="checkbox"
                          checked={checkedIds.has(r.id)}
                          onChange={() => toggleOne(r.id)}
                          style={{ width: 18, height: 18, cursor: 'pointer' }}
                        />
                      ) : null}
                    </td>
                    <td style={S.td}>{r.supplier || '—'}</td>
                    <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12 }}>{r.internal_number || '—'}</td>
                    <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12 }}>{r.inv_number || '—'}</td>
                    <td style={{ ...S.td, color: overdue ? '#c0392b' : dueSoon ? '#c77d3a' : undefined, fontWeight: (overdue || dueSoon) ? 600 : undefined }}>
                      {fmtDate(r.due_date)}
                      {overdue && <span style={{ marginLeft: 4, fontSize: 12, color: '#c0392b' }}>⚠</span>}
                      {dueSoon && !overdue && <span style={{ marginLeft: 4, fontSize: 12, color: '#c77d3a' }}>⚠</span>}
                    </td>
                    <td style={{ ...S.td, fontWeight: 600 }}>{fmtCur(r.total)}</td>
                    <td style={{ ...S.td, fontWeight: 700 }}>{fmtCur(r.left_to_pay)}</td>
                    <td style={{ ...S.td, fontSize: 11, color: '#5a5551' }}>
                      {r.category_id && r.responsible ? (r.cost_type || '—') : '—'}
                    </td>
                    {['admin', 'supervisor', 'controller'].includes(user.role) && (
                      <td style={S.td}>
                        <span style={{ ...S.badge, background: responsibles.find(x => (x.value || '').toLowerCase() === (r.responsible || '').toLowerCase())?.color || '#888', color: '#fff' }}>
                          {getDelegatoLabel(r.responsible, responsibles) || '—'}
                        </span>
                      </td>
                    )}
                    <td style={S.td}>
                      {(() => {
                        const state = computePaymentStatus(r);
                        const cfg   = PAGAMENTO_CFG[state] || { bg: '#f4f3f1', color: '#aaa', label: state };
                        return <span title={r.payment_status ? t('distinta.manualStatus') : undefined} style={{ ...S.badge, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>;
                      })()}
                    </td>
                    <td style={S.td}>
                      {r.distinta_sent_at ? (
                        <span title={`${t('distinta.sentOn')} ${fmtDT(r.distinta_sent_at)}`}
                          style={{ ...S.badge, background: '#e8f0fb', color: '#1a4fa3' }}>
                          ✉ {t('distinta.sentYesShort')}
                        </span>
                      ) : (
                        <span style={{ color: '#ccc', fontSize: 12 }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer totals */}
      {!loading && filtered.length > 0 && (
        <div style={S.footer}>
          <span style={{ fontWeight: 600 }}>{t('distinta.totalCol')} ({filtered.length} {t('distinta.invoiceCount')})</span>
          <span style={{ fontSize: 22, fontWeight: 700 }}>{fmtCur(totalAll)}</span>
        </div>
      )}

      {/* Confirm / Result send dialog */}
      {(confirmSend || !!sendResult) && (
        <div style={S.overlay}>
          <div style={{ ...S.confirmModal, overflow: 'hidden' }}>

            {/* Header strip */}
            <div style={{ background: '#7a4a1e', padding: '16px 20px', borderRadius: '8px 8px 0 0', margin: '-24px -24px 16px -24px' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', fontFamily: 'sans-serif' }}>📧 {t('distinta.title')}</div>
              <div style={{ fontSize: 12, color: '#e8c99a', marginTop: 4, fontFamily: 'sans-serif' }}>
                {sendResult ? t('distinta.sendSuccess') : t('distinta.confirmSendTitle')}
              </div>
            </div>

            {!sendResult ? (
              <>
                <div style={{ fontSize: 13, color: '#5a5551', marginBottom: 16, fontFamily: 'sans-serif', lineHeight: 1.5 }}>
                  {t('distinta.willInclude')} <strong>{checkedIds.size} {t('distinta.selectedInvoices')}</strong>.
                  {t('distinta.batchNote')}
                </div>

                {/* Summary box */}
                <div style={{ background: '#fef3e8', border: '1px solid #e8c99a', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontFamily: 'sans-serif' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#7a4a1e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('distinta.summary')}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#5a5551' }}>{t('distinta.selectedCount')}</span>
                      <span style={{ fontWeight: 700, color: '#1c2b3a' }}>{checkedIds.size}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, borderTop: '1px solid #e8c99a', paddingTop: 6, marginTop: 2 }}>
                      <span style={{ color: '#000', fontWeight: 700 }}>{t('distinta.total')}</span>
                      <span style={{ fontWeight: 800, color: '#000', fontSize: 15 }}>{fmtCur(checkedTotal)}</span>
                    </div>
                    {checkedByResp.map(r => (
                      <div key={r.value} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: '#5a5551' }}>
                          <span style={{ display:'inline-block', width:7, height:7, borderRadius:'50%', background: r.color, marginRight:5, verticalAlign:'middle' }}/>
                          {r.label}
                          {r.email && <span style={{ color: '#7a7571', fontWeight: 400 }}> — {r.email}</span>}
                          {' '}({r.rows.length})
                        </span>
                        <span style={{ color: '#5a5551', fontWeight: 600 }}>{fmtCur(r.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Note */}
                {(() => {
                  const noteRequired = checkedHasRejected;
                  const noteEmpty    = !sendNote.trim();
                  const noteInvalid  = noteRequired && noteEmpty;
                  return (
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: noteInvalid ? '#c0392b' : '#7a7571', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>
                        {t('distinta.notes')} {noteRequired ? <span style={{ color: '#c0392b' }}>* {t('distinta.noteRequired')}</span> : t('distinta.noteOptional')}
                      </label>
                      <textarea
                        value={sendNote}
                        onChange={e => setSendNote(e.target.value)}
                        placeholder={noteRequired ? t('distinta.notePlaceholderRequired') : t('distinta.notePlaceholder')}
                        rows={2}
                        style={{ width: '100%', borderRadius: 6, border: `1px solid ${noteInvalid ? '#c0392b' : '#e2e0dd'}`, padding: '8px 10px', fontSize: 13, resize: 'vertical', fontFamily: 'sans-serif', outline: 'none', boxSizing: 'border-box', color: '#2a2421' }}
                      />
                      {noteInvalid && <div style={{ fontSize: 11, color: '#c0392b', marginTop: 4 }}>⚠ {t('distinta.noteRequiredWarning')}</div>}
                    </div>
                  );
                })()}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button style={S.cancelBtn} onClick={() => { setConfirmSend(false); setSendNote(''); }}>
                    ✕ {t('distinta.cancelSend')}
                  </button>
                  <button style={{ ...S.primaryBtn, opacity: (sending || (checkedHasRejected && !sendNote.trim())) ? 0.6 : 1 }} onClick={sendEmail} disabled={sending || (checkedHasRejected && !sendNote.trim())}>
                    {sending ? `⏳ ${t('distinta.sending')}` : `✅ ${t('distinta.confirmSend')}`}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Result view */}
                <div style={{ background: '#e8f5ec', border: '1px solid #b8dfc8', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontFamily: 'sans-serif' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#2e7d52', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>{t('distinta.sendResultTitle')}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color: '#5a5551' }}>✓ {t('distinta.emailSentCount')}</span>
                    <span style={{ fontWeight: 700, color: '#2e7d52' }}>{sendResult.count}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#7a7571' }}>Batch ID</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#1c2b3a' }}>{sendResult.batchId}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button style={S.primaryBtn} onClick={() => { setConfirmSend(false); setSendResult(null); setSendNote(''); }}>{t('common.close')}</button>
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

function KpiCard({ label, value, color, bg, labelColor }) {
  return (
    <div style={{ background: bg, borderRadius: 8, padding: '14px 18px' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: 'sans-serif' }}>{value}</div>
      <div style={{ fontSize: 12, color: labelColor || '#7a7571', marginTop: 4, fontFamily: 'sans-serif' }}>{label}</div>
    </div>
  );
}

const S = {
  page:         { fontFamily: 'sans-serif' },
  header:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title:        { margin: 0, fontSize: 22, fontWeight: 700, color: '#1c2b3a' },
  kpiGrid:      { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 },
  filters:      { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' },
  input:        { padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e0dd', fontSize: 13, flex: '1 1 200px', outline: 'none' },
  select:       { padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e0dd', fontSize: 13, background: '#fff', cursor: 'pointer' },
  clearBtn:     { padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e0dd', background: '#fff', color: '#c0392b', cursor: 'pointer', fontSize: 12 },
  batchDropdown: {
    position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50,
    background: '#fff', border: '1px solid #e2e0dd', borderRadius: 6,
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxHeight: 320, overflowY: 'auto',
    minWidth: 420,
  },
  batchRow: {
    display: 'flex', alignItems: 'center', padding: '8px 12px', fontSize: 12,
    fontFamily: 'sans-serif', cursor: 'pointer', borderBottom: '1px solid #f4f3f1',
    whiteSpace: 'nowrap',
  },
  clearBatchBtn: {
    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
    background: 'transparent', border: 'none', color: '#7a7571', cursor: 'pointer',
    fontSize: 14, padding: '2px 6px', lineHeight: 1,
  },
  cancelBtn:    { padding: '8px 16px', borderRadius: 6, border: '1px solid #e2e0dd', background: '#fff', color: '#c0392b', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  tableWrap:    { background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflowX: 'auto', marginBottom: 12 },
  table:        { width: '100%', minWidth: 1300, borderCollapse: 'collapse' },
  headerRow:    { background: '#f4f3f1' },
  th:           { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#7a7571', textTransform: 'uppercase' },
  row:          { borderBottom: '1px solid #f4f3f1' },
  td:           { padding: '11px 14px', fontSize: 13, color: '#2a2421' },
  badge:        { display: 'inline-block', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600 },
  poSelect:     { padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e0dd', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  footer:       { background: '#1c2b3a', color: '#fff', borderRadius: 8, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  primaryBtn:   { padding: '9px 18px', borderRadius: 8, border: 'none', background: '#c77d3a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  exportBtn:    { padding: '9px 18px', borderRadius: 8, border: '1px solid #1c2b3a', background: '#fff', color: '#1c2b3a', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  center:       { padding: 40, textAlign: 'center', color: '#888' },
  overlay:      { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  confirmModal: { background: '#fff', borderRadius: 12, width: '100%', maxWidth: 440, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
};

export default Distinta;
