import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import { useLang } from '../hooks/useLang';
import { useAuth } from '../hooks/useAuth';

const fmtCur  = n => n != null ? `€ ${Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` : '—';
const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '—';
const fmtDT   = d => d ? new Date(d).toLocaleString('it-IT')     : '—';

export default function InvoiceModal({ invoiceId, onClose, onRefresh }) {
  const { t }   = useLang();
  const { user } = useAuth();

  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [comment,    setComment]    = useState('');
  const [verifying,  setVerifying]  = useState(false);
  const [tab, setTab] = useState('pdf');
  const [categories, setCategories] = useState([]);

  const [editResponsible, setEditResponsible] = useState('');
  const [editCategoryId,  setEditCategoryId]  = useState('');
  const [editStatus,      setEditStatus]      = useState('');
  const [saving,          setSaving]          = useState(false);
  const [savedMsg,        setSavedMsg]        = useState(false);

  const [categoryHint,    setCategoryHint]    = useState(null);
  const [hintActive,      setHintActive]      = useState(false);

  const [rejectDialog,  setRejectDialog]  = useState(false);
  const [rejectComment, setRejectComment] = useState('');

  const [pdfPreview,    setPdfPreview]    = useState(null);
  const [tabPdfUrl,     setTabPdfUrl]     = useState(null);
  const [tabPdfName,    setTabPdfName]    = useState(null);
  const [tabPdfLoading, setTabPdfLoading] = useState(false);
  const [tabPdfError,   setTabPdfError]   = useState(false);

  useEffect(() => {
    api.get(`/api/invoices/${invoiceId}`)
      .then(r => {
        setData(r.data);
        setEditResponsible(r.data.invoice?.responsible || '');
        setEditCategoryId(r.data.invoice?.category_id  || '');
        setEditStatus(r.data.invoice?.status           || 'Pending');
        setRejectComment(r.data.invoice?.status_comment || '');
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    api.get('/api/categories')
      .then(r => setCategories(r.data?.data || r.data || []))
      .catch(() => {});
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
    return () => { if (pdfPreview?.url) URL.revokeObjectURL(pdfPreview.url); };
  }, [pdfPreview]);

  useEffect(() => {
    if (tab !== 'pdf') return;
    if (tabPdfUrl || tabPdfLoading || tabPdfError) return;
    setTabPdfLoading(true);
    api.get(`/api/invoices/${invoiceId}/pdf/original`)
      .then(({ data: pdf }) => {
        const bytes = atob(pdf.contentsB64);
        const arr   = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        const blob  = new Blob([arr], { type: 'application/pdf' });
        setTabPdfUrl(URL.createObjectURL(blob));
        setTabPdfName(pdf.fileName);
      })
      .catch(() => setTabPdfError(true))
      .finally(() => setTabPdfLoading(false));
  }, [tab, invoiceId, tabPdfUrl, tabPdfLoading, tabPdfError]);

  async function saveWithStatus(newStatus, comment = '') {
    setSaving(true);
    try {
      await api.put(`/api/invoices/${invoiceId}/category`, {
        categoryId:    editCategoryId  || null,
        status:        newStatus,
        responsible:   editResponsible || null,
        statusComment: newStatus === 'Rejected' ? comment : null,
      });
      const r = await api.get(`/api/invoices/${invoiceId}`);
      setData(r.data);
      setCategoryHint(null);
      setHintActive(false);
      onRefresh();
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 3000);
    } catch (err) {
      alert('Errore: ' + (err.response?.data?.error || err.message));
    } finally { setSaving(false); }
  }

  function handleStatusBtn(newStatus) {
    if (!editResponsible) return;
    if (newStatus === 'Rejected') { setRejectDialog(true); }
    else { setEditStatus('Approved'); setRejectComment(''); saveWithStatus('Approved'); }
  }
  function confirmReject() {
    setEditStatus('Rejected');
    setRejectDialog(false);
    saveWithStatus('Rejected', rejectComment);
  }
  function cancelReject() { setRejectDialog(false); }

  async function handleSaveCategory() { await saveWithStatus(editStatus, rejectComment); }

  async function handleVerify() {
    if (!window.confirm(t('invoice.verifyConfirm'))) return;
    setVerifying(true);
    try {
      await api.put(`/api/invoices/${invoiceId}/verify`, { comment });
      const r = await api.get(`/api/invoices/${invoiceId}`);
      setData(r.data);
      onRefresh();
      alert('✅ Fattura contrassegnata come "Controllato e Pagabile".\nIl rapporto PDF è stato generato e allegato automaticamente in e-računi.');
    } catch (err) {
      alert('Errore: ' + (err.response?.data?.error || err.message));
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
    } catch (err) { alert('PDF non disponibile'); }
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
    if (!tabPdfUrl) return;
    const link = document.createElement('a');
    link.href = tabPdfUrl; link.download = tabPdfName || 'fattura.pdf'; link.click();
  }
  function handleCategoryChange(catId) {
    setEditCategoryId(catId);
    setHintActive(false);
    setCategoryHint(null);
    const cat = categories.find(c => c.id === catId);
    setEditResponsible(cat ? cat.responsible : '');
  }

  if (!data && loading) return (
    <Overlay onClose={onClose}><div style={S.loadingBox}>{t('common.loading')}</div></Overlay>
  );

  const { invoice, items, audit } = data || {};
  if (!invoice) return null;

  const canVerify = (
    !invoice.verified_flag &&
    ((user.role === 'federico' && invoice.responsible === 'FEDERICO') ||
     (user.role === 'varga'    && invoice.responsible === 'VARGA'))
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
        <div style={{ ...S.modal, ...(tab==='pdf' ? {height:'97vh',maxHeight:'97vh',maxWidth:960} : {}) }}>
          {/* Header */}
          <div style={S.modalHeader}>
            <div>
              <div style={S.modalTitle}>{invoice.supplier || '—'}</div>
              <div style={S.modalSub}>{invoice.inv_number} · {fmtDate(invoice.inv_date)}</div>
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              {invoice.verified_flag && <span style={S.approvedBadge}>✓ Controllato e Pagabile</span>}
              <button style={S.closeBtn} onClick={onClose}>✕</button>
            </div>
          </div>

          {/* Tabs */}
          <div style={S.tabs}>
            {['details','items','workflow','payment','pdf'].map(tab_ => (
              <button key={tab_} style={{...S.tab,...(tab===tab_?S.tabActive:{})}} onClick={()=>setTab(tab_)}>
                {{details:t('invoice.detail'),items:t('invoice.lineItems'),workflow:t('invoice.workflow'),payment:t('invoice.payment'),pdf:'📎 Preview PDF'}[tab_]}
              </button>
            ))}
          </div>

          {/* Body */}
          <div style={{...S.body,...(tab==='pdf'?{padding:0,overflow:'hidden'}:{})}}>

            {tab==='details' && (
              <div style={S.grid2}>
                <Field label={t('invoices.supplier')}     value={invoice.supplier} />
                <Field label={t('invoices.invNumber')}    value={invoice.inv_number} />
                <Field label={t('invoices.date')}         value={fmtDate(invoice.inv_date)} />
                <Field label={t('invoices.due')}          value={fmtDate(invoice.due_date)} />
                <Field label="Data ricezione"             value={fmtDate(invoice.receival_date)} />
                <Field label="Codice fornitore"           value={invoice.supplier_code} />
                <Field label="e-računi ID"                value={invoice.er_id} mono />
                <Field label={t('invoices.category')}     value={invoice.cost_type} />
                <Field label={t('invoices.responsible')}  value={invoice.responsible} />
                <Field label="Anno"                       value={invoice.business_year} />
                <Field label="Note"                       value={invoice.remarks} span />
              </div>
            )}

            {tab==='items' && (
              items?.length > 0 ? (
                <table style={S.table}>
                  <thead><tr style={S.thr}>
                    <th style={S.th}>#</th><th style={S.th}>Descrizione</th>
                    <th style={S.th}>Imponibile</th><th style={S.th}>IVA %</th>
                    <th style={S.th}>Conto</th><th style={S.th}>C. Costo</th>
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
              ) : <div style={S.empty}>Nessuna riga disponibile</div>
            )}

            {tab==='workflow' && (
              <div>
                <div style={S.amountRow}>
                  <AmountBox label={t('invoice.netAmount')} value={fmtCur(invoice.net_amount)} />
                  <AmountBox label={t('invoice.vat')}       value={fmtCur(invoice.vat)} />
                  <AmountBox label="Totale"                  value={fmtCur(invoice.total)} large />
                  <AmountBox label={t('invoice.leftToPay')} value={fmtCur(invoice.left_to_pay)} accent />
                </div>
                {!invoice.verified_flag && (
                  <div style={S.adminBox}>
                    <div style={S.adminTitle}>⚙️ Assegnazione (Admin)</div>
                    <div style={S.adminGrid}>
                      <div>
                        <label style={S.fieldLabel}>Categoria</label>
                        <select style={categorySelectStyle} value={editCategoryId} onChange={e=>handleCategoryChange(e.target.value)}>
                          <option value="">— nessuna —</option>
                          {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        {hintActive && categoryHint && (
                          <div style={S.hintLabel}>🤖 Proposta basata su {categoryHint.usage_count}x fatture precedenti — verificare</div>
                        )}
                      </div>
                      <div>
                        <label style={S.fieldLabel}>Delegato</label>
                        <div style={{...S.adminSelect,background:'#f4f3f1',color:editResponsible?'#1c2b3a':'#aaa',cursor:'default',display:'flex',alignItems:'center',fontWeight:editResponsible?600:400}}>
                          {editResponsible
                            ? <><span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:editResponsible==='FEDERICO'?'#1c2b3a':'#c77d3a',marginRight:8}}/>{editResponsible}</>
                            : '— seleziona categoria —'}
                        </div>
                      </div>
                      <div>
                        <label style={S.fieldLabel}>
                          Stato
                          {delegatoMissing && <span style={{marginLeft:6,color:'#c77d3a',fontWeight:400,fontSize:10,textTransform:'none'}}>⚠ seleziona delegato</span>}
                        </label>
                        <div style={{display:'flex',gap:8}}>
                          <button style={btnApproved} onClick={()=>handleStatusBtn('Approved')} disabled={delegatoMissing} title={delegatoMissing?'Seleziona prima un delegato':''}>✓ Approved</button>
                          <button style={btnRejected} onClick={()=>handleStatusBtn('Rejected')} disabled={delegatoMissing} title={delegatoMissing?'Seleziona prima un delegato':''}>✕ Rejected</button>
                        </div>
                        {isRejected && rejectComment && <div style={{fontSize:11,color:'#c0392b',marginTop:4,fontStyle:'italic',fontFamily:'sans-serif'}}>"{rejectComment}"</div>}
                      </div>
                      <div style={{display:'flex',alignItems:'flex-end',gap:8}}>
                        {saving && <span style={{fontSize:13,color:'#7a7571',fontFamily:'sans-serif'}}>⏳</span>}
                        {savedMsg && <span style={{fontSize:13,color:'#2e7d52',fontWeight:600,fontFamily:'sans-serif'}}>✅ Salvato</span>}
                      </div>
                    </div>
                  </div>
                )}
                {invoice.verified_flag ? (
                  <div style={S.approvedBox}>
                    <div style={S.approvedTitle}>✓ Controllato e Pagabile</div>
                    <div style={S.approvedMeta}>
                      {t('invoice.verifiedBy')}: <strong>{invoice.verified_by_name}</strong> ({invoice.verified_by})<br/>
                      {t('invoice.verifiedAt')}: <strong>{fmtDT(invoice.verified_at)}</strong>
                    </div>
                    {invoice.verified_comment && <div style={S.comment}>"{invoice.verified_comment}"</div>}
                    <div style={{marginTop:12,display:'flex',gap:8}}>
                      <button style={S.pdfBtn} onClick={()=>downloadPDF('approval_report')}>📄 {t('invoice.downloadPDF')} (Approvazione)</button>
                      <button style={{...S.pdfBtn,background:invoice.original_pdf_id?'#2e7d52':'#ccc',color:'#fff',cursor:invoice.original_pdf_id?'pointer':'not-allowed',opacity:invoice.original_pdf_id?1:0.7}}
                        onClick={()=>invoice.original_pdf_id&&downloadPDF('original')} title={invoice.original_pdf_id?'Visualizza PDF originale':'PDF non ancora disponibile'}>
                        📎 PDF Originale
                      </button>
                    </div>
                  </div>
                ) : canVerify ? (
                  <div style={S.verifyBox}>
                    <div style={S.verifyTitle}>Approvazione richiesta</div>
                    <p style={S.verifyHint}>Conferma di aver verificato questa fattura. Verrà generato un PDF di approvazione e allegato automaticamente in e-računi.</p>
                    <textarea style={S.textarea} placeholder={t('invoice.comment')} value={comment} onChange={e=>setComment(e.target.value)} rows={3}/>
                    <button style={S.verifyBtn} onClick={handleVerify} disabled={verifying}>{verifying?'⏳ Generazione PDF...':`✓ ${t('invoice.verifyBtn')}`}</button>
                  </div>
                ) : (
                  <div style={S.pendingBox}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                      <span>⏳ In attesa di approvazione da {invoice.responsible||'(non assegnato)'}</span>
                      <button style={{...S.pdfBtn,background:invoice.original_pdf_id?'#2e7d52':'#ccc',color:'#fff',cursor:invoice.original_pdf_id?'pointer':'not-allowed',opacity:invoice.original_pdf_id?1:0.7,marginLeft:12}}
                        onClick={()=>invoice.original_pdf_id&&downloadPDF('original')} title={invoice.original_pdf_id?'Visualizza PDF originale':'PDF non ancora disponibile'}>
                        📎 PDF Originale
                      </button>
                    </div>
                  </div>
                )}
                {audit?.length > 0 && (
                  <div style={{marginTop:20}}>
                    <div style={S.sectionTitle}>Storico</div>
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
              <div style={S.grid2}>
                <Field label={t('invoice.bankAccount')}   value={invoice.bank_account} mono />
                <Field label={t('invoice.payReference')}  value={invoice.pay_reference} mono />
                <Field label="Metodo"                     value={invoice.payment_method} />
                <Field label={t('invoice.paymentOrder')}  value={invoice.payment_order} />
                <Field label={t('invoice.paymentDate')}   value={fmtDate(invoice.payment_date)} />
                <Field label={t('invoice.paymentSource')} value={invoice.payment_source} />
              </div>
            )}

            {/* ── Tab Preview PDF ── */}
            {tab==='pdf' && (
              <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
                <div style={S.tabPdfBar}>
                  <span style={{fontSize:13,color:'#7a7571',fontFamily:'sans-serif',flexShrink:0}}>
                    {tabPdfName||'PDF Originale'}
                  </span>
                  <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>

                    {/* Delegato chip — solo se fattura non ancora verificata */}
                    {!invoice.verified_flag && (
                      <div style={S.delegatoChip}>
                        <span style={S.delegatoChipLabel}>Delegato</span>
                        {editResponsible ? (
                          <span style={{...S.delegatoChipValue, color: editResponsible==='FEDERICO'?'#1c2b3a':'#c77d3a'}}>
                            <span style={{display:'inline-block',width:7,height:7,borderRadius:'50%',background:editResponsible==='FEDERICO'?'#1c2b3a':'#c77d3a',marginRight:5,verticalAlign:'middle'}}/>
                            {editResponsible}
                          </span>
                        ) : (
                          <span style={S.delegatoChipMissing}>⚠ non definito</span>
                        )}
                      </div>
                    )}

                    {!invoice.verified_flag && (
                      <>
                        <button style={btnApproved} onClick={()=>handleStatusBtn('Approved')} disabled={delegatoMissing} title={delegatoMissing?'Seleziona prima un delegato nel tab Workflow':''}>✓ Approved</button>
                        <button style={btnRejected} onClick={()=>handleStatusBtn('Rejected')} disabled={delegatoMissing} title={delegatoMissing?'Seleziona prima un delegato nel tab Workflow':''}>✕ Rejected</button>
                        {saving && <span style={{fontSize:12,color:'#7a7571',fontFamily:'sans-serif'}}>⏳</span>}
                        {savedMsg && <span style={{fontSize:12,color:'#2e7d52',fontWeight:600,fontFamily:'sans-serif'}}>✅ Salvato</span>}
                        {isRejected && rejectComment && <span style={{fontSize:11,color:'#c0392b',fontStyle:'italic',fontFamily:'sans-serif'}}>"{rejectComment}"</span>}
                      </>
                    )}
                    {tabPdfUrl && <button style={S.pdfDlBtn} onClick={tabPdfDownload}>⬇ Scarica</button>}
                  </div>
                </div>
                {tabPdfLoading && <div style={S.empty}>⏳ Caricamento PDF...</div>}
                {tabPdfError   && <div style={S.empty}>📎 PDF originale non disponibile per questa fattura.</div>}
                {tabPdfUrl && !tabPdfLoading && <iframe src={tabPdfUrl} style={{flex:1,border:'none',width:'100%'}} title="Preview PDF"/>}
              </div>
            )}

          </div>
        </div>
      </Overlay>

      {/* Reject dialog */}
      {rejectDialog && (
        <div style={S.pdfOverlay}>
          <div style={S.rejectModal}>
            <div style={{fontSize:16,fontWeight:700,color:'#c0392b',marginBottom:8,fontFamily:'sans-serif'}}>✕ Motivo rifiuto</div>
            <div style={{fontSize:13,color:'#5a5551',marginBottom:14,fontFamily:'sans-serif'}}>Aggiungi un commento (opzionale) per spiegare il motivo del rifiuto.</div>
            <textarea style={{...S.textarea,marginBottom:16}} placeholder="Es. Importo non corretto, fattura duplicata..." value={rejectComment} onChange={e=>setRejectComment(e.target.value)} rows={3} autoFocus/>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button style={{...S.saveBtn,background:'#f4f3f1',color:'#1c2b3a'}} onClick={cancelReject}>Annulla</button>
              <button style={{...S.saveBtn,background:'#c0392b'}} onClick={confirmReject}>✕ Conferma Rifiuto</button>
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
                <button style={S.pdfDlBtn} onClick={forcePdfDownload}>⬇ Scarica</button>
                <button style={S.pdfCloseBtn} onClick={closePdfPreview}>✕ Chiudi</button>
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
  adminGrid:          { display:'grid',gridTemplateColumns:'1fr 1fr 1fr auto',gap:12,alignItems:'end' },
  adminSelect:        { width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #c8d8e8',fontSize:13,background:'#fff',cursor:'pointer' },
  saveBtn:            { padding:'8px 16px',borderRadius:6,border:'none',background:'#1c2b3a',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:600,whiteSpace:'nowrap' },
  statusBtn:          { padding:'6px 12px',borderRadius:6,fontSize:12,fontWeight:600,fontFamily:'sans-serif',transition:'all 0.15s',border:'2px solid transparent' },
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
};
