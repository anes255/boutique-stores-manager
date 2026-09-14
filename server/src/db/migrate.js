require('../lib/env');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool, query, one, many, tx } = require('../lib/db');
const { freshJoinCode } = require('../lib/codes');

/**
 * Applies the schema, makes sure an owner account exists, and moves older
 * data to the v3 layout. Safe to run on every boot: each step only touches
 * rows that still need it.
 */
async function runMigrations() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('> applying schema...');
  await query(sql);
  console.log('  schema ok');

  await ensureOwner();
  await backfillV3();
}

// المالك الأول يُنشأ مرة واحدة فقط، عندما لا يوجد أي مالك. لو بحثنا باسم ADMIN_EMAIL،
// فإن تغيير المالك لاسم مستخدمه كان سيعيد إنشاء الحساب القديم مع كل نشر.
async function ensureOwner() {
  const existing = await one("SELECT email FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1");
  if (existing) {
    console.log(`  admin already exists (${existing.email})`);
    return;
  }
  const email = (process.env.ADMIN_EMAIL || 'admin@store.com').toLowerCase();
  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'ChangeMe123!', 12);
  await query(
    `INSERT INTO users (store_id, full_name, email, password_hash, role)
     VALUES (NULL, $1, $2, $3, 'admin')`,
    [process.env.ADMIN_NAME || 'Owner', email, hash]
  );
  console.log(`  admin created -> ${email}`);
}

/**
 * قبل v3 كان كل منتج داخل محل واحد، وكان هناك مالك واحد لكل شيء.
 * الآن: الفروع والمنتجات تُنسب للمالك الأول، وكمية كل منتج تنتقل إلى مخزون فرعه.
 */
async function backfillV3() {
  const first = await one("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1");
  if (!first) return;

  const stores = await query('UPDATE stores SET owner_id = $1 WHERE owner_id IS NULL', [first.id]);
  if (stores.rowCount) console.log(`  v3: ${stores.rowCount} branch(es) linked to the first owner`);

  const noCode = await many('SELECT id FROM stores WHERE join_code IS NULL');
  for (const s of noCode) {
    await query('UPDATE stores SET join_code = $1 WHERE id = $2', [await freshJoinCode(pool), s.id]);
  }
  if (noCode.length) console.log(`  v3: join codes for ${noCode.length} branch(es)`);

  const moved = await tx(async (c) => {
    await c.query(
      `INSERT INTO branch_stock (store_id, product_id, qty)
       SELECT store_id, id, GREATEST(stock, 0) FROM products
        WHERE owner_id IS NULL AND store_id IS NOT NULL
       ON CONFLICT (store_id, product_id) DO NOTHING`
    );
    const { rowCount } = await c.query(
      `UPDATE products p
          SET owner_id = COALESCE((SELECT s.owner_id FROM stores s WHERE s.id = p.store_id), $1),
              store_id = NULL, stock = 0
        WHERE owner_id IS NULL`,
      [first.id]
    );
    return rowCount;
  });
  if (moved) console.log(`  v3: ${moved} product(s) moved to branch stock`);
}

module.exports = { runMigrations };

// Only tear the pool down when this file is the process entry point;
// when the server requires it at boot the pool has to stay open.
if (require.main === module) {
  runMigrations()
    .then(async () => {
      await pool.end();
      console.log('> done');
    })
    .catch((err) => {
      console.error('migration failed:', err);
      process.exit(1);
    });
}
