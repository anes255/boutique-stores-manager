import React, { useEffect, useRef, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useAuth } from '../src/auth';
import { colors, font } from '../src/theme';
import { BigButton, BigField, Notice, Chip } from '../src/components/simple';
import { Page, useGoBack } from '../src/components/kit';

/** تسجيل دخول رئيسي / فرعي: اسم المستخدم، كلمة السر، دخول. وتحته «إنشاء حساب». */
export default function Login() {
  const router = useRouter();
  const { as: asParam } = useLocalSearchParams();
  const as = asParam === 'owner' ? 'owner' : 'worker';
  const goBack = useGoBack('/');
  const { login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState(null);
  const slowTimer = useRef(null);

  // الخادم المجاني ينام بعد فترة خمول، وإيقاظه يأخذ وقتا.
  useEffect(() => {
    if (busy) slowTimer.current = setTimeout(() => setSlow(true), 6000);
    else { clearTimeout(slowTimer.current); setSlow(false); }
    return () => clearTimeout(slowTimer.current);
  }, [busy]);

  async function onSubmit() {
    if (!username.trim() || !password) { setError('اكتب اسم المستخدم وكلمة السر'); return; }
    setBusy(true);
    setError(null);
    try {
      const user = await login(username, password, as);
      router.replace(user.role === 'admin' ? '/owner' : `/store/${user.store_id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title={as === 'owner' ? 'تسجيل دخول رئيسي' : 'تسجيل دخول فرعي'}
      subtitle={as === 'owner' ? 'مستخدم رئيسي' : 'مستخدم فرعي'} onBack={goBack}>
      <BigField label="اسم المستخدم" value={username} onChangeText={setUsername}
        placeholder="مثال: 0770000000" autoCapitalize="none" autoCorrect={false} textContentType="username" />
      <BigField label="كلمة السر" value={password} onChangeText={setPassword} placeholder="••••••••"
        secureTextEntry={!show} autoCapitalize="none" textContentType="password"
        returnKeyType="go" onSubmitEditing={onSubmit} />
      <Chip label={show ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'} onPress={() => setShow((v) => !v)} />

      <Notice text={error} tone="red" />
      <BigButton label="دخول" icon="log-in" tone="green" loading={busy} onPress={onSubmit} />
      {slow ? <Text style={styles.hint}>جاري إيقاظ الخادم… قد يستغرق هذا دقيقة في أول استعمال.</Text> : null}

      <Text style={[styles.hint, { marginTop: 18 }]}>ليس لديك حساب؟</Text>
      <BigButton label="إنشاء حساب" icon="user-plus" tone="blue" filled={false}
        onPress={() => router.push({ pathname: '/register', params: { as } })} />
    </Page>
  );
}

const styles = StyleSheet.create({
  hint: { fontFamily: font.bodyBold, fontSize: 16, lineHeight: 26, color: colors.inkSoft, textAlign: 'center' },
});
