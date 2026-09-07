import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '../../src/auth';
import { getBaseUrl, setBaseUrl } from '../../src/api';
import { colors, font, radius, spacing, type } from '../../src/theme';
import {
  KeyboardScreen, Header, Card, Button, Field, Loader, ErrorNote,
  SectionTitle, Badge, Feather, ListRow,
} from '../../src/components/ui';

export default function MyAccount() {
  const router = useRouter();
  const { user, logout, changePassword } = useAuth();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [server, setServer] = useState(getBaseUrl());

  async function onChangePassword() {
    setError(null); setMessage(null);
    if (next.length < 8) return setError('New password needs at least 8 characters');
    if (next !== confirm) return setError('The two new passwords do not match');
    setBusy(true);
    try {
      await changePassword(current, next);
      setCurrent(''); setNext(''); setConfirm('');
      setMessage('Password updated.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!user) return <Loader />;

  return (
    <>
      <Header title="Your account" subtitle={user.store_name} onBack={() => router.back()} />
      <KeyboardScreen>
        <Card style={{ alignItems: 'center', gap: 8, paddingVertical: spacing.lg }}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user.full_name || 'U').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
            </Text>
          </View>
          <Text style={type.title}>{user.full_name}</Text>
          <Text style={type.body}>{user.email}</Text>
          <Badge text={`${user.role} · ${user.store_name || 'store'}`} icon="shield" />
        </Card>

        {user.must_change_password ? (
          <Card style={{ backgroundColor: colors.warnSoft, borderColor: colors.warnSoft, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="alert-triangle" size={16} color={colors.warn} />
              <Text style={[type.bodyStrong, { color: colors.warn }]}>Please pick your own password</Text>
            </View>
            <Text style={type.tiny}>
              You are still using the password the owner gave you. Change it below to keep your store safe.
            </Text>
          </Card>
        ) : null}

        <Card>
          <SectionTitle icon="lock">Change your password</SectionTitle>
          <View style={{ gap: 12, marginTop: 10 }}>
            <Field label="Current password" value={current} onChangeText={setCurrent}
              secureTextEntry autoCapitalize="none" placeholder="••••••••" />
            <Field label="New password" value={next} onChangeText={setNext}
              secureTextEntry autoCapitalize="none" placeholder="At least 8 characters" />
            <Field label="Repeat new password" value={confirm} onChangeText={setConfirm}
              secureTextEntry autoCapitalize="none" placeholder="••••••••" />
            <ErrorNote message={error} />
            {message ? (
              <View style={styles.good}>
                <Feather name="check-circle" size={15} color={colors.good} />
                <Text style={[type.label, { color: colors.good, flex: 1 }]}>{message}</Text>
              </View>
            ) : null}
            <Button title="Update password" icon="check" onPress={onChangePassword} loading={busy} />
          </View>
        </Card>

        <Card>
          <SectionTitle icon="server">Server</SectionTitle>
          <Text style={[type.tiny, { marginTop: 4, marginBottom: 10 }]}>
            Only change this if the owner tells you to.
          </Text>
          <Field value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} />
          <Button title="Save" variant="white" small style={{ marginTop: 10 }}
            onPress={async () => { const v = await setBaseUrl(server); setServer(v); setMessage('Saved.'); }} />
        </Card>

        <Button title="Sign out" icon="log-out" variant="danger"
          onPress={() => Alert.alert('Sign out?', 'You will need your login to come back.', [
            { text: 'Stay', style: 'cancel' },
            { text: 'Sign out', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
          ])} />
      </KeyboardScreen>
    </>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 72, height: 72, borderRadius: 26, backgroundColor: colors.sage,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: font.bodyBlack, fontSize: 26, color: colors.white },
  good: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.goodSoft, padding: 12, borderRadius: radius.md,
  },
});
