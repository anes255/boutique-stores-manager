const express = require('express');
const { z } = require('zod');
const { one, many, tx } = require('../lib/db');
const { wrap, notFound, badRequest } = require('../lib/errors');
const { validate } = require('../lib/validate');
const { authenticate, scopeStore, audit } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/limits');

const router = express.Router();
router.use(authenticate);

const purchaseSchema = z.object({
  store_id: z.string().uuid().optional(),
  supplier: z.string().trim().max(140).optional().nullable(),
  note: z.string().trim().max(300).optional().nullable(),
  items: z.array(z.object({
    product_id: z.string().uuid().optional().nullable(),
    name: z.string().trim().min(1).max(160),
    qty: z.coerce.number().positive().max(100000),
    unit_cost: z.coerce.number().min(0),
    // when product_id is absent a new product is created on the fly
    sell_price: z.coerce.number().min(0).optional(),
    size: z.string().trim().max(40).optional().nullable(),
    color: z.string().trim().max(60).optional().nullable(),
    unit: z.string().trim().max(24).optional(),
  })).min(1, 'Add at least one item').max(100),
});

// ------------------------------------------------------------ list
router.get('/', validate(z.object({
  store_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  offset: z.coerce.number().int().min(0).default(0),
}), 'query'), scopeStore({ required: false }), wrap(async (req, res) => {
  const q = req.validatedQuery;
  const purchases = await many(
    `SELECT p.*, u.full_name AS created_by, st.name AS store_name, st.currency,
            (SELECT count(*) FROM purchase_items i WHERE i.purchase_id = p.id)::int AS item_count
       FROM purchases p
       LEFT JOIN users u ON u.id = p.user_id
       LEFT JOIN stores st ON st.id = p.store_id
      WHERE ($1::uuid IS NULL OR p.store_id = $1)
      ORDER BY p.created_at DESC LIMIT $2 OFFSET $3`,
    [req.storeId, q.limit, q.offset]
  );
  res.json({ purchases });
}));

// ------------------------------------------------------------ detail
router.get('/:id', wrap(async (req, res) => {
  const purchase = await one(
    `SELECT p.*, u.full_name AS created_by, st.currency FROM purchases p
       LEFT JOIN users u ON u.id = p.user_id
       LEFT JOIN stores st ON st.id = p.store_id WHERE p.id = $1`, [req.params.id]
  );
  if (!purchase) throw notFound('Purchase not found');
  if (req.user.role !== 'admin' && purchase.store_id !== req.user.store_id) throw notFound('Purchase not found');
  const items = await many('SELECT * FROM purchase_items WHERE purchase_id = $1', [purchase.id]);
  res.json({ purchase, items });
}));

// ------------------------------------------------------------ create (restock)
router.post('/', writeLimiter, validate(purchaseSchema), scopeStore(), wrap(async (req, res) => {
  const b = req.body;
  const storeId = req.storeId;

  const purchase = await tx(async (c) => {
    const reference = 'P-' + Date.now().toString(36).toUpperCase();
    let total = 0;
    for (const i of b.items) total += Number(i.qty) * Number(i.unit_cost);
    total = Number(total.toFixed(2));

    const { rows } = await c.query(
      `INSERT INTO purchases (store_id, user_id, reference, supplier, total, note)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [storeId, req.user.id, reference, b.supplier || null, total, b.note || null]
    );
    const created = rows[0];

    for (const i of b.items) {
      let productId = i.product_id || null;

      if (productId) {
        const { rows: pr } = await c.query(
          'SELECT id, store_id FROM products WHERE id = $1 FOR UPDATE', [productId]
        );
        if (!pr[0]) throw badRequest(`Product "${i.name}" no longer exists`);
        if (pr[0].store_id !== storeId) throw badRequest(`"${i.name}" does not belong to this store`);
        // Moving-average cost so profit stays honest after a price change.
        const { rows: upd } = await c.query(
          `UPDATE products
              SET cost_price = CASE WHEN stock + $1 > 0
                                    THEN ROUND(((stock * cost_price) + ($1 * $2)) / (stock + $1), 2)
                                    ELSE $2 END,
                  stock = stock + $1,
                  updated_at = now()
            WHERE id = $3 RETURNING stock`,
          [i.qty, i.unit_cost, productId]
        );
        await c.query(
          `INSERT INTO stock_movements (store_id, product_id, user_id, kind, qty, balance_after, reason)
           VALUES ($1,$2,$3,'in',$4,$5,$6)`,
          [storeId, productId, req.user.id, i.qty, upd[0].stock, `Purchase ${reference}`]
        );
      } else {
        const { rows: np } = await c.query(
          `INSERT INTO products (store_id, name, size, color, unit, cost_price, sell_price, stock)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [storeId, i.name, i.size || null, i.color || null, i.unit || 'piece',
           i.unit_cost, i.sell_price ?? Number((i.unit_cost * 1.4).toFixed(2)), i.qty]
        );
        productId = np[0].id;
        await c.query(
          `INSERT INTO stock_movements (store_id, product_id, user_id, kind, qty, balance_after, reason)
           VALUES ($1,$2,$3,'in',$4,$4,$5)`,
          [storeId, productId, req.user.id, i.qty, `Purchase ${reference}`]
        );
      }

      await c.query(
        `INSERT INTO purchase_items (purchase_id, product_id, name, qty, unit_cost, line_total)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [created.id, productId, i.name, i.qty, i.unit_cost, Number((i.qty * i.unit_cost).toFixed(2))]
      );
    }
    return created;
  });

  audit(req, 'purchase.create', 'purchase', purchase.id, { total: purchase.total });
  res.status(201).json({ purchase });
}));

module.exports = router;
