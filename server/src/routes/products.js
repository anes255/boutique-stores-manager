const express = require('express');
const { z } = require('zod');
const { one, many, query } = require('../lib/db');
const { wrap, notFound } = require('../lib/errors');
const { validate } = require('../lib/validate');
const { authenticate, adminOnly, scopeStore, audit } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/limits');

/**
 * المنتجات: يعرّفها المستخدم الرئيسي مرة واحدة (الاسم، المقاس، اللون، الأسعار)،
 * وكمية كل منتج في كل فرع موجودة في /api/stock.
 */
const router = express.Router();
router.use(authenticate);

const productSchema = z.object({
  name: z.string().trim().min(1, 'اكتب اسم المنتج').max(160),
  size: z.string().trim().max(40).optional().nullable(),
  color: z.string().trim().max(60).optional().nullable(),
  cost_price: z.coerce.number().min(0, 'سعر الشراء غير صحيح').max(1e9).default(0),
  sell_price: z.coerce.number().min(0, 'سعر البيع غير صحيح').max(1e9).default(0),
});

// ------------------------------------------------------------ list
// مع store_id: كمية كل منتج في ذلك الفرع. بدونه (للمستخدم الرئيسي): الكمية في كل الفروع معا.
router.get('/', validate(z.object({ store_id: z.string().uuid().optional() }), 'query'),
  scopeStore({ required: false }), wrap(async (req, res) => {
    const owner = req.user.role === 'admin';
    const inStore = !!req.storeId;
    const products = await many(
      `SELECT p.id, p.name, p.size, p.color, p.sell_price, ${owner ? 'p.cost_price,' : ''}
              ${inStore
                ? 'COALESCE(b.qty, 0) AS qty, (b.product_id IS NOT NULL) AS in_branch'
                : 'COALESCE((SELECT sum(x.qty) FROM branch_stock x WHERE x.product_id = p.id), 0) AS qty'}
         FROM products p
         ${inStore ? 'LEFT JOIN branch_stock b ON b.product_id = p.id AND b.store_id = $2' : ''}
        WHERE p.owner_id = $1
        ORDER BY lower(p.name), p.size NULLS FIRST, p.color NULLS FIRST`,
      inStore ? [req.ownerId, req.storeId] : [req.ownerId]
    );
    res.json({ products });
  }));

async function ownedProduct(req, id) {
  const product = await one('SELECT * FROM products WHERE id = $1 AND owner_id = $2', [id, req.user.id]);
  if (!product) throw notFound('المنتج غير موجود');
  return product;
}

// ------------------------------------------------------------ create
router.post('/', adminOnly, writeLimiter, validate(productSchema), wrap(async (req, res) => {
  const b = req.body;
  const product = await one(
    `INSERT INTO products (owner_id, store_id, name, size, color, unit, cost_price, sell_price, stock)
     VALUES ($1, NULL, $2, $3, $4, 'piece', $5, $6, 0) RETURNING *`,
    [req.user.id, b.name, b.size || null, b.color || null, b.cost_price, b.sell_price]
  );
  audit(req, 'product.create', 'product', product.id, { name: product.name });
  res.status(201).json({ product });
}));

// ------------------------------------------------------------ update
router.patch('/:id', adminOnly, writeLimiter, validate(productSchema.partial()), wrap(async (req, res) => {
  await ownedProduct(req, req.params.id);
  const sets = [];
  const values = [];
  for (const f of ['name', 'size', 'color', 'cost_price', 'sell_price']) {
    if (req.body[f] !== undefined) {
      values.push(req.body[f] === '' ? null : req.body[f]);
      sets.push(`${f} = $${values.length}`);
    }
  }
  if (!sets.length) return res.json({ product: await ownedProduct(req, req.params.id) });
  sets.push('updated_at = now()');
  values.push(req.params.id);
  const product = await one(`UPDATE products SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values);
  audit(req, 'product.update', 'product', product.id, req.body);
  res.json({ product });
}));

// ------------------------------------------------------------ delete
// عمليات البيع القديمة تبقى باسم المنتج؛ كمياته في الفروع تُحذف معه.
router.delete('/:id', adminOnly, writeLimiter, wrap(async (req, res) => {
  const product = await ownedProduct(req, req.params.id);
  await query('DELETE FROM products WHERE id = $1', [product.id]);
  audit(req, 'product.delete', 'product', product.id, { name: product.name });
  res.json({ ok: true });
}));

module.exports = router;
