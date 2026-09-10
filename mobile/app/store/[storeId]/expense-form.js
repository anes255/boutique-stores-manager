import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useStoreRouteId } from '../../../src/store-route';

import { api } from '../../../src/api';
import { colors, type } from '../../../src/theme';
import {
  KeyboardScreen, Header, Card, Button, Field, ErrorNote, Chips,
} from '../../../src/components/ui';

const CATEGORIES = [
  { label: 'الإيجار', value: 'rent' },
  { label: 'الفواتير', value: 'utilities' },
  { label: 'اللوازم', value: 'supplies' },
  { label: 'الإشهار', value: 'marketing' },
  { label: 'النقل', value: 'transport' },
  { label: 'تلف أو ضياع', value: 'loss' },
  { label: 'الضرائب', value: 'tax' },
  { label: 'الأجور', value: 'salary' },
  { label: 'أخرى', value: 'other' },
];

const today = () => new Date().toISOString().slice(0, 10);

export default function ExpenseForm() {
  // المحل يأتي من تخطيط المحل، لا من معاملات هذه الشاشة
  const storeId = useStoreRouteId();
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
    if (!label.trim()) return setError('على ماذا صُرف هذا المبلغ؟');
    if (!(Number(amount) > 0)) return setError('أدخل مبلغا أكبر من الصفر');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(spentAt)) return setError('اكتب التاريخ بالشكل YYYY-MM-DD');

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
      <Header title="إضافة مصروف" subtitle="حتى يبقى الربح الحقيقي واضحا" onBack={() => router.back()} />
      <KeyboardScreen>
        <ErrorNote message={error} />

        <Card style={{ gap: 14 }}>
          <View style={{ gap: 6 }}>
            <Text style={[type.label, { color: colors.inkSoft }]}>نوع المصروف</Text>
            <Chips options={CATEGORIES} value={category} onChange={setCategory} />
          </View>
          <Field label="ما هو؟" value={label} onChangeText={setLabel}
            placeholder="مثال: فاتورة الكهرباء — سبتمبر" />
          <Field label="المبلغ" value={amount} onChangeText={setAmount}
            placeholder="0" keyboardType="numeric" />
          <Field label="التاريخ" value={spentAt} onChangeText={setSpentAt}
            placeholder="YYYY-MM-DD" autoCorrect={false}
            hint="اليوم افتراضيا. غيّره إذا كنت تسجل مصاريف قديمة." />
          <Field label="ملاحظة (اختياري)" value={note} onChangeText={setNote}
            placeholder="أي شيء يستحق التذكر" multiline />
        </Card>

        <Button title="حفظ المصروف" icon="check" onPress={save} loading={saving} />
      </KeyboardScreen>
    </>
  );
}
