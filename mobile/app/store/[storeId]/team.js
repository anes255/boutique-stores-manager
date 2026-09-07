import React from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { api } from '../../../src/api';
import { useAuth } from '../../../src/auth';
import { useData } from '../../../src/hooks';
import { colors, compact, font, money, prettyDate, spacing, type } from '../../../src/theme';
import {
  Screen, Header, Card, SectionTitle, StatTile, Loader, ErrorNote,
  EmptyState, ListRow, Badge, Button, Feather, Fab,
} from '../../../src/components/ui';
import { RankBars } from '../../../src/charts';

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
  const currency = store?.currency || 'DZD';
  const employees = data.employees?.employees || [];
  const payroll = data.employees?.payroll;
  const logins = data.store?.staff || [];

  if (loading && !employees.length) return <Loader text="Looking up the team…" />;

  return (
    <>
      <Header title="Team" subtitle={store?.name} />
      <Screen refreshing={refreshing} onRefresh={reload}>
        <ErrorNote message={error} onRetry={reload} />

        <View style={styles.tiles}>
          <StatTile label="On the team" icon="users" tone={colors.sage} soft={colors.sageSoft}
            value={String(payroll?.active_count ?? 0)} sub="active" />
          <StatTile label="Monthly payroll" icon="credit-card" tone={colors.primary} soft={colors.primarySoft}
            value={money(payroll?.monthly_payroll, currency, { compact: true })} sub="salaries" />
        </View>

        {(data.staff?.staff || []).some((s) => Number(s.revenue) > 0) ? (
          <Card>
            <Text style={[type.section, { marginBottom: 12 }]}>Sales in the last 30 days</Text>
            <RankBars
              data={(data.staff.staff || []).map((s) => ({
                label: s.full_name, value: Number(s.revenue), sub: `${Number(s.orders)} sales`,
              }))}
              color={colors.sage}
              formatValue={(v) => money(v, currency, { compact: true })}
            />
          </Card>
        ) : null}

        <SectionTitle icon="user">People</SectionTitle>
        {employees.length === 0 ? (
          <Card>
            <EmptyState icon="user-plus" title="No one added yet"
              text="Add the people working here to keep track of salaries."
              actionLabel="Add someone"
              onAction={() => router.push({ pathname: '/modal/employee-form', params: { storeId } })} />
          </Card>
        ) : null}

        {employees.map((e) => (
          <Card key={e.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
              <View style={[styles.avatar, { backgroundColor: e.is_active ? colors.sageSoft : colors.lineSoft }]}>
                <Text style={[styles.avatarText, { color: e.is_active ? colors.sage : colors.inkMuted }]}>
                  {(e.full_name || '?').slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={type.bodyStrong} numberOfLines={1}>{e.full_name}</Text>
                <Text style={type.tiny}>{e.job_title || 'Team member'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[type.bodyStrong, { fontSize: 14 }]}>
                  {money(e.monthly_salary, currency, { compact: true })}
                </Text>
                <Text style={type.tiny}>per month</Text>
              </View>
            </View>

            <View style={styles.badges}>
              <Badge text={e.last_period ? `Paid ${e.last_period}` : 'Never paid'}
                tone={e.last_period ? colors.good : colors.warn}
                soft={e.last_period ? colors.goodSoft : colors.warnSoft} />
              {Number(e.sold_this_month) > 0 ? (
                <Badge text={`Sold ${compact(e.sold_this_month)}`} tone={colors.sky} soft={colors.skySoft} />
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <Button title="Pay salary" icon="dollar-sign" small variant="soft" style={{ flex: 1 }}
                onPress={() => router.push({ pathname: '/modal/salary', params: { id: e.id, name: e.full_name } })} />
              <Button title="Edit" icon="edit-2" small variant="white" style={{ flex: 1 }}
                onPress={() => router.push({ pathname: '/modal/employee-form', params: { id: e.id, storeId } })} />
            </View>
          </Card>
        ))}

        {isAdmin ? (
          <>
            <SectionTitle icon="key" action="Add login"
              onAction={() => router.push({ pathname: '/modal/account-form', params: { storeId } })}>
              Store logins
            </SectionTitle>
            <Card>
              {logins.length === 0 ? (
                <EmptyState icon="key" title="No login for this store yet"
                  text="Create one so the person running this shop can sign in and see only this store."
                  actionLabel="Create a login"
                  onAction={() => router.push({ pathname: '/modal/account-form', params: { storeId } })} />
              ) : logins.map((a, i, arr) => (
                <ListRow
                  key={a.id}
                  title={a.full_name}
                  subtitle={`${a.email} · ${a.role}`}
                  icon={a.is_active ? 'key' : 'slash'}
                  iconTone={a.is_active ? colors.lilac : colors.inkMuted}
                  iconSoft={a.is_active ? colors.lilacSoft : colors.lineSoft}
                  rightSub={a.last_login_at ? prettyDate(a.last_login_at) : 'never signed in'}
                  right={
                    <Badge text={a.is_active ? 'Active' : 'Disabled'}
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
          <Button title="Sign out" icon="log-out" variant="danger"
            onPress={() => Alert.alert('Sign out?', 'You will need your login to come back.', [
              { text: 'Stay', style: 'cancel' },
              { text: 'Sign out', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
            ])} />
        )}
      </Screen>

      <Fab icon="user-plus" label="Add"
        onPress={() => router.push({ pathname: '/modal/employee-form', params: { storeId } })} />
    </>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: font.bodyBlack, fontSize: 17 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 11 },
});
