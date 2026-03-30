const express  = require('express');
const jwt      = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const supabase = require('../utils/supabase');
const { sysLog } = require('../utils/logger');

const router     = express.Router();
const gClient    = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXP    = process.env.JWT_EXPIRES_IN || '8h';

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
      .select('id, email, name, role, active')
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

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXP }
    );

    await sysLog('INFO', 'AUTH', `User login: ${user.name}`, {
      userEmail:  email,
      detail:     `name=${user.name} role=${user.role} Google OAuth`,
      durationMs: Date.now() - t0,
    });

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });

  } catch (err) {
    await sysLog('ERROR', 'AUTH', 'Google OAuth verification failed', {
      error:      err,
      durationMs: Date.now() - t0,
    });
    res.status(401).json({ error: 'Invalid Google token' });
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
module.exports.requireAuth = requireAuth;
