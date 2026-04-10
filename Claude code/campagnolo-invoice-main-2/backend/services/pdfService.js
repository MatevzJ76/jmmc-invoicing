const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const { sysLog }   = require('../utils/logger');
const { auditLog } = require('../utils/logger');
const erClient     = require('./erClient');
const supabase     = require('../utils/supabase');
const { aliasFromRow } = require('../utils/responsibleResolve');

const COLORS = {
  navy:    rgb(0.11, 0.17, 0.23),
  accent:  rgb(0.78, 0.53, 0.23),
  green:   rgb(0.18, 0.49, 0.32),
  muted:   rgb(0.48, 0.44, 0.41),
  light:   rgb(0.97, 0.96, 0.95),
  white:   rgb(1, 1, 1),
  black:   rgb(0, 0, 0),
};

// ─────────────────────────────────────────────────────────────────
// DOWNLOAD ORIGINAL PDF FROM e-računi
// Called during import or on-demand from route
// ─────────────────────────────────────────────────────────────────
async function downloadOriginalPDF(invoiceId, erId) {
  const t0 = Date.now();

  try {
    await sysLog('INFO', 'PDF', 'Downloading original PDF(s) from e-računi', { erId, invoiceId });

    // Check if already downloaded (any row of type 'original')
    const { data: existing } = await supabase
      .from('invoice_attachments')
      .select('id, file_name')
      .eq('invoice_id', invoiceId)
      .eq('attachment_type', 'original');

    if (existing && existing.length > 0) {
      // Ensure original_pdf_id is set on invoice (may be null if previously reset or imported before PDF download)
      await supabase
        .from('invoices')
        .update({ original_pdf_id: existing[0].id, updated_at: new Date().toISOString() })
        .eq('id', invoiceId)
        .is('original_pdf_id', null); // only update if missing
      await sysLog('INFO', 'PDF', 'Original PDF(s) already exist, skipping', {
        erId, count: existing.length, fileName: existing[0].file_name,
      });
      return { attachmentId: existing[0].id, attachmentIds: existing.map(e => e.id), skipped: true };
    }

    // Fetch ALL attachments from e-računi
    const results = await erClient.fetchInvoicePDFs(erId);

    if (!results || results.length === 0) {
      await sysLog('INFO', 'PDF', 'No PDF attachment available in e-računi', { erId });
      return { attachmentId: null, attachmentIds: [], skipped: true, noAttachment: true };
    }

    // Insert each attachment as a separate row
    const insertedIds = [];
    for (const result of results) {
      const base64   = result.contents;
      const fileName = result.fileName || `Invoice_${erId.replace(':', '_')}.pdf`;
      const sizeKb   = Math.round((base64.length * 3) / 4 / 1024);

      const { data: att, error: attErr } = await supabase
        .from('invoice_attachments')
        .insert({
          invoice_id:      invoiceId,
          er_id:           erId,
          attachment_type: 'original',
          file_name:       fileName,
          file_type:       result.fileType || 'pdf',
          contents_b64:    base64,
          file_size_kb:    sizeKb,
          er_uploaded:     true,
          er_uploaded_at:  new Date().toISOString(),
        })
        .select('id')
        .single();

      if (attErr) throw attErr;
      insertedIds.push(att.id);
    }

    // Update invoice.original_pdf_id to first attachment
    await supabase
      .from('invoices')
      .update({ original_pdf_id: insertedIds[0], updated_at: new Date().toISOString() })
      .eq('id', invoiceId);

    await sysLog('INFO', 'PDF', 'Original PDF(s) saved', {
      erId,
      detail:    `count=${insertedIds.length} files=${results.map(r => r.fileName).join(', ')}`,
      durationMs: Date.now() - t0,
    });

    return { attachmentId: insertedIds[0], attachmentIds: insertedIds, fileName: results[0].fileName };

  } catch (err) {
    // "No attachment" errors are not critical — log as INFO
    const msg = err.message || '';
    const isNoAtt = /no attachment|does not have|nima prilog|not found/i.test(msg);

    await sysLog(isNoAtt ? 'INFO' : 'ERROR', 'PDF',
      isNoAtt ? 'No original PDF in e-računi' : 'Original PDF download failed',
      { erId, error: err, durationMs: Date.now() - t0 }
    );

    if (isNoAtt) return { attachmentId: null, attachmentIds: [], skipped: true, noAttachment: true };
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────
// GENERATE APPROVAL PDF REPORT
// Called when delegate verifies invoice
// ─────────────────────────────────────────────────────────────────
async function generateApprovalPDF(invoice, items, auditEntries, user) {
  const t0 = Date.now();

  await sysLog('INFO', 'PDF', 'Approval PDF generation started', {
    erId:      invoice.er_id,
    invoiceId: invoice.id,
    userEmail: user.email,
  });

  try {
    const pdfDoc   = await PDFDocument.create();
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const page  = pdfDoc.addPage([595, 842]); // A4
    const { width, height } = page.getSize();

    let y = height - 40;

    // Header bar
    page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: COLORS.navy });
    page.drawText('CAMPAGNOLO KOPER', {
      x: 40, y: height - 30, size: 11, font: fontBold, color: COLORS.white,
    });
    page.drawText('RAPPORTO DI APPROVAZIONE FATTURA', {
      x: 40, y: height - 50, size: 16, font: fontBold, color: COLORS.white,
    });
    page.drawText(`Generato: ${new Date().toLocaleString('it-IT')}`, {
      x: 40, y: height - 68, size: 9, font: fontReg, color: rgb(0.7, 0.7, 0.7),
    });

    y = height - 105;

    y = drawSection(page, fontBold, 'DATI FATTURA', y, width);
    y = drawRow(page, fontReg, fontBold, 'Fornitore',      invoice.supplier || '—',       y);
    y = drawRow(page, fontReg, fontBold, 'N. Fattura',     invoice.inv_number || '—',     y);
    y = drawRow(page, fontReg, fontBold, 'Data fattura',   fmtDate(invoice.inv_date),     y);
    y = drawRow(page, fontReg, fontBold, 'Data ricezione', fmtDate(invoice.receival_date),y);
    y = drawRow(page, fontReg, fontBold, 'Scadenza',       fmtDate(invoice.due_date),     y);
    y = drawRow(page, fontReg, fontBold, 'e-računi ID',    invoice.er_id,                 y);
    y -= 8;

    y = drawSection(page, fontBold, 'IMPORTI', y, width);
    y = drawRow(page, fontReg, fontBold, 'Imponibile', fmtCur(invoice.net_amount), y);
    y = drawRow(page, fontReg, fontBold, 'IVA',        fmtCur(invoice.vat),        y);
    y = drawRow(page, fontReg, fontBold, 'TOTALE',     fmtCur(invoice.total),      y, true);
    y = drawRow(page, fontReg, fontBold, 'Da pagare',  fmtCur(invoice.left_to_pay),y);
    y -= 8;

    y = drawSection(page, fontBold, 'DATI PAGAMENTO', y, width);
    y = drawRow(page, fontReg, fontBold, 'C/C Bancario', invoice.bank_account   || '—', y);
    y = drawRow(page, fontReg, fontBold, 'Riferimento',  invoice.pay_reference  || '—', y);
    y = drawRow(page, fontReg, fontBold, 'Metodo',       invoice.method_of_payment || invoice.payment_method || '—', y);
    y -= 8;

    y = drawSection(page, fontBold, 'CLASSIFICAZIONE', y, width);
    y = drawRow(page, fontReg, fontBold, 'Categoria', invoice.cost_type   || '—', y);
    // FAZA B: prefer canonical alias resolved via responsible_user_id (FK).
    const delegatoLabel = (await aliasFromRow(invoice)) || invoice.responsible || '—';
    y = drawRow(page, fontReg, fontBold, 'Delegato',  delegatoLabel, y);
    y -= 8;

    if (items?.length) {
      y = drawSection(page, fontBold, 'RIGHE FATTURA', y, width);
      for (const item of items) {
        const line = `${item.position}. ${item.description || '—'} — ${fmtCur(item.net_amount)} (IVA ${item.vat_percentage || 0}%)`;
        y = drawText(page, fontReg, line, 9, 40, y, COLORS.black);
      }
      y -= 8;
    }

    if (invoice.status_note) {
      y = drawSection(page, fontBold, 'NOTE DELEGATO', y, width);
      y = drawText(page, fontReg, invoice.status_note, 10, 40, y, COLORS.black);
      y -= 8;
    }

    y = drawSection(page, fontBold, 'APPROVAZIONE', y, width, COLORS.green);
    page.drawRectangle({ x: 40, y: y - 60, width: width - 80, height: 62, color: rgb(0.83, 0.93, 0.85) });
    page.drawText('CONTROLLATO E PAGABILE', {
      x: 55, y: y - 18, size: 14, font: fontBold, color: COLORS.green,
    });
    page.drawText(`Approvato da: ${safeText(invoice.status_changed_by_name)} (${invoice.status_changed_by || '—'})`, {
      x: 55, y: y - 34, size: 10, font: fontReg, color: COLORS.black,
    });
    page.drawText(`Data approvazione: ${fmtDateTime(invoice.status_changed_at)}`, {
      x: 55, y: y - 50, size: 10, font: fontReg, color: COLORS.black,
    });
    y -= 75;
    y -= 8;

    if (auditEntries?.length) {
      y = drawSection(page, fontBold, 'STORICO MODIFICHE', y, width);
      for (const entry of auditEntries.slice(0, 8)) {
        const line = `${fmtDateTime(entry.created_at)} — ${entry.user_name}: ${entry.action}`;
        y = drawText(page, fontReg, line, 8, 40, y, COLORS.muted);
      }
    }

    // Footer
    page.drawLine({ start: { x: 40, y: 40 }, end: { x: width - 40, y: 40 }, thickness: 1, color: COLORS.muted });
    page.drawText(`Invoice Manager v${process.env.APP_VERSION || '1.0.0'} | Campagnolo Koper | ${new Date().toLocaleDateString('it-IT')}`, {
      x: 40, y: 26, size: 8, font: fontReg, color: COLORS.muted,
    });

    const pdfBytes = await pdfDoc.save();
    const base64   = Buffer.from(pdfBytes).toString('base64');
    const sizeKb   = Math.round(pdfBytes.length / 1024);
    const fileName = `Approval_${invoice.inv_number || invoice.er_id}_${fmtDateFile(new Date())}.pdf`;

    await sysLog('INFO', 'PDF', 'Approval PDF generated', {
      erId: invoice.er_id, invoiceId: invoice.id,
      detail: `fileName=${fileName} size=${sizeKb}KB`,
      durationMs: Date.now() - t0,
    });

    // Save to DB
    const { data: att, error: attErr } = await supabase
      .from('invoice_attachments')
      .insert({
        invoice_id:      invoice.id,
        er_id:           invoice.er_id,
        attachment_type: 'approval_report',
        file_name:       fileName,
        file_type:       'pdf',
        contents_b64:    base64,
        file_size_kb:    sizeKb,
        er_uploaded:     false,
        created_by:      user.email,
      })
      .select('id')
      .single();

    if (attErr) throw attErr;

    // Upload to e-računi
    let txnId = null;
    try {
      txnId = await erClient.uploadApprovalPDF(invoice.er_id, fileName, base64);
      await supabase.from('invoice_attachments').update({
        er_uploaded:    true,
        er_uploaded_at: new Date().toISOString(),
        er_txn_id:      txnId,
      }).eq('id', att.id);
      await sysLog('INFO', 'PDF', 'Approval PDF uploaded to e-računi', { erId: invoice.er_id, detail: `txnId=${txnId}` });
    } catch (uploadErr) {
      await sysLog('ERROR', 'PDF', 'Approval PDF upload to e-računi failed', { erId: invoice.er_id, error: uploadErr });
    }

    await supabase.from('invoices').update({ approval_pdf_id: att.id }).eq('id', invoice.id);

    return { attachmentId: att.id, erId: invoice.er_id, txnId };

  } catch (err) {
    await sysLog('ERROR', 'PDF', 'Approval PDF generation failed', {
      erId: invoice.er_id, error: err, durationMs: Date.now() - t0,
    });
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────
// PDF DRAWING HELPERS
// ─────────────────────────────────────────────────────────────────

// Transliterate characters not in WinAnsiEncoding (Slovenian, Croatian, etc.)
function safeText(s) {
  return String(s ?? '—')
    .replace(/č/g, 'c').replace(/Č/g, 'C')
    .replace(/š/g, 's').replace(/Š/g, 'S')
    .replace(/ž/g, 'z').replace(/Ž/g, 'Z')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/ć/g, 'c').replace(/Ć/g, 'C')
    .replace(/€/g, 'EUR ')             // € (U+20AC) is above Latin-1, handle explicitly
    .replace(/[\u0100-\uFFFF]/g, '?'); // catch-all for any other non-Latin1 char
}

function drawSection(page, fontBold, title, y, width, color = COLORS.navy) {
  page.drawRectangle({ x: 0, y: y - 20, width, height: 22, color });
  page.drawText(safeText(title), { x: 40, y: y - 14, size: 10, font: fontBold, color: COLORS.white });
  return y - 30;
}

function drawRow(page, fontReg, fontBold, label, value, y, bold = false) {
  page.drawText(safeText(label) + ':', { x: 40, y, size: 10, font: fontReg, color: COLORS.muted });
  page.drawText(safeText(value), { x: 200, y, size: 10, font: bold ? fontBold : fontReg, color: COLORS.black });
  return y - 16;
}

function drawText(page, font, text, size, x, y, color) {
  const maxChars = 90;
  const lines = [];
  let current = '';
  for (const word of safeText(text).split(' ')) {
    if ((current + word).length > maxChars) { lines.push(current.trim()); current = ''; }
    current += word + ' ';
  }
  if (current.trim()) lines.push(current.trim());
  for (const line of lines) {
    page.drawText(line, { x, y, size, font, color });
    y -= size + 4;
  }
  return y;
}

function fmtDate(d)     { return d ? new Date(d).toLocaleDateString('it-IT')  : '—'; }
function fmtDateTime(d) { return d ? new Date(d).toLocaleString('it-IT')      : '—'; }
function fmtDateFile(d) { return d.toISOString().split('T')[0]; }
function fmtCur(n)      { return n != null ? `€ ${Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` : '—'; }

// ─────────────────────────────────────────────────────────────────
// GENERATE DISTINTA PDF REPORT
// Called after distinta send-email completes successfully
// ─────────────────────────────────────────────────────────────────
async function generateDistintaPDF(invoice, batchId, sentAt) {
  const t0 = Date.now();

  await sysLog('INFO', 'PDF', 'Distinta PDF generation started', {
    erId:      invoice.er_id,
    invoiceId: invoice.id,
    batchId,
  });

  try {
    const pdfDoc   = await PDFDocument.create();
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const page  = pdfDoc.addPage([595, 842]); // A4
    const { width, height } = page.getSize();

    // Header bar
    page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: COLORS.navy });
    page.drawText('CAMPAGNOLO KOPER', {
      x: 40, y: height - 30, size: 11, font: fontBold, color: COLORS.white,
    });
    page.drawText('DISTINTA DI PAGAMENTO', {
      x: 40, y: height - 50, size: 16, font: fontBold, color: COLORS.white,
    });
    page.drawText(`Generato: ${new Date().toLocaleString('it-IT')}`, {
      x: 40, y: height - 68, size: 9, font: fontReg, color: rgb(0.7, 0.7, 0.7),
    });

    let y = height - 105;

    y = drawSection(page, fontBold, 'DISTINTA DI PAGAMENTO', y, width, COLORS.accent);
    page.drawRectangle({ x: 40, y: y - 48, width: width - 80, height: 50, color: rgb(0.98, 0.95, 0.88) });
    page.drawText('INVIATA IN PAGAMENTO', {
      x: 55, y: y - 16, size: 13, font: fontBold, color: COLORS.accent,
    });
    page.drawText(`Batch ID: ${batchId}`, {
      x: 55, y: y - 32, size: 10, font: fontReg, color: COLORS.black,
    });
    page.drawText(`Data invio: ${fmtDateTime(sentAt)}`, {
      x: 55, y: y - 44, size: 10, font: fontReg, color: COLORS.black,
    });
    y -= 62;
    y -= 8;

    y = drawSection(page, fontBold, 'DATI FATTURA', y, width);
    y = drawRow(page, fontReg, fontBold, 'Fornitore',      invoice.supplier    || '—', y);
    y = drawRow(page, fontReg, fontBold, 'N. Fattura',     invoice.inv_number  || '—', y);
    y = drawRow(page, fontReg, fontBold, 'Data fattura',   fmtDate(invoice.inv_date),  y);
    y = drawRow(page, fontReg, fontBold, 'Scadenza',       fmtDate(invoice.due_date),  y);
    y = drawRow(page, fontReg, fontBold, 'Protocollo',     invoice.internal_number || '—', y);
    y = drawRow(page, fontReg, fontBold, 'e-računi ID',    invoice.er_id,              y);
    y -= 8;

    y = drawSection(page, fontBold, 'IMPORTI', y, width);
    y = drawRow(page, fontReg, fontBold, 'Imponibile', fmtCur(invoice.net_amount), y);
    y = drawRow(page, fontReg, fontBold, 'IVA',        fmtCur(invoice.vat),        y);
    y = drawRow(page, fontReg, fontBold, 'TOTALE',     fmtCur(invoice.total),      y, true);
    y = drawRow(page, fontReg, fontBold, 'Da pagare',  fmtCur(invoice.left_to_pay),y);
    y -= 8;

    y = drawSection(page, fontBold, 'DATI PAGAMENTO', y, width);
    y = drawRow(page, fontReg, fontBold, 'C/C Bancario', invoice.bank_account        || '—', y);
    y = drawRow(page, fontReg, fontBold, 'Riferimento',  invoice.pay_reference       || '—', y);
    y = drawRow(page, fontReg, fontBold, 'Metodo',       invoice.payment_method      || '—', y);
    y -= 8;

    y = drawSection(page, fontBold, 'CLASSIFICAZIONE', y, width);
    y = drawRow(page, fontReg, fontBold, 'Categoria', invoice.cost_type   || '—', y);
    // FAZA B: prefer canonical alias resolved via responsible_user_id (FK).
    const delegatoLabel2 = (await aliasFromRow(invoice)) || invoice.responsible || '—';
    y = drawRow(page, fontReg, fontBold, 'Delegato',  delegatoLabel2, y);
    y -= 8;

    // ── STORICO MODIFICHE ──
    const { data: auditEntries } = await supabase
      .from('audit_log')
      .select('created_at, user_name, action')
      .eq('invoice_id', invoice.id)
      .order('created_at', { ascending: true });

    if (auditEntries?.length) {
      // Helper: add footer to a page
      const addFooter = (pg) => {
        pg.drawLine({ start: { x: 40, y: 40 }, end: { x: width - 40, y: 40 }, thickness: 1, color: COLORS.muted });
        pg.drawText(`Invoice Manager v${process.env.APP_VERSION || '1.0.0'} | Campagnolo Koper | ${new Date().toLocaleDateString('it-IT')}`, {
          x: 40, y: 26, size: 8, font: fontReg, color: COLORS.muted,
        });
      };

      let curPage = page;
      let curY    = y;

      // Draw section header — add new page if not enough space
      if (curY < 120) {
        addFooter(curPage);
        curPage = pdfDoc.addPage([595, 842]);
        curY = curPage.getSize().height - 40;
      }
      curY = drawSection(curPage, fontBold, 'STORICO MODIFICHE', curY, width);

      for (const entry of auditEntries) {
        const line = `${fmtDateTime(entry.created_at)}  ${safeText(entry.user_name)}: ${safeText(entry.action)}`;
        const lineHeight = 8 + 4; // size + spacing

        if (curY < 60 + lineHeight) {
          addFooter(curPage);
          curPage = pdfDoc.addPage([595, 842]);
          curY = curPage.getSize().height - 40;
          // Repeat section header on new page
          curY = drawSection(curPage, fontBold, 'STORICO MODIFICHE (continua)', curY, width);
        }

        curY = drawText(curPage, fontReg, line, 8, 40, curY, COLORS.muted);
      }

      // Footer on last page
      addFooter(curPage);
    } else {
      // Footer (no audit entries)
      page.drawLine({ start: { x: 40, y: 40 }, end: { x: width - 40, y: 40 }, thickness: 1, color: COLORS.muted });
      page.drawText(`Invoice Manager v${process.env.APP_VERSION || '1.0.0'} | Campagnolo Koper | ${new Date().toLocaleDateString('it-IT')}`, {
        x: 40, y: 26, size: 8, font: fontReg, color: COLORS.muted,
      });
    }

    const pdfBytes = await pdfDoc.save();
    const base64   = Buffer.from(pdfBytes).toString('base64');
    const sizeKb   = Math.round(pdfBytes.length / 1024);
    const fileName = `Distinta_${batchId}_${invoice.inv_number || invoice.er_id}.pdf`;

    await sysLog('INFO', 'PDF', 'Distinta PDF generated', {
      erId: invoice.er_id, invoiceId: invoice.id,
      detail: `fileName=${fileName} size=${sizeKb}KB`,
      durationMs: Date.now() - t0,
    });

    // Save to DB
    const { data: att, error: attErr } = await supabase
      .from('invoice_attachments')
      .insert({
        invoice_id:      invoice.id,
        er_id:           invoice.er_id,
        attachment_type: 'distinta_report',
        file_name:       fileName,
        file_type:       'pdf',
        contents_b64:    base64,
        file_size_kb:    sizeKb,
        er_uploaded:     false,
      })
      .select('id')
      .single();

    if (attErr) throw attErr;

    await sysLog('INFO', 'PDF', 'Distinta PDF saved to DB', {
      erId: invoice.er_id, attachmentId: att.id,
      detail: 'Next step: upload to e-računi via ReceivedInvoiceAttachmentAdd',
    });

    return { attachmentId: att.id };

  } catch (err) {
    await sysLog('ERROR', 'PDF', 'Distinta PDF generation failed', {
      erId: invoice.er_id, error: err, durationMs: Date.now() - t0,
    });
    throw err;
  }
}

module.exports = { generateApprovalPDF, downloadOriginalPDF, generateDistintaPDF };
