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
  message: message('طلبات كثيرة جدا. تمهّل قليلا من فضلك.'),
});

// Credential endpoints: tight, IP based, and it does not count successful logins.
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: message('محاولات دخول كثيرة. أعد المحاولة بعد 15 دقيقة.'),
});

const refreshLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: message('محاولات تحديث كثيرة جدا.'),
});

// إنشاء الحسابات من شاشة التسجيل: كل الطلبات تُحسب (حتى الناجحة)،
// وهذا ما يجعل تخمين رمز الفرع مستحيلا عمليا.
const registerLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: message('محاولات إنشاء حساب كثيرة. أعد المحاولة بعد ساعة.'),
});

// Anything that creates or mutates rows.
const writeLimiter = rateLimit({
  windowMs: 60_000,
  limit: 90,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  message: message('أنت تحفظ بسرعة كبيرة. أعد المحاولة بعد ثوان.'),
});

// Account provisioning / password resets by the admin.
const adminSensitiveLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  message: message('تغييرات كثيرة على الحسابات في هذه الساعة.'),
});

// Reporting queries are heavier than plain reads.
const reportLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  message: message('طلبات تقارير كثيرة جدا.'),
});

module.exports = {
  globalLimiter,
  loginLimiter,
  refreshLimiter,
  registerLimiter,
  writeLimiter,
  adminSensitiveLimiter,
  reportLimiter,
};
