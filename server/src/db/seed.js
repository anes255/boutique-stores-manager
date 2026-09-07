/**
 * Optional demo data so the dashboards have something to draw on day one.
 * Run with:  npm run seed
 * It is idempotent: stores are matched on their code.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, one, query, tx } = require('../lib/db');

const STORES = [
  { name: 'Nour Boutique - Centre', code: 'NOUR-01', city: 'Alger', color: '#E8813A', target: 900000,
    manager: { name: 'Amina Belkacem', email: 'amina@stores.app', password: 'Store@2026' } },
  { name: 'Nour Boutique - Bab Ezzouar', code: 'NOUR-02', city: 'Alger', color: '#4E8D7C', target: 650000,
    manager: { name: 'Yacine Haddad', email: 'yacine@stores.app', password: 'Store@2026' } },
  { name: 'Nour Kids', code: 'NOUR-K1', city: 'Oran', color: '#7C6BD1', target: 420000,
    manager: { name: 'Lina Cherif', email: 'lina@stores.app', password: 'Store@2026' } },
];

const CATALOG = [
  ['Dresses', [
    ['Linen summer dress', 'women', 3200, 5900, ['S', 'M', 'L'], ['Beige', 'Olive']],
    ['Satin evening dress', 'women', 5400, 9800, ['M', 'L'], ['Navy', 'Burgundy']],
  ]],
  ['Tops', [
    ['Cotton oversized tee', 'unisex', 750, 1700, ['S', 'M', 'L', 'XL'], ['White', 'Black', 'Sand']],
    ['Ribbed knit top', 'women', 1200, 2600, ['S', 'M'], ['Cream', 'Rose']],
  ]],
  ['Bottoms', [
    ['High-waist denim', 'women', 2100, 4400, ['36', '38', '40', '42'], ['Indigo', 'Light blue']],
    ['Pleated midi skirt', 'women', 1800, 3900, ['S', 'M', 'L'], ['Camel', 'Black']],
  ]],
  ['Outerwear', [
    ['Wool blend coat', 'women', 6800, 13500, ['M', 'L'], ['Camel', 'Grey']],
    ['Denim jacket', 'unisex', 2600, 5500, ['S', 'M', 'L'], ['Blue']],
  ]],
  ['Kids', [
    ['Kids hoodie', 'kids', 900, 2200, ['4y', '6y', '8y', '10y'], ['Mint', 'Coral']],
    ['Kids joggers', 'kids', 700, 1800, ['4y', '6y', '8y'], ['Grey', 'Navy']],
  ]],
];

const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = (arr) => arr[rand(0, arr.length - 1)];

async function seedStore(def) {
  let store = await one('SELECT * FROM stores WHERE code = $1', [def.code]);
  if (store) {
    console.log(`  ${def.code} already seeded, skipping`);
    return;
  }
  store = await one(
    `INSERT INTO stores (name, code, city, color, monthly_target, phone, address)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [def.name, def.code, def.city, def.color, def.target, '+213 555 000 000', `${def.city}, Algeria`]
  );

  const hash = await bcrypt.hash(def.manager.password, 12);
  const manager = await one(
    `INSERT INTO users (store_id, full_name, email, password_hash, role)
     VALUES ($1,$2,$3,$4,'manager') RETURNING id`,
    [store.id, def.manager.name, def.manager.email, hash]
  );
  await query(
    `INSERT INTO employees (store_id, user_id, full_name, job_title, email, monthly_salary, hired_at)
     VALUES ($1,$2,$3,'Store manager',$4,$5, CURRENT_DATE - 400)`,
    [store.id, manager.id, def.manager.name, def.manager.email, 62000]
  );
  await query(
    `INSERT INTO employees (store_id, full_name, job_title, monthly_salary, hired_at)
     VALUES ($1,$2,'Sales assistant',$3, CURRENT_DATE - 200), ($1,$4,'Sales assistant',$5, CURRENT_DATE - 90)`,
    [store.id, 'Sara Meziane', 42000, 'Karim Ould', 40000]
  );

  const products = [];
  for (const [catName, items] of CATALOG) {
    const cat = await one('INSERT INTO categories (store_id, name) VALUES ($1,$2) RETURNING id',
      [store.id, catName]);
    for (const [name, gender, cost, sell, sizes, colors] of items) {
      for (const size of sizes) {
        const color = pick(colors);
        const p = await one(
          `INSERT INTO products (store_id, category_id, name, sku, gender, size, color, unit,
                                 cost_price, sell_price, stock, low_stock_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'piece',$8,$9,$10,3) RETURNING id, cost_price, sell_price, name, size, color`,
          [store.id, cat.id, name,
           `${def.code}-${name.split(' ')[0].toUpperCase().slice(0, 4)}-${size}`,
           gender, size, color, cost, sell, rand(2, 26)]
        );
        products.push(p);
      }
    }
  }

  // 90 days of trading history, written in one transaction per store.
  await tx(async (c) => {
    for (let d = 89; d >= 0; d--) {
      const orders = rand(1, 6);
      for (let o = 0; o < orders; o++) {
        const lines = rand(1, 3);
        const chosen = [];
        let subtotal = 0;
        let costTotal = 0;
        for (let l = 0; l < lines; l++) {
          const p = pick(products);
          const qty = rand(1, 3);
          subtotal += Number(p.sell_price) * qty;
          costTotal += Number(p.cost_price) * qty;
          chosen.push({ p, qty });
        }
        const discount = Math.random() < 0.2 ? Math.round(subtotal * 0.1) : 0;
        const total = subtotal - discount;

        const { rows } = await c.query(
          `INSERT INTO sales (store_id, user_id, reference, subtotal, discount, total, cost_total, profit,
                              payment_method, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
                   now() - ($10::int * interval '1 day') + ($11::int * interval '1 hour'))
           RETURNING id`,
          [store.id, manager.id, 'S-' + Math.random().toString(36).slice(2, 9).toUpperCase(),
           subtotal, discount, total, costTotal, total - costTotal,
           Math.random() < 0.75 ? 'cash' : pick(['card', 'transfer']), d, rand(9, 20)]
        );

        const values = [];
        const params = [];
        chosen.forEach(({ p, qty }, idx) => {
          const b = idx * 9;
          values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},'piece',$${b + 6},$${b + 7},$${b + 8},$${b + 9})`);
          params.push(rows[0].id, p.id, p.name, p.size, p.color, qty, p.sell_price, p.cost_price,
            Number(p.sell_price) * qty);
        });
        await c.query(
          `INSERT INTO sale_items (sale_id, product_id, name, size, color, unit, qty, unit_price, unit_cost, line_total)
           VALUES ${values.join(',')}`,
          params
        );
      }

      if (d % 7 === 0) {
        await c.query(
          `INSERT INTO purchases (store_id, reference, supplier, total, created_at)
           VALUES ($1,$2,$3,$4, now() - ($5::int * interval '1 day'))`,
          [store.id, 'P-' + Math.random().toString(36).slice(2, 9).toUpperCase(),
           pick(['Atlas Textile', 'Medina Wholesale', 'Istanbul Import']), rand(60000, 220000), d]
        );
      }
      if (d % 5 === 0) {
        await c.query(
          `INSERT INTO expenses (store_id, category, label, amount, spent_at)
           VALUES ($1,$2,$3,$4, CURRENT_DATE - $5::int)`,
          [store.id, pick(['rent', 'utilities', 'supplies', 'marketing', 'transport']),
           pick(['Monthly rent share', 'Electricity', 'Bags & tags', 'Instagram ads', 'Delivery van']),
           rand(4000, 45000), d]
        );
      }
    }
  });

  console.log(`  seeded ${def.code} (${def.manager.email} / ${def.manager.password})`);
}

async function run() {
  console.log('> seeding demo data...');
  for (const s of STORES) await seedStore(s);
  await pool.end();
  console.log('> done');
}

run().catch((e) => { console.error(e); process.exit(1); });
