import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { useData } from '../../src/hooks';
import { colors, compact, dayLabel, money, spacing, type, radius, font } from '../../src/theme';
import {
  Screen, Header, Card, SectionTitle, Segmented, Loader, ErrorNote,
  ListRow, StatTile, Badge, Chips,
} from '../../src/components/ui';
import { TrendChart, BarChart, DonutChart, RankBars } from '../../src/charts';

const RANGES = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
  { label: '1y', value: 365 },
];

export default function Reports() {
  const [days, setDays] = useState(30);
  const [storeId, setStoreId] = useState(null);

  const { data, loading, refreshing, error, reload } = useData({
    stores: ['/api/stores', {}],
    overview: ['/api/stats/overview', { days, store_id: storeId || undefined }],
    series: ['/api/stats/series', { days, store_id: storeId || undefined }],
    hours: ['/api/stats/hours', { days, store_id: storeId || undefined }],
    payments: ['/api/stats/payments', { days, store_id: storeId || undefined }],
    categories: ['/api/stats/categories', { days, store_id: storeId || undefined }],
    top: ['/api/stats/top-products', { days, limit: 8, store_id: storeId || undefined }],
    staff: ['/api/stats/staff', { days, limit: 8, store_id: storeId || undefined }],
  }, [days, storeId]);

  const o = data.overview;
  const currency = 'DZD';

  const trend = useMemo(
    () => (data.series?.series || []).map((r) => ({
      label: dayLabel(r.day),
      revenue: Number(r.revenue),
      profit: Number(r.profit),
    })),
    [data.series]
  );

  const weekly = useMemo(() => {
    const rows = data.series?.series || [];
    const buckets = new Map();
    for (const r of rows) {
      const d = new Date(r.day);
      const key = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
      buckets.set(key, (buckets.get(key) || 0) + Number(r.revenue));
    }
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      .map((label) => ({ label, value: buckets.get(label) || 0 }));
  }, [data.series]);

  const hours = useMemo(
    () => (data.hours?.hours || [])
      .filter((h) => h.hour >= 7 && h.hour <= 23)
      .map((h) => ({ label: `${h.hour}`, value: Number(h.revenue) })),
    [data.hours]
  );

  const storeOptions = [
    { label: 'All stores', value: null },
    ...(data.stores?.stores || []).map((s) => ({ label: s.name, value: s.id })),
  ];

  if (loading && !o) return <Loader text="Crunching the numbers…" />;

  const netMonth = Number(o?.computed?.month_net_profit || 0);

  return (
    <>
      <Header title="Reports" subtitle="Deep dive" />
      <Screen refreshing={refreshing} onRefresh={reload}>
        <ErrorNote message={error} onRetry={reload} />

        <Card style={{ gap: 12 }}>
          <Segmented options={RANGES} value={days} onChange={setDays} />
          <Chips options={storeOptions} value={storeId} onChange={setStoreId} />
        </Card>

        <View style={styles.tiles}>
          <StatTile label="Revenue" icon="trending-up" tone={colors.primary} soft={colors.primarySoft}
            value={money(o?.sales?.all_time_revenue, currency, { compact: true })} sub="all time" />
          <StatTile label="Profit" icon="award" tone={colors.sage} soft={colors.sageSoft}
            value={money(o?.sales?.all_time_profit, currency, { compact: true })} sub="all time" />
          <StatTile label="Purchases" icon="truck" tone={colors.sky} soft={colors.skySoft}
            value={money(o?.purchases?.all_time_spend, currency, { compact: true })} sub="stock bought" />
          <StatTile label="Expenses" icon="credit-card" tone={colors.rose} soft={colors.roseSoft}
            value={money(o?.expenses?.all_time_expenses, currency, { compact: true })} sub="all time" />
        </View>

        <Card>
          <Text style={[type.section, { marginBottom: 8 }]}>Revenue vs profit</Text>
          <TrendChart
            data={trend}
            height={210}
            lines={[
              { key: 'revenue', color: colors.primary, label: 'Revenue' },
              { key: 'profit', color: colors.sage, label: 'Profit' },
            ]}
          />
        </Card>

        <Card>
          <Text style={[type.section, { marginBottom: 4 }]}>Which days sell best</Text>
          <Text style={[type.tiny, { marginBottom: 8 }]}>Total revenue by weekday over the period</Text>
          <BarChart data={weekly} height={170} color={colors.lilac}
            formatValue={(v) => compact(v)} />
        </Card>

        <Card>
          <Text style={[type.section, { marginBottom: 4 }]}>Busiest hours</Text>
          <Text style={[type.tiny, { marginBottom: 8 }]}>Know when to put more people on the floor</Text>
          <BarChart data={hours} height={170} color={colors.honey}
            formatValue={(v) => compact(v)} />
        </Card>

        <View style={{ gap: spacing.md }}>
          <Card>
            <Text style={[type.section, { marginBottom: 10 }]}>Category mix</Text>
            <DonutChart
              size={150}
              data={(data.categories?.categories || []).map((c) => ({ label: c.name, value: Number(c.revenue) }))}
              centerLabel="revenue"
            />
          </Card>

          <Card>
            <Text style={[type.section, { marginBottom: 10 }]}>How people pay</Text>
            <DonutChart
              size={150}
              thickness={22}
              data={(data.payments?.methods || []).map((m) => ({
                label: cap(m.name), value: Number(m.revenue),
              }))}
              centerLabel="collected"
            />
          </Card>
        </View>

        <Card>
          <Text style={[type.section, { marginBottom: 12 }]}>Top products</Text>
          <RankBars
            data={(data.top?.products || []).map((p) => ({
              label: p.name,
              value: Number(p.revenue),
              sub: `${Number(p.units)} sold · ${compact(p.profit)} profit`,
            }))}
            formatValue={(v) => money(v, currency, { compact: true })}
          />
        </Card>

        <Card>
          <SectionTitle icon="users">Who is selling</SectionTitle>
          {(data.staff?.staff || []).map((s, i, arr) => (
            <ListRow
              key={s.id}
              title={s.full_name}
              subtitle={`${s.store_name || 'No store'} · ${Number(s.orders)} sales`}
              icon="user"
              iconTone={colors.sage}
              iconSoft={colors.sageSoft}
              right={money(s.revenue, currency, { compact: true })}
              rightSub={`profit ${compact(s.profit)}`}
              last={i === arr.length - 1}
            />
          ))}
        </Card>

        <Card tone={netMonth >= 0 ? colors.goodSoft : colors.badSoft}>
          <View style={{ gap: 6 }}>
            <Text style={[type.label, { color: netMonth >= 0 ? colors.good : colors.bad }]}>
              Bottom line this month
            </Text>
            <Text style={[type.hero, { fontSize: 30 }]}>{money(netMonth, currency)}</Text>
            <Text style={type.tiny}>
              Gross profit {money(o?.sales?.month_gross_profit, currency, { compact: true })} minus expenses{' '}
              {money(o?.expenses?.month_expenses, currency, { compact: true })}
            </Text>
          </View>
        </Card>
      </Screen>
    </>
  );
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
