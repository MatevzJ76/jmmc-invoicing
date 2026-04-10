require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const { sysLog } = require('./utils/logger');
const scheduler  = require('./services/scheduler');

const app  = express();
const PORT = process.env.PORT || 3001;

app.set("trust proxy", 1);

// ── Security middleware ───────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods:     ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
app.use(express.json({ limit: '10mb' })); // PDF base64 can be large

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// ── Health check ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: process.env.APP_VERSION || '1.0.0',
    env:     process.env.NODE_ENV,
    ts:      new Date().toISOString(),
  });
});

// ── Routes ───────────────────────────────────────────────────
app.use('/auth',               require('./routes/auth'));
app.use('/api/invoices',       require('./routes/invoices'));
app.use('/api/distinta',       require('./routes/distinta'));
app.use('/api/categories',     require('./routes/categories'));
app.use('/api/audit',          require('./routes/audit'));
app.use('/api/syslog',         require('./routes/syslog'));
app.use('/api/users',          require('./routes/users'));
app.use('/api/settings',       require('./routes/settings'));
app.use('/api/dashboard',      require('./routes/dashboard'));
app.use('/api/supplier-hints',    require('./routes/supplierHints'));
app.use('/api/chart-of-accounts', require('./routes/chartOfAccounts'));
app.use('/api/ai',                require('./routes/ai'));

// ── 404 handler ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ── Global error handler ─────────────────────────────────────
app.use(async (err, req, res, next) => {
  await sysLog('ERROR', 'SYSTEM', 'Unhandled server error', {
    detail:     `${req.method} ${req.path}`,
    error:      err,
    userEmail:  req.user?.email,
  });
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`[SERVER] Campagnolo Invoice Manager running on port ${PORT}`);
  console.log(`[SERVER] Environment: ${process.env.NODE_ENV}`);
  console.log(`[SERVER] Frontend URL: ${process.env.FRONTEND_URL}`);
  await sysLog('INFO', 'SYSTEM', 'Server started', {
    detail: `port=${PORT} env=${process.env.NODE_ENV} version=${process.env.APP_VERSION}`,
  });
  // Start auto-import scheduler — enabled/disabled controlled via Settings UI (import_enabled in DB)
  scheduler.start();
});

module.exports = app;
