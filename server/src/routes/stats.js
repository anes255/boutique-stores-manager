const express = require('express');
const { z } = require('zod');
const { one, many } = require('../lib/db');
const { wrap, badRequest } = require('../lib/errors');
const { validate } = require('../lib/validate');
const { authenticate, scopeStore, adminOnly } = require('../middleware/auth');
const { reportLimiter } = require('../middleware/limits');

const router = express.Router();
router.use(authenticate, reportLimiter);

const rangeSchema = z.object({
  store_id: z.string().uuid().optional(),
  days: z.coerce.number().int().min(1).max(365).default(30),
  limit: z.coerce.number().int().min(1).max(50).default(8),
});

/**
 * Headline numbers for one store, or for the whole group when the admin
 * leaves store_id out.
 */
router.get('/overview', validate(rangeSchema, 'query'), scopeStore({ required: false }), wrap(async (req, res) => {
  const s = req.storeId;
  const days = req.validatedQuery.days;

  const sales = await one(
    `SELECT
       COALESCE(sum(total)   FILTER (WHERE created_at >= date_trunc('day', now())), 0)                                  AS today_revenue,
       COALESCE(sum(profit)  FILTER (WHERE created_at >= date_trunc('day', now())), 0)                                  AS today_profit,
       COUNT(*)              FILTER (WHERE created_at >= date_trunc('day', now()))                                      AS today_count,
       COALESCE(sum(total)   FILTER (WHERE created_at >= date_trunc('day', now()) - interval '1 day'
                                       AND created_at <  date_trunc('day', now())), 0)                                  AS yesterday_revenue,
       COALESCE(sum(total)   FILTER (WHERE created_at >= date_trunc('week', now())), 0)                                 AS week_revenue,
       COALESCE(sum(total)   FILTER (WHERE created_at >= date_trunc('month', now())), 0)                                AS month_revenue,
       COALESCE(sum(profit)  FILTER (WHERE created_at >= date_trunc('month', now())), 0)                                AS month_gross_profit,
       COALESCE(sum(cost_total) FILTER (WHERE created_at >= date_trunc('month', now())), 0)                             AS month_cogs,
       COUNT(*)              FILTER (WHERE created_at >= date_trunc('month', now()))                                    AS month_count,
       -- same elapsed slice of last month, so a month-to-date figure is compared fairly
       COALESCE(sum(total)   FILTER (WHERE created_at >= date_trunc('month', now() - interval '1 month')
                                       AND created_at <  date_trunc('month', now() - interval '1 month')
                                                         + (now() - date_trunc('month', now()))), 0)                    AS prev_month_revenue,
       COALESCE(sum(total), 0)                                                                                          AS all_time_revenue,
       COALESCE(sum(profit), 0)                                                                                         AS all_time_profit,
       COUNT(*)                                                                                                         AS all_time_count
     FROM sales
     WHERE status = 'completed' AND ($1::uuid IS NULL OR store_id = $1)`,
    [s]
  );

  const purchases = await one(
    `SELECT COALESCE(sum(total) FILTER (WHERE created_at >= date_trunc('day', now())), 0)   AS today_spend,
            COALESCE(sum(total) FILTER (WHERE created_at >= date_trunc('month', now())), 0) AS month_spend,
            COALESCE(sum(total), 0) AS all_time_spend
       FROM purchases WHERE ($1::uuid IS NULL OR store_id = $1)`,
    [s]
  );

  const expenses = await one(
    `SELECT COALESCE(sum(amount) FILTER (WHERE spent_at = CURRENT_DATE), 0)                        AS today_expenses,
            COALESCE(sum(amount) FILTER (WHERE spent_at >= date_trunc('month', CURRENT_DATE)), 0)  AS month_expenses,
            COALESCE(sum(amount), 0) AS all_time_expenses
       FROM expenses WHERE ($1::uuid IS NULL OR store_id = $1)`,
    [s]
  );

  const inventory = await one(
    `SELECT COUNT(*)::int                                            AS products,
            COALESCE(sum(stock), 0)                                  AS units,
            COALESCE(sum(stock * cost_price), 0)                     AS stock_cost_value,
            COALESCE(sum(stock * sell_price), 0)                     AS stock_retail_value,
            COUNT(*) FILTER (WHERE stock <= low_stock_at)::int       AS low_stock,
            COUNT(*) FILTER (WHERE stock <= 0)::int                  AS out_of_stock
       FROM products WHERE is_active AND ($1::uuid IS NULL OR store_id = $1)`,
    [s]
  );

  const team = await one(
    `SELECT COUNT(*) FILTER (WHERE is_active)::int AS active_employees,
            COALESCE(sum(monthly_salary) FILTER (WHERE is_active), 0) AS monthly_payroll
       FROM employees WHERE ($1::uuid IS NULL OR store_id = $1)`,
    [s]
  );

  const target = await one(
    `SELECT COALESCE(sum(monthly_target), 0) AS monthly_target, count(*)::int AS store_count
       FROM stores WHERE is_active AND ($1::uuid IS NULL OR id = $1)`,
    [s]
  );

  const num = (v) => Number(v || 0);
  const monthNet = num(sales.month_gross_profit) - num(expenses.month_expenses);
  const prev = num(sales.prev_month_revenue);
  const growth = prev > 0 ? ((num(sales.month_revenue) - prev) / prev) * 100 : null;
  const dayPrev = num(sales.yesterday_revenue);
  const dayGrowth = dayPrev > 0 ? ((num(sales.today_revenue) - dayPrev) / dayPrev) * 100 : null;
  const margin = num(sales.month_revenue) > 0
    ? (num(sales.month_gross_profit) / num(sales.month_revenue)) * 100 : 0;
  const targetPct = num(target.monthly_target) > 0
    ? (num(sales.month_revenue) / num(target.monthly_target)) * 100 : null;

  res.json({
    range_days: days,
    sales,
    purchases,
    expenses,
    inventory,
    team,
    target,
    computed: {
      month_net_profit: Number(monthNet.toFixed(2)),
      month_growth_pct: growth === null ? null : Number(growth.toFixed(1)),
      today_growth_pct: dayGrowth === null ? null : Number(dayGrowth.toFixed(1)),
      margin_pct: Number(margin.toFixed(1)),
      target_pct: targetPct === null ? null : Number(targetPct.toFixed(1)),
      avg_basket: num(sales.month_count) > 0
        ? Number((num(sales.month_revenue) / num(sales.month_count)).toFixed(2)) : 0,
    },
  });
}));

/**
 * الأرقام الثلاثة لشاشة المحل البسيطة، لليوم ولهذا الشهر:
 * الربح من المبيعات، الخسارة (بضاعة تالفة أو ضائعة)، والمصاريف (كل ما عدا ذلك).
 */
const simpleQuery = z.object({
  store_id: z.string().uuid().optional(),
  // فترة يختارها المستخدم، مثلا من 2 سبتمبر إلى 5 نوفمبر (اليومان داخلان)
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'تاريخ غير صحيح').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'تاريخ غير صحيح').optional(),
});

router.get('/simple', validate(simpleQuery, 'query'), scopeStore(), wrap(async (req, res) => {
  const s = req.storeId;
  const { from, to } = req.validatedQuery;
  const hasRange = !!(from && to);
  if (hasRange && from > to) throw badRequest('تاريخ البداية بعد تاريخ النهاية');
  const f = hasRange ? from : null;
  const t = hasRange ? to : null;
  const sales = await one(
    `SELECT
       COALESCE(sum(profit) FILTER (WHERE created_at >= date_trunc('day', now())), 0)   AS today_profit,
       COALESCE(sum(total)  FILTER (WHERE created_at >= date_trunc('day', now())), 0)   AS today_revenue,
       COUNT(*)             FILTER (WHERE created_at >= date_trunc('day', now()))::int  AS today_count,
       COALESCE(sum(profit) FILTER (WHERE created_at >= date_trunc('month', now())), 0) AS month_profit,
       COALESCE(sum(total)  FILTER (WHERE created_at >= date_trunc('month', now())), 0) AS month_revenue,
       COUNT(*)             FILTER (WHERE created_at >= date_trunc('month', now()))::int AS month_count,
       COALESCE(sum(profit) FILTER (WHERE created_at >= $2::date AND created_at < $3::date + 1), 0)  AS range_profit,
       COALESCE(sum(total)  FILTER (WHERE created_at >= $2::date AND created_at < $3::date + 1), 0)  AS range_revenue,
       COUNT(*)             FILTER (WHERE created_at >= $2::date AND created_at < $3::date + 1)::int AS range_count
     FROM sales WHERE status = 'completed' AND store_id = $1`,
    [s, f, t]
  );
  const spend = await one(
    `SELECT
       COALESCE(sum(amount) FILTER (WHERE category =  'loss' AND spent_at >= CURRENT_DATE), 0)                       AS today_loss,
       COALESCE(sum(amount) FILTER (WHERE category <> 'loss' AND spent_at >= CURRENT_DATE), 0)                       AS today_costs,
       COALESCE(sum(amount) FILTER (WHERE category =  'loss' AND spent_at >= date_trunc('month', CURRENT_DATE)), 0)  AS month_loss,
       COALESCE(sum(amount) FILTER (WHERE category <> 'loss' AND spent_at >= date_trunc('month', CURRENT_DATE)), 0)  AS month_costs,
       COALESCE(sum(amount) FILTER (WHERE category =  'loss' AND spent_at BETWEEN $2::date AND $3::date), 0)         AS range_loss,
       COALESCE(sum(amount) FILTER (WHERE category <> 'loss' AND spent_at BETWEEN $2::date AND $3::date), 0)         AS range_costs
     FROM expenses WHERE store_id = $1`,
    [s, f, t]
  );
  const n = (v) => Number(v || 0);
  const period = (k) => {
    const profit = n(sales[`${k}_profit`]);
    const loss = n(spend[`${k}_loss`]);
    const costs = n(spend[`${k}_costs`]);
    return {
      profit, loss, costs,
      net: Number((profit - loss - costs).toFixed(2)),
      revenue: n(sales[`${k}_revenue`]),
      sales: sales[`${k}_count`],
    };
  };
  res.json({
    today: period('today'),
    month: period('month'),
    ...(hasRange ? { range: { from, to, ...period('range') } } : {}),
  });
}));

/** Daily series: revenue, gross profit, purchases and expenses. Gap-filled. */
router.get('/series', validate(rangeSchema, 'query'), scopeStore({ required: false }), wrap(async (req, res) => {
  const s = req.storeId;
  const days = req.validatedQuery.days;
  const series = await many(
    `WITH d AS (
       SELECT generate_series(CURRENT_DATE - ($2::int - 1), CURRENT_DATE, interval '1 day')::date AS day
     )
     SELECT d.day,
            COALESCE(sa.revenue, 0)  AS revenue,
            COALESCE(sa.profit, 0)   AS profit,
            COALESCE(sa.orders, 0)   AS orders,
            COALESCE(pu.spend, 0)    AS purchases,
            COALESCE(ex.spend, 0)    AS expenses
       FROM d
       LEFT JOIN (
         SELECT created_at::date AS day, sum(total) AS revenue, sum(profit) AS profit, count(*)::int AS orders
           FROM sales WHERE status = 'completed' AND ($1::uuid IS NULL OR store_id = $1)
            AND created_at >= CURRENT_DATE - ($2::int - 1)
          GROUP BY 1) sa ON sa.day = d.day
       LEFT JOIN (
         SELECT created_at::date AS day, sum(total) AS spend
           FROM purchases WHERE ($1::uuid IS NULL OR store_id = $1)
            AND created_at >= CURRENT_DATE - ($2::int - 1)
          GROUP BY 1) pu ON pu.day = d.day
       LEFT JOIN (
         SELECT spent_at AS day, sum(amount) AS spend
           FROM expenses WHERE ($1::uuid IS NULL OR store_id = $1)
            AND spent_at >= CURRENT_DATE - ($2::int - 1)
          GROUP BY 1) ex ON ex.day = d.day
      ORDER BY d.day`,
    [s, days]
  );
  res.json({ series });
}));

/** Best sellers by revenue over the window. */
router.get('/top-products', validate(rangeSchema, 'query'), scopeStore({ required: false }), wrap(async (req, res) => {
  const { days, limit } = req.validatedQuery;
  const products = await many(
    `SELECT i.name, sum(i.qty) AS units, sum(i.line_total) AS revenue,
            sum(i.line_total - (i.unit_cost * i.qty)) AS profit
       FROM sale_items i JOIN sales s ON s.id = i.sale_id
      WHERE s.status = 'completed' AND ($1::uuid IS NULL OR s.store_id = $1)
        AND s.created_at >= CURRENT_DATE - ($2::int - 1)
      GROUP BY i.name ORDER BY revenue DESC LIMIT $3`,
    [req.storeId, days, limit]
  );
  res.json({ products });
}));

/** Revenue share by product category. */
router.get('/categories', validate(rangeSchema, 'query'), scopeStore({ required: false }), wrap(async (req, res) => {
  const { days, limit } = req.validatedQuery;
  const categories = await many(
    `SELECT COALESCE(c.name, 'Uncategorised') AS name,
            sum(i.line_total) AS revenue, sum(i.qty) AS units
       FROM sale_items i
       JOIN sales s ON s.id = i.sale_id
       LEFT JOIN products p ON p.id = i.product_id
       LEFT JOIN categories c ON c.id = p.category_id
      WHERE s.status = 'completed' AND ($1::uuid IS NULL OR s.store_id = $1)
        AND s.created_at >= CURRENT_DATE - ($2::int - 1)
      GROUP BY 1 ORDER BY revenue DESC LIMIT $3`,
    [req.storeId, days, limit]
  );
  res.json({ categories });
}));

/** Payment mix, useful for cash reconciliation. */
router.get('/payments', validate(rangeSchema, 'query'), scopeStore({ required: false }), wrap(async (req, res) => {
  const methods = await many(
    `SELECT payment_method AS name, sum(total) AS revenue, count(*)::int AS orders
       FROM sales WHERE status = 'completed' AND ($1::uuid IS NULL OR store_id = $1)
        AND created_at >= CURRENT_DATE - ($2::int - 1)
      GROUP BY 1 ORDER BY revenue DESC`,
    [req.storeId, req.validatedQuery.days]
  );
  res.json({ methods });
}));

/** Busiest hours of the shop day. */
router.get('/hours', validate(rangeSchema, 'query'), scopeStore({ required: false }), wrap(async (req, res) => {
  const hours = await many(
    `WITH h AS (SELECT generate_series(0, 23) AS hour)
     SELECT h.hour, COALESCE(x.revenue, 0) AS revenue, COALESCE(x.orders, 0) AS orders
       FROM h LEFT JOIN (
         SELECT extract(hour FROM created_at)::int AS hour, sum(total) AS revenue, count(*)::int AS orders
           FROM sales WHERE status = 'completed' AND ($1::uuid IS NULL OR store_id = $1)
            AND created_at >= CURRENT_DATE - ($2::int - 1)
          GROUP BY 1) x ON x.hour = h.hour
      ORDER BY h.hour`,
    [req.storeId, req.validatedQuery.days]
  );
  res.json({ hours });
}));

/** Employee leaderboard for the window. */
router.get('/staff', validate(rangeSchema, 'query'), scopeStore({ required: false }), wrap(async (req, res) => {
  const staff = await many(
    `SELECT u.id, u.full_name, u.role, st.name AS store_name,
            COALESCE(sum(s.total), 0) AS revenue,
            COALESCE(sum(s.profit), 0) AS profit,
            count(s.id)::int AS orders
       FROM users u
       LEFT JOIN stores st ON st.id = u.store_id
       LEFT JOIN sales s ON s.user_id = u.id AND s.status = 'completed'
                        AND s.created_at >= CURRENT_DATE - ($2::int - 1)
      WHERE u.role <> 'admin' AND ($1::uuid IS NULL OR u.store_id = $1)
      GROUP BY u.id, u.full_name, u.role, st.name
      ORDER BY revenue DESC LIMIT $3`,
    [req.storeId, req.validatedQuery.days, req.validatedQuery.limit]
  );
  res.json({ staff });
}));

/** Admin-only: side-by-side comparison of every store. */
router.get('/stores', adminOnly, validate(rangeSchema, 'query'), wrap(async (req, res) => {
  const days = req.validatedQuery.days;
  const stores = await many(
    `SELECT s.id, s.name, s.code, s.color, s.currency, s.monthly_target, s.is_active,
            COALESCE(sa.revenue, 0)   AS revenue,
            COALESCE(sa.profit, 0)    AS profit,
            COALESCE(sa.orders, 0)    AS orders,
            COALESCE(ex.spend, 0)     AS expenses,
            COALESCE(pu.spend, 0)     AS purchases,
            COALESCE(inv.stock_value, 0) AS stock_value,
            COALESCE(inv.low_stock, 0)   AS low_stock,
            COALESCE(emp.headcount, 0)   AS headcount,
            COALESCE(emp.payroll, 0)     AS payroll
       FROM stores s
       LEFT JOIN (SELECT store_id, sum(total) AS revenue, sum(profit) AS profit, count(*)::int AS orders
                    FROM sales WHERE status = 'completed' AND created_at >= CURRENT_DATE - ($1::int - 1)
                   GROUP BY store_id) sa ON sa.store_id = s.id
       LEFT JOIN (SELECT store_id, sum(amount) AS spend FROM expenses
                   WHERE spent_at >= CURRENT_DATE - ($1::int - 1) GROUP BY store_id) ex ON ex.store_id = s.id
       LEFT JOIN (SELECT store_id, sum(total) AS spend FROM purchases
                   WHERE created_at >= CURRENT_DATE - ($1::int - 1) GROUP BY store_id) pu ON pu.store_id = s.id
       LEFT JOIN (SELECT store_id, sum(stock * cost_price) AS stock_value,
                         count(*) FILTER (WHERE stock <= low_stock_at)::int AS low_stock
                    FROM products WHERE is_active GROUP BY store_id) inv ON inv.store_id = s.id
       LEFT JOIN (SELECT store_id, count(*) FILTER (WHERE is_active)::int AS headcount,
                         sum(monthly_salary) FILTER (WHERE is_active) AS payroll
                    FROM employees GROUP BY store_id) emp ON emp.store_id = s.id
      ORDER BY revenue DESC NULLS LAST`,
    [days]
  );
  res.json({ stores });
}));

/** Items that need reordering soon. */
router.get('/low-stock', validate(rangeSchema, 'query'), scopeStore({ required: false }), wrap(async (req, res) => {
  const products = await many(
    `SELECT p.id, p.name, p.size, p.color, p.stock, p.low_stock_at, p.unit,
            p.sell_price, s.name AS store_name, s.currency
       FROM products p JOIN stores s ON s.id = p.store_id
      WHERE p.is_active AND p.stock <= p.low_stock_at
        AND ($1::uuid IS NULL OR p.store_id = $1)
      ORDER BY p.stock ASC, p.name LIMIT 40`,
    [req.storeId]
  );
  res.json({ products });
}));

/** Recent activity feed drawn from the audit log. */
router.get('/activity', validate(rangeSchema, 'query'), scopeStore({ required: false }), wrap(async (req, res) => {
  const events = await many(
    `SELECT a.id, a.action, a.entity, a.meta, a.created_at,
            u.full_name AS user_name, s.name AS store_name
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN stores s ON s.id = a.store_id
      WHERE ($1::uuid IS NULL OR a.store_id = $1)
      ORDER BY a.created_at DESC LIMIT 40`,
    [req.storeId]
  );
  res.json({ events });
}));

module.exports = router;
