const express  = require('express');
const https    = require('https');
const supabase = require('../utils/supabase');
const { requireAuth } = require('./auth');
const erClient     = require('../services/erClient');
const emailService = require('../services/emailService');
const scheduler    = require('../services/scheduler');
const { DEFAULT_SYSTEM_PROMPT, SQL_RULES } = require('../utils/aiDefaults');
const { logAiUsage } = require('../utils/aiUsage');

const router = express.Router();

router.get('/', requireAuth('admin'), async (req, res) => {
  const { data, error } = await supabase.from('settings').select('*');
  if (error) return res.status(500).json({ error: error.message });
  // Convert array to key-value object
  const settings = {};
  (data || []).forEach(r => { settings[r.key] = r.value; });
  // Pre-populate AI prompt fields with defaults if not set in DB
  if (!settings.ai_chat_system_prompt) settings.ai_chat_system_prompt = DEFAULT_SYSTEM_PROMPT;
  if (!settings.ai_chat_sql_rules)     settings.ai_chat_sql_rules     = SQL_RULES;
  res.json({ settings });
});

router.put('/', requireAuth('admin'), async (req, res) => {
  try {
    const { settings } = req.body;
    const now = new Date().toISOString();
    const rows = Object.entries(settings).map(([key, value]) => ({
      key, value: String(value), updated_at: now, updated_by: req.user.email,
    }));
    const { error } = await supabase.from('settings').upsert(rows, { onConflict: 'key' });
    if (error) throw error;

    // Restart scheduler if interval or enabled flag changed (import OR rifiutate reminder)
    const schedulerKeys = [
      'import_interval_min', 'import_enabled',
      'rifiutate_reminder_enabled', 'rifiutate_reminder_interval_hours',
    ];
    if (schedulerKeys.some(k => settings[k] !== undefined)) {
      scheduler.restart().catch(e => console.error('[settings] scheduler restart failed:', e.message));
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/test-er-api
router.post('/test-er-api', requireAuth('admin'), async (req, res) => {
  try {
    const data = await erClient.callER('ReceivedInvoiceList', {
      dateFrom: new Date().toISOString().split('T')[0],
      dateTo:   new Date().toISOString().split('T')[0],
    });
    res.json({ ok: true, message: 'Connection successful', txnId: data?.apiTransactionId });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
});

// POST /api/settings/test-email
router.post('/test-email', requireAuth('admin'), async (req, res) => {
  // Collect all recipients: email_errors + all email_recipients entries
  const allEmails = [];
  try {
    const { data: rows } = await supabase.from('settings').select('key, value')
      .in('key', ['email_errors', 'email_recipients']);
    const map = {};
    (rows || []).forEach(r => { map[r.key] = r.value; });
    // Errori di sistema
    const errEmail = (map['email_errors'] || '').trim();
    if (errEmail) errEmail.split(',').forEach(e => { if (e.trim()) allEmails.push(e.trim()); });
    // Destinatari notifiche
    if (map['email_recipients']) {
      try {
        const list = JSON.parse(map['email_recipients']);
        for (const entry of list) {
          if (entry.email && entry.email.trim()) allEmails.push(entry.email.trim());
        }
      } catch {}
    }
  } catch {}
  // Deduplicate
  const unique = [...new Set(allEmails)];
  if (unique.length === 0) {
    return res.status(400).json({ ok: false, error: 'Nessun destinatario — configura Errori di sistema e/o Destinatari notifiche' });
  }
  const result = await emailService.sendTestEmail(unique.join(', '));
  res.status(result.ok ? 200 : 500).json(result);
});

// POST /api/settings/test-ai
router.post('/test-ai', requireAuth('admin'), async (req, res) => {
  try {
    const { data } = await supabase.from('settings').select('key, value');
    const map = {};
    (data || []).forEach(r => { map[r.key] = r.value; });
    const apiKey = map['openai_api_key'] || process.env.OPENAI_API_KEY;
    const model  = map['openai_model']   || process.env.OPENAI_MODEL || 'gpt-4o';
    if (!apiKey) return res.status(400).json({ ok: false, error: 'OpenAI API Key non configurata' });

    const prompt = (req.body.prompt || 'Say hello.').slice(0, 1000);
    const body = JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
    });

    const { reply, usage } = await new Promise((resolve, reject) => {
      const reqOpts = {
        hostname: 'api.openai.com',
        path:     '/v1/chat/completions',
        method:   'POST',
        headers:  { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'Content-Length': Buffer.byteLength(body) },
      };
      const r = https.request(reqOpts, resp => {
        let raw = '';
        resp.on('data', c => { raw += c; });
        resp.on('end', () => {
          try {
            const json = JSON.parse(raw);
            if (json.error) return reject(new Error(json.error.message || JSON.stringify(json.error)));
            resolve({
              reply: json.choices?.[0]?.message?.content?.trim() || '(no reply)',
              usage: json.usage || null,
            });
          } catch(e) { reject(e); }
        });
      });
      r.on('error', reject);
      r.write(body);
      r.end();
    });

    logAiUsage('test', model, usage, req.user);
    res.json({ ok: true, reply, model });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Temporary: return server outbound IP for SMTP whitelist diagnostics
router.get('/myip', async (req, res) => {
  try {
    const r = await fetch('https://api.ipify.org?format=json');
    const d = await r.json();
    res.json(d);
  } catch (e) {
    res.json({ error: e.message });
  }
});

module.exports = router;
