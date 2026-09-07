import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '../../src/auth';
import { useData } from '../../src/hooks';
import { colors, compact, dayLabel, font, money, prettyDate, radius, row, spacing, type } from '../../src/theme';
import {
  Screen, Header, Card, SectionTitle, StatTile, Button, Segmented, Loader,
  ErrorNote, EmptyState, ListRow, Badge, Feather,
} from '../../src/components/ui';
import { TrendChart, DonutChart, RankBars, Gauge } from '../../src/charts';

const RANGES = [
  { label: '7 أيام', value: 7 },
  { label: '30 يوم', value: 30 },
  { label: '90 يوم', value: 90 },
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

  if (loading && !o) return <Loader text="جاري فتح أعمالك…" />;

  return (
    <>
      <Header
        title={greeting(user?.full_name)}
        subtitle="كل المحلات"
        right={
          <Pressable style={styles.avatar} onPress={() => router.push('/admin/settings')}>
            <Text style={styles.avatarText}>{initials(user?.full_name)}</Text>
          </Pressable>
        }
      />
      <Screen refreshing={refreshing} onRefresh={reload}>
        <ErrorNote message={error} onRetry={reload} />

        {/* ---------------------------------------------- عنوان اليوم */}
        <Card style={styles.today}>
          <View style={styles.todayTop}>
            <View style={{ flex: 1 }}>
              <Text style={[type.label, { color: colors.primaryDark }]}>مبيعات اليوم</Text>
              <Text style={[type.hero, { fontSize: 30 }]}>
                {money(o?.sales?.today_revenue, undefined, { compact: true })}
              </Text>
              <Text style={type.tiny}>
                {Number(o?.sales?.today_count || 0)} عملية · الربح{' '}
                {money(o?.sales?.today_profit, undefined, { compact: true })}
              </Text>
            </View>
            <Gauge
              value={o?.computed?.target_pct ?? 0}
              size={122}
              label="من الهدف"
              color={colors.primary}
            />
          </View>
          <View style={styles.todayFoot}>
            <Foot icon="shopping-cart" label="مشتريات اليوم"
              value={money(o?.purchases?.today_spend, undefined, { compact: true })} />
            <Foot icon="credit-card" label="مصاريف اليوم"
              value={money(o?.expenses?.today_expenses, undefined, { compact: true })} />
            <Foot icon="calendar" label="هذا الأسبوع"
              value={money(o?.sales?.week_revenue, undefined, { compact: true })} />
          </View>
        </Card>

        {/* ---------------------------------------------- بطاقات الشهر */}
        <SectionTitle icon="pie-chart">هذا الشهر</SectionTitle>
        <View style={styles.tiles}>
          <StatTile label="رقم الأعمال" icon="trending-up" tone={colors.primary} soft={colors.primarySoft}
            value={money(o?.sales?.month_revenue, undefined, { compact: true })}
            trend={o?.computed?.month_growth_pct} sub="مقارنة بالشهر الماضي" />
          <StatTile label="الربح الإجمالي" icon="award" tone={colors.sage} soft={colors.sageSoft}
            value={money(o?.sales?.month_gross_profit, undefined, { compact: true })}
            sub={`هامش ${o?.computed?.margin_pct ?? 0}%`} />
          <StatTile label="الربح الصافي" icon="dollar-sign" tone={colors.lilac} soft={colors.lilacSoft}
            value={money(o?.computed?.month_net_profit, undefined, { compact: true })}
            sub="بعد خصم المصاريف" />
          <StatTile label="المصاريف" icon="arrow-down-circle" tone={colors.rose} soft={colors.roseSoft}
            value={money(o?.expenses?.month_expenses, undefined, { compact: true })}
            sub={`الأجور ${compact(o?.team?.monthly_payroll)}`} />
          <StatTile label="قيمة المخزون" icon="package" tone={colors.sky} soft={colors.skySoft}
            value={money(o?.inventory?.stock_cost_value, undefined, { compact: true })}
            sub={`${Number(o?.inventory?.units || 0)} قطعة`} />
          <StatTile label="معدل السلة" icon="shopping-bag" tone={colors.honey} soft={colors.honeySoft}
            value={money(o?.computed?.avg_basket, undefined, { compact: true })}
            sub={`${Number(o?.sales?.month_count || 0)} عملية`} />
        </View>

        {/* ---------------------------------------------- المنحنى */}
        <Card>
          <View style={styles.cardHead}>
            <Text style={type.section}>الداخل والخارج</Text>
            <Segmented options={RANGES} value={days} onChange={setDays} />
          </View>
          <TrendChart
            data={chartData}
            height={210}
            lines={[
              { key: 'revenue', color: colors.primary, label: 'المبيعات' },
              { key: 'profit', color: colors.sage, label: 'الربح' },
              { key: 'spend', color: colors.rose, label: 'المصاريف' },
            ]}
          />
        </Card>

        {/* ---------------------------------------------- ترتيب المحلات */}
        <SectionTitle icon="shopping-bag" action="عرض الكل" onAction={() => router.push('/admin/stores')}>
          محل بمحل
        </SectionTitle>
        {storeRows.length === 0 ? (
          <Card>
            <EmptyState
              icon="plus-circle"
              title="لا توجد محلات بعد"
              text="أنشئ أول محل، ثم سلّم بيانات الدخول للشخص الذي يديره."
              actionLabel="إنشاء محل"
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
                sub: `${Number(s.orders)} عملية · ربح ${money(s.profit, s.currency, { compact: true })}`,
              }))}
              formatValue={(v) => money(v, undefined, { compact: true })}
            />
          </Card>
        )}

        {/* ---------------------------------------------- ماذا يُباع */}
        <Card>
          <Text style={[type.section, { marginBottom: 10 }]}>الأصناف</Text>
          <DonutChart
            size={140}
            thickness={22}
            data={(data.categories?.categories || []).map((c) => ({ label: c.name, value: Number(c.revenue) }))}
            centerLabel="المبيعات"
            formatValue={(v) => compact(v)}
          />
        </Card>

        <Card>
          <Text style={[type.section, { marginBottom: 12 }]}>الأكثر مبيعا</Text>
          <RankBars
            data={(data.top?.products || []).map((p) => ({
              label: p.name,
              value: Number(p.revenue),
              sub: `${Number(p.units)} قطعة · ربح ${compact(p.profit)}`,
            }))}
            color={colors.lilac}
            formatValue={(v) => money(v, undefined, { compact: true })}
          />
        </Card>

        {/* ---------------------------------------------- تنبيهات */}
        {(data.low?.products || []).length > 0 ? (
          <Card>
            <SectionTitle icon="alert-triangle">يحتاج إعادة تموين</SectionTitle>
            {(data.low.products || []).slice(0, 6).map((p, i, arr) => (
              <ListRow
                key={p.id}
                title={p.name}
                subtitle={`${p.store_name}${p.size ? ` · مقاس ${p.size}` : ''}`}
                icon="package"
                iconTone={colors.warn}
                iconSoft={colors.warnSoft}
                right={<Badge text={`بقي ${Number(p.stock)}`} tone={colors.warn} soft={colors.warnSoft} />}
                last={i === Math.min(arr.length, 6) - 1}
              />
            ))}
          </Card>
        ) : null}

        {/* ---------------------------------------------- آخر النشاطات */}
        <Card>
          <SectionTitle icon="activity">آخر النشاطات</SectionTitle>
          {(data.activity?.events || []).slice(0, 8).map((e, i, arr) => (
            <ListRow
              key={e.id}
              title={humanAction(e)}
              subtitle={`${e.user_name || 'النظام'}${e.store_name ? ` · ${e.store_name}` : ''}`}
              icon={actionIcon(e.action)}
              iconTone={colors.sky}
              iconSoft={colors.skySoft}
              rightSub={prettyDate(e.created_at)}
              right={<View />}
              last={i === Math.min(arr.length, 8) - 1}
            />
          ))}
          {(data.activity?.events || []).length === 0 ? (
            <EmptyState icon="clock" title="لا شيء بعد" text="كل ما يحدث في محلاتك سيظهر هنا." />
          ) : null}
        </Card>

        <Button title="إضافة محل جديد" icon="plus" variant="soft"
          onPress={() => router.push('/modal/store-form')} />
      </Screen>
    </>
  );
}

function Foot({ icon, label, value }) {
  return (
    <View style={styles.foot}>
      <Feather name={icon} size={13} color={colors.inkMuted} />
      <View style={{ flex: 1 }}>
        <Text style={[type.tiny, { lineHeight: 15 }]} numberOfLines={2}>{label}</Text>
        <Text style={[type.bodyStrong, { fontSize: 13.5 }]} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

function greeting(name) {
  const h = new Date().getHours();
  const part = h < 12 ? 'صباح الخير' : h < 18 ? 'مساء الخير' : 'مساء الخير';
  const first = (name || '').split(' ')[0];
  return first ? `${part}، ${first}` : part;
}

function initials(name) {
  return (name || 'م').trim().slice(0, 1);
}

function humanAction(e) {
  const map = {
    'sale.create': `عملية بيع بقيمة ${compact(e.meta?.total)}`,
    'sale.refund': 'تم إرجاع عملية بيع',
    'product.create': `أُضيف "${e.meta?.name || 'منتج'}"`,
    'product.update': 'تعديل منتج',
    'product.delete': `حُذف "${e.meta?.name || 'منتج'}"`,
    'product.stock': 'تعديل المخزون',
    'purchase.create': `تموين بقيمة ${compact(e.meta?.total)}`,
    'expense.create': 'مصروف جديد',
    'expense.update': 'تعديل مصروف',
    'expense.delete': 'حذف مصروف',
    'store.create': `أُنشئ محل "${e.meta?.name}"`,
    'store.update': 'تعديل محل',
    'store.delete': 'حذف محل',
    'store.account_created': 'أُنشئ حساب دخول جديد',
    'store.password_reset': 'تغيير كلمة سر حساب',
    'store.account_toggled': 'تفعيل أو تعطيل حساب',
    'store.account_deleted': 'حذف حساب دخول',
    'category.create': `صنف جديد: ${e.meta?.name || ''}`,
    'employee.create': `توظيف ${e.meta?.name || ''}`,
    'employee.update': 'تعديل بيانات موظف',
    'employee.delete': 'حذف موظف',
    'employee.salary_paid': `دفع راتب (${e.meta?.period || ''})`,
    'auth.login': 'تسجيل دخول',
    'auth.password_changed': 'تغيير كلمة السر',
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
  avatarText: { fontFamily: font.bodyBlack, color: colors.white, fontSize: 16, lineHeight: 26 },
  today: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft, gap: spacing.md },
  todayTop: { flexDirection: row, alignItems: 'center', gap: 8 },
  todayFoot: {
    flexDirection: row, justifyContent: 'space-between', gap: 8,
    backgroundColor: colors.white, borderRadius: radius.md, padding: 12,
  },
  foot: { flexDirection: row, alignItems: 'center', gap: 7, flex: 1 },
  tiles: { flexDirection: row, flexWrap: 'wrap', gap: 10 },
  cardHead: { gap: 12, marginBottom: 6 },
});
