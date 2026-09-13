const express = require('express');
const { z } = require('zod');
const { one, many, query, tx } = require('../lib/db');
const { wrap, notFound, badRequest } = require('../lib/errors');
const { validate } = require('../lib/validate');
const { authenticate, scopeStore, audit } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/limits');

const router = express.Router();
router.use(authenticate);

const productSchema = z.object({
  store_id: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'الاسم مطلوب').max(160),
  sku: z.string().trim().max(60).optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  brand: z.string().trim().max(80).optional().nullable(),
  color: z.string().trim().max(60).optional().nullable(),
  size: z.string().trim().max(40).optional().nullable(),
  gender: z.enum(['women', 'men', 'kids', 'unisex']).optional().nullable(),
  season: z.enum(['spring', 'summer', 'autumn', 'winter', 'all']).optional().nullable(),
  unit: z.string().trim().max(24).default('piece'),
  cost_price: z.coerce.number().min(0).default(0),
  sell_price: z.coerce.number().min(0).default(0),
  stock: z.coerce.number().min(0).default(0),
  low_stock_at: z.coerce.number().min(0).default(3),
  image_url: z.string().trim().url().max(500).optional().nullable().or(z.literal('')),
  notes: z.string().trim().max(500).optional().nullable(),
  is_active: z.boolean().default(true),
});

const listSchema = z.object({
  store_id: z.string().uuid().optional(),
  q: z.string().trim().max(80).optional(),
  category_id: z.string().uuid().optional(),
  low_only: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

// ------------------------------------------------------------ list
router.get('/', validate(listSchema, 'query'), scopeStore({ required: false }), wrap(async (req, res) => {
  const q = req.validatedQuery;
  const params = [req.storeId, q.q ? `%${q.q.toLowerCase()}%` : null, q.category_id || null,
    q.low_only === 'true', q.limit, q.offset];
  const products = await many(
    `SELECT p.*, c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
      WHERE ($1::uuid IS NULL OR p.store_id = $1)
        AND ($2::text IS NULL OR lower(p.name) LIKE $2 OR lower(coalesce(p.sku,'')) LIKE $2
             OR lower(coalesce(p.brand,'')) LIKE $2)
        AND ($3::uuid IS NULL OR p.category_id = $3)
        AND ($4::boolean = false OR p.stock <= p.low_stock_at)
      ORDER BY p.is_active DESC, p.created_at DESC
      LIMIT $5 OFFSET $6`,
    params
  );
  const totals = await one(
    `SELECT count(*)::int AS count,
            COALESCE(sum(stock),0) AS units,
            COALESCE(sum(stock * cost_price),0) AS stock_cost_value,
            COALESCE(sum(stock * sell_price),0) AS stock_sell_value
       FROM products WHERE ($1::uuid IS NULL OR store_id = $1) AND is_active`,
    [req.storeId]
  );
  res.json({ products, totals });
}));

// ------------------------------------------------------------ categories
router.get('/meta/categories', validate(z.object({ store_id: z.string().uuid().optional() }), 'query'),
  scopeStore({ required: false }), wrap(async (req, res) => {
    const categories = await many(
      `SELECT c.*, (SELECT count(*) FROM products p WHERE p.category_id = c.id)::int AS product_count
         FROM categories c WHERE ($1::uuid IS NULL OR c.store_id = $1) ORDER BY c.name`,
      [req.storeId]
    );
    res.json({ categories });
  }));

router.post('/meta/categories', writeLimiter,
  validate(z.object({ store_id: z.string().uuid().optional(), name: z.string().trim().min(1).max(80) })),
  scopeStore(), wrap(async (req, res) => {
    const category = await one(
      'INSERT INTO categories (store_id, name) VALUES ($1,$2) RETURNING *',
      [req.storeId, req.body.name]
    );
    audit(req, 'category.create', 'category', category.id, { name: category.name });
    res.status(201).json({ category });
  }));

router.delete('/meta/categories/:id', writeLimiter, wrap(async (req, res) => {
  const cat = await one('SELECT * FROM categories WHERE id = $1', [req.params.id]);
  if (!cat) throw notFound('الصنف غير موجود');
  if (req.user.role !== 'admin' && cat.store_id !== req.user.store_id) throw notFound('الصنف غير موجود');
  await query('DELETE FROM categories WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// ------------------------------------------------------------ single
router.get('/:id', wrap(async (req, res) => {
  const product = await one(
    `SELECT p.*, c.name AS category_name FROM products p
       LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = $1`, [req.params.id]
  );
  if (!product) throw notFound('المنتج غير موجود');
  if (req.user.role !== 'admin' && product.store_id !== req.user.store_id) throw notFound('المنتج غير موجود');
  const movements = await many(
    `SELECT m.*, u.full_name AS user_name FROM stock_movements m
       LEFT JOIN users u ON u.id = m.user_id
      WHERE m.product_id = $1 ORDER BY m.created_at DESC LIMIT 30`, [req.params.id]
  );
  res.json({ product, movements });
}));

// ------------------------------------------------------------ create
router.post('/', writeLimiter, validate(productSchema), scopeStore(), wrap(async (req, res) => {
  const b = req.body;
  const product = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO products (store_id, category_id, sku, name, brand, color, size, gender, season,
                             unit, cost_price, sell_price, stock, low_stock_at, image_url, notes, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [req.storeId, b.category_id || null, b.sku || null, b.name, b.brand || null, b.color || null,
       b.size || null, b.gender || null, b.season || null, b.unit, b.cost_price, b.sell_price,
       b.stock, b.low_stock_at, b.image_url || null, b.notes || null, b.is_active]
    );
    const created = rows[0];
    if (Number(b.stock) > 0) {
      await c.query(
        `INSERT INTO stock_movements (store_id, product_id, user_id, kind, qty, balance_after, reason)
         VALUES ($1,$2,$3,'in',$4,$4,'مخزون البداية')`,
        [req.storeId, created.id, req.user.id, b.stock]
      );
    }
    return created;
  });
  audit(req, 'product.create', 'product', product.id, { name: product.name });
  res.status(201).json({ product });
}));

// ------------------------------------------------------------ update
router.patch('/:id', writeLimiter, validate(productSchema.partial()), wrap(async (req, res) => {
  const existing = await one('SELECT * FROM products WHERE id = $1', [req.params.id]);
  if (!existing) throw notFound('المنتج غير موجود');
  if (req.user.role !== 'admin' && existing.store_id !== req.user.store_id) throw notFound('المنتج غير موجود');
  req.storeId = existing.store_id;

  const fields = ['category_id', 'sku', 'name', 'brand', 'color', 'size', 'gender', 'season', 'unit',
    'cost_price', 'sell_price', 'low_stock_at', 'image_url', 'notes', 'is_active'];
  const sets = [];
  const values = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      values.push(req.body[f] === '' ? null : req.body[f]);
      sets.push(`${f} = $${values.length}`);
    }
  }
  if (req.body.stock !== undefined && Number(req.body.stock) !== Number(existing.stock)) {
    values.push(req.body.stock);
    sets.push(`stock = $${values.length}`);
  }
  if (!sets.length) throw badRequest('لا يوجد شيء لتحديثه');
  sets.push('updated_at = now()');
  values.push(req.params.id);

  const product = await one(
    `UPDATE products SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values
  );

  if (req.body.stock !== undefined && Number(req.body.stock) !== Number(existing.stock)) {
    const delta = Number(req.body.stock) - Number(existing.stock);
    await query(
      `INSERT INTO stock_movements (store_id, product_id, user_id, kind, qty, balance_after, reason)
       VALUES ($1,$2,$3,'adjust',$4,$5,'تعديل يدوي')`,
      [existing.store_id, existing.id, req.user.id, delta, req.body.stock]
    );
  }
  audit(req, 'product.update', 'product', product.id, req.body);
  res.json({ product });
}));

// ------------------------------------------------------------ stock adjust
const adjustSchema = z.object({
  qty: z.coerce.number().refine((v) => v !== 0, 'الكمية لا يمكن أن تكون صفرا'),
  reason: z.string().trim().max(160).optional().nullable(),
});

router.post('/:id/stock', writeLimiter, validate(adjustSchema), wrap(async (req, res) => {
  const existing = await one('SELECT * FROM products WHERE id = $1', [req.params.id]);
  if (!existing) throw notFound('المنتج غير موجود');
  if (req.user.role !== 'admin' && existing.store_id !== req.user.store_id) throw notFound('المنتج غير موجود');
  req.storeId = existing.store_id;

  const qty = Number(req.body.qty);
  const next = Number(existing.stock) + qty;
  if (next < 0) throw badRequest('المخزون غير كاف لهذه الحركة');

  const product = await tx(async (c) => {
    const { rows } = await c.query(
      'UPDATE products SET stock = $1, updated_at = now() WHERE id = $2 RETURNING *', [next, existing.id]
    );
    await c.query(
      `INSERT INTO stock_movements (store_id, product_id, user_id, kind, qty, balance_after, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [existing.store_id, existing.id, req.user.id, qty > 0 ? 'in' : 'out', qty, next,
       req.body.reason || (qty > 0 ? 'استلام بضاعة' : 'خصم من المخزون')]
    );
    return rows[0];
  });
  audit(req, 'product.stock', 'product', product.id, { qty, reason: req.body.reason });
  res.json({ product });
}));

// ------------------------------------------------------------ damaged / lost
// ينقص المخزون ويسجّل الخسارة (بسعر الشراء) في عملية واحدة
const lossSchema = z.object({
  qty: z.coerce.number().positive('الكمية يجب أن تكون أكبر من الصفر').max(100000),
  note: z.string().trim().max(160).optional().nullable(),
});

router.post('/:id/loss', writeLimiter, validate(lossSchema), wrap(async (req, res) => {
  const existing = await one('SELECT * FROM products WHERE id = $1', [req.params.id]);
  if (!existing) throw notFound('المنتج غير موجود');
  if (req.user.role !== 'admin' && existing.store_id !== req.user.store_id) throw notFound('المنتج غير موجود');
  req.storeId = existing.store_id;

  const qty = Number(req.body.qty);
  if (qty > Number(existing.stock)) throw badRequest(`بقي ${Number(existing.stock)} فقط من "${existing.name}"`);
  const amount = Number((qty * Number(existing.cost_price)).toFixed(2));

  const product = await tx(async (c) => {
    const { rows } = await c.query(
      'UPDATE products SET stock = stock - $1, updated_at = now() WHERE id = $2 RETURNING *',
      [qty, existing.id]
    );
    await c.query(
      `INSERT INTO stock_movements (store_id, product_id, user_id, kind, qty, balance_after, reason)
       VALUES ($1,$2,$3,'out',$4,$5,'تالف أو ضائع')`,
      [existing.store_id, existing.id, req.user.id, -qty, rows[0].stock]
    );
    if (amount > 0) {
      await c.query(
        `INSERT INTO expenses (store_id, user_id, category, label, amount, note)
         VALUES ($1,$2,'loss',$3,$4,$5)`,
        [existing.store_id, req.user.id, `تالف أو ضائع: ${existing.name} × ${qty}`, amount, req.body.note || null]
      );
    }
    return rows[0];
  });
  audit(req, 'product.loss', 'product', product.id, { name: existing.name, qty, amount });
  res.json({ product, amount });
}));

// ------------------------------------------------------------ delete
router.delete('/:id', writeLimiter, wrap(async (req, res) => {
  const existing = await one('SELECT * FROM products WHERE id = $1', [req.params.id]);
  if (!existing) throw notFound('المنتج غير موجود');
  if (req.user.role !== 'admin' && existing.store_id !== req.user.store_id) throw notFound('المنتج غير موجود');
  await query('DELETE FROM products WHERE id = $1', [req.params.id]);
  req.storeId = existing.store_id;
  audit(req, 'product.delete', 'product', existing.id, { name: existing.name });
  res.json({ ok: true });
}));

module.exports = router;
