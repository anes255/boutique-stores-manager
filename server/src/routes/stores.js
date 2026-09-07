const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { one, many, query, tx } = require('../lib/db');
const { wrap, notFound, conflict, badRequest, forbidden } = require('../lib/errors');
const { validate } = require('../lib/validate');
const { authenticate, adminOnly, audit } = require('../middleware/auth');
const { writeLimiter, adminSensitiveLimiter } = require('../middleware/limits');
const { revokeAllForUser } = require('../lib/tokens');

const router = express.Router();
router.use(authenticate);

const storeSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(24).regex(/^[a-zA-Z0-9_-]+$/, 'حروف لاتينية وأرقام و - و _ فقط'),
  address: z.string().trim().max(240).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  currency: z.string().trim().min(1).max(8).default('دج'),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).default('#E8813A'),
  monthly_target: z.coerce.number().min(0).default(0),
  is_active: z.boolean().default(true),
});

// ------------------------------------------------------------ list stores
// Admin sees every store with its live headline numbers; a manager sees only theirs.
router.get('/', wrap(async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  if (!isAdmin && !req.user.store_id) return res.json({ stores: [] });

  const stores = await many(
    `SELECT s.*,
            (SELECT count(*) FROM users u WHERE u.store_id = s.id AND u.is_active) AS staff_count,
            (SELECT count(*) FROM products p WHERE p.store_id = s.id AND p.is_active) AS product_count,
            COALESCE((SELECT sum(p.stock * p.cost_price) FROM products p WHERE p.store_id = s.id), 0) AS stock_value,
            COALESCE((SELECT sum(sa.total) FROM sales sa
                       WHERE sa.store_id = s.id AND sa.status = 'completed'
                         AND sa.created_at >= date_trunc('day', now())), 0) AS today_revenue,
            COALESCE((SELECT sum(sa.total) FROM sales sa
                       WHERE sa.store_id = s.id AND sa.status = 'completed'
                         AND sa.created_at >= date_trunc('month', now())), 0) AS month_revenue,
            COALESCE((SELECT sum(sa.profit) FROM sales sa
                       WHERE sa.store_id = s.id AND sa.status = 'completed'
                         AND sa.created_at >= date_trunc('month', now())), 0) AS month_profit,
            (SELECT count(*) FROM products p
              WHERE p.store_id = s.id AND p.is_active AND p.stock <= p.low_stock_at) AS low_stock_count
       FROM stores s
      WHERE ($1::uuid IS NULL OR s.id = $1)
      ORDER BY s.is_active DESC, s.name ASC`,
    [isAdmin ? null : req.user.store_id]
  );
  res.json({ stores });
}));

// ------------------------------------------------------------ single store
router.get('/:id', wrap(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.store_id !== req.params.id) {
    throw forbidden('هذا المحل ليس محلك');
  }
  const store = await one('SELECT * FROM stores WHERE id = $1', [req.params.id]);
  if (!store) throw notFound('المحل غير موجود');
  const staff = await many(
    `SELECT id, full_name, email, role, phone, is_active, last_login_at
       FROM users WHERE store_id = $1 ORDER BY role, full_name`,
    [store.id]
  );
  res.json({ store, staff });
}));

// ------------------------------------------------------------ create store
router.post('/', adminOnly, writeLimiter, validate(storeSchema), wrap(async (req, res) => {
  const b = req.body;
  const dup = await one('SELECT id FROM stores WHERE lower(code) = lower($1)', [b.code]);
  if (dup) throw conflict('هذا الرمز مستعمل في محل آخر');

  const store = await one(
    `INSERT INTO stores (name, code, address, city, phone, currency, color, monthly_target, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [b.name, b.code, b.address || null, b.city || null, b.phone || null,
     b.currency, b.color, b.monthly_target, b.is_active]
  );
  req.storeId = store.id;
  audit(req, 'store.create', 'store', store.id, { name: store.name });
  res.status(201).json({ store });
}));

// ------------------------------------------------------------ update store
router.patch('/:id', adminOnly, writeLimiter, validate(storeSchema.partial()), wrap(async (req, res) => {
  const fields = ['name', 'code', 'address', 'city', 'phone', 'currency', 'color', 'monthly_target', 'is_active'];
  const sets = [];
  const values = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { values.push(req.body[f]); sets.push(`${f} = $${values.length}`); }
  }
  if (!sets.length) throw badRequest('لا يوجد شيء لتحديثه');
  values.push(req.params.id);
  const store = await one(
    `UPDATE stores SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values
  );
  if (!store) throw notFound('المحل غير موجود');
  req.storeId = store.id;
  audit(req, 'store.update', 'store', store.id, req.body);
  res.json({ store });
}));

// ------------------------------------------------------------ delete store
router.delete('/:id', adminOnly, adminSensitiveLimiter, wrap(async (req, res) => {
  const store = await one('SELECT * FROM stores WHERE id = $1', [req.params.id]);
  if (!store) throw notFound('المحل غير موجود');
  await query('DELETE FROM stores WHERE id = $1', [req.params.id]);
  audit(req, 'store.delete', 'store', req.params.id, { name: store.name });
  res.json({ ok: true });
}));

// ------------------------------------------------------------ store accounts
const accountSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  // اسم مستخدم أو رقم هاتف أو بريد — المهم أن يكون بدون فراغات
  email: z.string().trim().min(3).max(160).regex(/^\S+$/, 'أدخل اسم مستخدم أو بريدا صالحا (بدون فراغات)'),
  password: z.string().min(8, 'استعمل 8 خانات على الأقل').max(200),
  role: z.enum(['manager', 'staff']).default('manager'),
  phone: z.string().trim().max(40).optional().nullable(),
  create_employee: z.boolean().default(true),
  monthly_salary: z.coerce.number().min(0).default(0),
  job_title: z.string().trim().max(80).optional().nullable(),
});

/** Admin assigns login credentials that unlock exactly one store. */
router.post('/:id/accounts', adminOnly, adminSensitiveLimiter, validate(accountSchema), wrap(async (req, res) => {
  const store = await one('SELECT id, name FROM stores WHERE id = $1', [req.params.id]);
  if (!store) throw notFound('المحل غير موجود');

  const email = req.body.email.toLowerCase();
  const dup = await one('SELECT id FROM users WHERE lower(email) = $1', [email]);
  if (dup) throw conflict('اسم المستخدم هذا مستعمل في حساب آخر');

  const hash = await bcrypt.hash(req.body.password, 12);
  const user = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO users (store_id, full_name, email, password_hash, role, phone, must_change_password)
       VALUES ($1,$2,$3,$4,$5,$6,true)
       RETURNING id, store_id, full_name, email, role, phone, is_active`,
      [store.id, req.body.full_name, email, hash, req.body.role, req.body.phone || null]
    );
    const created = rows[0];
    if (req.body.create_employee) {
      await c.query(
        `INSERT INTO employees (store_id, user_id, full_name, job_title, phone, email, monthly_salary, hired_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7, CURRENT_DATE)`,
        [store.id, created.id, req.body.full_name,
         req.body.job_title || (req.body.role === 'manager' ? 'مسؤول المحل' : 'بائع'),
         req.body.phone || null, email, req.body.monthly_salary]
      );
    }
    return created;
  });

  req.storeId = store.id;
  audit(req, 'store.account_created', 'user', user.id, { email, role: user.role, store: store.name });
  res.status(201).json({ user });
}));

const resetSchema = z.object({ password: z.string().min(8).max(200) });

/** Admin resets a store account password; all its sessions are dropped. */
router.post('/:id/accounts/:userId/password', adminOnly, adminSensitiveLimiter,
  validate(resetSchema), wrap(async (req, res) => {
    const user = await one('SELECT id, email FROM users WHERE id = $1 AND store_id = $2',
      [req.params.userId, req.params.id]);
    if (!user) throw notFound('الحساب غير موجود في هذا المحل');
    const hash = await bcrypt.hash(req.body.password, 12);
    await query('UPDATE users SET password_hash = $1, must_change_password = true, failed_attempts = 0, locked_until = NULL WHERE id = $2',
      [hash, user.id]);
    await revokeAllForUser(user.id);
    req.storeId = req.params.id;
    audit(req, 'store.password_reset', 'user', user.id, { email: user.email });
    res.json({ ok: true });
  }));

const toggleSchema = z.object({ is_active: z.boolean() });

router.patch('/:id/accounts/:userId', adminOnly, adminSensitiveLimiter,
  validate(toggleSchema), wrap(async (req, res) => {
    const user = await one(
      'UPDATE users SET is_active = $1 WHERE id = $2 AND store_id = $3 RETURNING id, email, is_active',
      [req.body.is_active, req.params.userId, req.params.id]
    );
    if (!user) throw notFound('الحساب غير موجود في هذا المحل');
    if (!user.is_active) await revokeAllForUser(user.id);
    req.storeId = req.params.id;
    audit(req, 'store.account_toggled', 'user', user.id, { is_active: user.is_active });
    res.json({ user });
  }));

router.delete('/:id/accounts/:userId', adminOnly, adminSensitiveLimiter, wrap(async (req, res) => {
  const user = await one('SELECT id, email FROM users WHERE id = $1 AND store_id = $2',
    [req.params.userId, req.params.id]);
  if (!user) throw notFound('الحساب غير موجود في هذا المحل');
  await query('DELETE FROM users WHERE id = $1', [user.id]);
  req.storeId = req.params.id;
  audit(req, 'store.account_deleted', 'user', user.id, { email: user.email });
  res.json({ ok: true });
}));

module.exports = router;
