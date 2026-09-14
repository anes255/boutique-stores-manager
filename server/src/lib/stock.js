const { badRequest } = require('./errors');

/**
 * يغيّر كمية منتج في فرع ويسجّل الحركة، داخل معاملة `c`.
 * delta موجب = دخول، سالب = خروج. الخروج لا يمر إلا إذا كانت الكمية تكفي،
 * والتحقق والخصم في جملة واحدة، فلا يمكن لبيعين في نفس اللحظة أن يبيعا نفس القطعة.
 */
async function changeStock(c, { storeId, productId, userId, delta, kind, reason, name }) {
  if (!delta) return null;

  let qty;
  if (delta > 0) {
    const { rows } = await c.query(
      `INSERT INTO branch_stock (store_id, product_id, qty) VALUES ($1, $2, $3)
       ON CONFLICT (store_id, product_id)
       DO UPDATE SET qty = branch_stock.qty + EXCLUDED.qty, updated_at = now()
       RETURNING qty`,
      [storeId, productId, delta]
    );
    qty = rows[0].qty;
  } else {
    const { rows } = await c.query(
      `UPDATE branch_stock SET qty = qty + $3, updated_at = now()
        WHERE store_id = $1 AND product_id = $2 AND qty >= $4
        RETURNING qty`,
      [storeId, productId, delta, -delta]
    );
    if (!rows[0]) {
      const cur = await c.query('SELECT qty FROM branch_stock WHERE store_id = $1 AND product_id = $2',
        [storeId, productId]);
      const have = cur.rows[0] ? Number(cur.rows[0].qty) : 0;
      throw badRequest(have > 0
        ? `بقي ${have} فقط من "${name}"`
        : `"${name}" غير موجود في مخزون هذا الفرع`);
    }
    qty = rows[0].qty;
  }

  await c.query(
    `INSERT INTO stock_movements (store_id, product_id, user_id, kind, qty, balance_after, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [storeId, productId, userId, kind || (delta > 0 ? 'in' : 'out'), delta, qty, reason || null]
  );
  return Number(qty);
}

module.exports = { changeStock };
