import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { api } from '../api';
import { useData } from '../hooks';
import { colors, font, money, row, slashDate, todayIso } from '../theme';
import { Loader } from '../components/ui';
import { BigButton, BigField, Notice, Sheet, Chip } from '../components/simple';
import {
  Page, DateBar, DaySheet, RangeSheet, DataTable, ActionBar, DateField,
  ConfirmSheet, Flash, useDialog, useGoBack, toNumber,
} from '../components/kit';

// أزرار جاهزة تملأ اسم المصروف بلمسة
const QUICK = ['كراء', 'كهرباء', 'ماء', 'نقل', 'أجرة عامل', 'أكل'];

/**
 * المصاريف: جدول يوم (الاسم / القيمة) مع إضافة / تعديل / حذف / بحث بمدة.
 * بدون storeId: المصاريف الكلية لكل الفروع. مع from و to: صفحة النتيجة.
 */
export default function ExpensesScreen({ storeId, branchName, basePath, backTo }) {
  const router = useRouter();
  const params = useLocalSearchParams();
  const report = params.from && params.to ? { from: String(params.from), to: String(params.to) } : null;
  const goBack = useGoBack(report ? basePath : backTo);
  const [day, setDay] = useState(todayIso());
  const [selected, setSelected] = useState(null);
  const d = useDialog();

  const allBranches = !storeId;
  const { data, loading, refreshing, error: loadError, reload } = useData({
    expenses: ['/api/expenses', { store_id: storeId || undefined, ...(report || { date: day }) }],
  }, [storeId, day, report?.from, report?.to]);

  const rows = data.expenses?.rows || [];
  const picked = rows.find((r) => r.id === selected);

  const columns = [
    allBranches && { key: 'store', label: 'الفرع', flex: 1.1, render: (r) => r.store_name },
    report && { key: 'day', label: 'التاريخ', flex: 0.9, render: (r) => slashDate(r.day).slice(5) },
    { key: 'label', label: 'المصروف', flex: 2 },
    { key: 'amount', label: 'القيمة', flex: 1.2, align: 'center', bold: true, render: (r) => money(r.amount) },
  ].filter(Boolean);

  const needRow = () => {
    if (picked) return true;
    d.flash('اختر سطرا من الجدول أولا، ثم اضغط الزر', 'orange');
    return false;
  };

  const actions = report ? [] : [
    storeId && {
      label: 'إضافة', icon: 'plus', tone: 'green',
      onPress: () => d.open({ kind: 'form' }, { label: '', amount: '', date: day }),
    },
    {
      label: 'تعديل', icon: 'edit-2', tone: 'blue',
      onPress: () => needRow() && d.open({ kind: 'form', row: picked },
        { label: picked.label, amount: String(Number(picked.amount)), date: picked.day }),
    },
    { label: 'حذف', icon: 'trash-2', tone: 'red', onPress: () => needRow() && d.open({ kind: 'delete', row: picked }) },
    { label: 'بحث بمدة', icon: 'search', tone: 'orange', onPress: () => d.open({ kind: 'range' }) },
  ];

  const save = () => d.run(async () => {
    const label = (d.form.label || '').trim();
    const amount = toNumber(d.form.amount);
    if (!label) throw new Error('اكتب اسم المصروف');
    if (!(amount > 0)) throw new Error('اكتب القيمة');
    const body = { label, amount, date: d.form.date };
    if (d.dialog.row) {
      await api.patch(`/api/expenses/${d.dialog.row.id}`, body);
      d.flash('تم حفظ التعديل');
    } else {
      await api.post('/api/expenses', { ...body, store_id: storeId });
      d.flash(`تمت إضافة مصروف ${money(amount)}`);
    }
    d.finish();
    if (d.form.date !== day) setDay(d.form.date);
  });

  const doDelete = () => d.run(async () => {
    await api.del(`/api/expenses/${d.dialog.row.id}`);
    setSelected(null);
    d.finish();
    d.flash('تم حذف المصروف');
  });

  if (loading && !data.expenses) return <Loader text="جاري التحميل…" />;

  const title = report
    ? `المصاريف من ${slashDate(report.from)} إلى ${slashDate(report.to)}`
    : allBranches ? 'المصاريف الكلية' : 'المصاريف';

  return (
    <>
      <Page title={title} subtitle={branchName || (allBranches ? 'كل الفروع' : undefined)} onBack={goBack}
        refreshing={refreshing} onRefresh={reload}
        footer={actions.length ? <ActionBar actions={actions} /> : null}>
        <Flash notice={d.notice} />
        {loadError ? <Notice text={loadError} tone="red" /> : null}
        {!report ? <DateBar value={day} onPress={() => d.open({ kind: 'day' })} /> : null}

        <DataTable
          columns={columns}
          rows={rows}
          selected={report ? undefined : selected}
          onSelect={report ? undefined : setSelected}
          empty={report ? 'لا توجد مصاريف في هذه المدة' : 'لا توجد مصاريف في هذا اليوم'}
          totalLabel="المجموع الكلي"
          total={money(data.expenses?.total || 0)}
        />
        {!report && rows.length ? <Text style={styles.hint}>اضغط على سطر لاختياره، ثم اضغط تعديل أو حذف.</Text> : null}
      </Page>

      <DaySheet visible={d.dialog?.kind === 'day'} value={day} onClose={d.close}
        onPick={(v) => { setDay(v); setSelected(null); d.finish(); }} />

      <RangeSheet visible={d.dialog?.kind === 'range'} title="بحث المصاريف بمدة" onClose={d.close}
        onSearch={({ from, to }) => { d.finish(); router.push({ pathname: basePath, params: { from, to } }); }} />

      <Sheet visible={d.dialog?.kind === 'form'} title={d.dialog?.row ? 'تعديل المصروف' : 'إضافة مصروف'}
        onClose={d.close}
        footer={<BigButton label={d.dialog?.row ? 'حفظ' : 'أضف'} icon="check" tone="green" loading={d.busy} onPress={save} />}>
        <Text style={styles.label}>اسم المصروف</Text>
        <View style={styles.quick}>
          {QUICK.map((q) => <Chip key={q} label={q} on={d.form.label === q} onPress={() => d.set('label')(q)} />)}
        </View>
        <BigField value={d.form.label || ''} onChangeText={d.set('label')} placeholder="أو اكتب اسم المصروف" />
        <BigField label="القيمة" value={d.form.amount || ''} onChangeText={d.set('amount')}
          keyboardType="numeric" placeholder="0" />
        <DateField label="التاريخ" value={d.form.date || todayIso()} onChange={d.set('date')} />
        <Notice text={d.error} tone="red" />
      </Sheet>

      <ConfirmSheet visible={d.dialog?.kind === 'delete'} title="حذف مصروف" busy={d.busy} error={d.error}
        text={d.dialog?.row ? `حذف مصروف "${d.dialog.row.label}" (${money(d.dialog.row.amount)})؟` : ''}
        yes="نعم، احذف" onYes={doDelete} onClose={d.close} />
    </>
  );
}

const styles = StyleSheet.create({
  hint: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 24, color: colors.inkMuted, textAlign: 'center' },
  label: { fontFamily: font.bodyBold, fontSize: 17, lineHeight: 26, color: colors.ink, writingDirection: 'rtl', textAlign: 'right' },
  quick: { flexDirection: row, flexWrap: 'wrap', gap: 8 },
});
