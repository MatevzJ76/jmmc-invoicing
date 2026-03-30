const { Resend } = require('resend');
const { sysLog } = require('../utils/logger');

async function getEmailConfig() {
  try {
    const supabase = require('../utils/supabase');
    const { data } = await supabase.from('settings').select('key, value');
    if (data && data.length > 0) {
      const map = {};
      data.forEach(r => { map[r.key] = r.value; });
      const apiKey = map['resend_api_key'] || process.env.RESEND_API_KEY;
      const from   = map['email_from']     || process.env.EMAIL_FROM;
      const admin  = map['email_admin']    || process.env.EMAIL_ADMIN;
      if (apiKey) return { apiKey, from, admin };
    }
  } catch (e) {}
  return {
    apiKey: process.env.RESEND_API_KEY,
    from:   process.env.EMAIL_FROM,
    admin:  process.env.EMAIL_ADMIN,
  };
}

async function sendMail({ apiKey, from, to, subject, html }) {
  const resend = new Resend(apiKey);
  const toArr  = Array.isArray(to) ? to : [to];
  const { data, error } = await resend.emails.send({ from, to: toArr, subject, html });
  if (error) throw new Error(error.message || JSON.stringify(error));
  return data?.id || 'sent';
}

/**
 * Send approval notification to admin when a delegate verifies an invoice.
 */
async function sendApprovalNotification(invoice, verifier) {
  const t0  = Date.now();
  const cfg = await getEmailConfig();
  if (!cfg.apiKey || !cfg.admin) return;

  try {
    const msgId = await sendMail({
      apiKey:  cfg.apiKey,
      from:    cfg.from,
      to:      cfg.admin,
      subject: `✅ Fattura approvata: ${invoice.supplier} — ${invoice.inv_number}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#1c2b3a;padding:20px;border-radius:8px 8px 0 0">
            <h2 style="color:#fff;margin:0">Fattura Approvata</h2>
          </div>
          <div style="padding:20px;border:1px solid #e2e0dd;border-top:none;border-radius:0 0 8px 8px">
            <p><strong>Fornitore:</strong> ${invoice.supplier}</p>
            <p><strong>N. Fattura:</strong> ${invoice.inv_number}</p>
            <p><strong>Importo:</strong> € ${Number(invoice.total).toLocaleString('it-IT',{minimumFractionDigits:2})}</p>
            <p><strong>Scadenza:</strong> ${invoice.due_date || '—'}</p>
            <p><strong>Approvato da:</strong> ${verifier.name} (${verifier.email})</p>
            <p><strong>Data approvazione:</strong> ${new Date().toLocaleString('it-IT')}</p>
            <p style="color:#888;font-size:12px">Il rapporto di approvazione è stato allegato alla fattura in e-računi.</p>
          </div>
        </div>
      `,
    });

    await sysLog('INFO', 'EMAIL', 'Approval notification sent', {
      detail:    `to=${cfg.admin} invoice=${invoice.inv_number} verifier=${verifier.email} msgid=${msgId}`,
      durationMs: Date.now() - t0,
    });
  } catch (err) {
    await sysLog('ERROR', 'EMAIL', 'Approval notification failed', {
      error: err,
      detail: `to=${cfg.admin} from=${cfg.from} invoice=${invoice.inv_number} err=${err.message}`,
      durationMs: Date.now() - t0,
    });
  }
}

/**
 * Send payment summary (distinta) to admin.
 */
async function sendPaymentSummary(invoices, sender) {
  const t0  = Date.now();
  const cfg = await getEmailConfig();
  const adminEmails = (cfg.admin || '').split(',').map(e => e.trim()).filter(Boolean);
  if (!cfg.apiKey || adminEmails.length === 0) return;

  const total = invoices.reduce((s, i) => s + (i.left_to_pay || 0), 0);
  const rows  = invoices.map(i =>
    `<tr>
      <td style="padding:6px;border-bottom:1px solid #eee">${i.supplier}</td>
      <td style="padding:6px;border-bottom:1px solid #eee">${i.inv_number}</td>
      <td style="padding:6px;border-bottom:1px solid #eee">${i.due_date || '—'}</td>
      <td style="padding:6px;border-bottom:1px solid #eee;text-align:right">€ ${Number(i.left_to_pay||0).toLocaleString('it-IT',{minimumFractionDigits:2})}</td>
    </tr>`
  ).join('');

  try {
    const msgId = await sendMail({
      apiKey:  cfg.apiKey,
      from:    cfg.from,
      to:      adminEmails,
      subject: `📋 Distinta pagamenti — ${new Date().toLocaleDateString('it-IT')}`,
      html: `
        <div style="font-family:sans-serif;max-width:700px;margin:0 auto">
          <div style="background:#1c2b3a;padding:20px;border-radius:8px 8px 0 0">
            <h2 style="color:#fff;margin:0">Distinta Pagamenti</h2>
            <p style="color:#c8c4c1;margin:4px 0 0">Inviata da ${sender.name} il ${new Date().toLocaleDateString('it-IT')}</p>
          </div>
          <div style="padding:20px;border:1px solid #e2e0dd;border-top:none;border-radius:0 0 8px 8px">
            <table style="width:100%;border-collapse:collapse">
              <thead>
                <tr style="background:#f4f3f1">
                  <th style="padding:8px;text-align:left">Fornitore</th>
                  <th style="padding:8px;text-align:left">N. Fattura</th>
                  <th style="padding:8px;text-align:left">Scadenza</th>
                  <th style="padding:8px;text-align:right">Da pagare</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
              <tfoot>
                <tr style="background:#1c2b3a">
                  <td colspan="3" style="padding:8px;color:#fff;font-weight:bold">TOTALE</td>
                  <td style="padding:8px;color:#fff;font-weight:bold;text-align:right">€ ${Number(total).toLocaleString('it-IT',{minimumFractionDigits:2})}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      `,
    });

    await sysLog('INFO', 'EMAIL', 'Payment summary sent', {
      detail:    `to=${adminEmails.join(',')} from=${cfg.from} invoices=${invoices.length} total=${total} msgid=${msgId}`,
      durationMs: Date.now() - t0,
    });
  } catch (err) {
    await sysLog('ERROR', 'EMAIL', 'Payment summary send failed', {
      error: err,
      detail: `to=${adminEmails.join(',')} from=${cfg.from} err=${err.message}`,
      durationMs: Date.now() - t0,
    });
  }
}

/**
 * Send a test email to verify Resend configuration.
 */
async function sendTestEmail(toOverride) {
  const t0  = Date.now();
  const cfg = await getEmailConfig();
  const to  = toOverride || cfg.admin;

  if (!cfg.apiKey)
    return { ok: false, error: 'Resend API Key non configurata', from: null, to };
  if (!to)
    return { ok: false, error: 'No recipient — set Admin email in Settings', from: cfg.from, to: null };

  try {
    const msgId = await sendMail({
      apiKey:  cfg.apiKey,
      from:    cfg.from,
      to,
      subject: '✅ Campagnolo — Test email',
      html:    `<p>Test email inviato alle ${new Date().toLocaleString('it-IT')} da <code>${cfg.from}</code> via Resend.</p>`,
    });

    await sysLog('INFO', 'EMAIL', 'Test email sent', {
      detail: `to=${to} from=${cfg.from} msgid=${msgId}`,
      durationMs: Date.now() - t0,
    });
    return { ok: true, msgid: msgId, from: cfg.from, to };
  } catch (err) {
    await sysLog('ERROR', 'EMAIL', 'Test email failed', {
      detail: `to=${to} from=${cfg.from} err=${err.message}`,
      durationMs: Date.now() - t0,
    });
    return { ok: false, error: err.message, from: cfg.from, to };
  }
}

module.exports = { sendApprovalNotification, sendPaymentSummary, sendTestEmail };
