import React from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useAuth } from '../../../src/auth';
import { useData } from '../../../src/hooks';
import { colors, compact, font, money, periodLabel, prettyDate, row, type } from '../../../src/theme';
import {
  Screen, Header, Card, SectionTitle, StatTile, Loader, ErrorNote,
  EmptyState, ListRow, Badge, Button, Fab,
} from '../../../src/components/ui';
import { RankBars } from '../../../src/charts';

const ROLES = { admin: 'المالك', manager: 'مسؤول المحل', staff: 'بائع' };

export default function StoreTeam() {
  const { storeId } = useLocalSearchParams();
  const router = useRouter();
  const { isAdmin, logout } = useAuth();
  const [error, setError] = React.useState(null);

  const { data, loading, refreshing, reload } = useData({
    store: [`/api/stores/${storeId}`, {}],
    employees: ['/api/employees', { store_id: storeId }],
    staff: ['/api/stats/staff', { store_id: storeId, days: 30, limit: 10 }],
  }, [storeId]);

  const store = data.store?.store;
  const currency = store?.currency;
  const employees = data.employees?.employees || [];
  const payroll = data.employees?.payroll;
  const logins = data.store?.staff || [];

  if (loading && !employees.length) return <Loader text="جاري تحميل الفريق…" />;

  return (
    <View style={{ flex: 1 }}>
      <Header title="الفريق" subtitle={store?.name} />
      <Screen refreshing={refreshing} onRefresh={reload}>
        <ErrorNote message={error} onRetry={reload} />

        <View style={styles.tiles}>
          <StatTile label="عدد الموظفين" icon="users" tone={colors.sage} soft={colors.sageSoft}
            value={String(payroll?.active_count ?? 0)} sub="نشطون" />
          <StatTile label="كتلة الأجور" icon="credit-card" tone={colors.primary} soft={colors.primarySoft}
            value={money(payroll?.monthly_payroll, currency, { compact: true })} sub="كل شهر" />
        </View>

        {(data.staff?.staff || []).some((s) => Number(s.revenue) > 0) ? (
          <Card>
            <Text style={[type.section, { marginBottom: 12 }]}>المبيعات خلال 30 يوم</Text>
            <RankBars
              data={(data.staff.staff || []).map((s) => ({
                label: s.full_name, value: Number(s.revenue), sub: `${Number(s.orders)} عملية`,
              }))}
              color={colors.sage}
              formatValue={(v) => money(v, currency, { compact: true })}
            />
          </Card>
        ) : null}

        <SectionTitle icon="user">الموظفون</SectionTitle>
        {employees.length === 0 ? (
          <Card>
            <EmptyState icon="user-plus" title="لم تضف أحدا بعد"
              text="أضف الأشخاص الذين يعملون هنا لمتابعة رواتبهم."
              actionLabel="إضافة موظف"
              onAction={() => router.push({ pathname: '/modal/employee-form', params: { storeId } })} />
          </Card>
        ) : null}

        {employees.map((e) => (
          <Card key={e.id}>
            <View style={{ flexDirection: row, alignItems: 'center', gap: 11 }}>
              <View style={[styles.avatar, { backgroundColor: e.is_active ? colors.sageSoft : colors.lineSoft }]}>
                <Text style={[styles.avatarText, { color: e.is_active ? colors.sage : colors.inkMuted }]}>
                  {(e.full_name || '؟').trim().slice(0, 1)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={type.bodyStrong} numberOfLines={1}>{e.full_name}</Text>
                <Text style={type.tiny}>{e.job_title || 'عضو في الفريق'}</Text>
              </View>
              <View style={{ alignItems: 'flex-start' }}>
                <Text style={[type.bodyStrong, { fontSize: 14 }]}>
                  {money(e.monthly_salary, currency, { compact: true })}
                </Text>
                <Text style={type.tiny}>في الشهر</Text>
              </View>
            </View>

            <View style={styles.badges}>
              <Badge text={e.last_period ? `دُفع ${periodLabel(e.last_period)}` : 'لم يُدفع بعد'}
                tone={e.last_period ? colors.good : colors.warn}
                soft={e.last_period ? colors.goodSoft : colors.warnSoft} />
              {Number(e.sold_this_month) > 0 ? (
                <Badge text={`باع ${compact(e.sold_this_month)}`} tone={colors.sky} soft={colors.skySoft} />
              ) : null}
            </View>

            <View style={{ flexDirection: row, gap: 8, marginTop: 10 }}>
              <Button title="دفع الراتب" icon="dollar-sign" small variant="soft" style={{ flex: 1 }}
                onPress={() => router.push({ pathname: '/modal/salary', params: { id: e.id, name: e.full_name } })} />
              <Button title="تعديل" icon="edit-2" small variant="white" style={{ flex: 1 }}
                onPress={() => router.push({ pathname: '/modal/employee-form', params: { id: e.id, storeId } })} />
            </View>
          </Card>
        ))}

        {isAdmin ? (
          <>
            <SectionTitle icon="key" action="إضافة حساب"
              onAction={() => router.push({ pathname: '/modal/account-form', params: { storeId } })}>
              حسابات الدخول
            </SectionTitle>
            <Card>
              {logins.length === 0 ? (
                <EmptyState icon="key" title="لا يوجد حساب دخول لهذا المحل"
                  text="أنشئ حسابا حتى يتمكن مسؤول المحل من الدخول ورؤية هذا المحل فقط."
                  actionLabel="إنشاء حساب"
                  onAction={() => router.push({ pathname: '/modal/account-form', params: { storeId } })} />
              ) : logins.map((a, i, arr) => (
                <ListRow
                  key={a.id}
                  title={a.full_name}
                  subtitle={`${a.email} · ${ROLES[a.role] || a.role}`}
                  icon={a.is_active ? 'key' : 'slash'}
                  iconTone={a.is_active ? colors.lilac : colors.inkMuted}
                  iconSoft={a.is_active ? colors.lilacSoft : colors.lineSoft}
                  rightSub={a.last_login_at ? prettyDate(a.last_login_at) : 'لم يدخل بعد'}
                  right={
                    <Badge text={a.is_active ? 'نشط' : 'معطّل'}
                      tone={a.is_active ? colors.good : colors.bad}
                      soft={a.is_active ? colors.goodSoft : colors.badSoft} />
                  }
                  onPress={() => router.push({
                    pathname: '/modal/account-form',
                    params: { storeId, id: a.id, email: a.email, name: a.full_name, active: String(a.is_active) },
                  })}
                  last={i === arr.length - 1}
                />
              ))}
            </Card>
          </>
        ) : (
          <Button title="تسجيل الخروج" icon="log-out" variant="danger"
            onPress={() => Alert.alert('تسجيل الخروج؟', 'ستحتاج بيانات الدخول للعودة.', [
              { text: 'البقاء', style: 'cancel' },
              { text: 'خروج', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
            ])} />
        )}
      </Screen>

      <Fab icon="user-plus" label="إضافة"
        onPress={() => router.push({ pathname: '/modal/employee-form', params: { storeId } })} />
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: row, flexWrap: 'wrap', gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: font.bodyBlack, fontSize: 17, lineHeight: 28 },
  badges: { flexDirection: row, flexWrap: 'wrap', gap: 7, marginTop: 11 },
});
