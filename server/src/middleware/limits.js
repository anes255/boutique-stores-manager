const rateLimit = require('express-rate-limit');

const message = (text) => ({ error: text, code: 'rate_limited' });

/** Key by authenticated user when possible, otherwise by IP. */
const keyGenerator = (req) => req.user?.id || req.ip;

// Broad ceiling for the whole API.
const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 240,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  message: message('Too many requests. Please slow down for a moment.'),
});

// Credential endpoints: tight, IP based, and it does not count successful logins.
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: message('Too many sign-in attempts. Try again in 15 minutes.'),
});

const refreshLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: message('Too many refresh attempts.'),
});

// Anything that creates or mutates rows.
const writeLimiter = rateLimit({
  windowMs: 60_000,
  limit: 90,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  message: message('You are saving a bit too fast. Please retry in a few seconds.'),
});

// Account provisioning / password resets by the admin.
const adminSensitiveLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  message: message('Too many account changes this hour.'),
});

// Reporting queries are heavier than plain reads.
const reportLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  message: message('Too many report requests.'),
});

module.exports = {
  globalLimiter,
  loginLimiter,
  refreshLimiter,
  writeLimiter,
  adminSensitiveLimiter,
  reportLimiter,
};
