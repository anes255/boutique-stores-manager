import React, { useEffect, useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { api } from '../../src/api';
import { colors, money, type } from '../../src/theme';
import {
  KeyboardScreen, Header, Card, Button, Field, Loader, ErrorNote,
  SectionTitle, Switch, ListRow, Badge,
} from '../../src/components/ui';

const today = () => new Date().toISOString().slice(0, 10);

export default function EmployeeForm() {
  const { id, storeId } = useLocalSearchParams();
  const router = useRouter();
  const editing = !!id;

  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [payments, setPayments] = useState([]);
  const [currency, setCurrency] = useState('DZD');

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
        setCurrency(e.currency || 'DZD');
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, editing]);

  async function save() {
    setError(null);
    if (form.full_name.trim().length < 2) return setError('Enter their name');
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
    Alert.alert('Remove from the team?', `${form.full_name} and their salary history are deleted.`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try { await api.del(`/api/employees/${id}`); router.back(); }
          catch (err) { setError(err.message); }
        },
      },
    ]);
  }

  if (loading) return <Loader text="Loading…" />;

  return (
    <>
      <Header title={editing ? 'Edit team member' : 'Add to the team'}
        subtitle={editing ? form.full_name : 'Payroll'} onBack={() => router.back()} />
      <KeyboardScreen>
        <ErrorNote message={error} />

        <Card style={{ gap: 14 }}>
          <Field label="Full name" value={form.full_name} onChangeText={set('full_name')}
            placeholder="Sara Meziane" />
          <Field label="Job title" value={form.job_title} onChangeText={set('job_title')}
            placeholder="Sales assistant" />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Field style={{ flex: 1 }} label="Phone" value={form.phone} onChangeText={set('phone')}
              placeholder="+213 …" keyboardType="phone-pad" />
            <Field style={{ flex: 1 }} label="Email" value={form.email} onChangeText={set('email')}
              placeholder="Optional" autoCapitalize="none" keyboardType="email-address" />
          </View>
        </Card>

        <Card style={{ gap: 14 }}>
          <SectionTitle icon="dollar-sign">Salary</SectionTitle>
          <Field label="Monthly salary" value={form.monthly_salary} onChangeText={set('monthly_salary')}
            placeholder="0" keyboardType="numeric" />
          <Field label="Started on" value={form.hired_at} onChangeText={set('hired_at')}
            placeholder="YYYY-MM-DD" autoCorrect={false} />
          <Switch label="Still working here" value={form.is_active} onChange={set('is_active')} />
        </Card>

        <Card style={{ gap: 12 }}>
          <Field label="Notes" value={form.note} onChangeText={set('note')}
            placeholder="Days off, agreements, anything useful" multiline />
        </Card>

        {editing ? (
          <Button title="Pay a salary" icon="dollar-sign" variant="sage"
            onPress={() => router.push({ pathname: '/modal/salary', params: { id, name: form.full_name } })} />
        ) : null}

        {editing && payments.length ? (
          <Card>
            <SectionTitle icon="calendar">Salary history</SectionTitle>
            {payments.slice(0, 12).map((p, i, arr) => (
              <ListRow
                key={p.id}
                title={p.period}
                subtitle={`Paid ${new Date(p.paid_at).toLocaleDateString()}${Number(p.bonus) > 0 ? ` · bonus ${Number(p.bonus)}` : ''}`}
                icon="check-circle"
                iconTone={colors.good}
                iconSoft={colors.goodSoft}
                right={money(p.total, currency, { compact: true })}
                last={i === Math.min(arr.length, 12) - 1}
              />
            ))}
          </Card>
        ) : null}

        <Button title={editing ? 'Save changes' : 'Add to the team'} icon="check"
          onPress={save} loading={saving} />
        {editing ? <Button title="Remove from team" icon="trash-2" variant="danger" onPress={remove} /> : null}
      </KeyboardScreen>
    </>
  );
}
