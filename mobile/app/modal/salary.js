import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { api } from '../../src/api';
import { colors, money, periodLabel, row, spacing, type } from '../../src/theme';
import {
  KeyboardScreen, Header, Card, Button, Field, Loader, ErrorNote, Switch, Chips,
} from '../../src/components/ui';

function recentPeriods(count = 6) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    const p = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export default function Salary() {
  const { id, name } = useLocalSearchParams();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [paid, setPaid] = useState(new Set());

  const [period, setPeriod] = useState(recentPeriods()[0]);
  const [base, setBase] = useState('');
  const [bonus, setBonus] = useState('');
  const [deduction, setDeduction] = useState('');
  const [note, setNote] = useState('');
  const [logExpense, setLogExpense] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get(`/api/employees/${id}`);
        setEmployee(data.employee);
        setBase(String(data.employee.monthly_salary ?? ''));
        setPaid(new Set((data.payments || []).map((p) => p.period)));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const currency = employee?.currency;
  const total = (Number(base) || 0) + (Number(bonus) || 0) - (Number(deduction) || 0);

  async function pay() {
    setError(null);
    if (paid.has(period)) return setError(`${name} تقاضى راتب ${periodLabel(period)} من قبل`);
    if (total < 0) return setError('الاقتطاعات لا يمكن أن تتجاوز الراتب');
    setSaving(true);
    try {
      await api.post(`/api/employees/${id}/salary`, {
        period,
        base_amount: Number(base) || 0,
        bonus: Number(bonus) || 0,
        deduction: Number(deduction) || 0,
        note: note.trim() || null,
        log_as_expense: logExpense,
      });
      router.back();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loader text="جاري تحميل الرواتب…" />;

  const periods = recentPeriods(6).map((p) => ({
    label: paid.has(p) ? `${periodLabel(p)} · مدفوع` : periodLabel(p),
    value: p,
  }));

  return (
    <>
      <Header title="دفع راتب" subtitle={name} onBack={() => router.back()} />
      <KeyboardScreen>
        <ErrorNote message={error} />

        <Card style={{ gap: 14 }}>
          <View style={{ gap: 6 }}>
            <Text style={[type.label, { color: colors.inkSoft }]}>عن أي شهر</Text>
            <Chips options={periods} value={period} onChange={setPeriod} />
          </View>
          <Field label="الراتب الأساسي" value={base} onChangeText={setBase}
            placeholder="0" keyboardType="numeric" />
          <View style={{ flexDirection: row, gap: 12 }}>
            <Field style={{ flex: 1 }} label="منحة" value={bonus} onChangeText={setBonus}
              placeholder="0" keyboardType="numeric" />
            <Field style={{ flex: 1 }} label="اقتطاع" value={deduction} onChangeText={setDeduction}
              placeholder="0" keyboardType="numeric" />
          </View>
          <Field label="ملاحظة (اختياري)" value={note} onChangeText={setNote}
            placeholder="تسبيق، ساعات إضافية، أي شيء" />
        </Card>

        <Card style={styles.totalBox}>
          <Text style={type.label}>المبلغ الذي سيتقاضاه</Text>
          <Text style={[type.hero, { fontSize: 30 }]}>{money(total, currency)}</Text>
        </Card>

        <Card>
          <Switch
            label="سجّله أيضا كمصروف"
            hint="يبقي حساب الربح الصافي دقيقا. مستحسن."
            value={logExpense}
            onChange={setLogExpense}
          />
        </Card>

        <Button title={`دفع راتب ${periodLabel(period)}`} icon="check" onPress={pay} loading={saving}
          disabled={paid.has(period)} />
        {paid.has(period) ? (
          <Text style={[type.tiny, { textAlign: 'center' }]}>
            هذا الشهر مدفوع من قبل. اختر شهرا آخر من الأعلى.
          </Text>
        ) : null}
      </KeyboardScreen>
    </>
  );
}

const styles = StyleSheet.create({
  totalBox: {
    backgroundColor: colors.sageSoft, borderColor: colors.sageSoft,
    alignItems: 'center', gap: 4, paddingVertical: spacing.lg,
  },
});
