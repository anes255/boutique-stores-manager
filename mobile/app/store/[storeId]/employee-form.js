import React, { useEffect, useState } from 'react';
import { View, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { api } from '../../../src/api';
import { colors, money, periodLabel, row, shortDate } from '../../../src/theme';
import {
  KeyboardScreen, Header, Card, Button, Field, Loader, ErrorNote,
  SectionTitle, Switch, ListRow,
} from '../../../src/components/ui';

const today = () => new Date().toISOString().slice(0, 10);

export default function EmployeeForm() {
  const { id, storeId } = useLocalSearchParams();
  const router = useRouter();
  const editing = !!id;

  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [payments, setPayments] = useState([]);
  const [currency, setCurrency] = useState(undefined);

  const [form, setForm] = useState({
    full_name: '', job_title: '', phone: '', email: '',
    monthly_salary: '', hired_at: today(), is_active: true, note: '',
  });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!editing) return;
    (async () => {
      try {
        const data = await api.get(`/api/employees/${id}`);
        const e = data.employee;
        setForm({
          full_name: e.full_name || '', job_title: e.job_title || '', phone: e.phone || '',
          email: e.email || '', monthly_salary: String(e.monthly_salary ?? ''),
          hired_at: (e.hired_at || today()).slice(0, 10), is_active: e.is_active, note: e.note || '',
        });
        setPayments(data.payments || []);
        setCurrency(e.currency);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, editing]);

  async function save() {
    setError(null);
    if (form.full_name.trim().length < 2) return setError('أدخل اسمه الكامل');
    setSaving(true);
    try {
      const payload = {
        store_id: storeId,
        full_name: form.full_name.trim(),
        job_title: form.job_title.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        monthly_salary: Number(form.monthly_salary) || 0,
        hired_at: /^\d{4}-\d{2}-\d{2}$/.test(form.hired_at) ? form.hired_at : null,
        is_active: form.is_active,
        note: form.note.trim() || null,
      };
      if (editing) await api.patch(`/api/employees/${id}`, payload);
      else await api.post('/api/employees', payload);
      router.back();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function remove() {
    Alert.alert('حذفه من الفريق؟', `${form.full_name} وسجل رواتبه سيُحذفان.`, [
      { text: 'إبقاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          try { await api.del(`/api/employees/${id}`); router.back(); }
          catch (err) { setError(err.message); }
        },
      },
    ]);
  }

  if (loading) return <Loader text="جاري التحميل…" />;

  return (
    <>
      <Header title={editing ? 'تعديل موظف' : 'إضافة موظف'}
        subtitle={editing ? form.full_name : 'قائمة الأجور'} onBack={() => router.back()} />
      <KeyboardScreen>
        <ErrorNote message={error} />

        <Card style={{ gap: 14 }}>
          <Field label="الاسم الكامل" value={form.full_name} onChangeText={set('full_name')}
            placeholder="مثال: سارة مزيان" />
          <Field label="الوظيفة" value={form.job_title} onChangeText={set('job_title')}
            placeholder="بائعة" />
          <View style={{ flexDirection: row, gap: 12 }}>
            <Field style={{ flex: 1 }} label="الهاتف" value={form.phone} onChangeText={set('phone')}
              placeholder="0770000000" keyboardType="phone-pad" />
            <Field style={{ flex: 1 }} label="البريد" value={form.email} onChangeText={set('email')}
              placeholder="اختياري" autoCapitalize="none" keyboardType="email-address" />
          </View>
        </Card>

        <Card style={{ gap: 14 }}>
          <SectionTitle icon="dollar-sign">الراتب</SectionTitle>
          <Field label="الراتب الشهري" value={form.monthly_salary} onChangeText={set('monthly_salary')}
            placeholder="0" keyboardType="numeric" />
          <Field label="تاريخ البداية" value={form.hired_at} onChangeText={set('hired_at')}
            placeholder="YYYY-MM-DD" autoCorrect={false} />
          <Switch label="ما زال يعمل هنا" value={form.is_active} onChange={set('is_active')} />
        </Card>

        <Card style={{ gap: 12 }}>
          <Field label="ملاحظات" value={form.note} onChangeText={set('note')}
            placeholder="أيام الراحة، الاتفاقات، أي شيء مفيد" multiline />
        </Card>

        {editing ? (
          <Button title="دفع راتب" icon="dollar-sign" variant="sage"
            onPress={() => router.push({ pathname: '/modal/salary', params: { id, name: form.full_name } })} />
        ) : null}

        {editing && payments.length ? (
          <Card>
            <SectionTitle icon="calendar">سجل الرواتب</SectionTitle>
            {payments.slice(0, 12).map((p, i, arr) => (
              <ListRow
                key={p.id}
                title={periodLabel(p.period)}
                subtitle={`دُفع في ${shortDate(p.paid_at)}${Number(p.bonus) > 0 ? ` · منحة ${Number(p.bonus)}` : ''}`}
                icon="check-circle"
                iconTone={colors.good}
                iconSoft={colors.goodSoft}
                right={money(p.total, currency, { compact: true })}
                last={i === Math.min(arr.length, 12) - 1}
              />
            ))}
          </Card>
        ) : null}

        <Button title={editing ? 'حفظ التعديلات' : 'إضافة إلى الفريق'} icon="check"
          onPress={save} loading={saving} />
        {editing ? <Button title="حذف من الفريق" icon="trash-2" variant="danger" onPress={remove} /> : null}
      </KeyboardScreen>
    </>
  );
}
