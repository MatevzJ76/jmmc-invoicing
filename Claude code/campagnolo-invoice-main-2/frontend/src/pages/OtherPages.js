import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import { useLang } from '../hooks/useLang';
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

const ROLE_COLORS_MAP = { admin:'#1c2b3a', supervisor:'#1a6fa3', controller:'#2e7d52', delegato:'#5a4a8a', revisore:'#c77d3a' };

export function Categories() {
  const { t } = useLang();
  const [cats,       setCats]      = useState([]);
  const [assignable, setAssignable]= useState([]);
  const [form,       setForm]      = useState({ name:'', costType:'', responsible:'' });
  const [adding,     setAdding]    = useState(false);
  const [loading,    setLoading]   = useState(true);

  const load = () => api.get('/api/categories').then(r=>setCats(r.data.data||[])).finally(()=>setLoading(false));
  useEffect(()=>{
    load();
    api.get('/api/users/assignable').then(r=>{
      const users = r.data.data||[];
      setAssignable(users);
      if (users.length > 0) setForm(f=>({...f, responsible: users[0].name}));
    }).catch(()=>{});
  }, []);

  // Mappa nome → role per colori badge
  const nameRoleMap = assignable.reduce((acc, u) => { acc[u.name] = u.role; return acc; }, {});

  async function save() {
    try {
      await api.post('/api/categories',{ name:form.name, costType:form.costType||form.name, responsible:form.responsible });
      setForm(f=>({ name:'',costType:'',responsible: assignable[0]?.name||'' }));
      setAdding(false);
      load();
    } catch(e) { alert(e.response?.data?.error||e.message); }
  }

  async function deactivate(id) {
    if (!window.confirm('Disattivare questa categoria?')) return;
    await api.delete(`/api/categories/${id}`);
    load();
  }

  return (
    <div style={ST.page}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <h1 style={ST.title}>{t('categories.title')}</h1>
        <button style={ST.btn} onClick={()=>setAdding(a=>!a)}>+ {t('categories.add')}</button>
      </div>
      {adding && (
        <div style={{...ST.card,padding:16,marginBottom:16}}>
          <div style={ST.row}>
            <div style={{flex:1}}>
              <div style={ST.label}>{t('categories.name')}</div>
              <input style={ST.input} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="es. Carburante" />
            </div>
            <div style={{flex:1}}>
              <div style={ST.label}>{t('categories.costType')}</div>
              <input style={ST.input} value={form.costType} onChange={e=>setForm(f=>({...f,costType:e.target.value}))} placeholder="es. Carburante" />
            </div>
            <div style={{flex:1}}>
              <div style={ST.label}>{t('categories.responsible')}</div>
              <select style={ST.select} value={form.responsible} onChange={e=>setForm(f=>({...f,responsible:e.target.value}))}>
                {assignable.map(u=><option key={u.id} value={u.name}>{u.name}</option>)}
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
            <th style={ST.th}>{t('categories.name')}</th>
            <th style={ST.th}>{t('categories.costType')}</th>
            <th style={ST.th}>{t('categories.responsible')}</th>
            <th style={ST.th}>{t('categories.active')}</th>
            <th style={ST.th}></th>
          </tr></thead>
          <tbody>
            {cats.map(c=>(
              <tr key={c.id} style={ST.tr}>
                <td style={ST.td}>{c.name}</td>
                <td style={ST.td}>{c.cost_type}</td>
                <td style={ST.td}>
                  <span style={{...ST.badge,background:ROLE_COLORS_MAP[nameRoleMap[c.responsible]]||'#888'}}>{c.responsible||'—'}</span>
                </td>
                <td style={ST.td}>{c.active?'✓':'—'}</td>
                <td style={ST.td}>
                  {c.active && <button style={ST.btnSm} onClick={()=>deactivate(c.id)}>Disattiva</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
    if (entries.length === 0) { alert('Nessuna voce da esportare.'); return; }
    setExporting(true);
    try {
      const wsData = [
        ['Data/Ora', 'Utente', 'Email', 'N. Fattura', 'Fornitore', 'Totale', 'Azione'],
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
      alert('Errore esportazione: ' + err.message);
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
          {exporting ? '⏳' : '📥 Esporta XLSX'}
        </button>
      </div>
      <div style={{background:'#e8f5ec',border:'1px solid #b8dfc4',borderRadius:8,padding:'10px 14px',marginBottom:16,fontSize:13,color:'#2e7d52'}}>
        📋 Questo registro traccia solo le approvazioni "Controllato e Pagabile". Visibile ad Admin e Revisore.
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
          {entries.length===0&&<div style={{padding:32,textAlign:'center',color:'#888'}}>Nessuna voce trovata</div>}
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
  const [entries,   setEntries]   = useState([]);
  const [level,     setLevel]     = useState('');
  const [category,  setCategory]  = useState('');
  const [search,    setSearch]    = useState('');
  const [expanded,  setExpanded]  = useState({});
  const [loading,   setLoading]   = useState(true);
  const [count,     setCount]     = useState(0);
  const [exporting, setExporting] = useState(false);

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

  const errors   = entries.filter(e=>e.level==='ERROR').length;
  const warnings = entries.filter(e=>e.level==='WARN').length;

  async function clean() {
    if (!window.confirm('Eliminare tutte le voci più vecchie di 90 giorni?')) return;
    const r = await api.post('/api/syslog/clean');
    alert(`Eliminati ${r.data.deleted} log`);
    load();
  }

  async function exportXLSX() {
    if (entries.length === 0) { alert('Nessuna voce da esportare.'); return; }
    setExporting(true);
    try {
      const fmtDT2 = d => d ? new Date(d).toLocaleString('it-IT') : '';
      const wsData = [
        ['Data/Ora', 'Livello', 'Categoria', 'Azione', 'Dettaglio', 'Email Utente', 'Durata (ms)', 'Errore'],
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
      alert('Errore esportazione: ' + err.message);
    } finally { setExporting(false); }
  }

  const fmtDT = d => d ? new Date(d).toLocaleString('it-IT') : '—';

  return (
    <div style={ST.page}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <h1 style={{...ST.title,margin:0}}>{t('syslog.title')}</h1>
          <span style={{fontSize:11,color:'#2e7d52',background:'#e8f5ec',padding:'3px 8px',borderRadius:12,fontWeight:600}}>
            ⟳ auto 5s
          </span>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button style={{...ST.btnSm,padding:'7px 12px'}} onClick={clean}>{t('syslog.clean')}</button>
          <button style={{...ST.btn,background:'#2e7d52'}} onClick={exportXLSX} disabled={exporting}>
            {exporting ? '⏳' : '📥 Esporta XLSX'}
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
          <option value="">Tutti i livelli</option>
          {['INFO','WARN','ERROR','DEBUG'].map(l=><option key={l}>{l}</option>)}
        </select>
        <select style={{...ST.select,flex:'0 0 150px'}} value={category} onChange={e=>setCategory(e.target.value)}>
          <option value="">Tutte le categorie</option>
          {['API_ER','IMPORT','PDF','AUTH','EMAIL','SCHEDULER','SYSTEM'].map(c=><option key={c}>{c}</option>)}
        </select>
        <input style={{...ST.input,flex:1}} placeholder="Cerca action, detail, errore..."
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
          {entries.length===0&&<div style={{padding:32,textAlign:'center',color:'#888'}}>Nessuna voce trovata</div>}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// USERS
// ══════════════════════════════════════════════════════════════
const ROLE_COLORS = { admin:'#1c2b3a', supervisor:'#1a6fa3', controller:'#2e7d52', delegato:'#5a4a8a', revisore:'#c77d3a' };

export function Users() {
  const { t } = useLang();
  const [users,   setUsers]   = useState([]);
  const [form,    setForm]    = useState({ email:'',name:'',role:'revisore' });
  const [adding,  setAdding]  = useState(false);
  const [editId,  setEditId]  = useState(null);   // ID utente in modifica
  const [editForm,setEditForm]= useState({});      // dati form edit
  const [saving,  setSaving]  = useState(false);
  const [loading, setLoading] = useState(true);

  const load = () => api.get('/api/users').then(r=>setUsers(r.data.data||[])).finally(()=>setLoading(false));
  useEffect(()=>{ load(); },[]);

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
    setEditForm({ name: u.name, email: u.email, role: u.role, active: u.active });
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

  return (
    <div style={ST.page}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <h1 style={ST.title}>{t('users.title')}</h1>
        <button style={ST.btn} onClick={()=>{ setAdding(a=>!a); setEditId(null); }}>+ {t('users.add')}</button>
      </div>

      {/* Form nuovo utente */}
      {adding && (
        <div style={{...ST.card,padding:16,marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:600,color:'#1c2b3a',marginBottom:12}}>Nuovo utente</div>
          <div style={ST.row}>
            <div style={{flex:2}}>
              <div style={ST.label}>{t('users.email')}</div>
              <input style={ST.input} type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="nome@esempio.com" />
            </div>
            <div style={{flex:1}}>
              <div style={ST.label}>{t('users.name')}</div>
              <input style={ST.input} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Nome Cognome" />
            </div>
            <div style={{flex:1}}>
              <div style={ST.label}>{t('users.role')}</div>
              <select style={ST.select} value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))}>
                <option value="admin">Admin</option>
                <option value="supervisor">Supervisore</option>
                <option value="controller">Controller</option>
                <option value="delegato">Delegato</option>
                <option value="revisore">Revisore</option>
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
            <th style={ST.th}>{t('users.role')}</th>
            <th style={ST.th}>{t('users.active')}</th>
            <th style={{...ST.th,width:180}}></th>
          </tr></thead>
          <tbody>
            {users.map(u => {
              const isEditing = editId === u.id;
              return (
                <tr key={u.id} style={{...ST.tr, background: isEditing ? '#f8f7ff' : undefined}}>
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
                          <option value="admin">Admin</option>
                          <option value="supervisor">Supervisore</option>
                          <option value="controller">Controller</option>
                          <option value="delegato">Delegato</option>
                          <option value="revisore">Revisore</option>
                        </select>
                      </td>
                      {/* Attivo */}
                      <td style={{...ST.td,paddingTop:8,paddingBottom:8}}>
                        <select
                          style={{...ST.selectSm,width:'auto'}}
                          value={editForm.active ? 'true' : 'false'}
                          onChange={e=>setEditForm(f=>({...f,active:e.target.value==='true'}))}
                        >
                          <option value="true">✓ Attivo</option>
                          <option value="false">— Inattivo</option>
                        </select>
                      </td>
                      {/* Azioni edit */}
                      <td style={{...ST.td,paddingTop:8,paddingBottom:8}}>
                        <div style={{display:'flex',gap:6}}>
                          <button style={ST.btnGrn} onClick={saveEdit} disabled={saving}>
                            {saving ? '...' : '✓ Salva'}
                          </button>
                          <button style={ST.btnSm} onClick={cancelEdit}>Annulla</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={ST.td}>{u.name}</td>
                      <td style={{...ST.td,fontSize:12,color:'#7a7571'}}>{u.email}</td>
                      <td style={ST.td}>
                        <span style={{...ST.badge,background:ROLE_COLORS[u.role]||'#888'}}>{u.role}</span>
                      </td>
                      <td style={ST.td}>
                        {u.active
                          ? <span style={{color:'#2e7d52',fontWeight:700}}>✓</span>
                          : <span style={{color:'#bbb'}}>—</span>}
                      </td>
                      <td style={ST.td}>
                        <div style={{display:'flex',gap:6}}>
                          <button style={{...ST.btnSm,color:'#1a6fa3'}} onClick={()=>startEdit(u)}>✏ Modifica</button>
                          <button style={ST.btnSm} onClick={()=>toggleActive(u)}>
                            {u.active ? 'Disattiva' : 'Riattiva'}
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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

// ══════════════════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════════════════
export function Settings() {
  const { t } = useLang();
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

  useEffect(()=>{
    api.get('/api/settings').then(r=>setSettings(r.data.settings||{})).finally(()=>setLoading(false));
  },[]);

  const set = (k,v) => setSettings(s=>({...s,[k]:v}));

  async function save() {
    setSaving(true);
    try { await api.put('/api/settings',{ settings }); alert(t('common.success')); }
    catch(e) { alert(e.message); }
    finally { setSaving(false); }
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
    } catch(e) { setTestAiMsg('❌ '+(e.response?.data?.error||e.message)); }
    finally { setTestingAi(false); }
  }

  async function testConn() {
    setTesting(true); setTestMsg('');
    try {
      const r = await api.post('/api/settings/test-er-api');
      setTestMsg(r.data.ok ? '✅ '+t('settings.connOk') : '❌ '+t('settings.connFail'));
    } catch(e) { setTestMsg('❌ '+(e.response?.data?.message||e.message)); }
    finally { setTesting(false); }
  }

  if (loading) return <div style={{padding:40,color:'#888'}}>{t('common.loading')}</div>;

  return (
    <div style={ST.page}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <h1 style={ST.title}>{t('settings.title')}</h1>
        <button style={ST.btn} onClick={save} disabled={saving}>{saving?'Salvataggio...':t('settings.save')}</button>
      </div>
      <SettingsSection title="🔌 e-računi API">
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
      <SettingsSection title="📧 Email (Resend)">
        <SettingsField label="Resend API Key"    k="resend_api_key" placeholder="re_..." type="password" settings={settings} set={set} />
        <div style={{fontSize:11,color:'#7a7571',marginTop:-8,marginBottom:12}}>
          Pridobi API key na <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer" style={{color:'#1a6fa3'}}>resend.com/api-keys</a>
        </div>
        <SettingsField label="Mittente (FROM)"   k="email_from"     placeholder="campagnolo@jmmc.si" type="email" settings={settings} set={set} />
        <SettingsField label="Admin"              k="email_admin"    placeholder="admin@jmmc.si" type="email" settings={settings} set={set} />
        <SettingsField label="Federico"           k="email_federico" placeholder="federico@..." type="email" settings={settings} set={set} />
        <SettingsField label="Varga"              k="email_varga"    placeholder="varga@..."    type="email" settings={settings} set={set} />
        <SettingsField label="Errori di sistema"  k="email_errors"   placeholder="errors@..."   type="email" settings={settings} set={set} />
        <div style={{display:'flex',gap:8,alignItems:'center',marginTop:4}}>
          <button style={{...ST.btn,background:'#1a6fa3'}} onClick={testEmail} disabled={testingEmail}>
            {testingEmail ? 'Invio...' : '📧 Test Email'}
          </button>
          {testEmailMsg && (
            <span style={{fontSize:12,color:testEmailMsg.startsWith('✅')?'#2e7d52':'#c0392b'}}>
              {testEmailMsg}
            </span>
          )}
        </div>
      </SettingsSection>
      <SettingsSection title="🤖 AI Model (OpenAI)">
        <SettingsField label="OpenAI API Key"  k="openai_api_key" placeholder="sk-..." type="password" settings={settings} set={set} />
        <SettingsField label="Modello"          k="openai_model"   placeholder="gpt-4o" settings={settings} set={set} />
        <div style={{fontSize:11,color:'#7a7571',marginTop:-8,marginBottom:12}}>
          Esempi: gpt-4o, gpt-4-turbo, gpt-3.5-turbo
        </div>
        <div style={{marginBottom:8}}>
          <div style={ST.label}>Test prompt</div>
          <textarea
            style={{...ST.input,height:60,resize:'vertical',fontFamily:'sans-serif'}}
            value={testAiPrompt}
            onChange={e=>setTestAiPrompt(e.target.value)}
            placeholder="Scrivi un prompt di test..."
          />
        </div>
        <div style={{display:'flex',gap:8,alignItems:'flex-start',flexWrap:'wrap'}}>
          <button style={{...ST.btn,background:'#7c3aed'}} onClick={testAi} disabled={testingAi}>
            {testingAi ? 'Test...' : '🤖 Test AI'}
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
      </SettingsSection>

      <SettingsSection title="⏰ Scheduler">
        <div style={ST.label}>Auto-import abilitato</div>
        <select style={{...ST.select,marginBottom:12,maxWidth:200}} value={settings.import_enabled||'true'} onChange={e=>set('import_enabled',e.target.value)}>
          <option value="true">Sì</option>
          <option value="false">No</option>
        </select>
        <SettingsField label="Intervallo (minuti)" k="import_interval_min" placeholder="60" settings={settings} set={set} />
        <SettingsField label="Data di importazione da" k="import_date_from"  placeholder="2026-01-01" settings={settings} set={set} />
      </SettingsSection>
    </div>
  );
}

export default { Categories, AuditLog, SysLog, Users, Settings };
