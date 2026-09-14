const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { one, query } = require('../lib/db');
const { wrap, unauthorized, badRequest, conflict } = require('../lib/errors');
const { validate } = require('../lib/validate');
const { authenticate, audit } = require('../middleware/auth');
const { loginLimiter, refreshLimiter, registerLimiter } = require('../middleware/limits');
const {
  signAccessToken, issueRefreshToken, consumeRefreshToken,
  revokeRefreshToken, revokeAllForUser,
} = require('../lib/tokens');

const router = express.Router();

const MAX_ATTEMPTS = 6;
const LOCK_MINUTES = 15;

const usernameRule = z.string().trim()
  .min(3, 'اسم المستخدم: 3 حروف أو أرقام على الأقل').max(60)
  .regex(/^\S+$/, 'اسم المستخدم بدون فراغات');
const passwordRule = z.string().min(8, 'كلمة السر: 8 حروف أو أرقام على الأقل').max(200);

async function publicUser(id) {
  return one(
    `SELECT u.id, u.full_name, u.email, u.role, u.store_id, u.phone,
            u.must_change_password, u.last_login_at,
            s.name AS store_name
       FROM users u
       LEFT JOIN stores s ON s.id = u.store_id
      WHERE u.id = $1`,
    [id]
  );
}

/** يفتح جلسة جديدة لهذا الجهاز ويرد بها */
async function startSession(req, res, user, action, status = 200) {
  const accessToken = signAccessToken(user);
  const refreshToken = await issueRefreshToken(user.id, req.headers['user-agent']);
  req.user = user;
  audit(req, action, 'user', user.id);
  res.status(status).json({ accessToken, refreshToken, user: await publicUser(user.id) });
}

// ---------------------------------------------------------------- login
// `as` هو الزر الذي اختاره المستخدم في شاشة الدخول: مستخدم رئيسي أو فرعي.
const loginSchema = z.object({
  email: z.string().trim().min(3).max(160),
  password: z.string().min(1).max(200),
  as: z.enum(['owner', 'worker']).optional(),
});

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
    throw unauthorized('اسم المستخدم أو كلمة السر غير صحيحة');
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw unauthorized(`الحساب مقفل مؤقتا. أعد المحاولة بعد ${LOCK_MINUTES} دقيقة.`);
  }
  if (!user.is_active) throw unauthorized('تم تعطيل هذا الحساب');
  if (user.store_id && user.store_active === false) throw unauthorized('هذا الفرع مغلق حاليا');

  const ok = await bcrypt.compare(req.body.password, user.password_hash);
  if (!ok) {
    const attempts = user.failed_attempts + 1;
    const lock = attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null;
    await query('UPDATE users SET failed_attempts = $1, locked_until = $2 WHERE id = $3',
      [lock ? 0 : attempts, lock, user.id]);
    throw unauthorized('اسم المستخدم أو كلمة السر غير صحيحة');
  }

  // كلمة السر صحيحة لكن الزر خطأ: نوجّهه بدل أن نفتح له الحساب من المكان الخطأ
  if (req.body.as === 'owner' && user.role !== 'admin') {
    throw unauthorized('هذا حساب مستخدم فرعي. ارجع واختر «مستخدم فرعي».');
  }
  if (req.body.as === 'worker' && user.role === 'admin') {
    throw unauthorized('هذا حساب مستخدم رئيسي. ارجع واختر «مستخدم رئيسي».');
  }

  await query(
    'UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1',
    [user.id]
  );
  await startSession(req, res, user, 'auth.login');
}));

// ---------------------------------------------------------------- register: main user
const registerOwnerSchema = z.object({
  username: usernameRule,
  password: passwordRule,
  full_name: z.string().trim().min(2).max(120).optional(),
});

router.post('/register-owner', registerLimiter, validate(registerOwnerSchema), wrap(async (req, res) => {
  const username = req.body.username.toLowerCase();
  const taken = await one('SELECT 1 FROM users WHERE lower(email) = $1', [username]);
  if (taken) throw conflict('اسم المستخدم هذا مستعمل، اختر اسما آخر');

  const hash = await bcrypt.hash(req.body.password, 12);
  const user = await one(
    `INSERT INTO users (store_id, full_name, email, password_hash, role)
     VALUES (NULL, $1, $2, $3, 'admin') RETURNING *`,
    [req.body.full_name || req.body.username, username, hash]
  );
  await startSession(req, res, user, 'auth.register_owner', 201);
}));

// ---------------------------------------------------------------- register: branch user
// رمز الفرع يراه المستخدم الرئيسي في صفحة الفرع، ويعطيه لمن يعمل فيه.
const registerWorkerSchema = z.object({
  username: usernameRule,
  password: passwordRule,
  code: z.string().trim().min(4, 'اكتب رمز الفرع').max(12),
  full_name: z.string().trim().min(2).max(120).optional(),
});

router.post('/register-worker', registerLimiter, validate(registerWorkerSchema), wrap(async (req, res) => {
  const store = await one('SELECT id, is_active FROM stores WHERE upper(join_code) = upper($1)', [req.body.code]);
  if (!store || !store.is_active) throw badRequest('رمز الفرع غير صحيح. اطلبه من المستخدم الرئيسي.');

  const username = req.body.username.toLowerCase();
  const taken = await one('SELECT 1 FROM users WHERE lower(email) = $1', [username]);
  if (taken) throw conflict('اسم المستخدم هذا مستعمل، اختر اسما آخر');

  const hash = await bcrypt.hash(req.body.password, 12);
  const user = await one(
    `INSERT INTO users (store_id, full_name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'manager') RETURNING *`,
    [store.id, req.body.full_name || req.body.username, username, hash]
  );
  req.storeId = store.id;
  await startSession(req, res, user, 'auth.register_worker', 201);
}));

// ---------------------------------------------------------------- refresh
router.post('/refresh', refreshLimiter, wrap(async (req, res) => {
  const rotated = await consumeRefreshToken(req.body?.refreshToken);
  if (!rotated) throw unauthorized('سجّل الدخول من جديد');
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

// ---------------------------------------------------------------- change own username / password
// يتطلب كلمة السر الحالية. بعد التغيير تُغلق كل الجلسات الأخرى، وهذا الجهاز يأخذ جلسة جديدة.
const credentialsSchema = z.object({
  currentPassword: z.string().min(1, 'اكتب كلمة السر الحالية').max(200),
  username: usernameRule.optional(),
  newPassword: passwordRule.optional(),
}).refine((b) => b.username || b.newPassword, { message: 'لا يوجد شيء لتغييره' });

router.post('/credentials', loginLimiter, authenticate, validate(credentialsSchema), wrap(async (req, res) => {
  const row = await one('SELECT email, password_hash FROM users WHERE id = $1', [req.user.id]);
  const ok = await bcrypt.compare(req.body.currentPassword, row.password_hash);
  if (!ok) throw badRequest('كلمة السر الحالية غير صحيحة');

  const sets = [];
  const values = [];
  if (req.body.username) {
    const username = req.body.username.toLowerCase();
    if (username !== String(row.email).toLowerCase()) {
      const taken = await one('SELECT id FROM users WHERE lower(email) = $1 AND id <> $2', [username, req.user.id]);
      if (taken) throw conflict('اسم المستخدم هذا مستعمل في حساب آخر');
      values.push(username); sets.push(`email = $${values.length}`);
    }
  }
  if (req.body.newPassword) {
    values.push(await bcrypt.hash(req.body.newPassword, 12));
    sets.push(`password_hash = $${values.length}`, 'must_change_password = false');
  }
  if (!sets.length) throw badRequest('لا يوجد شيء لتغييره');

  values.push(req.user.id);
  await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
  await revokeAllForUser(req.user.id);
  audit(req, 'auth.credentials_changed', 'user', req.user.id,
    { username: !!req.body.username, password: !!req.body.newPassword });

  const refreshToken = await issueRefreshToken(req.user.id, req.headers['user-agent']);
  res.json({ ok: true, accessToken: signAccessToken(req.user), refreshToken, user: await publicUser(req.user.id) });
}));

module.exports = router;
