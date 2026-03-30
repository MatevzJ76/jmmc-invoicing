import React, { useEffect, useState, useCallback } from 'react';
import api from '../utils/api';

const COST_TYPES = ['Costo', 'Investimento', 'Servizio', 'Utenza', 'Altro'];

const ROLE_COLORS_SH = { controller:'#2e7d52', revisore:'#c77d3a', admin:'#1c2b3a', supervisor:'#1a6fa3', delegato:'#5a4a8a' };

export default function SupplierHints() {
  const [rows,       setRows]       = useState([]);
  const [categories, setCategories] = useState([]);
  const [assignable, setAssignable] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [filterCat,  setFilterCat]  = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDel,  setFilterDel]  = useState('');
  const [editId,     setEditId]     = useState(null);   // id vrstice v edit modu
  const [editData,   setEditData]   = useState({});     // { costType, categoryId }
  const [saving,     setSaving]     = useState(false);
  const [deleteId,   setDeleteId]   = useState(null);   // confirm dialog

  const nameRoleMap = assignable.reduce((acc, u) => { acc[u.name] = u.role; return acc; }, {});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [hintsRes, catsRes, usersRes] = await Promise.all([
        api.get('/api/supplier-hints'),
        api.get('/api/categories'),
        api.get('/api/users/assignable'),
      ]);
      setRows(hintsRes.data?.data || []);
      setCategories(catsRes.data?.data || catsRes.data || []);
      setAssignable(usersRes.data?.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function startEdit(row) {
    setEditId(row.id);
    setEditData({ costType: row.cost_type || '', categoryId: row.category_id || '' });
  }

  function cancelEdit() {
    setEditId(null);
    setEditData({});
  }

  async function saveEdit(id) {
    setSaving(true);
    try {
      await api.put(`/api/supplier-hints/${id}`, {
        costType:   editData.costType   || null,
        categoryId: editData.categoryId || null,
      });
      await load();
      setEditId(null);
    } catch (err) {
      alert('Errore: ' + (err.response?.data?.error || err.message));
    } finally { setSaving(false); }
  }

  async function confirmDelete(id) {
    try {
      await api.delete(`/api/supplier-hints/${id}`);
      setDeleteId(null);
      await load();
    } catch (err) {
      alert('Errore: ' + (err.response?.data?.error || err.message));
    }
  }

  const filtered = rows.filter(r => {
    if (search    && !r.supplier?.toLowerCase().includes(search.toLowerCase()) &&
                     !r.supplier_code?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCat  && r.category_id !== filterCat)  return false;
    if (filterType && r.cost_type   !== filterType)  return false;
    if (filterDel  && r.responsible !== filterDel)   return false;
    return true;
  });

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={S.title}>🏭 Fornitori — Tipo costo</div>
          <div style={S.sub}>
            Associazioni apprese automaticamente. Modificabili o eliminabili: alla successiva selezione manuale verranno ricreate.
          </div>
        </div>
        <button style={S.refreshBtn} onClick={load} title="Ricarica">↺</button>
      </div>

      {/* Filtri */}
      <div style={S.filtersRow}>
        <input
          style={S.filterInput}
          placeholder="Cerca fornitore..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select style={S.filterSelect} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="">Tutte le categorie</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select style={S.filterSelect} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">Tutti i tipi costo</option>
          {COST_TYPES.map(ct => <option key={ct} value={ct}>{ct}</option>)}
        </select>
        <select style={S.filterSelect} value={filterDel} onChange={e => setFilterDel(e.target.value)}>
          <option value="">Tutti i delegati</option>
          {assignable.map(u => <option key={u.name} value={u.name}>{u.name}</option>)}
        </select>
      </div>

      {/* Tabela */}
      <div style={S.tableWrap}>
        {loading ? (
          <div style={S.empty}>⏳ Caricamento...</div>
        ) : filtered.length === 0 ? (
          <div style={S.empty}>
            {search
              ? 'Nessun fornitore trovato.'
              : 'Nessuna associazione ancora registrata. Verrà popolata automaticamente alla prima assegnazione di categoria.'}
          </div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr style={S.thr}>
                <th style={S.th}>Fornitore</th>
                <th style={S.th}>Codice</th>
                <th style={S.th}>Categoria</th>
                <th style={S.th}>Tipo costo</th>
                <th style={S.th}>Delegato</th>
                <th style={{ ...S.th, textAlign: 'center' }}>Utilizzi</th>
                <th style={{ ...S.th, textAlign: 'center' }}>Ultimo uso</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => (
                <tr key={row.id} style={S.tr}>
                  <td style={{ ...S.td, fontWeight: 600, color: '#1c2b3a' }}>
                    {row.supplier || '—'}
                  </td>
                  <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12, color: '#7a7571' }}>
                    {row.supplier_code || '—'}
                  </td>

                  {/* Categoria — edit mode */}
                  <td style={S.td}>
                    {editId === row.id ? (
                      <select
                        style={S.inlineSelect}
                        value={editData.categoryId}
                        onChange={e => {
                          const catId = e.target.value;
                          const cat   = categories.find(c => c.id === catId);
                          setEditData(d => ({
                            ...d,
                            categoryId: catId,
                            costType: cat?.cost_type || d.costType,
                          }));
                        }}
                      >
                        <option value="">— nessuna —</option>
                        {categories.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span style={S.catBadge}>{row.categories?.name || '—'}</span>
                    )}
                  </td>

                  {/* Tipo costo — edit mode */}
                  <td style={S.td}>
                    {editId === row.id ? (
                      <select
                        style={S.inlineSelect}
                        value={editData.costType}
                        onChange={e => setEditData(d => ({ ...d, costType: e.target.value }))}
                      >
                        <option value="">— nessuno —</option>
                        {COST_TYPES.map(ct => (
                          <option key={ct} value={ct}>{ct}</option>
                        ))}
                      </select>
                    ) : (
                      row.cost_type
                        ? <span style={{ ...S.typeBadge, ...costTypeColor(row.cost_type) }}>{row.cost_type}</span>
                        : <span style={{ color: '#bbb', fontSize: 12 }}>—</span>
                    )}
                  </td>

                  <td style={S.td}>
                    {row.responsible
                      ? <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          fontSize: 12, fontWeight: 600, color: '#1c2b3a',
                        }}>
                          <span style={{
                            display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                            background: ROLE_COLORS_SH[nameRoleMap[row.responsible]] || '#888',
                          }}/>
                          {row.responsible}
                        </span>
                      : <span style={{ color: '#bbb', fontSize: 12 }}>—</span>
                    }
                  </td>

                  <td style={{ ...S.td, textAlign: 'center' }}>
                    <span style={S.countBadge}>{row.usage_count}</span>
                  </td>

                  <td style={{ ...S.td, textAlign: 'center', fontSize: 12, color: '#7a7571' }}>
                    {row.last_used_at
                      ? new Date(row.last_used_at).toLocaleDateString('it-IT')
                      : '—'}
                  </td>

                  {/* Azioni */}
                  <td style={{ ...S.td, textAlign: 'right' }}>
                    {editId === row.id ? (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          style={S.btnSave}
                          onClick={() => saveEdit(row.id)}
                          disabled={saving}
                        >
                          {saving ? '⏳' : '💾 Salva'}
                        </button>
                        <button style={S.btnCancel} onClick={cancelEdit}>
                          Annulla
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button style={S.btnEdit} onClick={() => startEdit(row)}>
                          ✏️ Modifica
                        </button>
                        <button style={S.btnDelete} onClick={() => setDeleteId(row.id)}>
                          🗑
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer count */}
      {!loading && rows.length > 0 && (
        <div style={S.footer}>
          {filtered.length} di {rows.length} fornitori
        </div>
      )}

      {/* Delete confirm dialog */}
      {deleteId && (() => {
        const row = rows.find(r => r.id === deleteId);
        return (
          <div style={S.overlay}>
            <div style={S.dialog}>
              <div style={S.dialogTitle}>🗑 Eliminare associazione?</div>
              <div style={S.dialogBody}>
                <strong>{row?.supplier}</strong> → <strong>{row?.categories?.name || row?.cost_type || '—'}</strong>
                <br/><br/>
                <span style={{ color: '#5a5551', fontSize: 13 }}>
                  La prossima volta che si assegna una categoria a questo fornitore, l'associazione verrà ricreata automaticamente.
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  style={{ ...S.btnCancel, padding: '8px 16px' }}
                  onClick={() => setDeleteId(null)}
                >
                  Annulla
                </button>
                <button
                  style={{ ...S.btnDelete, padding: '8px 16px', fontSize: 13, fontWeight: 700 }}
                  onClick={() => confirmDelete(deleteId)}
                >
                  🗑 Elimina
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function costTypeColor(ct) {
  const map = {
    'Costo':       { background: '#e8f0fe', color: '#1a56db' },
    'Investimento':{ background: '#fef3c7', color: '#92400e' },
    'Servizio':    { background: '#e8f5ec', color: '#2e7d52' },
    'Utenza':      { background: '#fdecea', color: '#c0392b' },
    'Altro':       { background: '#f4f3f1', color: '#5a5551' },
  };
  return map[ct] || { background: '#f4f3f1', color: '#5a5551' };
}

const S = {
  page:       { maxWidth: 1100, margin: '0 auto' },
  header:      { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 12 },
  title:       { fontSize: 20, fontWeight: 700, color: '#1c2b3a', fontFamily: 'sans-serif' },
  sub:         { fontSize: 13, color: '#7a7571', marginTop: 4, fontFamily: 'sans-serif', maxWidth: 560 },
  refreshBtn:  { padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e0dd', background: '#fff', cursor: 'pointer', fontSize: 16 },
  filtersRow:  { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  filterInput: { padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e0dd', fontSize: 13, flex: '1 1 200px', fontFamily: 'sans-serif', outline: 'none' },
  filterSelect:{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e0dd', fontSize: 13, background: '#fff', cursor: 'pointer', fontFamily: 'sans-serif' },
  tableWrap:  { background: '#fff', borderRadius: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', overflow: 'hidden' },
  table:      { width: '100%', borderCollapse: 'collapse', fontFamily: 'sans-serif' },
  thr:        { background: '#f4f3f1' },
  th:         { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#7a7571', textTransform: 'uppercase', letterSpacing: '0.04em' },
  tr:         { borderBottom: '1px solid #f4f3f1', transition: 'background 0.1s' },
  td:         { padding: '11px 14px', fontSize: 13, color: '#2a2421', verticalAlign: 'middle' },
  empty:      { padding: '40px 24px', textAlign: 'center', color: '#888', fontFamily: 'sans-serif', fontSize: 14 },
  footer:     { marginTop: 12, fontSize: 12, color: '#7a7571', fontFamily: 'sans-serif', textAlign: 'right' },
  catBadge:   { fontSize: 13, color: '#1c2b3a' },
  typeBadge:  { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 },
  countBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: 10, background: '#e8f0fe', color: '#1a56db', fontSize: 12, fontWeight: 700 },
  inlineSelect:{ padding: '5px 8px', borderRadius: 5, border: '1px solid #c8d8e8', fontSize: 12, background: '#fff', cursor: 'pointer', minWidth: 120 },
  btnEdit:    { padding: '5px 10px', borderRadius: 5, border: '1px solid #c8d8e8', background: '#fff', color: '#1c2b3a', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  btnDelete:  { padding: '5px 8px', borderRadius: 5, border: '1px solid #fdecea', background: '#fdecea', color: '#c0392b', cursor: 'pointer', fontSize: 13 },
  btnSave:    { padding: '5px 12px', borderRadius: 5, border: 'none', background: '#1c2b3a', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 },
  btnCancel:  { padding: '5px 12px', borderRadius: 5, border: '1px solid #e2e0dd', background: '#f4f3f1', color: '#5a5551', cursor: 'pointer', fontSize: 12 },
  overlay:    { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 },
  dialog:     { background: '#fff', borderRadius: 12, padding: 24, maxWidth: 420, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  dialogTitle:{ fontSize: 16, fontWeight: 700, color: '#1c2b3a', marginBottom: 12, fontFamily: 'sans-serif' },
  dialogBody: { fontSize: 14, color: '#2a2421', marginBottom: 20, fontFamily: 'sans-serif', lineHeight: 1.5 },
};
