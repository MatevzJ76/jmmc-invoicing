import React, { useEffect, useState, useCallback } from 'react';
import api from '../utils/api';
import { useLang } from '../hooks/useLang';
import { useAuth } from '../hooks/useAuth';
import { getDelegatoLabel } from '../utils/delegato';

// COST_TYPES removed — filter uses categories from DB

function loadSupplierPrefs(email) {
  try {
    const raw = localStorage.getItem(`supplier_hints_prefs_${email}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveSupplierPrefs(email, prefs) {
  try {
    localStorage.setItem(`supplier_hints_prefs_${email}`, JSON.stringify(prefs));
  } catch {}
}

export default function SupplierHints() {
  const { t } = useLang();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const initialPrefs = loadSupplierPrefs(user?.email) || {};
  const [rows,       setRows]       = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState(initialPrefs.search    || '');
  const [filterCat,  setFilterCat]  = useState(initialPrefs.filterCat || '');
  const [filterDel,  setFilterDel]  = useState(initialPrefs.filterDel || '');
  const [editId,     setEditId]     = useState(null);   // id vrstice v edit modu
  const [editData,   setEditData]   = useState({});     // { costType, categoryId }
  const [saving,     setSaving]     = useState(false);
  const [deleteId,   setDeleteId]   = useState(null);   // confirm dialog
  const [showAdd,    setShowAdd]    = useState(false);   // add rule form
  const [addData,    setAddData]    = useState({ supplier: '', categoryId: '', matchPattern: '', responsible: '' });
  const [addSaving,  setAddSaving]  = useState(false);
  const [syncId,     setSyncId]     = useState(null);   // hint id for sync confirm
  const [syncCount,  setSyncCount]  = useState(0);      // count of invoices to update
  const [syncing,    setSyncing]    = useState(false);
  const [syncLoading,setSyncLoading]= useState(false);  // loading count

  const [suppliers, setSuppliers] = useState([]);  // unique supplier names from invoices
  const [responsibles, setResponsibles] = useState([]); // [{ value, label }] for friendly name lookup

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [hintsRes, catsRes, suppRes, usersRes] = await Promise.all([
        api.get('/api/supplier-hints'),
        api.get('/api/categories'),
        api.get('/api/invoices/suppliers'),
        api.get('/api/users'),
      ]);
      setRows(hintsRes.data?.data || []);
      setCategories(catsRes.data?.data || catsRes.data || []);
      setSuppliers(suppRes.data?.suppliers || []);

      // Build responsibles lookup from active users (preserve original casing)
      const seen = new Set();
      const list = (usersRes.data?.data || [])
        .filter(u => u.active)
        .map(u => ({ value: (u.responsible || u.name || '').trim(), label: u.name }))
        .filter(u => u.value && !seen.has(u.value.toLowerCase()) && seen.add(u.value.toLowerCase()));
      setResponsibles(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Persist filters per user
  useEffect(() => {
    if (!user?.email) return;
    saveSupplierPrefs(user.email, { search, filterCat, filterDel });
  }, [user?.email, search, filterCat, filterDel]);

  function startEdit(row) {
    setEditId(row.id);
    setEditData({ costType: row.cost_type || '', categoryId: row.category_id || '', responsible: row.responsible || '', matchPattern: row.match_pattern || '' });
  }

  function cancelEdit() {
    setEditId(null);
    setEditData({});
  }

  async function saveEdit(id) {
    setSaving(true);
    try {
      await api.put(`/api/supplier-hints/${id}`, {
        costType:     editData.costType   || null,
        categoryId:   editData.categoryId || null,
        matchPattern: editData.matchPattern?.trim() || null,
      });
      await load();
      setEditId(null);
    } catch (err) {
      alert(t('common.error') + ': ' + (err.response?.data?.error || err.message));
    } finally { setSaving(false); }
  }

  async function confirmDelete(id) {
    try {
      await api.delete(`/api/supplier-hints/${id}`);
      setDeleteId(null);
      await load();
    } catch (err) {
      alert(t('common.error') + ': ' + (err.response?.data?.error || err.message));
    }
  }

  async function saveNewRule() {
    if (!addData.supplier || !addData.categoryId) return;
    setAddSaving(true);
    try {
      // Delegato namerno ne pošiljamo — backend ga izpelje iz kategorije
      // (categories.responsible), ker je delegato strogo vezan na tipo costo.
      await api.post('/api/supplier-hints', {
        supplier:     addData.supplier,
        categoryId:   addData.categoryId,
        matchPattern: addData.matchPattern || null,
      });
      setShowAdd(false);
      setAddData({ supplier: '', categoryId: '', matchPattern: '', responsible: '' });
      await load();
    } catch (err) {
      alert(t('common.error') + ': ' + (err.response?.data?.error || err.message));
    } finally { setAddSaving(false); }
  }

  async function startSync(id) {
    setSyncLoading(true);
    setSyncId(id);
    try {
      const { data: res } = await api.post(`/api/supplier-hints/${id}/apply?dryRun=true`);
      setSyncCount(res.count || 0);
    } catch (err) {
      alert(t('common.error') + ': ' + (err.response?.data?.error || err.message));
      setSyncId(null);
    } finally { setSyncLoading(false); }
  }

  async function confirmSync() {
    if (!syncId) return;
    setSyncing(true);
    try {
      const { data: res } = await api.post(`/api/supplier-hints/${syncId}/apply`);
      setSyncId(null);
      setSyncCount(0);
      await load();
      alert(`✅ ${t('suppliers.syncDone')}: ${res.updated}`);
    } catch (err) {
      alert(t('common.error') + ': ' + (err.response?.data?.error || err.message));
    } finally { setSyncing(false); }
  }

  // Unikati za delegato dropdown
  const uniqueDelegati = [...new Set(rows.map(r => r.responsible).filter(Boolean))].sort();

  const filtered = rows.filter(r => {
    if (search && !r.supplier?.toLowerCase().includes(search.toLowerCase()) &&
                  !r.supplier_code?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCat  && r.category_id !== filterCat)  return false;
    if (filterDel  && r.responsible !== filterDel)   return false;
    return true;
  });

  return (
    <div style={S.page}>
      <style>{`
        .pattern-info { position: relative; cursor: help; }
        .pattern-info .pattern-tip { display: none; position: absolute; left: 0; top: 22px; z-index: 100;
          background: #1c2b3a; color: #fff; padding: 10px 14px; border-radius: 8px; font-size: 12px;
          line-height: 1.6; white-space: pre-line; min-width: 320px; box-shadow: 0 4px 16px rgba(0,0,0,0.25);
          font-weight: 400; text-transform: none; letter-spacing: 0; }
        .pattern-info:hover .pattern-tip { display: block; }
      `}</style>
      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={S.title}>🏭 {t('suppliers.title')}</div>
          <div style={S.sub}>
            {t('suppliers.subtitle')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin && (
            <button style={S.addBtn} onClick={() => setShowAdd(v => !v)}>
              ＋ {t('suppliers.addRule')}
            </button>
          )}
          <button style={S.refreshBtn} onClick={load} title={t('common.reload')}>↺</button>
        </div>
      </div>

      {/* Filtri */}
      <div style={S.filtersRow}>
        <input
          style={S.filterInput}
          placeholder={t('suppliers.search')}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select style={S.filterSelect} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="">{t('suppliers.allCostTypes')}</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.cost_type}</option>)}
        </select>
        <select style={S.filterSelect} value={filterDel} onChange={e => setFilterDel(e.target.value)}>
          <option value="">{t('suppliers.allDelegates')}</option>
          {uniqueDelegati.map(d => <option key={d} value={d}>{getDelegatoLabel(d, responsibles)}</option>)}
        </select>
      </div>

      {/* Add rule form — compact single row */}
      {showAdd && isAdmin && (
        <div style={S.addForm}>
          <div style={S.addFormRow}>
            <div style={S.addField}>
              <label style={S.addLabel}>{t('suppliers.supplier')}</label>
              <input
                list="supplier-list"
                style={S.addInput}
                placeholder={t('suppliers.supplierPlaceholder')}
                value={addData.supplier}
                onChange={e => setAddData(d => ({ ...d, supplier: e.target.value }))}
              />
              <datalist id="supplier-list">
                {suppliers.map(s => <option key={s} value={s}/>)}
              </datalist>
            </div>
            <div style={S.addField}>
              <label style={S.addLabel}>{t('suppliers.category')}</label>
              <select
                style={S.addSelect}
                value={addData.categoryId}
                onChange={e => setAddData(d => ({ ...d, categoryId: e.target.value }))}
              >
                <option value="">— {t('suppliers.noneOption')} —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.cost_type}</option>)}
              </select>
            </div>
            <div style={S.addField}>
              <label style={S.addLabel}>{t('suppliers.delegate')}</label>
              {(() => {
                const selectedCat = categories.find(c => c.id === addData.categoryId);
                const derived = selectedCat?.responsible || '';
                return (
                  <div
                    style={{
                      ...S.addInput,
                      display: 'flex',
                      alignItems: 'center',
                      background: '#f4f3f1',
                      color: derived ? '#2a2421' : '#a09b96',
                      cursor: 'not-allowed',
                      userSelect: 'none',
                    }}
                    title={t('suppliers.delegateFromCategory') || 'Delegato je določen iz kategorije (Categorie → Responsabile)'}
                  >
                    {derived
                      ? getDelegatoLabel(derived, responsibles)
                      : `— ${t('suppliers.delegateAutoHint') || 'izberi kategorijo'} —`}
                  </div>
                );
              })()}
            </div>
            <div style={S.addFieldNarrow}>
              <label style={S.addLabel}>{t('suppliers.matchPattern')}</label>
              <input
                style={S.addInput}
                placeholder={t('suppliers.matchPatternHint')}
                value={addData.matchPattern}
                onChange={e => setAddData(d => ({ ...d, matchPattern: e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, paddingBottom: 1 }}>
              <button
                style={S.btnSave}
                onClick={saveNewRule}
                disabled={addSaving || !addData.supplier || !addData.categoryId}
              >
                {addSaving ? '⏳' : `💾 ${t('common.save')}`}
              </button>
              <button style={S.btnCancel} onClick={() => { setShowAdd(false); setAddData({ supplier: '', categoryId: '', matchPattern: '', responsible: '' }); }}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabela */}
      <div style={S.tableWrap}>
        {loading ? (
          <div style={S.empty}>⏳ {t('common.loading')}</div>
        ) : filtered.length === 0 ? (
          <div style={S.empty}>
            {(search || filterCat || filterDel)
              ? t('suppliers.noResults')
              : t('suppliers.noData')}
          </div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr style={S.thr}>
                <th style={S.th}>{t('suppliers.supplier')}</th>
                <th style={S.th}>{t('suppliers.category')}</th>
                <th style={S.th}>{t('suppliers.delegate')}</th>
                <th style={{ ...S.th, textAlign: 'center' }}>{t('suppliers.source')}</th>
                <th style={S.th}>
                  {t('suppliers.matchPattern')}{' '}
                  <span className="pattern-info">ℹ️
                    <span className="pattern-tip">{t('suppliers.matchPatternTooltip')}</span>
                  </span>
                </th>
                <th style={{ ...S.th, textAlign: 'center' }}>{t('suppliers.usageCount')}</th>
                <th style={{ ...S.th, textAlign: 'center' }}>{t('suppliers.lastUsed')}</th>
                <th style={{ ...S.th, textAlign: 'right' }}>{t('suppliers.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => (
                <tr key={row.id} style={S.tr}>
                  <td style={{ ...S.td, fontWeight: 600, color: '#1c2b3a' }}>
                    {row.supplier || '—'}
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
                            categoryId:  catId,
                            costType:    cat?.cost_type   || d.costType,
                            responsible: cat?.responsible || d.responsible,
                          }));
                        }}
                      >
                        <option value="">— {t('suppliers.noneOption')} —</option>
                        {categories.map(c => (
                          <option key={c.id} value={c.id}>{c.cost_type}</option>
                        ))}
                      </select>
                    ) : (
                      <span style={S.catBadge}>{row.categories?.cost_type || '—'}</span>
                    )}
                  </td>

                  <td style={S.td}>
                    {editId === row.id ? (
                      // Preview delegato durante edit
                      editData.responsible
                        ? <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            fontSize: 12, fontWeight: 600, color: '#1c2b3a',
                            opacity: 0.7, fontStyle: 'italic',
                          }}>
                            <span style={{
                              display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                              background: String(editData.responsible).toUpperCase() === 'FEDERICO' ? '#1c2b3a' : '#c77d3a',
                            }}/>
                            {getDelegatoLabel(editData.responsible, responsibles)}
                          </span>
                        : <span style={{ color: '#bbb', fontSize: 12 }}>—</span>
                    ) : (
                      row.responsible
                        ? <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            fontSize: 12, fontWeight: 600, color: '#1c2b3a',
                          }}>
                            <span style={{
                              display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                              background: String(row.responsible).toUpperCase() === 'FEDERICO' ? '#1c2b3a' : '#c77d3a',
                            }}/>
                            {getDelegatoLabel(row.responsible, responsibles)}
                          </span>
                        : <span style={{ color: '#bbb', fontSize: 12 }}>—</span>
                    )}
                  </td>

                  {/* Vir (Source) */}
                  <td style={{ ...S.td, textAlign: 'center', fontSize: 16 }} title={row.source === 'manual' ? t('suppliers.manual') : t('suppliers.auto')}>
                    {row.source === 'manual' ? '✏️' : '🤖'}
                  </td>

                  {/* Match pattern */}
                  <td style={S.td}>
                    {editId === row.id ? (
                      <input
                        style={S.addInput}
                        placeholder={t('suppliers.matchPatternHint')}
                        value={editData.matchPattern}
                        onChange={e => setEditData(d => ({ ...d, matchPattern: e.target.value }))}
                      />
                    ) : (
                      row.match_pattern
                        ? <code style={S.patternBadge}>{row.match_pattern}</code>
                        : <span style={{ color: '#bbb', fontSize: 12 }}>—</span>
                    )}
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
                    {!isAdmin ? (
                      <span style={{ fontSize: 11, color: '#b5b0ab' }}>—</span>
                    ) : editId === row.id ? (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          style={S.btnSave}
                          onClick={() => saveEdit(row.id)}
                          disabled={saving}
                        >
                          {saving ? '⏳' : `💾 ${t('common.save')}`}
                        </button>
                        <button style={S.btnCancel} onClick={cancelEdit}>
                          {t('common.cancel')}
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          style={S.btnSync}
                          onClick={() => startSync(row.id)}
                          title={t('suppliers.syncTitle')}
                          disabled={syncLoading && syncId === row.id}
                        >
                          {syncLoading && syncId === row.id ? '⏳' : '🔄'}
                        </button>
                        <button style={S.btnEdit} onClick={() => startEdit(row)}>
                          ✏️ {t('common.edit')}
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
          {filtered.length} {t('suppliers.ofTotal')} {rows.length} {t('suppliers.suppliersLabel')}
        </div>
      )}

      {/* Delete confirm dialog */}
      {deleteId && (() => {
        const row = rows.find(r => r.id === deleteId);
        return (
          <div style={S.overlay}>
            <div style={S.dialog}>
              <div style={S.dialogTitle}>🗑 {t('suppliers.deleteConfirm')}</div>
              <div style={S.dialogBody}>
                <strong>{row?.supplier}</strong> → <strong>{row?.categories?.cost_type || row?.cost_type || '—'}</strong>
                <br/><br/>
                <span style={{ color: '#5a5551', fontSize: 13 }}>
                  {t('suppliers.deleteDesc')}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  style={{ ...S.btnCancel, padding: '8px 16px' }}
                  onClick={() => setDeleteId(null)}
                >
                  {t('common.cancel')}
                </button>
                <button
                  style={{ ...S.btnDelete, padding: '8px 16px', fontSize: 13, fontWeight: 700 }}
                  onClick={() => confirmDelete(deleteId)}
                >
                  🗑 {t('common.delete')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Sync confirm dialog */}
      {syncId && !syncLoading && (() => {
        const row = rows.find(r => r.id === syncId);
        return (
          <div style={S.overlay}>
            <div style={S.dialog}>
              <div style={S.dialogTitle}>🔄 {t('suppliers.syncConfirm')}</div>
              <div style={S.dialogBody}>
                <strong>{row?.supplier}</strong>
                {row?.match_pattern && <> · <code style={S.patternBadge}>{row.match_pattern}</code></>}
                <> → <strong>{row?.categories?.cost_type || row?.cost_type || '—'}</strong></>
                <> · <strong>{getDelegatoLabel(row?.responsible, responsibles) || '—'}</strong></>
                <br/><br/>
                {syncCount > 0 ? (
                  <span style={{ color: '#1a56db', fontSize: 14, fontWeight: 700 }}>
                    {t('suppliers.syncCountMsg').replace('{n}', syncCount)}
                  </span>
                ) : (
                  <span style={{ color: '#7a7571', fontSize: 13 }}>
                    {t('suppliers.syncNone')}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  style={{ ...S.btnCancel, padding: '8px 16px' }}
                  onClick={() => { setSyncId(null); setSyncCount(0); }}
                >
                  {t('common.cancel')}
                </button>
                {syncCount > 0 && (
                  <button
                    style={{ ...S.btnSave, padding: '8px 16px', fontSize: 13 }}
                    onClick={confirmSync}
                    disabled={syncing}
                  >
                    {syncing ? '⏳' : `🔄 ${t('suppliers.syncApply')}`}
                  </button>
                )}
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
  page:       { maxWidth: 1300, margin: '0 auto' },
  header:      { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 12 },
  title:       { fontSize: 20, fontWeight: 700, color: '#1c2b3a', fontFamily: 'sans-serif' },
  sub:         { fontSize: 13, color: '#7a7571', marginTop: 4, fontFamily: 'sans-serif', maxWidth: 560 },
  refreshBtn:  { padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e0dd', background: '#fff', cursor: 'pointer', fontSize: 16 },
  filtersRow:  { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  filterInput: { padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e0dd', fontSize: 13, flex: '1 1 200px', fontFamily: 'sans-serif', outline: 'none' },
  filterSelect:{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e0dd', fontSize: 13, background: '#fff', cursor: 'pointer', fontFamily: 'sans-serif' },
  tableWrap:  { background: '#fff', borderRadius: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', overflowX: 'auto' },
  table:      { width: '100%', minWidth: 1050, borderCollapse: 'collapse', fontFamily: 'sans-serif' },
  thr:        { background: '#f4f3f1' },
  th:         { padding: '10px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#7a7571', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' },
  tr:         { borderBottom: '1px solid #f4f3f1', transition: 'background 0.1s' },
  td:         { padding: '10px 10px', fontSize: 13, color: '#2a2421', verticalAlign: 'middle' },
  empty:      { padding: '40px 24px', textAlign: 'center', color: '#888', fontFamily: 'sans-serif', fontSize: 14 },
  footer:     { marginTop: 12, fontSize: 12, color: '#7a7571', fontFamily: 'sans-serif', textAlign: 'right' },
  catBadge:   { fontSize: 13, color: '#1c2b3a' },
  typeBadge:  { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 },
  countBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: 10, background: '#e8f0fe', color: '#1a56db', fontSize: 12, fontWeight: 700 },
  inlineSelect:{ padding: '5px 8px', borderRadius: 5, border: '1px solid #c8d8e8', fontSize: 12, background: '#fff', cursor: 'pointer', minWidth: 120 },
  addBtn:     { padding: '8px 16px', borderRadius: 6, border: 'none', background: '#1c2b3a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'sans-serif' },
  addForm:    { background: '#f8f7f6', borderRadius: 10, padding: '12px 16px', marginBottom: 16, border: '1px solid #e2e0dd' },
  addFormRow: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  addField:   { display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 180px', maxWidth: 260 },
  addFieldNarrow: { display: 'flex', flexDirection: 'column', gap: 3, flex: '0 1 160px' },
  addLabel:   { fontSize: 10, fontWeight: 700, color: '#7a7571', textTransform: 'uppercase', fontFamily: 'sans-serif' },
  addInput:   { padding: '7px 10px', borderRadius: 6, border: '1px solid #e2e0dd', fontSize: 13, fontFamily: 'sans-serif', outline: 'none' },
  addSelect:  { padding: '7px 10px', borderRadius: 6, border: '1px solid #e2e0dd', fontSize: 13, background: '#fff', cursor: 'pointer', fontFamily: 'sans-serif' },
  patternBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, background: '#f0f0f0', color: '#555', fontSize: 12, fontFamily: 'monospace' },
  btnSync:    { padding: '5px 8px', borderRadius: 5, border: '1px solid #e8f0fe', background: '#e8f0fe', color: '#1a56db', cursor: 'pointer', fontSize: 13 },
  btnEdit:    { padding: '5px 10px', borderRadius: 5, border: '1px solid #c8d8e8', background: '#fff', color: '#1c2b3a', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  btnDelete:  { padding: '5px 8px', borderRadius: 5, border: '1px solid #fdecea', background: '#fdecea', color: '#c0392b', cursor: 'pointer', fontSize: 13 },
  btnSave:    { padding: '5px 12px', borderRadius: 5, border: 'none', background: '#1c2b3a', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 },
  btnCancel:  { padding: '5px 12px', borderRadius: 5, border: '1px solid #e2e0dd', background: '#f4f3f1', color: '#5a5551', cursor: 'pointer', fontSize: 12 },
  overlay:    { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 },
  dialog:     { background: '#fff', borderRadius: 12, padding: 24, maxWidth: 420, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  dialogTitle:{ fontSize: 16, fontWeight: 700, color: '#1c2b3a', marginBottom: 12, fontFamily: 'sans-serif' },
  dialogBody: { fontSize: 14, color: '#2a2421', marginBottom: 20, fontFamily: 'sans-serif', lineHeight: 1.5 },
};
