import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { api } from '../../../src/api';
import { colors, money, prettyDate, radius, row, spacing, type } from '../../../src/theme';
import {
  KeyboardScreen, Header, Card, Button, Field, Loader, ErrorNote,
  SectionTitle, Chips, Switch, ListRow, Badge,
} from '../../../src/components/ui';

const UNITS = [
  { label: 'قطعة', value: 'piece' },
  { label: 'علبة', value: 'pack' },
  { label: 'طقم', value: 'set' },
  { label: 'زوج', value: 'pair' },
  { label: 'متر', value: 'metre' },
  { label: 'كيلوغرام', value: 'kg' },
];
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '36', '38', '40', '42', '44'];
const GENDERS = [
  { label: 'نساء', value: 'women' }, { label: 'رجال', value: 'men' },
  { label: 'أطفال', value: 'kids' }, { label: 'للجنسين', value: 'unisex' },
];
const SEASONS = [
  { label: 'كل السنة', value: 'all' }, { label: 'الربيع', value: 'spring' },
  { label: 'الصيف', value: 'summer' }, { label: 'الخريف', value: 'autumn' },
  { label: 'الشتاء', value: 'winter' },
];

export default function ProductForm() {
  const { id, storeId } = useLocalSearchParams();
  const router = useRouter();
  const editing = !!id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [categories, setCategories] = useState([]);
  const [movements, setMovements] = useState([]);
  const [currency, setCurrency] = useState(undefined);
  const [storeName, setStoreName] = useState('');
  const [adjust, setAdjust] = useState('');

  const [form, setForm] = useState({
    name: '', sku: '', category_id: null, brand: '', color: '', size: '',
    gender: null, season: null, unit: 'piece',
    cost_price: '', sell_price: '', stock: '', low_stock_at: '3',
    notes: '', is_active: true,
  });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    (async () => {
      try {
        const [cats, store] = await Promise.all([
          api.get('/api/products/meta/categories', { store_id: storeId }),
          api.get(`/api/stores/${storeId}`),
        ]);
        setCategories(cats.categories || []);
        setCurrency(store.store?.currency);
        setStoreName(store.store?.name || '');

        if (editing) {
          const data = await api.get(`/api/products/${id}`);
          const p = data.product;
          setForm({
            name: p.name || '', sku: p.sku || '', category_id: p.category_id,
            brand: p.brand || '', color: p.color || '', size: p.size || '',
            gender: p.gender, season: p.season, unit: p.unit || 'piece',
            cost_price: String(p.cost_price ?? ''), sell_price: String(p.sell_price ?? ''),
            stock: String(p.stock ?? ''), low_stock_at: String(p.low_stock_at ?? '3'),
            notes: p.notes || '', is_active: p.is_active,
          });
          setMovements(data.movements || []);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, storeId, editing]);

  async function save() {
    setError(null);
    if (!form.name.trim()) return setError('أعطِ المنتج اسما');
    if (Number(form.sell_price) <= 0) return setError('حدّد سعر بيع أكبر من الصفر');

    setSaving(true);
    try {
      const payload = {
        store_id: storeId,
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        category_id: form.category_id || null,
        brand: form.brand.trim() || null,
        color: form.color.trim() || null,
        size: form.size.trim() || null,
        gender: form.gender || null,
        season: form.season || null,
        unit: form.unit,
        cost_price: Number(form.cost_price) || 0,
        sell_price: Number(form.sell_price) || 0,
        stock: Number(form.stock) || 0,
        low_stock_at: Number(form.low_stock_at) || 0,
        notes: form.notes.trim() || null,
        is_active: form.is_active,
      };
      if (editing) await api.patch(`/api/products/${id}`, payload);
      else await api.post('/api/products', payload);
      router.back();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function applyAdjust(sign) {
    const qty = Number(adjust);
    if (!qty || qty <= 0) return setError('اكتب عدد القطع');
    setError(null);
    try {
      const data = await api.post(`/api/products/${id}/stock`, {
        qty: sign * qty,
        reason: sign > 0 ? 'استلام بضاعة' : 'خصم من المخزون',
      });
      setForm((f) => ({ ...f, stock: String(data.product.stock) }));
      setAdjust('');
      const fresh = await api.get(`/api/products/${id}`);
      setMovements(fresh.movements || []);
    } catch (err) { setError(err.message); }
  }

  function remove() {
    Alert.alert('حذف هذا المنتج؟', `${form.name} سيختفي من قائمة منتجاتك.`, [
      { text: 'إبقاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          try { await api.del(`/api/products/${id}`); router.back(); }
          catch (err) { setError(err.message); }
        },
      },
    ]);
  }

  if (loading) return <Loader text="جاري التحميل…" />;

  const margin = Number(form.sell_price) > 0
    ? ((Number(form.sell_price) - Number(form.cost_price)) / Number(form.sell_price)) * 100 : 0;
  const profitEach = Number(form.sell_price) - Number(form.cost_price);

  const catOptions = [
    { label: 'بدون صنف', value: null },
    ...categories.map((c) => ({ label: c.name, value: c.id })),
  ];

  return (
    <>
      <Header title={editing ? 'تعديل منتج' : 'منتج جديد'}
        subtitle={storeName ? `محل ${storeName}` : 'أضفه إلى رفوفك'} onBack={() => router.back()} />
      <KeyboardScreen>
        <ErrorNote message={error} />

        <Card style={{ gap: 14 }}>
          <Field label="الاسم" value={form.name} onChangeText={set('name')}
            placeholder="مثال: فستان صيفي كتان" />
          <View style={{ flexDirection: row, gap: 12 }}>
            <Field style={{ flex: 1 }} label="الماركة" value={form.brand} onChangeText={set('brand')} placeholder="—" />
            <Field style={{ flex: 1 }} label="الرمز / المرجع" value={form.sku} onChangeText={set('sku')}
              placeholder="اختياري" autoCapitalize="characters" />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={[type.label, { color: colors.inkSoft }]}>الصنف</Text>
            <Chips options={catOptions} value={form.category_id} onChange={set('category_id')} />
          </View>
        </Card>

        <Card style={{ gap: 14 }}>
          <SectionTitle icon="sliders">التفاصيل</SectionTitle>
          <View style={{ flexDirection: row, gap: 12 }}>
            <Field style={{ flex: 1 }} label="اللون" value={form.color} onChangeText={set('color')} placeholder="بيج" />
            <Field style={{ flex: 1 }} label="المقاس" value={form.size} onChangeText={set('size')} placeholder="M" />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={[type.label, { color: colors.inkSoft }]}>مقاسات سريعة</Text>
            <Chips options={SIZES} value={form.size} onChange={set('size')} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={[type.label, { color: colors.inkSoft }]}>موجّه لـ</Text>
            <Chips options={GENDERS} value={form.gender} onChange={set('gender')} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={[type.label, { color: colors.inkSoft }]}>الموسم</Text>
            <Chips options={SEASONS} value={form.season} onChange={set('season')} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={[type.label, { color: colors.inkSoft }]}>وحدة البيع</Text>
            <Chips options={UNITS} value={form.unit} onChange={set('unit')} />
          </View>
        </Card>

        <Card style={{ gap: 14 }}>
          <SectionTitle icon="dollar-sign">الأسعار</SectionTitle>
          <View style={{ flexDirection: row, gap: 12 }}>
            <Field style={{ flex: 1 }} label="سعر الشراء" value={form.cost_price}
              onChangeText={set('cost_price')} placeholder="0" keyboardType="numeric" />
            <Field style={{ flex: 1 }} label="سعر البيع" value={form.sell_price}
              onChangeText={set('sell_price')} placeholder="0" keyboardType="numeric" />
          </View>
          <View style={styles.marginBox}>
            <View style={{ flex: 1 }}>
              <Text style={type.tiny}>الربح في القطعة الواحدة</Text>
              <Text style={[type.bodyStrong, { color: profitEach >= 0 ? colors.good : colors.bad }]}>
                {money(profitEach, currency)}
              </Text>
            </View>
            <Badge text={`هامش ${margin.toFixed(0)}%`}
              tone={margin >= 30 ? colors.good : margin >= 15 ? colors.warn : colors.bad}
              soft={margin >= 30 ? colors.goodSoft : margin >= 15 ? colors.warnSoft : colors.badSoft} />
          </View>
        </Card>

        <Card style={{ gap: 14 }}>
          <SectionTitle icon="package">المخزون</SectionTitle>
          <View style={{ flexDirection: row, gap: 12 }}>
            <Field style={{ flex: 1 }} label="الكمية الحالية" value={form.stock}
              onChangeText={set('stock')} placeholder="0" keyboardType="numeric" />
            <Field style={{ flex: 1 }} label="نبّهني تحت" value={form.low_stock_at}
              onChangeText={set('low_stock_at')} placeholder="3" keyboardType="numeric" />
          </View>

          {editing ? (
            <>
              <Field label="حركة سريعة" value={adjust} onChangeText={setAdjust}
                placeholder="كم قطعة؟" keyboardType="numeric" />
              <View style={{ flexDirection: row, gap: 10 }}>
                <Button title="استلمت" icon="plus" small variant="sage" style={{ flex: 1 }}
                  onPress={() => applyAdjust(1)} />
                <Button title="أخرجت" icon="minus" small variant="white" style={{ flex: 1 }}
                  onPress={() => applyAdjust(-1)} />
              </View>
            </>
          ) : null}
        </Card>

        <Card style={{ gap: 12 }}>
          <Field label="ملاحظات" value={form.notes} onChangeText={set('notes')}
            placeholder="أي شيء يستحق التذكر" multiline />
          <Switch label="ظاهر في المحل" hint="أطفئه لإخفائه دون حذفه."
            value={form.is_active} onChange={set('is_active')} />
        </Card>

        {editing && movements.length ? (
          <Card>
            <SectionTitle icon="activity">سجل حركة المخزون</SectionTitle>
            {movements.slice(0, 10).map((m, i, arr) => (
              <ListRow
                key={m.id}
                title={m.reason || (m.kind === 'in' ? 'دخول' : 'خروج')}
                subtitle={`${m.user_name || 'النظام'} · ${prettyDate(m.created_at)}`}
                icon={m.kind === 'in' ? 'arrow-down-left' : m.kind === 'out' ? 'arrow-up-right' : 'edit-3'}
                iconTone={m.kind === 'in' ? colors.sage : m.kind === 'out' ? colors.rose : colors.sky}
                iconSoft={m.kind === 'in' ? colors.sageSoft : m.kind === 'out' ? colors.roseSoft : colors.skySoft}
                right={`${Number(m.qty) > 0 ? '+' : ''}${Number(m.qty)}`}
                rightSub={m.balance_after != null ? `بقي ${Number(m.balance_after)}` : undefined}
                last={i === Math.min(arr.length, 10) - 1}
              />
            ))}
          </Card>
        ) : null}

        <Button title={editing ? 'حفظ التعديلات' : 'إضافة المنتج'} icon="check"
          onPress={save} loading={saving} />
        {editing ? <Button title="حذف المنتج" icon="trash-2" variant="danger" onPress={remove} /> : null}
      </KeyboardScreen>
    </>
  );
}

const styles = StyleSheet.create({
  marginBox: {
    flexDirection: row, alignItems: 'center', gap: 10,
    backgroundColor: colors.surfaceSoft, borderRadius: radius.md, padding: spacing.md,
  },
});
