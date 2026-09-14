import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { api } from '../../src/api';
import { useData } from '../../src/hooks';
import { colors, font, money } from '../../src/theme';
import { Loader } from '../../src/components/ui';
import { BigButton, BigField, Notice, Sheet } from '../../src/components/simple';
import { Page, DataTable, ActionBar, ConfirmSheet, Flash, useDialog, useGoBack } from '../../src/components/kit';

/** الفروع: فتح / إضافة / تعديل الاسم / حذف */
export default function Branches() {
  const router = useRouter();
  const goBack = useGoBack('/owner');
  const [selected, setSelected] = useState(null);
  const d = useDialog();

  const { data, loading, refreshing, error: loadError, reload } = useData({ stores: ['/api/stores', {}] }, []);
  const stores = data.stores?.stores || [];
  const picked = stores.find((s) => s.id === selected);

  const needRow = () => {
    if (picked) return true;
    d.flash('اختر فرعا من الجدول أولا، ثم اضغط الزر', 'orange');
    return false;
  };

  const save = () => d.run(async () => {
    const name = (d.form.name || '').trim();
    if (name.length < 2) throw new Error('اكتب اسم الفرع');
    if (d.dialog.row) {
      await api.patch(`/api/stores/${d.dialog.row.id}`, { name });
      d.finish();
      d.flash('تم تغيير الاسم');
    } else {
      const res = await api.post('/api/stores', { name });
      setSelected(res.store.id);
      d.open({ kind: 'created', store: res.store });
    }
  });

  const remove = () => d.run(async () => {
    await api.del(`/api/stores/${d.dialog.row.id}`);
    setSelected(null);
    d.finish();
    d.flash('تم حذف الفرع');
  });

  if (loading && !data.stores) return <Loader text="جاري التحميل…" />;

  return (
    <>
      <Page title="الفروع" onBack={goBack} refreshing={refreshing} onRefresh={reload}
        footer={(
          <ActionBar actions={[
            { label: 'فتح الفرع', icon: 'log-in', tone: 'green', onPress: () => needRow() && router.push(`/store/${picked.id}`) },
            { label: 'إضافة', icon: 'plus', tone: 'blue', onPress: () => d.open({ kind: 'form' }, { name: '' }) },
            { label: 'تعديل الاسم', icon: 'edit-2', tone: 'grey',
              onPress: () => needRow() && d.open({ kind: 'form', row: picked }, { name: picked.name }) },
            { label: 'حذف', icon: 'trash-2', tone: 'red', onPress: () => needRow() && d.open({ kind: 'delete', row: picked }) },
          ]} />
        )}>
        <Flash notice={d.notice} />
        {loadError ? <Notice text={loadError} tone="red" /> : null}

        <DataTable
          columns={[
            { key: 'name', label: 'الفرع', flex: 1.8, bold: true },
            { key: 'today', label: 'مبيعات اليوم', flex: 1.3, align: 'center', render: (r) => money(r.today_sales) },
            { key: 'staff', label: 'الحسابات', flex: 0.9, align: 'center', render: (r) => r.staff_count },
          ]}
          rows={stores}
          selected={selected}
          onSelect={setSelected}
          empty="ليس لديك فروع بعد. اضغط «إضافة»."
        />
        {stores.length ? <Text style={styles.hint}>اضغط على فرع لاختياره، ثم «فتح الفرع».</Text> : null}
      </Page>

      <Sheet visible={d.dialog?.kind === 'form'} title={d.dialog?.row ? 'تعديل اسم الفرع' : 'فرع جديد'} onClose={d.close}
        footer={<BigButton label="حفظ" icon="check" tone="green" loading={d.busy} onPress={save} />}>
        <BigField label="اسم الفرع" value={d.form.name || ''} onChangeText={d.set('name')} placeholder="مثال: فرع وسط المدينة" />
        <Notice text={d.error} tone="red" />
      </Sheet>

      <Sheet visible={d.dialog?.kind === 'created'} title={`تم إنشاء "${d.dialog?.store?.name || ''}"`} onClose={d.close}
        footer={(
          <>
            <BigButton label="فتح الفرع" icon="log-in" tone="green"
              onPress={() => { const id = d.dialog.store.id; d.finish(); router.push(`/store/${id}`); }} />
            <BigButton label="تم" tone="grey" filled={false} onPress={d.finish} />
          </>
        )}>
        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>رمز الفرع</Text>
          <Text selectable style={styles.code}>{d.dialog?.store?.join_code}</Text>
        </View>
        <Text style={styles.text}>
          أعطِ هذا الرمز لمن يعمل في هذا الفرع. يفتح التطبيق، يختار «مستخدم فرعي» ثم «إنشاء حساب»، ويكتب الرمز.
        </Text>
        <Text style={styles.text}>
          بعد ذلك: افتح «المنتجات» لتضع كميات في هذا الفرع.
        </Text>
      </Sheet>

      <ConfirmSheet visible={d.dialog?.kind === 'delete'} title="حذف فرع" busy={d.busy} error={d.error}
        text={`حذف فرع "${d.dialog?.row?.name || ''}"؟\nكل مبيعاته ومصاريفه وصندوقه ومخزونه وحساباته ستُحذف نهائيا.`}
        yes="نعم، احذف الفرع" onYes={remove} onClose={d.close} />
    </>
  );
}

const styles = StyleSheet.create({
  hint: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 24, color: colors.inkMuted, textAlign: 'center' },
  text: { fontFamily: font.bodyBold, fontSize: 17, lineHeight: 28, color: colors.ink, writingDirection: 'rtl', textAlign: 'right' },
  codeBox: {
    alignItems: 'center', gap: 4, backgroundColor: '#FFFFFF', borderRadius: 22, padding: 16,
    borderWidth: 2, borderStyle: 'dashed', borderColor: colors.primary,
  },
  codeLabel: { fontFamily: font.bodyBold, fontSize: 17, lineHeight: 26, color: colors.inkSoft },
  code: { fontFamily: font.bodyBlack, fontSize: 40, lineHeight: 54, letterSpacing: 6, color: colors.ink, writingDirection: 'ltr' },
});
