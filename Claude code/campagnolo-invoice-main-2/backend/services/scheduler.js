const cron     = require('node-cron');
const { importInvoices } = require('./importService');
const { sysLog }         = require('../utils/logger');
const supabase           = require('../utils/supabase');
const emailService       = require('./emailService');

let job             = null;
let rejectionJob    = null;

function buildCronExpr(intervalMin) {
  if (intervalMin >= 1440) return '0 2 * * *';           // daily at 02:00
  if (intervalMin >= 60)   return `0 */${Math.floor(intervalMin / 60)} * * *`;
  return `*/${intervalMin} * * * *`;
}

async function start() {
  // Read interval and enabled flag from DB first, fallback to env
  let intervalMin = parseInt(process.env.IMPORT_INTERVAL_MINUTES || '60', 10);
  let enabledInDB = false; // default: disabled — must be explicitly set to 'true' in Settings
  try {
    const { data: rows } = await supabase.from('settings').select('key, value');
    const cfg = {};
    (rows || []).forEach(r => { cfg[r.key] = r.value; });
    if (cfg.import_interval_min) {
      intervalMin = parseInt(cfg.import_interval_min, 10) || intervalMin;
    }
    if (cfg.import_enabled !== undefined) {
      enabledInDB = cfg.import_enabled === 'true' || cfg.import_enabled === true;
    }
  } catch (e) {
    console.warn('[SCHEDULER] Could not read settings from DB, using env:', e.message);
  }

  if (!enabledInDB) {
    console.log('[SCHEDULER] Auto-import disabled via Settings UI — scheduler not started');
    await sysLog('INFO', 'SCHEDULER', 'Scheduler not started — disabled in Settings UI');
    return;
  }

  const cronExpr = buildCronExpr(intervalMin);
  console.log(`[SCHEDULER] Auto-import every ${intervalMin} min (cron: ${cronExpr})`);

  job = cron.schedule(cronExpr, async () => {
    const today    = new Date().toISOString().split('T')[0];

    // Read import filters from Supabase settings
    let importDateFrom, importAnno, lookback;
    try {
      const { data: rows } = await supabase.from('settings').select('key, value');
      const cfg = {};
      (rows || []).forEach(r => { cfg[r.key] = r.value; });
      importDateFrom = cfg.import_date_from  || process.env.IMPORT_DATE_FROM  || null;
      importAnno     = cfg.import_anno       || null;
      lookback       = parseInt(cfg.import_lookback_days || process.env.IMPORT_LOOKBACK_DAYS || '30', 10);
    } catch {
      lookback       = parseInt(process.env.IMPORT_LOOKBACK_DAYS || '30', 10);
    }

    const dateFrom = new Date(Date.now() - lookback * 86400000).toISOString().split('T')[0];

    await sysLog('INFO', 'SCHEDULER', 'Scheduled import triggered', {
      detail: `dateFrom=${dateFrom} dateTo=${today}` +
              (importDateFrom ? ` importDateFrom=${importDateFrom}` : '') +
              (importAnno     ? ` importAnno=${importAnno}`         : ''),
    });

    try {
      let offset = 0, totalInserted = 0, totalUpdated = 0, totalErrors = 0;

      while (true) {
        const result = await importInvoices(dateFrom, today, {
          batchSize: 20, offset, importDateFrom, importAnno,
        });
        totalInserted += result.inserted;
        totalUpdated  += result.updated;
        totalErrors   += result.errors;
        if (!result.remaining || result.remaining === 0) break;
        offset += 20;
        await new Promise(r => setTimeout(r, 500));
      }

      await sysLog('INFO', 'SCHEDULER', 'Scheduled import done', {
        detail: `inserted=${totalInserted} updated=${totalUpdated} errors=${totalErrors}`,
      });
    } catch (err) {
      await sysLog('ERROR', 'SCHEDULER', 'Scheduled import failed', { error: err });
    }
  });
}

function stop() {
  if (job) { job.stop(); job = null; }
}

// ── Rifiutate reminder scheduler (Faza 3) ───────────────────────
// Independent job from auto-import. Uses dedicated settings keys:
//   rifiutate_reminder_enabled         ('true'|'false')
//   rifiutate_reminder_interval_hours  (integer hours, default 24)
// Runs at the configured interval; queries unresolved rejected invoices and
// sends a reminder digest email via emailService.sendRejectionReminder.
// Per-invoice rate limiting via rejection_last_reminder_at could be added
// later; current behavior sends one combined digest per tick.
async function startRejectionReminder() {
  let intervalHours = 24;
  let enabled       = false;

  try {
    const { data: rows } = await supabase.from('settings').select('key, value');
    const cfg = {};
    (rows || []).forEach(r => { cfg[r.key] = r.value; });
    if (cfg.rifiutate_reminder_interval_hours) {
      const n = parseInt(cfg.rifiutate_reminder_interval_hours, 10);
      if (!Number.isNaN(n) && n > 0) intervalHours = n;
    }
    if (cfg.rifiutate_reminder_enabled !== undefined) {
      enabled = cfg.rifiutate_reminder_enabled === 'true' || cfg.rifiutate_reminder_enabled === true;
    }
  } catch (e) {
    console.warn('[SCHEDULER:REJECTION] Could not read settings, defaulting disabled:', e.message);
  }

  if (!enabled) {
    console.log('[SCHEDULER:REJECTION] Rifiutate reminder disabled — not started');
    await sysLog('INFO', 'SCHEDULER', 'Rifiutate reminder not started — disabled in Settings');
    return;
  }

  // Cron expression: every N hours at minute 0; if N>=24 → daily at 09:00
  const cronExpr = intervalHours >= 24
    ? '0 9 * * *'
    : `0 */${intervalHours} * * *`;

  console.log(`[SCHEDULER:REJECTION] Rifiutate reminder every ${intervalHours}h (cron: ${cronExpr})`);

  rejectionJob = cron.schedule(cronExpr, async () => {
    try {
      const { data: rows, error } = await supabase
        .from('invoices')
        .select('id, supplier, inv_number, internal_number, total, status_changed_at, status_note')
        .eq('status', 'Rejected')
        .is('rejection_resolved_at', null)
        .order('status_changed_at', { ascending: true });
      if (error) throw error;
      if (!rows || rows.length === 0) {
        await sysLog('INFO', 'SCHEDULER', 'Rifiutate reminder tick — no unresolved rejections');
        return;
      }

      const result = await emailService.sendRejectionReminder(rows);

      if (result.ok) {
        const ids = rows.map(r => r.id);
        await supabase.from('invoices')
          .update({ rejection_last_reminder_at: new Date().toISOString() })
          .in('id', ids);
        await sysLog('INFO', 'SCHEDULER', 'Rifiutate reminder sent', {
          detail: `count=${rows.length}`,
        });
      } else {
        await sysLog('ERROR', 'SCHEDULER', 'Rifiutate reminder send failed', {
          detail: result.error || 'unknown',
        });
      }
    } catch (err) {
      await sysLog('ERROR', 'SCHEDULER', 'Rifiutate reminder tick failed', { error: err });
    }
  });
}

function stopRejectionReminder() {
  if (rejectionJob) { rejectionJob.stop(); rejectionJob = null; }
}

async function restart() {
  stop();
  stopRejectionReminder();
  await start();
  await startRejectionReminder();
  await sysLog('INFO', 'SCHEDULER', 'Scheduler restarted (settings changed via Settings UI)');
}

async function startAll() {
  await start();
  await startRejectionReminder();
}

function stopAll() {
  stop();
  stopRejectionReminder();
}

module.exports = {
  start: startAll,
  stop:  stopAll,
  restart,
  startRejectionReminder,
  stopRejectionReminder,
};
