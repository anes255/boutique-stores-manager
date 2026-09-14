import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '../../src/auth';
import { colors, font } from '../../src/theme';
import { BigButton, BigField, Notice, Sheet } from '../../src/components/simple';
import { Page, MenuButton, ConfirmSheet, Flash, useDialog, useGoBack } from '../../src/components/kit';
import { suggestPassword } from '../../src/passwords';

/** الإعدادات: تغيير اسم المستخدم، تغيير كلمة السر، الخروج. */
export default function Settings() {
  const router = useRouter();
  const goBack = useGoBack('/owner');
  const { user, logout, updateCredentials } = useAuth();
  const d = useDialog();

  const saveUsername = () => d.run(async () => {
    const username = (d.form.username || '').trim().toLowerCase();
    if (!/^\S{3,}$/.test(username)) throw new Error('اسم المستخدم: 3 حروف أو أرقام على الأقل، بدون فراغات');
    if (!d.form.current) throw new Error('اكتب كلمة السر الحالية للتأكيد');
    const updated = await updateCredentials({ currentPassword: d.form.current, username });
    d.finish();
    d.flash(`تم. من الآن ادخل باسم المستخدم: ${updated.email}`);
  });

  const savePassword = () => d.run(async () => {
    if (!d.form.current) throw new Error('اكتب كلمة السر الحالية');
    if ((d.form.next || '').length < 8) throw new Error('كلمة السر الجديدة: 8 حروف أو أرقام على الأقل');
    await updateCredentials({ currentPassword: d.form.current, newPassword: d.form.next });
    d.finish();
    d.flash(`تم تغيير كلمة السر إلى: ${d.form.next}  (احفظها)`);
  });

  return (
    <>
      <Page title="الإعدادات" onBack={goBack}>
        <Flash notice={d.notice} />
        <View style={styles.box}>
          <Text style={styles.label}>اسم المستخدم الحالي</Text>
          <Text selectable style={styles.value}>{user?.email}</Text>
        </View>
        <MenuButton label="تغيير اسم المستخدم" icon="user" tone="blue"
          onPress={() => d.open({ kind: 'username' }, { username: user?.email || '', current: '' })} />
        <MenuButton label="تغيير كلمة السر" icon="lock" tone="blue"
          onPress={() => d.open({ kind: 'password' }, { current: '', next: suggestPassword() })} />
        <MenuButton label="خروج من التطبيق" icon="log-out" tone="red" onPress={() => d.open({ kind: 'logout' })} />
      </Page>

      <Sheet visible={d.dialog?.kind === 'username'} title="تغيير اسم المستخدم" onClose={d.close}
        footer={<BigButton label="حفظ" icon="check" tone="green" loading={d.busy} onPress={saveUsername} />}>
        <BigField label="اسم المستخدم الجديد" value={d.form.username || ''} onChangeText={d.set('username')}
          autoCapitalize="none" autoCorrect={false} hint="رقم هاتفك مثلا. بدون فراغات." />
        <BigField label="كلمة السر الحالية (للتأكيد)" value={d.form.current || ''} onChangeText={d.set('current')}
          secureTextEntry autoCapitalize="none" placeholder="••••••••" />
        <Notice text={d.error} tone="red" />
      </Sheet>

      <Sheet visible={d.dialog?.kind === 'password'} title="تغيير كلمة السر" onClose={d.close}
        footer={<BigButton label="حفظ كلمة السر" icon="check" tone="green" loading={d.busy} onPress={savePassword} />}>
        <BigField label="كلمة السر الحالية" value={d.form.current || ''} onChangeText={d.set('current')}
          secureTextEntry autoCapitalize="none" placeholder="••••••••" />
        <BigField label="كلمة السر الجديدة" value={d.form.next || ''} onChangeText={d.set('next')}
          autoCapitalize="none" autoCorrect={false}
          hint="اقترحنا لك واحدة سهلة. 8 حروف أو أرقام على الأقل. احفظها في مكان آمن." />
        <Notice text={d.error} tone="red" />
      </Sheet>

      <ConfirmSheet visible={d.dialog?.kind === 'logout'} title="خروج" text="هل تريد الخروج من التطبيق؟"
        yes="نعم، اخرج" busy={d.busy} onClose={d.close}
        onYes={() => d.run(async () => { await logout(); router.replace('/'); })} />
    </>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, gap: 4, borderWidth: 1.5, borderColor: colors.line },
  label: { fontFamily: font.bodyBold, fontSize: 16, lineHeight: 26, color: colors.inkSoft, writingDirection: 'rtl', textAlign: 'right' },
  value: { fontFamily: font.bodyBlack, fontSize: 26, lineHeight: 38, color: colors.ink, textAlign: 'left', writingDirection: 'ltr' },
});
