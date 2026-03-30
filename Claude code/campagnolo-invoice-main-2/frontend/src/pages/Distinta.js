// ── Distinta.js ───────────────────────────────────────────────
import React, { useEffect, useState, useCallback } from 'react';
import api from '../utils/api';
import { useLang } from '../hooks/useLang';
import { useAuth } from '../hooks/useAuth';
import * as XLSX from 'xlsx';
import InvoiceModal from '../components/InvoiceModal';

const fmtCur  = n => n != null ? `€ ${Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` : '—';
const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '—';
const fmtDT   = d => d ? new Date(d).toLocaleString('it-IT') : '—';

function isDueSoon(due) {
  if (!due) return false;
  const diff = (new Date(due) - new Date()) / 86400000;
  return diff >= 0 && diff <= 7;
}

function isOverdue(due) {
  if (!due) return false;
  return new Date(due) < new Date();
}

const PAYMENT_ORDER_OPTIONS = ['To Be Paid', 'Payment Ordered', 'Paid'];
const PAYMENT_ORDER_COLORS  = {
  'To Be Paid':      { bg: '#fef3e8', color: '#c77d3a' },
  'Payment Ordered': { bg: '#e8f0fe', color: '#1a6fa3' },
  'Paid':            { bg: '#e8f5ec', color: '#2e7d52' },
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

  const [rows,        setRows]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [sending,     setSending]     = useState(false);
  const [exporting,   setExporting]   = useState(false);
  const [updatingId,  setUpdatingId]  = useState(null);
  const [selected,    setSelected]    = useState(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [checkedIds,  setCheckedIds]  = useState(new Set());

  const [filterResp,   setFilterResp]   = useState('');
  const [filterOrder,  setFilterOrder]  = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterSent,   setFilterSent]   = useState('');
  const [prefsLoaded,  setPrefsLoaded]  = useState(false);
  const [sortProto,    setSortProto]    = useState(null); // 'asc' | 'desc' | null
  const [assignable,   setAssignable]   = useState([]);

  const ROLE_COLORS_D = { controller:'#2e7d52', revisore:'#c77d3a', admin:'#1c2b3a', supervisor:'#1a6fa3', delegato:'#5a4a8a' };
  const nameRoleMap   = assignable.reduce((acc, u) => { acc[u.name] = u.role; return acc; }, {});

  // Ob zagonu: preberi shranjene filtre
  useEffect(() => {
    if (!user?.email) return;
    const p = loadDistintaPrefs(user.email);
    if (p) {
      if (p.filterResp   !== undefined) setFilterResp(p.filterResp);
      if (p.filterOrder  !== undefined) setFilterOrder(p.filterOrder);
      if (p.filterSearch !== undefined) setFilterSearch(p.filterSearch);
      if (p.filterSent   !== undefined) setFilterSent(p.filterSent);
    }
    setPrefsLoaded(true);
  }, [user?.email]);

  // Ob vsaki spremembi: shrani filtre
  useEffect(() => {
    if (!user?.email || !prefsLoaded) return;
    saveDistintaPrefs(user.email, { filterResp, filterOrder, filterSearch, filterSent });
  }, [filterResp, filterOrder, filterSearch, filterSent, user?.email, prefsLoaded]);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/distinta')
      .then(r => setRows(r.data.data || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Naloži seznam controller + revisore za filtre in KPI
  useEffect(() => {
    api.get('/api/users/assignable').then(r => setAssignable(r.data.data || [])).catch(() => {});
  }, []);

  // ── Filtered rows ─────────────────────────────────────────
  const filtered = rows.filter(r => {
    if (filterResp === 'NONE') { if (r.responsible) return false; }
    else if (filterResp && r.responsible !== filterResp) return false;
    if (filterOrder  && r.payment_order !== filterOrder) return false;
    if (filterSent === 'sent'     && !r.distinta_sent_at)  return false;
    if (filterSent === 'not_sent' &&  r.distinta_sent_at)  return false;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      if (!r.supplier?.toLowerCase().includes(q) && !r.inv_number?.toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    if (!sortProto) return 0;
    const va = a.internal_number || '', vb = b.internal_number || '';
    return sortProto === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  // ── Checkbox helpers ──────────────────────────────────────
  const selectable   = filtered.filter(r => !r.distinta_sent_at);
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
  const totalOrdered = filtered.filter(r => r.payment_order === 'Payment Ordered').reduce((s, r) => s + (r.left_to_pay || 0), 0);
  // KPI per delegato (dinamico)
  const totalsByUser = assignable.map(u => ({
    name:  u.name,
    role:  u.role,
    total: filtered.filter(r => r.responsible === u.name).reduce((s, r) => s + (r.left_to_pay || 0), 0),
  }));

  // ── Update payment order ──────────────────────────────────
  async function updatePaymentOrder(id, paymentOrder) {
    setUpdatingId(id);
    try {
      await api.put(`/api/invoices/${id}/payment`, { paymentOrder });
      setRows(prev => prev.map(r => r.id === id ? { ...r, payment_order: paymentOrder } : r));
    } catch (e) {
      alert('Errore: ' + (e.response?.data?.error || e.message));
    } finally { setUpdatingId(null); }
  }

  // ── Send email (after confirm) ────────────────────────────
  async function sendEmail() {
    setConfirmSend(false);
    setSending(true);
    try {
      const invoiceIds = [...checkedIds];
      const r = await api.post('/api/distinta/send-email', { invoiceIds });
      setCheckedIds(new Set());
      await load();
      alert(`✅ Email inviata! Fatture incluse: ${r.data.count} (Batch: ${r.data.batchId})`);
    } catch (e) {
      alert('Errore: ' + (e.response?.data?.error || e.message));
    } finally { setSending(false); }
  }

  // ── XLSX export ───────────────────────────────────────────
  async function handleExport() {
    setExporting(true);
    try {
      const wsData = [
        ['Fornitore', 'Protocollo', 'N. Fattura', 'Data Fattura', 'Scadenza', 'Totale', 'Da Pagare',
         'IBAN', 'Riferimento', 'Delegato', 'Ordine Pagamento', 'Data Pagamento', 'Note',
         'Inviato', 'Batch ID'],
        ...filtered.map(r => [
          r.supplier         || '',
          r.internal_number  || '',
          r.inv_number       || '',
          fmtDate(r.inv_date),
          fmtDate(r.due_date),
          r.total            != null ? Number(r.total)       : '',
          r.left_to_pay      != null ? Number(r.left_to_pay) : '',
          r.bank_account     || '',
          r.pay_reference    || '',
          r.responsible      || '',
          r.payment_order    || '',
          fmtDate(r.payment_date),
          r.remarks          || '',
          r.distinta_sent_at ? fmtDT(r.distinta_sent_at) : '',
          r.distinta_batch_id || '',
        ]),
        ['', '', '', 'TOTALE', '', totalAll, '', '', '', '', '', '', '', ''],
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [
        { wch: 30 }, { wch: 16 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 26 }, { wch: 22 },
        { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 30 },
        { wch: 18 }, { wch: 16 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Distinta Pagamenti');
      const today = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `distinta_pagamenti_${today}.xlsx`);
    } catch (e) {
      alert('Errore esportazione: ' + e.message);
    } finally { setExporting(false); }
  }

  const hasActiveFilters = filterResp || filterOrder || filterSearch || filterSent;

  return (
    <div style={S.page}>

      {/* Header */}
      <div style={S.header}>
        <h1 style={S.title}>{t('distinta.title')}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={S.exportBtn} onClick={handleExport} disabled={exporting}>
            {exporting ? '⏳' : '📥 Esporta XLSX'}
          </button>
          {user.role === 'admin' && (
            <button
              style={{ ...S.primaryBtn, opacity: checkedIds.size === 0 ? 0.5 : 1 }}
              onClick={() => setConfirmSend(true)}
              disabled={sending || checkedIds.size === 0}
              title={checkedIds.size === 0 ? 'Seleziona almeno una fattura' : ''}
            >
              {sending ? '⏳ Invio...' : `📧 Invia (${checkedIds.size})`}
            </button>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div style={S.kpiGrid}>
        <KpiCard label="Totale da pagare" value={fmtCur(totalAll)}     color="#1c2b3a" bg="#f4f3f1" />
        {totalsByUser.map(u => {
          const rc = { controller:'#2e7d52', revisore:'#c77d3a', admin:'#1c2b3a', supervisor:'#1a6fa3', delegato:'#5a4a8a' };
          const color = rc[u.role] || '#888';
          const bgMap = { controller:'#e8f5ec', revisore:'#fef3e8', supervisor:'#e8f0fe', delegato:'#f0eef8' };
          return <KpiCard key={u.name} label={u.name} value={fmtCur(u.total)} color={color} bg={bgMap[u.role]||'#f4f3f1'} />;
        })}
        <KpiCard label="Ordini in corso"  value={fmtCur(totalOrdered)} color="#1a6fa3" bg="#e8f0fe" />
      </div>

      {/* Filters */}
      <div style={S.filters}>
        <input
          style={S.input}
          placeholder="Cerca fornitore, n. fattura..."
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
        />
        {['admin', 'supervisor', 'controller'].includes(user.role) && (
          <select style={S.select} value={filterResp} onChange={e => setFilterResp(e.target.value)}>
            <option value="">Tutti i delegati</option>
            {assignable.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
            <option value="NONE">— Nessun delegato</option>
          </select>
        )}
        <select style={S.select} value={filterOrder} onChange={e => setFilterOrder(e.target.value)}>
          <option value="">Tutti gli stati</option>
          {PAYMENT_ORDER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select style={S.select} value={filterSent} onChange={e => setFilterSent(e.target.value)}>
          <option value="">Inviato: tutti</option>
          <option value="sent">✉ Inviato</option>
          <option value="not_sent">⬜ Non inviato</option>
        </select>
        {hasActiveFilters && (
          <button style={S.clearBtn} onClick={() => {
            setFilterResp(''); setFilterOrder('');
            setFilterSearch(''); setFilterSent('');
          }}>
            ✕ Reset
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#7a7571', alignSelf: 'center' }}>
          {filtered.length} fatture
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
                <th style={{ ...S.th, width: 36, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
                    onChange={toggleAll}
                    title="Seleziona tutti"
                  />
                </th>
                <th style={S.th}>Fornitore</th>
                <th
                  style={{ ...S.th, cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => setSortProto(s => s === 'asc' ? 'desc' : s === 'desc' ? null : 'asc')}
                >
                  Protocollo{' '}
                  <span style={{ color: sortProto ? '#1c2b3a' : '#ccc' }}>
                    {sortProto === 'asc' ? '▲' : sortProto === 'desc' ? '▼' : '▲▼'}
                  </span>
                </th>
                <th style={S.th}>N. Fattura</th>
                <th style={S.th}>Scadenza</th>
                <th style={S.th}>Da Pagare</th>
                <th style={S.th}>IBAN</th>
                <th style={S.th}>Riferimento</th>
                {['admin', 'supervisor', 'controller'].includes(user.role) && <th style={S.th}>Delegato</th>}
                <th style={S.th}>Ordine Pagamento</th>
                <th style={S.th}>Inviato</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const overdue = isOverdue(r.due_date);
                const dueSoon = isDueSoon(r.due_date);
                const poStyle = PAYMENT_ORDER_COLORS[r.payment_order] || {};
                return (
                  <tr
                    key={r.id}
                    style={{ ...S.row, cursor: 'pointer', background: checkedIds.has(r.id) ? '#f0f7ff' : undefined }}
                    onClick={() => setSelected(r.id)}
                  >
                    <td style={{ ...S.td, textAlign: 'center', width: 36 }} onClick={e => e.stopPropagation()}>
                      {!r.distinta_sent_at ? (
                        <input
                          type="checkbox"
                          checked={checkedIds.has(r.id)}
                          onChange={() => toggleOne(r.id)}
                        />
                      ) : null}
                    </td>
                    <td style={S.td}>{r.supplier || '—'}</td>
                    <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12 }}>{r.internal_number || '—'}</td>
                    <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12 }}>{r.inv_number || '—'}</td>
                    <td style={{ ...S.td, color: overdue ? '#c0392b' : dueSoon ? '#c77d3a' : undefined, fontWeight: (overdue || dueSoon) ? 600 : undefined }}>
                      {fmtDate(r.due_date)}
                      {overdue && <span style={{ marginLeft: 4, fontSize: 10, color: '#c0392b' }}>SCADUTA</span>}
                      {dueSoon && !overdue && <span style={{ marginLeft: 4, fontSize: 10, color: '#c77d3a' }}>⚠</span>}
                    </td>
                    <td style={{ ...S.td, fontWeight: 700 }}>{fmtCur(r.left_to_pay)}</td>
                    <td style={{ ...S.td, fontSize: 11, color: '#5a5551', fontFamily: 'monospace' }}>{r.bank_account || '—'}</td>
                    <td style={{ ...S.td, fontSize: 11, color: '#5a5551' }}>{r.pay_reference || '—'}</td>
                    {['admin', 'supervisor', 'controller'].includes(user.role) && (
                      <td style={S.td}>
                        <span style={{ ...S.badge, background: ROLE_COLORS_D[nameRoleMap[r.responsible]] || (r.responsible ? '#888' : '#ddd'), color: '#fff' }}>
                          {r.responsible || '—'}
                        </span>
                      </td>
                    )}
                    <td style={S.td} onClick={e => e.stopPropagation()}>
                      {user.role === 'admin' ? (
                        <select
                          style={{
                            ...S.poSelect,
                            background: poStyle.bg || '#f4f3f1',
                            color:      poStyle.color || '#1c2b3a',
                            opacity:    updatingId === r.id ? 0.5 : 1,
                          }}
                          value={r.payment_order || 'To Be Paid'}
                          disabled={updatingId === r.id}
                          onChange={e => updatePaymentOrder(r.id, e.target.value)}
                        >
                          {PAYMENT_ORDER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <span style={{ ...S.badge, background: poStyle.bg || '#f4f3f1', color: poStyle.color || '#1c2b3a' }}>
                          {r.payment_order || 'To Be Paid'}
                        </span>
                      )}
                    </td>
                    <td style={S.td}>
                      {r.distinta_sent_at ? (
                        <span title={`Batch: ${r.distinta_batch_id}\n${fmtDT(r.distinta_sent_at)}`}
                          style={{ ...S.badge, background: '#e8f5ec', color: '#2e7d52' }}>
                          ✉ Inviato
                        </span>
                      ) : (
                        <span style={{ ...S.badge, background: '#f4f3f1', color: '#aaa' }}>
                          —
                        </span>
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
          <span style={{ fontWeight: 600 }}>Totale ({filtered.length} fatture)</span>
          <span style={{ fontSize: 22, fontWeight: 700 }}>{fmtCur(totalAll)}</span>
        </div>
      )}

      {/* Confirm send dialog */}
      {confirmSend && (
        <div style={S.overlay}>
          <div style={S.confirmModal}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1c2b3a', marginBottom: 8, fontFamily: 'sans-serif' }}>
              📧 Conferma invio distinta
            </div>
            <div style={{ fontSize: 13, color: '#5a5551', marginBottom: 20, fontFamily: 'sans-serif', lineHeight: 1.5 }}>
              Verranno incluse <strong>{checkedIds.size} fatture selezionate</strong>.
              Ogni fattura riceverà un batch ID con data e ora di invio.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                style={{ ...S.cancelBtn }}
                onClick={() => setConfirmSend(false)}
              >
                ✕ Cancella invio
              </button>
              <button
                style={{ ...S.primaryBtn }}
                onClick={sendEmail}
              >
                📧 Invia
              </button>
            </div>
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

const S = {
  page:         { fontFamily: 'sans-serif' },
  header:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title:        { margin: 0, fontSize: 22, fontWeight: 700, color: '#1c2b3a' },
  kpiGrid:      { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 },
  filters:      { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' },
  input:        { padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e0dd', fontSize: 13, flex: '1 1 200px', outline: 'none' },
  select:       { padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e0dd', fontSize: 13, background: '#fff', cursor: 'pointer' },
  clearBtn:     { padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e0dd', background: '#fff', color: '#c0392b', cursor: 'pointer', fontSize: 12 },
  cancelBtn:    { padding: '8px 16px', borderRadius: 6, border: '1px solid #e2e0dd', background: '#fff', color: '#c0392b', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  tableWrap:    { background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden', marginBottom: 12 },
  table:        { width: '100%', borderCollapse: 'collapse' },
  headerRow:    { background: '#f4f3f1' },
  th:           { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#7a7571', textTransform: 'uppercase' },
  row:          { borderBottom: '1px solid #f4f3f1' },
  td:           { padding: '11px 14px', fontSize: 13, color: '#2a2421' },
  badge:        { display: 'inline-block', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600 },
  poSelect:     { padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e0dd', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  footer:       { background: '#1c2b3a', color: '#fff', borderRadius: 8, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  primaryBtn:   { padding: '9px 18px', borderRadius: 8, border: 'none', background: '#1c2b3a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  exportBtn:    { padding: '9px 18px', borderRadius: 8, border: '1px solid #1c2b3a', background: '#fff', color: '#1c2b3a', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  center:       { padding: 40, textAlign: 'center', color: '#888' },
  overlay:      { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  confirmModal: { background: '#fff', borderRadius: 12, width: '100%', maxWidth: 440, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
};

export default Distinta;
