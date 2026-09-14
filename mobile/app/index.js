import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../src/auth';
import { colors, font, row, spacing, type } from '../src/theme';
import { Loader } from '../src/components/ui';
import { Feather, TONES } from '../src/components/simple';

/**
 * «الدخول»: زران فقط، مستخدم رئيسي أو مستخدم فرعي.
 * من دخل من قبل يذهب مباشرة إلى صفحته.
 */
export default function Welcome() {
  const { user, booting } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  if (booting) {
    return (
      <View style={styles.splash}>
        <View style={styles.mark}><Text style={styles.markText}>م</Text></View>
        <Text style={[type.title, { marginTop: 14 }]}>متجري</Text>
        <View style={{ height: 26 }} />
        <Loader text="" />
      </View>
    );
  }

  if (user?.role === 'admin') return <Redirect href="/owner" />;
  if (user?.store_id) return <Redirect href={`/store/${user.store_id}`} />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[styles.wrap, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 30 }]}>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <View style={styles.mark}><Text style={styles.markText}>م</Text></View>
        <Text style={[type.hero, { marginTop: 14, textAlign: 'center' }]}>الدخول</Text>
        <Text style={[type.body, { textAlign: 'center' }]}>اختر نوع حسابك</Text>
      </View>

      <Choice icon="briefcase" tone="orange" title="مستخدم رئيسي" hint="صاحب الفروع"
        onPress={() => router.push({ pathname: '/login', params: { as: 'owner' } })} />
      <Choice icon="user" tone="blue" title="مستخدم فرعي" hint="يعمل في فرع"
        onPress={() => router.push({ pathname: '/login', params: { as: 'worker' } })} />
    </ScrollView>
  );
}

function Choice({ icon, tone, title, hint, onPress }) {
  const t = TONES[tone];
  return (
    <Pressable onPress={onPress}
      style={({ pressed }) => [styles.choice, { borderColor: t.solid }, pressed && { transform: [{ scale: 0.98 }] }]}>
      <View style={[styles.choiceIcon, { backgroundColor: t.soft }]}>
        <Feather name={icon} size={34} color={t.fg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.choiceTitle}>{title}</Text>
        <Text style={styles.choiceHint}>{hint}</Text>
      </View>
      <Feather name="chevron-left" size={28} color={colors.inkMuted} />
    </Pressable>
  );
}

const rtl = { writingDirection: 'rtl', textAlign: 'right' };

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  wrap: { paddingHorizontal: spacing.lg, gap: spacing.lg, flexGrow: 1, justifyContent: 'center' },
  mark: {
    width: 76, height: 76, borderRadius: 27, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  markText: { fontFamily: font.display, fontSize: 34, color: colors.white, lineHeight: 54 },
  choice: {
    flexDirection: row, alignItems: 'center', gap: 16, backgroundColor: '#FFFFFF',
    borderRadius: 24, padding: 18, minHeight: 104, borderWidth: 2,
  },
  choiceIcon: { width: 66, height: 66, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  choiceTitle: { fontFamily: font.display, fontSize: 24, lineHeight: 38, color: colors.ink, ...rtl },
  choiceHint: { fontFamily: font.bodyBold, fontSize: 16, lineHeight: 24, color: colors.inkSoft, ...rtl },
});
