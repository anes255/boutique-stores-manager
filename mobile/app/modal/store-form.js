import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { api } from '../../src/api';
import { colors, radius, spacing, type, font } from '../../src/theme';
import {
  KeyboardScreen, Header, Card, Button, Field, Loader, ErrorNote,
  SectionTitle, Switch, Feather, ListRow, Badge,
} from '../../src/components/ui';

const SWATCHES = ['#E8813A', '#4E8D7C', '#7C6BD1', '#3E93C9', '#E4698A', '#F0B429', '#8E6E53', '#5E7C8B'];

export default function StoreForm() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const editing = !!id;

  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [accounts, setAccounts] = useState([]);

  const [form, setForm] = useState({
    name: '', code: '', city: '', address: '', phone: '',
    currency: 'DZD', color: '#E8813A', monthly_target: '', is_active: true,
  });

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!editing) return;
    (async () => {
      try {
        const data = await api.get(`/api/stores/${id}`);
        const s = data.store;
        setForm({
          name: s.name || '', code: s.code || '', city: s.city || '', address: s.address || '',
          phone: s.phone || '', currency: s.currency || 'DZD', color: s.color || '#E8813A',
          monthly_target: String(s.monthly_target ?? ''), is_active: s.is_active,
        });
        setAccounts(data.staff || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, editing]);

  async function save() {
    setError(null);
    if (form.name.trim().length < 2) return setError('Give the store a name');
    if (!/^[a-zA-Z0-9_-]{2,24}$/.test(form.code.trim())) {
      return setError('Code should be 2-24 letters, digits, - or _ (for example NOUR-01)');
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim(),
        city: form.city.trim() || null,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        currency: form.currency.trim() || 'DZD',
        color: form.color,
        monthly_target: Number(form.monthly_target) || 0,
        is_active: form.is_active,
      };
      if (editing) {
        await api.patch(`/api/stores/${id}`, payload);
        router.back();
      } else {
        const data = await api.post('/api/stores', payload);
        router.replace({ pathname: '/modal/account-form', params: { storeId: data.store.id, first: '1' } });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function remove() {
    Alert.alert(
      'Delete this store?',
      'Everything inside it — products, sales, expenses and logins — is removed for good.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try { await api.del(`/api/stores/${id}`); router.replace('/admin/stores'); }
            catch (err) { setError(err.message); }
          },
        },
      ]
    );
  }

  if (loading) return <Loader text="Loading the store…" />;

  return (
    <>
      <Header title={editing ? 'Store settings' : 'New store'}
        subtitle={editing ? form.name : 'Step 1 of 2'} onBack={() => router.back()} />
      <KeyboardScreen>
        <ErrorNote message={error} />

        <Card style={{ gap: 14 }}>
          <Field label="Store name" value={form.name} onChangeText={set('name')}
            placeholder="Nour Boutique — Centre" />
          <Field label="Short code" value={form.code} onChangeText={set('code')}
            placeholder="NOUR-01" autoCapitalize="characters" autoCorrect={false}
            hint="A quick label you will see on receipts and reports." />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Field style={{ flex: 1 }} label="City" value={form.city} onChangeText={set('city')} placeholder="Alger" />
            <Field style={{ flex: 1 }} label="Currency" value={form.currency} onChangeText={set('currency')}
              placeholder="DZD" autoCapitalize="characters" />
          </View>
          <Field label="Address" value={form.address} onChangeText={set('address')}
            placeholder="12 rue Didouche Mourad" />
          <Field label="Phone" value={form.phone} onChangeText={set('phone')}
            placeholder="+213 …" keyboardType="phone-pad" />
          <Field label="Monthly sales target" value={form.monthly_target} onChangeText={set('monthly_target')}
            placeholder="0" keyboardType="numeric"
            hint="Used for the progress ring on the dashboard. Leave 0 to hide it." />
        </Card>

        <Card>
          <SectionTitle icon="droplet">Store colour</SectionTitle>
          <Text style={[type.tiny, { marginTop: 4, marginBottom: 12 }]}>
            Helps you tell your stores apart at a glance.
          </Text>
          <View style={styles.swatches}>
            {SWATCHES.map((c) => (
              <Pressable key={c} onPress={() => set('color')(c)}
                style={[styles.swatch, { backgroundColor: c }, form.color === c && styles.swatchOn]}>
                {form.color === c ? <Feather name="check" size={16} color={colors.white} /> : null}
              </Pressable>
            ))}
          </View>
        </Card>

        {editing ? (
          <Card>
            <Switch label="Store is open" hint="Turn this off to freeze the store and its logins."
              value={form.is_active} onChange={set('is_active')} />
          </Card>
        ) : null}

        {editing ? (
          <Card>
            <SectionTitle icon="key" action="Add login"
              onAction={() => router.push({ pathname: '/modal/account-form', params: { storeId: id } })}>
              Logins for this store
            </SectionTitle>
            {accounts.length === 0 ? (
              <Text style={[type.tiny, { paddingVertical: 12 }]}>
                No one can sign into this store yet. Create a login and hand it to the person who runs it.
              </Text>
            ) : accounts.map((a, i, arr) => (
              <ListRow
                key={a.id}
                title={a.full_name}
                subtitle={`${a.email} · ${a.role}`}
                icon="key"
                iconTone={colors.lilac}
                iconSoft={colors.lilacSoft}
                right={<Badge text={a.is_active ? 'Active' : 'Off'}
                  tone={a.is_active ? colors.good : colors.bad}
                  soft={a.is_active ? colors.goodSoft : colors.badSoft} />}
                onPress={() => router.push({
                  pathname: '/modal/account-form',
                  params: { storeId: id, id: a.id, email: a.email, name: a.full_name, active: String(a.is_active) },
                })}
                last={i === arr.length - 1}
              />
            ))}
          </Card>
        ) : null}

        <Button title={editing ? 'Save changes' : 'Create store & add a login'} icon="check"
          onPress={save} loading={saving} />

        {editing ? (
          <Button title="Delete this store" icon="trash-2" variant="danger" onPress={remove} />
        ) : null}
      </KeyboardScreen>
    </>
  );
}

const styles = StyleSheet.create({
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  swatchOn: { borderWidth: 3, borderColor: colors.ink },
});
