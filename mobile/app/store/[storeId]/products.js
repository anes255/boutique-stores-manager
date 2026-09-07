import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '../../../src/api';
import { useData } from '../../../src/hooks';
import { colors, compact, font, money, radius, row, shadow, spacing, type } from '../../../src/theme';
import {
  Header, Card, Field, Loader, ErrorNote, EmptyState,
  Badge, Chips, Feather, Fab, StatTile, tap,
} from '../../../src/components/ui';

const FILTERS = [
  { label: 'الكل', value: 'all' },
  { label: 'على وشك النفاد', value: 'low' },
  { label: 'نفد', value: 'out' },
  { label: 'مخفي', value: 'hidden' },
];

export default function Products() {
  const { storeId } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(null);
  const [filter, setFilter] = useState('all');
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const { data, loading, refreshing, reload } = useData({
    products: ['/api/products', { store_id: storeId, limit: 200 }],
    categories: ['/api/products/meta/categories', { store_id: storeId }],
    store: [`/api/stores/${storeId}`, {}],
  }, [storeId]);

  const currency = data.store?.store?.currency;
  const all = data.products?.products || [];
  const totals = data.products?.totals;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((p) => {
      if (filter === 'low' && !(Number(p.stock) <= Number(p.low_stock_at) && Number(p.stock) > 0)) return false;
      if (filter === 'out' && Number(p.stock) > 0) return false;
      if (filter === 'hidden' && p.is_active) return false;
      if (filter !== 'hidden' && !p.is_active) return false;
      if (category && p.category_id !== category) return false;
      if (!q) return true;
      return [p.name, p.sku, p.brand, p.color, p.size]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [all, query, category, filter]);

  async function quickStock(product, delta) {
    tap();
    setBusyId(product.id);
    setError(null);
    try {
      await api.post(`/api/products/${product.id}/stock`, {
        qty: delta,
        reason: delta > 0 ? 'إضافة سريعة' : 'خصم سريع',
      });
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const catOptions = [
    { label: 'كل الأصناف', value: null },
    ...(data.categories?.categories || []).map((c) => ({ label: c.name, value: c.id })),
  ];

  if (loading && !all.length) return <Loader text="جاري جرد المخزون…" />;

  return (
    <View style={{ flex: 1 }}>
      <Header title="المنتجات" subtitle={data.store?.store?.name}
        right={
          <Pressable style={styles.iconBtn}
            onPress={() => router.push({ pathname: '/modal/categories', params: { storeId } })}>
            <Feather name="folder" size={18} color={colors.ink} />
          </Pressable>
        }
      />

      <FlatList
        data={visible}
        keyExtractor={(p) => p.id}
        refreshing={refreshing}
        onRefresh={reload}
        contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: insets.bottom + 150, gap: 10 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 12, paddingBottom: 6 }}>
            <View style={styles.tiles}>
              <StatTile label="عدد المنتجات" icon="tag" value={String(totals?.count ?? 0)}
                tone={colors.primary} soft={colors.primarySoft} sub="منتج نشط" />
              <StatTile label="عدد القطع" icon="layers" value={compact(totals?.units)}
                tone={colors.sage} soft={colors.sageSoft} sub="في الرفوف" />
              <StatTile label="سعر الشراء" icon="package" value={money(totals?.stock_cost_value, currency, { compact: true })}
                tone={colors.sky} soft={colors.skySoft} sub="ما دفعته" />
              <StatTile label="سعر البيع" icon="dollar-sign" value={money(totals?.stock_sell_value, currency, { compact: true })}
                tone={colors.lilac} soft={colors.lilacSoft} sub="إذا بعت كل شيء" />
            </View>
            <Field value={query} onChangeText={setQuery} placeholder="ابحث في المنتجات…" autoCorrect={false} />
            <Chips options={FILTERS} value={filter} onChange={setFilter} />
            <Chips options={catOptions} value={category} onChange={setCategory} />
            <ErrorNote message={error} />
          </View>
        }
        ListEmptyComponent={
          <Card>
            <EmptyState
              icon="tag"
              title={all.length ? 'لا يوجد ما يطابق البحث' : 'رفوفك فارغة'}
              text={all.length
                ? 'جرّب كلمة أخرى أو غيّر التصفية.'
                : 'أضف أول منتج — الاسم، المقاس، اللون، سعر الشراء وسعر البيع.'}
              actionLabel="إضافة منتج"
              onAction={() => router.push({ pathname: '/modal/product-form', params: { storeId } })}
            />
          </Card>
        }
        renderItem={({ item: p }) => {
          const out = Number(p.stock) <= 0;
          const low = !out && Number(p.stock) <= Number(p.low_stock_at);
          const margin = Number(p.sell_price) > 0
            ? ((Number(p.sell_price) - Number(p.cost_price)) / Number(p.sell_price)) * 100 : 0;
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/modal/product-form', params: { id: p.id, storeId } })}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
            >
              <View style={{ flexDirection: row, gap: 11, alignItems: 'flex-start' }}>
                <View style={[styles.thumb, { backgroundColor: swatch(p.color) }]}>
                  <Text style={styles.thumbText}>{(p.name || '؟').trim().slice(0, 2)}</Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={type.bodyStrong} numberOfLines={1}>{p.name}</Text>
                  <Text style={type.tiny} numberOfLines={1}>
                    {[p.category_name, p.size && `مقاس ${p.size}`, p.color, p.brand]
                      .filter(Boolean).join(' · ') || 'بدون تفاصيل'}
                  </Text>
                  <View style={{ flexDirection: row, gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
                    <Badge
                      text={out ? 'نفد المخزون' : `${Number(p.stock)} ${p.unit === 'piece' ? 'قطعة' : p.unit}`}
                      tone={out ? colors.bad : low ? colors.warn : colors.sage}
                      soft={out ? colors.badSoft : low ? colors.warnSoft : colors.sageSoft}
                      icon={out ? 'alert-circle' : low ? 'alert-triangle' : 'check'}
                    />
                    <Badge text={`هامش ${margin.toFixed(0)}%`} tone={colors.lilac} soft={colors.lilacSoft} />
                    {!p.is_active ? <Badge text="مخفي" tone={colors.inkMuted} soft={colors.lineSoft} /> : null}
                  </View>
                </View>
                <View style={{ alignItems: 'flex-start', gap: 2 }}>
                  <Text style={[type.bodyStrong, { color: colors.primaryDark }]}>
                    {money(p.sell_price, currency, { compact: true })}
                  </Text>
                  <Text style={type.tiny}>شراء {compact(p.cost_price)}</Text>
                </View>
              </View>

              <View style={styles.actions}>
                <Pressable onPress={() => quickStock(p, -1)} disabled={busyId === p.id || out}
                  style={[styles.actionBtn, (busyId === p.id || out) && { opacity: 0.4 }]}>
                  <Feather name="minus" size={15} color={colors.ink} />
                  <Text style={styles.actionText}>بعت واحدة</Text>
                </Pressable>
                <Pressable onPress={() => quickStock(p, 1)} disabled={busyId === p.id}
                  style={[styles.actionBtn, busyId === p.id && { opacity: 0.4 }]}>
                  <Feather name="plus" size={15} color={colors.ink} />
                  <Text style={styles.actionText}>استلمت</Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push({ pathname: '/modal/product-form', params: { id: p.id, storeId } })}
                  style={styles.actionBtn}>
                  <Feather name="edit-2" size={14} color={colors.ink} />
                  <Text style={styles.actionText}>تعديل</Text>
                </Pressable>
              </View>
            </Pressable>
          );
        }}
      />

      <Fab icon="plus" label="منتج جديد"
        onPress={() => router.push({ pathname: '/modal/product-form', params: { storeId } })} />
    </View>
  );
}

function swatch(color) {
  const map = {
    'أسود': '#33291F', 'أبيض': '#F2EAE0', 'بيج': '#E9D9C3', 'جملي': '#D8B48A', 'كحلي': '#3C4A6B',
    'رمادي': '#CFC7BF', 'كريمي': '#F3E7D5', 'وردي': '#EFC3CE', 'أخضر': '#C6E4D8', 'أحمر': '#F5B8A5',
    'زيتي': '#B8BE96', 'نيلي': '#5D6E9E', 'خمري': '#8E4257', 'أزرق': '#9FC3DE', 'أصفر': '#F0DFA8',
    black: '#33291F', white: '#F2EAE0', beige: '#E9D9C3', navy: '#3C4A6B', grey: '#CFC7BF',
  };
  return map[String(color || '').trim().toLowerCase()] || map[String(color || '').trim()] || colors.primarySoft;
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line,
  },
  tiles: { flexDirection: row, flexWrap: 'wrap', gap: 10 },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 13, gap: 11,
    borderWidth: 1, borderColor: colors.lineSoft, ...shadow(1),
  },
  thumb: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  thumbText: { fontFamily: font.bodyBlack, fontSize: 14, color: colors.ink, lineHeight: 24 },
  actions: { flexDirection: row, gap: 8 },
  actionBtn: {
    flex: 1, flexDirection: row, alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 9, borderRadius: radius.sm, backgroundColor: colors.surfaceSoft,
    borderWidth: 1, borderColor: colors.lineSoft,
  },
  actionText: { fontFamily: font.bodyBold, fontSize: 12.5, color: colors.inkSoft, lineHeight: 22 },
});
