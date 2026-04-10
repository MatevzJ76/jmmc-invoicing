const supabase    = require('../utils/supabase');
const erClient    = require('./erClient');
const { sysLog, auditLog }  = require('../utils/logger');
const syncState   = require('../utils/syncState');

/**
 * Main import function — fetches ReceivedInvoiceList then ReceivedInvoiceGet
 * for each invoice to get Items + PaymentRecords. Supports batch processing.
 */
async function importInvoices(dateFrom, dateTo, options = {}) {
  const { batchSize = 20, offset = 0, importAnno, importDateFrom } = options;
  const today = new Date().toISOString().split('T')[0];
  const from  = dateFrom || process.env.IMPORT_DATE_FROM || '2026-01-01';
  const to    = dateTo   || today;

  // Guard: prevent concurrent imports (scheduler + manual at same time)
  if (syncState.isRunning()) {
    throw new Error(`Import already in progress (${syncState.runningWhat()}). Wait for it to finish or cancel it first.`);
  }

  syncState.clearCancel();
  syncState.setRunning(true, 'import');

  await sysLog('INFO', 'IMPORT', 'Import started', {
    detail: `dateFrom=${from} dateTo=${to} offset=${offset} batchSize=${batchSize}` +
            (importAnno     ? ` importAnno=${importAnno}`           : '') +
            (importDateFrom ? ` importDateFrom=${importDateFrom}`   : ''),
  });

  let invoiceList;
  try {
    invoiceList = await erClient.fetchInvoiceList(from, to);
  } catch (err) {
    syncState.setRunning(false); // release lock on early exit
    await sysLog('ERROR', 'IMPORT', 'fetchInvoiceList failed', { error: err });
    throw err;
  }

  if (!Array.isArray(invoiceList) || invoiceList.length === 0) {
    await sysLog('INFO', 'IMPORT', 'No invoices returned from API');
    return { inserted: 0, updated: 0, errors: 0, remaining: 0, total: 0 };
  }

  // ── Pre-filter by businessYear at list level (avoids unnecessary detail fetches) ──
  let filteredList = invoiceList;
  if (importAnno) {
    filteredList = invoiceList.filter(inv => String(inv.businessYear) === String(importAnno));
    await sysLog('INFO', 'IMPORT', `BusinessYear filter: ${invoiceList.length} → ${filteredList.length} (anno=${importAnno})`);
  }

  // Slice to current batch
  const batch     = filteredList.slice(offset, offset + batchSize);
  const remaining = Math.max(0, filteredList.length - offset - batch.length);

  await sysLog('INFO', 'IMPORT', `Processing batch ${offset}-${offset + batch.length} of ${invoiceList.length}`);

  let inserted = 0, updated = 0, errors = 0;
  let cancelled = false;

  for (const inv of batch) {
    // Check for cancellation request between each invoice
    if (syncState.isCancelRequested()) {
      await sysLog('WARN', 'IMPORT', 'Import cancelled by user request', {
        detail: `Stopped after inserted=${inserted} updated=${updated} errors=${errors}`,
      });
      cancelled = true;
      break;
    }

    try {
      const erId = String(inv.documentID || '').trim();
      if (!erId) { errors++; continue; }

      // ── Fetch full invoice detail (includes Items + PaymentRecords) ────────
      let invDetail;
      try {
        invDetail = await erClient.fetchInvoiceDetail(erId);
        await new Promise(r => setTimeout(r, 200)); // rate limit delay
      } catch (detailErr) {
        console.warn('[importService] fetchInvoiceDetail failed for', erId, detailErr.message);
        invDetail = inv; // fallback to list data
      }

      // Merge: detail overrides list data
      const invData = { ...inv, ...invDetail };

      // ── Filter by dateOfSupplyFrom (after detail fetch, field may only exist in detail) ──
      if (importDateFrom && invData.dateOfSupplyFrom) {
        const supplyFrom = String(invData.dateOfSupplyFrom).split('T')[0];
        if (supplyFrom < importDateFrom) {
          await sysLog('INFO', 'IMPORT', `Skipped (dateOfSupplyFrom ${supplyFrom} < ${importDateFrom})`, { detail: `er_id=${erId}` });
          continue;
        }
      }

      // ── Safe date helper ───────────────────────────────────────────────────
      const safeDate = v => {
        if (!v) return null;
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
      };

      // ── Calculate net/vat totals from Items[] ──────────────────────────────
      const items = Array.isArray(invData.Items) ? invData.Items : [];
      let netTotal = 0, vatTotal = 0;
      for (const item of items) {
        const net = typeof item.netAmount === 'number' ? item.netAmount : 0;
        const vat = typeof item.vatPercentage === 'number' ? net * item.vatPercentage / 100 : 0;
        netTotal += net;
        vatTotal += vat;
      }
      netTotal = Math.round(netTotal * 100) / 100;
      vatTotal = Math.round(vatTotal * 100) / 100;

      // ── Map ALL invoice fields ─────────────────────────────────────────────
      const invoiceRow = {
        er_id:                    erId,
        internal_number:          invData.internalNumber               || null,
        inv_number:                invData.number                       || null,
        inv_date:                  safeDate(invData.date),
        receival_date:             safeDate(invData.receivalDate),
        due_date:                  safeDate(invData.paymentDueDate),
        supply_date_from:          safeDate(invData.dateOfSupplyFrom),
        supply_date_until:         safeDate(invData.dateOfSupplyUntil),
        supplier:                  invData.supplier                     || null,
        supplier_code:             invData.supplierCode                 || null,
        supplier_document_id:      invData.supplierDocumentID           || null,
        supplier_booking_account:  invData.supplierBookingAccountNumber || null,
        document_id_barcode:       invData.documentIdBarCode            || null,
        business_year:             invData.businessYear                 || null,
        cost_position:             invData.costPosition                 || null,
        method_of_payment:         invData.methodOfPayment              || null,
        payment_amount:            invData.paymentAmount                ?? null,
        net_amount:                netTotal                             || null,
        vat:                       vatTotal                             || null,
        total:                     invData.amountWithVAT                ?? null,
        already_paid:              invData.amountAlreadyPaid            ?? null,
        left_to_pay:               invData.amountLeftToBePaid           ?? null,
        currency:                  invData.paymentCurrency              || 'EUR',
        bank_account:              invData.paymentBankAccountNumber     || null,
        pay_reference:             invData.paymentReference             || null,
        remarks:                   invData.remarks                      || null,
        rounding_difference:       invData.roundingDifference           ?? null,
        is_inside_scope_of_vat:    invData.isInsideTheScopeOfVat        ?? null,
        is_reverse_charge:         invData.isReverseChargeVatDocument   ?? null,
        received_advance_inv_ref:  invData.receivedAdvanceInvoiceRef    || null,
        status:                   'Pending',
        imported_at:               new Date().toISOString(),
        updated_at:                new Date().toISOString(),
      };

      // ── Check if invoice already exists ───────────────────────────────────
      const { data: existing } = await supabase
        .from('invoices')
        .select('id, status, responsible, category_id, payment_status, distinta_sent_at, total, already_paid, left_to_pay, due_date, payment_amount, supplier, inv_number')
        .eq('er_id', erId)
        .single();

      let invoiceId;

      if (existing) {
        const { status: _s, imported_at: _ia, ...apiFields } = invoiceRow;
        const { error: updateErr } = await supabase
          .from('invoices')
          .update({ ...apiFields, updated_at: new Date().toISOString() })
          .eq('er_id', erId);

        if (updateErr) throw updateErr;
        invoiceId = existing.id;
        updated++;

        // ── Audit log: beležimo samo spremenjena polja ─────────────────────
        const TRACKED = [
          { field: 'total',          label: 'Totale' },
          { field: 'already_paid',   label: 'Già pagato' },
          { field: 'left_to_pay',    label: 'Da pagare' },
          { field: 'due_date',       label: 'Scadenza' },
          { field: 'payment_amount', label: 'Importo pagamento' },
          { field: 'supplier',       label: 'Fornitore' },
        ];
        for (const { field, label } of TRACKED) {
          const oldVal = existing[field];
          const newVal = invoiceRow[field];
          const changed = String(oldVal ?? '') !== String(newVal ?? '');
          if (changed && !(oldVal == null && newVal == null)) {
            await auditLog({
              invoiceId:  existing.id,
              erId,
              invNumber:  existing.inv_number,
              supplier:   existing.supplier,
              total:      existing.total,
              action:     'Sync e-računi',
              fieldName:  label,
              oldValue:   oldVal,
              newValue:   newVal,
              userEmail:  'e-računi sync',
              userName:   'e-računi',
            });
          }
        }
      } else {
        const { data: newInv, error: insertErr } = await supabase
          .from('invoices')
          .insert(invoiceRow)
          .select('id')
          .single();

        if (insertErr) throw insertErr;
        invoiceId = newInv.id;
        inserted++;

        // ── Audit log: prvi uvoz ───────────────────────────────────────────
        await auditLog({
          invoiceId:  newInv.id,
          erId,
          invNumber:  invoiceRow.inv_number,
          supplier:   invoiceRow.supplier,
          total:      invoiceRow.total,
          action:     'Uvoz e-računi',
          fieldName:  null,
          oldValue:   null,
          newValue:   null,
          userEmail:  'e-računi sync',
          userName:   'e-računi',
        });
      }

      // ── Upsert invoice_items ───────────────────────────────────────────────
      if (items.length > 0 && invoiceId) {
        await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId);

        const itemRows = items.map(item => ({
          invoice_id:                invoiceId,
          position:                  item.position                        ?? null,
          description:               item.description                     || null,
          unit:                      item.unit                            || null,
          net_amount:                item.netAmount                       ?? null,
          net_amount_doc_currency:   item.netAmountInDocumentCurrency     ?? null,
          vat_percentage:            item.vatPercentage                   ?? null,
          vat_amount:                item.vatAmount                       ?? null,
          vat_deduction_percentage:  item.vatDeductionPercentage          ?? null,
          is_inside_scope_of_vat:    item.isInsideTheScopeOfVat  === 'true' || item.isInsideTheScopeOfVat  === true,
          is_input_vat_deductible:   item.isInputVatDeductible   === 'true' || item.isInputVatDeductible   === true,
          input_vat_transaction_type: item.inputVatTransactionType         || null,
          cost_position:             item.costPosition                    || null,
          gl_account:                item.glAccountNumber                 || null,
          fixed_asset_ref:           item.fixedAssetRef                   || null,
        }));

        const { error: itemErr } = await supabase.from('invoice_items').insert(itemRows);
        if (itemErr) {
          console.error('[importService] invoice_items insert error:', itemErr.message, 'invoiceId:', invoiceId);
        }
      }

      // ── Upsert payment_records ─────────────────────────────────────────────
      const paymentRecords = Array.isArray(invData.PaymentRecords) ? invData.PaymentRecords : [];
      if (paymentRecords.length > 0 && invoiceId) {
        await supabase.from('payment_records').delete().eq('invoice_id', invoiceId);

        // Dedupliciraj payment_records po (payment_entry_ts, payment_amount, payment_date)
        // e-računi API včasih vrne iste zapise večkrat v istem odzivu
        const seen = new Set();
        const dedupedPR = paymentRecords.filter(pr => {
          const key = `${pr.paymentEntryTS}|${pr.paymentAmount}|${pr.paymentDate}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        if (dedupedPR.length < paymentRecords.length) {
          console.warn(`[importService] Deduplicated payment_records: ${paymentRecords.length} → ${dedupedPR.length} for invoice ${inv.documentID}`);
        }

        const prRows = dedupedPR.map(pr => ({
          invoice_id:        invoiceId,
          payment_amount:    pr.paymentAmount    ?? null,
          payment_currency:  pr.paymentCurrency  || 'EUR',
          payment_date:      pr.paymentDate      || null,
          method_of_payment: pr.methodOfPayment  || null,
          payment_remark:    pr.paymentRemark    || null,
          payment_entry_ts:  pr.paymentEntryTS   || null,
        }));

        const { error: prErr } = await supabase.from('payment_records').insert(prRows);
        if (prErr) {
          console.warn('[importService] payment_records insert warning:', prErr.message);
        }
      }

      // ── Samodejno izračunaj payment_status ────────────────────────────────
      // Logika (enaka kot sync-payment-status endpoint):
      //  1. e-računi ima plačilne podatke → vedno prevlada (pagato/parziale/in_pagamento)
      //  2. Brez plačilnih podatkov → ohrani ročni 'in_pagamento' (JMMC: nalog na banki)
      //  3. Sicer: inviato če je distinta poslana, drugače da_pagare
      if (invoiceId) {
        const alreadyPaid   = Number(invData.amountAlreadyPaid ?? 0);
        const total         = Number(invData.amountWithVAT ?? 0);
        const hasPR         = paymentRecords.length > 0;
        const existingPS    = existing?.payment_status  || null;
        const distintaSent  = existing?.distinta_sent_at || null;

        let newPS;
        if      (alreadyPaid >= total && total > 0)  newPS = 'pagato';
        else if (hasPR && alreadyPaid < total)        newPS = 'parziale';
        else if (!hasPR && alreadyPaid > 0)           newPS = 'in_pagamento';
        else if (existingPS === 'in_pagamento')        newPS = 'in_pagamento'; // ročno: nalog na banki
        else if (distintaSent)                         newPS = 'inviato';
        else                                           newPS = 'da_pagare';

        await supabase.from('invoices')
          .update({ payment_status: newPS })
          .eq('id', invoiceId);
      }

    } catch (err) {
      errors++;
      console.error('[importService] Error processing invoice:', inv.documentID, err.message);
      await sysLog('ERROR', 'IMPORT', `Failed to import invoice ${inv.documentID}`, { error: err });
    }
  }

  // ── Repair original_pdf_id for invoices where PDF exists but pointer is missing ──
  // Runs after every import (covers both new inserts and updated records where
  // original_pdf_id may have been lost). Lightweight: only touches NULL rows.
  let repairedPdf = 0;
  try {
    const { data: nullRows } = await supabase
      .from('invoices')
      .select('id')
      .is('original_pdf_id', null);

    if (nullRows && nullRows.length > 0) {
      for (const row of nullRows) {
        const { data: att } = await supabase
          .from('invoice_attachments')
          .select('id')
          .eq('invoice_id', row.id)
          .eq('attachment_type', 'original')
          .order('created_at', { ascending: true })
          .limit(1);

        if (att && att.length > 0) {
          await supabase
            .from('invoices')
            .update({ original_pdf_id: att[0].id, updated_at: new Date().toISOString() })
            .eq('id', row.id);
          repairedPdf++;
        }
      }
      if (repairedPdf > 0) {
        await sysLog('INFO', 'IMPORT', `Repaired original_pdf_id for ${repairedPdf} invoices`);
      }
    }
  } catch (repairErr) {
    console.warn('[importService] pdf-id repair failed (non-critical):', repairErr.message);
  }

  syncState.setRunning(false);

  await sysLog('INFO', 'IMPORT', cancelled ? 'Batch import cancelled' : 'Batch import complete', {
    detail: `inserted=${inserted} updated=${updated} errors=${errors} remaining=${remaining} repairedPdf=${repairedPdf}` +
            (cancelled ? ' [CANCELLED]' : ''),
  });

  return { inserted, updated, errors, remaining, total: invoiceList.length, cancelled, repairedPdf };
}

module.exports = { importInvoices };
