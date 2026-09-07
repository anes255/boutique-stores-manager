const express = require('express');
const { z } = require('zod');
const { one, many } = require('../lib/db');
const { wrap, notFound, badRequest } = require('../lib/errors');
const { validate } = require('../lib/validate');
const { authenticate, scopeStore, audit } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/limits');
const { tx } = require('../lib/db');

const router = express.Router();
router.use(authenticate);

const itemSchema = z.object({
  product_id: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1).max(160),
  size: z.string().trim().max(40).optional().nullable(),
  color: z.string().trim().max(60).optional().nullable(),
  unit: z.string().trim().max(24).optional().nullable(),
  qty: z.coerce.number().positive('الكمية يجب أن تكون أكبر من الصفر').max(100000),
  unit_price: z.coerce.number().min(0),
});

const saleSchema = z.object({
  store_id: z.string().uuid().optional(),
  customer_name: z.string().trim().max(120).optional().nullable(),
  customer_phone: z.string().trim().max(40).optional().nullable(),
  discount: z.coerce.number().min(0).default(0),
  payment_method: z.enum(['cash', 'card', 'transfer', 'other']).default('cash'),
  note: z.string().trim().max(300).optional().nullable(),
  items: z.array(itemSchema).min(1, 'أضف قطعة واحدة على الأقل').max(100),
});

const listSchema = z.object({
  store_id: z.string().uuid().optional(),
  from: z.string().datetime().optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  to: z.string().datetime().optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  offset: z.coerce.number().int().min(0).default(0),
});

// ------------------------------------------------------------ list
router.get('/', validate(listSchema, 'query'), scopeStore({ required: false }), wrap(async (req, res) => {
  const q = req.validatedQuery;
  const sales = await many(
    `SELECT s.*, u.full_name AS seller, st.name AS store_name, st.currency,
            (SELECT count(*) FROM sale_items i WHERE i.sale_id = s.id)::int AS item_count
       FROM sales s
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN stores st ON st.id = s.store_id
      WHERE ($1::uuid IS NULL OR s.store_id = $1)
        AND ($2::timestamptz IS NULL OR s.created_at >= $2)
        AND ($3::timestamptz IS NULL OR s.created_at < ($3::timestamptz + interval '1 day'))
      ORDER BY s.created_at DESC LIMIT $4 OFFSET $5`,
    [req.storeId, q.from || null, q.to || null, q.limit, q.offset]
  );
  res.json({ sales });
}));

// ------------------------------------------------------------ detail
router.get('/:id', wrap(async (req, res) => {
  const sale = await one(
    `SELECT s.*, u.full_name AS seller, st.name AS store_name, st.currency
       FROM sales s LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN stores st ON st.id = s.store_id WHERE s.id = $1`, [req.params.id]
  );
  if (!sale) throw notFound('عملية البيع غير موجودة');
  if (req.user.role !== 'admin' && sale.store_id !== req.user.store_id) throw notFound('عملية البيع غير موجودة');
  const items = await many('SELECT * FROM sale_items WHERE sale_id = $1', [sale.id]);
  res.json({ sale, items });
}));

// ------------------------------------------------------------ create
router.post('/', writeLimiter, validate(saleSchema), scopeStore(), wrap(async (req, res) => {
  const b = req.body;
  const storeId = req.storeId;

  const sale = await tx(async (c) => {
    // Lock every referenced product row so concurrent tills cannot oversell.
    const ids = [...new Set(b.items.map((i) => i.product_id).filter(Boolean))];
    const stockMap = new Map();
    if (ids.length) {
      const { rows } = await c.query(
        'SELECT id, name, stock, cost_price, store_id FROM products WHERE id = ANY($1::uuid[]) FOR UPDATE',
        [ids]
      );
      for (const r of rows) {
        if (r.store_id !== storeId) throw badRequest(`"${r.name}" لا ينتمي إلى هذا المحل`);
        stockMap.set(r.id, r);
      }
      if (rows.length !== ids.length) throw badRequest('أحد المنتجات لم يعد موجودا');
    }

    let subtotal = 0;
    let costTotal = 0;
    const prepared = b.items.map((i) => {
      const p = i.product_id ? stockMap.get(i.product_id) : null;
      const unitCost = p ? Number(p.cost_price) : 0;
      const lineTotal = Number((i.qty * i.unit_price).toFixed(2));
      subtotal += lineTotal;
      costTotal += unitCost * i.qty;
      return { ...i, unit_cost: unitCost, line_total: lineTotal };
    });

    // Verify stock per product across all lines of the ticket.
    const wanted = new Map();
    for (const i of prepared) {
      if (!i.product_id) continue;
      wanted.set(i.product_id, (wanted.get(i.product_id) || 0) + Number(i.qty));
    }
    for (const [pid, qty] of wanted) {
      const p = stockMap.get(pid);
      if (Number(p.stock) < qty) {
        throw badRequest(`بقي ${Number(p.stock)} فقط من "${p.name}"`);
      }
    }

    const discount = Math.min(Number(b.discount), subtotal);
    const total = Number((subtotal - discount).toFixed(2));
    const profit = Number((total - costTotal).toFixed(2));
    const reference = 'S-' + Date.now().toString(36).toUpperCase();

    const { rows: saleRows } = await c.query(
      `INSERT INTO sales (store_id, user_id, reference, customer_name, customer_phone,
                          subtotal, discount, total, cost_total, profit, payment_method, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [storeId, req.user.id, reference, b.customer_name || null, b.customer_phone || null,
       subtotal, discount, total, costTotal, profit, b.payment_method, b.note || null]
    );
    const created = saleRows[0];

    for (const i of prepared) {
      await c.query(
        `INSERT INTO sale_items (sale_id, product_id, name, size, color, unit, qty, unit_price, unit_cost, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [created.id, i.product_id || null, i.name, i.size || null, i.color || null,
         i.unit || null, i.qty, i.unit_price, i.unit_cost, i.line_total]
      );
    }

    for (const [pid, qty] of wanted) {
      const { rows } = await c.query(
        'UPDATE products SET stock = stock - $1, updated_at = now() WHERE id = $2 RETURNING stock',
        [qty, pid]
      );
      await c.query(
        `INSERT INTO stock_movements (store_id, product_id, user_id, kind, qty, balance_after, reason)
         VALUES ($1,$2,$3,'out',$4,$5,$6)`,
        [storeId, pid, req.user.id, -qty, rows[0].stock, `بيع ${reference}`]
      );
    }

    return created;
  });

  audit(req, 'sale.create', 'sale', sale.id, { total: sale.total, items: b.items.length });
  res.status(201).json({ sale });
}));

// ------------------------------------------------------------ refund
router.post('/:id/refund', writeLimiter, wrap(async (req, res) => {
  const sale = await one('SELECT * FROM sales WHERE id = $1', [req.params.id]);
  if (!sale) throw notFound('عملية البيع غير موجودة');
  if (req.user.role !== 'admin' && sale.store_id !== req.user.store_id) throw notFound('عملية البيع غير موجودة');
  if (sale.status === 'refunded') throw badRequest('هذه العملية مُرجعة من قبل');
  req.storeId = sale.store_id;

  await tx(async (c) => {
    const { rows: items } = await c.query(
      'SELECT product_id, qty FROM sale_items WHERE sale_id = $1 AND product_id IS NOT NULL', [sale.id]
    );
    for (const i of items) {
      const { rows } = await c.query(
        'UPDATE products SET stock = stock + $1, updated_at = now() WHERE id = $2 RETURNING stock',
        [i.qty, i.product_id]
      );
      if (rows[0]) {
        await c.query(
          `INSERT INTO stock_movements (store_id, product_id, user_id, kind, qty, balance_after, reason)
           VALUES ($1,$2,$3,'in',$4,$5,$6)`,
          [sale.store_id, i.product_id, req.user.id, i.qty, rows[0].stock, `إرجاع ${sale.reference}`]
        );
      }
    }
    await c.query("UPDATE sales SET status = 'refunded' WHERE id = $1", [sale.id]);
  });

  audit(req, 'sale.refund', 'sale', sale.id, { total: sale.total });
  res.json({ ok: true });
}));

module.exports = router;
