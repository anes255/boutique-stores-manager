const express = require('express');
const { z } = require('zod');
const { one, many, query, tx } = require('../lib/db');
const { wrap, notFound, badRequest, conflict } = require('../lib/errors');
const { validate } = require('../lib/validate');
const { authenticate, scopeStore, audit } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/limits');

const router = express.Router();
router.use(authenticate);

const employeeSchema = z.object({
  store_id: z.string().uuid().optional(),
  full_name: z.string().trim().min(2, 'Name is too short').max(120),
  job_title: z.string().trim().max(80).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().max(160).optional().nullable(),
  monthly_salary: z.coerce.number().min(0).default(0),
  hired_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  is_active: z.boolean().default(true),
  note: z.string().trim().max(300).optional().nullable(),
});

// ------------------------------------------------------------ list + payroll summary
router.get('/', validate(z.object({ store_id: z.string().uuid().optional() }), 'query'),
  scopeStore({ required: false }), wrap(async (req, res) => {
    const employees = await many(
      `SELECT e.*, s.name AS store_name, s.currency,
              (SELECT count(*) FROM salary_payments sp WHERE sp.employee_id = e.id)::int AS payments_count,
              COALESCE((SELECT sum(sp.total) FROM salary_payments sp
                         WHERE sp.employee_id = e.id
                           AND sp.paid_at >= date_trunc('year', CURRENT_DATE)), 0) AS paid_this_year,
              (SELECT sp.period FROM salary_payments sp WHERE sp.employee_id = e.id
                ORDER BY sp.period DESC LIMIT 1) AS last_period,
              COALESCE((SELECT sum(sa.total) FROM sales sa
                         WHERE sa.user_id = e.user_id AND sa.status = 'completed'
                           AND sa.created_at >= date_trunc('month', now())), 0) AS sold_this_month
         FROM employees e
         LEFT JOIN stores s ON s.id = e.store_id
        WHERE ($1::uuid IS NULL OR e.store_id = $1)
        ORDER BY e.is_active DESC, e.full_name`,
      [req.storeId]
    );
    const payroll = await one(
      `SELECT COALESCE(sum(monthly_salary),0) AS monthly_payroll,
              count(*) FILTER (WHERE is_active)::int AS active_count
         FROM employees WHERE ($1::uuid IS NULL OR store_id = $1)`,
      [req.storeId]
    );
    res.json({ employees, payroll });
  }));

// ------------------------------------------------------------ detail
router.get('/:id', wrap(async (req, res) => {
  const employee = await one(
    `SELECT e.*, s.currency, s.name AS store_name FROM employees e
       LEFT JOIN stores s ON s.id = e.store_id WHERE e.id = $1`, [req.params.id]
  );
  if (!employee) throw notFound('Employee not found');
  if (req.user.role !== 'admin' && employee.store_id !== req.user.store_id) throw notFound('Employee not found');
  const payments = await many(
    'SELECT * FROM salary_payments WHERE employee_id = $1 ORDER BY period DESC LIMIT 36', [employee.id]
  );
  res.json({ employee, payments });
}));

// ------------------------------------------------------------ create / update / delete
router.post('/', writeLimiter, validate(employeeSchema), scopeStore(), wrap(async (req, res) => {
  const b = req.body;
  const employee = await one(
    `INSERT INTO employees (store_id, full_name, job_title, phone, email, monthly_salary, hired_at, is_active, note)
     VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::date, CURRENT_DATE),$8,$9) RETURNING *`,
    [req.storeId, b.full_name, b.job_title || null, b.phone || null, b.email || null,
     b.monthly_salary, b.hired_at || null, b.is_active, b.note || null]
  );
  audit(req, 'employee.create', 'employee', employee.id, { name: employee.full_name });
  res.status(201).json({ employee });
}));

router.patch('/:id', writeLimiter, validate(employeeSchema.partial()), wrap(async (req, res) => {
  const existing = await one('SELECT * FROM employees WHERE id = $1', [req.params.id]);
  if (!existing) throw notFound('Employee not found');
  if (req.user.role !== 'admin' && existing.store_id !== req.user.store_id) throw notFound('Employee not found');
  req.storeId = existing.store_id;

  const sets = [];
  const values = [];
  for (const f of ['full_name', 'job_title', 'phone', 'email', 'monthly_salary', 'hired_at', 'is_active', 'note']) {
    if (req.body[f] !== undefined) { values.push(req.body[f]); sets.push(`${f} = $${values.length}`); }
  }
  if (!sets.length) throw badRequest('Nothing to update');
  values.push(req.params.id);
  const employee = await one(`UPDATE employees SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values);
  audit(req, 'employee.update', 'employee', employee.id, req.body);
  res.json({ employee });
}));

router.delete('/:id', writeLimiter, wrap(async (req, res) => {
  const existing = await one('SELECT * FROM employees WHERE id = $1', [req.params.id]);
  if (!existing) throw notFound('Employee not found');
  if (req.user.role !== 'admin' && existing.store_id !== req.user.store_id) throw notFound('Employee not found');
  await query('DELETE FROM employees WHERE id = $1', [req.params.id]);
  req.storeId = existing.store_id;
  audit(req, 'employee.delete', 'employee', existing.id, { name: existing.full_name });
  res.json({ ok: true });
}));

// ------------------------------------------------------------ pay a salary
const paySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Use the YYYY-MM format'),
  base_amount: z.coerce.number().min(0).optional(),
  bonus: z.coerce.number().min(0).default(0),
  deduction: z.coerce.number().min(0).default(0),
  paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().trim().max(300).optional().nullable(),
  log_as_expense: z.boolean().default(true),
});

router.post('/:id/salary', writeLimiter, validate(paySchema), wrap(async (req, res) => {
  const employee = await one('SELECT * FROM employees WHERE id = $1', [req.params.id]);
  if (!employee) throw notFound('Employee not found');
  if (req.user.role !== 'admin' && employee.store_id !== req.user.store_id) throw notFound('Employee not found');
  req.storeId = employee.store_id;

  const b = req.body;
  const base = b.base_amount !== undefined ? b.base_amount : Number(employee.monthly_salary);
  const total = Number((base + Number(b.bonus) - Number(b.deduction)).toFixed(2));
  if (total < 0) throw badRequest('Deductions cannot exceed the salary');

  const exists = await one('SELECT id FROM salary_payments WHERE employee_id = $1 AND period = $2',
    [employee.id, b.period]);
  if (exists) throw conflict(`${employee.full_name} was already paid for ${b.period}`);

  const payment = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO salary_payments (employee_id, store_id, user_id, period, base_amount, bonus, deduction, total, paid_at, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::date, CURRENT_DATE),$10) RETURNING *`,
      [employee.id, employee.store_id, req.user.id, b.period, base, b.bonus, b.deduction, total,
       b.paid_at || null, b.note || null]
    );
    if (b.log_as_expense && total > 0) {
      await c.query(
        `INSERT INTO expenses (store_id, user_id, category, label, amount, spent_at, note)
         VALUES ($1,$2,'salary',$3,$4,COALESCE($5::date, CURRENT_DATE),$6)`,
        [employee.store_id, req.user.id, `Salary ${b.period} - ${employee.full_name}`, total,
         b.paid_at || null, 'Auto-created from payroll']
      );
    }
    return rows[0];
  });

  audit(req, 'employee.salary_paid', 'employee', employee.id, { period: b.period, total });
  res.status(201).json({ payment });
}));

router.delete('/:id/salary/:paymentId', writeLimiter, wrap(async (req, res) => {
  const payment = await one('SELECT * FROM salary_payments WHERE id = $1 AND employee_id = $2',
    [req.params.paymentId, req.params.id]);
  if (!payment) throw notFound('Payment not found');
  if (req.user.role !== 'admin' && payment.store_id !== req.user.store_id) throw notFound('Payment not found');
  await query('DELETE FROM salary_payments WHERE id = $1', [payment.id]);
  req.storeId = payment.store_id;
  audit(req, 'employee.salary_deleted', 'employee', req.params.id, { period: payment.period });
  res.json({ ok: true });
}));

module.exports = router;
