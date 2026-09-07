import React, { useEffect, useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { api } from '../../src/api';
import { colors, type } from '../../src/theme';
import {
  KeyboardScreen, Header, Card, Button, Field, Loader, ErrorNote,
  SectionTitle, ListRow, EmptyState,
} from '../../src/components/ui';

const SUGGESTIONS = ['Dresses', 'Tops', 'Bottoms', 'Outerwear', 'Knitwear', 'Shoes', 'Bags', 'Accessories', 'Kids'];

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
    if (!label) return setError('Type a category name');
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
    Alert.alert('Delete this category?', `Products in "${cat.name}" stay, they just lose the label.`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try { await api.del(`/api/products/meta/categories/${cat.id}`); load(); }
          catch (err) { setError(err.message); }
        },
      },
    ]);
  }

  if (loading) return <Loader text="Loading categories…" />;

  const missing = SUGGESTIONS.filter(
    (s) => !categories.some((c) => c.name.toLowerCase() === s.toLowerCase())
  );

  return (
    <>
      <Header title="Categories" subtitle="Group your rack" onBack={() => router.back()} />
      <KeyboardScreen>
        <ErrorNote message={error} />

        <Card style={{ gap: 12 }}>
          <Field label="New category" value={name} onChangeText={setName}
            placeholder="Dresses" onSubmitEditing={() => add()} returnKeyType="done" />
          <Button title="Add category" icon="plus" onPress={() => add()} loading={saving} />
        </Card>

        {missing.length ? (
          <Card>
            <SectionTitle icon="zap">Quick add</SectionTitle>
            <Text style={[type.tiny, { marginTop: 4, marginBottom: 10 }]}>
              Common categories for a clothing shop — tap to add.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {missing.map((s) => (
                <Button key={s} title={s} small variant="white" full={false} onPress={() => add(s)} />
              ))}
            </View>
          </Card>
        ) : null}

        <Card>
          <SectionTitle icon="folder">Your categories</SectionTitle>
          {categories.length === 0 ? (
            <EmptyState icon="folder" title="No categories yet"
              text="Categories make your reports much easier to read." />
          ) : categories.map((c, i, arr) => (
            <ListRow
              key={c.id}
              title={c.name}
              subtitle={`${c.product_count} product${c.product_count === 1 ? '' : 's'}`}
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
