import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';

import { api } from '../../../src/api';
import { useAuth } from '../../../src/auth';
import { useData } from '../../../src/hooks';
import { useStoreRouteId, useBranch } from '../../../src/store-route';
import { colors, font } from '../../../src/theme';
import { Loader } from '../../../src/components/ui';
import { BigButton, BigField, Notice, Sheet } from '../../../src/components/simple';
import { Page, DataTable, ActionBar, ConfirmSheet, Flash, useDialog, useGoBack } from '../../../src/components/kit';
import { suggestPassword } from '../../../src/passwords';

/**
 * حسابات الفرع (للمستخدم الرئيسي فقط): رمز الفرع الذي يُنشئ به العامل حسابه،
 * وقائمة من يستطيع الدخول، مع إضافة حساب / كلمة سر جديدة / حذف.
 */
export default function Accounts() {
  const storeId = useStoreRouteId();
  const branch = useBranch();
  const { isAdmin } = useAuth();
  const goBack = useGoBack(`/store/${storeId}`);
  const [selected, setSelected] = useState(null);
  const d = useDialog();

  const { data, loading, refreshing, error: loadError, reload } = useData({
    store: [`/api/stores/${storeId}`, {}],
  }, [storeId], { enabled: isAdmin });

  if (!isAdmin) return <Redirect href={`/store/${storeId}`} />;
  if (loading && !data.store) return <Loader text="جاري التحميل…" />;

  const store = data.store?.store;
  const staff = data.store?.staff || [];
  const picked = staff.find((s) => s.id === selected);

  const needRow = () => {
    if (picked) return true;
    d.flash('اختر حسابا من الجدول أولا، ثم اضغط الزر', 'orange');
    return false;
  };

  const addAccount = () => d.run(async () => {
    const username = (d.form.username || '').trim().toLowerCase();
    const password = d.form.password || '';
    if (!/^\S{3,}$/.test(username)) throw new Error('اسم المستخدم: 3 حروف أو أرقام على الأقل، بدون فراغات');
    if (password.length < 8) throw new Error('كلمة السر: 8 حروف أو أرقام على الأقل');
    await api.post(`/api/stores/${storeId}/accounts`, { username, password });
    d.open({ kind: 'creds', username, password });
  });

  const newPassword = () => d.run(async () => {
    const password = d.form.password || '';
    if (password.length < 8) throw new Error('كلمة السر: 8 حروف أو أرقام على الأقل');
    await api.post(`/api/stores/${storeId}/accounts/${d.dialog.row.id}/password`, { password });
    d.open({ kind: 'creds', username: d.dialog.row.email, password });
  });

  const remove = () => d.run(async () => {
    await api.del(`/api/stores/${storeId}/accounts/${d.dialog.row.id}`);
    setSelected(null);
    d.finish();
    d.flash('تم حذف الحساب');
  });

  const newCode = () => d.run(async () => {
    await api.post(`/api/stores/${storeId}/join-code`);
    d.finish();
    d.flash('تم إنشاء رمز جديد. الرمز القديم لم يعد يعمل.');
  });

  return (
    <>
      <Page title="الحسابات ورمز الفرع" subtitle={branch.name} onBack={goBack} refreshing={refreshing} onRefresh={reload}
        footer={(
          <ActionBar actions={[
            { label: 'إضافة حساب', icon: 'user-plus', tone: 'green',
              onPress: () => d.open({ kind: 'add' }, { username: '', password: suggestPassword() }) },
            { label: 'كلمة سر جديدة', icon: 'key', tone: 'blue',
              onPress: () => needRow() && d.open({ kind: 'password', row: picked }, { password: suggestPassword() }) },
            { label: 'حذف', icon: 'trash-2', tone: 'red', onPress: () => needRow() && d.open({ kind: 'delete', row: picked }) },
          ]} />
        )}>
        <Flash notice={d.notice} />
        {loadError ? <Notice text={loadError} tone="red" /> : null}

        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>رمز الفرع</Text>
          <Text selectable style={styles.code}>{store?.join_code}</Text>
          <Text style={styles.codeHint}>
            أعطِ هذا الرمز لمن يعمل في هذا الفرع. يفتح التطبيق، يختار «مستخدم فرعي» ثم «إنشاء حساب»، ويكتب الرمز.
          </Text>
          <BigButton small filled={false} tone="orange" icon="refresh-cw" label="رمز جديد"
            onPress={() => d.open({ kind: 'code' })} />
        </View>

        <Text style={styles.section}>من يستطيع الدخول لهذا الفرع</Text>
        <DataTable
          columns={[
            { key: 'full_name', label: 'الاسم', flex: 1.3 },
            { key: 'email', label: 'اسم المستخدم', flex: 1.3 },
          ]}
          rows={staff}
          selected={selected}
          onSelect={setSelected}
          empty="لا أحد بعد. أعطِ رمز الفرع لمن يعمل فيه، أو اضغط «إضافة حساب»."
        />
      </Page>

      <Sheet visible={d.dialog?.kind === 'add'} title="إضافة حساب" onClose={d.close}
        footer={<BigButton label="إنشاء الحساب" icon="check" tone="green" loading={d.busy} onPress={addAccount} />}>
        <BigField label="اسم المستخدم (رقم هاتفه مثلا)" value={d.form.username || ''} onChangeText={d.set('username')}
          placeholder="0770000000" autoCapitalize="none" autoCorrect={false} />
        <BigField label="كلمة السر" value={d.form.password || ''} onChangeText={d.set('password')}
          autoCapitalize="none" autoCorrect={false} hint="اقترحنا لك كلمة سر سهلة. يمكنك تغييرها." />
        <Notice text={d.error} tone="red" />
      </Sheet>

      <Sheet visible={d.dialog?.kind === 'password'} title={`كلمة سر جديدة لـ "${d.dialog?.row?.email || ''}"`} onClose={d.close}
        footer={<BigButton label="حفظ كلمة السر" icon="check" tone="green" loading={d.busy} onPress={newPassword} />}>
        <BigField label="كلمة السر الجديدة" value={d.form.password || ''} onChangeText={d.set('password')}
          autoCapitalize="none" autoCorrect={false} hint="8 حروف أو أرقام على الأقل." />
        <Notice text={d.error} tone="red" />
      </Sheet>

      <Sheet visible={d.dialog?.kind === 'creds'} title="تم! أعطِ هذه المعلومات لصاحب الحساب" onClose={d.close}
        footer={<BigButton label="تم" icon="check" tone="green" onPress={d.finish} />}>
        <View style={styles.cred}>
          <Text style={styles.credLabel}>اسم المستخدم</Text>
          <Text selectable style={styles.credValue}>{d.dialog?.username}</Text>
        </View>
        <View style={styles.cred}>
          <Text style={styles.credLabel}>كلمة السر</Text>
          <Text selectable style={styles.credValue}>{d.dialog?.password}</Text>
        </View>
        <Text style={styles.codeHint}>يدخل من «مستخدم فرعي».</Text>
      </Sheet>

      <ConfirmSheet visible={d.dialog?.kind === 'delete'} title="حذف حساب" busy={d.busy} error={d.error}
        text={`حذف حساب "${d.dialog?.row?.email || ''}"؟ لن يستطيع الدخول بعد الآن.`}
        yes="نعم، احذف" onYes={remove} onClose={d.close} />

      <ConfirmSheet visible={d.dialog?.kind === 'code'} title="رمز جديد" busy={d.busy} error={d.error}
        text="سيتوقف الرمز الحالي عن العمل. الحسابات الموجودة تبقى كما هي."
        yes="نعم، رمز جديد" onYes={newCode} onClose={d.close} />
    </>
  );
}

const rtl = { writingDirection: 'rtl', textAlign: 'right' };

const styles = StyleSheet.create({
  section: { fontFamily: font.display, fontSize: 20, lineHeight: 32, color: colors.ink, ...rtl },
  codeBox: {
    alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderRadius: 22, padding: 18,
    borderWidth: 2, borderStyle: 'dashed', borderColor: colors.primary,
  },
  codeLabel: { fontFamily: font.bodyBold, fontSize: 17, lineHeight: 26, color: colors.inkSoft },
  code: { fontFamily: font.bodyBlack, fontSize: 40, lineHeight: 54, letterSpacing: 6, color: colors.ink, writingDirection: 'ltr' },
  codeHint: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 24, color: colors.inkSoft, textAlign: 'center' },
  cred: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, gap: 4, borderWidth: 1.5, borderColor: colors.line },
  credLabel: { fontFamily: font.bodyBold, fontSize: 16, lineHeight: 26, color: colors.inkSoft, ...rtl },
  credValue: { fontFamily: font.bodyBlack, fontSize: 28, lineHeight: 40, color: colors.ink, textAlign: 'left', writingDirection: 'ltr' },
});
