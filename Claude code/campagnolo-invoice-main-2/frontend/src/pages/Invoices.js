import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useLang } from '../hooks/useLang';
import { useAuth } from '../hooks/useAuth';
import InvoiceModal from '../components/InvoiceModal';
import * as XLSX from 'xlsx';

const fmtCur  = n  => n != null ? Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }) : '';
const fmtDate = d  => d ? new Date(d).toLocaleDateString('it-IT') : '';
const fmtDT   = d  => d ? new Date(d).toLocaleString('it-IT') : '';

const DEFAULT_FILTERS = { status: '', responsible: '', search: '', hasAttachment: '', distintaSent: '', pagamento: '' };
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

  const [invoices,     setInvoices]    = useState([]);
  const [count,        setCount]       = useState(0);
  const [page,         setPage]        = useState(1);
  const [limit,        setLimit]       = useState(25);
  const [loading,      setLoading]     = useState(true);
  const [importing,    setImporting]   = useState(false);
  const [importStatus, setImportStatus]= useState('');
  const [exporting,    setExporting]   = useState(false);
  const [batchingPDF,  setBatchingPDF] = useState(false);
  const [selected,     setSelected]    = useState(null);
  const [prefsLoaded,  setPrefsLoaded] = useState(false);

  const [filters,    setFilters]    = useState(DEFAULT_FILTERS);
  const [sort,       setSort]       = useState(DEFAULT_SORT);
  const [assignable, setAssignable] = useState([]);

  // ── Ob zagonu: naloži seznam assignable (controller + revisore) ──
  useEffect(() => {
    api.get('/api/users/assignable').then(r => setAssignable(r.data.data || [])).catch(() => {});
  }, []);

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
  }, [page, limit, filters, sort, prefsLoaded]);

  useEffect(() => { load(); }, [load]);

  function onLimitChange(val) {
    setLimit(Number(val));
    setPage(1);
  }

  async function handleImport() {
    setImporting(true);
    setImportStatus('Avvio import...');
    try {
      let offset = 0;
      let totalInserted = 0, totalUpdated = 0, totalErrors = 0;
      let totalInvoices = null;
      let iterations = 0;

      while (iterations < 50) {
        const { data } = await api.post('/api/invoices/import', { batchSize: 20, offset });
        totalInserted += data.inserted || 0;
        totalUpdated  += data.updated  || 0;
        totalErrors   += data.errors   || 0;
        if (data.total) totalInvoices = data.total;

        const processed = offset + 20;
        setImportStatus(`Elaborazione ${Math.min(processed, totalInvoices || processed)} / ${totalInvoices || '...'}`);

        if (!data.remaining || data.remaining === 0) break;
        offset += 20;
        iterations++;
        await new Promise(r => setTimeout(r, 300));
      }

      setImportStatus('');
      alert(`Import completato:\n• Nuove: ${totalInserted}\n• Aggiornate: ${totalUpdated}\n• Errori: ${totalErrors}`);
      load();
    } catch (err) {
      setImportStatus('');
      alert('Errore durante l\'importazione: ' + (err.response?.data?.error || err.message));
    } finally { setImporting(false); }
  }

  async function handleBatchPDF() {
    setBatchingPDF(true);
    try {
      let offset = 0;
      let totalDownloaded = 0, totalSkipped = 0, totalErrors = 0;
      let iterations = 0;

      while (iterations < 100) {
        const { data } = await api.post('/api/invoices/download-pdfs', { batchSize: 10, offset });
        totalDownloaded += data.downloaded || 0;
        totalSkipped    += data.skipped    || 0;
        totalErrors     += data.errors     || 0;

        if (data.remaining === 0 || data.processed === 0) break;
        offset += data.processed;
        iterations++;
        await new Promise(r => setTimeout(r, 500));
      }

      alert(`✅ PDF scaricati: ${totalDownloaded}\nSenza allegato: ${totalSkipped}\nErrori: ${totalErrors}`);
      load();
    } catch (err) {
      alert('Errore: ' + (err.response?.data?.error || err.message));
    } finally { setBatchingPDF(false); }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const params = { page: 1, limit: 9999, ...filters };
      const { data: res } = await api.get('/api/invoices', { params });
      const rows = res.data || [];

      if (rows.length === 0) {
        alert('Nessuna fattura da esportare.');
        return;
      }

      const wsData = [
        [
          'e-računi ID', 'Protocollo', 'N. Fattura', 'Fornitore', 'Codice Fornitore',
          'Data Fattura', 'Data Ricezione', 'Scadenza',
          'Imponibile', 'IVA', 'Totale', 'Già Pagato', 'Da Pagare',
          'Valuta', 'Metodo Pagamento', 'IBAN', 'Riferimento',
          'Categoria', 'Tipo Costo', 'Delegato', 'Anno',
          'Stato', 'Verificato', 'Verificato Da', 'Data Verifica',
          'Ordine Pagamento', 'Data Pagamento', 'Note',
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
          inv.cost_type        || '',
          inv.responsible      || '',
          inv.business_year    || '',
          inv.status           || '',
          inv.verified_flag    ? 'Sì' : 'No',
          inv.verified_by_name || '',
          fmtDate(inv.verified_at),
          inv.payment_order    || '',
          fmtDate(inv.payment_date),
          inv.remarks          || '',
        ]),
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      ws['!cols'] = [
        { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 16 },
        { wch: 12 }, { wch: 14 }, { wch: 12 },
        { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 8  }, { wch: 16 }, { wch: 24 }, { wch: 18 },
        { wch: 18 }, { wch: 16 }, { wch: 10 }, { wch: 6  },
        { wch: 10 }, { wch: 8  }, { wch: 20 }, { wch: 14 },
        { wch: 16 }, { wch: 14 }, { wch: 30 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Fatture');

      const today = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `fatture_${today}.xlsx`);

    } catch (err) {
      alert('Errore esportazione: ' + err.message);
    } finally { setExporting(false); }
  }

  function onFilter(key, val) {
    setFilters(f => ({ ...f, [key]: val }));
    setPage(1);
  }

  function onSort(field) {
    setSort(s => ({
      field,
      dir: s.field === field && s.dir === 'asc' ? 'desc' : 'asc',
    }));
    setPage(1);
  }

  const totalPages = Math.ceil(count / limit);

  const COLS = [
    { label: t('invoices.supplier'),    field: 'supplier'      },
    { label: 'Protocollo',              field: 'internal_number' },
    { label: t('invoices.invNumber'),   field: 'inv_number'    },
    { label: t('invoices.date'),        field: 'inv_date'      },
    { label: t('invoices.due'),         field: 'due_date'      },
    { label: t('invoices.total'),       field: 'total'         },
    { label: 'Saldo',                   field: 'already_paid'  },
    { label: 'Pagamento',               field: null            },
    { label: t('invoices.responsible'), field: 'responsible'   },
    { label: t('invoices.status'),      field: 'status'        },
    { label: '📎',                      field: null            },
    { label: t('invoices.verified'),    field: 'verified_flag' },
  ];

  return (
    <div>
      {/* Header */}
      <div style={S.header}>
        <h1 style={S.pageTitle}>{t('invoices.title')}</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {importing && importStatus && (
            <span style={{ fontSize: 12, color: '#7a7571', fontFamily: 'sans-serif' }}>{importStatus}</span>
          )}
          <button style={S.exportBtn} onClick={handleExport} disabled={exporting}>
            {exporting ? '⏳' : '📥 Esporta XLSX'}
          </button>
          {user.role === 'admin' && (
            <>
              <button
                style={S.pdfBtn}
                onClick={handleBatchPDF}
                disabled={batchingPDF}
                title="Scarica PDF mancanti da e-računi"
              >
                {batchingPDF ? '⏳ PDF...' : '📎 Scarica PDF'}
              </button>
              <button style={S.importBtn} onClick={handleImport} disabled={importing}>
                {importing ? '⏳ Import...' : `⬇ ${t('invoices.import')}`}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={S.filters}>
        <input
          style={S.input}
          placeholder={t('invoices.search')}
          value={filters.search}
          onChange={e => onFilter('search', e.target.value)}
        />
        <select style={S.select} value={filters.status} onChange={e => onFilter('status', e.target.value)}>
          <option value="">{t('invoices.allStatus')}</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
        </select>
        {['admin','supervisor','controller','delegato'].includes(user.role) && (
          <select style={S.select} value={filters.responsible} onChange={e => onFilter('responsible', e.target.value)}>
            <option value="">{t('invoices.allDelegates')}</option>
            {assignable.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
            <option value="NONE">— Nessun delegato</option>
          </select>
        )}
        <select style={S.select} value={filters.hasAttachment} onChange={e => onFilter('hasAttachment', e.target.value)}>
          <option value="">Tutti gli allegati</option>
          <option value="yes">📎 Allegato: Sì</option>
          <option value="no">📎 Allegato: No</option>
        </select>
        <select style={S.select} value={filters.pagamento} onChange={e => onFilter('pagamento', e.target.value)}>
          <option value="">Pagamento: tutti</option>
          <option value="da_pagare">⬜ Da pagare</option>
          <option value="inviato">✉ Inviato</option>
          <option value="in_pagamento">🟠 In pagamento</option>
          <option value="pagato">✅ Pagato</option>
          <option value="parziale">🟡 Parz. pagato</option>
        </select>
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
                {COLS.map(({ label, field }) => (
                  <th
                    key={label}
                    style={{
                      ...S.th,
                      cursor: field ? 'pointer' : 'default',
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
                      ...(field === null ? { width: 36, textAlign: 'center' } : {}),
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
                  <td style={{ ...S.td, color: isDueSoon(inv.due_date) ? '#c0392b' : undefined }}>
                    {fmtDate(inv.due_date)}
                  </td>
                  <td style={{ ...S.td, fontWeight: 600 }}>€ {fmtCur(inv.total)}</td>
                  <td style={{ ...S.td, textAlign: 'right', minWidth: 90, lineHeight: 1.6 }}>
                    {inv.already_paid > 0 && (
                      <div style={{ color: '#2e7d52', fontSize: 12 }}>✓ {fmtCur(inv.already_paid)}</div>
                    )}
                    {inv.left_to_pay > 0 && (
                      <div style={{ color: '#c0392b', fontSize: 12 }}>↑ {fmtCur(inv.left_to_pay)}</div>
                    )}
                    {!inv.already_paid && !inv.left_to_pay && (
                      <span style={{ color: '#ccc' }}>—</span>
                    )}
                  </td>
                  <td style={S.td}>
                    {(() => {
                      const hasPaid    = inv.payment_records && inv.payment_records.length > 0;
                      const alreadyPaid = Number(inv.already_paid) || 0;
                      const total       = Number(inv.total) || 0;
                      const hasInviato  = !!inv.distinta_sent_at;
                      if (hasPaid && alreadyPaid >= total) return (
                        <span title={`Pagato il ${fmtDate(inv.payment_records[0].payment_date)}`}
                          style={{ ...S.badge, background: '#e8f5ec', color: '#2e7d52' }}>
                          ✅ Pagato
                        </span>
                      );
                      if (hasPaid && alreadyPaid < total) return (
                        <span title={`Pagato: €${fmtCur(alreadyPaid)} / €${fmtCur(total)}`}
                          style={{ ...S.badge, background: '#fff8e1', color: '#b07d00' }}>
                          🟡 Parz.
                        </span>
                      );
                      if (!hasPaid && alreadyPaid > 0) return (
                        <span title={`Nalog na banki: €${fmtCur(alreadyPaid)}`}
                          style={{ ...S.badge, background: '#fff3e0', color: '#e65c00' }}>
                          🟠 In pagamento
                        </span>
                      );
                      if (hasInviato) return (
                        <span title={`Batch: ${inv.distinta_batch_id}\n${fmtDT(inv.distinta_sent_at)}`}
                          style={{ ...S.badge, background: '#e8f0fb', color: '#1a4fa3' }}>
                          ✉ Inviato
                        </span>
                      );
                      return <span style={{ ...S.badge, background: '#f4f3f1', color: '#aaa' }}>Da pagare</span>;
                    })()}
                  </td>
                  <td style={S.td}>
                    <span style={{ ...S.badge, background: (() => {
                      const u = assignable.find(a => a.name === inv.responsible);
                      const rc = { controller:'#2e7d52', revisore:'#c77d3a', admin:'#1c2b3a', supervisor:'#1a6fa3', delegato:'#5a4a8a' };
                      return u ? (rc[u.role] || '#888') : (inv.responsible ? '#888' : '#ddd');
                    })() }}>
                      {inv.responsible || '—'}
                    </span>
                  </td>
                  <td style={S.td}>
                    <StatusBadge status={inv.status} t={t} />
                  </td>
                  <td style={{ ...S.td, textAlign: 'center', padding: '11px 6px' }}>
                    <span
                      title={inv.original_pdf_id ? 'PDF disponibile' : 'PDF non disponibile'}
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
                  <td style={S.td}>
                    {inv.verified_flag
                      ? <span style={{ color: '#2e7d52', fontWeight: 700 }}>✓</span>
                      : <span style={{ color: '#bbb' }}>—</span>}
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
          <label style={S.limitLabel}>Righe per pagina:</label>
          <select style={S.limitSelect} value={limit} onChange={e => onLimitChange(e.target.value)}>
            {LIMIT_OPTIONS.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button style={S.pageBtn} disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
            <span style={S.pageInfo}>{page} / {totalPages} ({count} fatture)</span>
            <button style={S.pageBtn} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
          </div>
        )}
        {totalPages <= 1 && count > 0 && (
          <span style={S.pageInfo}>{count} fatture</span>
        )}
      </div>

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

function StatusBadge({ status, t }) {
  const colors = { Pending: '#c77d3a', Approved: '#2e7d52', Rejected: '#c0392b' };
  return (
    <span style={{ ...S.badge, background: colors[status] || '#888' }}>
      {t(`status.${status}`) || status}
    </span>
  );
}

function isDueSoon(due) {
  if (!due) return false;
  const diff = (new Date(due) - new Date()) / 86400000;
  return diff >= 0 && diff <= 7;
}

const S = {
  header:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  pageTitle:   { margin: 0, fontSize: 22, fontWeight: 700, color: '#1c2b3a', fontFamily: 'sans-serif' },
  exportBtn:   { padding: '9px 18px', borderRadius: 8, border: '1px solid #1c2b3a', background: '#fff', color: '#1c2b3a', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  pdfBtn:      { padding: '9px 18px', borderRadius: 8, border: '1px solid #2e7d52', background: '#fff', color: '#2e7d52', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  importBtn:   { padding: '9px 18px', borderRadius: 8, border: 'none', background: '#1c2b3a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  filters:     { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  input:       { padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e0dd', fontSize: 13, flex: '1 1 200px', outline: 'none' },
  select:      { padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e0dd', fontSize: 13, background: '#fff', cursor: 'pointer' },
  tableWrap:   { background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' },
  table:       { width: '100%', borderCollapse: 'collapse', fontFamily: 'sans-serif' },
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
