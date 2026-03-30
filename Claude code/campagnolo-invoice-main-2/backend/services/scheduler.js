const cron     = require('node-cron');
const { importInvoices } = require('./importService');
const { sysLog }         = require('../utils/logger');

let job = null;

function start() {
  const intervalMin = parseInt(process.env.IMPORT_INTERVAL_MINUTES || '60', 10);

  // Convert minutes to cron expression
  // Examples: 60 → every hour, 30 → every 30 min, 1440 → every day at midnight
  let cronExpr;
  if (intervalMin >= 1440) {
    cronExpr = '0 2 * * *'; // daily at 02:00
  } else if (intervalMin >= 60) {
    const hours = Math.floor(intervalMin / 60);
    cronExpr = `0 */${hours} * * *`;
  } else {
    cronExpr = `*/${intervalMin} * * * *`;
  }

  console.log(`[SCHEDULER] Auto-import every ${intervalMin} min (cron: ${cronExpr})`);

  job = cron.schedule(cronExpr, async () => {
    const today    = new Date().toISOString().split('T')[0];
    const lookback = parseInt(process.env.IMPORT_LOOKBACK_DAYS || '30', 10);
    const dateFrom = new Date(Date.now() - lookback * 86400000).toISOString().split('T')[0];

    await sysLog('INFO', 'SCHEDULER', 'Scheduled import triggered', {
      detail: `dateFrom=${dateFrom} dateTo=${today}`,
    });

    try {
      let offset = 0, totalInserted = 0, totalUpdated = 0, totalErrors = 0;

      while (true) {
        const result = await importInvoices(dateFrom, today, { batchSize: 20, offset });
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

module.exports = { start, stop };
