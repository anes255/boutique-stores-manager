const express = require('express');
const { z } = require('zod');
const { one, many, query, tx } = require('../lib/db');
const { wrap, notFound, badRequest } = require('../lib/errors');
const { validate } = require('../lib/validate');
const { authenticate, canUseStore, scopeStore, audit } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/limits');
const { realDay, notFuture, round2 } = require('../lib/time');

/** الصندوق: عمليات الإيداع والسحب في فرع، والرصيد = الإيداع − السحب. */
const router = express.Router();
router.use(authenticate);

async function balanceOf(q, storeId) {
  const { rows: [t] } = await q.query(
    `SELECT COALESCE(sum(amount) FILTER (WHERE kind = 'in'), 0)  AS in_total,
            COALESCE(sum(amount) FILTER (WHERE kind = 'out'), 0) AS out_total
       FROM cash_moves WHERE store_id = $1`,
    [storeId]
  );
  const inTotal = Number(t.in_total);
  const outTotal = Number(t.out_total);
  return { in_total: inTotal, out_total: outTotal, balance: round2(inTotal - outTotal) };
}

// ------------------------------------------------------------ list
router.get('/', validate(z.object({ store_id: z.string().uuid().optional() }), 'query'),
  scopeStore(), wrap(async (req, res) => {
    const rows = await many(
      `SELECT id, kind, amount, note, to_char(moved_on, 'YYYY-MM-DD') AS day
         FROM cash_moves WHERE store_id = $1
        ORDER BY moved_on DESC, created_at DESC
        LIMIT 500`,
      [req.storeId]
    );
    res.json({ rows, ...(await balanceOf({ query }, req.storeId)) });
  }));

// ------------------------------------------------------------ deposit / withdraw
const moveSchema = z.object({
  store_id: z.string().uuid().optional(),
  kind: z.enum(['in', 'out']),
  amount: z.coerce.number().positive('المبلغ يجب أن يكون أكبر من الصفر').max(1e10),
  note: z.string().trim().max(160).optional().nullable(),
  date: realDay.optional(),
});

router.post('/', writeLimiter, validate(moveSchema), scopeStore(), wrap(async (req, res) => {
  const b = req.body;
  const day = notFuture(b.date);
  const move = await tx(async (c) => {
    // قفل الفرع: سحبان في نفس اللحظة لا يتجاوزان الرصيد معا
    await c.query('SELECT id FROM stores WHERE id = $1 FOR UPDATE', [req.storeId]);
    if (b.kind === 'out') {
      const { balance } = await balanceOf(c, req.storeId);
      if (b.amount > balance) throw badRequest(`المبلغ أكبر من الموجود في الصندوق (${balance} دج)`);
    }
    const { rows } = await c.query(
      `INSERT INTO cash_moves (store_id, user_id, kind, amount, note, moved_on)
       VALUES ($1, $2, $3, $4, $5, $6::date) RETURNING *`,
      [req.storeId, req.user.id, b.kind, b.amount, b.note || null, day]
    );
    return rows[0];
  });
  audit(req, b.kind === 'in' ? 'cash.in' : 'cash.out', 'cash', move.id, { amount: move.amount });
  res.status(201).json({ move });
}));

// ------------------------------------------------------------ delete (correct a mistake)
router.delete('/:id', writeLimiter, wrap(async (req, res) => {
  const move = await one('SELECT * FROM cash_moves WHERE id = $1', [req.params.id]);
  if (!move || !(await canUseStore(req.user, move.store_id))) throw notFound('العملية غير موجودة');
  req.storeId = move.store_id;
  await query('DELETE FROM cash_moves WHERE id = $1', [move.id]);
  audit(req, 'cash.delete', 'cash', move.id, { kind: move.kind, amount: move.amount });
  res.json({ ok: true });
}));

module.exports = router;
