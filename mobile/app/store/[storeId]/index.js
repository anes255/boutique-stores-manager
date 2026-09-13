import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';

import { api } from '../../../src/api';
import { useAuth } from '../../../src/auth';
import { useData } from '../../../src/hooks';
import { useStoreRouteId } from '../../../src/store-route';
import { colors, font, money, row, spacing } from '../../../src/theme';
import { Screen, Loader } from '../../../src/components/ui';
import {
  TopBar, BigButton, BigField, StatCard, Toggle, Stepper, Notice, Sheet, Feather, TONES,
} from '../../../src/components/simple';

/**
 * شاشة المحل — الشاشة الوحيدة. من الأعلى إلى الأسفل:
 * الربح / الخسارة / المصاريف، زرّان كبيران، ثم قائمة المنتجات.
 * الضغط على منتج يفتح نافذة بأزرار واضحة: بعت، أضف، تالف، تعديل، حذف.
 */

const toNumber = (v) => {
  const n = Number(String(v ?? '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : NaN;
};

const EXPENSE_KINDS = [
  { label: 'كراء', value: 'rent' },
  { label: 'كهرباء وماء', value: 'utilities' },
  { label: 'نقل', value: 'transport' },
  { label: 'أخرى', value: 'other' },
];

export default function StoreScreen() {
  const storeId = useStoreRouteId();
  const router = useRouter();
  const { user, isAdmin, logout } = useAuth();

  const [period, setPeriod] = useState('today');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState(null);

  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const { data, loading, refreshing, error: loadError, reload } = useData({
    store: [`/api/stores/${storeId}`, {}],
    sum: ['/api/stats/simple', { store_id: storeId }],
    products: ['/api/products', { store_id: storeId, limit: 200 }],
  }, [storeId]);

  const store = data.store?.store;
  const p = data.sum?.[period] || { profit: 0, loss: 0, costs: 0, net: 0, sales: 0 };
  const products = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data.products?.products || [])
      .filter((x) => x.is_active)
      .filter((x) => !q || String(x.name).toLowerCase().includes(q));
  }, [data.products, search]);
  const allCount = (data.products?.products || []).filter((x) => x.is_active).length;

  const flash = (text) => { setNotice(text); setTimeout(() => setNotice(null), 3500); };
  const open = (d, initial = {}) => { setError(null); setForm(initial); setDialog(d); };
  const close = () => { if (!busy) { setDialog(null); setError(null); } };
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function run(fn) {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  // ------------------------------------------------------------ actions
  const saveQty = () => run(async () => {
    const { product, mode } = dialog;
    const qty = Math.floor(toNumber(form.qty));
    if (!(qty > 0)) throw new Error('اختر عدد القطع');
    const stock = Number(product.stock);
    if ((mode === 'sell' || mode === 'loss') && qty > stock) throw new Error(`بقي ${stock} فقط`);

    if (mode === 'sell') {
      await api.post('/api/sales', {
        store_id: storeId,
        payment_method: 'cash',
        items: [{ product_id: product.id, name: product.name, qty, unit_price: Number(product.sell_price) }],
      });
      const gain = (Number(product.sell_price) - Number(product.cost_price)) * qty;
      flash(`بعت ${qty} × ${product.name} · الربح ${money(gain)}`);
    } else if (mode === 'add') {
      await api.post(`/api/products/${product.id}/stock`, { qty, reason: 'زيادة المخزون' });
      flash(`أضفت ${qty} × ${product.name} إلى المخزون`);
    } else {
      const res = await api.post(`/api/products/${product.id}/loss`, { qty });
      flash(`سُجّلت خسارة ${money(res.amount)} (${qty} × ${product.name})`);
    }
    setDialog(null);
  });

  const saveProduct = () => run(async () => {
    const name = (form.name || '').trim();
    const cost = toNumber(form.cost || 0);
    const sell = toNumber(form.sell);
    const stock = toNumber(form.stock || 0);
    if (!name) throw new Error('اكتب اسم المنتج');
    if (!(cost >= 0)) throw new Error('سعر الشراء غير صحيح');
    if (!(sell > 0)) throw new Error('اكتب سعر البيع');
    if (!(stock >= 0)) throw new Error('الكمية غير صحيحة');
    const payload = { name, cost_price: cost, sell_price: sell, stock: Math.floor(stock) };
    if (dialog.product) {
      await api.patch(`/api/products/${dialog.product.id}`, payload);
      flash(`تم حفظ "${name}"`);
    } else {
      await api.post('/api/products', { ...payload, store_id: storeId, unit: 'piece' });
      flash(`تمت إضافة "${name}"`);
    }
    setDialog(null);
  });

  const saveExpense = () => run(async () => {
    const amount = toNumber(form.amount);
    const kind = EXPENSE_KINDS.find((k) => k.value === form.kind) || EXPENSE_KINDS[3];
    const label = (form.label || '').trim() || kind.label;
    if (!(amount > 0)) throw new Error('اكتب المبلغ');
    await api.post('/api/expenses', { store_id: storeId, category: kind.value, label, amount });
    flash(`سُجّل مصروف ${money(amount)} (${label})`);
    setDialog(null);
  });

  const confirmYes = () => run(async () => {
    await dialog.onYes();
    setDialog(null);
    if (dialog.done) flash(dialog.done);
  });

  // ------------------------------------------------------------ screen
  if (loading && !store) return <Loader text="جاري فتح المحل…" />;

  const netTone = p.net >= 0 ? TONES.green : TONES.red;
  const product = dialog?.product;
  const qtyNum = Math.floor(toNumber(form.qty)) || 0;
  const perPiece = product ? Number(product.sell_price) - Number(product.cost_price) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar
        title={store?.name || 'المحل'}
        subtitle={isAdmin ? 'عرض المالك' : `أهلا ${(user?.full_name || '').split(' ')[0]}`}
        actionLabel={isAdmin ? 'رجوع' : 'خروج'}
        actionIcon={isAdmin ? 'chevron-right' : 'log-out'}
        onAction={() => (isAdmin
          ? router.replace('/admin')
          : open({
            kind: 'confirm', text: 'هل تريد الخروج من التطبيق؟', yes: 'نعم، اخرج',
            onYes: async () => { await logout(); router.replace('/login'); },
          }))}
      />

      <Screen refreshing={refreshing} onRefresh={reload}>
        <Notice text={notice} />
        {loadError ? <Notice text={loadError} tone="red" /> : null}

        <Toggle
          options={[{ label: 'اليوم', value: 'today' }, { label: 'هذا الشهر', value: 'month' }]}
          value={period}
          onChange={setPeriod}
        />

        <StatCard tone="green" icon="trending-up" label="الربح" hint="من البيع" value={money(p.profit)} />
        <StatCard tone="red" icon="alert-triangle" label="الخسارة" hint="بضاعة تالفة أو ضائعة" value={money(p.loss)} />
        <StatCard tone="orange" icon="credit-card" label="المصاريف" hint="كراء، كهرباء…" value={money(p.costs)} />

        <View style={[styles.net, { borderColor: netTone.solid }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.netLabel}>الباقي لك</Text>
            <Text style={styles.netHint}>الربح ناقص الخسارة والمصاريف · {p.sales} عملية بيع</Text>
          </View>
          <Text style={[styles.netValue, { color: netTone.fg }]} numberOfLines={1} adjustsFontSizeToFit>
            {money(p.net)}
          </Text>
        </View>

        <BigButton label="منتج جديد" icon="plus-circle" tone="green"
          onPress={() => open({ kind: 'product-form' }, { name: '', cost: '', sell: '', stock: '' })} />
        <BigButton label="مصروف جديد" icon="credit-card" tone="orange"
          onPress={() => open({ kind: 'expense' }, { kind: 'rent', label: '', amount: '' })} />

        <Text style={styles.section}>منتجاتي ({allCount})</Text>
        {allCount > 6 ? (
          <BigField value={search} onChangeText={setSearch} placeholder="ابحث عن منتج…" autoCorrect={false} />
        ) : null}

        {allCount === 0 ? (
          <View style={styles.empty}>
            <Feather name="package" size={40} color={colors.primary} />
            <Text style={styles.emptyText}>لا توجد منتجات بعد.{'\n'}اضغط «منتج جديد» لإضافة أول منتج.</Text>
          </View>
        ) : null}

        {products.map((x) => {
          const stock = Number(x.stock);
          const out = stock <= 0;
          const low = !out && stock <= Number(x.low_stock_at);
          const t = out ? TONES.red : low ? TONES.orange : TONES.green;
          return (
            <Pressable key={x.id} onPress={() => open({ kind: 'product', product: x })}
              style={({ pressed }) => [styles.product, pressed && { opacity: 0.85 }]}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.productName} numberOfLines={2}>{x.name}</Text>
                <View style={{ flexDirection: row, gap: 8, flexWrap: 'wrap' }}>
                  <View style={[styles.pill, { backgroundColor: t.soft }]}>
                    <Text style={[styles.pillText, { color: t.fg }]}>{out ? 'نفد' : `الكمية: ${stock}`}</Text>
                  </View>
                  <View style={[styles.pill, { backgroundColor: colors.bgAlt }]}>
                    <Text style={[styles.pillText, { color: colors.ink }]}>السعر: {money(x.sell_price)}</Text>
                  </View>
                </View>
              </View>
              <Feather name="chevron-left" size={26} color={colors.inkMuted} />
            </Pressable>
          );
        })}
      </Screen>

      {/* ------------------------------------------------ نافذة المنتج */}
      <Sheet visible={dialog?.kind === 'product'} title={product?.name} onClose={close}
        footer={(
          <>
            <BigButton label="بعت" icon="check-circle" tone="green" disabled={Number(product?.stock) <= 0}
              onPress={() => open({ kind: 'qty', mode: 'sell', product }, { qty: '1' })} />
            <BigButton label="أضف للمخزون" icon="plus" tone="blue"
              onPress={() => open({ kind: 'qty', mode: 'add', product }, { qty: '1' })} />
            <BigButton label="تالف أو ضائع" icon="alert-triangle" tone="red" disabled={Number(product?.stock) <= 0}
              onPress={() => open({ kind: 'qty', mode: 'loss', product }, { qty: '1' })} />
            <View style={{ flexDirection: row, gap: 10 }}>
              <BigButton label="تعديل" icon="edit-2" tone="grey" filled={false} style={{ flex: 1 }}
                onPress={() => open({ kind: 'product-form', product }, {
                  name: product.name, cost: String(Number(product.cost_price)),
                  sell: String(Number(product.sell_price)), stock: String(Number(product.stock)),
                })} />
              <BigButton label="حذف" icon="trash-2" tone="red" filled={false} style={{ flex: 1 }}
                onPress={() => open({
                  kind: 'confirm', text: `حذف "${product.name}" من منتجاتك؟`, yes: 'نعم، احذف',
                  done: `تم حذف "${product.name}"`,
                  onYes: () => api.del(`/api/products/${product.id}`),
                })} />
            </View>
          </>
        )}>
        {product ? (
          <View style={{ gap: 10 }}>
            <View style={styles.bigStock}>
              <Text style={styles.bigStockLabel}>الكمية الموجودة</Text>
              <Text style={[styles.bigStockValue, Number(product.stock) <= 0 && { color: TONES.red.fg }]}>
                {Number(product.stock) <= 0 ? 'نفد' : Number(product.stock)}
              </Text>
            </View>
            <Line label="سعر الشراء" value={money(product.cost_price)} />
            <Line label="سعر البيع" value={money(product.sell_price)} />
            <Line label="الربح في القطعة" value={money(perPiece)} tone={perPiece >= 0 ? TONES.green.fg : TONES.red.fg} />
          </View>
        ) : null}
      </Sheet>

      {/* ------------------------------------------------ كم قطعة؟ */}
      <Sheet visible={dialog?.kind === 'qty'}
        title={dialog?.mode === 'sell' ? `كم قطعة بعت؟` : dialog?.mode === 'add' ? 'كم قطعة أضفت؟' : 'كم قطعة تلفت أو ضاعت؟'}
        onClose={close}
        footer={(
          <BigButton
            label={dialog?.mode === 'sell' ? 'نعم، بعت' : dialog?.mode === 'add' ? 'أضف' : 'سجّل الخسارة'}
            icon="check"
            tone={dialog?.mode === 'sell' ? 'green' : dialog?.mode === 'add' ? 'blue' : 'red'}
            loading={busy} onPress={saveQty} />
        )}>
        {product ? <Text style={styles.qtyProduct}>{product.name}</Text> : null}
        <Stepper value={form.qty ?? '1'} onChange={set('qty')}
          max={dialog?.mode === 'add' ? undefined : Number(product?.stock)} />
        {product && qtyNum > 0 ? (
          <Text style={[styles.preview, {
            color: dialog?.mode === 'sell' ? TONES.green.fg : dialog?.mode === 'loss' ? TONES.red.fg : colors.inkSoft,
          }]}>
            {dialog?.mode === 'sell'
              ? `ستربح ${money(perPiece * qtyNum)}`
              : dialog?.mode === 'loss'
                ? `ستُسجَّل خسارة ${money(Number(product.cost_price) * qtyNum)}`
                : `ستصبح الكمية ${Number(product.stock) + qtyNum}`}
          </Text>
        ) : null}
        {dialog?.mode !== 'add' && product ? (
          <Text style={styles.hintCenter}>الموجود الآن: {Number(product.stock)}</Text>
        ) : null}
        <Notice text={error} tone="red" />
      </Sheet>

      {/* ------------------------------------------------ منتج جديد / تعديل */}
      <Sheet visible={dialog?.kind === 'product-form'} title={dialog?.product ? 'تعديل المنتج' : 'منتج جديد'}
        onClose={close}
        footer={<BigButton label="حفظ" icon="check" tone="green" loading={busy} onPress={saveProduct} />}>
        <BigField label="اسم المنتج" value={form.name || ''} onChangeText={set('name')} placeholder="مثال: فستان صيفي" />
        <BigField label="بكم اشتريته؟ (سعر الشراء)" value={form.cost ?? ''} onChangeText={set('cost')}
          placeholder="0" keyboardType="numeric" />
        <BigField label="بكم تبيعه؟ (سعر البيع)" value={form.sell ?? ''} onChangeText={set('sell')}
          placeholder="0" keyboardType="numeric" />
        <BigField label="كم قطعة عندك؟" value={form.stock ?? ''} onChangeText={set('stock')}
          placeholder="0" keyboardType="number-pad" />
        {toNumber(form.sell) > 0 && toNumber(form.cost) > toNumber(form.sell) ? (
          <Notice text="انتبه: سعر البيع أقل من سعر الشراء، ستخسر في كل قطعة." tone="red" />
        ) : null}
        <Notice text={error} tone="red" />
      </Sheet>

      {/* ------------------------------------------------ مصروف */}
      <Sheet visible={dialog?.kind === 'expense'} title="مصروف جديد" onClose={close}
        footer={<BigButton label="حفظ المصروف" icon="check" tone="orange" loading={busy} onPress={saveExpense} />}>
        <Text style={styles.fieldTitle}>على ماذا دفعت؟</Text>
        <View style={styles.kinds}>
          {EXPENSE_KINDS.map((k) => (
            <BigButton key={k.value} small label={k.label} tone="orange" filled={form.kind === k.value}
              style={styles.kind} onPress={() => set('kind')(k.value)} />
          ))}
        </View>
        <BigField label="ملاحظة (اختياري)" value={form.label || ''} onChangeText={set('label')}
          placeholder="مثال: كراء شهر سبتمبر" />
        <BigField label="كم دفعت؟" value={form.amount || ''} onChangeText={set('amount')}
          placeholder="0" keyboardType="numeric" />
        <Notice text={error} tone="red" />
      </Sheet>

      {/* ------------------------------------------------ تأكيد */}
      <Sheet visible={dialog?.kind === 'confirm'} title="تأكيد" onClose={close}
        footer={(
          <View style={{ flexDirection: row, gap: 10 }}>
            <BigButton label="لا" tone="grey" filled={false} style={{ flex: 1 }} onPress={close} />
            <BigButton label={dialog?.yes || 'نعم'} tone="red" style={{ flex: 2 }} loading={busy} onPress={confirmYes} />
          </View>
        )}>
        <Text style={styles.confirmText}>{dialog?.text}</Text>
        <Notice text={error} tone="red" />
      </Sheet>
    </View>
  );
}

function Line({ label, value, tone }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={[styles.lineValue, tone && { color: tone }]}>{value}</Text>
    </View>
  );
}

const rtl = { writingDirection: 'rtl', textAlign: 'right' };

const styles = StyleSheet.create({
  net: {
    flexDirection: row, alignItems: 'center', gap: 12, padding: 16,
    borderRadius: 20, borderWidth: 2, backgroundColor: '#FFFFFF',
  },
  netLabel: { fontFamily: font.display, fontSize: 22, lineHeight: 34, color: colors.ink, ...rtl },
  netHint: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 22, color: colors.inkMuted, ...rtl },
  netValue: { fontFamily: font.bodyBlack, fontSize: 28, lineHeight: 40, maxWidth: '55%', textAlign: 'left' },

  section: { fontFamily: font.display, fontSize: 22, lineHeight: 34, color: colors.ink, marginTop: 6, ...rtl },
  empty: { alignItems: 'center', gap: 12, paddingVertical: spacing.xl },
  emptyText: { fontFamily: font.bodyBold, fontSize: 18, lineHeight: 30, color: colors.inkSoft, textAlign: 'center' },

  product: {
    flexDirection: row, alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF',
    borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.lineSoft,
  },
  productName: { fontFamily: font.bodyBlack, fontSize: 20, lineHeight: 30, color: colors.ink, ...rtl },
  pill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  pillText: { fontFamily: font.bodyBlack, fontSize: 15, lineHeight: 24 },

  bigStock: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 20, padding: 14 },
  bigStockLabel: { fontFamily: font.bodyBold, fontSize: 16, lineHeight: 26, color: colors.inkSoft },
  bigStockValue: { fontFamily: font.bodyBlack, fontSize: 44, lineHeight: 58, color: colors.ink },
  line: {
    flexDirection: row, alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12,
  },
  lineLabel: { fontFamily: font.bodyBold, fontSize: 17, lineHeight: 28, color: colors.inkSoft, ...rtl },
  lineValue: { fontFamily: font.bodyBlack, fontSize: 19, lineHeight: 30, color: colors.ink },

  qtyProduct: { fontFamily: font.bodyBlack, fontSize: 20, lineHeight: 30, color: colors.primary, textAlign: 'center' },
  preview: { fontFamily: font.bodyBlack, fontSize: 21, lineHeight: 32, textAlign: 'center' },
  hintCenter: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 24, color: colors.inkMuted, textAlign: 'center' },

  fieldTitle: { fontFamily: font.bodyBold, fontSize: 17, lineHeight: 26, color: colors.ink, ...rtl },
  kinds: { flexDirection: row, flexWrap: 'wrap', gap: 8 },
  kind: { flexGrow: 1, flexBasis: '45%' },
  confirmText: { fontFamily: font.bodyBold, fontSize: 19, lineHeight: 32, color: colors.ink, ...rtl },
});
