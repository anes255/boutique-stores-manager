import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { neon } from '@neondatabase/serverless';
import { SCHEMA } from './schema.js';

const { DATABASE_URL, JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD, PORT = 3000 } = process.env;
for (const [name, value] of Object.entries({ DATABASE_URL, JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD })) {
  if (!value) {
    console.error(`${name} must be set`);
    process.exit(1);
  }
}
if (JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be at least 32 characters');
  process.exit(1);
}

const db = neon(DATABASE_URL);
// Retries only when the connection itself fails (no Postgres error code), never on SQL errors.
const sql = async (text, params = []) => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.query(text, params);
    } catch (e) {
      if (e.code || attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 300 * attempt));
    }
  }
};
const one = async (text, params) => (await sql(text, params))[0] || null;

// ---------- helpers ----------
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};

const PG_MESSAGES = {
  '23505': 'القيمة موجودة من قبل',
  '23503': 'لا يمكن الحذف لوجود عمليات مرتبطة',
  '23001': 'لا يمكن الحذف لوجود عمليات مرتبطة',
};

// Arabic-Indic digits (٠١٢…/۰۱۲…) typed on an Arabic keyboard count as 0-9
const latinDigits = (s) =>
  s.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x6f0));
// usernames and passwords: trimmed, digits normalized
const cred = (v, label) => latinDigits(str(v, label));

const str = (v, label) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s || s.length > 100) fail(400, `${label} غير صحيح`);
  return s;
};
const positive = (v, label) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > 1e10) fail(400, `${label} غير صحيح`);
  return n;
};
const nonNegative = (v, label) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1e10) fail(400, `${label} غير صحيح`);
  return n;
};
const id = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) fail(400, 'معرف غير صحيح');
  return n;
};
const optId = (v) => (v === undefined || v === null || v === '' ? null : id(v));
const date = (v) => {
  if (typeof v !== 'string' || !/^\d{4}[/-]\d{2}[/-]\d{2}$/.test(v)) fail(400, 'التاريخ غير صحيح');
  return v.replace(/\//g, '-');
};
const today = () => new Date().toISOString().slice(0, 10);

// ---------- app ----------
const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '50kb' }));

app.get('/health', (req, res) => res.json({ ok: true }));

// ---------- auth ----------
const TABLE = { main: 'maarid.main_users', sub: 'maarid.sub_users' };
const role = (v) => (v === 'main' || v === 'sub' ? v : fail(400, 'نوع المستخدم غير صحيح'));
const sign = (user) => jwt.sign(user, JWT_SECRET, { expiresIn: '30d' });

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'محاولات كثيرة، حاول لاحقا' } });

// anyone may create an admin account; each admin gets its own stores
app.get('/auth/config', (req, res) => res.json({ mainSignup: true }));

app.post('/auth/login', authLimiter, async (req, res) => {
  const r = role(req.body.role);
  const username = cred(req.body.username, 'اسم المستخدم');
  const password = cred(req.body.password, 'كلمة السر');
  const cols = r === 'sub'
    ? 'id, username, main_id, coalesce(name, username) as name'
    : 'id, username, id as main_id, username as name';
  const u = await one(
    `select ${cols} from ${TABLE[r]} where username = $1 and password_hash = crypt($2, password_hash)`,
    [username, password]
  );
  if (!u) {
    // right account, wrong door: say which login screen to use
    const other = r === 'main' ? 'sub' : 'main';
    const elsewhere = await one(
      `select 1 from ${TABLE[other]} where username = $1 and password_hash = crypt($2, password_hash)`,
      [username, password]
    );
    if (elsewhere) fail(401, other === 'main' ? 'هذا حساب المستخدم الرئيسي، ادخل من "مستخدم رئيسي"' : 'هذا حساب متجر، ادخل من "مستخدم فرعي"');
    fail(401, 'اسم المستخدم او كلمة السر خطأ');
  }
  const user = { role: r, id: u.id, username: u.username, name: u.name, mainId: u.main_id };
  res.json({ token: sign(user), user });
});

app.post('/auth/register', authLimiter, async (req, res) => {
  const r = role(req.body.role);
  const username = cred(req.body.username, 'اسم المستخدم');
  const password = cred(req.body.password, 'كلمة السر');
  if (password.length < 4) fail(400, 'كلمة السر قصيرة (4 احرف على الاقل)');
  let user;
  try {
    if (r === 'main') {
      const u = await one(
        `insert into maarid.main_users(username, password_hash) values ($1, crypt($2, gen_salt('bf'))) returning id, username`,
        [username, password]
      );
      user = { role: 'main', id: u.id, username: u.username, name: u.username, mainId: u.id };
    } else {
      // a new store belongs to the admin from env
      const mainName = latinDigits(ADMIN_USERNAME.trim());
      const u = await one(
        `insert into maarid.sub_users(main_id, username, password_hash)
         select id, $2, crypt($3, gen_salt('bf')) from maarid.main_users where username = $1
         returning id, username, main_id`,
        [mainName, username, password]
      );
      if (!u) fail(404, 'المستخدم الرئيسي غير موجود');
      user = { role: 'sub', id: u.id, username: u.username, name: u.username, mainId: u.main_id };
    }
  } catch (e) {
    if (e.code === '23505') fail(409, 'اسم المستخدم موجود من قبل');
    throw e;
  }
  res.json({ token: sign(user), user });
});

// everything below needs a valid token
app.use((req, res, next) => {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  try {
    const { role: r, id: uid, username, mainId } = jwt.verify(token, JWT_SECRET);
    req.user = { role: r, id: uid, username, mainId };
  } catch {
    return res.status(401).json({ error: 'انتهت الجلسة، سجل الدخول من جديد' });
  }
  next();
});

const mainOnly = (req, res, next) => (req.user.role === 'main' ? next() : res.status(403).json({ error: 'غير مسموح' }));
const subOnly = (req, res, next) => (req.user.role === 'sub' ? next() : res.status(403).json({ error: 'غير مسموح' }));

// The showroom the caller may read: a sub user only sees itself; a main user may pick one of its own.
async function showroomOf(req, requested) {
  if (req.user.role === 'sub') return req.user.id;
  const subId = optId(requested);
  if (subId === null) return null;
  const row = await one('select id from maarid.sub_users where id=$1 and main_id=$2', [subId, req.user.id]);
  if (!row) fail(404, 'المتجر غير موجود');
  return row.id;
}
async function requireShowroom(req, requested) {
  const subId = await showroomOf(req, requested);
  if (!subId) fail(400, 'اختر المتجر');
  return subId;
}

// ---------- day numbers: sales, cost, profit ----------
// The purchase cost of a sale: what was saved with it, or the product's price when that was never set.
const SALE_COST = 'coalesce(nullif(s.cost, 0), p.cost)';

// cost = purchase cost of the goods sold + expenses; profit = sales - cost
const withProfit = (r) => {
  const sales = Number(r.sales);
  const goodsCost = Number(r.goods_cost);
  const expenses = Number(r.expenses);
  return { ...r, sales, goods_cost: goodsCost, expenses, cost: goodsCost + expenses, profit: sales - goodsCost - expenses };
};

// the phone's local date, so "today" matches what the user sees
const dayOf = (req) => (req.query.day ? date(req.query.day) : today());

app.get('/stats', async (req, res) => {
  const d = dayOf(req);
  const subId = await showroomOf(req, req.query.subId);
  if (subId) {
    return res.json(withProfit(await one(
      `select
         (select coalesce(sum(qty*price),0) from maarid.sales where sub_id=$1 and day=$2) sales,
         (select count(*) from maarid.sales where sub_id=$1 and day=$2) sales_count,
         (select coalesce(sum(s.qty * ${SALE_COST}),0) from maarid.sales s
            join maarid.products p on p.id = s.product_id where s.sub_id=$1 and s.day=$2) goods_cost,
         (select coalesce(sum(amount),0) from maarid.expenses where sub_id=$1 and day=$2) expenses,
         (select coalesce(sum(case when kind='pay' then amount else -amount end),0) from maarid.cash_moves where sub_id=$1) cash,
         -- units in this store's stock: received + added/corrected - sold
         (select coalesce(sum(qty),0) from maarid.transfers where sub_id=$1)
           + (select coalesce(sum(qty),0) from maarid.store_adjust where sub_id=$1)
           - (select coalesce(sum(qty),0) from maarid.sales where sub_id=$1) units`,
      [subId, d]
    )));
  }
  // admin: every store plus the admin's own expenses
  res.json(withProfit(await one(
    `select
       (select coalesce(sum(s.qty*s.price),0) from maarid.sales s join maarid.sub_users u on u.id=s.sub_id
         where u.main_id=$1 and s.day=$2) sales,
       (select count(*) from maarid.sales s join maarid.sub_users u on u.id=s.sub_id
         where u.main_id=$1 and s.day=$2) sales_count,
       (select coalesce(sum(s.qty * ${SALE_COST}),0) from maarid.sales s
          join maarid.sub_users u on u.id=s.sub_id join maarid.products p on p.id=s.product_id
          where u.main_id=$1 and s.day=$2) goods_cost,
       (select coalesce(sum(case when c.kind='pay' then c.amount else -c.amount end),0)
          from maarid.cash_moves c join maarid.sub_users u on u.id=c.sub_id where u.main_id=$1) cash,
       (select coalesce(sum(e.amount),0) from maarid.expenses e left join maarid.sub_users u on u.id=e.sub_id
         where (e.main_id=$1 or u.main_id=$1) and e.day=$2) expenses,
       (select count(*) from maarid.sub_users where main_id=$1) stores,
       -- all units: warehouse + every store (stock added/corrected + added in stores - sold)
       (select coalesce(sum(i.qty),0) from maarid.stock_in i join maarid.products p on p.id=i.product_id where p.main_id=$1)
         + (select coalesce(sum(a.qty),0) from maarid.store_adjust a join maarid.products p on p.id=a.product_id where p.main_id=$1)
         - (select coalesce(sum(s.qty),0) from maarid.sales s join maarid.products p on p.id=s.product_id where p.main_id=$1) units`,
    [req.user.id, d]
  )));
});

// Daily report for the admin: totals plus one row per store.
app.get('/report', mainOnly, async (req, res) => {
  const d = dayOf(req);
  const stores = await sql(
    `select u.id, coalesce(u.name, u.username) as name,
       coalesce((select sum(qty*price) from maarid.sales where sub_id=u.id and day=$2),0) sales,
       coalesce((select sum(s.qty * ${SALE_COST}) from maarid.sales s
         join maarid.products p on p.id = s.product_id where s.sub_id=u.id and s.day=$2),0) goods_cost,
       coalesce((select sum(amount) from maarid.expenses where sub_id=u.id and day=$2),0) expenses
     from maarid.sub_users u where u.main_id=$1 order by u.id`,
    [req.user.id, d]
  );
  const admin = await one('select coalesce(sum(amount),0) expenses from maarid.expenses where main_id=$1 and day=$2', [
    req.user.id, d,
  ]);
  const rows = stores.map(withProfit);
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  res.json({
    stores: rows,
    adminExpenses: Number(admin.expenses),
    totals: withProfit({
      sales: sum('sales'),
      goods_cost: sum('goods_cost'),
      expenses: sum('expenses') + Number(admin.expenses),
    }),
  });
});

// ---------- showrooms (stores) ----------
app.get('/showrooms', mainOnly, async (req, res) => {
  res.json(await sql(
    'select id, username, coalesce(name, username) as name from maarid.sub_users where main_id=$1 order by id',
    [req.user.id]
  ));
});
// the admin opens a new store with its own login
app.post('/showrooms', mainOnly, async (req, res) => {
  const password = cred(req.body.password, 'كلمة السر');
  if (password.length < 4) fail(400, 'كلمة السر قصيرة (4 احرف على الاقل)');
  try {
    await sql(
      `insert into maarid.sub_users(main_id, name, username, password_hash) values ($1, $2, $3, crypt($4, gen_salt('bf')))`,
      [req.user.id, str(req.body.name, 'اسم المتجر'), cred(req.body.username, 'اسم المستخدم'), password]
    );
  } catch (e) {
    if (e.code === '23505') fail(409, 'اسم المستخدم موجود من قبل');
    throw e;
  }
  res.json({ ok: true });
});
// rename a store, change its login name, or reset its password (empty password = keep it)
app.put('/showrooms/:id', mainOnly, async (req, res) => {
  const password = typeof req.body.password === 'string' ? latinDigits(req.body.password.trim()) : '';
  if (password && password.length < 4) fail(400, 'كلمة السر قصيرة (4 احرف على الاقل)');
  try {
    const row = await one(
      `update maarid.sub_users set name=$1, username=$2,
         password_hash = case when $3 = '' then password_hash else crypt($3, gen_salt('bf')) end
       where id=$4 and main_id=$5 returning id`,
      [str(req.body.name, 'اسم المتجر'), cred(req.body.username, 'اسم المستخدم'), password, id(req.params.id), req.user.id]
    );
    if (!row) fail(404, 'المتجر غير موجود');
  } catch (e) {
    if (e.code === '23505') fail(409, 'اسم المستخدم موجود من قبل');
    throw e;
  }
  res.json({ ok: true });
});
app.delete('/showrooms/:id', mainOnly, async (req, res) => {
  await sql('delete from maarid.sub_users where id=$1 and main_id=$2', [id(req.params.id), req.user.id]);
  res.json({ ok: true });
});

// ---------- products ----------
// price = selling price, cost = purchase price (used for profit)
app.get('/products', mainOnly, async (req, res) => {
  res.json(await sql('select id, name, price, cost from maarid.products where main_id=$1 order by name', [req.user.id]));
});
app.post('/products', mainOnly, async (req, res) => {
  await sql('insert into maarid.products(main_id, name, price, cost) values ($1,$2,$3,$4)', [
    req.user.id, str(req.body.name, 'اسم المنتج'), nonNegative(req.body.price, 'سعر البيع'),
    nonNegative(req.body.cost ?? 0, 'سعر الشراء'),
  ]);
  res.json({ ok: true });
});
app.put('/products/:id', mainOnly, async (req, res) => {
  await sql('update maarid.products set name=$1, price=$2, cost=$3 where id=$4 and main_id=$5', [
    str(req.body.name, 'اسم المنتج'), nonNegative(req.body.price, 'سعر البيع'),
    nonNegative(req.body.cost ?? 0, 'سعر الشراء'), id(req.params.id), req.user.id,
  ]);
  res.json({ ok: true });
});
app.delete('/products/:id', mainOnly, async (req, res) => {
  await sql('delete from maarid.products where id=$1 and main_id=$2', [id(req.params.id), req.user.id]);
  res.json({ ok: true });
});

// ---------- stock ----------
// warehouse = stock added - goods sent to showrooms
app.get('/stock/main', mainOnly, async (req, res) => {
  res.json(await sql(
    `select p.id, p.name, coalesce(i.q,0) - coalesce(t.q,0) qty
     from maarid.products p
     left join (select product_id, sum(qty) q from maarid.stock_in group by 1) i on i.product_id = p.id
     left join (select product_id, sum(qty) q from maarid.transfers group by 1) t on t.product_id = p.id
     where p.main_id = $1 order by p.name`,
    [req.user.id]
  ));
});

// warehouse = stock added (and corrections) - goods sent to stores
const WAREHOUSE_QTY = `(select coalesce(sum(qty),0) from maarid.stock_in where product_id=$2::int)
  - (select coalesce(sum(qty),0) from maarid.transfers where product_id=$2::int)`;
// store = goods received + quantities added/corrected in the store - goods sold
const storeQty = (saleIdParam) => `(select coalesce(sum(qty),0) from maarid.transfers where sub_id=$1::int and product_id=$2::int)
  + (select coalesce(sum(qty),0) from maarid.store_adjust where sub_id=$1::int and product_id=$2::int)
  - (select coalesce(sum(qty),0) from maarid.sales where sub_id=$1::int and product_id=$2::int${
    saleIdParam ? ` and id <> ${saleIdParam}::int` : ''
  })`;

// total storage: warehouse + all stores, per product
app.get('/stock/total', mainOnly, async (req, res) => {
  res.json(await sql(
    `select p.id, p.name,
       coalesce(i.q,0) - coalesce(t.q,0) warehouse,
       coalesce(t.q,0) + coalesce(a.q,0) - coalesce(s.q,0) stores,
       coalesce(i.q,0) + coalesce(a.q,0) - coalesce(s.q,0) total,
       (coalesce(i.q,0) + coalesce(a.q,0) - coalesce(s.q,0)) * p.cost value
     from maarid.products p
     left join (select product_id, sum(qty) q from maarid.stock_in group by 1) i on i.product_id = p.id
     left join (select product_id, sum(qty) q from maarid.transfers group by 1) t on t.product_id = p.id
     left join (select product_id, sum(qty) q from maarid.store_adjust group by 1) a on a.product_id = p.id
     left join (select product_id, sum(qty) q from maarid.sales group by 1) s on s.product_id = p.id
     where p.main_id = $1 order by p.name`,
    [req.user.id]
  ));
});

app.get('/stock/showroom', async (req, res) => {
  const subId = await requireShowroom(req, req.query.subId);
  res.json(await sql(
    `select p.id, p.name, p.price, coalesce(t.q,0) + coalesce(a.q,0) - coalesce(s.q,0) qty
     from maarid.products p
     left join (select product_id, sum(qty) q from maarid.transfers where sub_id=$1 group by 1) t on t.product_id = p.id
     left join (select product_id, sum(qty) q from maarid.store_adjust where sub_id=$1 group by 1) a on a.product_id = p.id
     left join (select product_id, sum(qty) q from maarid.sales where sub_id=$1 group by 1) s on s.product_id = p.id
     where p.main_id = $2 order by p.name`,
    [subId, req.user.mainId]
  ));
});

// ---- add / edit quantities ----
// "add" adds to what is there; "set" makes the quantity exactly the number given (saved as a correction)
const newQty = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1e10) fail(400, 'الكمية غير صحيحة');
  return n;
};

app.post('/stock/in', mainOnly, async (req, res) => {
  const row = await one(
    `insert into maarid.stock_in(main_id, product_id, qty, day)
     select $1::int, id, $3::numeric, $4::date from maarid.products where id=$2::int and main_id=$1::int
     returning id`,
    [req.user.id, id(req.body.productId), positive(req.body.qty, 'الكمية'), date(req.body.day)]
  );
  if (!row) fail(404, 'المنتج غير موجود');
  res.json({ ok: true });
});

// warehouse: set the exact quantity
app.post('/stock/main/set', mainOnly, async (req, res) => {
  const row = await one(
    `insert into maarid.stock_in(main_id, product_id, qty, day, kind)
     select $1::int, p.id, $3::numeric - (${WAREHOUSE_QTY}), $4::date, 'adjust'
     from maarid.products p where p.id=$2::int and p.main_id=$1::int
     returning id`,
    [req.user.id, id(req.body.productId), newQty(req.body.qty), date(req.body.day)]
  );
  if (!row) fail(404, 'المنتج غير موجود');
  res.json({ ok: true });
});

// a store's own stock: add to it, or set the exact quantity (the store itself, or the admin for its stores)
const ownProduct = `exists (select 1 from maarid.products where id=$2::int and main_id=$5::int)`;

app.post('/stock/showroom/add', async (req, res) => {
  const subId = await requireShowroom(req, req.body.subId);
  const row = await one(
    `insert into maarid.store_adjust(sub_id, product_id, qty, day)
     select $1::int, $2::int, $3::numeric, $4::date where ${ownProduct} returning id`,
    [subId, id(req.body.productId), positive(req.body.qty, 'الكمية'), date(req.body.day), req.user.mainId]
  );
  if (!row) fail(404, 'المنتج غير موجود');
  res.json({ ok: true });
});

app.post('/stock/showroom/set', async (req, res) => {
  const subId = await requireShowroom(req, req.body.subId);
  const row = await one(
    `insert into maarid.store_adjust(sub_id, product_id, qty, day)
     select $1::int, $2::int, $3::numeric - (${storeQty()}), $4::date where ${ownProduct} returning id`,
    [subId, id(req.body.productId), newQty(req.body.qty), date(req.body.day), req.user.mainId]
  );
  if (!row) fail(404, 'المنتج غير موجود');
  res.json({ ok: true });
});

app.post('/transfers', mainOnly, async (req, res) => {
  const subId = await requireShowroom(req, req.body.subId);
  const productId = id(req.body.productId);
  const qty = positive(req.body.qty, 'الكمية');
  const row = await one(
    `insert into maarid.transfers(main_id, sub_id, product_id, qty, day)
     select $1::int, $2::int, p.id, $4::numeric, $5::date from maarid.products p
     where p.id=$3::int and p.main_id=$1::int
       and (select coalesce(sum(qty),0) from maarid.stock_in where product_id=$3::int)
         - (select coalesce(sum(qty),0) from maarid.transfers where product_id=$3::int) >= $4::numeric
     returning id`,
    [req.user.id, subId, productId, qty, date(req.body.day)]
  );
  if (!row) fail(400, 'الكمية غير متوفرة في المخزون');
  res.json({ ok: true });
});

app.get('/transfers', mainOnly, async (req, res) => {
  const subId = await showroomOf(req, req.query.subId);
  res.json(await sql(
    `select t.id, coalesce(u.name, u.username) showroom, p.name product, t.qty, to_char(t.day,'YYYY/MM/DD') as day
     from maarid.transfers t
     join maarid.products p on p.id = t.product_id
     join maarid.sub_users u on u.id = t.sub_id
     where t.main_id = $1 and t.day between $2 and $3 and ($4::int is null or t.sub_id = $4)
     order by t.day, t.id`,
    [req.user.id, date(req.query.from), date(req.query.to), subId]
  ));
});

// ---------- sales ----------
app.get('/sales', async (req, res) => {
  const subId = await showroomOf(req, req.query.subId);
  const [where, owner] = subId ? ['s.sub_id = $1', subId] : ['u.main_id = $1', req.user.id];
  res.json(await sql(
    `select s.id, s.product_id, p.name product, coalesce(u.name, u.username) showroom, s.qty, s.price,
       s.qty*s.price total, s.qty*(s.price - ${SALE_COST}) profit, to_char(s.day,'YYYY/MM/DD') as day
     from maarid.sales s
     join maarid.products p on p.id = s.product_id
     join maarid.sub_users u on u.id = s.sub_id
     where ${where} and s.day between $2 and $3
     order by s.day, s.id`,
    [owner, date(req.query.from), date(req.query.to)]
  ));
});

// available in the store (not counting the sale being edited) must cover the quantity sold
const STOCK_OK = `${storeQty('$6')} >= $3::numeric`;

// the product's purchase price, saved on the sale so later price changes don't rewrite past profit
const PRODUCT_COST = '(select cost from maarid.products where id=$2::int)';

// A store writes its own sales; the admin writes a store's sales by passing that store's subId.
const saleParams = (subId, req, saleId) => [
  subId, id(req.body.productId), positive(req.body.qty, 'الكمية'), nonNegative(req.body.price, 'السعر'),
  date(req.body.day), saleId,
];

app.post('/sales', async (req, res) => {
  const subId = await requireShowroom(req, req.body.subId);
  const row = await one(
    `insert into maarid.sales(sub_id, product_id, qty, price, day, cost)
     select $1::int, $2::int, $3::numeric, $4::numeric, $5::date, ${PRODUCT_COST}
     where ${STOCK_OK} returning id`,
    saleParams(subId, req, 0)
  );
  if (!row) fail(400, 'الكمية غير متوفرة');
  res.json({ ok: true });
});
app.put('/sales/:id', async (req, res) => {
  const subId = await requireShowroom(req, req.body.subId);
  const row = await one(
    `update maarid.sales set product_id=$2::int, qty=$3::numeric, price=$4::numeric, day=$5::date,
       cost=${PRODUCT_COST}
     where id=$6::int and sub_id=$1::int and ${STOCK_OK} returning id`,
    saleParams(subId, req, id(req.params.id))
  );
  if (!row) fail(400, 'الكمية غير متوفرة');
  res.json({ ok: true });
});
app.delete('/sales/:id', async (req, res) => {
  const owner = req.user.role === 'sub' ? 'id = $2::int' : 'main_id = $2::int';
  await sql(
    `delete from maarid.sales where id=$1 and sub_id in (select id from maarid.sub_users where ${owner})`,
    [id(req.params.id), req.user.id]
  );
  res.json({ ok: true });
});

// ---------- expenses ----------
// A sub user owns its showroom's expenses; a main user owns its own and can read a showroom's (?subId=).
app.get('/expenses', async (req, res) => {
  const subId = await showroomOf(req, req.query.subId);
  const [col, owner] = subId ? ['sub_id', subId] : ['main_id', req.user.id];
  res.json(await sql(
    `select id, name, amount, to_char(day,'YYYY/MM/DD') as day from maarid.expenses
     where ${col} = $1 and day between $2 and $3 order by day, id`,
    [owner, date(req.query.from), date(req.query.to)]
  ));
});
// Expenses the caller may change: a store its own; the admin its own and those of its stores.
const editableExpense = (req) =>
  req.user.role === 'sub'
    ? 'sub_id = $U::int'
    : '(main_id = $U::int or sub_id in (select id from maarid.sub_users where main_id = $U::int))';

app.post('/expenses', async (req, res) => {
  // a store adds its own; the admin adds its own, or a store's when subId is given
  const subId = await showroomOf(req, req.body.subId);
  await sql('insert into maarid.expenses(main_id, sub_id, name, amount, day) values ($1,$2,$3,$4,$5)', [
    subId ? null : req.user.id, subId,
    str(req.body.name, 'اسم المصروف'), positive(req.body.amount, 'القيمة'), date(req.body.day),
  ]);
  res.json({ ok: true });
});
app.put('/expenses/:id', async (req, res) => {
  await sql(
    `update maarid.expenses set name=$1, amount=$2, day=$3 where id=$4 and ${editableExpense(req).replaceAll('$U', '$5')}`,
    [str(req.body.name, 'اسم المصروف'), positive(req.body.amount, 'القيمة'), date(req.body.day),
      id(req.params.id), req.user.id]
  );
  res.json({ ok: true });
});
app.delete('/expenses/:id', async (req, res) => {
  await sql(`delete from maarid.expenses where id=$1 and ${editableExpense(req).replaceAll('$U', '$2')}`, [
    id(req.params.id), req.user.id,
  ]);
  res.json({ ok: true });
});

// ---------- cash box ----------
app.get('/cash', async (req, res) => {
  const subId = await requireShowroom(req, req.query.subId);
  res.json(await sql(
    `select id, kind, amount, to_char(day,'YYYY/MM/DD') as day from maarid.cash_moves
     where sub_id=$1 order by day desc, id desc`,
    [subId]
  ));
});
app.post('/cash', subOnly, async (req, res) => {
  const kind = req.body.kind === 'pay' || req.body.kind === 'return' ? req.body.kind : fail(400, 'نوع العملية غير صحيح');
  await sql('insert into maarid.cash_moves(sub_id, kind, amount, day) values ($1,$2,$3,$4)', [
    req.user.id, kind, positive(req.body.amount, 'المبلغ'), date(req.body.day),
  ]);
  res.json({ ok: true });
});
app.delete('/cash/:id', subOnly, async (req, res) => {
  await sql('delete from maarid.cash_moves where id=$1 and sub_id=$2', [id(req.params.id), req.user.id]);
  res.json({ ok: true });
});

// ---------- errors ----------
app.use((req, res) => res.status(404).json({ error: 'غير موجود' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (PG_MESSAGES[err.code]) return res.status(400).json({ error: PG_MESSAGES[err.code] });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'طلب غير صحيح' });
  console.error(err);
  res.status(500).json({ error: 'خطأ في الخادم' });
});

// Startup queries retry, so a brief network drop doesn't crash the server.
async function startupSql(text, params) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await sql(text, params);
    } catch (e) {
      if (attempt >= 5 || e.code) throw e; // SQL errors (with a code) are real problems
      console.error(`database not reachable, retrying (${attempt})`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

for (const stmt of SCHEMA) await startupSql(stmt);

// The admin main user always matches ADMIN_USERNAME / ADMIN_PASSWORD from the environment.
await startupSql(
  `insert into maarid.main_users(username, password_hash) values ($1, crypt($2, gen_salt('bf')))
   on conflict (username) do update set password_hash = crypt($2, gen_salt('bf'))
   where maarid.main_users.password_hash <> crypt($2, maarid.main_users.password_hash)`,
  [latinDigits(ADMIN_USERNAME.trim()), latinDigits(ADMIN_PASSWORD.trim())]
);

app.listen(PORT, () => console.log(`maarid server on :${PORT}`));
