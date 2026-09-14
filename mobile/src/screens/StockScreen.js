import React, { useMemo, useState } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { api } from '../api';
import { useData } from '../hooks';
import { colors, font, slashDate } from '../theme';
import { Loader } from '../components/ui';
import { BigButton, Stepper, Notice, Sheet, TONES } from '../components/simple';
import {
  Page, RangeSheet, DataTable, ActionBar, SelectField, InfoLine, Flash, useDialog, useGoBack, productLabel,
} from '../components/kit';

const moveLabel = (m) => {
  if ((m.reason || '').startsWith('بيع')) return 'بيع';
  if (m.reason) return m.reason;
  return m.kind === 'in' ? 'دخول' : m.kind === 'out' ? 'خروج' : 'تعديل';
};

/**
 * المخزون.
 *  - فرع واحد: المنتج / الكمية المتبقية. المستخدم الرئيسي يضيف الكميات ويعدّلها هنا.
 *  - بدون storeId: المخزون الكلي (كل الفروع معا)، والضغط على منتج يُظهر كميته في كل فرع.
 *  - مع from و to: حركات المخزون في تلك المدة.
 */
export default function StockScreen({ storeId, branchName, owner, basePath, backTo }) {
  const router = useRouter();
  const params = useLocalSearchParams();
  const report = params.from && params.to ? { from: String(params.from), to: String(params.to) } : null;
  const goBack = useGoBack(report ? basePath : backTo);
  const [selected, setSelected] = useState(null);
  const d = useDialog();

  const allBranches = !storeId;
  const { data, loading, refreshing, error: loadError, reload } = useData(report ? {
    moves: ['/api/stock/moves', { store_id: storeId || undefined, ...report }],
  } : {
    stock: ['/api/stock', { store_id: storeId || undefined }],
    ...(owner && storeId ? { products: ['/api/products', {}] } : {}),
  }, [storeId, report?.from, report?.to]);

  const rows = report ? (data.moves?.rows || []) : (data.stock?.rows || []);
  const picked = !report ? rows.find((r) => r.product_id === selected) : null;

  const catalogue = useMemo(() => (data.products?.products || []).map((p) => ({
    value: p.id, label: productLabel(p),
  })), [data.products]);

  // ------------------------------------------------------------ الجدول
  const outTone = (r) => (Number(r.qty) <= 0 ? TONES.red.fg : colors.ink);
  const columns = report ? [
    { key: 'day', label: 'التاريخ', flex: 0.9, render: (r) => slashDate(r.day).slice(5) },
    allBranches && { key: 'store', label: 'الفرع', flex: 1, render: (r) => r.store_name },
    { key: 'name', label: 'المنتج', flex: 1.5, render: productLabel },
    { key: 'kind', label: 'الحركة', flex: 1.1, render: moveLabel },
    {
      key: 'qty', label: 'الكمية', flex: 0.8, align: 'center', bold: true,
      render: (r) => (Number(r.qty) > 0 ? `+${Number(r.qty)}` : String(Number(r.qty))),
      color: (r) => (Number(r.qty) > 0 ? TONES.green.fg : TONES.red.fg),
    },
  ].filter(Boolean) : [
    { key: 'name', label: 'المنتج', flex: 2, render: productLabel },
    {
      key: 'qty', label: allBranches ? 'الكمية الكلية' : 'الكمية المتبقية', flex: 1, align: 'center', bold: true,
      render: (r) => (Number(r.qty) <= 0 ? 'نفد' : Number(r.qty)), color: outTone,
    },
  ];

  const needRow = () => {
    if (picked) return true;
    d.flash('اختر منتجا من الجدول أولا، ثم اضغط الزر', 'orange');
    return false;
  };

  const canEdit = owner && storeId && !report;
  const actions = report ? [] : [
    canEdit && { label: 'إضافة كمية', icon: 'plus', tone: 'green', onPress: () => d.open({ kind: 'add' }, { product: '', qty: 1 }) },
    canEdit && {
      label: 'تعديل الكمية', icon: 'edit-2', tone: 'blue',
      onPress: () => needRow() && d.open({ kind: 'set', row: picked }, { qty: Number(picked.qty) }),
    },
    owner && { label: 'بحث بمدة', icon: 'search', tone: 'orange', onPress: () => d.open({ kind: 'range' }) },
  ];

  // ------------------------------------------------------------ حفظ
  const saveAdd = () => d.run(async () => {
    const product = catalogue.find((o) => o.value === d.form.product);
    const qty = Math.floor(Number(d.form.qty));
    if (!product) throw new Error('اختر المنتج');
    if (!(qty > 0)) throw new Error('اختر الكمية');
    const res = await api.post('/api/stock/add', { store_id: storeId, product_id: product.value, qty });
    d.finish();
    d.flash(`أضفت ${qty} × ${product.label}. الموجود الآن: ${res.qty}`);
  });

  const saveSet = () => d.run(async () => {
    const qty = Math.floor(Number(d.form.qty));
    if (!(qty >= 0)) throw new Error('اختر الكمية');
    await api.post('/api/stock/set', { store_id: storeId, product_id: d.dialog.row.product_id, qty });
    d.finish();
    d.flash(`تم: الكمية الآن ${qty}`);
  });

  if (loading && !data.stock && !data.moves) return <Loader text="جاري التحميل…" />;

  const title = report
    ? `حركة المخزون من ${slashDate(report.from)} إلى ${slashDate(report.to)}`
    : allBranches ? 'المخزون الكلي' : 'المخزون';
  const total = report ? null : Number(data.stock?.total || 0);

  return (
    <>
      <Page title={title} subtitle={branchName || (allBranches ? 'كل الفروع' : undefined)} onBack={goBack}
        refreshing={refreshing} onRefresh={reload}
        footer={actions.filter(Boolean).length ? <ActionBar actions={actions} /> : null}>
        <Flash notice={d.notice} />
        {loadError ? <Notice text={loadError} tone="red" /> : null}

        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(r) => (report ? r.id : r.product_id)}
          selected={report ? undefined : selected}
          onSelect={report ? undefined : setSelected}
          empty={report ? 'لا توجد حركات في هذه المدة'
            : owner && storeId ? 'المخزون فارغ. اضغط «إضافة كمية».'
              : allBranches ? 'لا توجد منتجات بعد' : 'لا يوجد شيء في المخزون بعد'}
          totalLabel={report ? undefined : 'مجموع القطع'}
          total={total}
        />

        {allBranches && picked ? (
          <View style={{ gap: 8 }}>
            <Text style={styles.section}>{productLabel(picked)} في الفروع:</Text>
            {(picked.branches || []).length === 0
              ? <Text style={styles.hint}>ليس في أي فرع بعد.</Text>
              : picked.branches.map((b) => <InfoLine key={b.store} label={b.store} value={Number(b.qty)} />)}
          </View>
        ) : null}
        {!report && rows.length && (canEdit || allBranches) && !picked ? (
          <Text style={styles.hint}>
            {canEdit ? 'اضغط على منتج لاختياره، ثم «تعديل الكمية».' : 'اضغط على منتج لترى كميته في كل فرع.'}
          </Text>
        ) : null}
      </Page>

      <RangeSheet visible={d.dialog?.kind === 'range'} title="حركة المخزون بمدة" onClose={d.close}
        onSearch={({ from, to }) => { d.finish(); router.push({ pathname: basePath, params: { from, to } }); }} />

      <Sheet visible={d.dialog?.kind === 'add'} title="إضافة كمية" onClose={d.close}
        footer={<BigButton label="إضافة" icon="check" tone="green" loading={d.busy} onPress={saveAdd} />}>
        <SelectField label="المنتج" value={d.form.product} options={catalogue} onChange={d.set('product')}
          placeholder="اضغط لاختيار المنتج" empty="لا توجد منتجات. أضفها أولا من صفحة «المنتجات»." />
        <Text style={styles.label}>كم قطعة؟</Text>
        <Stepper value={d.form.qty ?? 1} onChange={d.set('qty')} />
        <Notice text={d.error} tone="red" />
      </Sheet>

      <Sheet visible={d.dialog?.kind === 'set'} title="تعديل الكمية" onClose={d.close}
        footer={<BigButton label="حفظ" icon="check" tone="green" loading={d.busy} onPress={saveSet} />}>
        <InfoLine label="المنتج" value={productLabel(d.dialog?.row)} />
        <InfoLine label="الموجود في الجدول" value={Number(d.dialog?.row?.qty || 0)} />
        <Text style={styles.label}>كم قطعة موجودة فعلا الآن؟</Text>
        <Stepper value={d.form.qty ?? 0} onChange={d.set('qty')} min={0} />
        <Notice text={d.error} tone="red" />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  hint: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 24, color: colors.inkMuted, textAlign: 'center' },
  label: { fontFamily: font.bodyBold, fontSize: 17, lineHeight: 26, color: colors.ink, writingDirection: 'rtl', textAlign: 'right' },
  section: { fontFamily: font.bodyBlack, fontSize: 18, lineHeight: 28, color: colors.ink, writingDirection: 'rtl', textAlign: 'right' },
});
