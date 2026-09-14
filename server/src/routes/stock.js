const express = require('express');
const { z } = require('zod');
const { one, many, tx } = require('../lib/db');
const { wrap, notFound, badRequest } = require('../lib/errors');
const { validate } = require('../lib/validate');
const { authenticate, adminOnly, scopeStore, audit } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/limits');
const { changeStock } = require('../lib/stock');
const { TZ, periodFields, resolvePeriod } = require('../lib/time');

/** المخزون: كم بقي من كل منتج في كل فرع. */
const router = express.Router();
router.use(authenticate);

// ------------------------------------------------------------ list
// مع store_id: مخزون ذلك الفرع. بدونه (للمستخدم الرئيسي): المخزون الكلي، وتفصيله حسب الفروع.
router.get('/', validate(z.object({ store_id: z.string().uuid().optional() }), 'query'),
  scopeStore({ required: false }), wrap(async (req, res) => {
    let rows;
    if (req.storeId) {
      rows = await many(
        `SELECT p.id AS product_id, p.name, p.size, p.color, p.sell_price, b.qty
           FROM branch_stock b JOIN products p ON p.id = b.product_id
          WHERE b.store_id = $1
          ORDER BY lower(p.name), p.size NULLS FIRST, p.color NULLS FIRST`,
        [req.storeId]
      );
    } else {
      rows = await many(
        `SELECT p.id AS product_id, p.name, p.size, p.color, p.sell_price,
                COALESCE(sum(b.qty), 0) AS qty,
                COALESCE(json_agg(json_build_object('store', s.name, 'qty', b.qty) ORDER BY s.name)
                         FILTER (WHERE b.store_id IS NOT NULL), '[]') AS branches
           FROM products p
           LEFT JOIN branch_stock b ON b.product_id = p.id
           LEFT JOIN stores s ON s.id = b.store_id
          WHERE p.owner_id = $1
          GROUP BY p.id
          ORDER BY lower(p.name), p.size NULLS FIRST, p.color NULLS FIRST`,
        [req.ownerId]
      );
    }
    const total = rows.reduce((a, r) => a + Number(r.qty), 0);
    res.json({ rows, total });
  }));

// ------------------------------------------------------------ add / set a quantity (main user)
const moveSchema = z.object({
  store_id: z.string().uuid(),
  product_id: z.string().uuid(),
  qty: z.coerce.number().int('الكمية عدد صحيح').min(0, 'الكمية غير صحيحة').max(1_000_000),
});

async function ownedProduct(req, id) {
  const product = await one('SELECT id, name FROM products WHERE id = $1 AND owner_id = $2', [id, req.user.id]);
  if (!product) throw notFound('المنتج غير موجود');
  return product;
}

// إضافة كمية إلى الفرع
router.post('/add', adminOnly, writeLimiter, validate(moveSchema), scopeStore(), wrap(async (req, res) => {
  const { qty } = req.body;
  if (!(qty > 0)) throw badRequest('الكمية يجب أن تكون أكبر من الصفر');
  const product = await ownedProduct(req, req.body.product_id);
  const left = await tx((c) => changeStock(c, {
    storeId: req.storeId, productId: product.id, userId: req.user.id,
    delta: qty, kind: 'in', reason: 'إضافة كمية', name: product.name,
  }));
  audit(req, 'stock.add', 'product', product.id, { qty });
  res.json({ qty: left });
}));

// تعديل الكمية: "الموجود فعلا الآن هو ..."
router.post('/set', adminOnly, writeLimiter, validate(moveSchema), scopeStore(), wrap(async (req, res) => {
  const product = await ownedProduct(req, req.body.product_id);
  const left = await tx(async (c) => {
    const { rows } = await c.query(
      'SELECT qty FROM branch_stock WHERE store_id = $1 AND product_id = $2 FOR UPDATE',
      [req.storeId, product.id]
    );
    const before = rows[0] ? Number(rows[0].qty) : 0;
    const delta = req.body.qty - before;
    if (!delta) {
      if (!rows[0]) {
        await c.query('INSERT INTO branch_stock (store_id, product_id, qty) VALUES ($1, $2, 0)',
          [req.storeId, product.id]);
      }
      return before;
    }
    return changeStock(c, {
      storeId: req.storeId, productId: product.id, userId: req.user.id,
      delta, kind: 'adjust', reason: 'تعديل الكمية', name: product.name,
    });
  });
  audit(req, 'stock.set', 'product', product.id, { qty: req.body.qty });
  res.json({ qty: left });
}));

// ------------------------------------------------------------ movements in a period
router.get('/moves', validate(z.object({ store_id: z.string().uuid().optional(), ...periodFields }), 'query'),
  scopeStore({ required: false }), wrap(async (req, res) => {
    const { from, to } = resolvePeriod(req.validatedQuery);
    const rows = await many(
      `SELECT m.id, m.kind, m.qty, m.reason, m.created_at,
              to_char(m.created_at AT TIME ZONE $3, 'YYYY-MM-DD') AS day,
              p.name, p.size, p.color, s.name AS store_name
         FROM stock_movements m
         JOIN products p ON p.id = m.product_id
         JOIN stores s ON s.id = m.store_id
        WHERE s.owner_id = $1 AND ($2::uuid IS NULL OR m.store_id = $2)
          AND (m.created_at AT TIME ZONE $3)::date BETWEEN $4::date AND $5::date
        ORDER BY m.created_at DESC
        LIMIT 1000`,
      [req.ownerId, req.storeId, TZ, from, to]
    );
    res.json({ from, to, rows });
  }));

module.exports = router;
