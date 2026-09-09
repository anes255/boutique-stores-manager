import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useSyncActiveStore } from '../../../src/active-store';

import { useAuth } from '../../../src/auth';
import { useData } from '../../../src/hooks';
import { colors, compact, dayLabel, font, money, prettyDate, radius, row, spacing, type } from '../../../src/theme';
import {
  Screen, Header, Card, SectionTitle, StatTile, Button, Segmented, Loader,
  ErrorNote, EmptyState, ListRow, Badge, Feather,
} from '../../../src/components/ui';
import { TrendChart, DonutChart, RankBars, Gauge } from '../../../src/charts';

const RANGES = [
  { label: '7 أيام', value: 7 },
  { label: '30 يوم', value: 30 },
  { label: '90 يوم', value: 90 },
];

const PAYMENTS = { cash: 'نقدا', card: 'بطاقة', transfer: 'تحويل', other: 'أخرى' };

export default function StoreHome() {
  const { storeId } = useLocalSearchParams();
  // يبقي "المحل المفتوح" مطابقا لما تراه، فلا تُحفظ الإضافات في محل آخر
  useSyncActiveStore(storeId);
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [days, setDays] = useState(30);

  const { data, loading, refreshing, error, reload } = useData({
    store: [`/api/stores/${storeId}`, {}],
    overview: ['/api/stats/overview', { store_id: storeId, days }],
    series: ['/api/stats/series', { store_id: storeId, days }],
    categories: ['/api/stats/categories', { store_id: storeId, days }],
    top: ['/api/stats/top-products', { store_id: storeId, days, limit: 5 }],
    low: ['/api/stats/low-stock', { store_id: storeId }],
    sales: ['/api/sales', { store_id: storeId, limit: 6 }],
  }, [storeId, days]);

  const store = data.store?.store;
  const o = data.overview;
  const currency = store?.currency;

  const trend = useMemo(
    () => (data.series?.series || []).map((r) => ({
      label: dayLabel(r.day),
      revenue: Number(r.revenue),
      profit: Number(r.profit),
      spend: Number(r.expenses) + Number(r.purchases),
    })),
    [data.series]
  );

  if (loading && !store) return <Loader text="جاري فتح المحل…" />;

  const targetPct = o?.computed?.target_pct;

  return (
    <>
      <Header
        title={store?.name || 'المحل'}
        subtitle={isAdmin ? 'عرض المالك' : `أهلا ${(user?.full_name || '').split(' ')[0]}`}
        onBack={isAdmin ? () => router.push('/admin/stores') : undefined}
        tint={store?.color || colors.primary}
        right={
          isAdmin ? (
            <Pressable style={styles.iconBtn}
              onPress={() => router.push({ pathname: '/modal/store-form', params: { id: storeId } })}>
              <Feather name="settings" size={18} color={colors.ink} />
            </Pressable>
          ) : (
            <Pressable style={styles.iconBtn} onPress={() => router.push('/modal/my-account')}>
              <Feather name="user" size={18} color={colors.ink} />
            </Pressable>
          )
        }
      />
      <Screen refreshing={refreshing} onRefresh={reload}>
        <ErrorNote message={error} onRetry={reload} />

        <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primarySoft, gap: spacing.md }}>
          <View style={{ flexDirection: row, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.label, { color: colors.primaryDark }]}>مبيعات اليوم</Text>
              <Text style={[type.hero, { fontSize: 30 }]}>
                {money(o?.sales?.today_revenue, currency, { compact: true })}
              </Text>
              <Text style={type.tiny}>
                {Number(o?.sales?.today_count || 0)} عملية · الربح {compact(o?.sales?.today_profit)}
              </Text>
            </View>
            {targetPct !== null && targetPct !== undefined ? (
              <Gauge value={targetPct} size={120} label="من الهدف" color={store?.color || colors.primary} />
            ) : null}
          </View>
          <Button title="تسجيل عملية بيع" icon="plus-circle"
            onPress={() => router.push(`/store/${storeId}/sell`)} />
        </Card>

        <View style={styles.tiles}>
          <StatTile label="هذا الشهر" icon="trending-up" tone={colors.primary} soft={colors.primarySoft}
            value={money(o?.sales?.month_revenue, currency, { compact: true })}
            trend={o?.computed?.month_growth_pct} sub="المبيعات" />
          <StatTile label="الربح الإجمالي" icon="award" tone={colors.sage} soft={colors.sageSoft}
            value={money(o?.sales?.month_gross_profit, currency, { compact: true })}
            sub={`هامش ${o?.computed?.margin_pct ?? 0}%`} />
          <StatTile label="المشتريات" icon="truck" tone={colors.sky} soft={colors.skySoft}
            value={money(o?.purchases?.month_spend, currency, { compact: true })} sub="تموين هذا الشهر" />
          <StatTile label="المصاريف" icon="credit-card" tone={colors.rose} soft={colors.roseSoft}
            value={money(o?.expenses?.month_expenses, currency, { compact: true })} sub="هذا الشهر" />
          <StatTile label="الربح الصافي" icon="dollar-sign" tone={colors.lilac} soft={colors.lilacSoft}
            value={money(o?.computed?.month_net_profit, currency, { compact: true })} sub="بعد المصاريف" />
          <StatTile label="قيمة المخزون" icon="package" tone={colors.honey} soft={colors.honeySoft}
            value={money(o?.inventory?.stock_cost_value, currency, { compact: true })}
            sub={`${Number(o?.inventory?.products || 0)} منتج`} />
        </View>

        <Card>
          <View style={{ gap: 12, marginBottom: 6 }}>
            <Text style={type.section}>كيف يسير المحل</Text>
            <Segmented options={RANGES} value={days} onChange={setDays} />
          </View>
          <TrendChart
            data={trend}
            height={205}
            lines={[
              { key: 'revenue', color: store?.color || colors.primary, label: 'المبيعات' },
              { key: 'profit', color: colors.sage, label: 'الربح' },
              { key: 'spend', color: colors.rose, label: 'المصاريف' },
            ]}
          />
        </Card>

        <View style={styles.quickRow}>
          <Quick icon="plus-square" label="منتج جديد" tone={colors.sage} soft={colors.sageSoft}
            onPress={() => router.push({ pathname: '/modal/product-form', params: { storeId } })} />
          <Quick icon="truck" label="تموين" tone={colors.sky} soft={colors.skySoft}
            onPress={() => router.push({ pathname: '/modal/purchase', params: { storeId } })} />
          <Quick icon="credit-card" label="مصروف" tone={colors.rose} soft={colors.roseSoft}
            onPress={() => router.push({ pathname: '/modal/expense-form', params: { storeId } })} />
        </View>

        <Card>
          <SectionTitle icon="clock" action="كل المبيعات"
            onAction={() => router.push(`/store/${storeId}/money`)}>آخر المبيعات</SectionTitle>
          {(data.sales?.sales || []).length === 0 ? (
            <EmptyState icon="shopping-cart" title="لا توجد مبيعات بعد"
              text="سجّل أول عملية بيع وستظهر هنا مباشرة."
              actionLabel="تسجيل عملية بيع" onAction={() => router.push(`/store/${storeId}/sell`)} />
          ) : (data.sales.sales || []).map((s, i, arr) => (
            <ListRow
              key={s.id}
              title={`${s.reference} · ${s.item_count} قطعة`}
              subtitle={`${s.seller || 'موظف'} · ${prettyDate(s.created_at)}`}
              icon={s.status === 'refunded' ? 'corner-up-left' : 'shopping-cart'}
              iconTone={s.status === 'refunded' ? colors.bad : colors.primary}
              iconSoft={s.status === 'refunded' ? colors.badSoft : colors.primarySoft}
              right={money(s.total, currency, { compact: true })}
              rightSub={PAYMENTS[s.payment_method] || s.payment_method}
              onPress={() => router.push({ pathname: '/modal/sale-detail', params: { id: s.id } })}
              last={i === arr.length - 1}
            />
          ))}
        </Card>

        <View style={{ gap: spacing.md }}>
          <Card>
            <Text style={[type.section, { marginBottom: 10 }]}>ماذا يُباع هنا</Text>
            <DonutChart
              size={140}
              thickness={22}
              data={(data.categories?.categories || []).map((c) => ({ label: c.name, value: Number(c.revenue) }))}
              centerLabel="المبيعات"
            />
          </Card>

          <Card>
            <Text style={[type.section, { marginBottom: 12 }]}>الأكثر مبيعا</Text>
            <RankBars
              data={(data.top?.products || []).map((p) => ({
                label: p.name,
                value: Number(p.revenue),
                sub: `${Number(p.units)} قطعة`,
              }))}
              color={colors.lilac}
              formatValue={(v) => money(v, currency, { compact: true })}
            />
          </Card>
        </View>

        {(data.low?.products || []).length > 0 ? (
          <Card>
            <SectionTitle icon="alert-triangle" action="تموين"
              onAction={() => router.push({ pathname: '/modal/purchase', params: { storeId } })}>
              على وشك النفاد
            </SectionTitle>
            {(data.low.products || []).slice(0, 8).map((p, i, arr) => (
              <ListRow
                key={p.id}
                title={p.name}
                subtitle={[p.size && `مقاس ${p.size}`, p.color].filter(Boolean).join(' · ') || 'بدون تفاصيل'}
                icon="package"
                iconTone={Number(p.stock) <= 0 ? colors.bad : colors.warn}
                iconSoft={Number(p.stock) <= 0 ? colors.badSoft : colors.warnSoft}
                right={<Badge text={`بقي ${Number(p.stock)}`}
                  tone={Number(p.stock) <= 0 ? colors.bad : colors.warn}
                  soft={Number(p.stock) <= 0 ? colors.badSoft : colors.warnSoft} />}
                onPress={() => router.push({ pathname: '/modal/product-form', params: { id: p.id, storeId } })}
                last={i === Math.min(arr.length, 8) - 1}
              />
            ))}
          </Card>
        ) : null}
      </Screen>
    </>
  );
}

function Quick({ icon, label, tone, soft, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quick, { backgroundColor: soft }, pressed && { opacity: 0.8 }]}>
      <Feather name={icon} size={19} color={tone} />
      <Text style={[type.tiny, { color: colors.ink, fontFamily: font.bodyBold, textAlign: 'center' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line,
  },
  tiles: { flexDirection: row, flexWrap: 'wrap', gap: 10 },
  quickRow: { flexDirection: row, gap: 10 },
  quick: { flex: 1, alignItems: 'center', gap: 7, paddingVertical: 16, borderRadius: radius.md },
});
