import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { useData } from '../../src/hooks';
import { colors, compact, font, money, radius, row, spacing, type } from '../../src/theme';
import {
  Screen, Header, Card, Button, Loader, ErrorNote, EmptyState,
  Badge, Progress, Feather, Segmented, Fab,
} from '../../src/components/ui';

const RANGES = [
  { label: '7 أيام', value: 7 },
  { label: '30 يوم', value: 30 },
  { label: '90 يوم', value: 90 },
];

export default function Stores() {
  const router = useRouter();
  const [days, setDays] = useState(30);

  const { data, loading, refreshing, error, reload } = useData({
    stores: ['/api/stats/stores', { days }],
    list: ['/api/stores', {}],
  }, [days]);

  const stats = data.stores?.stores || [];
  const meta = data.list?.stores || [];
  const byId = Object.fromEntries(meta.map((s) => [s.id, s]));

  if (loading && !stats.length) return <Loader text="جاري تحميل محلاتك…" />;

  const groupRevenue = stats.reduce((s, x) => s + Number(x.revenue || 0), 0);

  return (
    <View style={{ flex: 1 }}>
      <Header title="محلاتك" subtitle={`${stats.length} محل`} />
      <Screen refreshing={refreshing} onRefresh={reload}>
        <ErrorNote message={error} onRetry={reload} />
        <Segmented options={RANGES} value={days} onChange={setDays} />

        {stats.length === 0 ? (
          <Card>
            <EmptyState
              icon="shopping-bag"
              title="لنفتح أول محل"
              text="أعطه اسما ورمزا قصيرا. يمكنك إنشاء حساب الدخول مباشرة بعدها."
              actionLabel="إنشاء محل"
              onAction={() => router.push('/modal/store-form')}
            />
          </Card>
        ) : null}

        {stats.map((s) => {
          const info = byId[s.id] || {};
          const share = groupRevenue > 0 ? (Number(s.revenue) / groupRevenue) * 100 : 0;
          const targetPct = Number(s.monthly_target) > 0
            ? Math.min(100, (Number(info.month_revenue || 0) / Number(s.monthly_target)) * 100) : null;
          return (
            <Card key={s.id} onPress={() => router.push(`/store/${s.id}`)} style={{ gap: 14 }}>
              <View style={styles.head}>
                <View style={[styles.badge, { backgroundColor: s.color + '22' }]}>
                  <Text style={[styles.badgeText, { color: s.color }]}>{initials(s.name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={type.section} numberOfLines={1}>{s.name}</Text>
                  <Text style={type.tiny}>
                    {s.code}{info.city ? ` · ${info.city}` : ''} · {Number(s.headcount)} في الفريق
                  </Text>
                </View>
                {!s.is_active ? <Badge text="مغلق" tone={colors.bad} soft={colors.badSoft} /> : null}
                <Feather name="chevron-left" size={18} color={colors.inkMuted} />
              </View>

              <View style={styles.metrics}>
                <Metric label="المبيعات" value={money(s.revenue, s.currency, { compact: true })} tone={colors.primary} />
                <Metric label="الربح" value={money(s.profit, s.currency, { compact: true })} tone={colors.sage} />
                <Metric label="العمليات" value={String(Number(s.orders))} tone={colors.lilac} />
                <Metric label="المخزون" value={money(s.stock_value, s.currency, { compact: true })} tone={colors.sky} />
              </View>

              {targetPct !== null ? (
                <View style={{ gap: 6 }}>
                  <View style={styles.rowBetween}>
                    <Text style={type.tiny}>الهدف الشهري</Text>
                    <Text style={[type.tiny, { fontFamily: font.bodyBold, color: colors.ink }]}>
                      {money(info.month_revenue, s.currency, { compact: true })} / {money(s.monthly_target, s.currency, { compact: true })}
                    </Text>
                  </View>
                  <Progress value={targetPct} tone={s.color} />
                </View>
              ) : null}

              <View style={styles.footer}>
                <View style={styles.footItem}>
                  <Feather name="alert-triangle" size={12}
                    color={Number(s.low_stock) > 0 ? colors.warn : colors.inkMuted} />
                  <Text style={type.tiny}>{Number(s.low_stock)} منتج على وشك النفاد</Text>
                </View>
                <View style={styles.footItem}>
                  <Feather name="pie-chart" size={12} color={colors.inkMuted} />
                  <Text style={type.tiny}>{share.toFixed(0)}% من المجموع</Text>
                </View>
                <View style={styles.footItem}>
                  <Feather name="credit-card" size={12} color={colors.inkMuted} />
                  <Text style={type.tiny}>أجور {compact(s.payroll)}</Text>
                </View>
              </View>

              <View style={{ flexDirection: row, gap: 8 }}>
                <Button title="فتح" icon="arrow-left" small variant="soft" style={{ flex: 1 }}
                  onPress={() => router.push(`/store/${s.id}`)} />
                <Button title="إعدادات" icon="settings" small variant="white" style={{ flex: 1 }}
                  onPress={() => router.push({ pathname: '/modal/store-form', params: { id: s.id } })} />
              </View>
            </Card>
          );
        })}
      </Screen>
      <Fab icon="plus" label="محل جديد" onPress={() => router.push('/modal/store-form')} />
    </View>
  );
}

function Metric({ label, value, tone }) {
  return (
    <View style={styles.metric}>
      <Text style={type.tiny}>{label}</Text>
      <Text style={[type.bodyStrong, { color: tone, fontSize: 14 }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function initials(name) {
  return (name || '?').trim().slice(0, 2);
}

const styles = StyleSheet.create({
  head: { flexDirection: row, alignItems: 'center', gap: 11 },
  badge: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: font.bodyBlack, fontSize: 15, lineHeight: 26 },
  metrics: { flexDirection: row, gap: 8, backgroundColor: colors.surfaceSoft, borderRadius: radius.md, padding: 12 },
  metric: { flex: 1, gap: 2 },
  rowBetween: { flexDirection: row, justifyContent: 'space-between', alignItems: 'center' },
  footer: { flexDirection: row, flexWrap: 'wrap', gap: 14 },
  footItem: { flexDirection: row, alignItems: 'center', gap: 5 },
});
