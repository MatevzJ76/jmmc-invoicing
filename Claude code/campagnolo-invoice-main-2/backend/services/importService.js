const supabase   = require('../utils/supabase');
const erClient   = require('./erClient');
const { sysLog } = require('../utils/logger');

/**
 * Main import function — fetches ReceivedInvoiceList then ReceivedInvoiceGet
 * for each invoice to get Items + PaymentRecords. Supports batch processing.
 */
async function importInvoices(dateFrom, dateTo, options = {}) {
  const { batchSize = 20, offset = 0 } = options;
  const today = new Date().toISOString().split('T')[0];
  const from  = dateFrom || process.env.IMPORT_DATE_FROM || '2026-01-01';
  const to    = dateTo   || today;

  await sysLog('INFO', 'IMPORT', 'Import started', { detail: `dateFrom=${from} dateTo=${to} offset=${offset} batchSize=${batchSize}` });

  let invoiceList;
  try {
    invoiceList = await erClient.fetchInvoiceList(from, to);
  } catch (err) {
    await sysLog('ERROR', 'IMPORT', 'fetchInvoiceList failed', { error: err });
    throw err;
  }

  if (!Array.isArray(invoiceList) || invoiceList.length === 0) {
    await sysLog('INFO', 'IMPORT', 'No invoices returned from API');
    return { inserted: 0, updated: 0, errors: 0, remaining: 0, total: 0 };
  }

  // Slice to current batch
  const batch     = invoiceList.slice(offset, offset + batchSize);
  const remaining = Math.max(0, invoiceList.length - offset - batch.length);

  await sysLog('INFO', 'IMPORT', `Processing batch ${offset}-${offset + batch.length} of ${invoiceList.length}`);

  let inserted = 0, updated = 0, errors = 0;

  for (const inv of batch) {
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
        total:                     (invData.amountWithVAT ?? invData.paymentAmount ?? (netTotal + vatTotal)) || null,
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
        payment_order:            'To Be Paid',
        imported_at:               new Date().toISOString(),
        updated_at:                new Date().toISOString(),
      };

      // ── Check if invoice already exists ───────────────────────────────────
      const { data: existing } = await supabase
        .from('invoices')
        .select('id, status, responsible, category_id, verified_flag, payment_order')
        .eq('er_id', erId)
        .single();

      let invoiceId;

      if (existing) {
        const { status: _s, payment_order: _po, imported_at: _ia, ...apiFields } = invoiceRow;
        const { error: updateErr } = await supabase
          .from('invoices')
          .update({ ...apiFields, updated_at: new Date().toISOString() })
          .eq('er_id', erId);

        if (updateErr) throw updateErr;
        invoiceId = existing.id;
        updated++;
      } else {
        const { data: newInv, error: insertErr } = await supabase
          .from('invoices')
          .insert(invoiceRow)
          .select('id')
          .single();

        if (insertErr) throw insertErr;
        invoiceId = newInv.id;
        inserted++;
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

        const prRows = paymentRecords.map(pr => ({
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

    } catch (err) {
      errors++;
      console.error('[importService] Error processing invoice:', inv.documentID, err.message);
      await sysLog('ERROR', 'IMPORT', `Failed to import invoice ${inv.documentID}`, { error: err });
    }
  }

  await sysLog('INFO', 'IMPORT', 'Batch import complete', {
    detail: `inserted=${inserted} updated=${updated} errors=${errors} remaining=${remaining}`,
  });

  return { inserted, updated, errors, remaining, total: invoiceList.length };
}

module.exports = { importInvoices };
