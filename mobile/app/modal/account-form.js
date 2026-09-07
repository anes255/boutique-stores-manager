import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { api } from '../../src/api';
import { colors, font, radius, spacing, type } from '../../src/theme';
import {
  KeyboardScreen, Header, Card, Button, Field, ErrorNote,
  SectionTitle, Chips, Feather, Badge,
} from '../../src/components/ui';

/** A readable-but-random password so the owner never has to invent one. */
function suggestPassword() {
  const words = ['Linen', 'Velvet', 'Cotton', 'Satin', 'Denim', 'Silk', 'Wool', 'Amber', 'Olive', 'Coral'];
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
    if (fullName.trim().length < 2) return setError('Who is this login for?');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address');
    if (password.length < 8) return setError('Password needs at least 8 characters');

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
    if (password.length < 8) return setError('Password needs at least 8 characters');
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
    Alert.alert('Remove this login?', `${email} will no longer be able to sign in.`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
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
        <Header title="Login ready" subtitle="Share these details" onBack={() => router.back()} />
        <KeyboardScreen>
          <Card style={{ gap: 14, backgroundColor: colors.goodSoft, borderColor: colors.goodSoft }}>
            <View style={styles.doneIcon}>
              <Feather name="check" size={24} color={colors.white} />
            </View>
            <Text style={[type.title, { textAlign: 'center' }]}>All set</Text>
            <Text style={[type.body, { textAlign: 'center' }]}>
              Give these to the person who runs this store. They will only ever see this one store.
            </Text>
            <View style={styles.credBox}>
              <Cred label="Email" value={done.email} />
              <View style={styles.credLine} />
              <Cred label="Password" value={done.password} />
            </View>
            <Text style={[type.tiny, { textAlign: 'center' }]}>
              They will be asked to change this password after signing in.
            </Text>
          </Card>
          <Button title="Done" icon="check" onPress={() => {
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
        title={editing ? 'Manage login' : 'Create a login'}
        subtitle={editing ? email : 'Step 2 of 2'}
        onBack={() => router.back()}
      />
      <KeyboardScreen>
        <ErrorNote message={error} />

        {!editing ? (
          <Card style={{ gap: 14 }}>
            <Field label="Full name" value={fullName} onChangeText={setFullName}
              placeholder="Amina Belkacem" />
            <Field label="Email" value={email} onChangeText={setEmail}
              placeholder="amina@boutique.com" keyboardType="email-address"
              autoCapitalize="none" autoCorrect={false} />
            <Field label="Phone (optional)" value={phone} onChangeText={setPhone}
              placeholder="+213 …" keyboardType="phone-pad" />
            <View style={{ gap: 6 }}>
              <Text style={[type.label, { color: colors.inkSoft }]}>What can they do?</Text>
              <Chips
                options={[
                  { label: 'Manager — everything in this store', value: 'manager' },
                  { label: 'Staff — day to day selling', value: 'staff' },
                ]}
                value={role}
                onChange={setRole}
              />
            </View>
            <Field label="Monthly salary" value={salary} onChangeText={setSalary}
              placeholder="0" keyboardType="numeric"
              hint="We will add them to the payroll with this salary." />
          </Card>
        ) : (
          <Card style={{ gap: 10 }}>
            <Text style={type.section}>{fullName}</Text>
            <Text style={type.body}>{email}</Text>
            <Badge text={active === 'true' ? 'Can sign in' : 'Signing in is disabled'}
              tone={active === 'true' ? colors.good : colors.bad}
              soft={active === 'true' ? colors.goodSoft : colors.badSoft}
              icon={active === 'true' ? 'check' : 'slash'} />
          </Card>
        )}

        <Card style={{ gap: 12 }}>
          <SectionTitle icon="lock">{editing ? 'Set a new password' : 'Password'}</SectionTitle>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
            <Field style={{ flex: 1 }} value={password} onChangeText={setPassword}
              placeholder="At least 8 characters" autoCapitalize="none" autoCorrect={false} />
            <Pressable onPress={() => setPassword(suggestPassword())} style={styles.diceBtn}>
              <Feather name="refresh-cw" size={16} color={colors.primaryDark} />
            </Pressable>
          </View>
          <Text style={type.tiny}>
            Write it down before saving — for their safety it is never shown again.
          </Text>
        </Card>

        {editing ? (
          <>
            <Button title="Save new password" icon="key" onPress={resetPassword} loading={saving} />
            <Button title={active === 'true' ? 'Disable this login' : 'Enable this login'}
              icon={active === 'true' ? 'slash' : 'check-circle'} variant="white" onPress={toggle} />
            <Button title="Remove this login" icon="trash-2" variant="danger" onPress={remove} />
          </>
        ) : (
          <Button title="Create the login" icon="user-plus" onPress={create} loading={saving} />
        )}

        {first === '1' ? (
          <Button title="Skip for now" variant="ghost"
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
      <Text selectable style={[type.bodyStrong, { fontSize: 17, color: colors.ink }]}>{value}</Text>
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
    width: 50, height: 50, borderRadius: radius.md, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
});
