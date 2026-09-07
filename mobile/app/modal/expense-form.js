import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { api } from '../../src/api';
import { colors, type } from '../../src/theme';
import {
  KeyboardScreen, Header, Card, Button, Field, ErrorNote, SectionTitle, Chips,
} from '../../src/components/ui';

const CATEGORIES = [
  { label: 'Rent', value: 'rent' },
  { label: 'Utilities', value: 'utilities' },
  { label: 'Supplies', value: 'supplies' },
  { label: 'Marketing', value: 'marketing' },
  { label: 'Transport', value: 'transport' },
  { label: 'Damaged / lost', value: 'loss' },
  { label: 'Tax', value: 'tax' },
  { label: 'Salary', value: 'salary' },
  { label: 'Other', value: 'other' },
];

const today = () => new Date().toISOString().slice(0, 10);

export default function ExpenseForm() {
  const { storeId } = useLocalSearchParams();
  const router = useRouter();

  const [category, setCategory] = useState('supplies');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [spentAt, setSpentAt] = useState(today());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    setError(null);
    if (!label.trim()) return setError('What was this for?');
    if (!(Number(amount) > 0)) return setError('Enter an amount above zero');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(spentAt)) return setError('Use the date format YYYY-MM-DD');

    setSaving(true);
    try {
      await api.post('/api/expenses', {
        store_id: storeId,
        category,
        label: label.trim(),
        amount: Number(amount),
        spent_at: spentAt,
        note: note.trim() || null,
      });
      router.back();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Header title="Add an expense" subtitle="Keep the real profit honest" onBack={() => router.back()} />
      <KeyboardScreen>
        <ErrorNote message={error} />

        <Card style={{ gap: 14 }}>
          <View style={{ gap: 6 }}>
            <Text style={[type.label, { color: colors.inkSoft }]}>Kind of expense</Text>
            <Chips options={CATEGORIES} value={category} onChange={setCategory} />
          </View>
          <Field label="What was it?" value={label} onChangeText={setLabel}
            placeholder="Electricity bill — September" />
          <Field label="How much" value={amount} onChangeText={setAmount}
            placeholder="0" keyboardType="numeric" />
          <Field label="Date" value={spentAt} onChangeText={setSpentAt}
            placeholder="YYYY-MM-DD" autoCorrect={false}
            hint="Defaults to today. Change it if you are catching up." />
          <Field label="Note (optional)" value={note} onChangeText={setNote}
            placeholder="Anything worth remembering" multiline />
        </Card>

        <Button title="Save expense" icon="check" onPress={save} loading={saving} />
      </KeyboardScreen>
    </>
  );
}
