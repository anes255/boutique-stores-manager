import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, Alert, Platform, KeyboardAvoidingView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '../../../src/api';
import { useData } from '../../../src/hooks';
import { colors, font, money, radius, shadow, spacing, type } from '../../../src/theme';
import {
  Header, Card, Button, Field, Loader, ErrorNote, EmptyState,
  Badge, Chips, Feather, tap,
} from '../../../src/components/ui';

export default function Sell() {
  const { storeId } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();

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

  const currency = data.store?.store?.currency || 'DZD';
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
        setError(`Only ${Number(product.stock)} left of ${product.name}`);
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
      if (qty > l.stock) { setError(`Only ${l.stock} left of ${l.name}`); return [l]; }
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
      Alert.alert('Sale recorded', 'Stock has been updated and today\'s numbers are refreshed.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const catOptions = [
    { label: 'Everything', value: null },
    ...(data.categories?.categories || []).map((c) => ({ label: c.name, value: c.id })),
  ];

  if (loading && !all.length) return <Loader text="Loading the shelves…" />;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title="Sell" subtitle={data.store?.store?.name}
        right={cart.length ? (
          <Pressable style={styles.cartPill} onPress={() => setCheckout(true)}>
            <Feather name="shopping-cart" size={15} color={colors.white} />
            <Text style={styles.cartPillText}>{cart.reduce((s, l) => s + l.qty, 0)}</Text>
          </Pressable>
        ) : null}
      />

      <View style={{ paddingHorizontal: spacing.md, gap: 10 }}>
        <Field value={query} onChangeText={setQuery} placeholder="Search by name, SKU, colour…"
          autoCorrect={false} prefix={undefined} />
        <Chips options={catOptions} value={category} onChange={setCategory} />
      </View>

      <ErrorNote message={error} />

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 10, paddingHorizontal: spacing.md }}
        contentContainerStyle={{ gap: 10, paddingVertical: 12, paddingBottom: insets.bottom + (cart.length ? 190 : 100) }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState icon="search" title="Nothing matches"
            text="Try another word, or add the product first."
            actionLabel="Add a product"
            onAction={() => router.push({ pathname: '/modal/product-form', params: { storeId } })} />
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
                  text={out ? 'Out of stock' : `${Number(item.stock)} in stock`}
                  tone={out ? colors.bad : Number(item.stock) <= Number(item.low_stock_at) ? colors.warn : colors.sage}
                  soft={out ? colors.badSoft : Number(item.stock) <= Number(item.low_stock_at) ? colors.warnSoft : colors.sageSoft}
                />
                {inCart ? (
                  <View style={styles.qtyPill}><Text style={styles.qtyPillText}>{inCart.qty}</Text></View>
                ) : null}
              </View>
              <Text style={[type.bodyStrong, { fontSize: 14.5 }]} numberOfLines={2}>{item.name}</Text>
              <Text style={type.tiny} numberOfLines={1}>
                {[item.size && `size ${item.size}`, item.color].filter(Boolean).join(' · ') || item.category_name || ' '}
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
            <Text style={type.tiny}>{cart.reduce((s, l) => s + l.qty, 0)} items</Text>
            <Text style={[type.number, { fontSize: 22 }]}>{money(totals.total, currency)}</Text>
          </View>
          <Button title="Review" icon="arrow-right" onPress={() => setCheckout(true)} full={false} />
        </View>
      ) : null}

      {checkout ? (
        <View style={styles.sheetWrap}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCheckout(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
            <View style={styles.grabber} />
            <Text style={type.title}>The basket</Text>

            <View style={{ maxHeight: 240 }}>
              <FlatList
                data={cart}
                keyExtractor={(l) => l.product_id}
                showsVerticalScrollIndicator={false}
                renderItem={({ item: l }) => (
                  <View style={styles.cartRow}>
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
                    <Text style={[type.bodyStrong, { width: 78, textAlign: 'right' }]} numberOfLines={1}>
                      {money(l.qty * l.unit_price, currency, { compact: true })}
                    </Text>
                  </View>
                )}
              />
            </View>

            <View style={{ gap: 10 }}>
              <Field label="Customer (optional)" value={customer} onChangeText={setCustomer}
                placeholder="Name or phone" />
              <Field label="Discount" value={discount} onChangeText={setDiscount}
                placeholder="0" keyboardType="numeric" />
              <View style={{ gap: 6 }}>
                <Text style={[type.label, { color: colors.inkSoft }]}>Paid with</Text>
                <Chips
                  options={[
                    { label: 'Cash', value: 'cash' },
                    { label: 'Card', value: 'card' },
                    { label: 'Transfer', value: 'transfer' },
                    { label: 'Other', value: 'other' },
                  ]}
                  value={method}
                  onChange={setMethod}
                />
              </View>
            </View>

            <View style={styles.totalsBox}>
              <Row label="Subtotal" value={money(totals.subtotal, currency)} />
              {totals.disc > 0 ? <Row label="Discount" value={`− ${money(totals.disc, currency)}`} /> : null}
              <Row label="Estimated profit" value={money(totals.profit, currency)} muted />
              <View style={styles.totalLine} />
              <Row label="To pay" value={money(totals.total, currency)} big />
            </View>

            <ErrorNote message={error} />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Clear" variant="ghost" style={{ flex: 1 }}
                onPress={() => { setCart([]); setCheckout(false); }} />
              <Button title="Confirm sale" icon="check" loading={saving} style={{ flex: 2 }} onPress={submit} />
            </View>
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function Row({ label, value, big, muted }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={big ? type.section : type.label}>{label}</Text>
      <Text style={[
        big ? [type.number, { fontSize: 22 }] : type.bodyStrong,
        muted && { color: colors.sage },
      ]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cartPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary,
    paddingHorizontal: 13, height: 38, borderRadius: 19,
  },
  cartPillText: { fontFamily: font.bodyBlack, color: colors.white, fontSize: 14 },
  tile: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 13, gap: 5,
    borderWidth: 1.5, borderColor: colors.lineSoft, minHeight: 132, ...shadow(1),
  },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  qtyPill: {
    minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  qtyPillText: { fontFamily: font.bodyBlack, color: colors.white, fontSize: 12 },
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center',
    gap: 12, paddingHorizontal: spacing.md, paddingTop: 12, backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.line, ...shadow(3),
  },
  sheetWrap: { ...StyleSheet.absoluteFillObject, backgroundColor: '#33291F55', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: spacing.lg, gap: spacing.md, maxHeight: '92%',
  },
  grabber: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: 'center' },
  cartRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: colors.lineSoft,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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
