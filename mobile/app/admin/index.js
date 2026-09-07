import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '../../src/auth';
import { useData } from '../../src/hooks';
import { colors, dayLabel, font, money, prettyDate, radius, spacing, type, compact } from '../../src/theme';
import {
  Screen, Header, Card, SectionTitle, StatTile, Button, Segmented, Loader,
  ErrorNote, EmptyState, ListRow, Badge, Progress, Feather,
} from '../../src/components/ui';
import { TrendChart, DonutChart, RankBars, Gauge, Sparkline } from '../../src/charts';

const RANGES = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
];

export default function AdminOverview() {
  const router = useRouter();
  const { user } = useAuth();
  const [days, setDays] = useState(30);

  const { data, loading, refreshing, error, reload } = useData({
    overview: ['/api/stats/overview', { days }],
    series: ['/api/stats/series', { days }],
    stores: ['/api/stats/stores', { days }],
    categories: ['/api/stats/categories', { days }],
    top: ['/api/stats/top-products', { days, limit: 5 }],
    low: ['/api/stats/low-stock', {}],
    activity: ['/api/stats/activity', {}],
  }, [days]);

  const o = data.overview;
  const currency = 'DZD';

  const chartData = useMemo(
    () => (data.series?.series || []).map((r) => ({
      label: dayLabel(r.day),
      revenue: Number(r.revenue),
      profit: Number(r.profit),
      spend: Number(r.expenses) + Number(r.purchases),
    })),
    [data.series]
  );

  const storeRows = data.stores?.stores || [];

  if (loading && !o) return <Loader text="Opening your business…" />;

  return (
    <>
      <Header
        title={greeting(user?.full_name)}
        subtitle="All stores"
        right={
          <Pressable style={styles.avatar} onPress={() => router.push('/admin/settings')}>
            <Text style={styles.avatarText}>{initials(user?.full_name)}</Text>
          </Pressable>
        }
      />
      <Screen refreshing={refreshing} onRefresh={reload}>
        <ErrorNote message={error} onRetry={reload} />

        {/* ---------------------------------------------- today headline */}
        <Card style={styles.today}>
          <View style={styles.todayTop}>
            <View style={{ flex: 1 }}>
              <Text style={[type.label, { color: colors.primaryDark }]}>Sold today</Text>
              <Text style={[type.hero, { fontSize: 34 }]}>
                {money(o?.sales?.today_revenue, currency, { compact: true })}
              </Text>
              <Text style={type.tiny}>
                {Number(o?.sales?.today_count || 0)} sales · profit{' '}
                {money(o?.sales?.today_profit, currency, { compact: true })}
              </Text>
            </View>
            <Gauge
              value={o?.computed?.target_pct ?? 0}
              size={128}
              label="of target"
              color={colors.primary}
            />
          </View>
          <View style={styles.todayFoot}>
            <Foot icon="shopping-cart" label="Bought today"
              value={money(o?.purchases?.today_spend, currency, { compact: true })} />
            <Foot icon="credit-card" label="Spent today"
              value={money(o?.expenses?.today_expenses, currency, { compact: true })} />
            <Foot icon="calendar" label="This week"
              value={money(o?.sales?.week_revenue, currency, { compact: true })} />
          </View>
        </Card>

        {/* ---------------------------------------------- month tiles */}
        <SectionTitle icon="pie-chart">This month</SectionTitle>
        <View style={styles.tiles}>
          <StatTile label="Revenue" icon="trending-up" tone={colors.primary} soft={colors.primarySoft}
            value={money(o?.sales?.month_revenue, currency, { compact: true })}
            trend={o?.computed?.month_growth_pct} sub="vs last month" />
          <StatTile label="Gross profit" icon="award" tone={colors.sage} soft={colors.sageSoft}
            value={money(o?.sales?.month_gross_profit, currency, { compact: true })}
            sub={`${o?.computed?.margin_pct ?? 0}% margin`} />
          <StatTile label="Net after costs" icon="dollar-sign" tone={colors.lilac} soft={colors.lilacSoft}
            value={money(o?.computed?.month_net_profit, currency, { compact: true })}
            sub="profit − expenses" />
          <StatTile label="Expenses" icon="arrow-down-circle" tone={colors.rose} soft={colors.roseSoft}
            value={money(o?.expenses?.month_expenses, currency, { compact: true })}
            sub={`payroll ${compact(o?.team?.monthly_payroll)}`} />
          <StatTile label="Stock value" icon="package" tone={colors.sky} soft={colors.skySoft}
            value={money(o?.inventory?.stock_cost_value, currency, { compact: true })}
            sub={`${Number(o?.inventory?.units || 0)} pieces`} />
          <StatTile label="Average basket" icon="shopping-bag" tone={colors.honey} soft={colors.honeySoft}
            value={money(o?.computed?.avg_basket, currency, { compact: true })}
            sub={`${Number(o?.sales?.month_count || 0)} tickets`} />
        </View>

        {/* ---------------------------------------------- trend */}
        <Card>
          <View style={styles.cardHead}>
            <Text style={type.section}>Money in & out</Text>
            <Segmented options={RANGES} value={days} onChange={setDays} />
          </View>
          <TrendChart
            data={chartData}
            height={210}
            lines={[
              { key: 'revenue', color: colors.primary, label: 'Revenue' },
              { key: 'profit', color: colors.sage, label: 'Profit' },
              { key: 'spend', color: colors.rose, label: 'Spending' },
            ]}
          />
        </Card>

        {/* ---------------------------------------------- store league */}
        <SectionTitle icon="shopping-bag" action="See all" onAction={() => router.push('/admin/stores')}>
          Store by store
        </SectionTitle>
        {storeRows.length === 0 ? (
          <Card>
            <EmptyState
              icon="plus-circle"
              title="No stores yet"
              text="Create your first store, then hand its login to the person who runs it."
              actionLabel="Create a store"
              onAction={() => router.push('/modal/store-form')}
            />
          </Card>
        ) : (
          <Card>
            <RankBars
              data={storeRows.slice(0, 6).map((s) => ({
                label: s.name,
                value: Number(s.revenue),
                color: s.color,
                sub: `${Number(s.orders)} sales · profit ${money(s.profit, s.currency, { compact: true })}`,
              }))}
              formatValue={(v) => money(v, currency, { compact: true })}
            />
          </Card>
        )}

        {/* ---------------------------------------------- what sells */}
        <View style={styles.pair}>
          <Card style={{ flex: 1 }}>
            <Text style={[type.section, { marginBottom: 10 }]}>Categories</Text>
            <DonutChart
              size={140}
              thickness={22}
              data={(data.categories?.categories || []).map((c) => ({ label: c.name, value: Number(c.revenue) }))}
              centerLabel="revenue"
              formatValue={(v) => compact(v)}
            />
          </Card>
        </View>

        <Card>
          <Text style={[type.section, { marginBottom: 12 }]}>Best sellers</Text>
          <RankBars
            data={(data.top?.products || []).map((p) => ({
              label: p.name,
              value: Number(p.revenue),
              sub: `${Number(p.units)} pieces · profit ${compact(p.profit)}`,
            }))}
            color={colors.lilac}
            formatValue={(v) => money(v, currency, { compact: true })}
          />
        </Card>

        {/* ---------------------------------------------- attention */}
        {(data.low?.products || []).length > 0 ? (
          <Card>
            <SectionTitle icon="alert-triangle">Needs restocking</SectionTitle>
            {(data.low.products || []).slice(0, 6).map((p, i, arr) => (
              <ListRow
                key={p.id}
                title={p.name}
                subtitle={`${p.store_name}${p.size ? ` · size ${p.size}` : ''}`}
                icon="package"
                iconTone={colors.warn}
                iconSoft={colors.warnSoft}
                right={<Badge text={`${Number(p.stock)} left`} tone={colors.warn} soft={colors.warnSoft} />}
                last={i === Math.min(arr.length, 6) - 1}
              />
            ))}
          </Card>
        ) : null}

        {/* ---------------------------------------------- activity */}
        <Card>
          <SectionTitle icon="activity">Latest activity</SectionTitle>
          {(data.activity?.events || []).slice(0, 8).map((e, i, arr) => (
            <ListRow
              key={e.id}
              title={humanAction(e)}
              subtitle={`${e.user_name || 'System'}${e.store_name ? ` · ${e.store_name}` : ''}`}
              icon={actionIcon(e.action)}
              iconTone={colors.sky}
              iconSoft={colors.skySoft}
              rightSub={prettyDate(e.created_at)}
              right={<View />}
              last={i === Math.min(arr.length, 8) - 1}
            />
          ))}
          {(data.activity?.events || []).length === 0 ? (
            <EmptyState icon="clock" title="Nothing yet" text="Actions across your stores will show up here." />
          ) : null}
        </Card>

        <Button title="Add a new store" icon="plus" variant="soft"
          onPress={() => router.push('/modal/store-form')} />
      </Screen>
    </>
  );
}

function Foot({ icon, label, value }) {
  return (
    <View style={styles.foot}>
      <Feather name={icon} size={13} color={colors.inkMuted} />
      <View>
        <Text style={type.tiny}>{label}</Text>
        <Text style={[type.bodyStrong, { fontSize: 14 }]}>{value}</Text>
      </View>
    </View>
  );
}

function greeting(name) {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const first = (name || '').split(' ')[0];
  return first ? `${part}, ${first}` : part;
}

function initials(name) {
  return (name || 'B').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

function humanAction(e) {
  const map = {
    'sale.create': `Sale of ${compact(e.meta?.total)} recorded`,
    'sale.refund': 'A sale was refunded',
    'product.create': `Added "${e.meta?.name || 'a product'}"`,
    'product.update': 'Updated a product',
    'product.delete': `Removed "${e.meta?.name || 'a product'}"`,
    'product.stock': 'Stock adjusted',
    'purchase.create': `Restocked for ${compact(e.meta?.total)}`,
    'expense.create': `Expense: ${e.meta?.category || 'other'}`,
    'store.create': `Store "${e.meta?.name}" created`,
    'store.account_created': `Login created for ${e.meta?.email}`,
    'store.password_reset': 'Password reset',
    'employee.create': `Hired ${e.meta?.name}`,
    'employee.salary_paid': `Salary paid (${e.meta?.period})`,
    'auth.login': 'Signed in',
  };
  return map[e.action] || e.action.replace(/[._]/g, ' ');
}

function actionIcon(action) {
  if (action.startsWith('sale')) return 'shopping-cart';
  if (action.startsWith('product')) return 'tag';
  if (action.startsWith('purchase')) return 'truck';
  if (action.startsWith('expense')) return 'credit-card';
  if (action.startsWith('employee')) return 'user';
  if (action.startsWith('store')) return 'shopping-bag';
  return 'activity';
}

const styles = StyleSheet.create({
  avatar: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: font.bodyBlack, color: colors.white, fontSize: 15 },
  today: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft, gap: spacing.md },
  todayTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  todayFoot: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 8,
    backgroundColor: colors.white, borderRadius: radius.md, padding: 12,
  },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cardHead: { gap: 12, marginBottom: 6 },
  pair: { flexDirection: 'row', gap: spacing.md },
});
