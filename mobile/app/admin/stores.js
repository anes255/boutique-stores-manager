import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';

import { useData } from '../../src/hooks';
import { colors, font, money, radius, spacing, type, compact } from '../../src/theme';
import {
  Screen, Header, Card, Button, Loader, ErrorNote, EmptyState,
  Badge, Progress, Feather, Segmented, Fab,
} from '../../src/components/ui';
import { Sparkline } from '../../src/charts';

const RANGES = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
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

  if (loading && !stats.length) return <Loader text="Gathering your stores…" />;

  const groupRevenue = stats.reduce((s, x) => s + Number(x.revenue || 0), 0);

  return (
    <>
      <Header title="Your stores" subtitle={`${stats.length} location${stats.length === 1 ? '' : 's'}`} />
      <Screen refreshing={refreshing} onRefresh={reload}>
        <ErrorNote message={error} onRetry={reload} />
        <Segmented options={RANGES} value={days} onChange={setDays} />

        {stats.length === 0 ? (
          <Card>
            <EmptyState
              icon="shopping-bag"
              title="Let's open your first store"
              text="Give it a name and a short code. You can create its login right after."
              actionLabel="Create a store"
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
                    {s.code}{info.city ? ` · ${info.city}` : ''} · {Number(s.headcount)} on the team
                  </Text>
                </View>
                {!s.is_active ? <Badge text="Closed" tone={colors.bad} soft={colors.badSoft} /> : null}
                <Feather name="chevron-right" size={18} color={colors.inkMuted} />
              </View>

              <View style={styles.metrics}>
                <Metric label="Revenue" value={money(s.revenue, s.currency, { compact: true })} tone={colors.primary} />
                <Metric label="Profit" value={money(s.profit, s.currency, { compact: true })} tone={colors.sage} />
                <Metric label="Sales" value={String(Number(s.orders))} tone={colors.lilac} />
                <Metric label="Stock" value={money(s.stock_value, s.currency, { compact: true })} tone={colors.sky} />
              </View>

              {targetPct !== null ? (
                <View style={{ gap: 6 }}>
                  <View style={styles.rowBetween}>
                    <Text style={type.tiny}>Monthly target</Text>
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
                  <Text style={type.tiny}>{Number(s.low_stock)} low on stock</Text>
                </View>
                <View style={styles.footItem}>
                  <Feather name="pie-chart" size={12} color={colors.inkMuted} />
                  <Text style={type.tiny}>{share.toFixed(0)}% of group</Text>
                </View>
                <View style={styles.footItem}>
                  <Feather name="credit-card" size={12} color={colors.inkMuted} />
                  <Text style={type.tiny}>payroll {compact(s.payroll)}</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Open" icon="arrow-right" small variant="soft" style={{ flex: 1 }}
                  onPress={() => router.push(`/store/${s.id}`)} />
                <Button title="Manage" icon="settings" small variant="white" style={{ flex: 1 }}
                  onPress={() => router.push({ pathname: '/modal/store-form', params: { id: s.id } })} />
              </View>
            </Card>
          );
        })}
      </Screen>
      <Fab icon="plus" label="New store" onPress={() => router.push('/modal/store-form')} />
    </>
  );
}

function Metric({ label, value, tone }) {
  return (
    <View style={styles.metric}>
      <Text style={type.tiny}>{label}</Text>
      <Text style={[type.bodyStrong, { color: tone, fontSize: 15 }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function initials(name) {
  return (name || '?').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/)
    .map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  badge: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: font.bodyBlack, fontSize: 15 },
  metrics: { flexDirection: 'row', gap: 8, backgroundColor: colors.surfaceSoft, borderRadius: radius.md, padding: 12 },
  metric: { flex: 1, gap: 2 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  footItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});
