import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { api } from '../../src/api';
import { useAuth } from '../../src/auth';
import { onDataChanged } from '../../src/events';
import { colors, font, row, spacing } from '../../src/theme';
import { Screen, Loader } from '../../src/components/ui';
import {
  TopBar, BigButton, BigField, Notice, Sheet, Feather, TONES,
} from '../../src/components/simple';

/**
 * صفحة المالك: شيء واحد فقط — المحلات وحسابات الدخول.
 * كل شيء يحدث في نوافذ فوق هذه الشاشة، بدون الانتقال لصفحات أخرى.
 */

// كلمة سر سهلة القراءة: كلمة + 4 أرقام
function suggestPassword() {
  const words = ['nour', 'amal', 'ward', 'fajr', 'rima', 'sama', 'hana', 'nada'];
  return words[Math.floor(Math.random() * words.length)] + Math.floor(1000 + Math.random() * 9000);
}

export default function Admin() {
  const router = useRouter();
  const { logout } = useAuth();

  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null);

  // نافذة واحدة في كل مرة
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const list = await api.get('/api/stores');
      const detailed = await Promise.all((list.stores || []).map(async (s) => {
        const d = await api.get(`/api/stores/${s.id}`);
        return { id: s.id, name: s.name, logins: d.staff || [] };
      }));
      setStores(detailed);
      setLoadError(null);
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    return onDataChanged(() => load());
  }, [load]);

  const flash = (text) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 3000);
  };

  const open = (d, initial = {}) => { setError(null); setForm(initial); setDialog(d); };
  const close = () => { if (!busy) { setDialog(null); setError(null); } };
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function run(fn) {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  // ------------------------------------------------------------ actions
  const addStore = () => run(async () => {
    const name = (form.name || '').trim();
    if (name.length < 2) throw new Error('اكتب اسم المحل');
    const code = 'S' + Date.now().toString(36).toUpperCase();
    const data = await api.post('/api/stores', { name, code });
    // مباشرة بعد إنشاء المحل: من سيدخل إليه؟
    open({ kind: 'login', store: { id: data.store.id, name: data.store.name }, fresh: true },
      { fullName: '', username: '', password: suggestPassword() });
  });

  const addLogin = () => run(async () => {
    const fullName = (form.fullName || '').trim();
    const username = (form.username || '').trim().toLowerCase();
    const password = form.password || '';
    if (fullName.length < 2) throw new Error('اكتب اسم الشخص');
    if (!/^\S{3,}$/.test(username)) throw new Error('اسم المستخدم: 3 حروف أو أرقام على الأقل، بدون فراغات');
    if (password.length < 8) throw new Error('كلمة السر: 8 حروف أو أرقام على الأقل');
    await api.post(`/api/stores/${dialog.store.id}/accounts`, {
      full_name: fullName, email: username, password, role: 'manager', create_employee: false,
    });
    open({ kind: 'creds', storeName: dialog.store.name, username, password });
  });

  const newPassword = () => run(async () => {
    const password = form.password || '';
    if (password.length < 8) throw new Error('كلمة السر: 8 حروف أو أرقام على الأقل');
    await api.post(`/api/stores/${dialog.store.id}/accounts/${dialog.login.id}/password`, { password });
    open({ kind: 'creds', storeName: dialog.store.name, username: dialog.login.email, password });
  });

  const confirmYes = () => run(async () => {
    await dialog.onYes();
    setDialog(null);
    if (dialog.done) flash(dialog.done);
  });

  // ------------------------------------------------------------ screen
  if (loading) return <Loader text="جاري التحميل…" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar
        title="محلاتي"
        subtitle="صفحة المالك"
        actionLabel="خروج"
        actionIcon="log-out"
        onAction={() => open({
          kind: 'confirm', text: 'هل تريد الخروج من التطبيق؟', yes: 'نعم، اخرج',
          onYes: async () => { await logout(); router.replace('/login'); },
        })}
      />
      <Screen refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }}>
        <Notice text={notice} />
        {loadError ? <Notice text={loadError} tone="red" /> : null}

        <BigButton label="إضافة محل جديد" icon="plus-circle" tone="green"
          onPress={() => open({ kind: 'store' }, { name: '' })} />

        {stores.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="shopping-bag" size={40} color={colors.primary} />
            <Text style={styles.emptyText}>
              ليس لديك محلات بعد.{'\n'}اضغط على الزر الأخضر لإضافة أول محل.
            </Text>
          </View>
        ) : null}

        {stores.map((s) => (
          <View key={s.id} style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.storeIcon}><Feather name="shopping-bag" size={24} color={colors.primary} /></View>
              <Text style={styles.storeName} numberOfLines={2}>{s.name}</Text>
            </View>

            <Text style={styles.sectionLabel}>من يستطيع الدخول لهذا المحل:</Text>
            {s.logins.length === 0 ? (
              <Text style={styles.noLogin}>لا أحد بعد. أضف حساب دخول.</Text>
            ) : s.logins.map((l) => (
              <View key={l.id} style={styles.login}>
                <Feather name="user" size={22} color={colors.inkSoft} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.loginName} numberOfLines={1}>{l.full_name}</Text>
                  <Text style={styles.loginUser} numberOfLines={1}>اسم المستخدم: {l.email}</Text>
                </View>
                <BigButton small filled={false} tone="blue" icon="key" label="كلمة سر جديدة"
                  onPress={() => open({ kind: 'password', store: s, login: l }, { password: suggestPassword() })} />
                <BigButton small filled={false} tone="red" icon="trash-2" label=""
                  style={{ width: 50 }}
                  onPress={() => open({
                    kind: 'confirm', text: `حذف حساب "${l.full_name}"؟ لن يستطيع الدخول بعد الآن.`, yes: 'نعم، احذف',
                    done: 'تم حذف الحساب',
                    onYes: () => api.del(`/api/stores/${s.id}/accounts/${l.id}`),
                  })} />
              </View>
            ))}

            <View style={styles.cardActions}>
              <BigButton small filled={false} tone="blue" icon="user-plus" label="إضافة حساب دخول"
                style={{ flex: 1 }}
                onPress={() => open({ kind: 'login', store: s }, { fullName: '', username: '', password: suggestPassword() })} />
              <BigButton small filled={false} tone="red" icon="trash-2" label="حذف المحل"
                onPress={() => open({
                  kind: 'confirm',
                  text: `حذف محل "${s.name}"؟\nكل منتجاته وأرقامه وحساباته ستُحذف نهائيا.`,
                  yes: 'نعم، احذف المحل', done: 'تم حذف المحل',
                  onYes: () => api.del(`/api/stores/${s.id}`),
                })} />
            </View>
          </View>
        ))}
      </Screen>

      {/* ------------------------------------------------ النوافذ */}

      <Sheet visible={dialog?.kind === 'store'} title="محل جديد" onClose={close}
        footer={<BigButton label="حفظ المحل" icon="check" tone="green" loading={busy} onPress={addStore} />}>
        <BigField label="اسم المحل" value={form.name || ''} onChangeText={set('name')}
          placeholder="مثال: محل النور" autoFocus />
        <Notice text={error} tone="red" />
      </Sheet>

      <Sheet visible={dialog?.kind === 'login'}
        title={dialog?.fresh ? `تم إنشاء "${dialog?.store?.name}"\nمن سيدخل إليه؟` : `حساب دخول لـ "${dialog?.store?.name}"`}
        onClose={close}
        footer={<BigButton label="إنشاء الحساب" icon="check" tone="green" loading={busy} onPress={addLogin} />}>
        <BigField label="اسم الشخص" value={form.fullName || ''} onChangeText={set('fullName')}
          placeholder="مثال: أمين" />
        <BigField label="اسم المستخدم (رقم هاتفه مثلا)" value={form.username || ''} onChangeText={set('username')}
          placeholder="0770000000" autoCapitalize="none" autoCorrect={false} keyboardType="phone-pad" />
        <BigField label="كلمة السر" value={form.password || ''} onChangeText={set('password')}
          autoCapitalize="none" autoCorrect={false} hint="اقترحنا لك كلمة سر سهلة. يمكنك تغييرها." />
        <Notice text={error} tone="red" />
      </Sheet>

      <Sheet visible={dialog?.kind === 'password'} title={`كلمة سر جديدة لـ "${dialog?.login?.full_name}"`}
        onClose={close}
        footer={<BigButton label="حفظ كلمة السر" icon="check" tone="green" loading={busy} onPress={newPassword} />}>
        <BigField label="كلمة السر الجديدة" value={form.password || ''} onChangeText={set('password')}
          autoCapitalize="none" autoCorrect={false} hint="8 حروف أو أرقام على الأقل." />
        <Notice text={error} tone="red" />
      </Sheet>

      <Sheet visible={dialog?.kind === 'creds'} title="تم! أعطِ هذه المعلومات لصاحب المحل" onClose={close}
        footer={<BigButton label="تم" icon="check" tone="green" onPress={() => setDialog(null)} />}>
        <Text style={styles.credsStore}>{dialog?.storeName}</Text>
        <View style={styles.credBox}>
          <Text style={styles.credLabel}>اسم المستخدم</Text>
          <Text selectable style={styles.credValue}>{dialog?.username}</Text>
        </View>
        <View style={styles.credBox}>
          <Text style={styles.credLabel}>كلمة السر</Text>
          <Text selectable style={styles.credValue}>{dialog?.password}</Text>
        </View>
      </Sheet>

      <Sheet visible={dialog?.kind === 'confirm'} title="تأكيد" onClose={close}
        footer={(
          <View style={{ flexDirection: row, gap: 10 }}>
            <BigButton label="لا" tone="grey" filled={false} style={{ flex: 1 }} onPress={close} />
            <BigButton label={dialog?.yes || 'نعم'} tone="red" style={{ flex: 2 }} loading={busy} onPress={confirmYes} />
          </View>
        )}>
        <Text style={styles.confirmText}>{dialog?.text}</Text>
        <Notice text={error} tone="red" />
      </Sheet>
    </View>
  );
}

const rtl = { writingDirection: 'rtl', textAlign: 'right' };

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: 12, paddingVertical: spacing.xl },
  emptyText: { fontFamily: font.bodyBold, fontSize: 18, lineHeight: 30, color: colors.inkSoft, textAlign: 'center' },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 22, padding: spacing.md, gap: 12,
    borderWidth: 1, borderColor: colors.lineSoft,
  },
  cardHead: { flexDirection: row, alignItems: 'center', gap: 12 },
  storeIcon: {
    width: 50, height: 50, borderRadius: 25, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  storeName: { flex: 1, fontFamily: font.display, fontSize: 24, lineHeight: 38, color: colors.ink, ...rtl },
  sectionLabel: { fontFamily: font.bodyBold, fontSize: 16, lineHeight: 26, color: colors.inkSoft, ...rtl },
  noLogin: { fontFamily: font.bodyBold, fontSize: 17, lineHeight: 28, color: TONES.red.fg, ...rtl },
  login: {
    flexDirection: row, alignItems: 'center', gap: 10,
    backgroundColor: colors.surfaceSoft, borderRadius: 16, padding: 12,
  },
  loginName: { fontFamily: font.bodyBlack, fontSize: 18, lineHeight: 28, color: colors.ink, ...rtl },
  loginUser: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 24, color: colors.inkSoft, ...rtl },
  cardActions: { flexDirection: row, gap: 10 },
  credsStore: { fontFamily: font.bodyBlack, fontSize: 19, lineHeight: 30, color: colors.primary, ...rtl },
  credBox: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, gap: 4, borderWidth: 1.5, borderColor: colors.line },
  credLabel: { fontFamily: font.bodyBold, fontSize: 16, lineHeight: 26, color: colors.inkSoft, ...rtl },
  credValue: { fontFamily: font.bodyBlack, fontSize: 28, lineHeight: 40, color: colors.ink, textAlign: 'left', writingDirection: 'ltr' },
  confirmText: { fontFamily: font.bodyBold, fontSize: 19, lineHeight: 32, color: colors.ink, ...rtl },
});
