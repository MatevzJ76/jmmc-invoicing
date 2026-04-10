import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import { useLang } from '../hooks/useLang';
import { useAuth } from '../hooks/useAuth';
import * as XLSX from 'xlsx';

// ── Shared table styles ───────────────────────────────────────
const ST = {
  page:   { fontFamily:'sans-serif' },
  title:  { margin:'0 0 20px',fontSize:22,fontWeight:700,color:'#1c2b3a' },
  card:   { background:'#fff',borderRadius:10,boxShadow:'0 1px 4px rgba(0,0,0,0.07)',overflow:'hidden' },
  table:  { width:'100%',borderCollapse:'collapse' },
  thr:    { background:'#f4f3f1' },
  th:     { padding:'10px 14px',textAlign:'left',fontSize:11,fontWeight:600,color:'#7a7571',textTransform:'uppercase' },
  tr:     { borderBottom:'1px solid #f4f3f1' },
  td:     { padding:'10px 14px',fontSize:13,color:'#2a2421' },
  btn:    { padding:'7px 14px',borderRadius:6,border:'none',background:'#1c2b3a',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600 },
  btnSm:  { padding:'4px 10px',borderRadius:5,border:'none',background:'#f4f3f1',color:'#1c2b3a',cursor:'pointer',fontSize:12 },
  btnGrn: { padding:'4px 10px',borderRadius:5,border:'none',background:'#2e7d52',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600 },
  input:  { padding:'8px 10px',borderRadius:6,border:'1px solid #e2e0dd',fontSize:13,width:'100%',boxSizing:'border-box' },
  inputSm:{ padding:'5px 8px',borderRadius:5,border:'1px solid #e2e0dd',fontSize:12,width:'100%',boxSizing:'border-box' },
  select: { padding:'8px 10px',borderRadius:6,border:'1px solid #e2e0dd',fontSize:13,background:'#fff',width:'100%' },
  selectSm:{ padding:'5px 8px',borderRadius:5,border:'1px solid #e2e0dd',fontSize:12,background:'#fff',width:'100%' },
  row:    { display:'flex',gap:12,marginBottom:16,flexWrap:'wrap' },
  label:  { fontSize:11,fontWeight:600,color:'#7a7571',textTransform:'uppercase',marginBottom:4 },
  badge:  { display:'inline-block',padding:'2px 8px',borderRadius:12,fontSize:11,color:'#fff',fontWeight:600 },
};

// ══════════════════════════════════════════════════════════════
// CATEGORIES
// ══════════════════════════════════════════════════════════════
export function Categories() {
  const { t } = useLang();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [cats, setCats]   = useState([]);
  const [form, setForm]   = useState({ costType:'', responsible:'' });
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId]   = useState(null);
  const [editForm, setEditForm] = useState({ costType:'', responsible:'' });
  const [saving, setSaving]   = useState(false);
  const [responsibles, setResponsibles] = useState([]); // [{ value, label }]
  const [statusFilter, setStatusFilter] = useState('active'); // 'all' | 'active' | 'inactive'
  const [deleteTarget, setDeleteTarget] = useState(null); // category object pending delete
  const [deleteError,  setDeleteError]  = useState('');
  const [deleting,     setDeleting]     = useState(false);

  const load = () => api.get('/api/categories').then(r=>setCats(r.data.data||[])).finally(()=>setLoading(false));
  useEffect(()=>{ load(); }, []);

  useEffect(() => {
    api.get('/api/users').then(r => {
      const seen = new Set();
      const list = (r.data.data || [])
        .filter(u => u.active)
        .map(u => ({
          value: (u.responsible || u.name || '').trim(),
          label: u.name,
        }))
        .filter(u => u.value && !seen.has(u.value.toLowerCase()) && seen.add(u.value.toLowerCase()))
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((u, i) => ({ ...u, color: ['#1c2b3a','#c77d3a','#2e7d52','#5a4a8a','#1a6fa3'][i % 5] }));
      setResponsibles(list);
      if (list.length > 0) {
        setForm(f => f.responsible ? f : { ...f, responsible: list[0].value });
      }
    }).catch(() => {});
  }, []); // eslint-disable-line

  async function save() {
    try {
      await api.post('/api/categories',{ costType:form.costType, responsible:form.responsible });
      setForm({ costType:'', responsible: responsibles[0]?.value || '' });
      setAdding(false);
      load();
    } catch(e) { alert(e.response?.data?.error||e.message); }
  }

  function startEdit(c) {
    setEditId(c.id);
    // Preserve the saved responsible exactly — never substitute another value
    setEditForm({ costType: c.cost_type, responsible: c.responsible || '' });
  }

  async function saveEdit(id) {
    setSaving(true);
    try {
      await api.put(`/api/categories/${id}`, { costType: editForm.costType, responsible: editForm.responsible });
      setEditId(null);
      load();
    } catch(e) { alert(e.response?.data?.error||e.message); }
    finally { setSaving(false); }
  }

  async function deactivate(id) {
    if (!window.confirm(t('categories.deactivate'))) return;
    await api.delete(`/api/categories/${id}`);
    load();
  }

  async function activate(id) {
    try {
      await api.put(`/api/categories/${id}`, { active: true });
      load();
    } catch(e) { alert(e.response?.data?.error||e.message); }
  }

  function openDelete(c) {
    setDeleteTarget(c);
    setDeleteError('');
  }
  function closeDelete() {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteError('');
  }
  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api.delete(`/api/categories/${deleteTarget.id}/permanent`);
      setDeleteTarget(null);
      load();
    } catch (e) {
      setDeleteError(e.response?.data?.error || e.message || 'Error');
    } finally { setDeleting(false); }
  }

  return (
    <div style={ST.page}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20,gap:12,flexWrap:'wrap'}}>
        <h1 style={ST.title}>{t('categories.title')}</h1>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <select
            style={{...ST.select, padding:'8px 12px', fontSize:13}}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            title={t('categories.filterStatus')}
          >
            <option value="all">{t('categories.filterAll')}</option>
            <option value="active">{t('categories.filterActiveOnly')}</option>
            <option value="inactive">{t('categories.filterInactiveOnly')}</option>
          </select>
          {isAdmin && <button style={ST.btn} onClick={()=>setAdding(a=>!a)}>+ {t('categories.add')}</button>}
        </div>
      </div>
      {adding && isAdmin && (
        <div style={{...ST.card,padding:16,marginBottom:16}}>
          <div style={ST.row}>
            <div style={{flex:1}}>
              <div style={ST.label}>{t('categories.costType')}</div>
              <input style={ST.input} value={form.costType} onChange={e=>setForm(f=>({...f,costType:e.target.value}))} placeholder={t('categories.placeholder')} />
            </div>
            <div style={{flex:1}}>
              <div style={ST.label}>{t('categories.responsible')}</div>
              <select style={ST.select} value={form.responsible} onChange={e=>setForm(f=>({...f,responsible:e.target.value}))}>
                {responsibles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button style={ST.btn} onClick={save}>{t('common.save')}</button>
            <button style={ST.btnSm} onClick={()=>setAdding(false)}>{t('common.cancel')}</button>
          </div>
        </div>
      )}
      <div style={ST.card}>
        <table style={ST.table}>
          <thead><tr style={ST.thr}>
            <th style={ST.th}>{t('categories.costType')}</th>
            <th style={ST.th}>{t('categories.responsible')}</th>
            <th style={ST.th}>{t('categories.active')}</th>
            <th style={ST.th}></th>
          </tr></thead>
          <tbody>
            {cats
              .filter(c => statusFilter==='all' ? true : statusFilter==='active' ? c.active : !c.active)
              .map(c=>(
              <tr key={c.id} style={{...ST.tr, opacity: c.active ? 1 : 0.45, color: c.active ? undefined : '#aaa'}}>
                {editId === c.id ? (
                  <>
                    <td style={ST.td}>
                      <input
                        style={{...ST.input, margin:0, padding:'4px 8px', fontSize:13}}
                        value={editForm.costType}
                        onChange={e=>setEditForm(f=>({...f, costType:e.target.value}))}
                        onKeyDown={e=>{ if(e.key==='Enter') saveEdit(c.id); if(e.key==='Escape') setEditId(null); }}
                        autoFocus
                      />
                    </td>
                    <td style={ST.td}>
                      <select
                        style={{...ST.select, margin:0, padding:'4px 8px', fontSize:13}}
                        value={editForm.responsible}
                        onChange={e=>setEditForm(f=>({...f, responsible:e.target.value}))}
                      >
                        {/* Preserve the saved value even if it doesn't match a current user */}
                        {editForm.responsible && !responsibles.some(r => r.value === editForm.responsible) && (
                          <option value={editForm.responsible}>{editForm.responsible} ⚠</option>
                        )}
                        {responsibles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </td>
                    <td style={ST.td}>{c.active?'✓':'—'}</td>
                    <td style={{...ST.td, display:'flex', gap:6}}>
                      <button style={{...ST.btnSm, background:'#2e7d52', color:'#fff'}} onClick={()=>saveEdit(c.id)} disabled={saving}>
                        {saving ? '…' : `✓ ${t('common.save')}`}
                      </button>
                      <button style={{...ST.btnSm}} onClick={()=>setEditId(null)}>{t('common.cancel')}</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={ST.td}>{c.cost_type}</td>
                    <td style={ST.td}>
                      <span style={{...ST.badge,background:responsibles.find(r=>(r.value||'').toLowerCase()===(c.responsible||'').toLowerCase())?.color||'#888',color:'#fff'}}>
                        {responsibles.find(r=>(r.value||'').toLowerCase()===(c.responsible||'').toLowerCase())?.label || c.responsible}
                      </span>
                    </td>
                    <td style={ST.td}>{c.active?'✓':'—'}</td>
                    <td style={{...ST.td, display:'flex', gap:6}}>
                      {isAdmin ? (
                        <>
                          <button style={{...ST.btnSm, background: c.active ? '#5a7fa6' : '#ccc', color:'#fff', cursor: c.active ? 'pointer' : 'not-allowed'}} onClick={()=>c.active && startEdit(c)} disabled={!c.active}>✎ {t('common.edit')}</button>
                          {c.active
                            ? <button style={ST.btnSm} onClick={()=>deactivate(c.id)}>{t('users.deactivate')}</button>
                            : <button style={{...ST.btnSm, background:'#2e7d52', color:'#fff'}} onClick={()=>activate(c.id)}>{t('common.active')}</button>
                          }
                          <button
                            style={{...ST.btnSm, background:'#fdecea', color:'#c0392b', border:'1px solid #f5c6cb'}}
                            onClick={()=>openDelete(c)}
                            title={t('categories.delete')}
                          >🗑</button>
                        </>
                      ) : (
                        <span style={{ fontSize: 11, color: '#b5b0ab' }}>—</span>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Delete confirm dialog */}
      {deleteTarget && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000,padding:16}}>
          <div style={{background:'#fff',borderRadius:12,padding:24,maxWidth:460,width:'100%',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
            <div style={{fontSize:16,fontWeight:700,color:'#1c2b3a',marginBottom:12,fontFamily:'sans-serif'}}>
              🗑 {t('categories.deleteTitle')}
            </div>
            <div style={{fontSize:14,color:'#2a2421',marginBottom:16,fontFamily:'sans-serif',lineHeight:1.5}}>
              <strong>{deleteTarget.cost_type}</strong>
              {' · '}
              <span style={{color:'#7a7571'}}>{deleteTarget.responsible || '—'}</span>
              <br/><br/>
              <span style={{color:'#5a5551',fontSize:13}}>
                {t('categories.deleteBody')}
              </span>
              {deleteError && (
                <div style={{marginTop:12,padding:'10px 12px',background:'#fdecea',border:'1px solid #f5c6cb',borderRadius:8,color:'#c0392b',fontSize:13,fontWeight:600}}>
                  ⚠ {deleteError}
                </div>
              )}
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button
                style={{padding:'8px 16px',borderRadius:6,border:'1px solid #e2e0dd',background:'#f4f3f1',color:'#5a5551',cursor:deleting?'not-allowed':'pointer',fontSize:13}}
                onClick={closeDelete}
                disabled={deleting}
              >
                {t('common.cancel')}
              </button>
              {!deleteError && (
                <button
                  style={{padding:'8px 16px',borderRadius:6,border:'none',background:'#c0392b',color:'#fff',cursor:deleting?'not-allowed':'pointer',fontSize:13,fontWeight:700}}
                  onClick={confirmDelete}
                  disabled={deleting}
                >
                  {deleting ? '⏳ ...' : t('categories.deleteBtn')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// AUDIT LOG
// ══════════════════════════════════════════════════════════════
export function AuditLog() {
  const { t } = useLang();
  const [entries,   setEntries]   = useState([]);
  const [search,    setSearch]    = useState('');
  const [loading,   setLoading]   = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(()=>{
    setLoading(true);
    api.get('/api/audit',{ params:{ search, limit:100 } })
      .then(r=>setEntries(r.data.data||[]))
      .finally(()=>setLoading(false));
  },[search]);

  const fmtDT  = d => d ? new Date(d).toLocaleString('it-IT') : '—';
  const fmtCur = n => n != null ? Number(n).toLocaleString('it-IT',{minimumFractionDigits:2}) : '';

  async function handleExport() {
    if (entries.length === 0) { alert(t('audit.noExport')); return; }
    setExporting(true);
    try {
      const wsData = [
        [t('audit.timestamp'), t('audit.user'), t('audit.email'), t('audit.invoice'), t('audit.supplier'), t('audit.total'), t('audit.action')],
        ...entries.map(e => [
          fmtDT(e.created_at),
          e.user_name   || '',
          e.user_email  || '',
          e.inv_number  || '',
          e.supplier    || '',
          e.total != null ? Number(e.total) : '',
          e.action      || '',
        ]),
      ];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [
        { wch: 18 }, { wch: 20 }, { wch: 28 },
        { wch: 16 }, { wch: 30 }, { wch: 12 }, { wch: 50 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Audit Log');
      const today = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `audit_log_${today}.xlsx`);
    } catch(err) {
      alert(t('audit.exportError') + ': ' + err.message);
    } finally { setExporting(false); }
  }

  return (
    <div style={ST.page}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h1 style={{...ST.title,margin:0}}>{t('audit.title')}</h1>
        <button
          style={{...ST.btn,background:'#1c2b3a',border:'1px solid #1c2b3a'}}
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? '⏳' : `📥 ${t('syslog.export')}`}
        </button>
      </div>
      <div style={{background:'#e8f5ec',border:'1px solid #b8dfc4',borderRadius:8,padding:'10px 14px',marginBottom:16,fontSize:13,color:'#2e7d52'}}>
        📋 {t('audit.info')}
      </div>
      <input style={{...ST.input,marginBottom:16,maxWidth:360}} placeholder={t('audit.search')}
        value={search} onChange={e=>setSearch(e.target.value)} />
      {loading ? <div style={{padding:32,color:'#888'}}>{t('common.loading')}</div>
      : (
        <div style={ST.card}>
          <table style={ST.table}>
            <thead><tr style={ST.thr}>
              <th style={ST.th}>{t('audit.timestamp')}</th>
              <th style={ST.th}>{t('audit.user')}</th>
              <th style={ST.th}>{t('audit.invoice')}</th>
              <th style={ST.th}>{t('audit.supplier')}</th>
              <th style={ST.th}>{t('audit.total')}</th>
              <th style={ST.th}>{t('audit.action')}</th>
            </tr></thead>
            <tbody>
              {entries.map(e=>(
                <tr key={e.id} style={ST.tr}>
                  <td style={{...ST.td,fontSize:12,color:'#7a7571'}}>{fmtDT(e.created_at)}</td>
                  <td style={ST.td}>{e.user_name}<br/><span style={{fontSize:11,color:'#7a7571'}}>{e.user_email}</span></td>
                  <td style={{...ST.td,fontFamily:'monospace',fontSize:12}}>{e.inv_number||'—'}</td>
                  <td style={ST.td}>{e.supplier||'—'}</td>
                  <td style={{...ST.td,fontWeight:600}}>€ {fmtCur(e.total)}</td>
                  <td style={{...ST.td,color:'#2e7d52',fontWeight:600}}>{e.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {entries.length===0&&<div style={{padding:32,textAlign:'center',color:'#888'}}>{t('audit.noEntries')}</div>}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// SYSTEM LOG
// ══════════════════════════════════════════════════════════════
const LEVEL_COLORS = { INFO:'#2e7d52',WARN:'#c77d3a',ERROR:'#c0392b',DEBUG:'#7a7571' };
const LEVEL_BG     = { INFO:'#e8f5ec',WARN:'#fef3e8',ERROR:'#fdecea',DEBUG:'#f4f3f1' };

export function SysLog() {
  const { t } = useLang();
  const [entries,      setEntries]      = useState([]);
  const [level,        setLevel]        = useState('');
  const [category,     setCategory]     = useState('');
  const [search,       setSearch]       = useState('');
  const [expanded,     setExpanded]     = useState({});
  const [loading,      setLoading]      = useState(true);
  const [count,        setCount]        = useState(0);
  const [exporting,    setExporting]    = useState(false);
  const [syncRunning,  setSyncRunning]  = useState(false);
  const [stopping,     setStopping]     = useState(false);
  const [stopMsg,      setStopMsg]      = useState('');

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    api.get('/api/syslog',{ params:{ level,category,search,limit:200 } })
      .then(r=>{ setEntries(r.data.data||[]); setCount(r.data.count||0); })
      .finally(()=>{ if (!silent) setLoading(false); });
  };

  useEffect(()=>{ load(); },[level,category,search]);

  useEffect(()=>{
    const interval = setInterval(()=>load(true), 5000);
    return ()=>clearInterval(interval);
  },[level,category,search]);

  // Poll sync status every 3s
  useEffect(()=>{
    let active = true;
    const poll = async () => {
      try {
        const r = await api.get('/api/invoices/sync-status');
        if (active) setSyncRunning(r.data.running);
      } catch {}
    };
    poll();
    const iv = setInterval(poll, 3000);
    return ()=>{ active = false; clearInterval(iv); };
  },[]);

  async function stopSync() {
    setStopping(true); setStopMsg('');
    try {
      await api.post('/api/invoices/cancel-sync');
      window.dispatchEvent(new CustomEvent('app-import-cancel'));
      setStopMsg('✅ OK');
      setSyncRunning(false);
    } catch(e) {
      setStopMsg('❌ ' + (e.response?.data?.error || e.message));
    } finally { setStopping(false); }
  }

  const errors   = entries.filter(e=>e.level==='ERROR').length;
  const warnings = entries.filter(e=>e.level==='WARN').length;

  async function clean() {
    if (!window.confirm(t('syslog.cleanConfirm'))) return;
    const r = await api.post('/api/syslog/clean');
    alert(`${t('syslog.cleanDone')} ${r.data.deleted} ${t('syslog.logs')}`);
    load();
  }

  async function exportXLSX() {
    if (entries.length === 0) { alert(t('syslog.noEntries')); return; }
    setExporting(true);
    try {
      const fmtDT2 = d => d ? new Date(d).toLocaleString('it-IT') : '';
      const wsData = [
        [t('audit.timestamp'), t('syslog.level'), t('syslog.category'), t('syslog.action'), t('syslog.detail'), t('syslog.userEmail'), t('syslog.durationMs'), t('common.error')],
        ...entries.map(e => [
          fmtDT2(e.ts),
          e.level      || '',
          e.category   || '',
          e.action     || '',
          e.detail     || '',
          e.user_email || '',
          e.duration_ms || '',
          e.error_msg  || '',
        ]),
      ];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [
        { wch: 18 }, { wch: 8  }, { wch: 12 }, { wch: 40 },
        { wch: 40 }, { wch: 28 }, { wch: 10 }, { wch: 40 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'System Log');
      const today = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `system_log_${today}.xlsx`);
    } catch(err) {
      alert(t('syslog.exportError') + ': ' + err.message);
    } finally { setExporting(false); }
  }

  const fmtDT = d => d ? new Date(d).toLocaleString('it-IT') : '—';

  return (
    <div style={ST.page}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <h1 style={{...ST.title,margin:0}}>{t('syslog.title')}</h1>
          <span style={{fontSize:11,color:'#2e7d52',background:'#e8f5ec',padding:'3px 8px',borderRadius:12,fontWeight:600}}>
            ⟳ {t('syslog.autoRefresh')}
          </span>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {stopMsg && (
            <span style={{
              fontSize:12,
              color: stopMsg.startsWith('✅') ? '#2e7d52' : '#c0392b',
              background: stopMsg.startsWith('✅') ? '#eaf7ef' : '#fdecea',
              padding:'5px 10px', borderRadius:6,
            }}>
              {stopMsg}
            </span>
          )}
          <button
            style={{
              ...ST.btn,
              background: syncRunning ? '#c0392b' : '#7a8fa6',
              opacity: stopping ? 0.6 : 1,
              position: 'relative',
            }}
            onClick={stopSync}
            disabled={stopping}
            title={syncRunning ? t('syslog.syncRunning') : t('syslog.syncIdle')}
          >
            {stopping ? '⏳ ...' : syncRunning ? `⏹ ${t('syslog.stopSync')} ●` : `⏹ ${t('syslog.stopSync')}`}
          </button>
          <button style={{...ST.btnSm,padding:'7px 12px'}} onClick={clean}>{t('syslog.clean')}</button>
          <button style={{...ST.btn,background:'#2e7d52'}} onClick={exportXLSX} disabled={exporting}>
            {exporting ? '⏳' : `📥 ${t('syslog.export')}`}
          </button>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:16}}>
        {[
          {label:t('syslog.errors'),   value:errors,             bg:'#fdecea',color:'#c0392b'},
          {label:t('syslog.warnings'), value:warnings,           bg:'#fef3e8',color:'#c77d3a'},
          {label:t('syslog.total'),    value:count,              bg:'#f4f3f1',color:'#1c2b3a'},
          {label:t('syslog.retention'),value:t('syslog.days90'), bg:'#e8f5ec',color:'#2e7d52'},
        ].map((k,i)=>(
          <div key={i} style={{background:k.bg,borderRadius:8,padding:'14px 16px'}}>
            <div style={{fontSize:22,fontWeight:700,color:k.color}}>{k.value}</div>
            <div style={{fontSize:12,color:'#7a7571',marginTop:4}}>{k.label}</div>
          </div>
        ))}
      </div>

      <div style={{...ST.row,marginBottom:12}}>
        <select style={{...ST.select,flex:'0 0 120px'}} value={level} onChange={e=>setLevel(e.target.value)}>
          <option value="">{t('syslog.allLevels')}</option>
          {['INFO','WARN','ERROR','DEBUG'].map(l=><option key={l}>{l}</option>)}
        </select>
        <select style={{...ST.select,flex:'0 0 150px'}} value={category} onChange={e=>setCategory(e.target.value)}>
          <option value="">{t('syslog.allCategories')}</option>
          {['API_ER','IMPORT','PDF','AUTH','EMAIL','SCHEDULER','SYSTEM'].map(c=><option key={c}>{c}</option>)}
        </select>
        <input style={{...ST.input,flex:1}} placeholder={t('syslog.searchAction')}
          value={search} onChange={e=>setSearch(e.target.value)} />
      </div>

      {loading ? <div style={{padding:32,color:'#888'}}>{t('common.loading')}</div>
      : (
        <div style={{display:'flex',flexDirection:'column',gap:4}}>
          {entries.map(e=>{
            const open = expanded[e.id];
            return (
              <div key={e.id} style={{background:LEVEL_BG[e.level]||'#fff',borderRadius:6,overflow:'hidden',border:'1px solid rgba(0,0,0,0.05)'}}>
                <div style={{display:'flex',gap:10,padding:'8px 12px',alignItems:'flex-start',cursor:e.stack_trace?'pointer':'default'}}
                  onClick={()=>e.stack_trace&&setExpanded(x=>({...x,[e.id]:!x[e.id]}))}>
                  <span style={{...ST.badge,background:LEVEL_COLORS[e.level]||'#888',flexShrink:0,marginTop:1}}>{e.level}</span>
                  <span style={{...ST.badge,background:'#1c2b3a',flexShrink:0,marginTop:1,fontSize:10}}>{e.category}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:500,color:'#1c2b3a'}}>{e.action}</div>
                    {e.detail&&<div style={{fontSize:12,color:'#5a5551',marginTop:2}}>{e.detail}</div>}
                  </div>
                  <div style={{flexShrink:0,textAlign:'right'}}>
                    <div style={{fontSize:11,color:'#7a7571'}}>{fmtDT(e.ts)}</div>
                    {e.duration_ms&&<div style={{fontSize:11,color:'#7a7571'}}>{e.duration_ms}ms</div>}
                  </div>
                  {e.stack_trace&&<span style={{color:'#7a7571',fontSize:12}}>{open?'▲':'▼'}</span>}
                </div>
                {open&&e.stack_trace&&(
                  <pre style={{margin:0,padding:'8px 12px',background:'rgba(0,0,0,0.06)',fontSize:11,color:'#c0392b',overflow:'auto',maxHeight:200,fontFamily:'monospace'}}>
                    {e.error_msg&&<div style={{fontWeight:700,marginBottom:4}}>{e.error_msg}</div>}
                    {e.stack_trace}
                  </pre>
                )}
              </div>
            );
          })}
          {entries.length===0&&<div style={{padding:32,textAlign:'center',color:'#888'}}>{t('syslog.noEntries')}</div>}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// USERS
// ══════════════════════════════════════════════════════════════
const ROLE_COLORS = { admin:'#1c2b3a', supervisor:'#1a6fa3', controller:'#2e7d52', delegato:'#5a4a8a', revisore:'#c77d3a' };
// ROLE_LABELS moved into component to use t()

function loadUsersPrefs(email) {
  try {
    const raw = localStorage.getItem(`users_prefs_${email}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
function saveUsersPrefs(email, prefs) {
  try { localStorage.setItem(`users_prefs_${email}`, JSON.stringify(prefs)); } catch {}
}

const USERS_DEFAULT_FILTERS = { search: '', role: '', active: 'all' };

export function Users() {
  const { t } = useLang();
  const { user: currentUser } = useAuth();
  const ROLE_LABELS = { admin: t('roles.admin'), supervisor: t('roles.supervisor'), controller: t('roles.controller'), delegato: t('roles.delegato'), revisore: t('roles.revisore') };
  const initialUserPrefs = loadUsersPrefs(currentUser?.email) || {};
  const [filters, setFilters] = useState({ ...USERS_DEFAULT_FILTERS, ...initialUserPrefs });
  const [users,   setUsers]   = useState([]);
  const [form,    setForm]    = useState({ email:'',name:'',role:'revisore' });
  const [adding,  setAdding]  = useState(false);
  const [editId,  setEditId]  = useState(null);   // ID utente in modifica
  const [editForm,setEditForm]= useState({});      // dati form edit
  const [saving,   setSaving]  = useState(false);
  const [loading,  setLoading] = useState(true);
  const [pwdUserId,setPwdUserId]= useState(null);
  const [pwdVal,   setPwdVal]  = useState('');
  const [pwdSaving,setPwdSaving]= useState(false);
  const [pwdMsg,   setPwdMsg]  = useState({ type:'', text:'' });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError,  setDeleteError]  = useState('');
  const [deleting,     setDeleting]     = useState(false);

  const load = () => api.get('/api/users').then(r=>setUsers(r.data.data||[])).finally(()=>setLoading(false));
  useEffect(()=>{ load(); },[]);

  // Persist filters per user
  useEffect(() => {
    if (!currentUser?.email) return;
    saveUsersPrefs(currentUser.email, filters);
  }, [currentUser?.email, filters]);

  function onFilter(key, val) { setFilters(f => ({ ...f, [key]: val })); }
  function resetFilters()      { setFilters(USERS_DEFAULT_FILTERS); }
  const isFiltered = filters.search !== '' || filters.role !== '' || filters.active !== 'all';

  const filteredUsers = users.filter(u => {
    if (filters.role && u.role !== filters.role) return false;
    if (filters.active === 'active'   && !u.active) return false;
    if (filters.active === 'inactive' &&  u.active) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const hay = `${u.name||''} ${u.email||''} ${u.responsible||''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  function openPwd(uid) {
    setPwdUserId(uid); setPwdVal(''); setPwdMsg({ type:'', text:'' });
    setEditId(null);
  }
  function closePwd() { setPwdUserId(null); setPwdVal(''); setPwdMsg({ type:'', text:'' }); }

  async function savePwd() {
    setPwdSaving(true); setPwdMsg({ type:'', text:'' });
    try {
      await api.put(`/api/users/${pwdUserId}/password`, { password: pwdVal });
      setPwdMsg({ type:'ok', text: t('users.pwdSet') });
      setPwdVal('');
    } catch(e) {
      setPwdMsg({ type:'err', text: e.response?.data?.error || e.message });
    } finally { setPwdSaving(false); }
  }

  async function removePwd(uid) {
    if (!window.confirm(t('users.pwdRemoveConfirm'))) return;
    try {
      await api.delete(`/api/users/${uid}/password`);
      alert(t('users.pwdRemoved'));
    } catch(e) { alert(e.response?.data?.error || e.message); }
  }

  async function saveNew() {
    try {
      await api.post('/api/users', form);
      setForm({ email:'',name:'',role:'revisore' });
      setAdding(false);
      load();
    } catch(e) { alert(e.response?.data?.error||e.message); }
  }

  function startEdit(u) {
    setEditId(u.id);
    // Nota: alias (responsible) non è più modificabile dall'UI — lo manteniamo nel DB
    // come chiave di collegamento con invoices, popolato automaticamente dal backend.
    setEditForm({ name: u.name, email: u.email, role: u.role, active: u.active, ai_enabled: u.ai_enabled || false });
    setAdding(false);
  }

  function cancelEdit() {
    setEditId(null);
    setEditForm({});
  }

  async function saveEdit() {
    setSaving(true);
    try {
      await api.put(`/api/users/${editId}`, editForm);
      setEditId(null);
      setEditForm({});
      load();
    } catch(e) { alert(e.response?.data?.error||e.message); }
    finally { setSaving(false); }
  }

  async function toggleActive(u) {
    await api.put(`/api/users/${u.id}`, { active: !u.active });
    load();
  }

  function openDeleteUser(u) { setDeleteTarget(u); setDeleteError(''); }
  function closeDeleteUser() { setDeleteTarget(null); setDeleteError(''); }
  async function confirmDeleteUser() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api.delete(`/api/users/${deleteTarget.id}`);
      setDeleteTarget(null);
      load();
    } catch (e) {
      setDeleteError(e.response?.data?.error || e.message || 'Error');
    } finally { setDeleting(false); }
  }

  return (
    <div style={ST.page}>
      <style>{`.role-info-wrap:hover .role-tooltip { display:block !important; }`}</style>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h1 style={ST.title}>{t('users.title')}</h1>
        <button style={ST.btn} onClick={()=>{ setAdding(a=>!a); setEditId(null); }}>+ {t('users.add')}</button>
      </div>

      {/* Filter bar */}
      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
        <input
          style={{padding:'8px 12px',borderRadius:8,border:'1px solid #e2e0dd',fontSize:13,flex:'1 1 240px',maxWidth:360,fontFamily:'sans-serif',outline:'none'}}
          placeholder={t('users.search')}
          value={filters.search}
          onChange={e => onFilter('search', e.target.value)}
        />
        <select
          style={{padding:'8px 12px',borderRadius:8,border:'1px solid #e2e0dd',fontSize:13,background:'#fff',cursor:'pointer',fontFamily:'sans-serif'}}
          value={filters.role}
          onChange={e => onFilter('role', e.target.value)}
        >
          <option value="">{t('users.filterRole')}</option>
          {Object.entries(ROLE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select
          style={{padding:'8px 12px',borderRadius:8,border:'1px solid #e2e0dd',fontSize:13,background:'#fff',cursor:'pointer',fontFamily:'sans-serif'}}
          value={filters.active}
          onChange={e => onFilter('active', e.target.value)}
        >
          <option value="all">{t('users.filterActiveAll')}</option>
          <option value="active">{t('users.filterActiveYes')}</option>
          <option value="inactive">{t('users.filterActiveNo')}</option>
        </select>
        {isFiltered && (
          <button
            style={{padding:'8px 14px',borderRadius:8,border:'1px solid #e74c3c',background:'#fff',color:'#e74c3c',cursor:'pointer',fontSize:13,fontWeight:600,whiteSpace:'nowrap'}}
            onClick={resetFilters}
          >
            {'× ' + t('users.resetFilters')}
          </button>
        )}
        <span style={{padding:'8px 4px',fontSize:13,color:'#7a7571',whiteSpace:'nowrap',marginLeft:'auto'}}>
          {filteredUsers.length} / {users.length}
        </span>
      </div>

      {/* Form nuovo utente */}
      {adding && (
        <div style={{...ST.card,padding:16,marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:600,color:'#1c2b3a',marginBottom:12}}>{t('users.newUser')}</div>
          <div style={ST.row}>
            <div style={{flex:2}}>
              <div style={ST.label}>{t('users.email')}</div>
              <input style={ST.input} type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder={t('users.emailPlaceholder')} />
            </div>
            <div style={{flex:1}}>
              <div style={ST.label}>{t('users.name')}</div>
              <input style={ST.input} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder={t('users.namePlaceholder')} />
            </div>
            <div style={{flex:1}}>
              <div style={ST.label}>{t('users.role')}</div>
              <select style={ST.select} value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))}>
                {Object.entries(ROLE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button style={ST.btn} onClick={saveNew}>{t('common.save')}</button>
            <button style={ST.btnSm} onClick={()=>setAdding(false)}>{t('common.cancel')}</button>
          </div>
        </div>
      )}

      <div style={ST.card}>
        <table style={ST.table}>
          <thead><tr style={ST.thr}>
            <th style={ST.th}>{t('users.name')}</th>
            <th style={ST.th}>{t('users.email')}</th>
            <th style={ST.th}>
              <span style={{display:'inline-flex',alignItems:'center',gap:5}}>
                {t('users.role')}
                <span style={{position:'relative',display:'inline-block'}} className="role-info-wrap">
                  <span style={{
                    display:'inline-flex',alignItems:'center',justifyContent:'center',
                    width:15,height:15,borderRadius:'50%',background:'#7b8fa3',color:'#fff',
                    fontSize:10,fontWeight:700,cursor:'default',userSelect:'none',lineHeight:1,
                  }}>i</span>
                  <div className="role-tooltip" style={{
                    display:'none',position:'absolute',top:'calc(100% + 6px)',left:'50%',
                    transform:'translateX(-50%)',zIndex:999,
                    background:'#1c2b3a',color:'#f4f3f1',borderRadius:8,
                    padding:'12px 14px',boxShadow:'0 4px 20px rgba(0,0,0,0.35)',
                    whiteSpace:'nowrap',fontSize:11,minWidth:520,
                  }}>
                    <div style={{fontWeight:700,fontSize:12,marginBottom:8,borderBottom:'1px solid rgba(255,255,255,0.15)',paddingBottom:6}}>
                      {t('users.roleGuide')}
                    </div>
                    <table style={{borderCollapse:'collapse',width:'100%'}}>
                      <thead>
                        <tr style={{color:'#aabbc8',fontSize:10}}>
                          <td style={{padding:'3px 8px 3px 0',fontWeight:600}}>{t('users.role')}</td>
                          <td style={{padding:'3px 6px',textAlign:'center'}}>{t('nav.dashboard')}</td>
                          <td style={{padding:'3px 6px',textAlign:'center'}}>{t('nav.invoices')}</td>
                          <td style={{padding:'3px 6px',textAlign:'center'}}>Vis.</td>
                          <td style={{padding:'3px 6px',textAlign:'center'}}>{t('common.confirm')}</td>
                          <td style={{padding:'3px 6px',textAlign:'center'}}>{t('nav.distinta')}</td>
                          <td style={{padding:'3px 6px',textAlign:'center'}}>{t('nav.audit')}</td>
                          <td style={{padding:'3px 6px',textAlign:'center'}}>Admin</td>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { role:t('roles.admin'),       color:'#1c2b3a', dash:'✓',fatt:'✓',vis:t('common.active'),appr:'✓',dist:'✓',audit:'✓',adm:'✓' },
                          { role:t('roles.supervisor'), color:'#1a6fa3', dash:'✓',fatt:'✓',vis:t('common.active'),appr:'✓',dist:'✓',audit:'—',adm:'—' },
                          { role:t('roles.controller'),  color:'#2e7d52', dash:'✓',fatt:'✓',vis:t('common.active'),appr:'✓',dist:'—',audit:'—',adm:'—' },
                          { role:t('roles.delegato'),    color:'#5a4a8a', dash:'✓',fatt:'✓',vis:t('common.active'),appr:'✓',dist:'—',audit:'—',adm:'—' },
                          { role:t('roles.revisore'),    color:'#c77d3a', dash:'—',fatt:'✓',vis:'—',appr:'✓',dist:'—',audit:'—',adm:'—' },
                        ].map(r => (
                          <tr key={r.role} style={{borderTop:'1px solid rgba(255,255,255,0.07)'}}>
                            <td style={{padding:'4px 8px 4px 0'}}>
                              <span style={{background:r.color,color:'#fff',borderRadius:4,padding:'2px 7px',fontSize:10,fontWeight:600}}>{r.role}</span>
                            </td>
                            {[r.dash,r.fatt,r.vis,r.appr,r.dist,r.audit,r.adm].map((v,i) => (
                              <td key={i} style={{padding:'4px 6px',textAlign:'center',color: v==='✓'?'#6fcf97': v==='—'?'#666':undefined}}>
                                {v}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </span>
              </span>
            </th>
            <th style={{...ST.th,textAlign:'center',width:40}} title={t('users.aiEnabled')}>🤖</th>
            <th style={ST.th}>{t('users.active')}</th>
            <th style={{...ST.th,width:180}}></th>
          </tr></thead>
          <tbody>
            {filteredUsers.map(u => {
              const isEditing = editId === u.id;
              return (
                <tr key={u.id} style={{...ST.tr, background: isEditing ? '#f8f7ff' : undefined, opacity: u.active ? 1 : 0.4}}>
                  {isEditing ? (
                    <>
                      {/* Nome */}
                      <td style={{...ST.td,paddingTop:8,paddingBottom:8}}>
                        <input
                          style={ST.inputSm}
                          value={editForm.name}
                          onChange={e=>setEditForm(f=>({...f,name:e.target.value}))}
                        />
                      </td>
                      {/* Email */}
                      <td style={{...ST.td,paddingTop:8,paddingBottom:8}}>
                        <input
                          style={ST.inputSm}
                          type="email"
                          value={editForm.email}
                          onChange={e=>setEditForm(f=>({...f,email:e.target.value}))}
                        />
                      </td>
                      {/* Ruolo */}
                      <td style={{...ST.td,paddingTop:8,paddingBottom:8}}>
                        <select
                          style={ST.selectSm}
                          value={editForm.role}
                          onChange={e=>setEditForm(f=>({...f,role:e.target.value}))}
                        >
                          {Object.entries(ROLE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </td>
                      {/* AI */}
                      <td style={{...ST.td,paddingTop:8,paddingBottom:8,textAlign:'center'}}>
                        <input
                          type="checkbox"
                          checked={editForm.ai_enabled || false}
                          onChange={e=>setEditForm(f=>({...f,ai_enabled:e.target.checked}))}
                          style={{width:16,height:16,cursor:'pointer'}}
                          title={t('users.aiEnabled')}
                        />
                      </td>
                      {/* Attivo */}
                      <td style={{...ST.td,paddingTop:8,paddingBottom:8}}>
                        <select
                          style={{...ST.selectSm,width:'auto'}}
                          value={editForm.active ? 'true' : 'false'}
                          onChange={e=>setEditForm(f=>({...f,active:e.target.value==='true'}))}
                        >
                          <option value="true">✓ {t('common.active')}</option>
                          <option value="false">— {t('common.inactive')}</option>
                        </select>
                      </td>
                      {/* Azioni edit */}
                      <td style={{...ST.td,paddingTop:8,paddingBottom:8}}>
                        <div style={{display:'flex',gap:6}}>
                          <button style={ST.btnGrn} onClick={saveEdit} disabled={saving}>
                            {saving ? '...' : `✓ ${t('common.save')}`}
                          </button>
                          <button style={ST.btnSm} onClick={cancelEdit}>{t('common.cancel')}</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={ST.td}>{u.name}</td>
                      <td style={{...ST.td,fontSize:12,color:'#7a7571'}}>{u.email}</td>
                      <td style={ST.td}>
                        <span style={{...ST.badge,background:ROLE_COLORS[u.role]||'#888'}}>{ROLE_LABELS[u.role]||u.role}</span>
                      </td>
                      <td style={{...ST.td,textAlign:'center'}}>
                        {u.ai_enabled
                          ? <span style={{color:'#2e7d52',fontWeight:700}} title={t('users.aiOn')}>✓</span>
                          : <span style={{color:'#bbb'}} title={t('users.aiOff')}>—</span>}
                      </td>
                      <td style={ST.td}>
                        {u.active
                          ? <span style={{color:'#2e7d52',fontWeight:700}}>✓</span>
                          : <span style={{color:'#bbb'}}>—</span>}
                      </td>
                      <td style={ST.td}>
                        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                          <button style={{...ST.btnSm,color:'#1a6fa3'}} onClick={()=>startEdit(u)}>✏ {t('common.edit')}</button>
                          <button style={ST.btnSm} onClick={()=>toggleActive(u)}>
                            {u.active ? t('users.deactivate') : t('users.reactivate')}
                          </button>
                          <button style={{...ST.btnSm,color:'#7a5a1a'}} onClick={()=>pwdUserId===u.id ? closePwd() : openPwd(u.id)}>
                            🔑 {pwdUserId===u.id ? t('users.pwdClose') : t('users.password')}
                          </button>
                          <button
                            style={{...ST.btnSm, background:'#fdecea', color:'#c0392b', border:'1px solid #f5c6cb'}}
                            onClick={()=>openDeleteUser(u)}
                            title={t('users.delete')}
                          >🗑</button>
                        </div>
                        {pwdUserId === u.id && (
                          <div style={{marginTop:8,padding:'10px 12px',background:'#faf9f6',border:'1px solid #e2e0dd',borderRadius:8}}>
                            <div style={{fontSize:12,fontWeight:600,color:'#1c2b3a',marginBottom:6}}>{t('users.password')}</div>
                            <div style={{display:'flex',gap:6,alignItems:'center'}}>
                              <input
                                type="password"
                                style={{...ST.inputSm,flex:1,minWidth:180}}
                                value={pwdVal}
                                onChange={e=>setPwdVal(e.target.value)}
                                placeholder={t('users.pwdHint')}
                                autoComplete="new-password"
                              />
                              <button style={ST.btnGrn} onClick={savePwd} disabled={pwdSaving||!pwdVal}>
                                {pwdSaving ? '...' : t('common.save')}
                              </button>
                              <button style={{...ST.btnSm,color:'#c0392b'}} onClick={()=>removePwd(u.id)} title={t('users.pwdRemoveTitle')}>✕</button>
                            </div>
                            {pwdMsg.text && (
                              <div style={{marginTop:6,fontSize:11,color: pwdMsg.type==='ok' ? '#2e7d52' : '#c0392b'}}>
                                {pwdMsg.type==='ok' ? '✓ ' : '⚠ '}{pwdMsg.text}
                              </div>
                            )}
                            <div style={{marginTop:6,fontSize:10,color:'#aaa'}}>
                              {t('users.pwdHint')}
                            </div>
                          </div>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Delete confirm dialog */}
      {deleteTarget && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000,padding:16}}>
          <div style={{background:'#fff',borderRadius:12,padding:24,maxWidth:460,width:'100%',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
            <div style={{fontSize:16,fontWeight:700,color:'#1c2b3a',marginBottom:12,fontFamily:'sans-serif'}}>
              🗑 {t('users.deleteTitle')}
            </div>
            <div style={{fontSize:14,color:'#2a2421',marginBottom:16,fontFamily:'sans-serif',lineHeight:1.5}}>
              <strong>{deleteTarget.name || '—'}</strong>
              {' · '}
              <span style={{color:'#7a7571'}}>{deleteTarget.email || '—'}</span>
              <br/><br/>
              <span style={{color:'#5a5551',fontSize:13}}>
                {t('users.deleteBody')}
              </span>
              {deleteError && (
                <div style={{marginTop:12,padding:'10px 12px',background:'#fdecea',border:'1px solid #f5c6cb',borderRadius:8,color:'#c0392b',fontSize:13,fontWeight:600}}>
                  ⚠ {deleteError}
                </div>
              )}
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button
                style={{padding:'8px 16px',borderRadius:6,border:'1px solid #e2e0dd',background:'#f4f3f1',color:'#5a5551',cursor:deleting?'not-allowed':'pointer',fontSize:13}}
                onClick={closeDeleteUser}
                disabled={deleting}
              >
                {t('common.cancel')}
              </button>
              {!deleteError && (
                <button
                  style={{padding:'8px 16px',borderRadius:6,border:'none',background:'#c0392b',color:'#fff',cursor:deleting?'not-allowed':'pointer',fontSize:13,fontWeight:700}}
                  onClick={confirmDeleteUser}
                  disabled={deleting}
                >
                  {deleting ? '⏳ ...' : t('users.deleteBtn')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// SETTINGS helpers — defined outside to prevent focus loss on rerender
// ══════════════════════════════════════════════════════════════
function SettingsSection({title, children}) {
  return (
    <div style={{...ST.card,padding:20,marginBottom:16}}>
      <div style={{fontSize:14,fontWeight:700,color:'#1c2b3a',marginBottom:16}}>{title}</div>
      {children}
    </div>
  );
}

function SettingsField({label, k, type='text', placeholder='', settings, set}) {
  const [show, setShow] = React.useState(false);
  const isPassword = type === 'password';
  return (
    <div style={{marginBottom:12}}>
      <div style={ST.label}>{label}</div>
      <div style={{position:'relative'}}>
        <input
          type={isPassword && !show ? 'password' : 'text'}
          style={{...ST.input, paddingRight: isPassword ? 36 : undefined}}
          value={settings[k]||''} onChange={e=>set(k,e.target.value)} placeholder={placeholder}
        />
        {isPassword && (
          <span onClick={()=>setShow(s=>!s)} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',cursor:'pointer',fontSize:16,opacity:0.5,userSelect:'none'}}>
            {show ? '🙈' : '👁'}
          </span>
        )}
      </div>
    </div>
  );
}

// ── EmailRecipientsEditor ─────────────────────────────────────
function EmailRecipientsEditor({ recipients, setRecipients, users, onPersist }) {
  const { t } = useLang();
  const [editIdx, setEditIdx]     = React.useState(null);
  const [draft,   setDraft]       = React.useState({ user_id:'', user_name:'', email:'' });
  const [saving,  setSaving]      = React.useState(false);

  function startAdd() {
    setEditIdx(-1);
    setDraft({ user_id:'', user_name:'', email:'', notifica: true, distinta: true, rejection: true });
  }
  function startEdit(i) {
    setEditIdx(i);
    setDraft({ ...recipients[i] });
  }
  function cancel() { setEditIdx(null); }

  function handleUserSelect(userId) {
    const u = users.find(x => x.id === userId);
    if (u) setDraft({ user_id: u.id, user_name: u.name, email: u.email || '' });
    else   setDraft(d => ({ ...d, user_id: '', user_name: '' }));
  }

  async function handleSave() {
    if (!draft.user_name || !draft.email) return;
    setSaving(true);
    try {
      let updated;
      if (editIdx === -1) {
        updated = [...recipients, { ...draft }];
      } else {
        updated = recipients.map((r,i) => i === editIdx ? { ...draft } : r);
      }
      await onPersist(updated);
      setRecipients(updated);
      setEditIdx(null);
    } catch(e) { alert(t('common.error') + ': ' + e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(i) {
    if (!window.confirm(`${t('settings.removeRecipient')} ${recipients[i].user_name}?`)) return;
    setSaving(true);
    try {
      const updated = recipients.filter((_,idx) => idx !== i);
      await onPersist(updated);
      setRecipients(updated);
      if (editIdx === i) setEditIdx(null);
    } catch(e) { alert(t('common.error') + ': ' + e.message); }
    finally { setSaving(false); }
  }

  const usedIds = recipients.map(r => r.user_id);
  const availableUsers = users.filter(u => u.active !== false);

  return (
    <div style={{marginTop:4,marginBottom:16}}>
      <div style={{...ST.label, marginBottom:8}}>{t('settings.recipients')}</div>
      <div style={{fontSize:11,color:'#7a7571',marginBottom:10}}>
        {t('settings.recipientsDesc')}
      </div>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
        <thead>
          <tr style={{borderBottom:'2px solid #e8e6e3',textAlign:'left'}}>
            <th style={{padding:'6px 8px',fontWeight:600,color:'#7a7571',fontSize:11,width:'30%'}}>{t('settings.recipientUser')}</th>
            <th style={{padding:'6px 8px',fontWeight:600,color:'#7a7571',fontSize:11,width:'30%'}}>{t('settings.recipientEmail')}</th>
            <th style={{padding:'6px 8px',fontWeight:600,color:'#7a7571',fontSize:11,width:'10%',textAlign:'center'}}>Notifica</th>
            <th style={{padding:'6px 8px',fontWeight:600,color:'#7a7571',fontSize:11,width:'10%',textAlign:'center'}}>Distinta</th>
            <th style={{padding:'6px 8px',fontWeight:600,color:'#c0392b',fontSize:11,width:'10%',textAlign:'center'}}>Rifiutate</th>
            <th style={{padding:'6px 8px',fontWeight:600,color:'#7a7571',fontSize:11,width:'15%',textAlign:'right'}}>{t('settings.recipientActions')}</th>
          </tr>
        </thead>
        <tbody>
          {recipients.map((r, i) => (
            <tr key={i} style={{borderBottom:'1px solid #f0eeec'}}>
              {editIdx === i ? (
                <>
                  <td style={{padding:'6px 8px'}}>
                    <select style={{...ST.input,margin:0,padding:'6px 8px'}} value={draft.user_id} onChange={e=>handleUserSelect(e.target.value)}>
                      <option value="">{t('settings.selectUser')}</option>
                      {availableUsers.map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                      ))}
                    </select>
                  </td>
                  <td style={{padding:'6px 8px'}}>
                    <input style={{...ST.input,margin:0,padding:'6px 8px'}} type="email" value={draft.email} onChange={e=>setDraft(d=>({...d,email:e.target.value}))} placeholder="email@..." />
                  </td>
                  <td style={{padding:'6px 8px',textAlign:'center'}}>
                    <input type="checkbox" checked={draft.notifica !== false} onChange={e=>setDraft(d=>({...d,notifica:e.target.checked}))} />
                  </td>
                  <td style={{padding:'6px 8px',textAlign:'center'}}>
                    <input type="checkbox" checked={draft.distinta !== false} onChange={e=>setDraft(d=>({...d,distinta:e.target.checked}))} />
                  </td>
                  <td style={{padding:'6px 8px',textAlign:'center'}}>
                    <input type="checkbox" checked={draft.rejection !== false} onChange={e=>setDraft(d=>({...d,rejection:e.target.checked}))} />
                  </td>
                  <td style={{padding:'6px 8px',textAlign:'right',whiteSpace:'nowrap'}}>
                    <button onClick={handleSave} disabled={saving || !draft.user_name || !draft.email} style={{...ST.btn,fontSize:11,padding:'4px 10px',background:'#2e7d52',marginRight:4}}>
                      {saving ? '...' : '💾'}
                    </button>
                    <button onClick={cancel} style={{...ST.btn,fontSize:11,padding:'4px 10px',background:'#9e9b97'}}>✕</button>
                  </td>
                </>
              ) : (
                <>
                  <td style={{padding:'8px'}}>
                    <span style={{fontWeight:600,color:'#1c2b3a'}}>{r.user_name}</span>
                  </td>
                  <td style={{padding:'8px',color:'#5a5551'}}>{r.email}</td>
                  <td style={{padding:'8px',textAlign:'center'}}>
                    <input type="checkbox" checked={r.notifica !== false}
                      onChange={async (e) => {
                        const updated = recipients.map((x,idx) => idx === i ? {...x, notifica: e.target.checked} : x);
                        await onPersist(updated);
                        setRecipients(updated);
                      }}
                    />
                  </td>
                  <td style={{padding:'8px',textAlign:'center'}}>
                    <input type="checkbox" checked={r.distinta !== false}
                      onChange={async (e) => {
                        const updated = recipients.map((x,idx) => idx === i ? {...x, distinta: e.target.checked} : x);
                        await onPersist(updated);
                        setRecipients(updated);
                      }}
                    />
                  </td>
                  <td style={{padding:'8px',textAlign:'center'}}>
                    <input type="checkbox" checked={r.rejection !== false}
                      onChange={async (e) => {
                        const updated = recipients.map((x,idx) => idx === i ? {...x, rejection: e.target.checked} : x);
                        await onPersist(updated);
                        setRecipients(updated);
                      }}
                    />
                  </td>
                  <td style={{padding:'8px',textAlign:'right',whiteSpace:'nowrap'}}>
                    <button onClick={()=>startEdit(i)} style={{...ST.btn,fontSize:11,padding:'4px 10px',background:'#1a6fa3',marginRight:4}}>✏️</button>
                    <button onClick={()=>handleDelete(i)} disabled={saving} style={{...ST.btn,fontSize:11,padding:'4px 10px',background:'#c0392b'}}>🗑</button>
                  </td>
                </>
              )}
            </tr>
          ))}
          {editIdx === -1 && (
            <tr style={{borderBottom:'1px solid #f0eeec',background:'#f8f7ff'}}>
              <td style={{padding:'6px 8px'}}>
                <select style={{...ST.input,margin:0,padding:'6px 8px'}} value={draft.user_id} onChange={e=>handleUserSelect(e.target.value)}>
                  <option value="">{t('settings.selectUser')}</option>
                  {availableUsers.filter(u => !usedIds.includes(u.id)).map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                  ))}
                </select>
              </td>
              <td style={{padding:'6px 8px'}}>
                <input style={{...ST.input,margin:0,padding:'6px 8px'}} type="email" value={draft.email} onChange={e=>setDraft(d=>({...d,email:e.target.value}))} placeholder="email@..." />
              </td>
              <td style={{padding:'6px 8px',textAlign:'center'}}>
                <input type="checkbox" checked={draft.notifica !== false} onChange={e=>setDraft(d=>({...d,notifica:e.target.checked}))} />
              </td>
              <td style={{padding:'6px 8px',textAlign:'center'}}>
                <input type="checkbox" checked={draft.distinta !== false} onChange={e=>setDraft(d=>({...d,distinta:e.target.checked}))} />
              </td>
              <td style={{padding:'6px 8px',textAlign:'center'}}>
                <input type="checkbox" checked={draft.rejection !== false} onChange={e=>setDraft(d=>({...d,rejection:e.target.checked}))} />
              </td>
              <td style={{padding:'6px 8px',textAlign:'right',whiteSpace:'nowrap'}}>
                <button onClick={handleSave} disabled={saving || !draft.user_name || !draft.email} style={{...ST.btn,fontSize:11,padding:'4px 10px',background:'#2e7d52',marginRight:4}}>
                  {saving ? '...' : '💾'}
                </button>
                <button onClick={cancel} style={{...ST.btn,fontSize:11,padding:'4px 10px',background:'#9e9b97'}}>✕</button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {editIdx === null && (
        <button onClick={startAdd} style={{...ST.btn,fontSize:12,padding:'6px 14px',background:'#1c2b3a',marginTop:8}}>
          + {t('settings.addRecipient')}
        </button>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════════════════
export function Settings() {
  const { t } = useLang();
  const { user: currentUser } = useAuth();
  const aiUsageExpandKey = `ai_usage_expanded_${currentUser?.email || 'anon'}`;
  const [aiUsageExpanded, setAiUsageExpanded] = useState(() => {
    try { return localStorage.getItem(aiUsageExpandKey) === '1'; } catch { return false; }
  });
  const toggleAiUsageExpanded = () => {
    setAiUsageExpanded(prev => {
      const next = !prev;
      try { localStorage.setItem(aiUsageExpandKey, next ? '1' : '0'); } catch {}
      return next;
    });
  };
  const [settings,      setSettings]      = useState({});
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [testing,       setTesting]       = useState(false);
  const [testMsg,       setTestMsg]       = useState('');
  const [testingEmail,  setTestingEmail]  = useState(false);
  const [testEmailMsg,  setTestEmailMsg]  = useState('');
  const [testingAi,     setTestingAi]     = useState(false);
  const [testAiPrompt,  setTestAiPrompt]  = useState('Dimmi "ciao" in italiano.');
  const [testAiMsg,     setTestAiMsg]     = useState('');
  const [aiUsage,       setAiUsage]       = useState(null);
  const [aiUsageLoading,setAiUsageLoading]= useState(false);
  const [syncingPayment,    setSyncingPayment]    = useState(false);
  const [syncPaymentMsg,    setSyncPaymentMsg]    = useState('');
  const [autoAssigning,     setAutoAssigning]     = useState(false);
  const [repairingPdf,      setRepairingPdf]      = useState(false);
  const [repairPdfMsg,      setRepairPdfMsg]      = useState('');
  const [autoAssignMsg,     setAutoAssignMsg]     = useState('');

  const [emailUsers,      setEmailUsers]      = useState([]);
  const [emailRecipients, setEmailRecipients] = useState([]);

  useEffect(()=>{
    Promise.all([
      api.get('/api/settings'),
      api.get('/api/users'),
    ]).then(([settingsRes, usersRes]) => {
      const s = settingsRes.data.settings || {};
      setSettings(s);
      try { setEmailRecipients(JSON.parse(s.email_recipients || '[]')); } catch { setEmailRecipients([]); }
      setEmailUsers(usersRes.data.data || []);
    }).finally(()=>setLoading(false));
  },[]);

  const set = (k,v) => setSettings(s=>({...s,[k]:v}));

  async function save() {
    setSaving(true);
    try {
      await api.put('/api/settings',{ settings });
      // Notify ChatWidget to re-fetch config (enabled flag, suggestions)
      window.dispatchEvent(new CustomEvent('ai-config-changed'));
      alert(t('common.success'));
    }
    catch(e) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function persistRecipients(updated) {
    await api.put('/api/settings', { settings: { email_recipients: JSON.stringify(updated) } });
  }

  async function testEmail() {
    setTestingEmail(true); setTestEmailMsg('');
    try {
      const r = await api.post('/api/settings/test-email');
      setTestEmailMsg(r.data.ok
        ? `✅ Inviato → ${r.data.to}`
        : `❌ ${r.data.error}`);
    } catch(e) { setTestEmailMsg('❌ '+(e.response?.data?.error||e.message)); }
    finally { setTestingEmail(false); }
  }

  async function testAi() {
    setTestingAi(true); setTestAiMsg('');
    try {
      const r = await api.post('/api/settings/test-ai', { prompt: testAiPrompt });
      setTestAiMsg(r.data.ok ? `✅ ${r.data.reply}` : `❌ ${r.data.error}`);
      loadAiUsage(); // refresh stats after a test call
    } catch(e) { setTestAiMsg('❌ '+(e.response?.data?.error||e.message)); }
    finally { setTestingAi(false); }
  }

  async function loadAiUsage() {
    setAiUsageLoading(true);
    try {
      const r = await api.get('/api/ai/usage-stats');
      setAiUsage(r.data || null);
    } catch { setAiUsage(null); }
    finally { setAiUsageLoading(false); }
  }
  async function resetAiUsage() {
    if (!window.confirm(t('settings.aiUsageResetConfirm'))) return;
    setAiUsageLoading(true);
    try {
      await api.delete('/api/ai/usage-stats');
      await loadAiUsage();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
      setAiUsageLoading(false);
    }
  }
  useEffect(() => { loadAiUsage(); }, []);

  async function testConn() {
    setTesting(true); setTestMsg('');
    try {
      const r = await api.post('/api/settings/test-er-api');
      setTestMsg(r.data.ok ? '✅ '+t('settings.connOk') : '❌ '+t('settings.connFail'));
    } catch(e) { setTestMsg('❌ '+(e.response?.data?.message||e.message)); }
    finally { setTesting(false); }
  }

  async function syncPaymentStatus() {
    const ok = window.confirm(t('settings.syncPaymentConfirm'));
    if (!ok) return;
    setSyncingPayment(true); setSyncPaymentMsg('');
    try {
      const r = await api.post('/api/invoices/sync-payment-status');
      setSyncPaymentMsg(`✅ ${t('settings.syncPaymentDone')} ${r.data.updated} ${t('settings.records')}`);
    } catch(e) {
      setSyncPaymentMsg('❌ ' + (e.response?.data?.error || e.message));
    } finally { setSyncingPayment(false); }
  }

  async function repairPdfIds() {
    setRepairingPdf(true); setRepairPdfMsg('');
    try {
      const r = await api.post('/api/invoices/repair-pdf-ids');
      setRepairPdfMsg(`✅ ${t('settings.repairPdfDone')}: ${r.data.repaired} ${t('settings.invoicesFixed')}`);
    } catch(e) {
      setRepairPdfMsg('❌ ' + (e.response?.data?.error || e.message));
    } finally { setRepairingPdf(false); }
  }

  async function runAutoAssign() {
    const ok = window.confirm(t('settings.manualSyncConfirm'));
    if (!ok) return;
    setAutoAssigning(true); setAutoAssignMsg('');
    try {
      const r = await api.post('/api/invoices/auto-assign-categories');
      setAutoAssignMsg(`✅ ${r.data.updated} ${t('settings.invoicesFixed')}`);
    } catch(e) {
      setAutoAssignMsg('❌ ' + (e.response?.data?.error || e.message));
    } finally { setAutoAssigning(false); }
  }

  if (loading) return <div style={{padding:40,color:'#888'}}>{t('common.loading')}</div>;

  return (
    <div style={ST.page}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <h1 style={ST.title}>{t('settings.title')}</h1>
        <button style={ST.btn} onClick={save} disabled={saving}>{saving ? t('settings.saving') : t('settings.save')}</button>
      </div>
      <SettingsSection title={`🔌 ${t('settings.erApi')}`}>
        <SettingsField label="URL"         k="er_url"       placeholder="https://e-racuni.com/WebServicesSI/API" settings={settings} set={set} />
        <SettingsField label="Username"    k="er_user"       placeholder="username" settings={settings} set={set} />
        <SettingsField label="Secret Key"  k="er_secretkey"  type="password" placeholder="••••••••" settings={settings} set={set} />
        <SettingsField label="Token"       k="er_token"       type="password" placeholder="••••••••" settings={settings} set={set} />
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <button style={{...ST.btn,background:'#2e7d52'}} onClick={testConn} disabled={testing}>
            {testing?'Test...':t('settings.testConn')}
          </button>
          {testMsg&&<span style={{fontSize:13,color:testMsg.startsWith('✅')?'#2e7d52':'#c0392b'}}>{testMsg}</span>}
        </div>
      </SettingsSection>
      <SettingsSection title={`📧 ${t('settings.email')} (Resend)`}>
        <SettingsField label="Resend API Key"    k="resend_api_key" placeholder="re_..." type="password" settings={settings} set={set} />
        <div style={{fontSize:11,color:'#7a7571',marginTop:-8,marginBottom:12}}>
          Pridobi API key na <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer" style={{color:'#1a6fa3'}}>resend.com/api-keys</a>
        </div>
        <SettingsField label="FROM"   k="email_from"     placeholder="campagnolo@jmmc.si" type="email" settings={settings} set={set} />
        <SettingsField label={t('common.error')}  k="email_errors"   placeholder="errors@..."   type="email" settings={settings} set={set} />
        <div style={{borderTop:'1px solid #e8e6e3',marginTop:12,paddingTop:12}}>
          <EmailRecipientsEditor
            recipients={emailRecipients}
            setRecipients={setEmailRecipients}
            users={emailUsers}
            onPersist={persistRecipients}
          />
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',marginTop:4}}>
          <button style={{...ST.btn,background:'#1a6fa3'}} onClick={testEmail} disabled={testingEmail}>
            {testingEmail ? t('settings.sending') : `📧 ${t('settings.testEmail')}`}
          </button>
          {testEmailMsg && (
            <span style={{fontSize:12,color:testEmailMsg.startsWith('✅')?'#2e7d52':'#c0392b'}}>
              {testEmailMsg}
            </span>
          )}
        </div>
      </SettingsSection>
      <SettingsSection title={`🤖 ${t('settings.aiModel')}`}>
        {/* AI Chat enable/disable toggle */}
        <div style={{marginBottom:16}}>
          <div style={ST.label}>{t('settings.aiChatAgent')}</div>
          <select
            style={{...ST.input, maxWidth:220, cursor:'pointer'}}
            value={settings.ai_chat_enabled || 'true'}
            onChange={e => set('ai_chat_enabled', e.target.value)}
          >
            <option value="true">✅ {t('settings.aiEnabled')}</option>
            <option value="false">❌ {t('settings.aiDisabled')}</option>
          </select>
          <div style={{fontSize:11,color:'#7a7571',marginTop:4}}>
            {t('settings.aiChatHidden')}
          </div>
        </div>
        <SettingsField label="OpenAI API Key"  k="openai_api_key" placeholder="sk-..." type="password" settings={settings} set={set} />
        <div style={{marginBottom:12}}>
          <div style={ST.label}>{t('settings.model')}</div>
          <select
            style={{...ST.input, cursor:'pointer'}}
            value={settings.openai_model || 'gpt-4o'}
            onChange={e => set('openai_model', e.target.value)}
          >
            <optgroup label="── Serie GPT-4 (stabili, disponibili) ──">
              <option value="gpt-4o">gpt-4o — ⭐ Consigliato · miglior rapporto qualità/prezzo · veloce e preciso per SQL · ~€0,003/query</option>
              <option value="gpt-4o-mini">gpt-4o-mini — Economico · buono per query semplici e volume elevato · ~€0,0002/query</option>
              <option value="gpt-4.5-preview">gpt-4.5-preview — Transizione GPT-4→5 · contesto lungo · ~€0,08/query</option>
              <option value="gpt-4-turbo">gpt-4-turbo — Alta intelligenza · contesto 128k token · ~€0,02/query</option>
              <option value="gpt-4">gpt-4 — Affidabile e collaudato · ragionamento finanziario · ~€0,06/query</option>
            </optgroup>
            <optgroup label="── Serie GPT-3.5 (economici) ──">
              <option value="gpt-3.5-turbo">gpt-3.5-turbo — Massima economia · solo query molto semplici, SQL inaffidabile · ~€0,001/query</option>
            </optgroup>
            <optgroup label="── Serie GPT-5 (non ancora disponibili via API) ──">
              <option value="gpt-5.4">gpt-5.4 — ⚠ Non disponibile · massima precisione SQL · ~€0,01/query (stimato)</option>
              <option value="gpt-5.4-mini">gpt-5.4-mini — ⚠ Non disponibile · qualità GPT-5, costo ridotto · ~€0,002/query (stimato)</option>
              <option value="gpt-5.4-pro">gpt-5.4-pro — ⚠ Non disponibile · report avanzati · ~€0,05/query (stimato)</option>
              <option value="gpt-5.4-nano">gpt-5.4-nano — ⚠ Non disponibile · latenza minima · ~€0,001/query (stimato)</option>
              <option value="gpt-5.2">gpt-5.2 — ⚠ Non disponibile · ragionamento avanzato · ~€0,03/query (stimato)</option>
            </optgroup>
          </select>
          <div style={{fontSize:11,color:'#7a7571',marginTop:4}}>
            {t('settings.modelRecommend')} <strong>gpt-4o</strong>. {t('settings.modelNote')}
          </div>
        </div>
        <div style={{marginBottom:8}}>
          <div style={ST.label}>{t('settings.testPrompt')}</div>
          <textarea
            style={{...ST.input,height:60,resize:'vertical',fontFamily:'sans-serif'}}
            value={testAiPrompt}
            onChange={e=>setTestAiPrompt(e.target.value)}
            placeholder={t('settings.testPromptPlaceholder')}
          />
        </div>
        <div style={{display:'flex',gap:8,alignItems:'flex-start',flexWrap:'wrap'}}>
          <button style={{...ST.btn,background:'#7c3aed'}} onClick={testAi} disabled={testingAi}>
            {testingAi ? 'Test...' : `🤖 ${t('settings.testAi')}`}
          </button>
          {testAiMsg && (
            <span style={{
              fontSize:12,
              color: testAiMsg.startsWith('✅') ? '#2e7d52' : '#c0392b',
              background: testAiMsg.startsWith('✅') ? '#e8f5ec' : '#fdecea',
              padding:'6px 10px', borderRadius:6, flex:1, whiteSpace:'pre-wrap', wordBreak:'break-word'
            }}>
              {testAiMsg}
            </span>
          )}
        </div>

        {/* ── AI Usage / Token cost ───────────────────────────────── */}
        <div style={{marginTop:18, borderTop:'1px solid #e8e6e3', paddingTop:14}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8}}>
            <div>
              <div style={ST.label}>{t('settings.aiUsage')}</div>
              <div style={{fontSize:11, color:'#7a7571'}}>{t('settings.aiUsageDesc')}</div>
            </div>
            <div style={{display:'flex', gap:8}}>
              <button
                type="button"
                onClick={loadAiUsage}
                disabled={aiUsageLoading}
                style={{...ST.btnSm, padding:'6px 12px'}}
                title={t('settings.aiUsageRefresh')}
              >
                {aiUsageLoading ? '⏳' : '↻'} {t('settings.aiUsageRefresh')}
              </button>
              <button
                type="button"
                onClick={resetAiUsage}
                disabled={aiUsageLoading}
                style={{...ST.btnSm, padding:'6px 12px', background:'#fdecea', color:'#c0392b', border:'1px solid #f5c6cb'}}
                title={t('settings.aiUsageReset')}
              >
                🗑 {t('settings.aiUsageReset')}
              </button>
            </div>
          </div>

          {!aiUsage || aiUsage.error ? (
            <div style={{fontSize:12, color:'#7a7571', padding:10, background:'#f4f3f1', borderRadius:6}}>
              {aiUsageLoading ? t('common.loading') : (aiUsage?.error || t('settings.aiUsageEmpty'))}
            </div>
          ) : (
            <>
              {/* Totals */}
              <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10, marginBottom:12}}>
                <div style={{background:'#f0f4f8', border:'1px solid #c8d8e8', borderRadius:8, padding:'10px 12px'}}>
                  <div style={{fontSize:10, color:'#7a7571', textTransform:'uppercase', fontWeight:600}}>{t('settings.aiUsageCalls')}</div>
                  <div style={{fontSize:18, fontWeight:700, color:'#1c2b3a', marginTop:2}}>{(aiUsage.totals.calls||0).toLocaleString('it-IT')}</div>
                </div>
                <div style={{background:'#f0f4f8', border:'1px solid #c8d8e8', borderRadius:8, padding:'10px 12px'}}>
                  <div style={{fontSize:10, color:'#7a7571', textTransform:'uppercase', fontWeight:600}}>{t('settings.aiUsageTokens')}</div>
                  <div style={{fontSize:18, fontWeight:700, color:'#1c2b3a', marginTop:2}}>{(aiUsage.totals.total_tokens||0).toLocaleString('it-IT')}</div>
                  <div style={{fontSize:10, color:'#7a7571', marginTop:2}}>
                    in {(aiUsage.totals.prompt_tokens||0).toLocaleString('it-IT')} · out {(aiUsage.totals.completion_tokens||0).toLocaleString('it-IT')}
                  </div>
                </div>
                <div style={{background:'#fff8f0', border:'1px solid #f0d9b8', borderRadius:8, padding:'10px 12px'}}>
                  <div style={{fontSize:10, color:'#7a7571', textTransform:'uppercase', fontWeight:600}}>{t('settings.aiUsageCost')}</div>
                  <div style={{fontSize:18, fontWeight:700, color:'#c77d3a', marginTop:2}}>
                    € {(aiUsage.totals.cost_eur||0).toLocaleString('it-IT', {minimumFractionDigits:4, maximumFractionDigits:4})}
                  </div>
                  <div style={{fontSize:10, color:'#7a7571', marginTop:2}}>
                    ($ {(aiUsage.totals.cost_usd||0).toLocaleString('it-IT', {minimumFractionDigits:4, maximumFractionDigits:4})})
                  </div>
                </div>
              </div>

              {/* Collapsible details toggle */}
              <button
                type="button"
                onClick={toggleAiUsageExpanded}
                style={{
                  width:'100%', padding:'8px 12px', marginBottom: aiUsageExpanded ? 8 : 0,
                  background:'#f4f3f1', border:'1px solid #e2e0dd', borderRadius:6,
                  cursor:'pointer', fontSize:12, fontWeight:600, color:'#1c2b3a',
                  display:'flex', alignItems:'center', justifyContent:'space-between',
                  fontFamily:'sans-serif',
                }}
              >
                <span>{aiUsageExpanded ? '▾' : '▸'} {t('settings.aiUsageDetails')}</span>
                <span style={{fontSize:11, color:'#7a7571', fontWeight:400}}>
                  {aiUsageExpanded ? t('settings.aiUsageHide') : t('settings.aiUsageShow')}
                </span>
              </button>

              {aiUsageExpanded && (<>
              {/* By feature */}
              {aiUsage.byFeature?.length > 0 && (
                <table style={{width:'100%', borderCollapse:'collapse', fontSize:12, marginBottom:8, tableLayout:'fixed'}}>
                  <colgroup>
                    <col />
                    <col style={{width:160}} />
                    <col style={{width:160}} />
                    <col style={{width:160}} />
                  </colgroup>
                  <thead>
                    <tr style={{background:'#f4f3f1'}}>
                      <th style={{textAlign:'left',  padding:'6px 10px', fontSize:10, color:'#7a7571', textTransform:'uppercase', fontWeight:600}}>{t('settings.aiUsageFeature')}</th>
                      <th style={{textAlign:'right', padding:'6px 10px', fontSize:10, color:'#7a7571', textTransform:'uppercase', fontWeight:600}}>{t('settings.aiUsageCalls')}</th>
                      <th style={{textAlign:'right', padding:'6px 10px', fontSize:10, color:'#7a7571', textTransform:'uppercase', fontWeight:600}}>{t('settings.aiUsageTokens')}</th>
                      <th style={{textAlign:'right', padding:'6px 10px', fontSize:10, color:'#7a7571', textTransform:'uppercase', fontWeight:600}}>{t('settings.aiUsageCost')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiUsage.byFeature.map(f => (
                      <tr key={f.feature} style={{borderBottom:'1px solid #f4f3f1'}}>
                        <td style={{padding:'6px 10px', color:'#1c2b3a', fontWeight:600}}>{f.label}</td>
                        <td style={{padding:'6px 10px', textAlign:'right', color:'#1c2b3a'}}>{(f.calls||0).toLocaleString('it-IT')}</td>
                        <td style={{padding:'6px 10px', textAlign:'right', color:'#1c2b3a'}}>{(f.total_tokens||0).toLocaleString('it-IT')}</td>
                        <td style={{padding:'6px 10px', textAlign:'right', color:'#c77d3a', fontWeight:600}}>
                          € {(f.cost_eur||0).toLocaleString('it-IT', {minimumFractionDigits:4, maximumFractionDigits:4})}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* By user */}
              {aiUsage.byUser?.length > 0 && (
                <table style={{width:'100%', borderCollapse:'collapse', fontSize:12, marginBottom:8, tableLayout:'fixed'}}>
                  <colgroup>
                    <col />
                    <col style={{width:160}} />
                    <col style={{width:160}} />
                    <col style={{width:160}} />
                  </colgroup>
                  <thead>
                    <tr style={{background:'#f4f3f1'}}>
                      <th style={{textAlign:'left',  padding:'6px 10px', fontSize:10, color:'#7a7571', textTransform:'uppercase', fontWeight:600}}>{t('settings.aiUsageUser')}</th>
                      <th style={{textAlign:'right', padding:'6px 10px', fontSize:10, color:'#7a7571', textTransform:'uppercase', fontWeight:600}}>{t('settings.aiUsageCalls')}</th>
                      <th style={{textAlign:'right', padding:'6px 10px', fontSize:10, color:'#7a7571', textTransform:'uppercase', fontWeight:600}}>{t('settings.aiUsageTokens')}</th>
                      <th style={{textAlign:'right', padding:'6px 10px', fontSize:10, color:'#7a7571', textTransform:'uppercase', fontWeight:600}}>{t('settings.aiUsageCost')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiUsage.byUser.map(u => {
                      const isSystem = !u.name && !u.email;
                      const displayLabel = u.name || u.email || u.label || 'System';
                      const subtitle     = (u.name && u.email) ? u.email : null;
                      return (
                        <tr key={displayLabel + (subtitle||'')} style={{borderBottom:'1px solid #f4f3f1'}}>
                          <td style={{padding:'6px 10px', color: isSystem ? '#7a7571' : '#1c2b3a', fontWeight: 600, fontStyle: isSystem ? 'italic' : 'normal'}}>
                            {isSystem ? `⚙ System` : `👤 ${displayLabel}`}
                            {subtitle && <span style={{marginLeft:6, fontWeight:400, color:'#9e9b97', fontSize:11}}>({subtitle})</span>}
                          </td>
                          <td style={{padding:'6px 10px', textAlign:'right', color:'#1c2b3a'}}>{(u.calls||0).toLocaleString('it-IT')}</td>
                          <td style={{padding:'6px 10px', textAlign:'right', color:'#1c2b3a'}}>{(u.total_tokens||0).toLocaleString('it-IT')}</td>
                          <td style={{padding:'6px 10px', textAlign:'right', color:'#c77d3a', fontWeight:600}}>
                            € {(u.cost_eur||0).toLocaleString('it-IT', {minimumFractionDigits:4, maximumFractionDigits:4})}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {aiUsage.since && (
                <div style={{fontSize:10, color:'#9e9b97', textAlign:'right'}}>
                  {t('settings.aiUsageSince')}: {new Date(aiUsage.since).toLocaleString('it-IT')}
                </div>
              )}
              </>)}
            </>
          )}
        </div>

        {/* AI Chat Suggestions */}
        <div style={{marginTop:16,borderTop:'1px solid #e8e6e3',paddingTop:14}}>
          <div style={ST.label}>{t('settings.suggestions')}</div>
          <div style={{fontSize:11,color:'#7a7571',marginBottom:10}}>
            {t('settings.suggestionsDesc')}
          </div>
          {[1,2,3].map(n => (
            <div key={n} style={{marginBottom:8}}>
              <div style={{...ST.label, marginBottom:4, color:'#9e9b97'}}>{t('settings.suggestion')} {n}</div>
              <input
                style={{...ST.input}}
                value={settings[`ai_suggestion_${n}`] || ''}
                onChange={e => set(`ai_suggestion_${n}`, e.target.value)}
                placeholder={[
                  'Quante fatture non sono ancora pagate?',
                  'Qual è il totale fatturato nel 2026?',
                  'Quali fornitori hanno più fatture in attesa?',
                ][n-1]}
              />
            </div>
          ))}
        </div>

        {/* AI Chat System Prompt */}
        <div style={{marginTop:16,borderTop:'1px solid #e8e6e3',paddingTop:14}}>
          <div style={ST.label}>{t('settings.systemPrompt')}</div>
          <div style={{fontSize:11,color:'#7a7571',marginBottom:8}}>
            {t('settings.systemPromptDesc')}
          </div>
          <textarea
            style={{...ST.input, height:200, resize:'vertical', fontFamily:'monospace', fontSize:11}}
            value={settings.ai_chat_system_prompt || ''}
            onChange={e => set('ai_chat_system_prompt', e.target.value)}
            placeholder={t('settings.systemPromptPlaceholder')}
          />
        </div>

        {/* AI SQL Rules */}
        <div style={{marginTop:16,borderTop:'1px solid #e8e6e3',paddingTop:14}}>
          <div style={ST.label}>{t('settings.sqlRules')}</div>
          <div style={{fontSize:11,color:'#7a7571',marginBottom:8}}>
            {t('settings.sqlRulesDesc')}
          </div>
          <textarea
            style={{...ST.input, height:200, resize:'vertical', fontFamily:'monospace', fontSize:11}}
            value={settings.ai_chat_sql_rules || ''}
            onChange={e => set('ai_chat_sql_rules', e.target.value)}
            placeholder={t('settings.sqlRulesPlaceholder')}
          />
        </div>
      </SettingsSection>

      <SettingsSection title={`⏰ ${t('settings.scheduler')}`}>
        <div style={ST.label}>{t('settings.autoImport')}</div>
        <select style={{...ST.select,marginBottom:12,maxWidth:200}} value={settings.import_enabled||'true'} onChange={e=>set('import_enabled',e.target.value)}>
          <option value="true">{t('common.yes')}</option>
          <option value="false">{t('common.no')}</option>
        </select>
        <SettingsField label={t('settings.interval')} k="import_interval_min" placeholder="60" settings={settings} set={set} />
        <SettingsField
          label={t('settings.importDateFrom')}
          k="import_date_from"
          placeholder="2026-01-01"
          settings={settings} set={set}
        />
        <div style={{fontSize:11,color:'#7a7571',marginTop:-8,marginBottom:12}}>
          {t('settings.importDateFromDesc')}
        </div>
        <SettingsField
          label={t('settings.businessYear')}
          k="import_anno"
          placeholder="es. 2026"
          settings={settings} set={set}
        />
        <div style={{fontSize:11,color:'#7a7571',marginTop:-8,marginBottom:12}}>
          {t('settings.businessYearDesc')}
        </div>
      </SettingsSection>

      <SettingsSection title={`❌ ${t('settings.rifiutateTitle')}`}>
        <div style={{fontSize:12,color:'#7a7571',marginBottom:12}}>
          {t('settings.rifiutateDesc')}
        </div>
        <div style={ST.label}>{t('settings.rifiutateReminderEnabled')}</div>
        <select
          style={{...ST.select,marginBottom:12,maxWidth:200}}
          value={settings.rifiutate_reminder_enabled || 'false'}
          onChange={e=>set('rifiutate_reminder_enabled',e.target.value)}
        >
          <option value="true">{t('common.yes')}</option>
          <option value="false">{t('common.no')}</option>
        </select>
        <SettingsField
          label={t('settings.rifiutateReminderHours')}
          k="rifiutate_reminder_interval_hours"
          placeholder="24"
          settings={settings} set={set}
        />
        <div style={{fontSize:11,color:'#7a7571',marginTop:-8,marginBottom:12}}>
          {t('settings.rifiutateReminderHoursDesc')}
        </div>
      </SettingsSection>

      <SettingsSection title={`⚡ ${t('settings.automation')}`}>
        <div style={{marginBottom:16}}>
          <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}>
            <input
              type="checkbox"
              checked={settings.auto_assign_category === 'true'}
              onChange={e => set('auto_assign_category', e.target.checked ? 'true' : 'false')}
              style={{width:16,height:16,cursor:'pointer'}}
            />
            <span style={{fontSize:13,color:'#1c2b3a',fontWeight:600}}>{t('settings.autoAssign')}</span>
          </label>
          <div style={{fontSize:11,color:'#7a7571',marginTop:6,marginLeft:26}}>
            {t('settings.autoAssignDesc')}
          </div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <button
            style={{...ST.btn, background:'#6a3fa3'}}
            onClick={runAutoAssign}
            disabled={autoAssigning}
          >
            {autoAssigning ? '⏳ ...' : `⚡ ${t('settings.manualSync')}`}
          </button>
          {autoAssignMsg && (
            <span style={{
              fontSize:12,
              color: autoAssignMsg.startsWith('✅') ? '#2e7d52' : '#c0392b',
              background: autoAssignMsg.startsWith('✅') ? '#eaf7ef' : '#fdecea',
              padding:'5px 10px', borderRadius:6,
            }}>
              {autoAssignMsg}
            </span>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title={`🔄 ${t('settings.maintenance')}`}>
        <div style={{fontSize:13,color:'#5a5551',marginBottom:12}}>
          {t('settings.syncPaymentDesc')}
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <button
            style={{...ST.btn,background:'#1a6fa3'}}
            onClick={syncPaymentStatus}
            disabled={syncingPayment}
          >
            {syncingPayment ? '⏳ ...' : `🔄 ${t('settings.syncPayment')}`}
          </button>
          {syncPaymentMsg && (
            <span style={{
              fontSize:12,
              color: syncPaymentMsg.startsWith('✅') ? '#2e7d52' : '#c0392b',
              background: syncPaymentMsg.startsWith('✅') ? '#eaf7ef' : '#fdecea',
              padding:'5px 10px', borderRadius:6,
            }}>
              {syncPaymentMsg}
            </span>
          )}
        </div>
        <div style={{marginTop:16,fontSize:13,color:'#5a5551',marginBottom:8}}>
          {t('settings.repairPdfDesc')}
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <button
            style={{...ST.btn,background:'#7b4fa6'}}
            onClick={repairPdfIds}
            disabled={repairingPdf}
          >
            {repairingPdf ? '⏳ ...' : `📎 ${t('settings.repairPdf')}`}
          </button>
          {repairPdfMsg && (
            <span style={{
              fontSize:12,
              color: repairPdfMsg.startsWith('✅') ? '#2e7d52' : '#c0392b',
              background: repairPdfMsg.startsWith('✅') ? '#eaf7ef' : '#fdecea',
              padding:'5px 10px', borderRadius:6,
            }}>
              {repairPdfMsg}
            </span>
          )}
        </div>
      </SettingsSection>
    </div>
  );
}

export default { Categories, AuditLog, SysLog, Users, Settings };
