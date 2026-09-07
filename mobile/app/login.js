import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../src/auth';
import { colors, font, radius, row, shadow, spacing, type } from '../src/theme';
import { Button, Field, Feather, ErrorNote } from '../src/components/ui';

export default function Login() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function onSubmit() {
    if (!email.trim() || !password) {
      setError('أدخل اسم المستخدم وكلمة السر للمتابعة');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const user = await login(email, password);
      router.replace(user.role === 'admin' ? '/admin' : `/store/${user.store_id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.wrap, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 30 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandBlock}>
          <View style={styles.mark}><Text style={styles.markText}>م</Text></View>
          <Text style={[type.hero, { marginTop: 18, textAlign: 'center' }]}>مرحبا بعودتك</Text>
          <Text style={[type.body, { textAlign: 'center' }]}>
            سجّل الدخول لتفتح محلك وأرقامك وفريقك.
          </Text>
        </View>

        <View style={styles.card}>
          <Field
            label="اسم المستخدم أو البريد"
            value={email}
            onChangeText={setEmail}
            placeholder="مثال: 0770000000"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
            returnKeyType="next"
          />

          <View style={{ gap: 6 }}>
            <Text style={[type.label, { color: colors.inkSoft }]}>كلمة السر</Text>
            <View style={styles.passwordWrap}>
              <Field
                style={{ flex: 1 }}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={onSubmit}
              />
              <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.eye} hitSlop={8}>
                <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={colors.inkMuted} />
              </Pressable>
            </View>
          </View>

          <ErrorNote message={error} />

          <Button title="دخول" onPress={onSubmit} loading={busy} icon="log-in" />
        </View>

        <Text style={[type.tiny, { textAlign: 'center', marginTop: 6 }]}>
          حسابات الدخول ينشئها المالك. اطلب منه بيانات الدخول الخاصة بمحلك.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, gap: spacing.lg, flexGrow: 1, justifyContent: 'center' },
  brandBlock: { alignItems: 'center', gap: 6 },
  mark: {
    width: 76, height: 76, borderRadius: 27, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', ...shadow(3),
  },
  markText: { fontFamily: font.display, fontSize: 34, color: colors.white, lineHeight: 54 },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg,
    gap: spacing.md, borderWidth: 1, borderColor: colors.lineSoft, ...shadow(2),
  },
  passwordWrap: { flexDirection: row, alignItems: 'center' },
  eye: { position: 'absolute', left: 14, padding: 4 },
});
