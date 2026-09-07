import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { api } from '../../src/api';
import { colors, row, type } from '../../src/theme';
import {
  KeyboardScreen, Header, Card, Button, Field, Loader, ErrorNote,
  SectionTitle, Switch, Feather, ListRow, Badge,
} from '../../src/components/ui';

const SWATCHES = ['#E8813A', '#4E8D7C', '#7C6BD1', '#3E93C9', '#E4698A', '#F0B429', '#8E6E53', '#5E7C8B'];
const ROLES = { manager: 'مسؤول المحل', staff: 'بائع' };

export default function StoreForm() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const editing = !!id;

  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [accounts, setAccounts] = useState([]);

  // العملة ثابتة (دج) ولا تظهر في النموذج
  const [form, setForm] = useState({
    name: '', code: '', city: '', address: '', phone: '',
    color: '#E8813A', monthly_target: '', is_active: true,
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
          phone: s.phone || '', color: s.color || '#E8813A',
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
    if (form.name.trim().length < 2) return setError('أعطِ المحل اسما');
    if (!/^[a-zA-Z0-9_-]{2,24}$/.test(form.code.trim())) {
      return setError('الرمز من 2 إلى 24 حرفا لاتينيا أو رقما أو - أو _ (مثال: MAG-01)');
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim(),
        city: form.city.trim() || null,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
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
      'حذف هذا المحل؟',
      'كل ما بداخله — المنتجات والمبيعات والمصاريف وحسابات الدخول — سيُحذف نهائيا.',
      [
        { text: 'إبقاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            try { await api.del(`/api/stores/${id}`); router.replace('/admin/stores'); }
            catch (err) { setError(err.message); }
          },
        },
      ]
    );
  }

  if (loading) return <Loader text="جاري تحميل المحل…" />;

  return (
    <>
      <Header title={editing ? 'إعدادات المحل' : 'محل جديد'}
        subtitle={editing ? form.name : 'الخطوة 1 من 2'} onBack={() => router.back()} />
      <KeyboardScreen>
        <ErrorNote message={error} />

        <Card style={{ gap: 14 }}>
          <Field label="اسم المحل" value={form.name} onChangeText={set('name')}
            placeholder="مثال: محل النور — وسط المدينة" />
          <Field label="رمز قصير" value={form.code} onChangeText={set('code')}
            placeholder="MAG-01" autoCapitalize="characters" autoCorrect={false}
            hint="رمز سريع يظهر في الفواتير والتقارير (حروف لاتينية وأرقام)." />
          <Field label="المدينة" value={form.city} onChangeText={set('city')} placeholder="الجزائر" />
          <Field label="العنوان" value={form.address} onChangeText={set('address')}
            placeholder="مثال: 12 شارع ديدوش مراد" />
          <Field label="الهاتف" value={form.phone} onChangeText={set('phone')}
            placeholder="0770000000" keyboardType="phone-pad" />
          <Field label="الهدف الشهري للمبيعات" value={form.monthly_target} onChangeText={set('monthly_target')}
            placeholder="0" keyboardType="numeric"
            hint="يستعمل في دائرة التقدم في الصفحة الرئيسية. اتركه 0 لإخفائه." />
        </Card>

        <Card>
          <SectionTitle icon="droplet">لون المحل</SectionTitle>
          <Text style={[type.tiny, { marginTop: 4, marginBottom: 12 }]}>
            يساعدك على التمييز بين محلاتك بنظرة واحدة.
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
            <Switch label="المحل مفتوح" hint="أطفئه لتجميد المحل وحسابات الدخول الخاصة به."
              value={form.is_active} onChange={set('is_active')} />
          </Card>
        ) : null}

        {editing ? (
          <Card>
            <SectionTitle icon="key" action="إضافة حساب"
              onAction={() => router.push({ pathname: '/modal/account-form', params: { storeId: id } })}>
              حسابات الدخول لهذا المحل
            </SectionTitle>
            {accounts.length === 0 ? (
              <Text style={[type.tiny, { paddingVertical: 12 }]}>
                لا أحد يستطيع الدخول لهذا المحل بعد. أنشئ حسابا وسلّمه لمن يديره.
              </Text>
            ) : accounts.map((a, i, arr) => (
              <ListRow
                key={a.id}
                title={a.full_name}
                subtitle={`${a.email} · ${ROLES[a.role] || a.role}`}
                icon="key"
                iconTone={colors.lilac}
                iconSoft={colors.lilacSoft}
                right={<Badge text={a.is_active ? 'نشط' : 'معطّل'}
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

        <Button title={editing ? 'حفظ التعديلات' : 'إنشاء المحل وإضافة حساب'} icon="check"
          onPress={save} loading={saving} />

        {editing ? (
          <Button title="حذف هذا المحل" icon="trash-2" variant="danger" onPress={remove} />
        ) : null}
      </KeyboardScreen>
    </>
  );
}

const styles = StyleSheet.create({
  swatches: { flexDirection: row, flexWrap: 'wrap', gap: 10 },
  swatch: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  swatchOn: { borderWidth: 3, borderColor: colors.ink },
});
