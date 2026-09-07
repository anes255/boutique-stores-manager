const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { one, query } = require('../lib/db');
const { wrap, unauthorized, badRequest } = require('../lib/errors');
const { validate } = require('../lib/validate');
const { authenticate, audit } = require('../middleware/auth');
const { loginLimiter, refreshLimiter } = require('../middleware/limits');
const {
  signAccessToken, issueRefreshToken, consumeRefreshToken,
  revokeRefreshToken, revokeAllForUser,
} = require('../lib/tokens');

const router = express.Router();

const MAX_ATTEMPTS = 6;
const LOCK_MINUTES = 15;

const loginSchema = z.object({
  email: z.string().trim().min(3).max(160),
  password: z.string().min(1).max(200),
});

async function publicUser(id) {
  return one(
    `SELECT u.id, u.full_name, u.email, u.role, u.store_id, u.phone,
            u.must_change_password, u.last_login_at,
            s.name AS store_name, s.code AS store_code, s.currency AS store_currency,
            s.color AS store_color
       FROM users u
       LEFT JOIN stores s ON s.id = u.store_id
      WHERE u.id = $1`,
    [id]
  );
}

// ---------------------------------------------------------------- login
router.post('/login', loginLimiter, validate(loginSchema), wrap(async (req, res) => {
  const email = req.body.email.toLowerCase();
  const user = await one(
    `SELECT u.*, s.is_active AS store_active
       FROM users u LEFT JOIN stores s ON s.id = u.store_id
      WHERE lower(u.email) = $1`,
    [email]
  );

  // Constant-ish response for unknown accounts.
  if (!user) {
    await bcrypt.compare(req.body.password, '$2a$12$xxxxxxxxxxxxxxxxxxxxxuGZQ8oS8m2qHkPmVJ2q0z3lqQ0wZ0y2');
    throw unauthorized('Email or password is incorrect');
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw unauthorized(`Account temporarily locked. Try again in ${LOCK_MINUTES} minutes.`);
  }
  if (!user.is_active) throw unauthorized('This account has been disabled by the owner');
  if (user.store_id && user.store_active === false) throw unauthorized('This store is currently closed');

  const ok = await bcrypt.compare(req.body.password, user.password_hash);
  if (!ok) {
    const attempts = user.failed_attempts + 1;
    const lock = attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null;
    await query('UPDATE users SET failed_attempts = $1, locked_until = $2 WHERE id = $3',
      [lock ? 0 : attempts, lock, user.id]);
    throw unauthorized('Email or password is incorrect');
  }

  await query(
    'UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1',
    [user.id]
  );

  const accessToken = signAccessToken(user);
  const refreshToken = await issueRefreshToken(user.id, req.headers['user-agent']);
  req.user = user;
  audit(req, 'auth.login', 'user', user.id);

  res.json({ accessToken, refreshToken, user: await publicUser(user.id) });
}));

// ---------------------------------------------------------------- refresh
router.post('/refresh', refreshLimiter, wrap(async (req, res) => {
  const rotated = await consumeRefreshToken(req.body?.refreshToken);
  if (!rotated) throw unauthorized('Please sign in again');
  const accessToken = signAccessToken(rotated);
  const refreshToken = await issueRefreshToken(rotated.id, req.headers['user-agent']);
  res.json({ accessToken, refreshToken, user: await publicUser(rotated.id) });
}));

// ---------------------------------------------------------------- logout
router.post('/logout', wrap(async (req, res) => {
  await revokeRefreshToken(req.body?.refreshToken);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- me
router.get('/me', authenticate, wrap(async (req, res) => {
  res.json({ user: await publicUser(req.user.id) });
}));

// ---------------------------------------------------------------- change own password
const changeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8, 'Use at least 8 characters').max(200),
});

router.post('/change-password', authenticate, validate(changeSchema), wrap(async (req, res) => {
  const row = await one('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  const ok = await bcrypt.compare(req.body.currentPassword, row.password_hash);
  if (!ok) throw badRequest('Current password is not correct');
  const hash = await bcrypt.hash(req.body.newPassword, 12);
  await query(
    'UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2',
    [hash, req.user.id]
  );
  await revokeAllForUser(req.user.id);
  audit(req, 'auth.password_changed', 'user', req.user.id);
  const refreshToken = await issueRefreshToken(req.user.id, req.headers['user-agent']);
  res.json({ ok: true, accessToken: signAccessToken(req.user), refreshToken });
}));

module.exports = router;
