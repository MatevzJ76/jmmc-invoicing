const express   = require('express');
const jwt       = require('jsonwebtoken');
const bcrypt    = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { OAuth2Client } = require('google-auth-library');
const supabase  = require('../utils/supabase');
const { sysLog } = require('../utils/logger');

const router     = express.Router();
const gClient    = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXP    = process.env.JWT_EXPIRES_IN || '8h';

// Password strength: min 12 chars, upper, lower, digit, special
function isStrongPassword(pw) {
  return pw && pw.length >= 12 &&
    /[A-Z]/.test(pw) && /[a-z]/.test(pw) &&
    /[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw);
}

// Rate limit: max 5 login attempts per 15 min per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Troppi tentativi di accesso. Riprova tra 15 minuti.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Google OAuth callback ─────────────────────────────────────
router.post('/google', async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ error: 'idToken required' });

  const t0 = Date.now();
  try {
    const ticket  = await gClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email   = payload.email?.toLowerCase();
    const name    = payload.name || email;

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name, role, responsible, active')
      .eq('email', email)
      .single();

    if (error || !user) {
      await sysLog('WARN', 'AUTH', 'Login rejected — user not in whitelist', {
        userEmail:  email,
        detail:     `Google name: ${name}`,
        durationMs: Date.now() - t0,
      });
      return res.status(403).json({ error: 'Access denied. Your account has not been authorized.' });
    }

    if (!user.active) {
      await sysLog('WARN', 'AUTH', 'Login rejected — user deactivated', {
        userEmail:  email,
        detail:     `name: ${user.name}`,
        durationMs: Date.now() - t0,
      });
      return res.status(403).json({ error: 'Your account has been deactivated.' });
    }

    // NOTE: `responsible` here is a legacy alias and will be removed once the
    // FAZA C migration completes. Backend filters now prefer `id` (FK) and
    // only fall back to `responsible` when responsible_user_id is unavailable.
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name,
        role: user.role, responsible: user.responsible ?? null },
      JWT_SECRET,
      { expiresIn: JWT_EXP }
    );

    await sysLog('INFO', 'AUTH', `User login: ${user.name}`, {
      userEmail:  email,
      detail:     `name=${user.name} role=${user.role} responsible=${user.responsible || '-'} Google OAuth`,
      durationMs: Date.now() - t0,
    });

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name,
              role: user.role, responsible: user.responsible ?? null,
              ai_enabled: user.ai_enabled ?? false },
    });

  } catch (err) {
    await sysLog('ERROR', 'AUTH', 'Google OAuth verification failed', {
      error:      err,
      durationMs: Date.now() - t0,
    });
    res.status(401).json({ error: 'Invalid Google token' });
  }
});

// ── Email/Password login ──────────────────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e password obbligatori' });

  const t0 = Date.now();
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name, role, responsible, active, password_hash')
      .eq('email', email.toLowerCase().trim())
      .single();

    // Risposta generica per non rivelare se l'email esiste
    if (error || !user || !user.password_hash) {
      await sysLog('WARN', 'AUTH', 'Password login failed — user not found or no password set', {
        userEmail: email, durationMs: Date.now() - t0,
      });
      return res.status(401).json({ error: 'Credenziali non valide.' });
    }

    if (!user.active) {
      await sysLog('WARN', 'AUTH', 'Password login rejected — user deactivated', {
        userEmail: email, durationMs: Date.now() - t0,
      });
      return res.status(403).json({ error: 'Account disattivato.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      await sysLog('WARN', 'AUTH', 'Password login failed — wrong password', {
        userEmail: email, durationMs: Date.now() - t0,
      });
      return res.status(401).json({ error: 'Credenziali non valide.' });
    }

    // NOTE: `responsible` here is a legacy alias and will be removed once the
    // FAZA C migration completes. Backend filters now prefer `id` (FK) and
    // only fall back to `responsible` when responsible_user_id is unavailable.
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name,
        role: user.role, responsible: user.responsible ?? null },
      JWT_SECRET,
      { expiresIn: JWT_EXP }
    );

    await sysLog('INFO', 'AUTH', `User login (password): ${user.name}`, {
      userEmail: email,
      detail: `name=${user.name} role=${user.role} responsible=${user.responsible || '-'} Password`,
      durationMs: Date.now() - t0,
    });

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name,
              role: user.role, responsible: user.responsible ?? null,
              ai_enabled: user.ai_enabled ?? false },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get current user ──────────────────────────────────────────
router.get('/me', requireAuth(), async (req, res) => {
  res.json({ user: req.user });
});

// ── Logout ────────────────────────────────────────────────────
router.post('/logout', requireAuth(), async (req, res) => {
  await sysLog('INFO', 'AUTH', `User logout: ${req.user.name}`, {
    userEmail: req.user.email,
    detail:    `name=${req.user.name} role=${req.user.role}`,
  });
  res.json({ ok: true });
});

// ── Auth middleware factory ───────────────────────────────────
function requireAuth(...roles) {
  return async (req, res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' });
    }

    const token = header.slice(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;

      if (roles.length && !roles.includes(decoded.role)) {
        await sysLog('WARN', 'AUTH', 'Access denied — unauthorized role', {
          userEmail: decoded.email,
          detail:    `name=${decoded.name} required=${roles.join('|')} actual=${decoded.role} path=${req.originalUrl}`,
        });
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      next();
    } catch (err) {
      const msg = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
      return res.status(401).json({ error: msg });
    }
  };
}

module.exports = router;
module.exports.requireAuth      = requireAuth;
module.exports.isStrongPassword = isStrongPassword;
