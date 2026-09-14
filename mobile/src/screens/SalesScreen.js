import React, { useMemo, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { api } from '../api';
import { useData } from '../hooks';
import { colors, font, money, slashDate, todayIso } from '../theme';
import { Loader } from '../components/ui';
import { BigButton, BigField, Stepper, Notice, Sheet } from '../components/simple';
import {
  Page, DateBar, DaySheet, RangeSheet, DataTable, ActionBar, SelectField, DateField,
  ConfirmSheet, InfoLine, Flash, useDialog, useGoBack, toNumber, productLabel,
} from '../components/kit';

/**
 * عمليات البيع.
 *  - فرع واحد (storeId): جدول يوم، مع إضافة / تعديل / حذف / بحث بمدة.
 *  - كل الفروع (بدون storeId): عمليات البيع الكلية عند المستخدم الرئيسي.
 *  - مع from و to في الرابط: صفحة النتيجة «عمليات البيع من … إلى …».
 */
export default function SalesScreen({ storeId, branchName, basePath, backTo }) {
  const router = useRouter();
  const params = useLocalSearchParams();
  const report = params.from && params.to ? { from: String(params.from), to: String(params.to) } : null;
  const goBack = useGoBack(report ? basePath : backTo);
  const [day, setDay] = useState(todayIso());
  const [selected, setSelected] = useState(null);
  const d = useDialog();

  const allBranches = !storeId;
  const { data, loading, refreshing, error: loadError, reload } = useData({
    sales: ['/api/sales', { store_id: storeId || undefined, ...(report || { date: day }) }],
    ...(storeId && !report ? { products: ['/api/products', { store_id: storeId }] } : {}),
  }, [storeId, day, report?.from, report?.to]);

  const rows = data.sales?.rows || [];
  const picked = rows.find((r) => r.id === selected);

  const options = useMemo(() => (data.products?.products || [])
    .filter((p) => p.in_branch)
    .map((p) => ({
      value: p.id,
      label: productLabel(p),
      sub: Number(p.qty) > 0 ? `بقي ${Number(p.qty)} · السعر ${money(p.sell_price)}` : 'نفد',
      disabled: Number(p.qty) <= 0,
      price: Number(p.sell_price),
      qty: Number(p.qty),
    })), [data.products]);

  const columns = [
    allBranches && { key: 'store', label: 'الفرع', flex: 1.1, render: (r) => r.store_name },
    report && { key: 'day', label: 'التاريخ', flex: 0.9, render: (r) => slashDate(r.day).slice(5) },
    { key: 'name', label: 'المنتج', flex: 1.6, render: productLabel },
    { key: 'qty', label: 'الكمية', flex: 0.8, align: 'center', render: (r) => Number(r.qty) },
    !report && { key: 'price', label: 'السعر', flex: 1.1, align: 'center', render: (r) => money(r.unit_price) },
    { key: 'total', label: 'المجموع', flex: 1.2, align: 'center', bold: true, render: (r) => money(r.line_total) },
  ].filter(Boolean);

  const needRow = () => {
    if (picked) return true;
    d.flash('اختر سطرا من الجدول أولا، ثم اضغط الزر', 'orange');
    return false;
  };

  const actions = report ? [] : [
    storeId && {
      label: 'إضافة', icon: 'plus', tone: 'green',
      onPress: () => d.open({ kind: 'add' }, { product: '', qty: 1, price: '', date: day }),
    },
    {
      label: 'تعديل', icon: 'edit-2', tone: 'blue',
      onPress: () => needRow() && d.open({ kind: 'edit', row: picked },
        { qty: Number(picked.qty), price: String(Number(picked.unit_price)) }),
    },
    { label: 'حذف', icon: 'trash-2', tone: 'red', onPress: () => needRow() && d.open({ kind: 'delete', row: picked }) },
    { label: 'بحث بمدة', icon: 'search', tone: 'orange', onPress: () => d.open({ kind: 'range' }) },
  ];

  // ------------------------------------------------------------ حفظ
  const chosen = options.find((o) => o.value === d.form.product);

  const saveAdd = () => d.run(async () => {
    const f = d.form;
    if (!chosen) throw new Error('اختر المنتج');
    const qty = Math.floor(toNumber(f.qty));
    const price = toNumber(f.price);
    if (!(qty > 0)) throw new Error('اختر الكمية');
    if (qty > chosen.qty) throw new Error(`بقي ${chosen.qty} فقط`);
    if (String(f.price).trim() === '' || !(price >= 0)) throw new Error('اكتب السعر');
    await api.post('/api/sales', { store_id: storeId, product_id: chosen.value, qty, unit_price: price, date: f.date });
    d.finish();
    if (f.date !== day) setDay(f.date);
    d.flash(`تم تسجيل البيع: ${qty} × ${chosen.label}`);
  });

  const saveEdit = () => d.run(async () => {
    const qty = Math.floor(toNumber(d.form.qty));
    const price = toNumber(d.form.price);
    if (!(qty > 0)) throw new Error('اختر الكمية');
    if (String(d.form.price).trim() === '' || !(price >= 0)) throw new Error('اكتب السعر');
    await api.patch(`/api/sales/items/${d.dialog.row.id}`, { qty, unit_price: price });
    d.finish();
    d.flash('تم حفظ التعديل');
  });

  const doDelete = () => d.run(async () => {
    await api.del(`/api/sales/items/${d.dialog.row.id}`);
    setSelected(null);
    d.finish();
    d.flash('تم حذف عملية البيع، ورجعت القطع إلى المخزون');
  });

  if (loading && !data.sales) return <Loader text="جاري التحميل…" />;

  const title = report
    ? `عمليات البيع من ${slashDate(report.from)} إلى ${slashDate(report.to)}`
    : allBranches ? 'عمليات البيع الكلية' : 'عمليات البيع';
  const lineQty = Math.floor(toNumber(d.form.qty)) || 0;
  const linePrice = toNumber(d.form.price) || 0;

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
          empty={report ? 'لا توجد عمليات بيع في هذه المدة' : 'لا توجد عمليات بيع في هذا اليوم'}
          totalLabel="المجموع الكلي"
          total={money(data.sales?.total || 0)}
        />
        {!report && rows.length ? <Text style={styles.hint}>اضغط على سطر لاختياره، ثم اضغط تعديل أو حذف.</Text> : null}
      </Page>

      <DaySheet visible={d.dialog?.kind === 'day'} value={day} onClose={d.close}
        onPick={(v) => { setDay(v); setSelected(null); d.finish(); }} />

      <RangeSheet visible={d.dialog?.kind === 'range'} title="بحث عمليات البيع بمدة" onClose={d.close}
        onSearch={({ from, to }) => { d.finish(); router.push({ pathname: basePath, params: { from, to } }); }} />

      <Sheet visible={d.dialog?.kind === 'add'} title="إضافة عملية بيع" onClose={d.close}
        footer={<BigButton label="أضف" icon="check" tone="green" loading={d.busy} onPress={saveAdd} />}>
        <SelectField label="المنتج" value={d.form.product} options={options}
          placeholder="اضغط لاختيار المنتج"
          empty="لا توجد منتجات في مخزون هذا الفرع"
          onChange={(v) => {
            const o = options.find((x) => x.value === v);
            d.set('product')(v);
            d.set('price')(String(o?.price ?? ''));
            d.set('qty')(1);
          }} />
        <Text style={styles.label}>الكمية</Text>
        <Stepper value={d.form.qty ?? 1} onChange={d.set('qty')} max={chosen?.qty} />
        <BigField label="السعر (للقطعة)" value={d.form.price ?? ''} onChangeText={d.set('price')}
          keyboardType="numeric" placeholder="0" />
        <DateField label="التاريخ" value={d.form.date || todayIso()} onChange={d.set('date')} />
        {chosen && lineQty > 0 ? <InfoLine label="المجموع" value={money(lineQty * linePrice)} tone={colors.primaryDark} /> : null}
        <Notice text={d.error} tone="red" />
      </Sheet>

      <Sheet visible={d.dialog?.kind === 'edit'} title="تعديل عملية بيع" onClose={d.close}
        footer={<BigButton label="حفظ" icon="check" tone="green" loading={d.busy} onPress={saveEdit} />}>
        <InfoLine label="المنتج" value={productLabel(d.dialog?.row)} />
        <Text style={styles.label}>الكمية</Text>
        <Stepper value={d.form.qty ?? 1} onChange={d.set('qty')} />
        <BigField label="السعر (للقطعة)" value={d.form.price ?? ''} onChangeText={d.set('price')}
          keyboardType="numeric" placeholder="0" />
        {lineQty > 0 ? <InfoLine label="المجموع" value={money(lineQty * linePrice)} tone={colors.primaryDark} /> : null}
        <Notice text={d.error} tone="red" />
      </Sheet>

      <ConfirmSheet visible={d.dialog?.kind === 'delete'} title="حذف عملية بيع" busy={d.busy} error={d.error}
        text={d.dialog?.row ? `حذف بيع ${Number(d.dialog.row.qty)} × ${productLabel(d.dialog.row)}؟\nالقطع ترجع إلى المخزون.` : ''}
        yes="نعم، احذف" onYes={doDelete} onClose={d.close} />
    </>
  );
}

const styles = StyleSheet.create({
  hint: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 24, color: colors.inkMuted, textAlign: 'center' },
  label: { fontFamily: font.bodyBold, fontSize: 17, lineHeight: 26, color: colors.ink, writingDirection: 'rtl', textAlign: 'right' },
});
