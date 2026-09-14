import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '../../src/auth';
import { useData } from '../../src/hooks';
import { colors, font, money, todayIso } from '../../src/theme';
import { Loader } from '../../src/components/ui';
import { Notice } from '../../src/components/simple';
import { Page, SummaryRow, MenuButton } from '../../src/components/kit';

/** الصفحة الرئيسية للمستخدم الرئيسي: أرقام اليوم، الفروع، ثم كل الأقسام. */
export default function OwnerHome() {
  const router = useRouter();
  const { user } = useAuth();
  const { data, loading, refreshing, error, reload } = useData({
    sum: ['/api/reports/summary', {}],
    stores: ['/api/stores', {}],
  }, []);

  if (loading && !data.sum) return <Loader text="جاري التحميل…" />;

  const t = data.sum?.totals || {};
  const stores = data.stores?.stores || [];

  return (
    <Page title={user?.full_name || ''} subtitle="المستخدم الرئيسي" date={todayIso()}
      refreshing={refreshing} onRefresh={reload}>
      {error ? <Notice text={error} tone="red" /> : null}

      <Text style={styles.section}>أرقام اليوم (كل الفروع)</Text>
      <SummaryRow items={[
        { label: 'مبيعات اليوم', value: money(t.sales_total), tone: 'green', onPress: () => router.push('/owner/sales') },
        { label: 'مصاريف اليوم', value: money(t.expenses_total), tone: 'orange', onPress: () => router.push('/owner/expenses') },
        { label: 'ربح اليوم', value: money(t.gross_profit), tone: 'blue', onPress: () => router.push('/owner/profits') },
        { label: 'الصافي', value: money(t.net), tone: Number(t.net) >= 0 ? 'green' : 'red',
          onPress: () => router.push('/owner/profits') },
      ]} />

      <Text style={styles.section}>فروعي</Text>
      {stores.length === 0 ? (
        <Notice text="ليس لديك فروع بعد. اضغط «الفروع» ثم «إضافة»." tone="orange" />
      ) : (
        <SummaryRow items={stores.map((s) => ({
          key: s.id, label: s.name, value: money(s.today_sales), tone: 'grey',
          onPress: () => router.push(`/store/${s.id}`),
        }))} />
      )}

      <MenuButton label="الفروع" icon="shopping-bag" tone="orange" hint="إضافة فرع، فتحه، حساباته"
        onPress={() => router.push('/owner/branches')} />
      <MenuButton label="المنتجات" icon="tag" tone="green" hint="الاسم، المقاس، اللون، السعر"
        onPress={() => router.push('/owner/products')} />
      <MenuButton label="المخزون الكلي" icon="package" tone="blue" hint="كم بقي من كل منتج في كل الفروع"
        onPress={() => router.push('/owner/stock')} />
      <MenuButton label="عمليات البيع الكلية" icon="list" tone="green" hint="مبيعات كل الفروع"
        onPress={() => router.push('/owner/sales')} />
      <MenuButton label="المصاريف الكلية" icon="credit-card" tone="red" hint="مصاريف كل الفروع"
        onPress={() => router.push('/owner/expenses')} />
      <MenuButton label="الأرباح" icon="trending-up" tone="blue" hint="الربح والصافي، لأي مدة"
        onPress={() => router.push('/owner/profits')} />
      <MenuButton label="الإعدادات" icon="settings" tone="grey" hint="اسم المستخدم، كلمة السر، الخروج"
        onPress={() => router.push('/owner/settings')} />
    </Page>
  );
}

const styles = StyleSheet.create({
  section: { fontFamily: font.display, fontSize: 20, lineHeight: 32, color: colors.ink, writingDirection: 'rtl', textAlign: 'right' },
});
