import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList, ScrollView, Alert, Platform, Modal,
  KeyboardAvoidingView, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useStoreRouteId } from '../../../../src/store-route';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '../../../../src/api';
import { useData } from '../../../../src/hooks';
import { colors, font, money, radius, row, shadow, spacing, type } from '../../../../src/theme';
import {
  Header, Button, Field, Loader, ErrorNote, EmptyState,
  Badge, Chips, Feather, tap,
} from '../../../../src/components/ui';

export default function Sell() {
  // المحل يأتي من تخطيط المحل، لا من معاملات هذه الشاشة
  const storeId = useStoreRouteId();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(null);
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState('');
  const [method, setMethod] = useState('cash');
  const [customer, setCustomer] = useState('');
  const [checkout, setCheckout] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const { data, loading, reload } = useData({
    products: ['/api/products', { store_id: storeId, limit: 200 }],
    categories: ['/api/products/meta/categories', { store_id: storeId }],
    store: [`/api/stores/${storeId}`, {}],
  }, [storeId]);

  const currency = data.store?.store?.currency;
  const all = data.products?.products || [];

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((p) => {
      if (!p.is_active) return false;
      if (category && p.category_id !== category) return false;
      if (!q) return true;
      return [p.name, p.sku, p.brand, p.color, p.size]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [all, query, category]);

  const totals = useMemo(() => {
    const subtotal = cart.reduce((s, l) => s + l.qty * Number(l.unit_price), 0);
    const disc = Math.min(Number(discount) || 0, subtotal);
    const cost = cart.reduce((s, l) => s + l.qty * Number(l.cost_price || 0), 0);
    return { subtotal, disc, total: subtotal - disc, profit: subtotal - disc - cost };
  }, [cart, discount]);

  function addToCart(product) {
    tap();
    setError(null);
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.product_id === product.id);
      const inCart = idx >= 0 ? prev[idx].qty : 0;
      if (inCart + 1 > Number(product.stock)) {
        setError(`بقي ${Number(product.stock)} فقط من ${product.name}`);
        return prev;
      }
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [...prev, {
        product_id: product.id,
        name: product.name,
        size: product.size,
        color: product.color,
        unit: product.unit,
        qty: 1,
        unit_price: Number(product.sell_price),
        cost_price: Number(product.cost_price),
        stock: Number(product.stock),
      }];
    });
  }

  function changeQty(productId, delta) {
    tap();
    setCart((prev) => prev.flatMap((l) => {
      if (l.product_id !== productId) return [l];
      const qty = l.qty + delta;
      if (qty <= 0) return [];
      if (qty > l.stock) { setError(`بقي ${l.stock} فقط من ${l.name}`); return [l]; }
      return [{ ...l, qty }];
    }));
  }

  async function submit() {
    if (!cart.length) return;
    setSaving(true);
    setError(null);
    try {
      await api.post('/api/sales', {
        store_id: storeId,
        customer_name: customer.trim() || null,
        discount: Number(discount) || 0,
        payment_method: method,
        items: cart.map((l) => ({
          product_id: l.product_id,
          name: l.name,
          size: l.size,
          color: l.color,
          unit: l.unit,
          qty: l.qty,
          unit_price: l.unit_price,
        })),
      });
      setCart([]); setDiscount(''); setCustomer(''); setCheckout(false);
      reload();
      Alert.alert('تم تسجيل البيع', 'تم تحديث المخزون وأرقام اليوم.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const catOptions = [
    { label: 'الكل', value: null },
    ...(data.categories?.categories || []).map((c) => ({ label: c.name, value: c.id })),
  ];

  if (loading && !all.length) return <Loader text="جاري تحميل المنتجات…" />;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title="بيع" subtitle={data.store?.store?.name}
        right={cart.length ? (
          <Pressable style={styles.cartPill} onPress={() => setCheckout(true)}>
            <Feather name="shopping-cart" size={15} color={colors.white} />
            <Text style={styles.cartPillText}>{cart.reduce((s, l) => s + l.qty, 0)}</Text>
          </Pressable>
        ) : null}
      />

      <View style={{ paddingHorizontal: spacing.md, gap: 10 }}>
        <Field value={query} onChangeText={setQuery} placeholder="ابحث بالاسم أو الرمز أو اللون…"
          autoCorrect={false} />
        <Chips options={catOptions} value={category} onChange={setCategory} />
      </View>

      <ErrorNote message={error} />

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 10, paddingHorizontal: spacing.md, flexDirection: row }}
        contentContainerStyle={{ gap: 10, paddingVertical: 12, paddingBottom: insets.bottom + (cart.length ? 190 : 100) }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState icon="search" title="لا يوجد ما يطابق البحث"
            text="جرّب كلمة أخرى، أو أضف المنتج أولا."
            actionLabel="إضافة منتج"
            onAction={() => router.push({ pathname: `/store/${storeId}/product-form` })} />
        }
        renderItem={({ item }) => {
          const inCart = cart.find((l) => l.product_id === item.id);
          const out = Number(item.stock) <= 0;
          return (
            <Pressable
              onPress={() => !out && addToCart(item)}
              style={({ pressed }) => [
                styles.tile,
                inCart && { borderColor: colors.primary, backgroundColor: colors.primarySoft },
                out && { opacity: 0.5 },
                pressed && { transform: [{ scale: 0.98 }] },
              ]}
            >
              <View style={styles.tileTop}>
                <Badge
                  text={out ? 'نفد المخزون' : `${Number(item.stock)} متوفر`}
                  tone={out ? colors.bad : Number(item.stock) <= Number(item.low_stock_at) ? colors.warn : colors.sage}
                  soft={out ? colors.badSoft : Number(item.stock) <= Number(item.low_stock_at) ? colors.warnSoft : colors.sageSoft}
                />
                {inCart ? (
                  <View style={styles.qtyPill}><Text style={styles.qtyPillText}>{inCart.qty}</Text></View>
                ) : null}
              </View>
              <Text style={[type.bodyStrong, { fontSize: 14.5 }]} numberOfLines={2}>{item.name}</Text>
              <Text style={type.tiny} numberOfLines={1}>
                {[item.size && `مقاس ${item.size}`, item.color].filter(Boolean).join(' · ') || item.category_name || ' '}
              </Text>
              <Text style={[type.bodyStrong, { color: colors.primaryDark }]}>
                {money(item.sell_price, currency)}
              </Text>
            </Pressable>
          );
        }}
      />

      {cart.length ? (
        <View style={[styles.bar, { paddingBottom: insets.bottom + 70 }]}>
          <View style={{ flex: 1 }}>
            <Text style={type.tiny}>{cart.reduce((s, l) => s + l.qty, 0)} قطعة</Text>
            <Text style={[type.number, { fontSize: 21 }]}>{money(totals.total, currency)}</Text>
          </View>
          <Button title="مراجعة" icon="arrow-left" onPress={() => setCheckout(true)} full={false} />
        </View>
      ) : null}

      {/*
        السلة في نافذة Modal مستقلة وليست فوق شاشة البيع:
        - ترسم فوق شريط التبويبات وشريط التنقل في أندرويد، فلا ينقطع زر التأكيد
        - لمساتها معزولة عن شبكة المنتجات خلفها، فيصبح التمرير سلسا
      */}
      <Modal
        visible={checkout}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setCheckout(false)}
      >
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCheckout(false)} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalAnchor}
          >
            <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
              <View style={styles.grabber} />
              <View style={styles.sheetHead}>
                <Text style={type.title}>السلة</Text>
                <Pressable onPress={() => setCheckout(false)} style={styles.closeBtn} hitSlop={10}>
                  <Feather name="x" size={20} color={colors.ink} />
                </Pressable>
              </View>

              <ScrollView
                style={{ maxHeight: Math.max(220, windowHeight * 0.58) }}
                contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.md }}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                <View>
                  {cart.map((l) => (
                    <View key={l.product_id} style={styles.cartRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={type.bodyStrong} numberOfLines={1}>{l.name}</Text>
                        <Text style={type.tiny}>
                          {money(l.unit_price, currency)} · {[l.size, l.color].filter(Boolean).join(' ')}
                        </Text>
                      </View>
                      <View style={styles.stepper}>
                        <Pressable onPress={() => changeQty(l.product_id, -1)} style={styles.stepBtn} hitSlop={6}>
                          <Feather name="minus" size={15} color={colors.ink} />
                        </Pressable>
                        <Text style={[type.bodyStrong, { minWidth: 22, textAlign: 'center' }]}>{l.qty}</Text>
                        <Pressable onPress={() => changeQty(l.product_id, 1)} style={styles.stepBtn} hitSlop={6}>
                          <Feather name="plus" size={15} color={colors.ink} />
                        </Pressable>
                      </View>
                      <Text style={[type.bodyStrong, { width: 82, textAlign: 'left' }]} numberOfLines={1}>
                        {money(l.qty * l.unit_price, currency, { compact: true })}
                      </Text>
                    </View>
                  ))}
                </View>

                <View style={{ gap: 10 }}>
                  <Field label="الزبون (اختياري)" value={customer} onChangeText={setCustomer}
                    placeholder="الاسم أو رقم الهاتف" />
                  <Field label="التخفيض" value={discount} onChangeText={setDiscount}
                    placeholder="0" keyboardType="numeric" />
                  <View style={{ gap: 6 }}>
                    <Text style={[type.label, { color: colors.inkSoft }]}>طريقة الدفع</Text>
                    <Chips
                      options={[
                        { label: 'نقدا', value: 'cash' },
                        { label: 'بطاقة', value: 'card' },
                        { label: 'تحويل', value: 'transfer' },
                        { label: 'أخرى', value: 'other' },
                      ]}
                      value={method}
                      onChange={setMethod}
                    />
                  </View>
                </View>

                <View style={styles.totalsBox}>
                  <Row label="المجموع" value={money(totals.subtotal, currency)} />
                  {totals.disc > 0 ? <Row label="التخفيض" value={`− ${money(totals.disc, currency)}`} /> : null}
                  <Row label="الربح المتوقع" value={money(totals.profit, currency)} muted />
                  <View style={styles.totalLine} />
                  <Row label="المبلغ المطلوب" value={money(totals.total, currency)} big />
                </View>

                <ErrorNote message={error} />
              </ScrollView>

              <View style={styles.sheetActions}>
                <Button title="إفراغ" variant="ghost" style={{ flex: 1 }}
                  onPress={() => { setCart([]); setCheckout(false); }} />
                <Button title="تأكيد البيع" icon="check" loading={saving} style={{ flex: 2 }} onPress={submit} />
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Row({ label, value, big, muted }) {
  return (
    <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={big ? type.section : type.label}>{label}</Text>
      <Text style={[
        big ? [type.number, { fontSize: 21 }] : type.bodyStrong,
        muted && { color: colors.sage },
      ]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cartPill: {
    flexDirection: row, alignItems: 'center', gap: 6, backgroundColor: colors.primary,
    paddingHorizontal: 13, height: 38, borderRadius: 19,
  },
  cartPillText: { fontFamily: font.bodyBlack, color: colors.white, fontSize: 14, lineHeight: 24 },
  tile: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 13, gap: 3,
    borderWidth: 1.5, borderColor: colors.lineSoft, minHeight: 140, ...shadow(1),
  },
  tileTop: { flexDirection: row, alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  qtyPill: {
    minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  qtyPillText: { fontFamily: font.bodyBlack, color: colors.white, fontSize: 12, lineHeight: 20 },
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: row, alignItems: 'center',
    gap: 12, paddingHorizontal: spacing.md, paddingTop: 12, backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.line, ...shadow(3),
  },
  backdrop: { flex: 1, backgroundColor: '#33291F66', justifyContent: 'flex-end' },
  modalAnchor: { flex: 1, justifyContent: 'flex-end' },
  sheetHead: { flexDirection: row, alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center',
  },
  sheet: {
    backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: 8,
  },
  sheetActions: {
    flexDirection: row, gap: 10, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: colors.lineSoft,
  },
  grabber: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: 'center' },
  cartRow: {
    flexDirection: row, alignItems: 'center', gap: 10, paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: colors.lineSoft,
  },
  stepper: { flexDirection: row, alignItems: 'center', gap: 6 },
  stepBtn: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center',
  },
  totalsBox: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: 8,
    borderWidth: 1, borderColor: colors.lineSoft,
  },
  totalLine: { height: 1, backgroundColor: colors.lineSoft, marginVertical: 2 },
});
