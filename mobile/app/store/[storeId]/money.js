import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { api } from '../../../src/api';
import { useData } from '../../../src/hooks';
import { colors, compact, money, prettyDate, row, shortDate, type } from '../../../src/theme';
import {
  Screen, Header, Card, SectionTitle, Segmented, StatTile, Loader,
  ErrorNote, EmptyState, ListRow, Button,
} from '../../../src/components/ui';
import { DonutChart } from '../../../src/charts';

const TABS = [
  { label: 'المبيعات', value: 'sales' },
  { label: 'التموين', value: 'purchases' },
  { label: 'المصاريف', value: 'expenses' },
];

export const EXPENSE_LABELS = {
  rent: 'الإيجار', salary: 'الأجور', utilities: 'الفواتير', supplies: 'اللوازم',
  marketing: 'الإشهار', transport: 'النقل', loss: 'تلف أو ضياع', tax: 'الضرائب', other: 'أخرى',
};

export default function Money() {
  const { storeId } = useLocalSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState('sales');
  const [error, setError] = useState(null);

  const { data, loading, refreshing, reload } = useData({
    store: [`/api/stores/${storeId}`, {}],
    overview: ['/api/stats/overview', { store_id: storeId, days: 30 }],
    sales: ['/api/sales', { store_id: storeId, limit: 60 }],
    purchases: ['/api/purchases', { store_id: storeId, limit: 60 }],
    expenses: ['/api/expenses', { store_id: storeId, limit: 60 }],
  }, [storeId]);

  const currency = data.store?.store?.currency;
  const o = data.overview;

  function refund(sale) {
    Alert.alert('إرجاع هذه العملية؟', `${sale.reference} · ${money(sale.total, currency)}. سترجع القطع إلى المخزون.`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'إرجاع',
        style: 'destructive',
        onPress: async () => {
          try { await api.post(`/api/sales/${sale.id}/refund`, {}); reload(); }
          catch (err) { setError(err.message); }
        },
      },
    ]);
  }

  function removeExpense(expense) {
    Alert.alert('حذف هذا المصروف؟', expense.label, [
      { text: 'إبقاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          try { await api.del(`/api/expenses/${expense.id}`); reload(); }
          catch (err) { setError(err.message); }
        },
      },
    ]);
  }

  if (loading && !o) return <Loader text="جاري فتح الدفاتر…" />;

  return (
    <>
      <Header title="المال" subtitle={data.store?.store?.name} />
      <Screen refreshing={refreshing} onRefresh={reload}>
        <ErrorNote message={error} onRetry={reload} />

        <View style={styles.tiles}>
          <StatTile label="المبيعات (30 يوم)" icon="trending-up" tone={colors.primary} soft={colors.primarySoft}
            value={money(o?.sales?.month_revenue, currency, { compact: true })} />
          <StatTile label="الربح (30 يوم)" icon="award" tone={colors.sage} soft={colors.sageSoft}
            value={money(o?.sales?.month_gross_profit, currency, { compact: true })} />
          <StatTile label="التموين" icon="truck" tone={colors.sky} soft={colors.skySoft}
            value={money(o?.purchases?.month_spend, currency, { compact: true })} />
          <StatTile label="المصاريف" icon="credit-card" tone={colors.rose} soft={colors.roseSoft}
            value={money(o?.expenses?.month_expenses, currency, { compact: true })} />
        </View>

        {(data.expenses?.byCategory || []).length ? (
          <Card>
            <Text style={[type.section, { marginBottom: 10 }]}>أين يذهب المال</Text>
            <DonutChart
              size={144}
              thickness={22}
              data={(data.expenses.byCategory || []).map((c) => ({
                label: EXPENSE_LABELS[c.category] || c.category, value: Number(c.total),
              }))}
              centerLabel="هذا الشهر"
            />
          </Card>
        ) : null}

        <Segmented options={TABS} value={tab} onChange={setTab} />

        <View style={{ flexDirection: row, gap: 10 }}>
          <Button title="تموين" icon="truck" variant="white" small style={{ flex: 1 }}
            onPress={() => router.push({ pathname: '/modal/purchase', params: { storeId } })} />
          <Button title="إضافة مصروف" icon="plus" variant="soft" small style={{ flex: 1 }}
            onPress={() => router.push({ pathname: '/modal/expense-form', params: { storeId } })} />
        </View>

        {tab === 'sales' ? (
          <Card>
            <SectionTitle icon="shopping-cart">المبيعات</SectionTitle>
            {(data.sales?.sales || []).length === 0 ? (
              <EmptyState icon="shopping-cart" title="لا توجد مبيعات مسجلة"
                text="كل عملية تسجلها في تبويب البيع تظهر هنا." />
            ) : (data.sales.sales || []).map((s, i, arr) => (
              <ListRow
                key={s.id}
                title={`${s.reference}${s.status === 'refunded' ? ' · مُرجعة' : ''}`}
                subtitle={`${s.item_count} قطعة · ${s.seller || 'موظف'} · ${prettyDate(s.created_at)}`}
                icon={s.status === 'refunded' ? 'corner-up-left' : 'shopping-cart'}
                iconTone={s.status === 'refunded' ? colors.bad : colors.primary}
                iconSoft={s.status === 'refunded' ? colors.badSoft : colors.primarySoft}
                right={money(s.total, currency, { compact: true })}
                rightSub={`ربح ${compact(s.profit)}`}
                onPress={() => router.push({ pathname: '/modal/sale-detail', params: { id: s.id } })}
                last={i === arr.length - 1}
              />
            ))}
          </Card>
        ) : null}

        {tab === 'purchases' ? (
          <Card>
            <SectionTitle icon="truck">البضاعة التي اشتريتها</SectionTitle>
            {(data.purchases?.purchases || []).length === 0 ? (
              <EmptyState icon="truck" title="لا يوجد تموين بعد"
                text="سجّل ما تشتريه من الموردين حتى تبقى تكاليفك وأرباحك دقيقة."
                actionLabel="تسجيل تموين"
                onAction={() => router.push({ pathname: '/modal/purchase', params: { storeId } })} />
            ) : (data.purchases.purchases || []).map((p, i, arr) => (
              <ListRow
                key={p.id}
                title={p.supplier || p.reference}
                subtitle={`${p.item_count} سطر · ${prettyDate(p.created_at)}`}
                icon="truck"
                iconTone={colors.sky}
                iconSoft={colors.skySoft}
                right={money(p.total, currency, { compact: true })}
                last={i === arr.length - 1}
              />
            ))}
          </Card>
        ) : null}

        {tab === 'expenses' ? (
          <Card>
            <SectionTitle icon="credit-card">المصاريف والخسائر</SectionTitle>
            {(data.expenses?.expenses || []).length === 0 ? (
              <EmptyState icon="credit-card" title="لا شيء مسجل"
                text="الإيجار، الكهرباء، الأكياس، القطع التالفة — سجّلها هنا لترى الربح الحقيقي."
                actionLabel="إضافة مصروف"
                onAction={() => router.push({ pathname: '/modal/expense-form', params: { storeId } })} />
            ) : (data.expenses.expenses || []).map((e, i, arr) => (
              <ListRow
                key={e.id}
                title={e.label}
                subtitle={`${EXPENSE_LABELS[e.category] || e.category} · ${shortDate(e.spent_at)}`}
                icon={expenseIcon(e.category)}
                iconTone={colors.rose}
                iconSoft={colors.roseSoft}
                right={money(e.amount, currency, { compact: true })}
                onPress={() => removeExpense(e)}
                last={i === arr.length - 1}
              />
            ))}
          </Card>
        ) : null}
      </Screen>
    </>
  );
}

function expenseIcon(category) {
  return {
    rent: 'home', salary: 'users', utilities: 'zap', supplies: 'box',
    marketing: 'speaker', transport: 'truck', loss: 'alert-octagon', tax: 'file-text',
  }[category] || 'credit-card';
}

const styles = StyleSheet.create({
  tiles: { flexDirection: row, flexWrap: 'wrap', gap: 10 },
});
