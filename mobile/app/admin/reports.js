import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { useData } from '../../src/hooks';
import { colors, compact, dayLabel, money, row, spacing, type } from '../../src/theme';
import {
  Screen, Header, Card, SectionTitle, Segmented, Loader, ErrorNote,
  ListRow, StatTile, Chips,
} from '../../src/components/ui';
import { TrendChart, BarChart, DonutChart, RankBars } from '../../src/charts';

const RANGES = [
  { label: '7 أيام', value: 7 },
  { label: '30 يوم', value: 30 },
  { label: '90 يوم', value: 90 },
  { label: 'سنة', value: 365 },
];

const WEEKDAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const WEEK_ORDER = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

const PAYMENTS = { cash: 'نقدا', card: 'بطاقة', transfer: 'تحويل', other: 'أخرى' };

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
      const key = WEEKDAYS[new Date(r.day).getDay()];
      buckets.set(key, (buckets.get(key) || 0) + Number(r.revenue));
    }
    return WEEK_ORDER.map((label) => ({ label, value: buckets.get(label) || 0 }));
  }, [data.series]);

  const hours = useMemo(
    () => (data.hours?.hours || [])
      .filter((h) => h.hour >= 7 && h.hour <= 23)
      .map((h) => ({ label: `${h.hour}`, value: Number(h.revenue) })),
    [data.hours]
  );

  const storeOptions = [
    { label: 'كل المحلات', value: null },
    ...(data.stores?.stores || []).map((s) => ({ label: s.name, value: s.id })),
  ];

  if (loading && !o) return <Loader text="جاري حساب الأرقام…" />;

  const netMonth = Number(o?.computed?.month_net_profit || 0);

  return (
    <>
      <Header title="التقارير" subtitle="نظرة معمّقة" />
      <Screen refreshing={refreshing} onRefresh={reload}>
        <ErrorNote message={error} onRetry={reload} />

        <Card style={{ gap: 12 }}>
          <Segmented options={RANGES} value={days} onChange={setDays} />
          <Chips options={storeOptions} value={storeId} onChange={setStoreId} />
        </Card>

        <View style={styles.tiles}>
          <StatTile label="المبيعات" icon="trending-up" tone={colors.primary} soft={colors.primarySoft}
            value={money(o?.sales?.all_time_revenue, undefined, { compact: true })} sub="منذ البداية" />
          <StatTile label="الأرباح" icon="award" tone={colors.sage} soft={colors.sageSoft}
            value={money(o?.sales?.all_time_profit, undefined, { compact: true })} sub="منذ البداية" />
          <StatTile label="المشتريات" icon="truck" tone={colors.sky} soft={colors.skySoft}
            value={money(o?.purchases?.all_time_spend, undefined, { compact: true })} sub="تموين البضاعة" />
          <StatTile label="المصاريف" icon="credit-card" tone={colors.rose} soft={colors.roseSoft}
            value={money(o?.expenses?.all_time_expenses, undefined, { compact: true })} sub="منذ البداية" />
        </View>

        <Card>
          <Text style={[type.section, { marginBottom: 8 }]}>المبيعات مقابل الربح</Text>
          <TrendChart
            data={trend}
            height={210}
            lines={[
              { key: 'revenue', color: colors.primary, label: 'المبيعات' },
              { key: 'profit', color: colors.sage, label: 'الربح' },
            ]}
          />
        </Card>

        <Card>
          <Text style={[type.section, { marginBottom: 4 }]}>أفضل أيام الأسبوع</Text>
          <Text style={[type.tiny, { marginBottom: 8 }]}>مجموع المبيعات حسب اليوم خلال الفترة</Text>
          <BarChart data={weekly} height={170} color={colors.lilac} formatValue={(v) => compact(v)} />
        </Card>

        <Card>
          <Text style={[type.section, { marginBottom: 4 }]}>ساعات الذروة</Text>
          <Text style={[type.tiny, { marginBottom: 8 }]}>لتعرف متى تحتاج عمالا أكثر في المحل</Text>
          <BarChart data={hours} height={170} color={colors.honey} formatValue={(v) => compact(v)} />
        </Card>

        <View style={{ gap: spacing.md }}>
          <Card>
            <Text style={[type.section, { marginBottom: 10 }]}>توزيع الأصناف</Text>
            <DonutChart
              size={150}
              data={(data.categories?.categories || []).map((c) => ({ label: c.name, value: Number(c.revenue) }))}
              centerLabel="المبيعات"
            />
          </Card>

          <Card>
            <Text style={[type.section, { marginBottom: 10 }]}>طرق الدفع</Text>
            <DonutChart
              size={150}
              thickness={22}
              data={(data.payments?.methods || []).map((m) => ({
                label: PAYMENTS[m.name] || m.name, value: Number(m.revenue),
              }))}
              centerLabel="المحصّل"
            />
          </Card>
        </View>

        <Card>
          <Text style={[type.section, { marginBottom: 12 }]}>أفضل المنتجات</Text>
          <RankBars
            data={(data.top?.products || []).map((p) => ({
              label: p.name,
              value: Number(p.revenue),
              sub: `${Number(p.units)} قطعة · ربح ${compact(p.profit)}`,
            }))}
            formatValue={(v) => money(v, undefined, { compact: true })}
          />
        </Card>

        <Card>
          <SectionTitle icon="users">من يبيع أكثر</SectionTitle>
          {(data.staff?.staff || []).map((s, i, arr) => (
            <ListRow
              key={s.id}
              title={s.full_name}
              subtitle={`${s.store_name || 'بدون محل'} · ${Number(s.orders)} عملية`}
              icon="user"
              iconTone={colors.sage}
              iconSoft={colors.sageSoft}
              right={money(s.revenue, undefined, { compact: true })}
              rightSub={`ربح ${compact(s.profit)}`}
              last={i === arr.length - 1}
            />
          ))}
        </Card>

        <Card tone={netMonth >= 0 ? colors.goodSoft : colors.badSoft}>
          <View style={{ gap: 6 }}>
            <Text style={[type.label, { color: netMonth >= 0 ? colors.good : colors.bad }]}>
              الحصيلة النهائية لهذا الشهر
            </Text>
            <Text style={[type.hero, { fontSize: 28 }]}>{money(netMonth)}</Text>
            <Text style={type.tiny}>
              الربح الإجمالي {money(o?.sales?.month_gross_profit, undefined, { compact: true })} ناقص المصاريف{' '}
              {money(o?.expenses?.month_expenses, undefined, { compact: true })}
            </Text>
          </View>
        </Card>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: row, flexWrap: 'wrap', gap: 10 },
});
