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

async function fetchInvoicePDF(documentId) {
  const cleanId = String(documentId).trim().replace(/^'+/, '');
  let data;
  try {
    data = await callER('ReceivedInvoiceAttachmentGet', { documentID: cleanId });
  } catch (err) {
    const httpStatus = err.response?.status;
    const msg = err.message || '';
    console.log('[fetchInvoicePDF] skipped', cleanId, 'status:', httpStatus, msg);
    if (httpStatus >= 500 || msg.includes('500') || msg.includes('status code 5')) {
      return { fileName: null, fileType: null, contents: null, noAttachment: true };
    }
    throw err;
  }

  const item = Array.isArray(data) ? data[0] : data;
  if (!item) return { fileName: null, fileType: null, contents: null, noAttachment: true };

  const att = item?.Attachment || item?.attachment || item;
  if (!att) return { fileName: null, fileType: null, contents: null, noAttachment: true };

  const contents = att.contents || att.Contents || att.fileData || att.data || null;
  if (!contents) return { fileName: null, fileType: null, contents: null, noAttachment: true };

  const fileName = att.fileName || att.FileName || att.filename || `Invoice_${cleanId.replace(':', '_')}.pdf`;
  console.log('[fetchInvoicePDF] OK', cleanId, fileName, 'len:', contents.length);

  return {
    fileName: fileName.toLowerCase().endsWith('.pdf') ? fileName : fileName + '.pdf',
    fileType: 'pdf',
    contents,
  };
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
  uploadApprovalPDF,
  updateInvoiceRemarks,
};
