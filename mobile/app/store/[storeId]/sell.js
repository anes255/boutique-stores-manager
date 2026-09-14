import React, { useMemo, useState } from 'react';
import { Text, StyleSheet } from 'react-native';

import { api } from '../../../src/api';
import { useData } from '../../../src/hooks';
import { useStoreRouteId, useBranch } from '../../../src/store-route';
import { colors, font, money, todayIso } from '../../../src/theme';
import { Loader } from '../../../src/components/ui';
import { BigButton, BigField, Stepper, Notice } from '../../../src/components/simple';
import { Page, SelectField, InfoLine, Flash, useDialog, useGoBack, toNumber, productLabel } from '../../../src/components/kit';

/** بيع منتج: المنتج ▼، الكمية، السعر، ثم «بيع». */
export default function Sell() {
  const storeId = useStoreRouteId();
  const branch = useBranch();
  const goBack = useGoBack(`/store/${storeId}`);
  const d = useDialog();
  const [product, setProduct] = useState('');
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState('');

  const { data, loading, error: loadError } = useData({
    products: ['/api/products', { store_id: storeId }],
  }, [storeId]);

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
  const chosen = options.find((o) => o.value === product);

  const sell = () => d.run(async () => {
    const n = Math.floor(toNumber(qty));
    const p = toNumber(price);
    if (!chosen) throw new Error('اختر المنتج');
    if (!(n > 0)) throw new Error('اختر الكمية');
    if (n > chosen.qty) throw new Error(`بقي ${chosen.qty} فقط`);
    if (String(price).trim() === '' || !(p >= 0)) throw new Error('اكتب السعر');
    await api.post('/api/sales', { store_id: storeId, product_id: chosen.value, qty: n, unit_price: p });
    d.flash(`تم البيع: ${n} × ${chosen.label} = ${money(n * p)}`);
    setProduct('');
    setQty(1);
    setPrice('');
  });

  if (loading && !data.products) return <Loader text="جاري التحميل…" />;

  const n = Math.floor(toNumber(qty)) || 0;
  const p = toNumber(price) || 0;

  return (
    <Page title="بيع منتج" subtitle={branch.name} date={todayIso()} onBack={goBack}
      footer={<BigButton label="بيع" icon="check" tone="green" loading={d.busy} onPress={sell} />}>
      <Flash notice={d.notice} />
      {loadError ? <Notice text={loadError} tone="red" /> : null}

      <SelectField label="المنتج" value={product} options={options}
        placeholder="اضغط لاختيار المنتج"
        empty="لا توجد منتجات في مخزون هذا الفرع بعد"
        onChange={(v) => {
          const o = options.find((x) => x.value === v);
          setProduct(v);
          setPrice(String(o?.price ?? ''));
          setQty(1);
        }} />

      <Text style={styles.label}>الكمية</Text>
      <Stepper value={qty} onChange={setQty} max={chosen?.qty} />
      {chosen ? <Text style={styles.hint}>الموجود: {chosen.qty}</Text> : null}

      <BigField label="السعر (للقطعة)" value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="0" />

      {chosen && n > 0 ? <InfoLine label="المجموع" value={money(n * p)} tone={colors.primaryDark} /> : null}
      <Notice text={d.error} tone="red" />
    </Page>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: font.bodyBold, fontSize: 17, lineHeight: 26, color: colors.ink, writingDirection: 'rtl', textAlign: 'right' },
  hint: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 24, color: colors.inkMuted, textAlign: 'center' },
});
