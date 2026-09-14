const express = require('express');
const { z } = require('zod');
const { one, many, query } = require('../lib/db');
const { wrap, notFound, badRequest } = require('../lib/errors');
const { validate } = require('../lib/validate');
const { authenticate, canUseStore, scopeStore, audit } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/limits');
const { realDay, periodFields, resolvePeriod, notFuture } = require('../lib/time');

/** المصاريف: اسم المصروف وقيمته وتاريخه. */
const router = express.Router();
router.use(authenticate);

// ------------------------------------------------------------ list (one day or a period)
router.get('/', validate(z.object({ store_id: z.string().uuid().optional(), ...periodFields }), 'query'),
  scopeStore({ required: false }), wrap(async (req, res) => {
    const { from, to } = resolvePeriod(req.validatedQuery);
    const where = `st.owner_id = $1 AND ($2::uuid IS NULL OR e.store_id = $2)
                   AND e.spent_at BETWEEN $3::date AND $4::date`;
    const params = [req.ownerId, req.storeId, from, to];

    const rows = await many(
      `SELECT e.id, e.label, e.amount, to_char(e.spent_at, 'YYYY-MM-DD') AS day,
              e.store_id, st.name AS store_name
         FROM expenses e JOIN stores st ON st.id = e.store_id
        WHERE ${where}
        ORDER BY e.spent_at DESC, e.created_at DESC
        LIMIT 1000`,
      params
    );
    const sum = await one(
      `SELECT COALESCE(sum(e.amount), 0) AS total, count(*)::int AS count
         FROM expenses e JOIN stores st ON st.id = e.store_id WHERE ${where}`,
      params
    );
    res.json({ from, to, rows, total: Number(sum.total), count: sum.count });
  }));

const expenseSchema = z.object({
  store_id: z.string().uuid().optional(),
  label: z.string().trim().min(1, 'اكتب اسم المصروف').max(140),
  amount: z.coerce.number().positive('القيمة يجب أن تكون أكبر من الصفر').max(1e10),
  date: realDay.optional(),
});

// ------------------------------------------------------------ create
router.post('/', writeLimiter, validate(expenseSchema), scopeStore(), wrap(async (req, res) => {
  const b = req.body;
  const expense = await one(
    `INSERT INTO expenses (store_id, user_id, category, label, amount, spent_at)
     VALUES ($1, $2, 'other', $3, $4, $5::date) RETURNING *`,
    [req.storeId, req.user.id, b.label, b.amount, notFuture(b.date)]
  );
  audit(req, 'expense.create', 'expense', expense.id, { amount: expense.amount });
  res.status(201).json({ expense });
}));

async function loadExpense(req, id) {
  const expense = await one('SELECT * FROM expenses WHERE id = $1', [id]);
  if (!expense || !(await canUseStore(req.user, expense.store_id))) throw notFound('المصروف غير موجود');
  req.storeId = expense.store_id;
  return expense;
}

// ------------------------------------------------------------ edit
router.patch('/:id', writeLimiter, validate(expenseSchema.omit({ store_id: true }).partial()), wrap(async (req, res) => {
  await loadExpense(req, req.params.id);
  const sets = [];
  const values = [];
  if (req.body.label !== undefined) { values.push(req.body.label); sets.push(`label = $${values.length}`); }
  if (req.body.amount !== undefined) { values.push(req.body.amount); sets.push(`amount = $${values.length}`); }
  if (req.body.date !== undefined) { values.push(notFuture(req.body.date)); sets.push(`spent_at = $${values.length}::date`); }
  if (!sets.length) throw badRequest('لا يوجد شيء لتعديله');
  values.push(req.params.id);
  const expense = await one(`UPDATE expenses SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values);
  audit(req, 'expense.update', 'expense', expense.id, req.body);
  res.json({ expense });
}));

// ------------------------------------------------------------ delete
router.delete('/:id', writeLimiter, wrap(async (req, res) => {
  const expense = await loadExpense(req, req.params.id);
  await query('DELETE FROM expenses WHERE id = $1', [expense.id]);
  audit(req, 'expense.delete', 'expense', expense.id, { amount: expense.amount });
  res.json({ ok: true });
}));

module.exports = router;
