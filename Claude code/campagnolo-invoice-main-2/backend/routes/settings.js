const express  = require('express');
const https    = require('https');
const supabase = require('../utils/supabase');
const { requireAuth } = require('./auth');
const erClient     = require('../services/erClient');
const emailService = require('../services/emailService');

const router = express.Router();

router.get('/', requireAuth('admin'), async (req, res) => {
  const { data, error } = await supabase.from('settings').select('*');
  if (error) return res.status(500).json({ error: error.message });
  // Convert array to key-value object
  const settings = {};
  (data || []).forEach(r => { settings[r.key] = r.value; });
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
  // to is optional — sendTestEmail falls back to email_admin from Supabase settings
  const result = await emailService.sendTestEmail(req.body.to || null);
  if (!result.to) return res.status(400).json({ ok: false, error: 'No recipient — set Admin email in Settings' });
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

    const reply = await new Promise((resolve, reject) => {
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
            resolve(json.choices?.[0]?.message?.content?.trim() || '(no reply)');
          } catch(e) { reject(e); }
        });
      });
      r.on('error', reject);
      r.write(body);
      r.end();
    });

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
