const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { one, many, query, pool } = require('../lib/db');
const { wrap, notFound, conflict, forbidden } = require('../lib/errors');
const { validate } = require('../lib/validate');
const { authenticate, adminOnly, ownedStore, audit } = require('../middleware/auth');
const { writeLimiter, adminSensitiveLimiter } = require('../middleware/limits');
const { revokeAllForUser } = require('../lib/tokens');
const { freshJoinCode } = require('../lib/codes');
const { TZ, today } = require('../lib/time');

/** الفروع وحسابات الدخول إليها. المستخدم الرئيسي يرى فروعه فقط. */
const router = express.Router();
router.use(authenticate);

const nameSchema = z.object({
  name: z.string().trim().min(2, 'اسم الفرع: حرفان على الأقل').max(120),
});

// ------------------------------------------------------------ list
router.get('/', wrap(async (req, res) => {
  const isOwner = req.user.role === 'admin';
  if (!isOwner && !req.user.store_id) return res.json({ stores: [] });

  const stores = await many(
    `SELECT s.id, s.name, s.is_active, s.created_at,
            ${isOwner ? 's.join_code,' : ''}
            (SELECT count(*) FROM users u WHERE u.store_id = s.id)::int AS staff_count,
            COALESCE((SELECT sum(sa.total) FROM sales sa
                       WHERE sa.store_id = s.id AND sa.status = 'completed'
                         AND (sa.created_at AT TIME ZONE $2)::date = $3::date), 0) AS today_sales
       FROM stores s
      WHERE ${isOwner ? 's.owner_id = $1' : 's.id = $1'}
      ORDER BY s.created_at`,
    [isOwner ? req.user.id : req.user.store_id, TZ, today()]
  );
  res.json({ stores });
}));

// ------------------------------------------------------------ one branch (+ its accounts for the owner)
router.get('/:id', wrap(async (req, res) => {
  if (req.user.role !== 'admin') {
    if (req.user.store_id !== req.params.id) throw forbidden('هذا الفرع ليس فرعك');
    const store = await one('SELECT id, name, is_active FROM stores WHERE id = $1', [req.params.id]);
    if (!store) throw notFound('الفرع غير موجود');
    return res.json({ store, staff: [] });
  }
  const store = await ownedStore(req, req.params.id);
  const staff = await many(
    `SELECT id, full_name, email, role, is_active, last_login_at, created_at
       FROM users WHERE store_id = $1 ORDER BY created_at`,
    [store.id]
  );
  res.json({ store, staff });
}));

// ------------------------------------------------------------ create
router.post('/', adminOnly, writeLimiter, validate(nameSchema), wrap(async (req, res) => {
  const code = `S${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
  const store = await one(
    `INSERT INTO stores (name, code, owner_id, join_code) VALUES ($1, $2, $3, $4) RETURNING *`,
    [req.body.name, code, req.user.id, await freshJoinCode(pool)]
  );
  req.storeId = store.id;
  audit(req, 'store.create', 'store', store.id, { name: store.name });
  res.status(201).json({ store });
}));

// ------------------------------------------------------------ rename
router.patch('/:id', adminOnly, writeLimiter, validate(nameSchema), wrap(async (req, res) => {
  await ownedStore(req, req.params.id);
  const store = await one('UPDATE stores SET name = $1 WHERE id = $2 RETURNING *', [req.body.name, req.params.id]);
  audit(req, 'store.rename', 'store', store.id, { name: store.name });
  res.json({ store });
}));

// ------------------------------------------------------------ delete
router.delete('/:id', adminOnly, adminSensitiveLimiter, wrap(async (req, res) => {
  const store = await ownedStore(req, req.params.id);
  await query('DELETE FROM stores WHERE id = $1', [store.id]);
  audit(req, 'store.delete', 'store', store.id, { name: store.name });
  res.json({ ok: true });
}));

// ------------------------------------------------------------ new join code (the old one stops working)
router.post('/:id/join-code', adminOnly, adminSensitiveLimiter, wrap(async (req, res) => {
  await ownedStore(req, req.params.id);
  const store = await one('UPDATE stores SET join_code = $1 WHERE id = $2 RETURNING *',
    [await freshJoinCode(pool), req.params.id]);
  audit(req, 'store.join_code', 'store', store.id);
  res.json({ store });
}));

// ------------------------------------------------------------ branch accounts
const accountSchema = z.object({
  full_name: z.string().trim().min(2).max(120).optional(),
  username: z.string().trim().min(3, 'اسم المستخدم: 3 حروف أو أرقام على الأقل').max(60)
    .regex(/^\S+$/, 'اسم المستخدم بدون فراغات'),
  password: z.string().min(8, 'كلمة السر: 8 حروف أو أرقام على الأقل').max(200),
});

router.post('/:id/accounts', adminOnly, adminSensitiveLimiter, validate(accountSchema), wrap(async (req, res) => {
  const store = await ownedStore(req, req.params.id);
  const username = req.body.username.toLowerCase();
  const dup = await one('SELECT id FROM users WHERE lower(email) = $1', [username]);
  if (dup) throw conflict('اسم المستخدم هذا مستعمل في حساب آخر');

  const hash = await bcrypt.hash(req.body.password, 12);
  const user = await one(
    `INSERT INTO users (store_id, full_name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'manager')
     RETURNING id, store_id, full_name, email, role, is_active`,
    [store.id, req.body.full_name || req.body.username, username, hash]
  );
  audit(req, 'store.account_created', 'user', user.id, { email: username, store: store.name });
  res.status(201).json({ user });
}));

const resetSchema = z.object({ password: z.string().min(8, 'كلمة السر: 8 حروف أو أرقام على الأقل').max(200) });

router.post('/:id/accounts/:userId/password', adminOnly, adminSensitiveLimiter,
  validate(resetSchema), wrap(async (req, res) => {
    await ownedStore(req, req.params.id);
    const user = await one('SELECT id, email FROM users WHERE id = $1 AND store_id = $2',
      [req.params.userId, req.params.id]);
    if (!user) throw notFound('الحساب غير موجود في هذا الفرع');
    const hash = await bcrypt.hash(req.body.password, 12);
    await query('UPDATE users SET password_hash = $1, failed_attempts = 0, locked_until = NULL WHERE id = $2',
      [hash, user.id]);
    await revokeAllForUser(user.id);
    audit(req, 'store.password_reset', 'user', user.id, { email: user.email });
    res.json({ ok: true });
  }));

router.delete('/:id/accounts/:userId', adminOnly, adminSensitiveLimiter, wrap(async (req, res) => {
  await ownedStore(req, req.params.id);
  const user = await one('SELECT id, email FROM users WHERE id = $1 AND store_id = $2',
    [req.params.userId, req.params.id]);
  if (!user) throw notFound('الحساب غير موجود في هذا الفرع');
  await query('DELETE FROM users WHERE id = $1', [user.id]);
  audit(req, 'store.account_deleted', 'user', user.id, { email: user.email });
  res.json({ ok: true });
}));

module.exports = router;
