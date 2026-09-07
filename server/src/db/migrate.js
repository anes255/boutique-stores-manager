require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool, query, one } = require('../lib/db');

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('> applying schema...');
  await query(sql);
  console.log('  schema ok');

  // Bootstrap the owner/admin account exactly once.
  const email = (process.env.ADMIN_EMAIL || 'admin@store.com').toLowerCase();
  const existing = await one('SELECT id FROM users WHERE lower(email) = $1', [email]);
  if (existing) {
    console.log(`  admin already exists (${email})`);
  } else {
    const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
    const hash = await bcrypt.hash(password, 12);
    await query(
      `INSERT INTO users (store_id, full_name, email, password_hash, role)
       VALUES (NULL, $1, $2, $3, 'admin')`,
      [process.env.ADMIN_NAME || 'Owner', email, hash]
    );
    console.log(`  admin created -> ${email} / ${password}`);
  }

  await pool.end();
  console.log('> done');
}

run().catch((err) => {
  console.error('migration failed:', err);
  process.exit(1);
});
