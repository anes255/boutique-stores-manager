import React, { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useAuth } from '../src/auth';
import { colors, font } from '../src/theme';
import { BigButton, BigField, Notice, Chip } from '../src/components/simple';
import { Page, useGoBack } from '../src/components/kit';

/**
 * إنشاء حساب مستخدم رئيسي: اسم المستخدم، كلمة السر، تأكيد كلمة السر.
 * إنشاء حساب مستخدم فرعي: نفس الحقول + رمز الفرع (يعطيه المستخدم الرئيسي).
 */
export default function Register() {
  const router = useRouter();
  const { as: asParam } = useLocalSearchParams();
  const as = asParam === 'owner' ? 'owner' : 'worker';
  const goBack = useGoBack({ pathname: '/login', params: { as } });
  const { register } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function onSubmit() {
    const name = username.trim().toLowerCase();
    if (!/^\S{3,}$/.test(name)) { setError('اسم المستخدم: 3 حروف أو أرقام على الأقل، بدون فراغات'); return; }
    if (password.length < 8) { setError('كلمة السر: 8 حروف أو أرقام على الأقل'); return; }
    if (password !== confirm) { setError('كلمتا السر غير متطابقتين'); return; }
    if (as === 'worker' && code.trim().length < 4) { setError('اكتب رمز الفرع'); return; }
    setBusy(true);
    setError(null);
    try {
      const user = await register(as, {
        username: name, password, ...(as === 'worker' ? { code: code.trim().toUpperCase() } : {}),
      });
      router.replace(user.role === 'admin' ? '/owner' : `/store/${user.store_id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title={as === 'owner' ? 'إنشاء حساب مستخدم رئيسي' : 'إنشاء حساب مستخدم فرعي'}
      subtitle="حساب جديد" onBack={goBack}
      footer={<BigButton label="إنشاء" icon="check" tone="green" loading={busy} onPress={onSubmit} />}>
      <BigField label="اسم المستخدم" value={username} onChangeText={setUsername}
        placeholder="رقم هاتفك مثلا" autoCapitalize="none" autoCorrect={false} hint="بدون فراغات" />
      <BigField label="كلمة السر" value={password} onChangeText={setPassword} placeholder="••••••••"
        secureTextEntry={!show} autoCapitalize="none" hint="8 حروف أو أرقام على الأقل" />
      <BigField label="تأكيد كلمة السر" value={confirm} onChangeText={setConfirm} placeholder="••••••••"
        secureTextEntry={!show} autoCapitalize="none" />
      <Chip label={show ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'} onPress={() => setShow((v) => !v)} />
      {as === 'worker' ? (
        <>
          <BigField label="رمز الفرع" value={code} onChangeText={setCode} placeholder="مثال: K7P2QX"
            autoCapitalize="characters" autoCorrect={false} />
          <Text style={styles.hint}>تجد رمز الفرع عند المستخدم الرئيسي (صفحة الفرع ← الحسابات ورمز الفرع).</Text>
        </>
      ) : null}
      <Notice text={error} tone="red" />
    </Page>
  );
}

const styles = StyleSheet.create({
  hint: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 24, color: colors.inkSoft, textAlign: 'center' },
});
