import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { api } from '../../src/api';
import { colors, radius, row, spacing, type } from '../../src/theme';
import {
  KeyboardScreen, Header, Card, Button, Field, ErrorNote,
  SectionTitle, Chips, Feather, Badge,
} from '../../src/components/ui';

/** كلمة سر سهلة القراءة حتى لا يضطر المالك لاختراع واحدة. */
function suggestPassword() {
  const words = ['Nour', 'Amal', 'Salam', 'Sahra', 'Amber', 'Ward', 'Nadi', 'Fajr', 'Rima', 'Zahra'];
  const w = words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(1000 + Math.random() * 9000);
  return `${w}@${n}`;
}

export default function AccountForm() {
  const { storeId, id, email: emailParam, name: nameParam, active, first } = useLocalSearchParams();
  const router = useRouter();
  const editing = !!id;

  const [fullName, setFullName] = useState(nameParam || '');
  const [email, setEmail] = useState(emailParam || '');
  const [password, setPassword] = useState(editing ? '' : suggestPassword());
  const [role, setRole] = useState('manager');
  const [phone, setPhone] = useState('');
  const [salary, setSalary] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  async function create() {
    setError(null);
    if (fullName.trim().length < 2) return setError('لمن هذا الحساب؟');
    if (!/^\S{3,160}$/.test(email.trim())) return setError('أدخل اسم مستخدم أو بريدا صالحا (بدون فراغات)');
    if (password.length < 8) return setError('كلمة السر تحتاج 8 خانات على الأقل');

    setSaving(true);
    try {
      await api.post(`/api/stores/${storeId}/accounts`, {
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
        phone: phone.trim() || null,
        create_employee: true,
        monthly_salary: Number(salary) || 0,
      });
      setDone({ email: email.trim().toLowerCase(), password });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword() {
    setError(null);
    if (password.length < 8) return setError('كلمة السر تحتاج 8 خانات على الأقل');
    setSaving(true);
    try {
      await api.post(`/api/stores/${storeId}/accounts/${id}/password`, { password });
      setDone({ email, password });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle() {
    const nextActive = active !== 'true';
    try {
      await api.patch(`/api/stores/${storeId}/accounts/${id}`, { is_active: nextActive });
      router.back();
    } catch (err) { setError(err.message); }
  }

  function remove() {
    Alert.alert('حذف حساب الدخول؟', `${email} لن يتمكن من الدخول بعد الآن.`, [
      { text: 'إبقاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          try { await api.del(`/api/stores/${storeId}/accounts/${id}`); router.back(); }
          catch (err) { setError(err.message); }
        },
      },
    ]);
  }

  if (done) {
    return (
      <>
        <Header title="الحساب جاهز" subtitle="سلّم هذه البيانات" onBack={() => router.back()} />
        <KeyboardScreen>
          <Card style={{ gap: 14, backgroundColor: colors.goodSoft, borderColor: colors.goodSoft }}>
            <View style={styles.doneIcon}>
              <Feather name="check" size={24} color={colors.white} />
            </View>
            <Text style={[type.title, { textAlign: 'center' }]}>تم بنجاح</Text>
            <Text style={[type.body, { textAlign: 'center' }]}>
              أعطِ هذه البيانات للشخص الذي يدير المحل. لن يرى إلا هذا المحل.
            </Text>
            <View style={styles.credBox}>
              <Cred label="اسم المستخدم" value={done.email} />
              <View style={styles.credLine} />
              <Cred label="كلمة السر" value={done.password} />
            </View>
            <Text style={[type.tiny, { textAlign: 'center' }]}>
              سيُطلب منه تغيير كلمة السر بعد أول دخول.
            </Text>
          </Card>
          <Button title="تم" icon="check" onPress={() => {
            if (first === '1') router.replace(`/store/${storeId}`);
            else router.back();
          }} />
        </KeyboardScreen>
      </>
    );
  }

  return (
    <>
      <Header
        title={editing ? 'إدارة الحساب' : 'إنشاء حساب دخول'}
        subtitle={editing ? email : 'الخطوة 2 من 2'}
        onBack={() => router.back()}
      />
      <KeyboardScreen>
        <ErrorNote message={error} />

        {!editing ? (
          <Card style={{ gap: 14 }}>
            <Field label="الاسم الكامل" value={fullName} onChangeText={setFullName}
              placeholder="مثال: أمينة بلقاسم" />
            <Field label="اسم المستخدم أو البريد" value={email} onChangeText={setEmail}
              placeholder="0770000000 أو amina@mail.com"
              autoCapitalize="none" autoCorrect={false}
              hint="هذا ما سيكتبه في شاشة الدخول." />
            <Field label="الهاتف (اختياري)" value={phone} onChangeText={setPhone}
              placeholder="0770000000" keyboardType="phone-pad" />
            <View style={{ gap: 6 }}>
              <Text style={[type.label, { color: colors.inkSoft }]}>ما هي صلاحياته؟</Text>
              <Chips
                options={[
                  { label: 'مسؤول المحل — كل شيء داخل المحل', value: 'manager' },
                  { label: 'بائع — البيع اليومي', value: 'staff' },
                ]}
                value={role}
                onChange={setRole}
              />
            </View>
            <Field label="الراتب الشهري" value={salary} onChangeText={setSalary}
              placeholder="0" keyboardType="numeric"
              hint="سنضيفه إلى قائمة الأجور بهذا الراتب." />
          </Card>
        ) : (
          <Card style={{ gap: 10 }}>
            <Text style={type.section}>{fullName}</Text>
            <Text style={type.body}>{email}</Text>
            <Badge text={active === 'true' ? 'يستطيع الدخول' : 'الدخول معطّل'}
              tone={active === 'true' ? colors.good : colors.bad}
              soft={active === 'true' ? colors.goodSoft : colors.badSoft}
              icon={active === 'true' ? 'check' : 'slash'} />
          </Card>
        )}

        <Card style={{ gap: 12 }}>
          <SectionTitle icon="lock">{editing ? 'تعيين كلمة سر جديدة' : 'كلمة السر'}</SectionTitle>
          <View style={{ flexDirection: row, gap: 10, alignItems: 'flex-end' }}>
            <Field style={{ flex: 1 }} value={password} onChangeText={setPassword}
              placeholder="8 خانات على الأقل" autoCapitalize="none" autoCorrect={false} />
            <Pressable onPress={() => setPassword(suggestPassword())} style={styles.diceBtn}>
              <Feather name="refresh-cw" size={16} color={colors.primaryDark} />
            </Pressable>
          </View>
          <Text style={type.tiny}>
            دوّنها قبل الحفظ — لأمانه لن تُعرض مرة أخرى.
          </Text>
        </Card>

        {editing ? (
          <>
            <Button title="حفظ كلمة السر الجديدة" icon="key" onPress={resetPassword} loading={saving} />
            <Button title={active === 'true' ? 'تعطيل هذا الحساب' : 'تفعيل هذا الحساب'}
              icon={active === 'true' ? 'slash' : 'check-circle'} variant="white" onPress={toggle} />
            <Button title="حذف هذا الحساب" icon="trash-2" variant="danger" onPress={remove} />
          </>
        ) : (
          <Button title="إنشاء الحساب" icon="user-plus" onPress={create} loading={saving} />
        )}

        {first === '1' ? (
          <Button title="لاحقا" variant="ghost"
            onPress={() => router.replace(`/store/${storeId}`)} />
        ) : null}
      </KeyboardScreen>
    </>
  );
}

function Cred({ label, value }) {
  return (
    <View style={{ gap: 3 }}>
      <Text style={type.tiny}>{label}</Text>
      <Text selectable style={[type.bodyStrong, { fontSize: 17, color: colors.ink, writingDirection: 'ltr', textAlign: 'left' }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  doneIcon: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: colors.good,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center',
  },
  credBox: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, gap: 10 },
  credLine: { height: 1, backgroundColor: colors.lineSoft },
  diceBtn: {
    width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
});
