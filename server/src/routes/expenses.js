const express = require('express');
const { z } = require('zod');
const { one, many, query } = require('../lib/db');
const { wrap, notFound, badRequest } = require('../lib/errors');
const { validate } = require('../lib/validate');
const { authenticate, scopeStore, audit } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/limits');

const router = express.Router();
router.use(authenticate);

const CATEGORIES = ['rent', 'salary', 'utilities', 'supplies', 'marketing', 'transport', 'loss', 'tax', 'other'];

const expenseSchema = z.object({
  store_id: z.string().uuid().optional(),
  category: z.enum(CATEGORIES).default('other'),
  label: z.string().trim().min(1, 'أعطه عنوانا قصيرا').max(140),
  amount: z.coerce.number().positive('المبلغ يجب أن يكون أكبر من الصفر'),
  spent_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().trim().max(300).optional().nullable(),
});

router.get('/', validate(z.object({
  store_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(80),
  offset: z.coerce.number().int().min(0).default(0),
}), 'query'), scopeStore({ required: false }), wrap(async (req, res) => {
  const q = req.validatedQuery;
  const expenses = await many(
    `SELECT e.*, u.full_name AS created_by, s.name AS store_name, s.currency
       FROM expenses e
       LEFT JOIN users u ON u.id = e.user_id
       LEFT JOIN stores s ON s.id = e.store_id
      WHERE ($1::uuid IS NULL OR e.store_id = $1)
      ORDER BY e.spent_at DESC, e.created_at DESC LIMIT $2 OFFSET $3`,
    [req.storeId, q.limit, q.offset]
  );
  const byCategory = await many(
    `SELECT category, sum(amount) AS total FROM expenses
      WHERE ($1::uuid IS NULL OR store_id = $1)
        AND spent_at >= date_trunc('month', CURRENT_DATE)
      GROUP BY category ORDER BY total DESC`,
    [req.storeId]
  );
  res.json({ expenses, byCategory, categories: CATEGORIES });
}));

router.post('/', writeLimiter, validate(expenseSchema), scopeStore(), wrap(async (req, res) => {
  const b = req.body;
  const expense = await one(
    `INSERT INTO expenses (store_id, user_id, category, label, amount, spent_at, note)
     VALUES ($1,$2,$3,$4,$5,COALESCE($6::date, CURRENT_DATE),$7) RETURNING *`,
    [req.storeId, req.user.id, b.category, b.label, b.amount, b.spent_at || null, b.note || null]
  );
  audit(req, 'expense.create', 'expense', expense.id, { amount: expense.amount, category: expense.category });
  res.status(201).json({ expense });
}));

router.patch('/:id', writeLimiter, validate(expenseSchema.partial()), wrap(async (req, res) => {
  const existing = await one('SELECT * FROM expenses WHERE id = $1', [req.params.id]);
  if (!existing) throw notFound('المصروف غير موجود');
  if (req.user.role !== 'admin' && existing.store_id !== req.user.store_id) throw notFound('المصروف غير موجود');
  req.storeId = existing.store_id;

  const sets = [];
  const values = [];
  for (const f of ['category', 'label', 'amount', 'spent_at', 'note']) {
    if (req.body[f] !== undefined) { values.push(req.body[f]); sets.push(`${f} = $${values.length}`); }
  }
  if (!sets.length) throw badRequest('لا يوجد شيء لتحديثه');
  values.push(req.params.id);
  const expense = await one(`UPDATE expenses SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values);
  audit(req, 'expense.update', 'expense', expense.id, req.body);
  res.json({ expense });
}));

router.delete('/:id', writeLimiter, wrap(async (req, res) => {
  const existing = await one('SELECT * FROM expenses WHERE id = $1', [req.params.id]);
  if (!existing) throw notFound('المصروف غير موجود');
  if (req.user.role !== 'admin' && existing.store_id !== req.user.store_id) throw notFound('المصروف غير موجود');
  await query('DELETE FROM expenses WHERE id = $1', [req.params.id]);
  req.storeId = existing.store_id;
  audit(req, 'expense.delete', 'expense', existing.id, { amount: existing.amount });
  res.json({ ok: true });
}));

module.exports = router;
