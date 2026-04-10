const axios    = require('axios');
const { sysLog } = require('../utils/logger');

const MAX_RETRIES = 3;
const BASE_DELAY  = 2000;

async function getERCredentials() {
  try {
    const supabase = require('../utils/supabase');
    const { data } = await supabase.from('settings').select('key, value');
    if (data && data.length > 0) {
      const map = {};
      data.forEach(r => { map[r.key] = r.value; });
      const url       = map['er_url']       || process.env.ER_URL;
      const user      = map['er_user']      || process.env.ER_USER;
      const secretKey = map['er_secretkey'] || process.env.ER_SECRETKEY;
      const token     = map['er_token']     || process.env.ER_TOKEN;
      if (url && user && secretKey && token) return { url, user, secretKey, token };
    }
  } catch (e) {}
  return {
    url:       process.env.ER_URL,
    user:      process.env.ER_USER,
    secretKey: process.env.ER_SECRETKEY,
    token:     process.env.ER_TOKEN,
  };
}

async function callER(method, params = {}) {
  const { url, user, secretKey, token } = await getERCredentials();

  // Validate credentials before making the call
  if (!url || !user || !secretKey || !token) {
    const missing = ['url','user','secretKey','token'].filter(k => !({ url, user, secretKey, token }[k]));
    throw new Error(`e-računi credentials not configured: missing [${missing.join(', ')}]. Configure them in Settings → e-računi API.`);
  }

  const payload = {
    username:   user,
    secretKey:  secretKey,
    token:      token,
    method:     method,
    parameters: params,
  };

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const t0 = Date.now();
    try {
      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      });
      const duration = Date.now() - t0;
      const data     = response.data;

      console.log('[callER] method:', method, 'status:', response.status, 'keys:', Object.keys(data || {}));

      if (data?.response?.status === 'error') {
        throw new Error(`e-računi error: ${data.response.description || 'Unknown'}`);
      }
      if (data?.status === 'error') {
        throw new Error(`e-računi error: ${data.errorMessage || data.description || 'Unknown'}`);
      }

      let result = null;
      if      (Array.isArray(data?.response?.result)) result = data.response.result;
      else if (data?.response?.result !== undefined)  result = data.response.result;
      else if (Array.isArray(data?.result))           result = data.result;
      else if (data?.result !== undefined)            result = data.result;
      else                                            result = data;

      await sysLog('INFO', 'API_ER', `${method} success`, {
        method,
        statusCode: response.status,
        durationMs: duration,
        detail:     `returned=${Array.isArray(result) ? result.length : 1} items`,
      });

      return result;

   } catch (err) {
      const duration = Date.now() - t0;
      lastError = err;

      // HTTP 5xx from e-računi = no attachment or server error — don't retry
      const httpStatus = err.response?.status;
      if (httpStatus >= 500 && httpStatus < 600) {
        await sysLog('INFO', 'API_ER', `${method} HTTP ${httpStatus} — no retry`, { method, durationMs: duration });
        throw err; // throw immediately, no retry
      }

      const isLast = attempt === MAX_RETRIES;
      await sysLog(isLast ? 'ERROR' : 'WARN', 'API_ER',
        isLast ? `${method} failed after ${MAX_RETRIES} retries` : `${method} retry attempt ${attempt}/${MAX_RETRIES}`,
        { method, durationMs: duration, detail: isLast ? err.message : `waiting ${BASE_DELAY * attempt}ms` }
      );
      if (!isLast) await sleep(BASE_DELAY * attempt);
    }
  }
  throw lastError;
}

async function fetchInvoiceList(dateFrom, dateTo) {
  // Step 1: Get list with dateFrom/dateTo
  const list = await callER('ReceivedInvoiceList', {
    dateFrom: dateFrom || '2026-01-01',
    dateTo:   dateTo   || new Date().toISOString().split('T')[0],
  });

  const items = Array.isArray(list) ? list : (list ? [list] : []);
  console.log('[fetchInvoiceList] list count:', items.length);
  console.log('[fetchInvoiceList] sample:', JSON.stringify(items[0] || {}).substring(0, 300));
  return items;
}

async function fetchInvoiceDetail(documentId) {
  const data = await callER('ReceivedInvoiceGet', { documentID: documentId });
  if (Array.isArray(data)) return data[0];
  return data;
}

async function fetchInvoicePDFs(documentId) {
  const cleanId = String(documentId).trim().replace(/^'+/, '');
  let data;
  try {
    data = await callER('ReceivedInvoiceAttachmentList', { documentID: cleanId });
  } catch (err) {
    const httpStatus = err.response?.status;
    const msg = err.message || '';
    console.log('[fetchInvoicePDFs] skipped', cleanId, 'status:', httpStatus, msg);
    if (httpStatus >= 500 || msg.includes('500') || msg.includes('status code 5')) {
      return [];
    }
    throw err;
  }

  // Log full raw structure to diagnose multi-attachment responses
  console.log('[fetchInvoicePDFs] raw type:', typeof data, 'isArray:', Array.isArray(data));
  console.log('[fetchInvoicePDFs] raw keys:', data ? Object.keys(data) : 'null');
  console.log('[fetchInvoicePDFs] raw snippet:', JSON.stringify(data).substring(0, 800));

  // e-računi may wrap multiple attachments inside a single object:
  // { Attachment: [...] } or { attachments: [...] } or directly an array
  let items;
  if (Array.isArray(data)) {
    items = data;
  } else if (data?.Attachment && Array.isArray(data.Attachment)) {
    items = data.Attachment;
  } else if (data?.attachment && Array.isArray(data.attachment)) {
    items = data.attachment;
  } else if (data?.Attachments && Array.isArray(data.Attachments)) {
    items = data.Attachments;
  } else if (data?.attachments && Array.isArray(data.attachments)) {
    items = data.attachments;
  } else {
    items = data ? [data] : [];
  }

  if (!items.length) return [];

  const results = [];
  for (const item of items) {
    // item may itself be the attachment, or wrap it under .Attachment / .attachment
    const att = item?.Attachment || item?.attachment || item;
    if (!att) continue;
    const contents = att.contents || att.Contents || att.fileData || att.data || null;
    if (!contents) continue;
    const rawName  = att.fileName || att.FileName || att.filename || `Invoice_${cleanId.replace(':', '_')}.pdf`;
    const fileName = rawName.toLowerCase().endsWith('.pdf') ? rawName : rawName + '.pdf';
    results.push({ fileName, fileType: 'pdf', contents });
  }

  console.log('[fetchInvoicePDFs] OK', cleanId, 'count:', results.length);
  return results;
}

// Backward-compat single-result wrapper
async function fetchInvoicePDF(documentId) {
  const results = await fetchInvoicePDFs(documentId);
  if (!results.length) return { fileName: null, fileType: null, contents: null, noAttachment: true };
  return results[0];
}

async function uploadApprovalPDF(documentId, fileName, base64Contents) {
  const data = await callER('ReceivedInvoiceAttachmentAdd', {
    documentID: documentId,
    attachment: { fileName, fileType: 'pdf', contents: base64Contents },
  });
  return data?.apiTransactionId || null;
}

/**
 * Write remarks back to an existing e-računi received invoice.
 * Requires all mandatory fields to be present on the invoice object.
 * @param {object} invoice - Supabase invoice row (must have er_id + mandatory fields)
 * @param {string} remarks - Text to write into the remarks field
 */
async function updateInvoiceRemarks(invoice, remarks) {
  const data = await callER('ReceivedInvoiceUpdate', {
    ReceivedInvoice: {
      documentID:       invoice.er_id,
      number:           invoice.inv_number,
      date:             invoice.inv_date,
      receivalDate:     invoice.receival_date,
      paymentDueDate:   invoice.due_date,
      dateOfSupplyFrom: invoice.supply_date_from || invoice.inv_date,
      methodOfPayment:  invoice.method_of_payment || 'BankTransfer',
      paymentAmount:    invoice.payment_amount ?? invoice.total,
      remarks,
    },
  });
  return data?.apiTransactionId || null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  callER,
  fetchInvoiceList,
  fetchInvoiceDetail,
  fetchInvoicePDF,
  fetchInvoicePDFs,
  uploadApprovalPDF,
  updateInvoiceRemarks,
};
