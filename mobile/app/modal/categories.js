import React, { useEffect, useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { api } from '../../src/api';
import { colors, row, type } from '../../src/theme';
import {
  KeyboardScreen, Header, Card, Button, Field, Loader, ErrorNote,
  SectionTitle, ListRow, EmptyState,
} from '../../src/components/ui';

const SUGGESTIONS = ['فساتين', 'قمصان وبلوزات', 'سراويل', 'معاطف', 'تريكو', 'أحذية', 'حقائب', 'إكسسوارات', 'أطفال'];

export default function Categories() {
  const { storeId } = useLocalSearchParams();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [categories, setCategories] = useState([]);
  const [name, setName] = useState('');

  async function load() {
    try {
      const data = await api.get('/api/products/meta/categories', { store_id: storeId });
      setCategories(data.categories || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [storeId]);

  async function add(value) {
    const label = (value ?? name).trim();
    if (!label) return setError('اكتب اسم الصنف');
    setError(null);
    setSaving(true);
    try {
      await api.post('/api/products/meta/categories', { store_id: storeId, name: label });
      setName('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function remove(cat) {
    Alert.alert('حذف هذا الصنف؟', `المنتجات في "${cat.name}" ستبقى، لكنها ستفقد التصنيف.`, [
      { text: 'إبقاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          try { await api.del(`/api/products/meta/categories/${cat.id}`); load(); }
          catch (err) { setError(err.message); }
        },
      },
    ]);
  }

  if (loading) return <Loader text="جاري تحميل الأصناف…" />;

  const missing = SUGGESTIONS.filter(
    (s) => !categories.some((c) => c.name.trim() === s)
  );

  return (
    <>
      <Header title="الأصناف" subtitle="نظّم رفوفك" onBack={() => router.back()} />
      <KeyboardScreen>
        <ErrorNote message={error} />

        <Card style={{ gap: 12 }}>
          <Field label="صنف جديد" value={name} onChangeText={setName}
            placeholder="فساتين" onSubmitEditing={() => add()} returnKeyType="done" />
          <Button title="إضافة الصنف" icon="plus" onPress={() => add()} loading={saving} />
        </Card>

        {missing.length ? (
          <Card>
            <SectionTitle icon="zap">إضافة سريعة</SectionTitle>
            <Text style={[type.tiny, { marginTop: 4, marginBottom: 10 }]}>
              أصناف شائعة في محلات الملابس — اضغط لإضافتها.
            </Text>
            <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 8 }}>
              {missing.map((s) => (
                <Button key={s} title={s} small variant="white" full={false} onPress={() => add(s)} />
              ))}
            </View>
          </Card>
        ) : null}

        <Card>
          <SectionTitle icon="folder">أصنافك</SectionTitle>
          {categories.length === 0 ? (
            <EmptyState icon="folder" title="لا توجد أصناف بعد"
              text="الأصناف تجعل تقاريرك أسهل بكثير في القراءة." />
          ) : categories.map((c, i, arr) => (
            <ListRow
              key={c.id}
              title={c.name}
              subtitle={`${c.product_count} منتج`}
              icon="folder"
              iconTone={colors.lilac}
              iconSoft={colors.lilacSoft}
              onPress={() => remove(c)}
              last={i === arr.length - 1}
            />
          ))}
        </Card>
      </KeyboardScreen>
    </>
  );
}
