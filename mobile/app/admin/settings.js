import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '../../src/auth';
import { getBaseUrl, setBaseUrl } from '../../src/api';
import { colors, font, radius, row, spacing, type } from '../../src/theme';
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
    if (next.length < 8) return setError('كلمة السر الجديدة تحتاج 8 خانات على الأقل');
    if (next !== confirm) return setError('كلمتا السر الجديدتان غير متطابقتين');
    setBusy(true);
    try {
      await changePassword(current, next);
      setCurrent(''); setNext(''); setConfirm('');
      setMessage('تم تحديث كلمة السر. تم تسجيل الخروج من الأجهزة الأخرى.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function onLogout() {
    Alert.alert('تسجيل الخروج؟', 'ستحتاج اسم المستخدم وكلمة السر للعودة.', [
      { text: 'البقاء', style: 'cancel' },
      {
        text: 'خروج',
        style: 'destructive',
        onPress: async () => { await logout(); router.replace('/login'); },
      },
    ]);
  }

  if (!user) return <Loader />;

  return (
    <>
      <Header title="حسابي" subtitle="الإعدادات" />
      <Screen>
        <Card style={{ alignItems: 'center', gap: 8, paddingVertical: spacing.lg }}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user.full_name || 'م').trim().slice(0, 1)}</Text>
          </View>
          <Text style={type.title}>{user.full_name}</Text>
          <Text style={type.body}>{user.email}</Text>
          <Badge
            text={user.role === 'admin' ? 'المالك · صلاحيات كاملة' : `${user.store_name || 'محل'}`}
            icon="shield"
          />
        </Card>

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
            المكان الذي يقرأ منه التطبيق بياناتك. لا تغيّره إلا إذا نقلت الخادم.
          </Text>
          <Field value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false}
            placeholder="https://your-api.onrender.com" />
          <Button title="حفظ عنوان الخادم" variant="white" small style={{ marginTop: 10 }}
            onPress={async () => { const v = await setBaseUrl(server); setServer(v); setMessage('تم حفظ عنوان الخادم.'); }} />
        </Card>

        <Card>
          <SectionTitle icon="help-circle">كيف يعمل التطبيق</SectionTitle>
          <ListRow icon="shopping-bag" title="أنشئ محلا"
            subtitle="تبويب المحلات ← محل جديد" />
          <ListRow icon="key" title="أعطه حساب دخول"
            subtitle="افتح المحل ← إعدادات ← إضافة حساب" />
          <ListRow icon="tag" title="أضف المنتجات"
            subtitle="داخل المحل ← المنتجات" />
          <ListRow icon="shopping-cart" title="سجّل المبيعات"
            subtitle="داخل المحل ← بيع" last />
        </Card>

        <Button title="تسجيل الخروج" icon="log-out" variant="danger" onPress={onLogout} />
        <Text style={[type.tiny, { textAlign: 'center' }]}>متجري · إدارة عدة محلات</Text>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 72, height: 72, borderRadius: 26, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: font.bodyBlack, fontSize: 28, color: colors.white, lineHeight: 46 },
  good: {
    flexDirection: row, alignItems: 'center', gap: 8,
    backgroundColor: colors.goodSoft, padding: 12, borderRadius: radius.md,
  },
});
