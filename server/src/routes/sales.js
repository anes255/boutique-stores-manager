const express = require('express');
const { z } = require('zod');
const { one, many, tx } = require('../lib/db');
const { wrap, notFound } = require('../lib/errors');
const { validate } = require('../lib/validate');
const { authenticate, canUseStore, scopeStore, audit } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/limits');
const { changeStock } = require('../lib/stock');
const { TZ, today, realDay, periodFields, resolvePeriod, notFuture, round2 } = require('../lib/time');

/**
 * عمليات البيع. كل سطر في الجدول = منتج واحد بكمية وسعر.
 * البيع ينقص مخزون الفرع، والتعديل والحذف يعيدان الفرق إليه.
 */
const router = express.Router();
router.use(authenticate);

// ------------------------------------------------------------ list (one day or a period)
router.get('/', validate(z.object({ store_id: z.string().uuid().optional(), ...periodFields }), 'query'),
  scopeStore({ required: false }), wrap(async (req, res) => {
    const { from, to } = resolvePeriod(req.validatedQuery);
    const where = `st.owner_id = $1 AND ($2::uuid IS NULL OR s.store_id = $2) AND s.status = 'completed'
                   AND (s.created_at AT TIME ZONE $3)::date BETWEEN $4::date AND $5::date`;
    const params = [req.ownerId, req.storeId, TZ, from, to];

    const rows = await many(
      `SELECT i.id, i.sale_id, i.product_id, i.name, i.size, i.color, i.qty, i.unit_price, i.line_total,
              s.store_id, st.name AS store_name, s.created_at,
              to_char(s.created_at AT TIME ZONE $3, 'YYYY-MM-DD') AS day
         FROM sale_items i
         JOIN sales s ON s.id = i.sale_id
         JOIN stores st ON st.id = s.store_id
        WHERE ${where}
        ORDER BY s.created_at DESC, i.id
        LIMIT 1000`,
      params
    );
    const sum = await one(
      `SELECT COALESCE(sum(i.line_total), 0) AS total, COALESCE(sum(i.qty), 0) AS pieces, count(*)::int AS count
         FROM sale_items i JOIN sales s ON s.id = i.sale_id JOIN stores st ON st.id = s.store_id
        WHERE ${where}`,
      params
    );
    res.json({ from, to, rows, total: Number(sum.total), pieces: Number(sum.pieces), count: sum.count });
  }));

// ------------------------------------------------------------ create
const saleSchema = z.object({
  store_id: z.string().uuid().optional(),
  product_id: z.string().uuid({ message: 'اختر المنتج' }),
  qty: z.coerce.number().int('الكمية عدد صحيح').positive('الكمية يجب أن تكون أكبر من الصفر').max(100000),
  unit_price: z.coerce.number().min(0, 'السعر غير صحيح').max(1e9),
  date: realDay.optional(),
});

router.post('/', writeLimiter, validate(saleSchema), scopeStore(), wrap(async (req, res) => {
  const b = req.body;
  const day = notFuture(b.date);
  const product = await one('SELECT * FROM products WHERE id = $1 AND owner_id = $2', [b.product_id, req.ownerId]);
  if (!product) throw notFound('المنتج غير موجود');

  const reference = 'S-' + Date.now().toString(36).toUpperCase();
  const line = round2(b.qty * b.unit_price);
  const cost = round2(Number(product.cost_price) * b.qty);

  const item = await tx(async (c) => {
    await changeStock(c, {
      storeId: req.storeId, productId: product.id, userId: req.user.id,
      delta: -b.qty, kind: 'out', reason: `بيع ${reference}`, name: product.name,
    });
    // بيع بتاريخ سابق يُسجَّل في منتصف نهار ذلك اليوم بتوقيت المحل
    const { rows: [sale] } = await c.query(
      `INSERT INTO sales (store_id, user_id, reference, subtotal, discount, total, cost_total, profit,
                          payment_method, created_at)
       VALUES ($1, $2, $3, $4, 0, $4, $5, $6, 'cash',
               CASE WHEN $7::date = $8::date THEN now() ELSE ($7::date + time '12:00') AT TIME ZONE $9 END)
       RETURNING id`,
      [req.storeId, req.user.id, reference, line, cost, round2(line - cost), day, today(), TZ]
    );
    const { rows: [created] } = await c.query(
      `INSERT INTO sale_items (sale_id, product_id, name, size, color, unit, qty, unit_price, unit_cost, line_total)
       VALUES ($1, $2, $3, $4, $5, 'piece', $6, $7, $8, $9) RETURNING *`,
      [sale.id, product.id, product.name, product.size, product.color, b.qty, b.unit_price,
       Number(product.cost_price), line]
    );
    return created;
  });

  audit(req, 'sale.create', 'sale', item.sale_id, { name: product.name, qty: b.qty, total: line });
  res.status(201).json({ item });
}));

// ------------------------------------------------------------ helpers for one line
async function loadItem(req, id) {
  const item = await one(
    `SELECT i.*, s.store_id FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE i.id = $1`, [id]
  );
  if (!item || !(await canUseStore(req.user, item.store_id))) throw notFound('عملية البيع غير موجودة');
  req.storeId = item.store_id;
  return item;
}

/** مجموع العملية بعد تعديل سطورها. عملية بلا سطور تُحذف. */
async function refreshSale(c, saleId) {
  const { rows: [left] } = await c.query('SELECT count(*)::int AS n FROM sale_items WHERE sale_id = $1', [saleId]);
  if (!left.n) {
    await c.query('DELETE FROM sales WHERE id = $1', [saleId]);
    return;
  }
  await c.query(
    `UPDATE sales s SET subtotal = x.total, discount = 0, total = x.total,
                        cost_total = x.cost, profit = x.total - x.cost
       FROM (SELECT COALESCE(sum(line_total), 0) AS total, COALESCE(sum(unit_cost * qty), 0) AS cost
               FROM sale_items WHERE sale_id = $1) x
      WHERE s.id = $1`,
    [saleId]
  );
}

// ------------------------------------------------------------ edit (quantity / price)
const editSchema = z.object({
  qty: z.coerce.number().int('الكمية عدد صحيح').positive('الكمية يجب أن تكون أكبر من الصفر').max(100000).optional(),
  unit_price: z.coerce.number().min(0, 'السعر غير صحيح').max(1e9).optional(),
}).refine((b) => b.qty !== undefined || b.unit_price !== undefined, { message: 'لا يوجد شيء لتعديله' });

router.patch('/items/:id', writeLimiter, validate(editSchema), wrap(async (req, res) => {
  const found = await loadItem(req, req.params.id);

  const item = await tx(async (c) => {
    const { rows: [cur] } = await c.query('SELECT * FROM sale_items WHERE id = $1 FOR UPDATE', [found.id]);
    if (!cur) throw notFound('عملية البيع غير موجودة');
    const qty = req.body.qty ?? Number(cur.qty);
    const price = req.body.unit_price ?? Number(cur.unit_price);
    const delta = qty - Number(cur.qty);

    if (delta && cur.product_id) {
      await changeStock(c, {
        storeId: found.store_id, productId: cur.product_id, userId: req.user.id,
        delta: -delta, reason: 'تعديل عملية بيع', name: cur.name,
      });
    }
    const { rows: [updated] } = await c.query(
      'UPDATE sale_items SET qty = $1, unit_price = $2, line_total = $3 WHERE id = $4 RETURNING *',
      [qty, price, round2(qty * price), cur.id]
    );
    await refreshSale(c, cur.sale_id);
    return updated;
  });

  audit(req, 'sale.edit', 'sale', item.sale_id, req.body);
  res.json({ item });
}));

// ------------------------------------------------------------ delete (the pieces go back to stock)
router.delete('/items/:id', writeLimiter, wrap(async (req, res) => {
  const found = await loadItem(req, req.params.id);

  await tx(async (c) => {
    const { rows: [cur] } = await c.query('SELECT * FROM sale_items WHERE id = $1 FOR UPDATE', [found.id]);
    if (!cur) throw notFound('عملية البيع غير موجودة');
    if (cur.product_id) {
      await changeStock(c, {
        storeId: found.store_id, productId: cur.product_id, userId: req.user.id,
        delta: Number(cur.qty), kind: 'in', reason: 'حذف عملية بيع', name: cur.name,
      });
    }
    await c.query('DELETE FROM sale_items WHERE id = $1', [cur.id]);
    await refreshSale(c, cur.sale_id);
  });

  audit(req, 'sale.delete', 'sale', found.sale_id, { name: found.name, qty: Number(found.qty) });
  res.json({ ok: true });
}));

module.exports = router;
