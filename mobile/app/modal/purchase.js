import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useStoreId } from '../../src/active-store';
import { useAuth } from '../../src/auth';

import { api } from '../../src/api';
import { colors, money, radius, row, spacing, type } from '../../src/theme';
import {
  KeyboardScreen, Header, Card, Button, Field, Loader, ErrorNote,
  SectionTitle, EmptyState, Feather, Badge, tap,
} from '../../src/components/ui';

export default function Purchase() {
  const { storeId: paramStoreId } = useLocalSearchParams();
  const { user } = useAuth();
  // المعامل قد لا يصل على الهاتف، فنرجع إلى المحل المفتوح
  const storeId = useStoreId(paramStoreId, user);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [products, setProducts] = useState([]);
  const [currency, setCurrency] = useState(undefined);

  const [supplier, setSupplier] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState([]);
  const [search, setSearch] = useState('');
  const [picking, setPicking] = useState(false);

  // حقول منتج جديد تماما
  const [newName, setNewName] = useState('');
  const [newSize, setNewSize] = useState('');
  const [newColor, setNewColor] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [p, s] = await Promise.all([
          api.get('/api/products', { store_id: storeId, limit: 200 }),
          api.get(`/api/stores/${storeId}`),
        ]);
        setProducts(p.products || []);
        setCurrency(s.store?.currency);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [storeId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 30);
    return products.filter((p) => [p.name, p.sku, p.color, p.size]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(q))).slice(0, 30);
  }, [products, search]);

  const total = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_cost) || 0), 0),
    [lines]
  );

  function addExisting(p) {
    tap();
    setPicking(false);
    setSearch('');
    setLines((prev) => {
      if (prev.some((l) => l.product_id === p.id)) return prev;
      return [...prev, {
        key: p.id,
        product_id: p.id,
        name: p.name,
        detail: [p.size && `مقاس ${p.size}`, p.color].filter(Boolean).join(' · '),
        qty: '1',
        unit_cost: String(p.cost_price ?? ''),
      }];
    });
  }

  function addNew() {
    if (!newName.trim()) return setError('أعطِ المنتج الجديد اسما');
    setError(null);
    setLines((prev) => [...prev, {
      key: `new-${Date.now()}`,
      product_id: null,
      name: newName.trim(),
      size: newSize.trim() || null,
      color: newColor.trim() || null,
      detail: 'منتج جديد',
      qty: '1',
      unit_cost: '',
      sell_price: '',
    }]);
    setNewName(''); setNewSize(''); setNewColor('');
  }

  const updateLine = (key, field) => (value) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)));

  const removeLine = (key) => setLines((prev) => prev.filter((l) => l.key !== key));

  async function save() {
    setError(null);
    if (!lines.length) return setError('أضف سطرا واحدا على الأقل');
    for (const l of lines) {
      if (!(Number(l.qty) > 0)) return setError(`كم قطعة من "${l.name}"؟`);
      if (!(Number(l.unit_cost) >= 0)) return setError(`بكم اشتريت "${l.name}"؟`);
    }
    setSaving(true);
    try {
      await api.post('/api/purchases', {
        store_id: storeId,
        supplier: supplier.trim() || null,
        note: note.trim() || null,
        items: lines.map((l) => ({
          product_id: l.product_id,
          name: l.name,
          qty: Number(l.qty),
          unit_cost: Number(l.unit_cost),
          size: l.size || null,
          color: l.color || null,
          sell_price: l.sell_price ? Number(l.sell_price) : undefined,
        })),
      });
      router.back();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loader text="جاري تحميل منتجاتك…" />;

  return (
    <>
      <Header title="تموين" subtitle="البضاعة التي اشتريتها" onBack={() => router.back()} />
      <KeyboardScreen>
        <ErrorNote message={error} />

        <Card style={{ gap: 14 }}>
          <Field label="المورّد" value={supplier} onChangeText={setSupplier}
            placeholder="اسم المورّد" />
          <Field label="ملاحظة (اختياري)" value={note} onChangeText={setNote}
            placeholder="رقم الفاتورة، تفاصيل التسليم…" />
        </Card>

        <Card>
          <SectionTitle icon="package" action={picking ? 'إغلاق' : 'اختيار منتج'}
            onAction={() => setPicking((v) => !v)}>
            الأسطر ({lines.length})
          </SectionTitle>

          {picking ? (
            <View style={{ gap: 10, marginTop: 12 }}>
              <Field value={search} onChangeText={setSearch} placeholder="ابحث في منتجاتك…"
                autoCorrect={false} />
              <View style={styles.pickList}>
                {filtered.map((p) => (
                  <Pressable key={p.id} onPress={() => addExisting(p)} style={styles.pickRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={type.bodyStrong} numberOfLines={1}>{p.name}</Text>
                      <Text style={type.tiny}>
                        {[p.size && `مقاس ${p.size}`, p.color].filter(Boolean).join(' · ')} · {Number(p.stock)} متوفر
                      </Text>
                    </View>
                    <Feather name="plus-circle" size={19} color={colors.primary} />
                  </Pressable>
                ))}
                {filtered.length === 0 ? (
                  <Text style={[type.tiny, { padding: 12 }]}>لم نجد شيئا. أضفه كمنتج جديد بالأسفل.</Text>
                ) : null}
              </View>

              <View style={styles.newBox}>
                <Text style={[type.label, { color: colors.inkSoft }]}>أو أضف شيئا جديدا</Text>
                <Field value={newName} onChangeText={setNewName} placeholder="اسم المنتج" />
                <View style={{ flexDirection: row, gap: 10 }}>
                  <Field style={{ flex: 1 }} value={newSize} onChangeText={setNewSize} placeholder="المقاس" />
                  <Field style={{ flex: 1 }} value={newColor} onChangeText={setNewColor} placeholder="اللون" />
                </View>
                <Button title="إضافته كسطر جديد" icon="plus" small variant="soft" onPress={addNew} />
              </View>
            </View>
          ) : null}

          {lines.length === 0 && !picking ? (
            <EmptyState icon="truck" title="لم تضف شيئا بعد"
              text="اختر منتجات تبيعها أصلا، أو أنشئ منتجات جديدة وأنت تفرغ البضاعة."
              actionLabel="اختيار منتج" onAction={() => setPicking(true)} />
          ) : null}

          {lines.map((l) => (
            <View key={l.key} style={styles.line}>
              <View style={{ flexDirection: row, alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={type.bodyStrong} numberOfLines={1}>{l.name}</Text>
                  <Text style={type.tiny}>{l.detail}</Text>
                </View>
                {!l.product_id ? <Badge text="جديد" tone={colors.sage} soft={colors.sageSoft} /> : null}
                <Pressable onPress={() => removeLine(l.key)} hitSlop={8}>
                  <Feather name="x" size={17} color={colors.inkMuted} />
                </Pressable>
              </View>
              <View style={{ flexDirection: row, gap: 10 }}>
                <Field style={{ flex: 1 }} label="الكمية" value={l.qty}
                  onChangeText={updateLine(l.key, 'qty')} keyboardType="numeric" placeholder="0" />
                <Field style={{ flex: 1 }} label="سعر الشراء" value={l.unit_cost}
                  onChangeText={updateLine(l.key, 'unit_cost')} keyboardType="numeric" placeholder="0" />
                {!l.product_id ? (
                  <Field style={{ flex: 1 }} label="سعر البيع" value={l.sell_price}
                    onChangeText={updateLine(l.key, 'sell_price')} keyboardType="numeric" placeholder="تلقائي" />
                ) : null}
              </View>
              <Text style={[type.tiny, { textAlign: 'left' }]}>
                مجموع السطر {money((Number(l.qty) || 0) * (Number(l.unit_cost) || 0), currency)}
              </Text>
            </View>
          ))}
        </Card>

        <Card style={styles.totalBox}>
          <Text style={type.label}>المبلغ الإجمالي</Text>
          <Text style={[type.hero, { fontSize: 28 }]}>{money(total, currency)}</Text>
          <Text style={[type.tiny, { textAlign: 'center' }]}>
            سيتم تحديث الكميات ومعدل سعر الشراء تلقائيا.
          </Text>
        </Card>

        <Button title="حفظ التموين" icon="check" onPress={save} loading={saving} />
      </KeyboardScreen>
    </>
  );
}

const styles = StyleSheet.create({
  pickList: {
    backgroundColor: colors.surfaceSoft, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.lineSoft, maxHeight: 260, overflow: 'hidden',
  },
  pickRow: {
    flexDirection: row, alignItems: 'center', gap: 10, padding: 12,
    borderBottomWidth: 1, borderBottomColor: colors.lineSoft,
  },
  newBox: {
    gap: 10, backgroundColor: colors.bgAlt, borderRadius: radius.md, padding: spacing.md,
  },
  line: {
    gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.lineSoft,
  },
  totalBox: {
    backgroundColor: colors.skySoft, borderColor: colors.skySoft,
    alignItems: 'center', gap: 4, paddingVertical: spacing.lg,
  },
});
