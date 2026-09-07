import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { api } from '../../src/api';
import { useAuth } from '../../src/auth';
import { colors, money, prettyDate, radius, spacing, type } from '../../src/theme';
import {
  Screen, Header, Card, Button, Loader, ErrorNote, SectionTitle, Badge, ListRow,
} from '../../src/components/ui';

export default function SaleDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { isAdmin } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sale, setSale] = useState(null);
  const [items, setItems] = useState([]);

  async function load() {
    try {
      const data = await api.get(`/api/sales/${id}`);
      setSale(data.sale);
      setItems(data.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  function refund() {
    Alert.alert('Refund this sale?', 'The pieces go back into stock and the numbers are corrected.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Refund',
        style: 'destructive',
        onPress: async () => {
          try { await api.post(`/api/sales/${id}/refund`, {}); load(); }
          catch (err) { setError(err.message); }
        },
      },
    ]);
  }

  if (loading) return <Loader text="Opening the ticket…" />;
  if (!sale) return (
    <>
      <Header title="Sale" onBack={() => router.back()} />
      <Screen><ErrorNote message={error || 'Not found'} /></Screen>
    </>
  );

  const currency = sale.currency || 'DZD';
  const refunded = sale.status === 'refunded';

  return (
    <>
      <Header title={sale.reference} subtitle={sale.store_name} onBack={() => router.back()} />
      <Screen>
        <ErrorNote message={error} />

        <Card style={[styles.hero, refunded && { backgroundColor: colors.badSoft, borderColor: colors.badSoft }]}>
          <Text style={type.label}>{refunded ? 'Refunded' : 'Collected'}</Text>
          <Text style={[type.hero, { fontSize: 34 }]}>{money(sale.total, currency)}</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Badge text={sale.payment_method} icon="credit-card" />
            <Badge text={prettyDate(sale.created_at)} icon="clock"
              tone={colors.sky} soft={colors.skySoft} />
            {refunded ? <Badge text="Refunded" tone={colors.bad} soft={colors.badSoft} icon="corner-up-left" /> : null}
          </View>
        </Card>

        <Card>
          <SectionTitle icon="list">What was sold</SectionTitle>
          {items.map((i, idx, arr) => (
            <ListRow
              key={i.id}
              title={i.name}
              subtitle={[i.size && `size ${i.size}`, i.color, `${Number(i.qty)} × ${money(i.unit_price, currency)}`]
                .filter(Boolean).join(' · ')}
              icon="tag"
              right={money(i.line_total, currency, { compact: true })}
              last={idx === arr.length - 1}
            />
          ))}
        </Card>

        <Card style={{ gap: 9 }}>
          <Row label="Subtotal" value={money(sale.subtotal, currency)} />
          {Number(sale.discount) > 0 ? <Row label="Discount" value={`− ${money(sale.discount, currency)}`} /> : null}
          <Row label="Cost of goods" value={money(sale.cost_total, currency)} />
          <View style={styles.line} />
          <Row label="Total" value={money(sale.total, currency)} big />
          <Row label="Profit" value={money(sale.profit, currency)} tone={colors.sage} />
        </Card>

        {(sale.customer_name || sale.customer_phone || sale.note) ? (
          <Card>
            <SectionTitle icon="user">Customer</SectionTitle>
            {sale.customer_name ? <ListRow title={sale.customer_name} icon="user" /> : null}
            {sale.customer_phone ? <ListRow title={sale.customer_phone} icon="phone" /> : null}
            {sale.note ? <ListRow title={sale.note} icon="message-square" last /> : null}
          </Card>
        ) : null}

        <Card>
          <ListRow title={sale.seller || 'Staff'} subtitle="Sold by" icon="user-check" last />
        </Card>

        {!refunded ? (
          <Button title="Refund this sale" icon="corner-up-left" variant="danger" onPress={refund} />
        ) : null}
      </Screen>
    </>
  );
}

function Row({ label, value, big, tone }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={big ? type.section : type.label}>{label}</Text>
      <Text style={[
        big ? [type.number, { fontSize: 21 }] : type.bodyStrong,
        tone && { color: tone },
      ]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.primarySoft, borderColor: colors.primarySoft,
    alignItems: 'center', gap: 7, paddingVertical: spacing.lg,
  },
  line: { height: 1, backgroundColor: colors.lineSoft, marginVertical: 3 },
});
