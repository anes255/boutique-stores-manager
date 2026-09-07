import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '../../src/auth';
import { getBaseUrl, setBaseUrl } from '../../src/api';
import { colors, font, radius, spacing, type } from '../../src/theme';
import {
  Screen, Header, Card, SectionTitle, Button, Field, Loader,
  ErrorNote, ListRow, Feather, Badge,
} from '../../src/components/ui';

export default function Settings() {
  const router = useRouter();
  const { user, logout, changePassword } = useAuth();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [server, setServer] = useState(getBaseUrl());

  async function onChangePassword() {
    setError(null);
    setMessage(null);
    if (next.length < 8) return setError('New password needs at least 8 characters');
    if (next !== confirm) return setError('The two new passwords do not match');
    setBusy(true);
    try {
      await changePassword(current, next);
      setCurrent(''); setNext(''); setConfirm('');
      setMessage('Password updated. Other devices were signed out.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function onLogout() {
    Alert.alert('Sign out?', 'You will need your email and password to come back.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => { await logout(); router.replace('/login'); },
      },
    ]);
  }

  if (!user) return <Loader />;

  return (
    <>
      <Header title="Your account" subtitle="Settings" />
      <Screen>
        <Card style={{ alignItems: 'center', gap: 8, paddingVertical: spacing.lg }}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user.full_name || 'B').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
            </Text>
          </View>
          <Text style={type.title}>{user.full_name}</Text>
          <Text style={type.body}>{user.email}</Text>
          <Badge
            text={user.role === 'admin' ? 'Owner · full access' : `${user.role} · ${user.store_name || 'store'}`}
            icon="shield"
          />
        </Card>

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
            Where this app looks for your data. Leave it alone unless you moved the backend.
          </Text>
          <Field value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false}
            placeholder="https://your-api.onrender.com" />
          <Button title="Save server address" variant="white" small style={{ marginTop: 10 }}
            onPress={async () => { const v = await setBaseUrl(server); setServer(v); setMessage('Server address saved.'); }} />
        </Card>

        <Card>
          <SectionTitle icon="help-circle">How it works</SectionTitle>
          <ListRow icon="shopping-bag" title="Create a store"
            subtitle="Stores tab → New store" />
          <ListRow icon="key" title="Give it a login"
            subtitle="Open the store → Manage → Add a login" />
          <ListRow icon="tag" title="Add products"
            subtitle="Inside a store → Products" />
          <ListRow icon="shopping-cart" title="Record sales"
            subtitle="Inside a store → Sell" last />
        </Card>

        <Button title="Sign out" icon="log-out" variant="danger" onPress={onLogout} />
        <Text style={[type.tiny, { textAlign: 'center' }]}>Boutique · multi-store manager</Text>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 72, height: 72, borderRadius: 26, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: font.bodyBlack, fontSize: 26, color: colors.white },
  good: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.goodSoft, padding: 12, borderRadius: radius.md,
  },
});
