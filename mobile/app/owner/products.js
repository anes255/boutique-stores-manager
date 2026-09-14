import React, { useMemo, useState } from 'react';
import { Text, StyleSheet } from 'react-native';

import { api } from '../../src/api';
import { useData } from '../../src/hooks';
import { colors, font, money } from '../../src/theme';
import { Loader } from '../../src/components/ui';
import {
  BigButton, BigField, Stepper, Notice, Sheet, SizePicker, ColorPicker,
} from '../../src/components/simple';
import {
  Page, DataTable, ActionBar, SelectField, InfoLine, ConfirmSheet, Flash, useDialog, useGoBack, toNumber, productLabel,
} from '../../src/components/kit';

/**
 * المنتجات: إضافة / تعديل / حذف، و«إضافة كمية لفرع».
 * كل منتج بمقاس ولون واحد: فستان M أسود وفستان L أسود منتجان.
 */
export default function Products() {
  const goBack = useGoBack('/owner');
  const [selected, setSelected] = useState(null);
  const d = useDialog();

  const { data, loading, refreshing, error: loadError, reload } = useData({
    products: ['/api/products', {}],
    stores: ['/api/stores', {}],
  }, []);

  const products = data.products?.products || [];
  const picked = products.find((p) => p.id === selected);
  const branches = useMemo(() => (data.stores?.stores || []).map((s) => ({ value: s.id, label: s.name })), [data.stores]);

  const needRow = () => {
    if (picked) return true;
    d.flash('اختر منتجا من الجدول أولا، ثم اضغط الزر', 'orange');
    return false;
  };

  const emptyForm = { name: '', size: '', color: '', cost: '', sell: '' };

  const save = () => d.run(async () => {
    const f = d.form;
    const name = (f.name || '').trim();
    const cost = toNumber(f.cost || 0);
    const sell = toNumber(f.sell);
    if (!name) throw new Error('اكتب اسم المنتج');
    if (!(cost >= 0)) throw new Error('سعر الشراء غير صحيح');
    if (!(sell > 0)) throw new Error('اكتب سعر البيع');
    const body = {
      name, cost_price: cost, sell_price: sell,
      size: (f.size || '').trim() || null, color: (f.color || '').trim() || null,
    };
    if (d.dialog.row) {
      await api.patch(`/api/products/${d.dialog.row.id}`, body);
      d.finish();
      d.flash(`تم حفظ "${productLabel(body)}"`);
    } else {
      const res = await api.post('/api/products', body);
      setSelected(res.product.id);
      // مباشرة بعد الإضافة: في أي فرع توجد قطع منه؟
      d.open({ kind: 'stock', row: res.product, fresh: true }, { store: branches.length === 1 ? branches[0].value : '', qty: 1 });
    }
  });

  const addStock = () => d.run(async () => {
    const qty = Math.floor(Number(d.form.qty));
    if (!d.form.store) throw new Error('اختر الفرع');
    if (!(qty > 0)) throw new Error('اختر الكمية');
    await api.post('/api/stock/add', { store_id: d.form.store, product_id: d.dialog.row.id, qty });
    const branch = branches.find((b) => b.value === d.form.store);
    d.finish();
    d.flash(`أضفت ${qty} × ${productLabel(d.dialog.row)} إلى ${branch?.label || 'الفرع'}`);
  });

  const remove = () => d.run(async () => {
    await api.del(`/api/products/${d.dialog.row.id}`);
    setSelected(null);
    d.finish();
    d.flash('تم حذف المنتج');
  });

  if (loading && !data.products) return <Loader text="جاري التحميل…" />;

  const f = d.form;
  const warn = toNumber(f.sell) > 0 && toNumber(f.cost) > toNumber(f.sell);

  return (
    <>
      <Page title="المنتجات" onBack={goBack} refreshing={refreshing} onRefresh={reload}
        footer={(
          <ActionBar actions={[
            { label: 'إضافة', icon: 'plus', tone: 'green', onPress: () => d.open({ kind: 'form' }, emptyForm) },
            {
              label: 'تعديل', icon: 'edit-2', tone: 'blue',
              onPress: () => needRow() && d.open({ kind: 'form', row: picked }, {
                name: picked.name, size: picked.size || '', color: picked.color || '',
                cost: String(Number(picked.cost_price)), sell: String(Number(picked.sell_price)),
              }),
            },
            { label: 'حذف', icon: 'trash-2', tone: 'red', onPress: () => needRow() && d.open({ kind: 'delete', row: picked }) },
            {
              label: 'إضافة كمية لفرع', icon: 'package', tone: 'orange',
              onPress: () => needRow() && d.open({ kind: 'stock', row: picked },
                { store: branches.length === 1 ? branches[0].value : '', qty: 1 }),
            },
          ]} />
        )}>
        <Flash notice={d.notice} />
        {loadError ? <Notice text={loadError} tone="red" /> : null}

        <DataTable
          columns={[
            { key: 'name', label: 'المنتج', flex: 1.4, bold: true },
            { key: 'size', label: 'المقاس', flex: 1, align: 'center', render: (r) => r.size || '-' },
            { key: 'color', label: 'اللون', flex: 0.9, align: 'center', render: (r) => r.color || '-' },
            { key: 'price', label: 'السعر', flex: 1.1, align: 'center', render: (r) => money(r.sell_price) },
            { key: 'qty', label: 'الكمية', flex: 0.8, align: 'center', render: (r) => Number(r.qty) },
          ]}
          rows={products}
          selected={selected}
          onSelect={setSelected}
          empty="لا توجد منتجات بعد. اضغط «إضافة»."
        />
        {products.length ? <Text style={styles.hint}>الكمية = مجموع القطع في كل الفروع.</Text> : null}
      </Page>

      <Sheet visible={d.dialog?.kind === 'form'} title={d.dialog?.row ? 'تعديل منتج' : 'إضافة منتج'} onClose={d.close}
        footer={<BigButton label={d.dialog?.row ? 'حفظ' : 'إضافة'} icon="check" tone="green" loading={d.busy} onPress={save} />}>
        <BigField label="اسم المنتج" value={f.name || ''} onChangeText={d.set('name')} placeholder="مثال: فستان صيفي" />
        <Text style={styles.label}>المقاس</Text>
        <SizePicker value={f.size || ''} onChange={d.set('size')} />
        <BigField value={f.size || ''} onChangeText={d.set('size')} placeholder="أو اكتب المقاس، مثلا 38" autoCorrect={false} />
        <Text style={styles.label}>اللون</Text>
        <ColorPicker value={f.color || ''} onChange={d.set('color')} />
        <BigField value={f.color || ''} onChangeText={d.set('color')} placeholder="أو اكتب اللون" />
        <BigField label="سعر الشراء" value={f.cost ?? ''} onChangeText={d.set('cost')} keyboardType="numeric" placeholder="0" />
        <BigField label="سعر البيع" value={f.sell ?? ''} onChangeText={d.set('sell')} keyboardType="numeric" placeholder="0" />
        {warn ? <Notice text="انتبه: سعر البيع أقل من سعر الشراء، ستخسر في كل قطعة." tone="red" /> : null}
        <Notice text={d.error} tone="red" />
      </Sheet>

      <Sheet visible={d.dialog?.kind === 'stock'}
        title={d.dialog?.fresh ? 'تمت الإضافة! كم قطعة عندك منه، وفي أي فرع؟' : 'إضافة كمية لفرع'}
        onClose={d.close}
        footer={(
          <>
            <BigButton label="إضافة للمخزون" icon="check" tone="green" loading={d.busy} onPress={addStock} />
            {d.dialog?.fresh ? <BigButton label="لاحقا" tone="grey" filled={false} onPress={d.finish} /> : null}
          </>
        )}>
        <InfoLine label="المنتج" value={productLabel(d.dialog?.row)} />
        <SelectField label="الفرع" value={f.store} options={branches} onChange={d.set('store')}
          placeholder="اضغط لاختيار الفرع" empty="لا توجد فروع. أضف فرعا أولا من «الفروع»." />
        <Text style={styles.label}>كم قطعة؟</Text>
        <Stepper value={f.qty ?? 1} onChange={d.set('qty')} />
        <Notice text={d.error} tone="red" />
      </Sheet>

      <ConfirmSheet visible={d.dialog?.kind === 'delete'} title="حذف منتج" busy={d.busy} error={d.error}
        text={`حذف "${productLabel(d.dialog?.row)}"؟\nكمياته في كل الفروع تُحذف معه. عمليات البيع القديمة تبقى.`}
        yes="نعم، احذف" onYes={remove} onClose={d.close} />
    </>
  );
}

const styles = StyleSheet.create({
  hint: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 24, color: colors.inkMuted, textAlign: 'center' },
  label: { fontFamily: font.bodyBold, fontSize: 17, lineHeight: 26, color: colors.ink, writingDirection: 'rtl', textAlign: 'right' },
});
