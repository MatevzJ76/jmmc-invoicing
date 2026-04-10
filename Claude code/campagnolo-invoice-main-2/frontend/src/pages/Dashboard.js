import React, { useEffect, useState } from 'react';
import { Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale, BarElement,
} from 'chart.js';
import api from '../utils/api';
import { useLang } from '../hooks/useLang';
import { useAuth } from '../hooks/useAuth';
import { getDelegatoLabel } from '../utils/delegato';
import InvoiceModal from '../components/InvoiceModal';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const fmtCur  = n => n != null
  ? `€ ${Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2 })}`
  : '—';
const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '—';

export default function Dashboard() {
  const { t }    = useLang();
  const { user } = useAuth();
  const [stats,          setStats]          = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [selectedInvId,  setSelectedInvId]  = useState(null);
  const [responsibles,   setResponsibles]   = useState([]);
  const [rifiutate,      setRifiutate]      = useState({ count: 0, totale: 0 });

  const loadStats = () => {
    api.get('/api/dashboard/stats')
      .then(r => setStats(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
    api.get('/api/invoices/rifiutate-unresolved')
      .then(r => setRifiutate({ count: r.data?.count || 0, totale: r.data?.totale || 0 }))
      .catch(() => setRifiutate({ count: 0, totale: 0 }));
  };

  useEffect(() => {
    loadStats();
    api.get('/api/users').then(r => {
      const seen = new Set();
      const list = (r.data?.data || [])
        .filter(u => u.active)
        .map(u => ({ value: (u.responsible || u.name || '').trim(), label: u.name }))
        .filter(u => u.value && !seen.has(u.value.toLowerCase()) && seen.add(u.value.toLowerCase()));
      setResponsibles(list);
    }).catch(() => {});
  }, []);

  if (loading) return <div style={S.loading}>{t('common.loading')}</div>;
  if (!stats)  return <div style={S.error}>{t('common.error')}</div>;

  const { kpis, dueSoon, byStatus, byCostType, monthly } = stats;

  const kpiCards = [
    { label: t('dashboard.totalInv'),  value: kpis.total,              icon: '🧾', color: '#1c2b3a' },
    { label: t('dashboard.pending'),   value: kpis.pending,             icon: '⏳', color: '#c77d3a' },
    { label: t('dashboard.approved'),  value: kpis.approved,            icon: '✅', color: '#2e7d52' },
    { label: t('dashboard.toBePaid'),  value: fmtCur(kpis.pendingAmount), icon: '💳', color: '#1a6fa3' },
    {
      label: t('dashboard.rejectedUnresolved'),
      value: rifiutate.count,
      sub:   fmtCur(rifiutate.totale),
      icon:  '❌',
      color: '#c0392b',
    },
  ];

  const statusChart = {
    labels:   ['Pending', 'Approved', 'Rejected'],
    datasets: [{
      data:            [byStatus.Pending, byStatus.Approved, byStatus.Rejected],
      backgroundColor: ['#c77d3a', '#2e7d52', '#c0392b'],
      borderWidth:     0,
    }],
  };

  const costTypeLabels = Object.keys(byCostType).slice(0, 8);
  const costTypeData   = costTypeLabels.map(k => byCostType[k]);
  const costTypeChart  = {
    labels:   costTypeLabels,
    datasets: [{
      label:           t('dashboard.byCostType'),
      data:            costTypeData,
      backgroundColor: '#1c2b3a',
      borderRadius:    4,
    }],
  };

  return (
    <div>
      <h1 style={S.pageTitle}>{t('dashboard.title')}</h1>

      {/* KPI Cards */}
      <div style={S.kpiGrid}>
        {kpiCards.map((k, i) => (
          <div key={i} style={{ ...S.kpiCard, borderTop: `3px solid ${k.color}` }}>
            <div style={S.kpiIcon}>{k.icon}</div>
            <div style={S.kpiValue}>{k.value}</div>
            <div style={S.kpiLabel}>{k.label}</div>
            {k.sub && <div style={S.kpiSub}>{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={S.chartsRow}>
        <div style={{ ...S.chartCard, flex: '0 0 280px' }}>
          <h3 style={S.cardTitle}>{t('dashboard.byStatus')}</h3>
          <Doughnut data={statusChart} options={{ plugins: { legend: { position: 'bottom' } }, cutout: '65%' }} />
        </div>
        <div style={{ ...S.chartCard, flex: 1 }}>
          <h3 style={S.cardTitle}>{t('dashboard.byCostType')}</h3>
          <Bar data={costTypeChart} options={{
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: { x: { ticks: { callback: v => `€${(v/1000).toFixed(0)}k` } } },
          }} />
        </div>
      </div>

      {/* Due soon table */}
      {dueSoon.length > 0 && (
        <div style={S.tableCard}>
          <h3 style={S.cardTitle}>⚠ {t('dashboard.dueSoon')}</h3>
          <table style={S.table}>
            <thead>
              <tr>
                {['supplier','invNumber','due','total','responsible'].map(col => (
                  <th key={col} style={S.th}>{t(`invoices.${col}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dueSoon.map(inv => (
                <tr
                  key={inv.id}
                  style={S.trClickable}
                  onClick={() => setSelectedInvId(inv.id)}
                  title="Apri dettaglio fattura"
                >
                  <td style={S.td}>{inv.supplier}</td>
                  <td style={S.td}>{inv.inv_number}</td>
                  <td style={{ ...S.td, color: '#c0392b', fontWeight: 600 }}>{fmtDate(inv.due_date)}</td>
                  <td style={S.td}>{fmtCur(inv.total)}</td>
                  <td style={S.td}>
                    <span style={{ ...S.badge, background: String(inv.responsible || '').toUpperCase() === 'FEDERICO' ? '#1c2b3a' : '#c77d3a' }}>
                      {getDelegatoLabel(inv.responsible, responsibles)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invoice detail modal */}
      {selectedInvId && (
        <InvoiceModal
          invoiceId={selectedInvId}
          onClose={() => setSelectedInvId(null)}
          onRefresh={loadStats}
        />
      )}
    </div>
  );
}

const S = {
  loading:   { padding: 40, color: '#888', fontFamily: 'sans-serif' },
  error:     { padding: 40, color: '#c0392b', fontFamily: 'sans-serif' },
  pageTitle: { margin: '0 0 24px', fontSize: 22, fontWeight: 700, color: '#1c2b3a', fontFamily: 'sans-serif' },
  kpiGrid:   { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 24 },
  kpiCard: {
    background: '#fff', borderRadius: 10, padding: '20px 18px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
  },
  kpiIcon:     { fontSize: 24, marginBottom: 8 },
  kpiValue:    { fontSize: 26, fontWeight: 700, color: '#1c2b3a', fontFamily: 'sans-serif' },
  kpiLabel:    { fontSize: 13, color: '#7a7571', marginTop: 4, fontFamily: 'sans-serif' },
  kpiSub:      { fontSize: 12, color: '#c0392b', marginTop: 4, fontFamily: 'sans-serif', fontWeight: 600 },
  chartsRow:   { display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' },
  chartCard: {
    background: '#fff', borderRadius: 10, padding: '20px 18px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)', minWidth: 240,
  },
  cardTitle:   { margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#1c2b3a', fontFamily: 'sans-serif' },
  tableCard: {
    background: '#fff', borderRadius: 10, padding: '20px 18px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
  },
  table:      { width: '100%', borderCollapse: 'collapse', fontFamily: 'sans-serif' },
  th:         { padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#7a7571', textTransform: 'uppercase', borderBottom: '1px solid #e2e0dd' },
  tr:         { borderBottom: '1px solid #f4f3f1' },
  trClickable:{ borderBottom: '1px solid #f4f3f1', cursor: 'pointer', transition: 'background 0.12s' },
  td:         { padding: '10px 12px', fontSize: 13, color: '#2a2421' },
  badge:      { display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, color: '#fff', fontWeight: 600 },
};
