-- ============================================================
--  Multi-store clothing retail management - schema
--  Safe to run repeatedly (idempotent).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------- stores ----------
CREATE TABLE IF NOT EXISTS stores (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  code           text UNIQUE NOT NULL,
  address        text,
  phone          text,
  city           text,
  currency       text NOT NULL DEFAULT 'دج',
  color          text NOT NULL DEFAULT '#E8813A',
  monthly_target numeric(14,2) NOT NULL DEFAULT 0,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------- users (admin + per-store managers/staff) ----------
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      uuid REFERENCES stores(id) ON DELETE CASCADE,
  full_name     text NOT NULL,
  email         text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL CHECK (role IN ('admin','manager','staff')),
  phone         text,
  is_active     boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT false,
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until  timestamptz,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uidx ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_store_idx ON users (store_id);

-- ---------- refresh tokens (hashed, rotating) ----------
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_user_idx ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS refresh_hash_idx ON refresh_tokens (token_hash);

-- ---------- categories ----------
CREATE TABLE IF NOT EXISTS categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   uuid REFERENCES stores(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS categories_store_idx ON categories (store_id);

-- ---------- products ----------
CREATE TABLE IF NOT EXISTS products (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category_id  uuid REFERENCES categories(id) ON DELETE SET NULL,
  sku          text,
  name         text NOT NULL,
  brand        text,
  color        text,
  size         text,
  gender       text,
  season       text,
  unit         text NOT NULL DEFAULT 'piece',
  cost_price   numeric(12,2) NOT NULL DEFAULT 0,
  sell_price   numeric(12,2) NOT NULL DEFAULT 0,
  stock        numeric(12,2) NOT NULL DEFAULT 0,
  low_stock_at numeric(12,2) NOT NULL DEFAULT 3,
  image_url    text,
  notes        text,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_store_idx ON products (store_id);
CREATE INDEX IF NOT EXISTS products_name_idx ON products (store_id, lower(name));

-- ---------- sales ----------
CREATE TABLE IF NOT EXISTS sales (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  reference      text NOT NULL,
  customer_name  text,
  customer_phone text,
  subtotal       numeric(14,2) NOT NULL DEFAULT 0,
  discount       numeric(14,2) NOT NULL DEFAULT 0,
  total          numeric(14,2) NOT NULL DEFAULT 0,
  cost_total     numeric(14,2) NOT NULL DEFAULT 0,
  profit         numeric(14,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash',
  status         text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','refunded')),
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sales_store_date_idx ON sales (store_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sale_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id    uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  name       text NOT NULL,
  size       text,
  color      text,
  unit       text,
  qty        numeric(12,2) NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  unit_cost  numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS sale_items_sale_idx ON sale_items (sale_id);
CREATE INDEX IF NOT EXISTS sale_items_product_idx ON sale_items (product_id);

-- ---------- purchases (restocking) ----------
CREATE TABLE IF NOT EXISTS purchases (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  reference  text NOT NULL,
  supplier   text,
  total      numeric(14,2) NOT NULL DEFAULT 0,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchases_store_date_idx ON purchases (store_id, created_at DESC);

CREATE TABLE IF NOT EXISTS purchase_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id  uuid REFERENCES products(id) ON DELETE SET NULL,
  name        text NOT NULL,
  qty         numeric(12,2) NOT NULL,
  unit_cost   numeric(12,2) NOT NULL,
  line_total  numeric(14,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS purchase_items_purchase_idx ON purchase_items (purchase_id);

-- ---------- stock movements (inventory audit trail) ----------
CREATE TABLE IF NOT EXISTS stock_movements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id    uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  kind          text NOT NULL CHECK (kind IN ('in','out','adjust')),
  qty           numeric(12,2) NOT NULL,
  balance_after numeric(12,2),
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_mov_store_idx ON stock_movements (store_id, created_at DESC);

-- ---------- expenses / losses ----------
CREATE TABLE IF NOT EXISTS expenses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  category   text NOT NULL DEFAULT 'other',
  label      text NOT NULL,
  amount     numeric(14,2) NOT NULL,
  spent_at   date NOT NULL DEFAULT CURRENT_DATE,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expenses_store_date_idx ON expenses (store_id, spent_at DESC);

-- ---------- employees & payroll ----------
CREATE TABLE IF NOT EXISTS employees (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  full_name      text NOT NULL,
  job_title      text,
  phone          text,
  email          text,
  monthly_salary numeric(12,2) NOT NULL DEFAULT 0,
  hired_at       date,
  is_active      boolean NOT NULL DEFAULT true,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employees_store_idx ON employees (store_id);

CREATE TABLE IF NOT EXISTS salary_payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  store_id    uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  period      text NOT NULL,
  base_amount numeric(12,2) NOT NULL DEFAULT 0,
  bonus       numeric(12,2) NOT NULL DEFAULT 0,
  deduction   numeric(12,2) NOT NULL DEFAULT 0,
  total       numeric(12,2) NOT NULL DEFAULT 0,
  paid_at     date NOT NULL DEFAULT CURRENT_DATE,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS salary_unique_period ON salary_payments (employee_id, period);
CREATE INDEX IF NOT EXISTS salary_store_idx ON salary_payments (store_id, paid_at DESC);

-- ---------- audit log ----------
CREATE TABLE IF NOT EXISTS audit_logs (
  id         bigserial PRIMARY KEY,
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  store_id   uuid REFERENCES stores(id) ON DELETE SET NULL,
  action     text NOT NULL,
  entity     text,
  entity_id  text,
  meta       jsonb,
  ip         text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_store_idx ON audit_logs (store_id, created_at DESC);

-- العملة الافتراضية بالعربية (آمن على قاعدة موجودة مسبقا)
ALTER TABLE stores ALTER COLUMN currency SET DEFAULT 'دج';

-- ============================================================
--  v3: كل مستخدم رئيسي يملك فروعه ومنتجاته.
--  المنتج يُعرّف مرة واحدة عند المستخدم الرئيسي، ولكل فرع كميته منه.
-- ============================================================
ALTER TABLE stores ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS join_code text;
CREATE UNIQUE INDEX IF NOT EXISTS stores_join_code_uidx ON stores (upper(join_code)) WHERE join_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS stores_owner_idx ON stores (owner_id);

ALTER TABLE products ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE products ALTER COLUMN store_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS products_owner_idx ON products (owner_id);

-- كمية كل منتج في كل فرع
CREATE TABLE IF NOT EXISTS branch_stock (
  store_id   uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty        numeric(12,2) NOT NULL DEFAULT 0 CHECK (qty >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, product_id)
);
CREATE INDEX IF NOT EXISTS branch_stock_product_idx ON branch_stock (product_id);

-- الصندوق: عمليات الإيداع والسحب
CREATE TABLE IF NOT EXISTS cash_moves (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  kind       text NOT NULL CHECK (kind IN ('in','out')),
  amount     numeric(14,2) NOT NULL CHECK (amount > 0),
  note       text,
  moved_on   date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cash_moves_store_idx ON cash_moves (store_id, moved_on DESC);
