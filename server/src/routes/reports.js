const express = require('express');
const { z } = require('zod');
const { many, query } = require('../lib/db');
const { wrap } = require('../lib/errors');
const { validate } = require('../lib/validate');
const { authenticate, scopeStore } = require('../middleware/auth');
const { reportLimiter } = require('../middleware/limits');
const { TZ, periodFields, resolvePeriod, round2 } = require('../lib/time');

/**
 * أرقام يوم أو فترة: المبيعات، المصاريف، والأرباح.
 * الربح من البيع = سعر البيع − سعر الشراء. الصافي = الربح من البيع − المصاريف.
 * المستخدم الفرعي لا يرى أسعار الشراء، فلا يرى الربح.
 */
const router = express.Router();
router.use(authenticate);

router.get('/summary', reportLimiter,
  validate(z.object({ store_id: z.string().uuid().optional(), ...periodFields }), 'query'),
  scopeStore({ required: false }), wrap(async (req, res) => {
    const { from, to } = resolvePeriod(req.validatedQuery);
    const owner = req.user.role === 'admin';

    const branches = await many(
      `WITH br AS (
         SELECT id, name, created_at FROM stores WHERE owner_id = $1 AND ($2::uuid IS NULL OR id = $2)
       ), sa AS (
         SELECT s.store_id, sum(i.line_total) AS total, sum(i.unit_cost * i.qty) AS cost,
                sum(i.qty) AS pieces, count(i.id) AS n
           FROM sales s JOIN sale_items i ON i.sale_id = s.id
          WHERE s.store_id IN (SELECT id FROM br) AND s.status = 'completed'
            AND (s.created_at AT TIME ZONE $3)::date BETWEEN $4::date AND $5::date
          GROUP BY s.store_id
       ), ex AS (
         SELECT store_id, sum(amount) AS total FROM expenses
          WHERE store_id IN (SELECT id FROM br) AND spent_at BETWEEN $4::date AND $5::date
          GROUP BY store_id
       )
       SELECT br.id, br.name,
              COALESCE(sa.total, 0) AS sales_total, COALESCE(sa.cost, 0) AS cost_total,
              COALESCE(sa.pieces, 0) AS pieces, COALESCE(sa.n, 0)::int AS sales_count,
              COALESCE(ex.total, 0) AS expenses_total
         FROM br LEFT JOIN sa ON sa.store_id = br.id LEFT JOIN ex ON ex.store_id = br.id
        ORDER BY br.created_at`,
      [req.ownerId, req.storeId, TZ, from, to]
    );

    const shape = (r) => {
      const sales = Number(r.sales_total);
      const cost = Number(r.cost_total);
      const expenses = Number(r.expenses_total);
      const base = {
        sales_total: round2(sales), sales_count: Number(r.sales_count), pieces: Number(r.pieces),
        expenses_total: round2(expenses),
      };
      if (!owner) return base;
      const gross = round2(sales - cost);
      return { ...base, cost_total: round2(cost), gross_profit: gross, net: round2(gross - expenses) };
    };

    const sum = branches.reduce((a, r) => ({
      sales_total: a.sales_total + Number(r.sales_total),
      cost_total: a.cost_total + Number(r.cost_total),
      expenses_total: a.expenses_total + Number(r.expenses_total),
      sales_count: a.sales_count + Number(r.sales_count),
      pieces: a.pieces + Number(r.pieces),
    }), { sales_total: 0, cost_total: 0, expenses_total: 0, sales_count: 0, pieces: 0 });

    const out = { from, to, totals: shape(sum) };
    if (owner && !req.storeId) out.branches = branches.map((r) => ({ id: r.id, name: r.name, ...shape(r) }));
    if (req.storeId) {
      const { rows: [t] } = await query(
        `SELECT COALESCE(sum(CASE WHEN kind = 'in' THEN amount ELSE -amount END), 0) AS balance
           FROM cash_moves WHERE store_id = $1`,
        [req.storeId]
      );
      out.cash_balance = round2(t.balance);
    }
    res.json(out);
  }));

module.exports = router;
