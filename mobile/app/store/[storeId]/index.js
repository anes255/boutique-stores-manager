import React from 'react';
import { Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '../../../src/auth';
import { useData } from '../../../src/hooks';
import { useStoreRouteId, useBranch } from '../../../src/store-route';
import { colors, font, money, row, todayIso } from '../../../src/theme';
import { Loader } from '../../../src/components/ui';
import { Notice, Feather } from '../../../src/components/simple';
import { Page, SummaryRow, MenuButton, ConfirmSheet, useDialog, useGoBack } from '../../../src/components/kit';

/**
 * الصفحة الرئيسية للفرع (ورقة المستخدم الفرعي):
 * أرقام اليوم، ثم: بيع منتج، عمليات البيع، المخزون، المصاريف، الصندوق.
 */
export default function BranchHome() {
  const storeId = useStoreRouteId();
  const branch = useBranch();
  const router = useRouter();
  const { user, isAdmin, logout } = useAuth();
  const goBack = useGoBack('/owner/branches');
  const d = useDialog();

  const { data, loading, refreshing, error, reload } = useData({
    sum: ['/api/reports/summary', { store_id: storeId }],
  }, [storeId]);

  if (loading && !data.sum) return <Loader text="جاري فتح الفرع…" />;

  const t = data.sum?.totals || {};
  const go = (page) => router.push(`/store/${storeId}/${page}`);

  return (
    <>
      <Page
        title={isAdmin ? (branch.name || 'الفرع') : (user?.full_name || '')}
        subtitle={isAdmin ? 'فرع' : (branch.name ? `مستخدم فرعي · ${branch.name}` : 'مستخدم فرعي')}
        date={isAdmin ? todayIso() : undefined}
        onBack={isAdmin ? goBack : undefined}
        right={isAdmin ? undefined : (
          <Pressable onPress={() => d.open({ kind: 'logout' })} style={styles.logout} hitSlop={8}>
            <Feather name="log-out" size={20} color={colors.inkSoft} />
            <Text style={styles.logoutText}>خروج</Text>
          </Pressable>
        )}
        refreshing={refreshing}
        onRefresh={reload}
      >
        {error ? <Notice text={error} tone="red" /> : null}

        <Text style={styles.section}>أرقام اليوم</Text>
        <SummaryRow items={[
          { label: 'مبيعات اليوم', value: money(t.sales_total), tone: 'green', onPress: () => go('sales') },
          { label: 'مصاريف اليوم', value: money(t.expenses_total), tone: 'orange', onPress: () => go('expenses') },
          { label: 'في الصندوق', value: money(data.sum?.cash_balance), tone: 'blue', onPress: () => go('cash') },
          isAdmin && { label: 'ربح اليوم', value: money(t.gross_profit), tone: 'grey' },
        ]} />

        <MenuButton label="بيع منتج" icon="shopping-cart" tone="green" hint="سجّل قطعة بعتها الآن" onPress={() => go('sell')} />
        <MenuButton label="عمليات البيع" icon="list" tone="blue" hint="كل ما بعته، يوما بيوم" onPress={() => go('sales')} />
        <MenuButton label="المخزون" icon="package" tone="orange" hint="كم بقي من كل منتج" onPress={() => go('stock')} />
        <MenuButton label="المصاريف" icon="credit-card" tone="red" hint="كراء، كهرباء، نقل…" onPress={() => go('expenses')} />
        <MenuButton label="الصندوق" icon="archive" tone="blue" hint="إيداع وسحب المال" onPress={() => go('cash')} />
        {isAdmin ? (
          <MenuButton label="الحسابات ورمز الفرع" icon="users" tone="grey" hint="من يستطيع الدخول لهذا الفرع"
            onPress={() => go('accounts')} />
        ) : null}
      </Page>

      <ConfirmSheet visible={d.dialog?.kind === 'logout'} title="خروج" text="هل تريد الخروج من التطبيق؟"
        yes="نعم، اخرج" busy={d.busy} onClose={d.close}
        onYes={() => d.run(async () => { await logout(); router.replace('/'); })} />
    </>
  );
}

const styles = StyleSheet.create({
  section: { fontFamily: font.display, fontSize: 20, lineHeight: 32, color: colors.ink, writingDirection: 'rtl', textAlign: 'right' },
  logout: {
    flexDirection: row, alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 46,
    borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line,
  },
  logoutText: { fontFamily: font.bodyBold, fontSize: 16, lineHeight: 24, color: colors.inkSoft },
});
