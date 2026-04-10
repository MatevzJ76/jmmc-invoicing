import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import { useLang } from '../hooks/useLang';
import { useAuth } from '../hooks/useAuth';
import { getDelegatoLabel, getDelegatoLabelById } from '../utils/delegato';

const fmtCur  = n => n != null ? `€ ${Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, useGrouping: true })}` : '—';
const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '—';
const fmtDT   = d => d ? new Date(d).toLocaleString('it-IT')     : '—';

export default function InvoiceModal({ invoiceId, onClose, onRefresh }) {
  const { t, lang } = useLang();
  const { user } = useAuth();

  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [comment,    setComment]    = useState('');
  const [verifying,  setVerifying]  = useState(false);
  const [tab, setTab] = useState('review');
  const [categories, setCategories] = useState([]);
  const [responsibles, setResponsibles] = useState([]); // for friendly delegato display
  const [usersRaw,     setUsersRaw]     = useState([]); // raw /api/users payload (FAZA B: lookup by id)

  const [editResponsible,   setEditResponsible]   = useState('');
  const [editCategoryId,    setEditCategoryId]    = useState('');
  const [editStatus,        setEditStatus]        = useState('');
  const [editPaymentStatus, setEditPaymentStatus] = useState('');
  const [saving,            setSaving]            = useState(false);
  const [savedMsg,          setSavedMsg]          = useState(false);
  const [savingPayment,     setSavingPayment]     = useState(false);
  const [savingNotifica,    setSavingNotifica]    = useState(false);
  const [savingDistinta,    setSavingDistinta]    = useState(false);

  const [categoryHint,    setCategoryHint]    = useState(null);
  const [hintActive,      setHintActive]      = useState(false);

  const [rejectDialog,  setRejectDialog]  = useState(false);
  const [statusNote,    setStatusNote]    = useState('');
  const [noteDialog,    setNoteDialog]    = useState(false);
  const [noteDraft,     setNoteDraft]     = useState('');

  const [pdfPreview,     setPdfPreview]     = useState(null);
  const [tabPdfItems,    setTabPdfItems]    = useState([]);   // [{ url, name }]
  const [tabPdfActive,   setTabPdfActive]   = useState(0);
  const [tabPdfLoading,  setTabPdfLoading]  = useState(false);
  const [tabPdfError,    setTabPdfError]    = useState(false);
  const [tabPdfRefetch,  setTabPdfRefetch]  = useState(false);

  // Faza 2 — JMMC rejection resolution
  const [resolveDialog,   setResolveDialog]   = useState(null); // null | 'credit_note' | 'linked' | 'closed'
  const [resolveNote,     setResolveNote]     = useState('');
  const [resolveSaving,   setResolveSaving]   = useState(false);
  const [linkSearchTerm,  setLinkSearchTerm]  = useState('');
  const [linkResults,     setLinkResults]     = useState([]);
  const [linkSelected,    setLinkSelected]    = useState(null); // {id, supplier, inv_number, ...}
  const [linkSearching,   setLinkSearching]   = useState(false);

  const [translateText,    setTranslateText]    = useState('');
  const [translateLoading, setTranslateLoading] = useState(false);
  const [translateError,   setTranslateError]   = useState('');
  const [translateCached,  setTranslateCached]  = useState(false);
  const [translateMeta,    setTranslateMeta]    = useState(null); // { created_at, created_by, model }
  const [translateLang,    setTranslateLang]    = useState('');   // lang of loaded translation
  const [copyFeedback,    setCopyFeedback]    = useState(false);

  useEffect(() => {
    api.get(`/api/invoices/${invoiceId}`)
      .then(r => {
        setData(r.data);
        // FAZA B: prefer canonical alias from responsible_user_id lookup,
        // fall back to legacy responsible string. usersRaw may not yet be
        // loaded on the very first render — that's fine, the value will
        // be re-aligned by the editing UI once the user list arrives.
        const inv = r.data.invoice;
        const fkAlias = inv?.responsible_user_id
          ? getDelegatoLabelById(inv.responsible_user_id, usersRaw)
          : '';
        setEditResponsible(fkAlias || inv?.responsible || '');
        setEditCategoryId(r.data.invoice?.category_id    || '');
        setEditStatus(r.data.invoice?.status             || 'Pending');
        setStatusNote(r.data.invoice?.status_note  || '');
        setEditPaymentStatus(r.data.invoice?.payment_status || '');
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    api.get('/api/categories')
      .then(r => setCategories((r.data?.data || r.data || []).filter(c => c.active !== false)))
      .catch(() => {});

    api.get('/api/users').then(r => {
      const raw = (r.data?.data || []).filter(u => u.active);
      setUsersRaw(raw);
      const seen = new Set();
      const list = raw
        .map(u => ({ value: (u.responsible || u.name || '').trim(), label: u.name, id: u.id }))
        .filter(u => u.value && !seen.has(u.value.toLowerCase()) && seen.add(u.value.toLowerCase()));
      setResponsibles(list);
    }).catch(() => {});
  }, [invoiceId]);

  useEffect(() => {
    if (!data || user?.role !== 'admin') return;
    if (data.invoice?.category_id) return;
    api.get(`/api/invoices/${invoiceId}/hint`)
      .then(r => {
        const hint = r.data?.hint;
        if (!hint) return;
        setCategoryHint(hint);
        setEditCategoryId(hint.category_id);
        setHintActive(true);
        if (hint.responsible) setEditResponsible(hint.responsible);
      })
      .catch(() => {});
  }, [data, invoiceId, user]);

  useEffect(() => {
    if (!hintActive || !categoryHint || categories.length === 0) return;
    const cat = categories.find(c => c.id === categoryHint.category_id);
    if (cat?.responsible) setEditResponsible(cat.responsible);
  }, [categories, hintActive, categoryHint]);

  useEffect(() => {
    return () => {
      if (pdfPreview?.url) URL.revokeObjectURL(pdfPreview.url);
      tabPdfItems.forEach(item => URL.revokeObjectURL(item.url));
    };
  }, [pdfPreview]); // intentionally omit tabPdfItems — cleanup on unmount only

  // Force revisore to the review tab — they cannot access any other view.
  useEffect(() => {
    if (user?.role === 'revisore' && tab !== 'review') setTab('review');
  }, [user?.role, tab]);

  useEffect(() => {
    if (tab !== 'pdf' && tab !== 'review') return;
    if (tabPdfItems.length > 0 || tabPdfLoading || tabPdfError) return;
    setTabPdfLoading(true);
    api.get(`/api/invoices/${invoiceId}/pdf/original`)
      .then(({ data: pdf }) => {
        // API returns { attachments: [...] } for original type
        const list = pdf.attachments || [pdf];
        const parsed = list.map(att => {
          const bytes = atob(att.contentsB64);
          const arr   = new Uint8Array(bytes.length);
          for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
          const blob  = new Blob([arr], { type: 'application/pdf' });
          return { url: URL.createObjectURL(blob), name: att.fileName };
        });
        setTabPdfItems(parsed);
      })
      .catch(() => setTabPdfError(true))
      .finally(() => setTabPdfLoading(false));
  }, [tab, invoiceId, tabPdfItems, tabPdfLoading, tabPdfError]);

  // Auto-load cached translation when translate tab opens or language changes
  useEffect(() => {
    if (tab !== 'translate') return;
    if (translateLang === lang && (translateText || translateLoading)) return;
    setTranslateText('');
    setTranslateError('');
    setTranslateCached(false);
    setTranslateMeta(null);
    setTranslateLang(lang);
    api.get(`/api/ai/translate-pdf/${invoiceId}/${lang}`)
      .then(({ data: res }) => {
        if (res.cached && res.translation) {
          setTranslateText(res.translation);
          setTranslateCached(true);
          setTranslateMeta({ created_at: res.created_at, created_by: res.created_by, model: res.model });
        }
      })
      .catch(() => {});
  }, [tab, lang, invoiceId]); // eslint-disable-line

  async function saveInvoice({ categoryId, status, responsible, statusNote: noteArg = null }) {
    setSaving(true);
    try {
      // FAZA B: when we know the user UUID from the loaded users list, send it
      // alongside the alias so the backend can dual-write responsible_user_id.
      // Backend ignores responsible_user_id silently when the column is absent.
      let responsibleUserId = null;
      if (responsible && Array.isArray(usersRaw) && usersRaw.length) {
        const norm = String(responsible).toLowerCase().trim();
        const match = usersRaw.find(u =>
          String(u.responsible || '').toLowerCase().trim() === norm ||
          String(u.name || '').toLowerCase().trim() === norm
        );
        if (match) responsibleUserId = match.id;
      }
      await api.put(`/api/invoices/${invoiceId}/category`, {
        categoryId: categoryId  || null,
        status,
        responsible:         responsible || null,
        responsible_user_id: responsibleUserId,
        statusNote:  noteArg || null,
      });
      const r = await api.get(`/api/invoices/${invoiceId}`);
      setData(r.data);
      setCategoryHint(null);
      setHintActive(false);
      onRefresh();
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 3000);
    } catch (err) {
      alert(t('common.error') + ': ' + (err.response?.data?.error || err.message));
    } finally { setSaving(false); }
  }
  async function saveWithStatus(newStatus, note = '') {
    await saveInvoice({ categoryId: editCategoryId, status: newStatus, responsible: editResponsible, statusNote: note });
  }
  function handleStatusBtn(newStatus) {
    if (!editResponsible) return;
    if (newStatus === 'Rejected') { setRejectDialog(true); }
    else { setEditStatus('Approved'); setStatusNote(''); saveInvoice({ categoryId: editCategoryId, status: 'Approved', responsible: editResponsible }); }
  }
  function confirmReject() {
    setEditStatus('Rejected');
    setRejectDialog(false);
    saveInvoice({ categoryId: editCategoryId, status: 'Rejected', responsible: editResponsible, statusNote: statusNote });
  }
  function cancelReject() { setRejectDialog(false); }

  function handleResetStatus() {
    if (!window.confirm(t('invoice.resetConfirm'))) return;
    setEditStatus('Pending');
    setStatusNote('');
    saveInvoice({ categoryId: editCategoryId, status: 'Pending', responsible: editResponsible, statusNote: null });
  }

  async function handleSaveCategory() { await saveWithStatus(editStatus, statusNote); }

  async function handleVerify() {
    if (!window.confirm(t('invoice.verifyConfirm'))) return;
    setVerifying(true);
    try {
      await api.put(`/api/invoices/${invoiceId}/verify`, { comment });
      const r = await api.get(`/api/invoices/${invoiceId}`);
      setData(r.data);
      onRefresh();
    } catch (err) {
      alert(t('common.error') + ': ' + (err.response?.data?.error || err.message));
    } finally { setVerifying(false); }
  }

  async function handleRejectViaVerify() {
    if (!comment || !comment.trim()) {
      alert(t('invoice.rejectNoteRequired') || 'Inserisci una nota per il rifiuto');
      return;
    }
    if (!window.confirm(t('invoice.rejectConfirm') || 'Confermare il rifiuto della fattura?')) return;
    setVerifying(true);
    try {
      await api.put(`/api/invoices/${invoiceId}/verify`, { comment, status: 'Rejected' });
      const r = await api.get(`/api/invoices/${invoiceId}`);
      setData(r.data);
      onRefresh();
      alert('✕ ' + (t('invoice.rejectSuccess') || 'Fattura rifiutata'));
    } catch (err) {
      alert(t('common.error') + ': ' + (err.response?.data?.error || err.message));
    } finally { setVerifying(false); }
  }

  async function downloadPDF(type) {
    try {
      const { data: pdf } = await api.get(`/api/invoices/${invoiceId}/pdf/${type}`);
      const bytes = atob(pdf.contentsB64);
      const arr   = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob  = new Blob([arr], { type: 'application/pdf' });
      const url   = URL.createObjectURL(blob);
      if (pdfPreview?.url) URL.revokeObjectURL(pdfPreview.url);
      setPdfPreview({ url, fileName: pdf.fileName });
    } catch (err) { alert(err.response?.data?.error || err.message || t('invoice.pdfNotAvail')); }
  }

  function closePdfPreview() {
    if (pdfPreview?.url) URL.revokeObjectURL(pdfPreview.url);
    setPdfPreview(null);
  }
  function forcePdfDownload() {
    if (!pdfPreview) return;
    const link = document.createElement('a');
    link.href = pdfPreview.url; link.download = pdfPreview.fileName; link.click();
  }
  function tabPdfDownload() {
    const item = tabPdfItems[tabPdfActive];
    if (!item) return;
    const link = document.createElement('a');
    link.href = item.url; link.download = item.name || 'fattura.pdf';
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  }
  async function handlePdfRefetch() {
    setTabPdfRefetch(true);
    // revoke old blob URLs
    tabPdfItems.forEach(item => URL.revokeObjectURL(item.url));
    setTabPdfItems([]);
    setTabPdfActive(0);
    setTabPdfError(false);
    try {
      const { data: pdf } = await api.post(`/api/invoices/${invoiceId}/pdf/refetch`);
      const list = pdf.attachments || [];
      const parsed = list.map(att => {
        const bytes = atob(att.contentsB64);
        const arr   = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        const blob  = new Blob([arr], { type: 'application/pdf' });
        return { url: URL.createObjectURL(blob), name: att.fileName };
      });
      if (parsed.length > 0) setTabPdfItems(parsed);
      else setTabPdfError(true);
    } catch {
      setTabPdfError(true);
    } finally {
      setTabPdfRefetch(false);
    }
  }
  async function handlePaymentStatusChange(value) {
    setEditPaymentStatus(value);
    setSavingPayment(true);
    try {
      await api.put(`/api/invoices/${invoiceId}/payment`, { paymentStatus: value || null });
      const r = await api.get(`/api/invoices/${invoiceId}`);
      setData(r.data);
      onRefresh();
    } catch (err) {
      alert(t('common.error') + ': ' + (err.response?.data?.error || err.message));
    } finally { setSavingPayment(false); }
  }

  async function handleNotificaChange(inviato) {
    setSavingNotifica(true);
    try {
      await api.put(`/api/invoices/${invoiceId}/notifica`, { inviato });
      const r = await api.get(`/api/invoices/${invoiceId}`);
      setData(r.data);
      onRefresh();
    } catch (err) {
      alert(t('common.error') + ': ' + (err.response?.data?.error || err.message));
    } finally { setSavingNotifica(false); }
  }

  async function handleDistintaChange(inviato) {
    setSavingDistinta(true);
    try {
      await api.put(`/api/invoices/${invoiceId}/distinta-status`, { inviato });
      const r = await api.get(`/api/invoices/${invoiceId}`);
      setData(r.data);
      onRefresh();
    } catch (err) {
      alert(t('common.error') + ': ' + (err.response?.data?.error || err.message));
    } finally { setSavingDistinta(false); }
  }

  // ── Faza 2: JMMC rejection resolution helpers ─────────────
  function openResolveDialog(kind) {
    setResolveDialog(kind);
    setResolveNote('');
    setLinkSearchTerm('');
    setLinkResults([]);
    setLinkSelected(null);
  }
  function closeResolveDialog() {
    if (resolveSaving) return;
    setResolveDialog(null);
    setResolveNote('');
    setLinkSelected(null);
    setLinkResults([]);
  }
  async function searchLinkable() {
    setLinkSearching(true);
    try {
      const params = new URLSearchParams({ q: linkSearchTerm, excludeId: invoiceId });
      // Auto-narrow to same supplier when search term is empty
      if (!linkSearchTerm.trim() && data?.invoice?.supplier) {
        params.set('supplier', data.invoice.supplier);
      }
      const r = await api.get(`/api/invoices/search-for-link?${params.toString()}`);
      setLinkResults(r.data?.data || []);
    } catch (e) {
      setLinkResults([]);
    } finally { setLinkSearching(false); }
  }
  async function confirmResolve() {
    if (!resolveDialog) return;
    if (resolveDialog === 'linked' && !linkSelected) {
      alert(t('rifiutate.selectLinkedFirst'));
      return;
    }
    setResolveSaving(true);
    try {
      await api.post(`/api/invoices/${invoiceId}/rejection-resolve`, {
        resolution:      resolveDialog,
        note:            resolveNote || null,
        linkedInvoiceId: resolveDialog === 'linked' ? linkSelected.id : null,
      });
      closeResolveDialog();
      const r = await api.get(`/api/invoices/${invoiceId}`);
      setData(r.data);
      onRefresh();
    } catch (e) {
      alert(t('common.error') + ': ' + (e.response?.data?.error || e.message));
    } finally { setResolveSaving(false); }
  }
  async function handleUnlink() {
    if (!window.confirm(t('rifiutate.unlinkConfirm'))) return;
    try {
      await api.post(`/api/invoices/${invoiceId}/rejection-unlink`);
      const r = await api.get(`/api/invoices/${invoiceId}`);
      setData(r.data);
      onRefresh();
    } catch (e) {
      alert(t('common.error') + ': ' + (e.response?.data?.error || e.message));
    }
  }

  function handleCategoryChange(catId) {
    setEditCategoryId(catId);
    setHintActive(false);
    setCategoryHint(null);
    const cat = categories.find(c => c.id === catId);
    const newResponsible = cat ? cat.responsible : '';
    setEditResponsible(newResponsible);
    // auto-save immediately with fresh values (bypass stale closure)
    saveInvoice({ categoryId: catId, status: editStatus, responsible: newResponsible, statusNote });
  }

  if (!data && loading) return (
    <Overlay onClose={onClose}><div style={S.loadingBox}>{t('common.loading')}</div></Overlay>
  );

  const { invoice, items, audit } = data || {};
  if (!invoice) return null;

  const canVerify = (
    invoice.status === 'Pending' &&
    (
      user.role === 'admin' ||
      user.role === 'supervisor' ||
      user.role === 'controller' ||
      user.role === 'delegato' ||
      // Revisore: prefer FK match, fall back to alias when FK missing.
      (user.role === 'revisore' && (
        (invoice.responsible_user_id && user.id && invoice.responsible_user_id === user.id) ||
        (!invoice.responsible_user_id && invoice.responsible && user.responsible && invoice.responsible === user.responsible)
      ))
    )
  );

  const delegatoMissing = !editResponsible;
  const isApproved = editStatus === 'Approved';
  const isRejected = editStatus === 'Rejected';

  const categorySelectStyle = {
    ...S.adminSelect,
    ...(hintActive ? { border:'2px solid #c77d3a', background:'#fff8f0', boxShadow:'0 0 0 2px rgba(199,125,58,0.12)' } : {}),
  };

  const btnApproved = {
    ...S.statusBtn,
    ...(delegatoMissing ? { background:'#e8e8e8', color:'#bbb', border:'2px solid #ddd', cursor:'not-allowed', opacity:0.6 }
      : { background: isApproved?'#2e7d52':(isRejected?'#e8e8e8':'#e8f5ec'), color: isApproved?'#fff':(isRejected?'#aaa':'#2e7d52'), border:`2px solid ${isApproved?'#2e7d52':(isRejected?'#ddd':'#b8dfc4')}`, cursor:'pointer' }),
  };
  const btnRejected = {
    ...S.statusBtn,
    ...(delegatoMissing ? { background:'#e8e8e8', color:'#bbb', border:'2px solid #ddd', cursor:'not-allowed', opacity:0.6 }
      : { background: isRejected?'#c0392b':(isApproved?'#e8e8e8':'#fdecea'), color: isRejected?'#fff':(isApproved?'#aaa':'#c0392b'), border:`2px solid ${isRejected?'#c0392b':(isApproved?'#ddd':'#f5b7b1')}`, cursor:'pointer' }),
  };

  return (
    <>
      <Overlay onClose={onClose}>
        <div style={{ ...S.modal, ...((tab==='pdf'||tab==='translate'||tab==='review') ? {height:'97vh',maxHeight:'97vh',maxWidth:1100} : {}) }}>
          {/* Header */}
          <div style={S.modalHeader}>
            <div>
              <div style={S.modalTitle}>{invoice.supplier || '—'}</div>
              <div style={S.modalSub}>
                {invoice.internal_number && <><span style={{fontWeight:700,color:'#1c2b3a'}}>{invoice.internal_number}</span> · </>}
                {invoice.inv_number} · {fmtDate(invoice.inv_date)}
              </div>
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              {invoice.status === 'Approved' && <span style={S.approvedBadge}>✓ {t('invoice.verifiedPayable')}</span>}
              {invoice.status === 'Rejected' && <span style={{...S.approvedBadge, background:'#fdecea', color:'#c0392b', border:'1px solid #f5c6cb'}}>✕ {t('status.Rejected')}</span>}
              <button style={S.closeBtn} onClick={onClose}>✕</button>
            </div>
          </div>

          {/* Tabs */}
          <div style={S.tabs}>
            {(user?.role === 'revisore'
              ? ['review']
              : ['review','details','items','workflow','payment','pdf','translate']
            ).map(tab_ => (
              <button key={tab_} style={{...S.tab,...(tab===tab_?S.tabActive:{})}} onClick={()=>setTab(tab_)}>
                {{review:`✓ ${t('invoice.review')}`,details:t('invoice.detail'),items:t('invoice.lineItems'),workflow:t('invoice.workflow'),payment:t('invoice.payment'),pdf:`📎 ${t('invoice.previewPdf')}`,translate:`🌐 ${t('invoice.translatePdf')}`}[tab_]}
              </button>
            ))}
          </div>

          {/* Body */}
          <div style={{...S.body,...(tab==='pdf'?{padding:0,overflow:'hidden'}:{}), ...(tab==='translate'?{padding:'20px 24px',overflow:'auto'}:{}), ...(tab==='review'?{padding:0,overflow:'hidden'}:{})}}>

            {tab==='review' && (
              <div style={{display:'flex',height:'100%',gap:0}}>

                {/* LEFT: PDF preview */}
                <div style={{flex:'1 1 auto',display:'flex',flexDirection:'column',background:'#f4f3f1',borderRight:'1px solid #e2e0dd',minWidth:0}}>
                  {tabPdfLoading && <div style={S.empty}>⏳ {t('invoice.loadingPdf')}</div>}
                  {tabPdfError   && <div style={S.empty}>📎 {t('invoice.pdfNotAvailForInvoice')}</div>}
                  {!tabPdfLoading && !tabPdfError && tabPdfItems.length > 0 && (
                    <>
                      {tabPdfItems.length > 1 && (
                        <div style={{display:'flex',gap:2,padding:'4px 12px',background:'#f4f3f1',borderBottom:'1px solid #e2e0dd',flexShrink:0}}>
                          {tabPdfItems.map((item, idx) => (
                            <button key={idx}
                              style={{padding:'4px 12px',border:'none',borderRadius:4,fontSize:11,fontWeight:600,fontFamily:'sans-serif',cursor:'pointer',
                                background: tabPdfActive===idx ? '#1c2b3a' : '#e2e0dd',
                                color:      tabPdfActive===idx ? '#fff'    : '#5a5551'}}
                              onClick={() => setTabPdfActive(idx)}>
                              📎 {item.name}
                            </button>
                          ))}
                        </div>
                      )}
                      <iframe
                        src={tabPdfItems[tabPdfActive]?.url}
                        style={{flex:1,width:'100%',border:'none',display:'block'}}
                        title={tabPdfItems[tabPdfActive]?.name}
                      />
                    </>
                  )}
                </div>

                {/* RIGHT: Action panel */}
                <div style={{flex:'0 0 320px',display:'flex',flexDirection:'column',padding:'20px 22px',gap:14,background:'#fff',overflowY:'auto'}}>

                  <div>
                    <div style={{fontSize:11,color:'#9a9490',fontFamily:'sans-serif',textTransform:'uppercase',letterSpacing:0.5}}>
                      {t('invoices.supplier')}
                    </div>
                    <div style={{fontSize:14,fontWeight:700,color:'#1c2b3a',marginTop:2,fontFamily:'sans-serif'}}>
                      {invoice.supplier || '—'}
                    </div>
                    <div style={{fontSize:11,color:'#7a7571',marginTop:6,fontFamily:'sans-serif'}}>
                      {invoice.inv_number || invoice.internal_number || '—'} · {fmtDate(invoice.inv_date)}
                    </div>
                  </div>

                  <div style={{borderTop:'1px solid #e2e0dd'}}/>

                  <div>
                    <div style={{fontSize:11,color:'#9a9490',fontFamily:'sans-serif',textTransform:'uppercase',letterSpacing:0.5}}>
                      {t('invoice.total')}
                    </div>
                    <div style={{fontSize:22,fontWeight:700,color:'#1c2b3a',marginTop:2,fontFamily:'sans-serif'}}>
                      {fmtCur(invoice.total)}
                    </div>
                  </div>

                  <div>
                    <div style={{fontSize:11,color:'#9a9490',fontFamily:'sans-serif',textTransform:'uppercase',letterSpacing:0.5,marginBottom:4}}>
                      {t('invoice.stato')}
                    </div>
                    {invoice.status === 'Approved' && (
                      <span style={{display:'inline-block',background:'#e8f5ec',color:'#2e7d52',border:'1px solid #b8dfc4',borderRadius:20,padding:'3px 10px',fontSize:12,fontWeight:700,fontFamily:'sans-serif'}}>
                        ✓ {t('status.Approved')}
                      </span>
                    )}
                    {invoice.status === 'Rejected' && (
                      <span style={{display:'inline-block',background:'#fdecea',color:'#c0392b',border:'1px solid #f5c6cb',borderRadius:20,padding:'3px 10px',fontSize:12,fontWeight:700,fontFamily:'sans-serif'}}>
                        ✕ {t('status.Rejected')}
                      </span>
                    )}
                    {(!invoice.status || invoice.status === 'Pending') && (
                      <span style={{display:'inline-block',background:'#f9f0e8',color:'#7a4a15',border:'1px solid #e8c99a',borderRadius:20,padding:'3px 10px',fontSize:12,fontWeight:700,fontFamily:'sans-serif'}}>
                        ⏳ {t('status.Pending')}
                      </span>
                    )}
                  </div>

                  <div>
                    <div style={{fontSize:11,color:'#9a9490',fontFamily:'sans-serif',textTransform:'uppercase',letterSpacing:0.5,marginBottom:4}}>
                      {t('invoice.delegate')}
                    </div>
                    <div style={{fontSize:13,fontWeight:600,color: editResponsible ? (String(editResponsible).toUpperCase()==='FEDERICO'?'#1c2b3a':'#c77d3a') : '#c0392b',fontFamily:'sans-serif'}}>
                      {editResponsible ? getDelegatoLabel(editResponsible, responsibles) : `⚠ ${t('invoice.notDefined')}`}
                    </div>
                  </div>

                  <div style={{borderTop:'1px solid #e2e0dd',marginTop:'auto'}}/>

                  {invoice.status === 'Pending' && canVerify && (
                    <div style={{display:'flex',flexDirection:'column',gap:10}}>
                      <div style={{fontSize:11,color:'#9a9490',fontFamily:'sans-serif',textTransform:'uppercase',letterSpacing:0.5}}>
                        {t('invoice.comment')}
                      </div>
                      <textarea
                        style={{...S.textarea, minHeight:90}}
                        placeholder={t('invoice.comment')}
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        rows={4}
                      />
                      <button
                        style={{...S.verifyBtn, background:'#2e7d52', marginTop:0}}
                        onClick={handleVerify}
                        disabled={verifying}
                      >
                        {verifying ? `⏳ ${t('invoice.generatingPdf')}` : `✓ ${t('invoice.verifyBtn')}`}
                      </button>
                      <button
                        style={{...S.verifyBtn, background:'#c0392b', marginTop:0}}
                        onClick={handleRejectViaVerify}
                        disabled={verifying}
                        title={t('invoice.rejectNoteRequired') || ''}
                      >
                        {verifying ? '⏳' : `✕ ${t('status.Rejected')}`}
                      </button>
                    </div>
                  )}

                  {invoice.status === 'Pending' && !canVerify && (
                    <div style={{padding:'12px 14px',background:'#f4f3f1',borderRadius:8,fontSize:12,color:'#7a7571',fontFamily:'sans-serif',lineHeight:1.5}}>
                      ⏳ {t('invoice.pendingApprovalFrom')} <strong>{getDelegatoLabel(invoice.responsible, responsibles) || t('invoice.notAssigned')}</strong>
                    </div>
                  )}

                  {invoice.status && invoice.status !== 'Pending' && (
                    <div style={{padding:'12px 14px',background: invoice.status==='Approved'?'#e8f5ec':'#fdecea',borderRadius:8,fontSize:12,color:'#2a2421',fontFamily:'sans-serif',lineHeight:1.5}}>
                      <div style={{fontWeight:700,marginBottom:4,color: invoice.status==='Approved'?'#2e7d52':'#c0392b'}}>
                        {invoice.status==='Approved' ? `✓ ${t('status.Approved')}` : `✕ ${t('status.Rejected')}`}
                      </div>
                      {invoice.status_changed_by_name && (
                        <div style={{color:'#5a5551'}}>
                          {invoice.status_changed_by_name} · {fmtDT(invoice.status_changed_at)}
                        </div>
                      )}
                      {invoice.status_note && <div style={{fontStyle:'italic',color:'#7a7571',marginTop:4}}>"{invoice.status_note}"</div>}
                    </div>
                  )}

                </div>
              </div>
            )}

            {tab==='details' && (
              <div style={S.grid2}>
                <Field label={t('invoices.supplier')}     value={invoice.supplier} />
                <Field label={t('invoices.invNumber')}    value={invoice.inv_number} />
                <Field label={t('invoice.protocol')}       value={invoice.internal_number} mono />
                <Field label={t('invoices.date')}         value={fmtDate(invoice.inv_date)} />
                <Field label={t('invoices.due')}          value={fmtDate(invoice.due_date)} />
                <Field label={t('invoice.receiveDate')}    value={fmtDate(invoice.receival_date)} />
                <Field label={t('invoice.supplierCode')}   value={invoice.supplier_code} />
                <Field label="e-računi ID"                value={invoice.er_id} mono />
                <Field label={t('invoices.category')}     value={invoice.cost_type} />
                <Field label={t('invoices.responsible')}  value={getDelegatoLabel(invoice.responsible, responsibles)} />
                <Field label={t('invoice.year')}           value={invoice.business_year} />
                <Field label={t('invoice.notes')}          value={invoice.remarks} span />
              </div>
            )}

            {tab==='items' && (
              items?.length > 0 ? (
                <table style={S.table}>
                  <thead><tr style={S.thr}>
                    <th style={S.th}>#</th><th style={S.th}>{t('invoice.description')}</th>
                    <th style={S.th}>{t('invoice.netAmount')}</th><th style={S.th}>{t('invoice.vatPct')}</th>
                    <th style={S.th}>{t('invoice.account')}</th><th style={S.th}>{t('invoice.costCenter')}</th>
                  </tr></thead>
                  <tbody>
                    {items.map(item => (
                      <tr key={item.id} style={S.tr}>
                        <td style={S.td}>{item.position}</td>
                        <td style={S.td}>{item.description||'—'}</td>
                        <td style={S.td}>{fmtCur(item.net_amount)}</td>
                        <td style={S.td}>{item.vat_percentage}%</td>
                        <td style={{...S.td,fontFamily:'monospace',fontSize:12}}>{item.gl_account||'—'}</td>
                        <td style={{...S.td,fontFamily:'monospace',fontSize:12}}>{item.cost_position||'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div style={S.empty}>{t('invoice.noLines')}</div>
            )}

            {tab==='workflow' && (
              <div>
                <div style={S.amountRow}>
                  <AmountBox label={t('invoice.netAmount')} value={fmtCur(invoice.net_amount)} />
                  <AmountBox label={t('invoice.vat')}       value={fmtCur(invoice.vat)} />
                  <AmountBox label={t('invoice.total')}       value={fmtCur(invoice.total)} large />
                  <AmountBox label={t('invoice.leftToPay')} value={fmtCur(invoice.left_to_pay)} accent />
                </div>
                {user?.role === 'admin' && (
                  <div style={S.adminBox}>
                    <div style={S.adminTitle}>⚙️ {t('invoice.assignment')}</div>
                    <div style={S.adminGrid}>
                      <div>
                        <label style={S.fieldLabel}>{t('invoice.category')}</label>
                        <div style={{display:'flex',gap:6,alignItems:'center'}}>
                          <select style={{...categorySelectStyle,flex:1}} value={editCategoryId} onChange={e=>handleCategoryChange(e.target.value)}>
                            <option value="">— {t('invoice.noneOption')} —</option>
                            {categories.map(c => {
                              const delegato = getDelegatoLabel(c.responsible, responsibles);
                              return (
                                <option key={c.id} value={c.id}>
                                  {c.cost_type}{delegato ? ` — ${delegato}` : ''}
                                </option>
                              );
                            })}
                          </select>
                          {hintActive && categoryHint && (
                            <button
                              style={{flexShrink:0,width:36,height:36,borderRadius:6,border:'2px solid #c77d3a',background:'#c77d3a',color:'#fff',cursor:'pointer',fontSize:16,fontWeight:700,display:'inline-flex',alignItems:'center',justifyContent:'center',boxSizing:'border-box'}}
                              title={`Conferma: ${categories.find(c=>c.id===editCategoryId)?.cost_type || ''}`}
                              onClick={()=>handleCategoryChange(editCategoryId)}
                            >✓</button>
                          )}
                        </div>
                        {hintActive && categoryHint && (
                          <div style={S.hintLabel}>🤖 {t('invoice.hintProposal')} {categoryHint.usage_count}x — {t('invoice.hintConfirm')}</div>
                        )}
                      </div>
                      <div>
                        <label style={S.fieldLabel}>{t('invoice.delegate')}</label>
                        <div style={{...S.adminSelect,background:'#f4f3f1',color:editResponsible?'#1c2b3a':'#aaa',cursor:'default',display:'flex',alignItems:'center',fontWeight:editResponsible?600:400,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {editResponsible
                            ? <><span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:String(editResponsible).toUpperCase()==='FEDERICO'?'#1c2b3a':'#c77d3a',marginRight:8,flexShrink:0}}/><span style={{overflow:'hidden',textOverflow:'ellipsis'}}>{getDelegatoLabel(editResponsible, responsibles)}</span></>
                            : `— ${t('invoice.selectCat')} —`}
                        </div>
                      </div>
                      <div>
                        <label style={S.fieldLabel}>
                          {t('invoice.stato')}
                          {delegatoMissing && <span style={{marginLeft:6,color:'#c77d3a',fontWeight:400,fontSize:10,textTransform:'none'}}>⚠ {t('invoice.selectDelegate')}</span>}
                        </label>
                        <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'nowrap'}}>
                          <button style={btnApproved} onClick={()=>handleStatusBtn('Approved')} disabled={delegatoMissing} title={delegatoMissing?t('invoice.selectDelegateFirst'):''}>{`✓ ${t('status.Approved')}`}</button>
                          <button style={btnRejected} onClick={()=>handleStatusBtn('Rejected')} disabled={delegatoMissing} title={delegatoMissing?t('invoice.selectDelegateFirst'):''}>{`✕ ${t('status.Rejected')}`}</button>
                          {(isApproved || isRejected) && (
                            <button
                              style={{...S.statusBtn, background:'#f4f3f1', color:'#7a7571', border:'2px solid #d5d0cc', cursor:'pointer', padding:'0 10px', fontSize:12}}
                              onClick={handleResetStatus}
                              title={t('invoice.resetStatus')}
                            >↺ Reset</button>
                          )}
                          <button
                            style={{
                              width: 36, height: 36, boxSizing:'border-box',
                              background: statusNote?.trim() ? '#e8f5ec' : '#fff',
                              border: statusNote?.trim() ? '2px solid #2e7d52' : '1px solid #c8d8e8',
                              borderRadius: 6, padding: 0, cursor: 'pointer',
                              fontSize: 16, lineHeight: 1, color: statusNote?.trim() ? '#2e7d52' : '#7a7571',
                              transition: 'all 0.2s',
                              display:'inline-flex', alignItems:'center', justifyContent:'center',
                            }}
                            title={statusNote?.trim() || t('invoice.noteTitle')}
                            onClick={() => { setNoteDraft(statusNote || ''); setNoteDialog(true); }}
                          >📝</button>
                          {saving  && <span style={{fontSize:13,color:'#7a7571',fontFamily:'sans-serif',marginLeft:4}}>⏳</span>}
                          {savedMsg && <span style={{fontSize:13,color:'#2e7d52',fontWeight:600,fontFamily:'sans-serif',marginLeft:4}}>✅ {t('invoice.saved')}</span>}
                        </div>
                        {isRejected && statusNote && <div style={{fontSize:11,color:'#c0392b',marginTop:4,fontStyle:'italic',fontFamily:'sans-serif'}}>"{statusNote}"</div>}
                      </div>
                    </div>
                  </div>
                )}
                <div style={{...S.adminBox, marginTop:12}}>
                  <div style={S.adminTitle}>💶 {t('invoice.payment')}</div>
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px 24px', fontSize:13, fontFamily:'sans-serif'}}>
                    <div style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'1px solid #e0e8f0'}}>
                      <span style={{color:'#7a7571',fontWeight:600,textTransform:'uppercase',fontSize:11}}>{t('invoice.total')}</span>
                      <span style={{fontWeight:700,color:'#1c2b3a'}}>{fmtCur(invoice.total)}</span>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'1px solid #e0e8f0'}}>
                      <span style={{color:'#7a7571',fontWeight:600,textTransform:'uppercase',fontSize:11}}>{t('invoice.paymentAmount')}</span>
                      <span style={{fontWeight:600,color:'#1c2b3a'}}>{fmtCur(invoice.net_amount)}</span>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'1px solid #e0e8f0'}}>
                      <span style={{color:'#7a7571',fontWeight:600,textTransform:'uppercase',fontSize:11}}>{t('invoice.alreadyPaid')}</span>
                      <span style={{fontWeight:600,color:'#2e7d52'}}>{fmtCur(invoice.already_paid)}</span>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'1px solid #e0e8f0'}}>
                      <span style={{color:'#7a7571',fontWeight:600,textTransform:'uppercase',fontSize:11}}>{t('invoice.leftToPay')}</span>
                      <span style={{fontWeight:700,color: invoice.left_to_pay > 0 ? '#c0392b' : '#2e7d52'}}>{fmtCur(invoice.left_to_pay)}</span>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'1px solid #e0e8f0'}}>
                      <span style={{color:'#7a7571',fontWeight:600,textTransform:'uppercase',fontSize:11}}>{t('invoice.paymentDate')}</span>
                      <span style={{color:'#1c2b3a'}}>{invoice.payment_date ? new Date(invoice.payment_date).toLocaleDateString('it-IT') : '—'}</span>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'1px solid #e0e8f0'}}>
                      <span style={{color:'#7a7571',fontWeight:600,textTransform:'uppercase',fontSize:11}}>{t('invoice.notes')}</span>
                      <span style={{color:'#1c2b3a'}}>{invoice.remarks || '—'}</span>
                    </div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:12,marginTop:10}}>
                    <span style={{color:'#7a7571',fontWeight:600,textTransform:'uppercase',fontSize:11,minWidth:50}}>{t('invoice.stato')}</span>
                    {user?.role === 'admin' ? (
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <select style={{...S.adminSelect}} value={editPaymentStatus} onChange={e => handlePaymentStatusChange(e.target.value)}>
                          <option value="da_pagare">{t('payment.da_pagare')}</option>
                          <option value="inviato">{t('payment.inviato')}</option>
                          <option value="in_pagamento">{t('payment.in_pagamento')}</option>
                          <option value="pagato">{t('payment.pagato')}</option>
                          <option value="parziale">{t('payment.parziale')}</option>
                        </select>
                        {savingPayment && <span style={{fontSize:12,color:'#7a7571'}}>⏳</span>}
                      </div>
                    ) : (
                      <span style={{fontSize:13,color:'#1c2b3a'}}>{invoice.payment_status || '—'}</span>
                    )}
                  </div>
                </div>

                {/* ── Registrazioni Pagamenti ── */}
                {(() => {
                  const records = data?.paymentRecords || [];
                  if (records.length === 0) return null;
                  return (
                    <div style={{...S.adminBox, marginTop:12}}>
                      <div style={S.adminTitle}>💳 {t('invoice.paymentRecords')} ({records.length})</div>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, fontFamily:'sans-serif' }}>
                        <thead>
                          <tr style={{ borderBottom:'2px solid #c8d8e8' }}>
                            {[t('invoice.payRecDate'),t('invoice.payRecAmount'),t('invoice.payRecNotes'),t('invoice.payRecCreated')].map((h,idx) => (
                              <th key={h} style={{ textAlign: idx===1?'right':'left', padding:'5px 8px', fontSize:11, fontWeight:700, color:'#7a7571', textTransform:'uppercase', letterSpacing:'0.04em' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {records.map((pr, i) => (
                            <tr key={pr.id || i} style={{ borderBottom:'1px solid #e0e8f0', background: i%2===0 ? '#fff':'#f5f8fc' }}>
                              <td style={{ padding:'6px 8px', color:'#1c2b3a' }}>{pr.payment_date ? new Date(pr.payment_date).toLocaleDateString('it-IT') : '—'}</td>
                              <td style={{ padding:'6px 8px', textAlign:'right', fontWeight:600, color:'#1d7c4d' }}>
                                {fmtCur(pr.payment_amount)}
                                {pr.payment_currency && pr.payment_currency!=='EUR' && <span style={{fontSize:11,color:'#7a7571',marginLeft:4}}>{pr.payment_currency}</span>}
                              </td>
                              <td style={{ padding:'6px 8px', color:'#5a5551' }}>{pr.payment_remark || '—'}</td>
                              <td style={{ padding:'6px 8px', color:'#9e9b97', fontSize:12 }}>{fmtDT(pr.payment_entry_ts)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}

                {invoice.responsible && user?.role === 'admin' && (
                  <div style={{...S.adminBox, marginTop:12}}>
                    <div style={S.adminTitle}>📨 {t('invoice.pendingApprovalFrom')} {getDelegatoLabel(invoice.responsible, responsibles)}</div>
                    <div style={{display:'flex', alignItems:'center', gap:12, marginTop:8}}>
                      <label style={{...S.fieldLabel, width:120}}>{t('invoice.notificaSent')}</label>
                      <span style={{...S.badge, background: invoice.notifica_sent_at ? '#e8f0fb' : '#f4f3f1', color: invoice.notifica_sent_at ? '#1a4fa3' : '#aaa'}}>
                        {invoice.notifica_sent_at ? `🔔 ${t('common.yes')}` : '—'}
                      </span>
                      <select
                        style={{...S.adminSelect, width: 100}}
                        value={invoice.notifica_sent_at ? 'si' : 'no'}
                        disabled={savingNotifica}
                        onChange={e => handleNotificaChange(e.target.value === 'si')}
                      >
                        <option value="no">{t('common.no')}</option>
                        <option value="si">{t('common.yes')}</option>
                      </select>
                      {savingNotifica && <span style={{fontSize:12, color:'#7a7571'}}>⏳</span>}
                      {invoice.notifica_sent_at && <span style={{fontSize:11, color:'#7a7571'}}>{fmtDT(invoice.notifica_sent_at)}</span>}
                    </div>
                    <div style={{display:'flex', alignItems:'center', gap:12, marginTop:8}}>
                      <label style={{...S.fieldLabel, width:120}}>{t('invoice.distintaSent')}</label>
                      <span style={{...S.badge, background: invoice.distinta_sent_at ? '#e8f5ec' : '#f4f3f1', color: invoice.distinta_sent_at ? '#2e7d52' : '#aaa'}}>
                        {invoice.distinta_sent_at ? `✉ ${t('common.yes')}` : '—'}
                      </span>
                      <select
                        style={{...S.adminSelect, width: 100}}
                        value={invoice.distinta_sent_at ? 'si' : 'no'}
                        disabled={savingDistinta}
                        onChange={e => handleDistintaChange(e.target.value === 'si')}
                      >
                        <option value="no">{t('common.no')}</option>
                        <option value="si">{t('common.yes')}</option>
                      </select>
                      {savingDistinta && <span style={{fontSize:12, color:'#7a7571'}}>⏳</span>}
                      {invoice.distinta_sent_at && <span style={{fontSize:11, color:'#7a7571'}}>{fmtDT(invoice.distinta_sent_at)}</span>}
                      {invoice.distinta_sent_at && (
                        <button style={{...S.pdfBtn, padding:'3px 10px', fontSize:11}} onClick={()=>downloadPDF('distinta_report')}>📄 {t('invoice.pdfDistinta')}</button>
                      )}
                    </div>
                  </div>
                )}
                {invoice.status === 'Approved' ? (
                  <div style={S.approvedBox}>
                    <div style={S.approvedTitle}>✓ {t('invoice.verifiedPayable')}</div>
                    <div style={S.approvedMeta}>
                      {t('invoice.verifiedBy')}: <strong>{invoice.status_changed_by_name}</strong> ({invoice.status_changed_by})<br/>
                      {t('invoice.verifiedAt')}: <strong>{fmtDT(invoice.status_changed_at)}</strong>
                      {invoice.distinta_batch_id && (<>
                        <br/>Batch Distinta: <strong>{invoice.distinta_batch_id}</strong>
                        {invoice.distinta_sent_at && (<> · {fmtDT(invoice.distinta_sent_at)}</>)}
                      </>)}
                    </div>
                    {invoice.status_note && <div style={S.comment}>"{invoice.status_note}"</div>}
                  </div>
                ) : invoice.status === 'Rejected' ? (
                  <>
                    <div style={{...S.approvedBox, background:'#fdecea', border:'1px solid #f5c6cb'}}>
                      <div style={{...S.approvedTitle, color:'#c0392b'}}>✕ {t('invoice.invoiceRejected')}</div>
                      <div style={S.approvedMeta}>
                        {t('invoice.rejectedBy')}: <strong>{invoice.status_changed_by_name}</strong> ({invoice.status_changed_by})<br/>
                        {t('invoice.dateLabel')}: <strong>{fmtDT(invoice.status_changed_at)}</strong>
                      </div>
                      {invoice.status_note && <div style={{...S.comment, color:'#c0392b'}}>"{invoice.status_note}"</div>}
                    </div>

                    {/* JMMC action box (Faza 2) */}
                    {user?.role === 'admin' && !invoice.rejection_resolved_at && (
                      <div style={S.jmmcActionBox}>
                        <div style={S.jmmcActionTitle}>🛠 {t('rifiutate.jmmcAction')}</div>
                        <div style={S.jmmcActionDesc}>{t('rifiutate.jmmcActionDesc')}</div>
                        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}}>
                          <button style={{...S.jmmcBtn, background:'#1a6fa3'}} onClick={()=>openResolveDialog('credit_note')}>
                            📄 {t('rifiutate.creditNote')}
                          </button>
                          <button style={{...S.jmmcBtn, background:'#6a3fa3'}} onClick={()=>openResolveDialog('linked')}>
                            🔗 {t('rifiutate.linkInvoice')}
                          </button>
                          <button style={{...S.jmmcBtn, background:'#7a7571'}} onClick={()=>openResolveDialog('closed')}>
                            ✕ {t('rifiutate.closeManually')}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Resolved info box (Faza 2) */}
                    {invoice.rejection_resolved_at && (
                      <div style={S.jmmcResolvedBox}>
                        <div style={S.jmmcResolvedTitle}>
                          ✅ {t('rifiutate.resolved')} — {
                            invoice.rejection_resolution === 'credit_note' ? t('rifiutate.creditNote')
                            : invoice.rejection_resolution === 'linked'   ? t('rifiutate.linked')
                            : t('rifiutate.closedManually')
                          }
                        </div>
                        <div style={S.approvedMeta}>
                          {t('rifiutate.resolvedBy')}: <strong>{invoice.rejection_resolved_by_name || '—'}</strong>{' '}
                          ({invoice.rejection_resolved_by || '—'})<br/>
                          {t('rifiutate.resolvedAt')}: <strong>{fmtDT(invoice.rejection_resolved_at)}</strong>
                        </div>
                        {invoice.rejection_resolved_note && (
                          <div style={S.comment}>"{invoice.rejection_resolved_note}"</div>
                        )}
                        {invoice.rejection_resolution === 'linked' && data.linkedInvoice && (
                          <div style={S.linkedRef}>
                            🔗 {t('rifiutate.linkedTo')}:{' '}
                            <strong>{data.linkedInvoice.supplier}</strong> —{' '}
                            <span style={{fontFamily:'monospace'}}>{data.linkedInvoice.inv_number}</span>
                            {data.linkedInvoice.internal_number && <> ({data.linkedInvoice.internal_number})</>}
                            {' · '}{fmtCur(data.linkedInvoice.total)}
                            {' · '}{fmtDate(data.linkedInvoice.due_date)}
                          </div>
                        )}
                        {user?.role === 'admin' && (
                          <button style={S.unlinkBtn} onClick={handleUnlink}>
                            ↩ {t('rifiutate.unlink')}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                ) : canVerify ? (
                  <div style={S.verifyBox}>
                    <div style={S.verifyTitle}>{t('invoice.approvalRequired')}</div>
                    <p style={S.verifyHint}>{t('invoice.verifyHint')}</p>
                    <textarea style={S.textarea} placeholder={t('invoice.comment')} value={comment} onChange={e=>setComment(e.target.value)} rows={3}/>
                    <div style={{display:'flex',gap:8,marginTop:4}}>
                      <button style={S.verifyBtn} onClick={handleVerify} disabled={verifying}>{verifying?`⏳ ${t('invoice.generatingPdf')}`:`✓ ${t('invoice.verifyBtn')}`}</button>
                      <button
                        style={{...S.verifyBtn, background:'#c0392b'}}
                        onClick={handleRejectViaVerify}
                        disabled={verifying}
                        title={t('invoice.rejectNoteRequired') || 'Inserisci una nota per il rifiuto'}
                      >
                        {verifying ? '⏳' : `✕ ${t('status.Rejected')}`}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={S.pendingBox}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                      <span>⏳ {t('invoice.pendingApprovalFrom')} {getDelegatoLabel(invoice.responsible, responsibles) || t('invoice.notAssigned')}</span>
                      <button style={{...S.pdfBtn,background:invoice.original_pdf_id?'#2e7d52':'#ccc',color:'#fff',cursor:invoice.original_pdf_id?'pointer':'not-allowed',opacity:invoice.original_pdf_id?1:0.7,marginLeft:12}}
                        onClick={()=>invoice.original_pdf_id&&downloadPDF('original')} title={invoice.original_pdf_id?t('invoice.viewPdf'):t('invoice.pdfNotReady')}>
                        📎 {t('invoice.pdfOriginal')}
                      </button>
                    </div>
                  </div>
                )}
                {audit?.length > 0 && (
                  <div style={{marginTop:20}}>
                    <div style={S.sectionTitle}>{t('invoice.history')}</div>
                    {audit.map(a=>(
                      <div key={a.id} style={S.auditEntry}>
                        <span style={S.auditTime}>{fmtDT(a.created_at)}</span>
                        <span style={S.auditUser}>{a.user_name}</span>
                        <span>{a.action}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab==='payment' && (
              <div>
                {/* Importi principali */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
                  <div style={{ background: '#f4f3f1', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#7a7571', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, fontFamily: 'sans-serif' }}>{t('invoice.total')}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#1c2b3a', fontFamily: 'sans-serif' }}>{fmtCur(invoice.total)}</div>
                  </div>
                  <div style={{ background: '#f4f3f1', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#7a7571', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, fontFamily: 'sans-serif' }}>{t('invoice.paymentAmount')}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#1c2b3a', fontFamily: 'sans-serif' }}>{fmtCur(invoice.payment_amount)}</div>
                  </div>
                  <div style={{ background: '#eaf7ef', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#7a7571', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, fontFamily: 'sans-serif' }}>{t('invoice.alreadyPaid')}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#1d7c4d', fontFamily: 'sans-serif' }}>{fmtCur(invoice.already_paid)}</div>
                  </div>
                  <div style={{ background: invoice.left_to_pay > 0 ? '#fdecea' : '#eaf7ef', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#7a7571', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, fontFamily: 'sans-serif' }}>{t('invoice.leftToPay')}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: invoice.left_to_pay > 0 ? '#c0392b' : '#1d7c4d', fontFamily: 'sans-serif' }}>{fmtCur(invoice.left_to_pay)}</div>
                  </div>
                </div>

                <div style={S.grid2}>
                  <Field label={t('invoice.bankAccount')}   value={invoice.bank_account} mono />
                  <Field label={t('invoice.payReference')}  value={invoice.pay_reference} mono />
                  <Field label={t('invoice.method')}         value={invoice.payment_method} />
                  <div>
                    <div style={S.fieldLabel}>{t('invoice.payment')}</div>
                    <div style={{...S.fieldValue, fontWeight:700, color: invoice.payment_status === 'pagato' ? '#2e7d52' : invoice.payment_status ? '#c0392b' : '#aaa'}}>
                      {{'da_pagare':t('payment.da_pagare'),'inviato':t('payment.inviato'),'in_pagamento':t('payment.in_pagamento'),'pagato':t('payment.pagato'),'parziale':t('payment.parziale')}[invoice.payment_status] || '—'}
                    </div>
                  </div>
                  <Field label={t('invoice.paymentDate')}   value={fmtDate(invoice.payment_date)} />
                  <Field label={t('invoice.paymentSource')} value={invoice.payment_source} />
                  <Field label={t('invoice.notes')} value={invoice.remarks} span />
                </div>

                {/* Payment Records */}
                {(() => {
                  const records = data?.paymentRecords || [];
                  if (records.length === 0) return null;
                  return (
                    <div style={{ marginTop: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#7a7571', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, fontFamily: 'sans-serif' }}>
                        {t('invoice.paymentRecords')} ({records.length})
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: 'sans-serif' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid #e2e0dd' }}>
                            <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, fontWeight: 700, color: '#7a7571', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('invoice.payRecDate')}</th>
                            <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 11, fontWeight: 700, color: '#7a7571', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('invoice.payRecAmount')}</th>
                            <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, fontWeight: 700, color: '#7a7571', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('invoice.payRecNotes')}</th>
                            <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, fontWeight: 700, color: '#7a7571', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('invoice.payRecCreated')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {records.map((pr, i) => (
                            <tr key={pr.id || i} style={{ borderBottom: '1px solid #f0eeec', background: i % 2 === 0 ? '#fff' : '#faf9f8' }}>
                              <td style={{ padding: '7px 8px', color: '#1c2b3a' }}>{fmtDate(pr.payment_date)}</td>
                              <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 600, color: '#1d7c4d' }}>
                                € {Number(pr.payment_amount || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                {pr.payment_currency && pr.payment_currency !== 'EUR' && <span style={{ fontSize: 11, color: '#7a7571', marginLeft: 4 }}>{pr.payment_currency}</span>}
                              </td>
                              <td style={{ padding: '7px 8px', color: '#5a5551' }}>{pr.payment_remark || '—'}</td>
                              <td style={{ padding: '7px 8px', color: '#9e9b97', fontSize: 12 }}>{pr.payment_entry_ts ? new Date(pr.payment_entry_ts).toLocaleString('it-IT') : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── Tab Preview PDF ── */}
            {tab==='pdf' && (
              <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
                <div style={S.tabPdfBar}>
                  <span style={{fontSize:13,color:'#7a7571',fontFamily:'sans-serif',flexShrink:0}}>
                    {tabPdfItems.length > 1
                      ? `${t('invoice.pdfOriginals')} (${tabPdfItems.length})`
                      : (tabPdfItems[0]?.name || t('invoice.pdfOriginal'))}
                  </span>
                  <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>

                    {/* Delegato chip — solo se fattura non ancora processata */}
                    {invoice.status === 'Pending' && (
                      <div style={S.delegatoChip}>
                        <span style={S.delegatoChipLabel}>{t('invoice.delegate')}</span>
                        {editResponsible ? (
                          <span style={{...S.delegatoChipValue, color: String(editResponsible).toUpperCase()==='FEDERICO'?'#1c2b3a':'#c77d3a'}}>
                            <span style={{display:'inline-block',width:7,height:7,borderRadius:'50%',background:String(editResponsible).toUpperCase()==='FEDERICO'?'#1c2b3a':'#c77d3a',marginRight:5,verticalAlign:'middle'}}/>
                            {getDelegatoLabel(editResponsible, responsibles)}
                          </span>
                        ) : (
                          <span style={S.delegatoChipMissing}>⚠ {t('invoice.notDefined')}</span>
                        )}
                      </div>
                    )}

                    {invoice.status === 'Pending' && (
                      <>
                        <button style={btnApproved} onClick={()=>handleStatusBtn('Approved')} disabled={delegatoMissing} title={delegatoMissing?t('invoice.selectDelegateFirst'):''}>{`✓ ${t('status.Approved')}`}</button>
                        <button style={btnRejected} onClick={()=>handleStatusBtn('Rejected')} disabled={delegatoMissing} title={delegatoMissing?t('invoice.selectDelegateFirst'):''}>{`✕ ${t('status.Rejected')}`}</button>
                        {saving && <span style={{fontSize:12,color:'#7a7571',fontFamily:'sans-serif'}}>⏳</span>}
                        {savedMsg && <span style={{fontSize:12,color:'#2e7d52',fontWeight:600,fontFamily:'sans-serif'}}>✅ {t('invoice.saved')}</span>}
                        {isRejected && statusNote && <span style={{fontSize:11,color:'#c0392b',fontStyle:'italic',fontFamily:'sans-serif'}}>"{statusNote}"</span>}
                      </>
                    )}
                    {user?.role === 'admin' && (isApproved || isRejected) && (
                      <button
                        style={{...S.statusBtn, background:'#f4f3f1', color:'#7a7571', border:'2px solid #d5d0cc', cursor:'pointer'}}
                        onClick={handleResetStatus}
                        title={t('invoice.resetStatus')}
                      >↺ Reset</button>
                    )}
                    {user?.role === 'admin' && (
                      <button
                        style={{
                          background: statusNote?.trim() ? '#e8f5ec' : 'transparent',
                          border: statusNote?.trim() ? '1px solid #2e7d52' : '1px solid #d5d0cc',
                          borderRadius: 6, padding: '5px 8px', cursor: 'pointer',
                          fontSize: 15, lineHeight: 1, color: statusNote?.trim() ? '#2e7d52' : '#bbb',
                          transition: 'all 0.2s',
                        }}
                        title={statusNote?.trim() || t('invoice.noteTitle')}
                        onClick={() => { setNoteDraft(statusNote || ''); setNoteDialog(true); }}
                      >📝</button>
                    )}
                    {tabPdfItems.length > 0 && (
                      <button style={S.pdfDlBtn} onClick={tabPdfDownload}>
                        ⬇ {t('invoice.download')}
                      </button>
                    )}
                    {user?.role === 'admin' && (
                      <button
                        style={{...S.pdfDlBtn, background:'#5a5551', minWidth:34, padding:'6px 10px'}}
                        onClick={handlePdfRefetch}
                        disabled={tabPdfRefetch}
                        title={t('invoice.refetchPdf')}
                      >
                        {tabPdfRefetch ? '⏳' : '🔄'}
                      </button>
                    )}
                  </div>
                </div>
                {tabPdfLoading && <div style={S.empty}>⏳ {t('invoice.loadingPdf')}</div>}
                {tabPdfError   && <div style={S.empty}>📎 {t('invoice.pdfNotAvailForInvoice')}</div>}
                {tabPdfItems.length > 0 && !tabPdfLoading && (
                  <>
                    {tabPdfItems.length > 1 && (
                      <div style={{display:'flex',gap:2,padding:'4px 12px',background:'#f4f3f1',borderBottom:'1px solid #e2e0dd',flexShrink:0}}>
                        {tabPdfItems.map((item, idx) => (
                          <button key={idx}
                            style={{padding:'4px 12px',border:'none',borderRadius:4,fontSize:11,fontWeight:600,fontFamily:'sans-serif',cursor:'pointer',
                              background: tabPdfActive===idx ? '#1c2b3a' : '#e2e0dd',
                              color:      tabPdfActive===idx ? '#fff'    : '#5a5551'}}
                            onClick={() => setTabPdfActive(idx)}>
                            📎 {item.name}
                          </button>
                        ))}
                      </div>
                    )}
                    <iframe
                      src={tabPdfItems[tabPdfActive]?.url}
                      style={{flex:1,width:'100%',border:'none',display:'block'}}
                      title={tabPdfItems[tabPdfActive]?.name}
                    />
                  </>
                )}
              </div>
            )}

            {tab==='translate' && (
              <div style={{display:'flex',flexDirection:'column',gap:16,height:'100%'}}>
                {/* Translate controls */}
                <div style={{display:'flex',alignItems:'center',gap:12,flexShrink:0,flexWrap:'wrap'}}>
                  {(() => { const canTranslate = user?.ai_enabled === true; return (
                  <button
                    style={{...S.saveBtn, background: translateText && !translateLoading ? '#5a5551' : '#1c2b3a', color:'#fff', opacity: (translateLoading || !canTranslate) ? 0.45 : 1, padding:'8px 20px', fontSize:13, cursor: !canTranslate ? 'not-allowed' : 'pointer'}}
                    title={!canTranslate ? t('invoice.aiNotEnabled') : ''}
                    onClick={!canTranslate ? undefined : async () => {
                      setTranslateLoading(true);
                      setTranslateError('');
                      setTranslateText('');
                      setTranslateCached(false);
                      try {
                        const { data: res } = await api.post('/api/ai/translate-pdf', { invoiceId, lang });
                        setTranslateText(res.translation || '');
                        setTranslateCached(true);
                        setTranslateMeta({ created_at: new Date().toISOString(), created_by: user?.email });
                        setTranslateLang(lang);
                      } catch (err) {
                        setTranslateError(err.response?.data?.error || t('invoice.translateError'));
                      } finally {
                        setTranslateLoading(false);
                      }
                    }}
                    disabled={translateLoading || !canTranslate}
                  >
                    {translateLoading ? `⏳ ${t('invoice.translating')}` : translateText ? `🔄 ${t('invoice.translateBtn')} ${lang.toUpperCase()}` : `🌐 ${t('invoice.translateBtn')} ${lang.toUpperCase()}`}
                  </button>
                  ); })()}
                  {translateText && !translateLoading && (
                    <button
                      style={{...S.saveBtn, background:'#fff', color:'#1c2b3a', border:'1px solid #e2e0dd', padding:'8px 16px', fontSize:13}}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(translateText);
                          setCopyFeedback(true);
                          setTimeout(() => setCopyFeedback(false), 2000);
                        } catch {}
                      }}
                    >
                      {copyFeedback ? `✅ ${t('invoice.copied')}` : `📋 ${t('invoice.copy')}`}
                    </button>
                  )}
                  <span style={{fontSize:12,color:'#9a9490',fontFamily:'sans-serif'}}>
                    {invoice.supplier} — {invoice.inv_number || invoice.internal_number}
                  </span>
                  {translateCached && translateMeta && (
                    <span style={{fontSize:11,color:'#b5b0ab',fontFamily:'sans-serif',marginLeft:'auto'}}>
                      ✓ {fmtDT(translateMeta.created_at)} · {translateMeta.created_by || ''}
                    </span>
                  )}
                </div>

                {/* Error */}
                {translateError && (
                  <div style={{background:'#fdecea',border:'1px solid #f5c6cb',borderRadius:8,padding:'10px 14px',fontSize:13,color:'#c0392b',fontFamily:'sans-serif'}}>
                    {translateError}
                  </div>
                )}

                {/* Empty state */}
                {!translateLoading && !translateText && !translateError && (
                  <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'#b5b0ab',fontSize:14,fontFamily:'sans-serif',textAlign:'center',padding:40}}>
                    <div>
                      <div style={{fontSize:40,marginBottom:12}}>🌐</div>
                      <div>{t('invoice.translateBtn')} {lang.toUpperCase()}</div>
                      <div style={{fontSize:12,marginTop:6,color:'#ccc'}}>{invoice.supplier} · {invoice.inv_number}</div>
                    </div>
                  </div>
                )}

                {/* Loading spinner */}
                {translateLoading && (
                  <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'#7a7571',fontSize:14,fontFamily:'sans-serif'}}>
                    ⏳ {t('invoice.translating')}
                  </div>
                )}

                {/* Translation result */}
                {translateText && !translateLoading && (
                  <div style={{flex:1,overflow:'auto',background:'#fff',border:'1px solid #e2e0dd',borderRadius:8,padding:'16px 20px',fontSize:13,lineHeight:1.7,fontFamily:'sans-serif',color:'#2a2421',whiteSpace:'pre-wrap'}}>
                    {translateText.split('\n').map((line, i) => {
                      // Basic markdown rendering
                      if (line.startsWith('### ')) return <h4 key={i} style={{fontSize:14,fontWeight:700,color:'#1c2b3a',margin:'14px 0 6px'}}>{line.slice(4)}</h4>;
                      if (line.startsWith('## ')) return <h3 key={i} style={{fontSize:15,fontWeight:700,color:'#1c2b3a',margin:'16px 0 8px'}}>{line.slice(3)}</h3>;
                      if (line.startsWith('# ')) return <h2 key={i} style={{fontSize:16,fontWeight:700,color:'#1c2b3a',margin:'18px 0 8px'}}>{line.slice(2)}</h2>;
                      if (line.startsWith('**') && line.endsWith('**')) return <div key={i} style={{fontWeight:700,margin:'4px 0'}}>{line.slice(2,-2)}</div>;
                      if (line.startsWith('- ')) return <div key={i} style={{paddingLeft:16,margin:'2px 0'}}>• {line.slice(2)}</div>;
                      if (line.startsWith('|')) return <div key={i} style={{fontFamily:'monospace',fontSize:12,margin:'1px 0',whiteSpace:'pre'}}>{line}</div>;
                      if (line.trim() === '---') return <hr key={i} style={{border:'none',borderTop:'1px solid #e2e0dd',margin:'12px 0'}}/>;
                      if (!line.trim()) return <div key={i} style={{height:8}}/>;
                      return <div key={i} style={{margin:'2px 0'}}>{line.replace(/\*\*(.*?)\*\*/g, (_, m) => m)}</div>;
                    })}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </Overlay>

      {/* Reject dialog */}
      {rejectDialog && (
        <div style={S.pdfOverlay}>
          <div style={S.rejectModal}>
            <div style={{fontSize:16,fontWeight:700,color:'#c0392b',marginBottom:8,fontFamily:'sans-serif'}}>✕ {t('invoice.rejectReason')}</div>
            <div style={{fontSize:13,color:'#5a5551',marginBottom:14,fontFamily:'sans-serif'}}>{t('invoice.rejectReasonHint')} <strong style={{color:'#c0392b'}}>{t('invoice.rejectMandatory')}</strong></div>
            <textarea style={{...S.textarea, marginBottom:4, border: statusNote.trim() ? '1px solid #e2e0dd' : '1px solid #c0392b'}} placeholder={t('invoice.rejectPlaceholder')} value={statusNote} onChange={e=>setStatusNote(e.target.value)} rows={3} autoFocus/>
            {!statusNote.trim() && <div style={{fontSize:11,color:'#c0392b',marginBottom:12,fontFamily:'sans-serif'}}>⚠ {t('invoice.rejectReasonRequired')}</div>}
            {statusNote.trim() && <div style={{marginBottom:12}}/>}
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button style={{...S.saveBtn,background:'#f4f3f1',color:'#1c2b3a'}} onClick={cancelReject}>{t('common.cancel')}</button>
              <button style={{...S.saveBtn, background:'#c0392b', opacity: statusNote.trim() ? 1 : 0.45, cursor: statusNote.trim() ? 'pointer' : 'not-allowed'}} onClick={confirmReject} disabled={!statusNote.trim()}>✕ {t('invoice.confirmReject')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Note dialog */}
      {noteDialog && (
        <div style={S.pdfOverlay}>
          <div style={S.rejectModal}>
            <div style={{fontSize:16,fontWeight:700,color:'#1c2b3a',marginBottom:8,fontFamily:'sans-serif'}}>📝 {t('invoice.noteTitle')}</div>
            <div style={{fontSize:13,color:'#5a5551',marginBottom:14,fontFamily:'sans-serif'}}>{t('invoice.noteHint')}</div>
            <textarea
              style={{...S.textarea, marginBottom:12}}
              placeholder={t('invoice.notePlaceholder')}
              value={noteDraft}
              onChange={e => setNoteDraft(e.target.value)}
              rows={4}
              autoFocus
            />
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              {statusNote?.trim() && (
                <button
                  style={{...S.saveBtn, background:'#fdecea', color:'#c0392b', border:'1px solid #e8c4c0', marginRight:'auto'}}
                  onClick={async () => {
                    setNoteDraft('');
                    setStatusNote('');
                    setNoteDialog(false);
                    await saveInvoice({ categoryId: editCategoryId, status: editStatus, responsible: editResponsible, statusNote: null });
                  }}
                >🗑 {t('invoice.deleteNote')}</button>
              )}
              <button style={{...S.saveBtn,background:'#f4f3f1',color:'#1c2b3a'}} onClick={() => setNoteDialog(false)}>{t('common.cancel')}</button>
              <button
                style={{...S.saveBtn, background:'#1c2b3a'}}
                onClick={async () => {
                  setStatusNote(noteDraft);
                  setNoteDialog(false);
                  await saveInvoice({ categoryId: editCategoryId, status: editStatus, responsible: editResponsible, statusNote: noteDraft || null });
                }}
              >💾 {t('invoice.saveNote')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Faza 2: JMMC rejection resolve dialog */}
      {resolveDialog && (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&closeResolveDialog()}>
          <div style={S.resolveModal}>
            <div style={S.resolveHeader}>
              <span style={{fontSize:15,fontWeight:700,color:'#1c2b3a'}}>
                {resolveDialog === 'credit_note' && `📄 ${t('rifiutate.creditNote')}`}
                {resolveDialog === 'linked'      && `🔗 ${t('rifiutate.linkInvoice')}`}
                {resolveDialog === 'closed'      && `✕ ${t('rifiutate.closeManually')}`}
              </span>
              <button style={S.closeBtn} onClick={closeResolveDialog}>✕</button>
            </div>
            <div style={{padding:'16px 24px'}}>
              <div style={{fontSize:12,color:'#7a7571',marginBottom:12}}>
                {resolveDialog === 'credit_note' && t('rifiutate.creditNoteDesc')}
                {resolveDialog === 'linked'      && t('rifiutate.linkInvoiceDesc')}
                {resolveDialog === 'closed'      && t('rifiutate.closeManuallyDesc')}
              </div>

              {resolveDialog === 'linked' && (
                <div style={{marginBottom:14}}>
                  <div style={{display:'flex',gap:6,marginBottom:8}}>
                    <input
                      type="text"
                      style={{...S.adminSelect, flex:1}}
                      placeholder={t('rifiutate.searchPlaceholder')}
                      value={linkSearchTerm}
                      onChange={e=>setLinkSearchTerm(e.target.value)}
                      onKeyDown={e=>{ if (e.key === 'Enter') searchLinkable(); }}
                    />
                    <button style={{...S.jmmcBtn, background:'#1c2b3a'}} onClick={searchLinkable} disabled={linkSearching}>
                      {linkSearching ? '⏳' : '🔍'}
                    </button>
                  </div>
                  {linkSelected && (
                    <div style={S.linkPickedBox}>
                      ✓ <strong>{linkSelected.supplier}</strong> — {linkSelected.inv_number}
                      {' · '}{fmtCur(linkSelected.total)}
                      <button style={S.unpickBtn} onClick={()=>setLinkSelected(null)}>✕</button>
                    </div>
                  )}
                  {!linkSelected && linkResults.length > 0 && (
                    <div style={S.linkResults}>
                      {linkResults.map(r => (
                        <div key={r.id} style={S.linkRow} onClick={()=>setLinkSelected(r)}>
                          <div>
                            <div style={{fontSize:13,fontWeight:600,color:'#1c2b3a'}}>{r.supplier}</div>
                            <div style={{fontSize:11,color:'#7a7571'}}>
                              {r.internal_number && <>{r.internal_number} · </>}
                              <span style={{fontFamily:'monospace'}}>{r.inv_number}</span>
                              {' · '}{fmtDate(r.due_date)}
                            </div>
                          </div>
                          <div style={{fontSize:13,fontWeight:700,color:'#1c2b3a'}}>{fmtCur(r.total)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {!linkSelected && linkResults.length === 0 && !linkSearching && (
                    <div style={{fontSize:11,color:'#aaa',padding:'8px 4px'}}>{t('rifiutate.noResults')}</div>
                  )}
                </div>
              )}

              <div style={{...S.fieldLabel, marginBottom:6}}>{t('rifiutate.note')}</div>
              <textarea
                style={S.textarea}
                rows={3}
                value={resolveNote}
                onChange={e=>setResolveNote(e.target.value)}
                placeholder={t('rifiutate.notePlaceholder')}
              />
            </div>
            <div style={S.resolveFooter}>
              <button style={S.cancelBtn} onClick={closeResolveDialog} disabled={resolveSaving}>
                {t('common.cancel')}
              </button>
              <button
                style={{...S.confirmBtn, background:'#2e7d52'}}
                onClick={confirmResolve}
                disabled={resolveSaving || (resolveDialog === 'linked' && !linkSelected)}
              >
                {resolveSaving ? '⏳' : `✓ ${t('common.confirm')}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      {pdfPreview && (
        <div style={S.pdfOverlay}>
          <div style={S.pdfModal}>
            <div style={S.pdfHeader}>
              <span style={{fontSize:13,fontWeight:600,color:'#1c2b3a',fontFamily:'sans-serif'}}>📄 {pdfPreview.fileName}</span>
              <div style={{display:'flex',gap:8}}>
                <button style={S.pdfDlBtn} onClick={forcePdfDownload}>⬇ {t('invoice.download')}</button>
                <button style={S.pdfCloseBtn} onClick={closePdfPreview}>✕ {t('common.close')}</button>
              </div>
            </div>
            <iframe src={pdfPreview.url} style={S.pdfIframe} title={pdfPreview.fileName}/>
          </div>
        </div>
      )}
    </>
  );
}

function Overlay({ onClose, children }) {
  React.useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);
  return <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>{children}</div>;
}
function Field({ label, value, mono, span }) {
  return (
    <div style={span?{gridColumn:'1/-1'}:{}}>
      <div style={S.fieldLabel}>{label}</div>
      <div style={{...S.fieldValue,fontFamily:mono?'monospace':'sans-serif'}}>{value||'—'}</div>
    </div>
  );
}
function AmountBox({ label, value, large, accent }) {
  return (
    <div style={{...S.amountBox,...(accent?{background:'#fff3e8',border:'1px solid #c77d3a'}:{})}}>
      <div style={S.amountLabel}>{label}</div>
      <div style={{...S.amountValue,...(large?{fontSize:20}:{})}}>{value}</div>
    </div>
  );
}

const S = {
  overlay:            { position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16 },
  modal:              { background:'#fff',borderRadius:12,width:'100%',maxWidth:820,maxHeight:'90vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,0.3)' },
  loadingBox:         { padding:40,fontFamily:'sans-serif',color:'#888' },
  modalHeader:        { display:'flex',alignItems:'flex-start',justifyContent:'space-between',padding:'20px 24px 0' },
  modalTitle:         { fontSize:18,fontWeight:700,color:'#1c2b3a',fontFamily:'sans-serif' },
  modalSub:           { fontSize:13,color:'#7a7571',marginTop:3,fontFamily:'sans-serif' },
  approvedBadge:      { background:'#e8f5ec',color:'#2e7d52',border:'1px solid #2e7d52',borderRadius:20,padding:'4px 12px',fontSize:12,fontWeight:700 },
  closeBtn:           { background:'transparent',border:'none',fontSize:18,cursor:'pointer',color:'#7a7571',padding:'4px 8px' },
  tabs:               { display:'flex',padding:'0 24px',borderBottom:'1px solid #e2e0dd',marginTop:16 },
  tab:                { padding:'10px 16px',border:'none',background:'transparent',fontSize:13,fontWeight:500,color:'#7a7571',cursor:'pointer',borderBottom:'2px solid transparent' },
  tabActive:          { color:'#1c2b3a',borderBottom:'2px solid #1c2b3a',fontWeight:700 },
  body:               { flex:1,overflow:'auto',padding:24 },
  grid2:              { display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px 24px' },
  fieldLabel:         { fontSize:11,color:'#7a7571',textTransform:'uppercase',fontWeight:600,marginBottom:3,fontFamily:'sans-serif' },
  fieldValue:         { fontSize:13,color:'#2a2421',fontFamily:'sans-serif' },
  table:              { width:'100%',borderCollapse:'collapse',fontFamily:'sans-serif' },
  thr:                { background:'#f4f3f1' },
  th:                 { padding:'8px 10px',textAlign:'left',fontSize:11,fontWeight:600,color:'#7a7571',textTransform:'uppercase' },
  tr:                 { borderBottom:'1px solid #f4f3f1' },
  td:                 { padding:'9px 10px',fontSize:13,color:'#2a2421' },
  empty:              { padding:32,textAlign:'center',color:'#888',fontFamily:'sans-serif' },
  amountRow:          { display:'flex',gap:12,marginBottom:20,flexWrap:'wrap' },
  amountBox:          { flex:1,minWidth:120,background:'#f4f3f1',borderRadius:8,padding:'12px 14px' },
  amountLabel:        { fontSize:11,color:'#7a7571',textTransform:'uppercase',fontWeight:600,fontFamily:'sans-serif' },
  amountValue:        { fontSize:16,fontWeight:700,color:'#1c2b3a',marginTop:4,fontFamily:'sans-serif' },
  adminBox:           { background:'#f0f4f8',border:'1px solid #c8d8e8',borderRadius:8,padding:16,marginBottom:16 },
  adminTitle:         { fontSize:13,fontWeight:700,color:'#1c2b3a',marginBottom:12,fontFamily:'sans-serif' },
  adminGrid:          { display:'grid',gridTemplateColumns:'minmax(240px,2.2fr) minmax(150px,1.1fr) auto',gap:14,alignItems:'end' },
  adminSelect:        { width:'100%',height:36,padding:'0 10px',borderRadius:6,border:'1px solid #c8d8e8',fontSize:13,background:'#fff',cursor:'pointer',boxSizing:'border-box',fontFamily:'sans-serif' },
  saveBtn:            { padding:'8px 16px',borderRadius:6,border:'none',background:'#1c2b3a',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:600,whiteSpace:'nowrap' },
  statusBtn:          { height:36,padding:'0 12px',borderRadius:6,fontSize:12,fontWeight:700,fontFamily:'sans-serif',transition:'all 0.15s',border:'2px solid transparent',boxSizing:'border-box',display:'inline-flex',alignItems:'center',justifyContent:'center',whiteSpace:'nowrap',flexShrink:0 },
  approvedBox:        { background:'#e8f5ec',border:'1px solid #b8dfc4',borderRadius:8,padding:16 },
  approvedTitle:      { fontSize:15,fontWeight:700,color:'#2e7d52',marginBottom:8,fontFamily:'sans-serif' },
  approvedMeta:       { fontSize:13,color:'#2a2421',lineHeight:1.6,fontFamily:'sans-serif' },
  comment:            { marginTop:8,fontStyle:'italic',color:'#5a5551',fontSize:13,fontFamily:'sans-serif' },
  pdfBtn:             { padding:'8px 14px',borderRadius:6,border:'none',background:'#1c2b3a',color:'#fff',cursor:'pointer',fontSize:13 },
  verifyBox:          { background:'#f9f0e8',border:'1px solid #e8c99a',borderRadius:8,padding:16 },
  verifyTitle:        { fontSize:14,fontWeight:700,color:'#7a4a15',marginBottom:8,fontFamily:'sans-serif' },
  verifyHint:         { fontSize:13,color:'#5a4530',margin:'0 0 12px',lineHeight:1.5,fontFamily:'sans-serif' },
  textarea:           { width:'100%',padding:10,borderRadius:6,border:'1px solid #e2e0dd',fontSize:13,boxSizing:'border-box',resize:'vertical',fontFamily:'sans-serif' },
  verifyBtn:          { marginTop:10,padding:'10px 20px',borderRadius:8,border:'none',background:'#2e7d52',color:'#fff',cursor:'pointer',fontSize:14,fontWeight:700 },
  pendingBox:         { background:'#f4f3f1',borderRadius:8,padding:'14px 16px',fontSize:13,color:'#5a5551',fontFamily:'sans-serif' },
  sectionTitle:       { fontSize:12,fontWeight:700,color:'#7a7571',textTransform:'uppercase',marginBottom:8,fontFamily:'sans-serif' },
  auditEntry:         { display:'flex',gap:10,padding:'6px 0',borderBottom:'1px solid #f4f3f1',fontSize:12,fontFamily:'sans-serif',flexWrap:'wrap' },
  auditTime:          { color:'#7a7571',flexShrink:0 },
  auditUser:          { fontWeight:600,color:'#1c2b3a' },
  pdfOverlay:         { position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000,padding:16 },
  pdfModal:           { background:'#fff',borderRadius:12,width:'100%',maxWidth:960,height:'90vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,0.4)' },
  rejectModal:        { background:'#fff',borderRadius:12,width:'100%',maxWidth:440,padding:24,boxShadow:'0 20px 60px rgba(0,0,0,0.4)' },
  pdfHeader:          { display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',borderBottom:'1px solid #e2e0dd',flexShrink:0 },
  pdfIframe:          { flex:1,border:'none',borderRadius:'0 0 12px 12px',width:'100%' },
  pdfDlBtn:           { padding:'6px 14px',borderRadius:6,border:'none',background:'#1c2b3a',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600 },
  pdfCloseBtn:        { padding:'6px 14px',borderRadius:6,border:'1px solid #e2e0dd',background:'#fff',color:'#c0392b',cursor:'pointer',fontSize:12,fontWeight:600 },
  tabPdfBar:          { display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',borderBottom:'1px solid #e2e0dd',flexShrink:0,gap:12 },
  hintLabel:          { fontSize:11,color:'#c77d3a',marginTop:4,fontStyle:'italic',fontFamily:'sans-serif',fontWeight:500 },
  delegatoChip:       { display:'flex',alignItems:'center',gap:6,background:'#f4f3f1',borderRadius:6,padding:'5px 10px',border:'1px solid #e2e0dd' },
  delegatoChipLabel:  { fontSize:10,fontWeight:700,color:'#7a7571',textTransform:'uppercase',fontFamily:'sans-serif',letterSpacing:'0.04em' },
  delegatoChipValue:  { fontSize:12,fontWeight:700,fontFamily:'sans-serif' },
  delegatoChipMissing:{ fontSize:12,color:'#c77d3a',fontWeight:600,fontFamily:'sans-serif' },

  // Faza 2: JMMC rejection action box
  jmmcActionBox:      { marginTop:12, padding:'14px 16px', background:'#fff8f5', border:'1px solid #f5c6cb', borderLeft:'4px solid #c0392b', borderRadius:8 },
  jmmcActionTitle:    { fontSize:13, fontWeight:700, color:'#c0392b', marginBottom:4, fontFamily:'sans-serif' },
  jmmcActionDesc:     { fontSize:12, color:'#5a5551', fontFamily:'sans-serif' },
  jmmcBtn:            { padding:'8px 14px', borderRadius:6, border:'none', color:'#fff', cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:'sans-serif' },
  jmmcResolvedBox:    { marginTop:12, padding:'14px 16px', background:'#eaf7ef', border:'1px solid #b8dfc4', borderLeft:'4px solid #2e7d52', borderRadius:8 },
  jmmcResolvedTitle:  { fontSize:13, fontWeight:700, color:'#1d7c4d', marginBottom:6, fontFamily:'sans-serif' },
  linkedRef:          { marginTop:8, padding:'8px 12px', background:'#fff', border:'1px solid #e2e0dd', borderRadius:6, fontSize:12, color:'#1c2b3a', fontFamily:'sans-serif' },
  unlinkBtn:          { marginTop:10, padding:'5px 12px', borderRadius:6, border:'1px solid #c77d3a', background:'#fff', color:'#c77d3a', cursor:'pointer', fontSize:11, fontWeight:600 },

  resolveModal:       { background:'#fff', borderRadius:12, width:'100%', maxWidth:560, boxShadow:'0 20px 60px rgba(0,0,0,0.3)', fontFamily:'sans-serif', display:'flex', flexDirection:'column' },
  resolveHeader:      { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px', borderBottom:'1px solid #e2e0dd' },
  resolveFooter:      { display:'flex', justifyContent:'flex-end', gap:8, padding:'12px 20px', borderTop:'1px solid #e2e0dd' },
  cancelBtn:          { padding:'8px 16px', borderRadius:6, border:'1px solid #e2e0dd', background:'#fff', color:'#7a7571', cursor:'pointer', fontSize:12, fontWeight:600 },
  confirmBtn:         { padding:'8px 16px', borderRadius:6, border:'none', color:'#fff', cursor:'pointer', fontSize:12, fontWeight:700 },
  linkResults:        { maxHeight:240, overflowY:'auto', border:'1px solid #e2e0dd', borderRadius:6, background:'#fff' },
  linkRow:            { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', borderBottom:'1px solid #f4f3f1', cursor:'pointer' },
  linkPickedBox:      { display:'flex', alignItems:'center', gap:8, padding:'10px 12px', background:'#eaf7ef', border:'1px solid #b8dfc4', borderRadius:6, fontSize:13, color:'#1c2b3a' },
  unpickBtn:          { marginLeft:'auto', background:'transparent', border:'none', color:'#c0392b', cursor:'pointer', fontSize:14 },
};
