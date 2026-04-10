const supabase = require('./supabase');

/**
 * Write a system log entry to the system_log table.
 *
 * @param {'INFO'|'WARN'|'ERROR'|'DEBUG'} level
 * @param {'API_ER'|'IMPORT'|'PDF'|'AUTH'|'EMAIL'|'SCHEDULER'|'SYSTEM'} category
 * @param {string} action  - Short description (max ~100 chars)
 * @param {object} opts
 * @param {string}  [opts.detail]      - Longer description / context
 * @param {string}  [opts.userEmail]
 * @param {string}  [opts.invoiceId]
 * @param {string}  [opts.erId]
 * @param {string}  [opts.method]      - e-računi method name
 * @param {number}  [opts.statusCode]  - HTTP status code
 * @param {number}  [opts.durationMs]
 * @param {string}  [opts.requestId]   - apiTransactionId from e-računi
 * @param {Error}   [opts.error]       - Error object (message + stack)
 */
async function sysLog(level, category, action, opts = {}) {
  try {
    const entry = {
      level,
      category,
      action,
      detail:      opts.detail      || null,
      user_email:  opts.userEmail   || null,
      invoice_id:  opts.invoiceId   || null,
      er_id:       opts.erId        || null,
      method:      opts.method      || null,
      status_code: opts.statusCode  || null,
      duration_ms: opts.durationMs  || null,
      request_id:  opts.requestId   || null,
      error_msg:   opts.error?.message || null,
      stack_trace: level === 'ERROR' ? (opts.error?.stack || null) : null,
      app_version: process.env.APP_VERSION || '1.0.0',
      env:         process.env.NODE_ENV    || 'production',
    };

    const { error } = await supabase.from('system_log').insert(entry);
    if (error) {
      // Don't throw — logging must never crash the app
      console.error('[LOGGER] Failed to write system_log:', error.message);
    }
  } catch (err) {
    console.error('[LOGGER] Unexpected error in sysLog:', err.message);
  }
}

/**
 * Write a business audit log entry.
 * Used for status changes and workflow events.
 */
async function auditLog(opts = {}) {
  try {
    const entry = {
      invoice_id: opts.invoiceId  || null,
      er_id:      opts.erId       || null,
      inv_number: opts.invNumber  || null,
      supplier:   opts.supplier   || null,
      total:      opts.total      || null,
      action:     opts.action,
      field_name: opts.fieldName  || null,
      old_value:  opts.oldValue   !== undefined ? String(opts.oldValue) : null,
      new_value:  opts.newValue   !== undefined ? String(opts.newValue) : null,
      user_email: opts.userEmail,
      user_name:  opts.userName,
    };

    const { error } = await supabase.from('audit_log').insert(entry);
    if (error) {
      console.error('[LOGGER] Failed to write audit_log:', error.message);
    }
  } catch (err) {
    console.error('[LOGGER] Unexpected error in auditLog:', err.message);
  }
}

module.exports = { sysLog, auditLog };
