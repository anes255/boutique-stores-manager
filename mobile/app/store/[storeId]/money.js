import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { api } from '../../../src/api';
import { useData } from '../../../src/hooks';
import { colors, compact, money, prettyDate, spacing, type } from '../../../src/theme';
import {
  Screen, Header, Card, SectionTitle, Segmented, StatTile, Loader,
  ErrorNote, EmptyState, ListRow, Badge, Button, Feather,
} from '../../../src/components/ui';
import { DonutChart } from '../../../src/charts';

const TABS = [
  { label: 'Sales', value: 'sales' },
  { label: 'Restocks', value: 'purchases' },
  { label: 'Expenses', value: 'expenses' },
];

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

  const currency = data.store?.store?.currency || 'DZD';
  const o = data.overview;

  function refund(sale) {
    Alert.alert('Refund this sale?', `${sale.reference} · ${money(sale.total, currency)}. The pieces go back into stock.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Refund',
        style: 'destructive',
        onPress: async () => {
          try { await api.post(`/api/sales/${sale.id}/refund`, {}); reload(); }
          catch (err) { setError(err.message); }
        },
      },
    ]);
  }

  function removeExpense(expense) {
    Alert.alert('Delete this expense?', expense.label, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try { await api.del(`/api/expenses/${expense.id}`); reload(); }
          catch (err) { setError(err.message); }
        },
      },
    ]);
  }

  if (loading && !o) return <Loader text="Opening the books…" />;

  return (
    <>
      <Header title="Money" subtitle={data.store?.store?.name} />
      <Screen refreshing={refreshing} onRefresh={reload}>
        <ErrorNote message={error} onRetry={reload} />

        <View style={styles.tiles}>
          <StatTile label="Revenue (30d)" icon="trending-up" tone={colors.primary} soft={colors.primarySoft}
            value={money(o?.sales?.month_revenue, currency, { compact: true })} />
          <StatTile label="Profit (30d)" icon="award" tone={colors.sage} soft={colors.sageSoft}
            value={money(o?.sales?.month_gross_profit, currency, { compact: true })} />
          <StatTile label="Restocking" icon="truck" tone={colors.sky} soft={colors.skySoft}
            value={money(o?.purchases?.month_spend, currency, { compact: true })} />
          <StatTile label="Expenses" icon="credit-card" tone={colors.rose} soft={colors.roseSoft}
            value={money(o?.expenses?.month_expenses, currency, { compact: true })} />
        </View>

        {(data.expenses?.byCategory || []).length ? (
          <Card>
            <Text style={[type.section, { marginBottom: 10 }]}>Where the money goes</Text>
            <DonutChart
              size={144}
              thickness={22}
              data={(data.expenses.byCategory || []).map((c) => ({
                label: cap(c.category), value: Number(c.total),
              }))}
              centerLabel="this month"
            />
          </Card>
        ) : null}

        <Segmented options={TABS} value={tab} onChange={setTab} />

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="Restock" icon="truck" variant="white" small style={{ flex: 1 }}
            onPress={() => router.push({ pathname: '/modal/purchase', params: { storeId } })} />
          <Button title="Add expense" icon="plus" variant="soft" small style={{ flex: 1 }}
            onPress={() => router.push({ pathname: '/modal/expense-form', params: { storeId } })} />
        </View>

        {tab === 'sales' ? (
          <Card>
            <SectionTitle icon="shopping-cart">Sales</SectionTitle>
            {(data.sales?.sales || []).length === 0 ? (
              <EmptyState icon="shopping-cart" title="No sales recorded"
                text="Sales you ring up in the Sell tab land here." />
            ) : (data.sales.sales || []).map((s, i, arr) => (
              <ListRow
                key={s.id}
                title={`${s.reference}${s.status === 'refunded' ? ' · refunded' : ''}`}
                subtitle={`${s.item_count} items · ${s.seller || 'Staff'} · ${prettyDate(s.created_at)}`}
                icon={s.status === 'refunded' ? 'corner-up-left' : 'shopping-cart'}
                iconTone={s.status === 'refunded' ? colors.bad : colors.primary}
                iconSoft={s.status === 'refunded' ? colors.badSoft : colors.primarySoft}
                right={money(s.total, currency, { compact: true })}
                rightSub={`profit ${compact(s.profit)}`}
                onPress={() => router.push({ pathname: '/modal/sale-detail', params: { id: s.id } })}
                last={i === arr.length - 1}
              />
            ))}
          </Card>
        ) : null}

        {tab === 'purchases' ? (
          <Card>
            <SectionTitle icon="truck">Stock you bought</SectionTitle>
            {(data.purchases?.purchases || []).length === 0 ? (
              <EmptyState icon="truck" title="No restocks yet"
                text="Record what you buy from suppliers so your costs and margins stay honest."
                actionLabel="Record a restock"
                onAction={() => router.push({ pathname: '/modal/purchase', params: { storeId } })} />
            ) : (data.purchases.purchases || []).map((p, i, arr) => (
              <ListRow
                key={p.id}
                title={p.supplier || p.reference}
                subtitle={`${p.item_count} lines · ${prettyDate(p.created_at)}`}
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
            <SectionTitle icon="credit-card">Expenses & losses</SectionTitle>
            {(data.expenses?.expenses || []).length === 0 ? (
              <EmptyState icon="credit-card" title="Nothing recorded"
                text="Rent, electricity, bags, damaged pieces — keep them here to see the real profit."
                actionLabel="Add an expense"
                onAction={() => router.push({ pathname: '/modal/expense-form', params: { storeId } })} />
            ) : (data.expenses.expenses || []).map((e, i, arr) => (
              <ListRow
                key={e.id}
                title={e.label}
                subtitle={`${cap(e.category)} · ${new Date(e.spent_at).toLocaleDateString()}`}
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

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function expenseIcon(category) {
  return {
    rent: 'home', salary: 'users', utilities: 'zap', supplies: 'box',
    marketing: 'speaker', transport: 'truck', loss: 'alert-octagon', tax: 'file-text',
  }[category] || 'credit-card';
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
