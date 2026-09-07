import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { useData } from '../../src/hooks';
import { colors, compact, font, money, periodLabel, row, type } from '../../src/theme';
import {
  Screen, Header, Card, SectionTitle, StatTile, Loader, ErrorNote,
  Badge, Chips, Button, EmptyState, Fab,
} from '../../src/components/ui';
import { RankBars } from '../../src/charts';

export default function AdminTeam() {
  const router = useRouter();
  const [storeId, setStoreId] = useState(null);

  const { data, loading, refreshing, error, reload } = useData({
    stores: ['/api/stores', {}],
    employees: ['/api/employees', { store_id: storeId || undefined }],
    staff: ['/api/stats/staff', { days: 30, limit: 12, store_id: storeId || undefined }],
  }, [storeId]);

  const employees = data.employees?.employees || [];
  const payroll = data.employees?.payroll;
  const stores = data.stores?.stores || [];

  const storeOptions = [
    { label: 'كل المحلات', value: null },
    ...stores.map((s) => ({ label: s.name, value: s.id })),
  ];

  const totalPaidYear = useMemo(
    () => employees.reduce((s, e) => s + Number(e.paid_this_year || 0), 0),
    [employees]
  );

  if (loading && !employees.length) return <Loader text="جاري تحميل الفريق…" />;

  return (
    <>
      <Header title="فريقك" subtitle="الموظفون والرواتب" />
      <Screen refreshing={refreshing} onRefresh={reload}>
        <ErrorNote message={error} onRetry={reload} />

        <Chips options={storeOptions} value={storeId} onChange={setStoreId} />

        <View style={styles.tiles}>
          <StatTile label="عدد الموظفين" icon="users" tone={colors.sage} soft={colors.sageSoft}
            value={String(payroll?.active_count ?? 0)} sub="نشطون" />
          <StatTile label="كتلة الأجور" icon="credit-card" tone={colors.primary} soft={colors.primarySoft}
            value={money(payroll?.monthly_payroll, undefined, { compact: true })} sub="كل شهر" />
          <StatTile label="المدفوع هذه السنة" icon="calendar" tone={colors.lilac} soft={colors.lilacSoft}
            value={money(totalPaidYear, undefined, { compact: true })} sub="رواتب مدفوعة" wide />
        </View>

        {(data.staff?.staff || []).some((s) => Number(s.revenue) > 0) ? (
          <Card>
            <Text style={[type.section, { marginBottom: 12 }]}>المبيعات خلال 30 يوم</Text>
            <RankBars
              data={(data.staff.staff || []).map((s) => ({
                label: s.full_name,
                value: Number(s.revenue),
                sub: `${s.store_name || '—'} · ${Number(s.orders)} عملية`,
              }))}
              color={colors.sage}
              formatValue={(v) => money(v, undefined, { compact: true })}
            />
          </Card>
        ) : null}

        <SectionTitle icon="user-check">كل الفريق</SectionTitle>

        {employees.length === 0 ? (
          <Card>
            <EmptyState
              icon="user-plus"
              title="لا يوجد موظفون بعد"
              text="أضف الأشخاص الذين يعملون في محلاتك لمتابعة رواتبهم وأدائهم."
              actionLabel={stores.length ? 'إضافة موظف' : undefined}
              onAction={stores.length ? () => router.push({
                pathname: '/modal/employee-form', params: { storeId: storeId || stores[0].id },
              }) : undefined}
            />
          </Card>
        ) : null}

        {employees.map((e) => (
          <Card key={e.id} onPress={() => router.push({ pathname: '/modal/employee-form', params: { id: e.id, storeId: e.store_id } })}>
            <View style={styles.row}>
              <View style={[styles.avatar, { backgroundColor: e.is_active ? colors.sageSoft : colors.lineSoft }]}>
                <Text style={[styles.avatarText, { color: e.is_active ? colors.sage : colors.inkMuted }]}>
                  {(e.full_name || '؟').trim().slice(0, 1)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={type.bodyStrong} numberOfLines={1}>{e.full_name}</Text>
                <Text style={type.tiny} numberOfLines={1}>
                  {e.job_title || 'عضو في الفريق'} · {e.store_name}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-start', gap: 3 }}>
                <Text style={[type.bodyStrong, { fontSize: 14 }]}>
                  {money(e.monthly_salary, e.currency, { compact: true })}
                </Text>
                <Text style={type.tiny}>في الشهر</Text>
              </View>
            </View>

            <View style={styles.metaRow}>
              <Badge
                text={e.last_period ? `دُفع ${periodLabel(e.last_period)}` : 'لم يُدفع بعد'}
                tone={e.last_period ? colors.good : colors.warn}
                soft={e.last_period ? colors.goodSoft : colors.warnSoft}
                icon={e.last_period ? 'check' : 'clock'}
              />
              {Number(e.sold_this_month) > 0 ? (
                <Badge text={`باع ${compact(e.sold_this_month)} هذا الشهر`}
                  tone={colors.sky} soft={colors.skySoft} icon="trending-up" />
              ) : null}
              {!e.is_active ? <Badge text="غير نشط" tone={colors.bad} soft={colors.badSoft} /> : null}
            </View>

            <Button
              title="دفع الراتب"
              icon="dollar-sign"
              small
              variant="soft"
              style={{ marginTop: 10 }}
              onPress={() => router.push({ pathname: '/modal/salary', params: { id: e.id, name: e.full_name } })}
            />
          </Card>
        ))}
      </Screen>
      {stores.length ? (
        <Fab icon="user-plus" label="إضافة" onPress={() => router.push({
          pathname: '/modal/employee-form',
          params: { storeId: storeId || stores[0].id },
        })} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: row, flexWrap: 'wrap', gap: 10 },
  row: { flexDirection: row, alignItems: 'center', gap: 11 },
  avatar: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: font.bodyBlack, fontSize: 17, lineHeight: 28 },
  metaRow: { flexDirection: row, flexWrap: 'wrap', gap: 7, marginTop: 11 },
});
