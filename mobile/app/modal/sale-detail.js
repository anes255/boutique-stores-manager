import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { api } from '../../src/api';
import { colors, money, prettyDate, row, spacing, type } from '../../src/theme';
import {
  Screen, Header, Card, Button, Loader, ErrorNote, SectionTitle, Badge, ListRow,
} from '../../src/components/ui';

const PAYMENTS = { cash: 'نقدا', card: 'بطاقة', transfer: 'تحويل', other: 'أخرى' };

export default function SaleDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

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
    Alert.alert('إرجاع هذه العملية؟', 'سترجع القطع إلى المخزون وتُصحَّح الأرقام.', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'إرجاع',
        style: 'destructive',
        onPress: async () => {
          try { await api.post(`/api/sales/${id}/refund`, {}); load(); }
          catch (err) { setError(err.message); }
        },
      },
    ]);
  }

  if (loading) return <Loader text="جاري فتح الفاتورة…" />;
  if (!sale) return (
    <>
      <Header title="عملية بيع" onBack={() => router.back()} />
      <Screen><ErrorNote message={error || 'غير موجودة'} /></Screen>
    </>
  );

  const currency = sale.currency;
  const refunded = sale.status === 'refunded';

  return (
    <>
      <Header title={sale.reference} subtitle={sale.store_name} onBack={() => router.back()} />
      <Screen>
        <ErrorNote message={error} />

        <Card style={[styles.hero, refunded && { backgroundColor: colors.badSoft, borderColor: colors.badSoft }]}>
          <Text style={type.label}>{refunded ? 'مُرجعة' : 'المبلغ المحصّل'}</Text>
          <Text style={[type.hero, { fontSize: 30 }]}>{money(sale.total, currency)}</Text>
          <View style={{ flexDirection: row, gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Badge text={PAYMENTS[sale.payment_method] || sale.payment_method} icon="credit-card" />
            <Badge text={prettyDate(sale.created_at)} icon="clock"
              tone={colors.sky} soft={colors.skySoft} />
            {refunded ? <Badge text="مُرجعة" tone={colors.bad} soft={colors.badSoft} icon="corner-up-left" /> : null}
          </View>
        </Card>

        <Card>
          <SectionTitle icon="list">ماذا بيع</SectionTitle>
          {items.map((i, idx, arr) => (
            <ListRow
              key={i.id}
              title={i.name}
              subtitle={[i.size && `مقاس ${i.size}`, i.color, `${Number(i.qty)} × ${money(i.unit_price, currency)}`]
                .filter(Boolean).join(' · ')}
              icon="tag"
              right={money(i.line_total, currency, { compact: true })}
              last={idx === arr.length - 1}
            />
          ))}
        </Card>

        <Card style={{ gap: 9 }}>
          <Row label="المجموع" value={money(sale.subtotal, currency)} />
          {Number(sale.discount) > 0 ? <Row label="التخفيض" value={`− ${money(sale.discount, currency)}`} /> : null}
          <Row label="تكلفة البضاعة" value={money(sale.cost_total, currency)} />
          <View style={styles.line} />
          <Row label="الإجمالي" value={money(sale.total, currency)} big />
          <Row label="الربح" value={money(sale.profit, currency)} tone={colors.sage} />
        </Card>

        {(sale.customer_name || sale.customer_phone || sale.note) ? (
          <Card>
            <SectionTitle icon="user">الزبون</SectionTitle>
            {sale.customer_name ? <ListRow title={sale.customer_name} icon="user" /> : null}
            {sale.customer_phone ? <ListRow title={sale.customer_phone} icon="phone" /> : null}
            {sale.note ? <ListRow title={sale.note} icon="message-square" last /> : null}
          </Card>
        ) : null}

        <Card>
          <ListRow title={sale.seller || 'موظف'} subtitle="البائع" icon="user-check" last />
        </Card>

        {!refunded ? (
          <Button title="إرجاع هذه العملية" icon="corner-up-left" variant="danger" onPress={refund} />
        ) : null}
      </Screen>
    </>
  );
}

function Row({ label, value, big, tone }) {
  return (
    <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'center' }}>
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
