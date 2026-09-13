import React from 'react';
import {
  View, Text, Pressable, StyleSheet, Modal, ScrollView, KeyboardAvoidingView,
  Platform, useWindowDimensions, TextInput, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, font, radius, row, shadow, spacing } from '../theme';

/**
 * عناصر كبيرة وواضحة لتطبيق يستعمله أي أحد: أزرار عالية، خط كبير، ألوان ثابتة المعنى.
 * الأخضر = ربح، الأحمر = خسارة، البرتقالي = مصاريف.
 */
const tap = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); };

export const TONES = {
  green: { fg: '#23804F', soft: '#E1F3E8', solid: '#2E9E62' },
  red: { fg: '#BD3F39', soft: '#FBE4E2', solid: '#D5524B' },
  orange: { fg: '#B85A1F', soft: '#FDEBD9', solid: '#E8813A' },
  blue: { fg: '#2A74A8', soft: '#E1EEF8', solid: '#3E93C9' },
  grey: { fg: '#4A3F35', soft: '#F2EAE1', solid: '#6B5C4F' },
};

export function TopBar({ title, subtitle, actionLabel, actionIcon, onAction }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.top, { paddingTop: insets.top + 14 }]}>
      <View style={{ flex: 1 }}>
        {subtitle ? <Text style={styles.topSub}>{subtitle}</Text> : null}
        <Text style={styles.topTitle} numberOfLines={1}>{title}</Text>
      </View>
      {actionLabel ? (
        <Pressable onPress={() => { tap(); onAction?.(); }} style={styles.topAction} hitSlop={10}>
          {actionIcon ? <Feather name={actionIcon} size={20} color={colors.inkSoft} /> : null}
          <Text style={styles.topActionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function BigButton({ label, icon, tone = 'orange', filled = true, onPress, loading, disabled, style, small }) {
  const t = TONES[tone];
  const off = loading || disabled;
  const fg = filled ? '#FFFFFF' : t.fg;
  return (
    <Pressable
      onPress={() => { if (off) return; tap(); onPress?.(); }}
      style={({ pressed }) => [
        styles.bigBtn,
        small && styles.bigBtnSmall,
        { backgroundColor: filled ? t.solid : t.soft },
        off && { opacity: 0.5 },
        pressed && !off && { transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon ? <Feather name={icon} size={small ? 20 : 24} color={fg} /> : null}
          <Text style={[styles.bigBtnText, small && { fontSize: 16 }, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** بطاقة رقم كبيرة: الربح / الخسارة / المصاريف */
export function StatCard({ label, hint, value, tone, icon }) {
  const t = TONES[tone];
  return (
    <View style={[styles.stat, { backgroundColor: t.soft }]}>
      <View style={styles.statIcon}><Feather name={icon} size={26} color={t.fg} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.statLabel, { color: t.fg }]}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Text style={[styles.statValue, { color: t.fg }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
      </Text>
    </View>
  );
}

/** اختيار بين خيارين أو ثلاثة بأزرار كبيرة */
export function Toggle({ options, value, onChange }) {
  return (
    <View style={styles.toggle}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => { tap(); onChange(o.value); }}
            style={[styles.toggleItem, on && styles.toggleOn]}>
            <Text style={[styles.toggleText, on && { color: colors.ink }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** حقل إدخال كبير مع عنوان واضح فوقه */
export function BigField({ label, hint, style, ...props }) {
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput placeholderTextColor={colors.inkMuted} style={styles.field} {...props} />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** عدّاد كبير: ـ  1  + */
export function Stepper({ value, onChange, max }) {
  const v = Number(value) || 0;
  const clamp = (n) => Math.max(1, max != null ? Math.min(max, n) : n);
  return (
    <View style={styles.stepper}>
      <Pressable style={styles.stepBtn} onPress={() => { tap(); onChange(clamp(v - 1)); }} hitSlop={8}>
        <Feather name="minus" size={30} color={colors.ink} />
      </Pressable>
      <TextInput
        value={String(value)}
        onChangeText={(t) => onChange(t.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        style={styles.stepValue}
      />
      <Pressable style={styles.stepBtn} onPress={() => { tap(); onChange(clamp(v + 1)); }} hitSlop={8}>
        <Feather name="plus" size={30} color={colors.ink} />
      </Pressable>
    </View>
  );
}

/** شريط رسالة كبير: تم الحفظ، أو خطأ */
export function Notice({ text, tone = 'green' }) {
  if (!text) return null;
  const t = TONES[tone];
  return (
    <View style={[styles.notice, { backgroundColor: t.soft }]}>
      <Feather name={tone === 'red' ? 'alert-circle' : 'check-circle'} size={22} color={t.fg} />
      <Text style={[styles.noticeText, { color: t.fg }]}>{text}</Text>
    </View>
  );
}

/**
 * نافذة من الأسفل: فوق كل الشاشة (وشريط التنقل)، محتواها يتمرّر، والأزرار ثابتة بالأسفل.
 * نافذة واحدة فقط في كل مرة.
 */
export function Sheet({ visible, title, onClose, children, footer }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.anchor}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.grabber} />
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle} numberOfLines={2}>{title}</Text>
              <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
                <Feather name="x" size={24} color={colors.ink} />
              </Pressable>
            </View>
            <ScrollView
              style={{ maxHeight: Math.max(240, height * 0.6) }}
              contentContainerStyle={{ gap: 14, paddingBottom: 8 }}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              {children}
            </ScrollView>
            {footer ? <View style={styles.sheetFooter}>{footer}</View> : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export { Feather };

const rtl = { writingDirection: 'rtl', textAlign: 'right' };

const styles = StyleSheet.create({
  top: {
    flexDirection: row, alignItems: 'center', gap: 12,
    paddingHorizontal: spacing.md, paddingBottom: 12, backgroundColor: colors.bg,
  },
  topSub: { fontFamily: font.bodyBold, fontSize: 15, lineHeight: 24, color: colors.primary, ...rtl },
  topTitle: { fontFamily: font.display, fontSize: 27, lineHeight: 42, color: colors.ink, ...rtl },
  topAction: {
    flexDirection: row, alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 44,
    borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  topActionText: { fontFamily: font.bodyBold, fontSize: 16, lineHeight: 24, color: colors.inkSoft },

  bigBtn: {
    flexDirection: row, alignItems: 'center', justifyContent: 'center', gap: 10,
    minHeight: 64, paddingHorizontal: 18, borderRadius: 18,
  },
  bigBtnSmall: { minHeight: 50, borderRadius: 14, paddingHorizontal: 12 },
  bigBtnText: { fontFamily: font.bodyBlack, fontSize: 19, lineHeight: 30 },

  stat: { flexDirection: row, alignItems: 'center', gap: 14, padding: 16, borderRadius: 20 },
  statIcon: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  statLabel: { fontFamily: font.bodyBlack, fontSize: 20, lineHeight: 30, ...rtl },
  statValue: { fontFamily: font.bodyBlack, fontSize: 24, lineHeight: 36, maxWidth: '50%', textAlign: 'left' },
  hint: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 22, color: colors.inkMuted, ...rtl },

  toggle: { flexDirection: row, backgroundColor: colors.bgAlt, borderRadius: 18, padding: 5, gap: 4 },
  toggleItem: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 50, borderRadius: 14 },
  toggleOn: { backgroundColor: '#FFFFFF', ...shadow(1) },
  toggleText: { fontFamily: font.bodyBlack, fontSize: 17, lineHeight: 26, color: colors.inkMuted },

  fieldLabel: { fontFamily: font.bodyBold, fontSize: 17, lineHeight: 26, color: colors.ink, ...rtl },
  field: {
    minHeight: 60, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line,
    backgroundColor: '#FFFFFF', paddingHorizontal: 16, fontFamily: font.bodyBold,
    fontSize: 19, color: colors.ink, ...rtl,
  },

  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 },
  stepBtn: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFFFFF',
    borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center',
  },
  stepValue: {
    minWidth: 96, height: 72, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1.5,
    borderColor: colors.line, textAlign: 'center', fontFamily: font.bodyBlack, fontSize: 34, color: colors.ink,
  },

  notice: { flexDirection: row, alignItems: 'center', gap: 10, padding: 14, borderRadius: 16 },
  noticeText: { flex: 1, fontFamily: font.bodyBold, fontSize: 17, lineHeight: 26, ...rtl },

  backdrop: { flex: 1, backgroundColor: '#33291F70', justifyContent: 'flex-end' },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: 10,
  },
  grabber: { width: 48, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: 'center' },
  sheetHead: { flexDirection: row, alignItems: 'center', gap: 10 },
  sheetTitle: { flex: 1, fontFamily: font.display, fontSize: 23, lineHeight: 36, color: colors.ink, ...rtl },
  closeBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center',
  },
  sheetFooter: { gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.lineSoft },
});
