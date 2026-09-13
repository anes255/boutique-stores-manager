require('../lib/env');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool, query, one } = require('../lib/db');

/**
 * Applies the schema and makes sure the owner account exists.
 * Safe to run on every boot - the schema is idempotent and the admin
 * is only created when it is missing.
 */
async function runMigrations() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('> applying schema...');
  await query(sql);
  console.log('  schema ok');

  // المالك يُنشأ مرة واحدة فقط، عندما لا يوجد أي مالك. لو بحثنا باسم ADMIN_EMAIL،
  // فإن تغيير المالك لاسم مستخدمه كان سيعيد إنشاء الحساب القديم مع كل نشر.
  const email = (process.env.ADMIN_EMAIL || 'admin@store.com').toLowerCase();
  const existing = await one("SELECT email FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1");
  if (existing) {
    console.log(`  admin already exists (${existing.email})`);
    return;
  }

  const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
  const hash = await bcrypt.hash(password, 12);
  await query(
    `INSERT INTO users (store_id, full_name, email, password_hash, role)
     VALUES (NULL, $1, $2, $3, 'admin')`,
    [process.env.ADMIN_NAME || 'Owner', email, hash]
  );
  console.log(`  admin created -> ${email}`);
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
