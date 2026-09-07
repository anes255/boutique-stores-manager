import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '../../src/auth';
import { getBaseUrl, setBaseUrl } from '../../src/api';
import { colors, font, radius, row, spacing, type } from '../../src/theme';
import {
  KeyboardScreen, Header, Card, Button, Field, Loader, ErrorNote,
  SectionTitle, Badge, Feather,
} from '../../src/components/ui';

const ROLES = { admin: 'المالك', manager: 'مسؤول المحل', staff: 'بائع' };

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
    if (next.length < 8) return setError('كلمة السر الجديدة تحتاج 8 خانات على الأقل');
    if (next !== confirm) return setError('كلمتا السر الجديدتان غير متطابقتين');
    setBusy(true);
    try {
      await changePassword(current, next);
      setCurrent(''); setNext(''); setConfirm('');
      setMessage('تم تحديث كلمة السر.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!user) return <Loader />;

  return (
    <>
      <Header title="حسابي" subtitle={user.store_name} onBack={() => router.back()} />
      <KeyboardScreen>
        <Card style={{ alignItems: 'center', gap: 8, paddingVertical: spacing.lg }}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user.full_name || 'م').trim().slice(0, 1)}</Text>
          </View>
          <Text style={type.title}>{user.full_name}</Text>
          <Text style={type.body}>{user.email}</Text>
          <Badge text={`${ROLES[user.role] || user.role} · ${user.store_name || 'محل'}`} icon="shield" />
        </Card>

        {user.must_change_password ? (
          <Card style={{ backgroundColor: colors.warnSoft, borderColor: colors.warnSoft, gap: 6 }}>
            <View style={{ flexDirection: row, alignItems: 'center', gap: 8 }}>
              <Feather name="alert-triangle" size={16} color={colors.warn} />
              <Text style={[type.bodyStrong, { color: colors.warn }]}>اختر كلمة سر خاصة بك</Text>
            </View>
            <Text style={type.tiny}>
              ما زلت تستعمل كلمة السر التي أعطاك إياها المالك. غيّرها بالأسفل للحفاظ على أمان محلك.
            </Text>
          </Card>
        ) : null}

        <Card>
          <SectionTitle icon="lock">تغيير كلمة السر</SectionTitle>
          <View style={{ gap: 12, marginTop: 10 }}>
            <Field label="كلمة السر الحالية" value={current} onChangeText={setCurrent}
              secureTextEntry autoCapitalize="none" placeholder="••••••••" />
            <Field label="كلمة السر الجديدة" value={next} onChangeText={setNext}
              secureTextEntry autoCapitalize="none" placeholder="8 خانات على الأقل" />
            <Field label="أعد كتابة الجديدة" value={confirm} onChangeText={setConfirm}
              secureTextEntry autoCapitalize="none" placeholder="••••••••" />
            <ErrorNote message={error} />
            {message ? (
              <View style={styles.good}>
                <Feather name="check-circle" size={15} color={colors.good} />
                <Text style={[type.label, { color: colors.good, flex: 1 }]}>{message}</Text>
              </View>
            ) : null}
            <Button title="تحديث كلمة السر" icon="check" onPress={onChangePassword} loading={busy} />
          </View>
        </Card>

        <Card>
          <SectionTitle icon="server">الخادم</SectionTitle>
          <Text style={[type.tiny, { marginTop: 4, marginBottom: 10 }]}>
            لا تغيّر هذا إلا إذا طلب منك المالك ذلك.
          </Text>
          <Field value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} />
          <Button title="حفظ" variant="white" small style={{ marginTop: 10 }}
            onPress={async () => { const v = await setBaseUrl(server); setServer(v); setMessage('تم الحفظ.'); }} />
        </Card>

        <Button title="تسجيل الخروج" icon="log-out" variant="danger"
          onPress={() => Alert.alert('تسجيل الخروج؟', 'ستحتاج بيانات الدخول للعودة.', [
            { text: 'البقاء', style: 'cancel' },
            { text: 'خروج', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
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
  avatarText: { fontFamily: font.bodyBlack, fontSize: 28, color: colors.white, lineHeight: 46 },
  good: {
    flexDirection: row, alignItems: 'center', gap: 8,
    backgroundColor: colors.goodSoft, padding: 12, borderRadius: radius.md,
  },
});
