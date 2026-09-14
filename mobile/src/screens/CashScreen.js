import React, { useState } from 'react';
import { Text, StyleSheet } from 'react-native';

import { api } from '../api';
import { useData } from '../hooks';
import { colors, font, money, slashDate, todayIso } from '../theme';
import { Loader } from '../components/ui';
import { BigButton, BigField, Notice, Sheet, TONES } from '../components/simple';
import {
  Page, SummaryRow, DataTable, ActionBar, DateField, ConfirmSheet, Flash, useDialog, useGoBack, toNumber,
} from '../components/kit';

/** الصندوق: عمليات الإيداع والسحب، والرصيد الموجود. */
export default function CashScreen({ storeId, branchName, backTo }) {
  const goBack = useGoBack(backTo);
  const [selected, setSelected] = useState(null);
  const d = useDialog();

  const { data, loading, refreshing, error: loadError, reload } = useData({
    cash: ['/api/cash', { store_id: storeId }],
  }, [storeId]);

  const rows = data.cash?.rows || [];
  const picked = rows.find((r) => r.id === selected);
  const balance = Number(data.cash?.balance || 0);

  const columns = [
    {
      key: 'kind', label: 'النوع', flex: 1.5,
      render: (r) => (r.kind === 'in' ? 'إيداع' : 'سحب') + (r.note ? `\n${r.note}` : ''),
      color: (r) => (r.kind === 'in' ? TONES.green.fg : TONES.orange.fg),
    },
    { key: 'day', label: 'التاريخ', flex: 1.2, align: 'center', render: (r) => slashDate(r.day) },
    { key: 'amount', label: 'المبلغ', flex: 1.2, align: 'center', bold: true, render: (r) => money(r.amount) },
  ];

  const save = () => d.run(async () => {
    const amount = toNumber(d.form.amount);
    if (!(amount > 0)) throw new Error('اكتب المبلغ');
    const kind = d.dialog.mode;
    if (kind === 'out' && amount > balance) throw new Error(`المبلغ أكبر من الموجود في الصندوق (${money(balance)})`);
    await api.post('/api/cash', {
      store_id: storeId, kind, amount, note: (d.form.note || '').trim() || null, date: d.form.date,
    });
    d.finish();
    d.flash(kind === 'in' ? `تم إيداع ${money(amount)}` : `تم سحب ${money(amount)}`);
  });

  const doDelete = () => d.run(async () => {
    await api.del(`/api/cash/${d.dialog.row.id}`);
    setSelected(null);
    d.finish();
    d.flash('تم حذف العملية');
  });

  if (loading && !data.cash) return <Loader text="جاري التحميل…" />;

  const deposit = d.dialog?.mode === 'in';

  return (
    <>
      <Page title="الصندوق" subtitle={branchName} date={todayIso()} onBack={goBack}
        refreshing={refreshing} onRefresh={reload}
        footer={(
          <ActionBar actions={[
            { label: 'إيداع مبلغ جديد', icon: 'arrow-down-circle', tone: 'green',
              onPress: () => d.open({ kind: 'move', mode: 'in' }, { amount: '', note: '', date: todayIso() }) },
            { label: 'سحب مبلغ جديد', icon: 'arrow-up-circle', tone: 'orange',
              onPress: () => d.open({ kind: 'move', mode: 'out' }, { amount: '', note: '', date: todayIso() }) },
            picked && { label: 'حذف العملية المختارة', icon: 'trash-2', tone: 'red', filled: false,
              onPress: () => d.open({ kind: 'delete', row: picked }) },
          ]} />
        )}>
        <Flash notice={d.notice} />
        {loadError ? <Notice text={loadError} tone="red" /> : null}

        <SummaryRow items={[
          { label: 'الرصيد', value: money(balance), tone: balance >= 0 ? 'blue' : 'red' },
          { label: 'مجموع الإيداع', value: money(data.cash?.in_total), tone: 'green' },
          { label: 'مجموع السحب', value: money(data.cash?.out_total), tone: 'orange' },
        ]} />

        <Text style={styles.section}>عمليات الإيداع والسحب</Text>
        <DataTable columns={columns} rows={rows} selected={selected} onSelect={setSelected}
          empty="لا توجد عمليات بعد. اضغط «إيداع مبلغ جديد»." />
        {rows.length ? <Text style={styles.hint}>للتصحيح: اضغط على عملية ثم «حذف العملية المختارة».</Text> : null}
      </Page>

      <Sheet visible={d.dialog?.kind === 'move'} title={deposit ? 'إيداع مبلغ جديد' : 'سحب مبلغ جديد'} onClose={d.close}
        footer={<BigButton label={deposit ? 'إيداع' : 'سحب'} icon="check" tone={deposit ? 'green' : 'orange'}
          loading={d.busy} onPress={save} />}>
        {!deposit ? <Text style={styles.hint}>الموجود الآن: {money(balance)}</Text> : null}
        <BigField label="المبلغ" value={d.form.amount || ''} onChangeText={d.set('amount')}
          keyboardType="numeric" placeholder="0" />
        <BigField label="ملاحظة (اختياري)" value={d.form.note || ''} onChangeText={d.set('note')}
          placeholder={deposit ? 'مثال: مبيعات اليوم' : 'مثال: دفع للمورد'} />
        <DateField label="التاريخ" value={d.form.date || todayIso()} onChange={d.set('date')} />
        <Notice text={d.error} tone="red" />
      </Sheet>

      <ConfirmSheet visible={d.dialog?.kind === 'delete'} title="حذف عملية" busy={d.busy} error={d.error}
        text={d.dialog?.row ? `حذف ${d.dialog.row.kind === 'in' ? 'إيداع' : 'سحب'} ${money(d.dialog.row.amount)} بتاريخ ${slashDate(d.dialog.row.day)}؟` : ''}
        yes="نعم، احذف" onYes={doDelete} onClose={d.close} />
    </>
  );
}

const styles = StyleSheet.create({
  section: { fontFamily: font.display, fontSize: 20, lineHeight: 32, color: colors.ink, writingDirection: 'rtl', textAlign: 'right' },
  hint: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 24, color: colors.inkMuted, textAlign: 'center' },
});
