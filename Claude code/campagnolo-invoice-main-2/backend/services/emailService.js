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
      // admin: try email_admin, then first entry from email_recipients, then env
      let admin = map['email_admin'] || null;
      if (!admin && map['email_recipients']) {
        try {
          const list = JSON.parse(map['email_recipients']);
          if (list.length > 0) admin = list[0].email;
        } catch {}
      }
      admin = admin || process.env.EMAIL_ADMIN;
      // Parse all recipients for notification use
      let recipients = [];
      if (map['email_recipients']) {
        try { recipients = JSON.parse(map['email_recipients']); } catch {}
      }
      if (apiKey) return { apiKey, from, admin, recipients };
    }
  } catch (e) {}
  return {
    apiKey: process.env.RESEND_API_KEY,
    from:   process.env.EMAIL_FROM,
    admin:  process.env.EMAIL_ADMIN,
    recipients: [],
  };
}

async function sendMail({ apiKey, from, to, subject, html }) {
  const resend = new Resend(apiKey);
  // Handle comma-separated strings, arrays, or single emails
  const toArr  = Array.isArray(to)
    ? to.flatMap(e => e.split(',').map(s => s.trim()).filter(Boolean))
    : String(to).split(',').map(s => s.trim()).filter(Boolean);
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
async function sendPaymentSummary(invoices, sender, note) {
  const t0  = Date.now();
  const cfg = await getEmailConfig();
  // Collect emails from recipients with distinta flag (default true for backward compat)
  const distintaEmails = (cfg.recipients || [])
    .filter(r => r.email && r.distinta !== false)
    .map(r => r.email);
  // Fallback to admin if no distinta recipients configured
  const adminEmails = distintaEmails.length > 0
    ? [...new Set(distintaEmails)]
    : (cfg.admin || '').split(',').map(e => e.trim()).filter(Boolean);
  if (!cfg.apiKey || adminEmails.length === 0) return;

  const total = invoices.reduce((s, i) => s + (i.left_to_pay || 0), 0);
  const rows  = invoices.map(i =>
    `<tr>
      <td style="padding:6px;border-bottom:1px solid #eee">${i.supplier}</td>
      <td style="padding:6px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px;color:#5a5551">${i.internal_number || '—'}</td>
      <td style="padding:6px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px">${i.inv_number}</td>
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
        <div style="font-family:sans-serif;max-width:780px;margin:0 auto">
          <div style="background:#7a4a1e;padding:20px;border-radius:8px 8px 0 0">
            <h2 style="color:#fff;margin:0">📧 Distinta Pagamenti</h2>
            <p style="color:#e8c99a;margin:4px 0 0">Inviata da ${sender.name} il ${new Date().toLocaleDateString('it-IT')}</p>
          </div>
          <div style="padding:20px;border:1px solid #e8c99a;border-top:none;border-radius:0 0 8px 8px;background:#fffaf5">
            <table style="width:100%;border-collapse:collapse">
              <thead>
                <tr style="background:#fef3e8">
                  <th style="padding:8px;text-align:left;font-size:12px;color:#7a4a1e;text-transform:uppercase">Fornitore</th>
                  <th style="padding:8px;text-align:left;font-size:12px;color:#7a4a1e;text-transform:uppercase">Protocollo</th>
                  <th style="padding:8px;text-align:left;font-size:12px;color:#7a4a1e;text-transform:uppercase">N. Fattura</th>
                  <th style="padding:8px;text-align:left;font-size:12px;color:#7a4a1e;text-transform:uppercase">Scadenza</th>
                  <th style="padding:8px;text-align:right;font-size:12px;color:#7a4a1e;text-transform:uppercase">Da pagare</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
              <tfoot>
                <tr style="background:#c77d3a">
                  <td colspan="4" style="padding:8px;color:#fff;font-weight:bold">TOTALE (${invoices.length} fatture)</td>
                  <td style="padding:8px;color:#fff;font-weight:bold;text-align:right">€ ${Number(total).toLocaleString('it-IT',{minimumFractionDigits:2})}</td>
                </tr>
              </tfoot>
            </table>
            ${note ? `<div style="margin-top:20px;padding:14px 18px;background:#fff8e1;border-left:5px solid #c77d3a;border-radius:0 8px 8px 0;font-size:15px;color:#1c2b3a;line-height:1.5"><strong style="font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#7a4a1e;display:block;margin-bottom:4px">📝 Note</strong>${note}</div>` : ''}
            <p style="margin-top:20px;font-size:13px">
              <a href="https://campagnolo-invoice.vercel.app" style="display:inline-block;padding:10px 20px;background:#c77d3a;color:#fff;text-decoration:none;border-radius:6px;font-weight:700;font-size:13px">
                🔗 Accedi al Campagnolo App
              </a>
            </p>
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
  const to  = (toOverride || cfg.admin || '').trim();

  if (!cfg.apiKey)
    return { ok: false, error: 'Resend API Key non configurata', from: null, to };
  if (!to)
    return { ok: false, error: 'No recipient — set Admin email in Settings', from: cfg.from, to: null };

  const from = (cfg.from || '').trim();
  if (!from) return { ok: false, error: 'Mittente (FROM) non configurato — impostalo in Settings', from: null, to };

  try {
    const msgId = await sendMail({
      apiKey:  cfg.apiKey,
      from,
      to,
      subject: '✅ Campagnolo — Test email',
      html:    `<p>Test email inviato alle ${new Date().toLocaleString('it-IT')} da <code>${from}</code> via Resend.</p>`,
    });

    await sysLog('INFO', 'EMAIL', 'Test email sent', {
      detail: `to=${to} from=${from} msgid=${msgId}`,
      durationMs: Date.now() - t0,
    });
    return { ok: true, msgid: msgId, from, to: String(to) };
  } catch (err) {
    await sysLog('ERROR', 'EMAIL', 'Test email failed', {
      detail: `to=${to} from=${from} err=${err.message}`,
      durationMs: Date.now() - t0,
    });
    return { ok: false, error: err.message, from, to: String(to) };
  }
}

/**
 * Send delegate notification — one email per delegate with their pending invoices.
 * invoicesByDelegate: { FEDERICO: [...], VARGA: [...] }
 * delegateEmails:     { FEDERICO: 'email@...', VARGA: 'email@...' }
 */
/**
 * Send a SINGLE batch notification email for all pending + rejected invoices.
 * Pending invoices → navy table; rejected invoices → red highlighted table.
 * One email to ALL recipients (delegates + admin), not per-delegate.
 *
 * @param {Object} params
 * @param {Array}  params.pending   - invoices with status='Pending'
 * @param {Array}  params.rejected  - invoices with status='Rejected' (unresolved)
 * @param {Array}  params.toEmails  - all recipient email addresses
 * @param {Object} params.sender    - { name, email }
 * @param {string} [params.note]    - optional note
 * @returns {{ ok, msgid?, error? }}
 */
async function sendDelegateNotification({ pending = [], rejected = [], toEmails = [], sender, note }) {
  const t0  = Date.now();
  const cfg = await getEmailConfig();
  if (!cfg.apiKey) throw new Error('Resend API Key non configurata');
  if (toEmails.length === 0) return { ok: false, error: 'No recipients' };

  const fmtCur  = n => n != null ? `€ ${Number(n).toLocaleString('it-IT',{minimumFractionDigits:2,useGrouping:true})}` : '—';
  const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '—';

  const totalAll = pending.length + rejected.length;

  // ── Pending invoices table (navy) ──────────────────────────────
  const pendingHtml = pending.length > 0 ? (() => {
    const total = pending.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const rows  = pending.map(i => `<tr>
      <td style="padding:7px 8px;border-bottom:1px solid #eee">${i.supplier || '—'}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px;color:#5a5551">${i.internal_number || '—'}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px">${i.inv_number || '—'}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #eee">${fmtDate(i.due_date)}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #eee;text-align:right">${fmtCur(i.total)}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #eee">${i.responsible || '—'}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #eee;white-space:nowrap"><span style="background:#e6a817;color:#fff;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:700">⏳ In attesa</span></td>
    </tr>`).join('');
    return `
      <h3 style="color:#1c2b3a;margin:0 0 10px">📋 Fatture in attesa di approvazione (${pending.length})</h3>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#e8edf3">
            <th style="padding:8px;text-align:left;font-size:12px;color:#3d5a80;text-transform:uppercase">Fornitore</th>
            <th style="padding:8px;text-align:left;font-size:12px;color:#3d5a80;text-transform:uppercase">Protocollo</th>
            <th style="padding:8px;text-align:left;font-size:12px;color:#3d5a80;text-transform:uppercase">N. Fattura</th>
            <th style="padding:8px;text-align:left;font-size:12px;color:#3d5a80;text-transform:uppercase">Scadenza</th>
            <th style="padding:8px;text-align:right;font-size:12px;color:#3d5a80;text-transform:uppercase">Totale</th>
            <th style="padding:8px;text-align:left;font-size:12px;color:#3d5a80;text-transform:uppercase">Delegato</th>
            <th style="padding:8px;text-align:left;font-size:12px;color:#3d5a80;text-transform:uppercase">Stato</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="background:#1c2b3a">
            <td colspan="4" style="padding:8px;color:#fff;font-weight:bold">TOTALE (${pending.length} fatture)</td>
            <td style="padding:8px;color:#fff;font-weight:bold;text-align:right">${fmtCur(total)}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>`;
  })() : '';

  // ── Rejected invoices table (red, highlighted) ─────────────────
  const rejectedHtml = rejected.length > 0 ? (() => {
    const total = rejected.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const rows  = rejected.map(i => `<tr>
      <td style="padding:7px 8px;border-bottom:1px solid #f5c6cb">${i.supplier || '—'}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #f5c6cb;font-family:monospace;font-size:12px;color:#5a5551">${i.internal_number || '—'}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #f5c6cb;font-family:monospace;font-size:12px">${i.inv_number || '—'}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #f5c6cb">${fmtDate(i.due_date)}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #f5c6cb;text-align:right">${fmtCur(i.total)}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #f5c6cb">${i.responsible || '—'}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #f5c6cb;font-size:12px;color:#7a7571">${(i.status_note || '').slice(0, 80) || '—'}</td>
    </tr>`).join('');
    return `
      <div style="margin-top:${pending.length > 0 ? '28px' : '0'}">
        <h3 style="color:#c0392b;margin:0 0 10px">❌ Fatture rifiutate — richiesta azione JMMC (${rejected.length})</h3>
        <div style="border:2px solid #c0392b;border-radius:8px;overflow:hidden">
          <table style="width:100%;border-collapse:collapse;background:#fff8f5">
            <thead>
              <tr style="background:#fdecea">
                <th style="padding:8px;text-align:left;font-size:12px;color:#7b1f13;text-transform:uppercase">Fornitore</th>
                <th style="padding:8px;text-align:left;font-size:12px;color:#7b1f13;text-transform:uppercase">Protocollo</th>
                <th style="padding:8px;text-align:left;font-size:12px;color:#7b1f13;text-transform:uppercase">N. Fattura</th>
                <th style="padding:8px;text-align:left;font-size:12px;color:#7b1f13;text-transform:uppercase">Scadenza</th>
                <th style="padding:8px;text-align:right;font-size:12px;color:#7b1f13;text-transform:uppercase">Totale</th>
                <th style="padding:8px;text-align:left;font-size:12px;color:#7b1f13;text-transform:uppercase">Delegato</th>
                <th style="padding:8px;text-align:left;font-size:12px;color:#7b1f13;text-transform:uppercase">Motivo</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr style="background:#c0392b">
                <td colspan="4" style="padding:8px;color:#fff;font-weight:bold">TOTALE (${rejected.length} fatture)</td>
                <td style="padding:8px;color:#fff;font-weight:bold;text-align:right">${fmtCur(total)}</td>
                <td colspan="2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p style="margin:10px 0 0;font-size:12px;color:#7b1f13">
          Le fatture rifiutate richiedono risoluzione: nota di credito, collegamento o chiusura manuale.
        </p>
      </div>`;
  })() : '';

  const html = `
    <div style="font-family:sans-serif;max-width:880px;margin:0 auto">
      <div style="background:#1c2b3a;padding:20px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0">🔔 Notifica Fatture — Riepilogo</h2>
        <p style="color:#c8c4c1;margin:6px 0 0">Inviata da ${sender.name} il ${new Date().toLocaleDateString('it-IT')}</p>
      </div>
      <div style="padding:20px;border:1px solid #e2e0dd;border-top:none;border-radius:0 0 8px 8px">
        ${pendingHtml}
        ${rejectedHtml}
        ${(!pending.length && !rejected.length) ? '<p style="color:#7a7571">Nessuna fattura da notificare.</p>' : ''}
        ${note ? `<div style="margin-top:20px;padding:14px 18px;background:#fff8e1;border-left:5px solid #e6a817;border-radius:0 8px 8px 0;font-size:15px;color:#1c2b3a;line-height:1.5"><strong style="font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#b07d10;display:block;margin-bottom:4px">📝 Note</strong>${note}</div>` : ''}
        <p style="margin-top:20px;font-size:13px">
          <a href="https://campagnolo-invoice.vercel.app" style="display:inline-block;padding:10px 20px;background:#1c2b3a;color:#fff;text-decoration:none;border-radius:6px;font-weight:700;font-size:13px">
            🔗 Accedi al Campagnolo App
          </a>
        </p>
      </div>
    </div>
  `;

  try {
    const msgId = await sendMail({
      apiKey: cfg.apiKey,
      from:   cfg.from,
      to:     toEmails,
      subject: `🔔 Notifica fatture: ${totalAll} fattur${totalAll === 1 ? 'a' : 'e'} — ${new Date().toLocaleDateString('it-IT')}`,
      html,
    });
    await sysLog('INFO', 'EMAIL', 'Batch notification sent', {
      detail: `to=${toEmails.join(',')} pending=${pending.length} rejected=${rejected.length} msgid=${msgId}`,
      durationMs: Date.now() - t0,
    });
    return { ok: true, msgid: msgId, count: totalAll, pending: pending.length, rejected: rejected.length };
  } catch (err) {
    await sysLog('ERROR', 'EMAIL', 'Batch notification failed', {
      error: err,
      detail: `to=${toEmails.join(',')} pending=${pending.length} rejected=${rejected.length} err=${err.message}`,
      durationMs: Date.now() - t0,
    });
    return { ok: false, error: err.message };
  }
}

/**
 * Send instant rejection notification to JMMC (admin + recipients) when
 * a delegate rejects an invoice. Faza 1 — MVP: no resolution workflow yet.
 */
async function sendRejectionNotification(invoice, rejecter) {
  const t0  = Date.now();
  const cfg = await getEmailConfig();
  if (!cfg.apiKey) return { ok: false, error: 'Resend API Key non configurata' };

  // Recipients: use all recipients with rejection flag (default true), else admin
  const rejEmails = (cfg.recipients || [])
    .filter(r => r.email && r.rejection !== false)
    .map(r => r.email);
  const toEmails = rejEmails.length > 0
    ? [...new Set(rejEmails)]
    : (cfg.admin || '').split(',').map(e => e.trim()).filter(Boolean);
  if (toEmails.length === 0) return { ok: false, error: 'No recipients' };

  const fmtCur = n => n != null ? `€ ${Number(n).toLocaleString('it-IT',{minimumFractionDigits:2})}` : '—';
  const note   = invoice.status_note ? String(invoice.status_note) : '';

  try {
    const msgId = await sendMail({
      apiKey:  cfg.apiKey,
      from:    cfg.from,
      to:      toEmails,
      subject: `❌ Fattura RIFIUTATA: ${invoice.supplier} — ${invoice.inv_number}`,
      html: `
        <div style="font-family:sans-serif;max-width:640px;margin:0 auto">
          <div style="background:#c0392b;padding:20px;border-radius:8px 8px 0 0">
            <h2 style="color:#fff;margin:0">❌ Fattura Rifiutata</h2>
            <p style="color:#f9d7d2;margin:4px 0 0">Richiesta azione JMMC</p>
          </div>
          <div style="padding:20px;border:1px solid #e2e0dd;border-top:none;border-radius:0 0 8px 8px">
            <p><strong>Fornitore:</strong> ${invoice.supplier || '—'}</p>
            <p><strong>N. Fattura:</strong> ${invoice.inv_number || '—'}</p>
            <p><strong>Protocollo:</strong> ${invoice.internal_number || '—'}</p>
            <p><strong>Importo:</strong> ${fmtCur(invoice.total)}</p>
            <p><strong>Scadenza:</strong> ${invoice.due_date || '—'}</p>
            <p><strong>Rifiutata da:</strong> ${rejecter.name || '—'} (${rejecter.email || '—'})</p>
            <p><strong>Data rifiuto:</strong> ${new Date().toLocaleString('it-IT')}</p>
            ${note ? `
              <div style="margin-top:16px;padding:14px 18px;background:#fdecea;border-left:5px solid #c0392b;border-radius:0 8px 8px 0;color:#1c2b3a;line-height:1.5">
                <strong style="font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#7b1f13;display:block;margin-bottom:4px">📝 Motivazione rifiuto</strong>${note}
              </div>` : ''}
            <p style="margin-top:20px;font-size:13px;color:#5a5551">
              Si prega di aprire la fattura nel Campagnolo App e gestire il rifiuto
              (richiedi nota di credito, collega a nuova fattura o chiudi manualmente).
            </p>
            <p style="margin-top:14px;font-size:13px">
              <a href="https://campagnolo-invoice.vercel.app" style="display:inline-block;padding:10px 20px;background:#c0392b;color:#fff;text-decoration:none;border-radius:6px;font-weight:700;font-size:13px">
                🔗 Apri Campagnolo App
              </a>
            </p>
          </div>
        </div>
      `,
    });

    await sysLog('INFO', 'EMAIL', 'Rejection notification sent', {
      detail:    `to=${toEmails.join(',')} invoice=${invoice.inv_number} rejecter=${rejecter.email} msgid=${msgId}`,
      durationMs: Date.now() - t0,
    });
    return { ok: true, msgid: msgId, to: toEmails };
  } catch (err) {
    await sysLog('ERROR', 'EMAIL', 'Rejection notification failed', {
      error: err,
      detail: `to=${toEmails.join(',')} from=${cfg.from} invoice=${invoice.inv_number} err=${err.message}`,
      durationMs: Date.now() - t0,
    });
    return { ok: false, error: err.message };
  }
}

/**
 * Send a recurring reminder digest of all unresolved rejected invoices.
 * Called by the scheduler job (Faza 3) at the configured interval.
 */
async function sendRejectionReminder(rows) {
  const t0  = Date.now();
  const cfg = await getEmailConfig();
  if (!cfg.apiKey) return { ok: false, error: 'Resend API Key non configurata' };
  if (!rows || rows.length === 0) return { ok: true, skipped: 'no unresolved rejections' };

  const rejEmails = (cfg.recipients || [])
    .filter(r => r.email && r.rejection !== false)
    .map(r => r.email);
  const toEmails = rejEmails.length > 0
    ? [...new Set(rejEmails)]
    : (cfg.admin || '').split(',').map(e => e.trim()).filter(Boolean);
  if (toEmails.length === 0) return { ok: false, error: 'No recipients' };

  const fmtCur  = n => n != null ? `€ ${Number(n).toLocaleString('it-IT',{minimumFractionDigits:2})}` : '—';
  const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '—';
  const total   = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);

  const tableRows = rows.map(r => `
    <tr>
      <td style="padding:7px 8px;border-bottom:1px solid #eee">${r.supplier || '—'}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px">${r.inv_number || '—'}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #eee;font-size:12px">${fmtDate(r.status_changed_at)}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #eee;text-align:right">${fmtCur(r.total)}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #eee;font-size:12px;color:#7a7571">${(r.status_note || '').slice(0,80)}</td>
    </tr>
  `).join('');

  try {
    const msgId = await sendMail({
      apiKey:  cfg.apiKey,
      from:    cfg.from,
      to:      toEmails,
      subject: `⏰ Promemoria — ${rows.length} fattur${rows.length === 1 ? 'a rifiutata' : 'e rifiutate'} non risolt${rows.length === 1 ? 'a' : 'e'}`,
      html: `
        <div style="font-family:sans-serif;max-width:780px;margin:0 auto">
          <div style="background:#c0392b;padding:20px;border-radius:8px 8px 0 0">
            <h2 style="color:#fff;margin:0">⏰ Promemoria — Fatture Rifiutate</h2>
            <p style="color:#f9d7d2;margin:6px 0 0">${rows.length} fattur${rows.length === 1 ? 'a richiede' : 'e richiedono'} risoluzione JMMC</p>
          </div>
          <div style="padding:20px;border:1px solid #f5c6cb;border-top:none;border-radius:0 0 8px 8px;background:#fff8f5">
            <table style="width:100%;border-collapse:collapse">
              <thead>
                <tr style="background:#fdecea">
                  <th style="padding:8px;text-align:left;font-size:12px;color:#7b1f13;text-transform:uppercase">Fornitore</th>
                  <th style="padding:8px;text-align:left;font-size:12px;color:#7b1f13;text-transform:uppercase">N. Fattura</th>
                  <th style="padding:8px;text-align:left;font-size:12px;color:#7b1f13;text-transform:uppercase">Rifiutata</th>
                  <th style="padding:8px;text-align:right;font-size:12px;color:#7b1f13;text-transform:uppercase">Totale</th>
                  <th style="padding:8px;text-align:left;font-size:12px;color:#7b1f13;text-transform:uppercase">Motivo</th>
                </tr>
              </thead>
              <tbody>${tableRows}</tbody>
              <tfoot>
                <tr style="background:#c0392b">
                  <td colspan="3" style="padding:8px;color:#fff;font-weight:bold">TOTALE (${rows.length} fatture)</td>
                  <td style="padding:8px;color:#fff;font-weight:bold;text-align:right">${fmtCur(total)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
            <p style="margin-top:20px;font-size:13px;color:#5a5551">
              Ogni fattura richiede una decisione: <strong>nota di credito</strong>, <strong>collegamento</strong> a fattura
              sostitutiva o <strong>chiusura manuale</strong>. Apri Campagnolo App e scorri il pannello "JMMC Action".
            </p>
            <p style="margin-top:14px;font-size:13px">
              <a href="https://campagnolo-invoice.vercel.app" style="display:inline-block;padding:10px 20px;background:#c0392b;color:#fff;text-decoration:none;border-radius:6px;font-weight:700;font-size:13px">
                🔗 Apri Campagnolo App
              </a>
            </p>
          </div>
        </div>
      `,
    });

    await sysLog('INFO', 'EMAIL', 'Rejection reminder sent', {
      detail:    `to=${toEmails.join(',')} unresolved=${rows.length} total=${total} msgid=${msgId}`,
      durationMs: Date.now() - t0,
    });
    return { ok: true, msgid: msgId, count: rows.length };
  } catch (err) {
    await sysLog('ERROR', 'EMAIL', 'Rejection reminder failed', {
      error: err,
      detail: `to=${toEmails.join(',')} err=${err.message}`,
      durationMs: Date.now() - t0,
    });
    return { ok: false, error: err.message };
  }
}

/**
 * Send confirmation email when a rejected invoice is resolved (Faza 2 hook).
 */
async function sendRejectionResolved(invoice, resolver, resolution) {
  const t0  = Date.now();
  const cfg = await getEmailConfig();
  if (!cfg.apiKey) return { ok: false, error: 'Resend API Key non configurata' };

  const rejEmails = (cfg.recipients || [])
    .filter(r => r.email && r.rejection !== false)
    .map(r => r.email);
  const toEmails = rejEmails.length > 0
    ? [...new Set(rejEmails)]
    : (cfg.admin || '').split(',').map(e => e.trim()).filter(Boolean);
  if (toEmails.length === 0) return { ok: false, error: 'No recipients' };

  const fmtCur = n => n != null ? `€ ${Number(n).toLocaleString('it-IT',{minimumFractionDigits:2})}` : '—';
  const resLabel = {
    credit_note: '📄 Nota di credito ricevuta',
    linked:      '🔗 Collegata a fattura sostitutiva',
    closed:      '✕ Chiusa manualmente',
  }[resolution.resolution] || resolution.resolution;

  const linkedHtml = (resolution.resolution === 'linked' && resolution.linkedInvoice)
    ? `<p><strong>Sostituita da:</strong> ${resolution.linkedInvoice.supplier} — ${resolution.linkedInvoice.inv_number}</p>`
    : '';

  try {
    const msgId = await sendMail({
      apiKey:  cfg.apiKey,
      from:    cfg.from,
      to:      toEmails,
      subject: `✅ Risolto rifiuto: ${invoice.supplier} — ${invoice.inv_number}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#2e7d52;padding:20px;border-radius:8px 8px 0 0">
            <h2 style="color:#fff;margin:0">✅ Rifiuto Risolto</h2>
          </div>
          <div style="padding:20px;border:1px solid #b8dfc4;border-top:none;border-radius:0 0 8px 8px;background:#f6fdf9">
            <p><strong>Fornitore:</strong> ${invoice.supplier || '—'}</p>
            <p><strong>N. Fattura:</strong> ${invoice.inv_number || '—'}</p>
            <p><strong>Importo:</strong> ${fmtCur(invoice.total)}</p>
            <p><strong>Risoluzione:</strong> ${resLabel}</p>
            ${linkedHtml}
            <p><strong>Risolto da:</strong> ${resolver.name || '—'} (${resolver.email || '—'})</p>
            <p><strong>Data:</strong> ${new Date().toLocaleString('it-IT')}</p>
            ${resolution.note ? `
              <div style="margin-top:14px;padding:12px 14px;background:#eaf7ef;border-left:4px solid #2e7d52;border-radius:0 6px 6px 0;color:#1c2b3a">
                <strong style="font-size:11px;text-transform:uppercase;color:#1d7c4d;display:block;margin-bottom:4px">📝 Nota</strong>${resolution.note}
              </div>` : ''}
          </div>
        </div>
      `,
    });

    await sysLog('INFO', 'EMAIL', 'Rejection resolved notification sent', {
      detail: `to=${toEmails.join(',')} invoice=${invoice.inv_number} resolution=${resolution.resolution} msgid=${msgId}`,
      durationMs: Date.now() - t0,
    });
    return { ok: true, msgid: msgId };
  } catch (err) {
    await sysLog('ERROR', 'EMAIL', 'Rejection resolved notification failed', {
      error: err,
      detail: `to=${toEmails.join(',')} invoice=${invoice.inv_number} err=${err.message}`,
      durationMs: Date.now() - t0,
    });
    return { ok: false, error: err.message };
  }
}

module.exports = {
  sendApprovalNotification,
  sendPaymentSummary,
  sendTestEmail,
  sendDelegateNotification,
  sendRejectionNotification,
  sendRejectionReminder,
  sendRejectionResolved,
};
