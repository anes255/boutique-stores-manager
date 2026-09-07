import React from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator,
  ScrollView, RefreshControl, Platform, KeyboardAvoidingView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radius, row, shadow, spacing, type } from '../theme';

const tap = () => {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
};

/* ------------------------------------------------------------------ الهيكل */

export function Screen({ children, scroll = true, refreshing, onRefresh, contentStyle, style }) {
  const insets = useSafeAreaInsets();
  const pad = { paddingBottom: insets.bottom + 96 };
  if (!scroll) {
    return <View style={[styles.screen, style]}>{children}</View>;
  }
  return (
    <ScrollView
      style={[styles.screen, style]}
      contentContainerStyle={[styles.scrollContent, pad, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

export function KeyboardScreen({ children, ...rest }) {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <Screen {...rest}>{children}</Screen>
    </KeyboardAvoidingView>
  );
}

export function Header({ title, subtitle, right, onBack, tint = colors.primary }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
      <View style={styles.headerRow}>
        {onBack ? (
          <Pressable onPress={() => { tap(); onBack(); }} style={styles.backBtn} hitSlop={10}>
            {/* في واجهة من اليمين إلى اليسار سهم الرجوع يشير إلى اليمين */}
            <Feather name="chevron-right" size={22} color={colors.ink} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          {subtitle ? <Text style={[type.label, { color: tint, fontFamily: font.bodyBold }]}>{subtitle}</Text> : null}
          <Text style={type.title} numberOfLines={1}>{title}</Text>
        </View>
        {right}
      </View>
    </View>
  );
}

export function Card({ children, style, tone, onPress, padded = true }) {
  const body = (
    <View style={[
      styles.card,
      padded && { padding: spacing.md },
      tone && { backgroundColor: tone },
      style,
    ]}>
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={() => { tap(); onPress(); }} style={({ pressed }) => pressed && styles.pressed}>
      {body}
    </Pressable>
  );
}

export function SectionTitle({ children, action, onAction, icon }) {
  return (
    <View style={styles.sectionTitle}>
      <View style={{ flexDirection: row, alignItems: 'center', gap: 8, flex: 1 }}>
        {icon ? <Feather name={icon} size={16} color={colors.primary} /> : null}
        <Text style={type.section}>{children}</Text>
      </View>
      {action ? (
        <Pressable onPress={() => { tap(); onAction?.(); }} hitSlop={8}>
          <Text style={[type.label, { color: colors.primary, fontFamily: font.bodyBold }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export const Divider = ({ style }) => <View style={[styles.divider, style]} />;

/* ------------------------------------------------------------------ عناصر البيانات */

export function StatTile({ label, value, sub, tone = colors.primary, soft = colors.primarySoft, icon, trend, wide }) {
  const trendTone = trend == null ? null : trend >= 0 ? colors.good : colors.bad;
  return (
    <View style={[styles.tile, wide && { flexBasis: '100%' }, { backgroundColor: soft, borderColor: soft }]}>
      <View style={styles.tileTop}>
        {icon ? (
          <View style={[styles.tileIcon, { backgroundColor: colors.white }]}>
            <Feather name={icon} size={14} color={tone} />
          </View>
        ) : null}
        <Text style={[type.tiny, { color: colors.inkSoft, flex: 1 }]} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[type.number, { color: colors.ink, fontSize: wide ? 26 : 20, lineHeight: wide ? 40 : 32 }]}
        numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
      <View style={{ flexDirection: row, alignItems: 'center', gap: 5 }}>
        {trend != null ? (
          <>
            <Feather name={trend >= 0 ? 'trending-up' : 'trending-down'} size={12} color={trendTone} />
            <Text style={[type.tiny, { color: trendTone, fontFamily: font.bodyBold }]}>
              {trend >= 0 ? '+' : ''}{Number(trend).toFixed(1)}%
            </Text>
          </>
        ) : null}
        {sub ? <Text style={[type.tiny, { flex: 1 }]} numberOfLines={1}>{sub}</Text> : null}
      </View>
    </View>
  );
}

export function Badge({ text, tone = colors.primary, soft = colors.primarySoft, icon }) {
  return (
    <View style={[styles.badge, { backgroundColor: soft }]}>
      {icon ? <Feather name={icon} size={11} color={tone} /> : null}
      <Text style={[type.tiny, { color: tone, fontFamily: font.bodyBold }]}>{text}</Text>
    </View>
  );
}

export function Progress({ value = 0, tone = colors.primary, height = 8 }) {
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <View style={[styles.progressTrack, { height, borderRadius: height }]}>
      <View style={{ width: `${clamped}%`, backgroundColor: tone, height, borderRadius: height }} />
    </View>
  );
}

export function ListRow({ title, subtitle, right, rightSub, icon, iconTone = colors.primary,
  iconSoft = colors.primarySoft, onPress, last }) {
  const content = (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: iconSoft }]}>
          <Feather name={icon} size={16} color={iconTone} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={type.bodyStrong} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={type.tiny} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right != null ? (
        <View style={{ alignItems: 'flex-start' }}>
          {typeof right === 'string' || typeof right === 'number'
            ? <Text style={[type.bodyStrong, { color: colors.ink }]}>{right}</Text> : right}
          {rightSub ? <Text style={type.tiny}>{rightSub}</Text> : null}
        </View>
      ) : null}
      {onPress ? <Feather name="chevron-left" size={17} color={colors.inkMuted} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={() => { tap(); onPress(); }} style={({ pressed }) => pressed && styles.pressed}>
      {content}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ عناصر التحكم */

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, small, style, full = true }) {
  const v = BUTTONS[variant] || BUTTONS.primary;
  const isOff = disabled || loading;
  return (
    <Pressable
      onPress={() => { if (isOff) return; tap(); onPress?.(); }}
      style={({ pressed }) => [
        styles.button,
        small && { paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.md },
        { backgroundColor: v.bg, borderColor: v.border || v.bg },
        !full && { alignSelf: 'flex-start' },
        isOff && { opacity: 0.5 },
        pressed && !isOff && { transform: [{ scale: 0.985 }], opacity: 0.9 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={v.fg} /> : (
        <>
          {icon ? <Feather name={icon} size={small ? 15 : 17} color={v.fg} /> : null}
          <Text style={[styles.buttonText, small && { fontSize: 14 }, { color: v.fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const BUTTONS = {
  primary: { bg: colors.primary, fg: colors.white },
  sage: { bg: colors.sage, fg: colors.white },
  soft: { bg: colors.primarySoft, fg: colors.primaryDark },
  ghost: { bg: 'transparent', fg: colors.inkSoft, border: colors.line },
  danger: { bg: colors.badSoft, fg: colors.bad },
  white: { bg: colors.white, fg: colors.ink, border: colors.line },
};

export function Field({ label, hint, error, style, prefix, ...props }) {
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? <Text style={[type.label, { color: colors.inkSoft }]}>{label}</Text> : null}
      <View style={[styles.input, error && { borderColor: colors.bad, backgroundColor: colors.badSoft }]}>
        {prefix ? <Text style={[type.body, { color: colors.inkMuted }]}>{prefix}</Text> : null}
        <TextInput
          placeholderTextColor={colors.inkMuted}
          style={styles.inputText}
          {...props}
        />
      </View>
      {error ? <Text style={[type.tiny, { color: colors.bad }]}>{error}</Text> : null}
      {!error && hint ? <Text style={type.tiny}>{hint}</Text> : null}
    </View>
  );
}

export function Chips({ options, value, onChange, multi, style }) {
  const selected = multi ? (value || []) : value;
  const isOn = (v) => (multi ? selected.includes(v) : selected === v);
  return (
    <View style={[styles.chips, style]}>
      {options.map((opt) => {
        const v = typeof opt === 'string' ? opt : opt.value;
        const label = typeof opt === 'string' ? opt : opt.label;
        const on = isOn(v);
        return (
          <Pressable
            key={String(v)}
            onPress={() => {
              tap();
              if (!multi) return onChange(v);
              onChange(on ? selected.filter((x) => x !== v) : [...selected, v]);
            }}
            style={[styles.chip, on && { backgroundColor: colors.primary, borderColor: colors.primary }]}
          >
            <Text style={[type.label, { fontFamily: font.bodyBold }, on && { color: colors.white }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <View style={styles.segmented}>
      {options.map((opt) => {
        const v = typeof opt === 'string' ? opt : opt.value;
        const label = typeof opt === 'string' ? opt : opt.label;
        const on = v === value;
        return (
          <Pressable
            key={String(v)}
            onPress={() => { tap(); onChange(v); }}
            style={[styles.segment, on && styles.segmentOn]}
          >
            <Text style={[type.tiny, { fontFamily: font.bodyBold, textAlign: 'center' }, on && { color: colors.ink }]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Switch({ value, onChange, label, hint }) {
  return (
    <Pressable onPress={() => { tap(); onChange(!value); }} style={styles.switchRow}>
      <View style={{ flex: 1 }}>
        <Text style={type.bodyStrong}>{label}</Text>
        {hint ? <Text style={type.tiny}>{hint}</Text> : null}
      </View>
      <View style={[styles.switchTrack, value && { backgroundColor: colors.sage }]}>
        <View style={[styles.switchKnob, value && { alignSelf: 'flex-end' }]} />
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ الحالات */

export function Loader({ text = 'جاري التحضير…' }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={[type.label, { marginTop: 12 }]}>{text}</Text>
    </View>
  );
}

export function EmptyState({ icon = 'inbox', title, text, actionLabel, onAction }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Feather name={icon} size={26} color={colors.primary} />
      </View>
      <Text style={[type.section, { textAlign: 'center' }]}>{title}</Text>
      {text ? <Text style={[type.body, { textAlign: 'center' }]}>{text}</Text> : null}
      {actionLabel ? <Button title={actionLabel} onPress={onAction} full={false} small style={{ marginTop: 4 }} /> : null}
    </View>
  );
}

export function ErrorNote({ message, onRetry }) {
  if (!message) return null;
  return (
    <View style={styles.errorNote}>
      <Feather name="alert-circle" size={16} color={colors.bad} />
      <Text style={[type.label, { color: colors.bad, flex: 1 }]}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} hitSlop={8}>
          <Text style={[type.label, { color: colors.bad, fontFamily: font.bodyBold }]}>إعادة المحاولة</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Fab({ icon = 'plus', onPress, label }) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={() => { tap(); onPress(); }}
      style={({ pressed }) => [styles.fab, { bottom: insets.bottom + 84 }, pressed && { transform: [{ scale: 0.95 }] }]}
    >
      <Feather name={icon} size={20} color={colors.white} />
      {label ? <Text style={[styles.buttonText, { color: colors.white }]}>{label}</Text> : null}
    </Pressable>
  );
}

export { Feather, tap };

/* ------------------------------------------------------------------ الأنماط */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { paddingHorizontal: spacing.md, gap: spacing.md, paddingTop: spacing.sm },
  header: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, backgroundColor: colors.bg },
  headerRow: { flexDirection: row, alignItems: 'center', gap: 10 },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line,
  },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.lineSoft, ...shadow(1),
  },
  pressed: { opacity: 0.85 },
  sectionTitle: { flexDirection: row, alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 },
  divider: { height: 1, backgroundColor: colors.lineSoft },

  tile: {
    flexGrow: 1, flexBasis: '47%', borderRadius: radius.md, padding: 13, gap: 2, borderWidth: 1,
  },
  tileTop: { flexDirection: row, alignItems: 'center', gap: 7 },
  tileIcon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  badge: {
    flexDirection: row, alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start',
  },
  progressTrack: { backgroundColor: colors.lineSoft, overflow: 'hidden', width: '100%' },

  row: {
    flexDirection: row, alignItems: 'center', gap: 11, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: colors.lineSoft,
  },
  rowIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  button: {
    flexDirection: row, alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 13, paddingHorizontal: 18, borderRadius: radius.md, borderWidth: 1,
  },
  buttonText: { fontFamily: font.bodyBold, fontSize: 15.5, lineHeight: 26 },

  input: {
    flexDirection: row, alignItems: 'center', gap: 8,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, paddingHorizontal: 14, minHeight: 52,
  },
  inputText: {
    flex: 1, fontFamily: font.body, fontSize: 15.5, color: colors.ink,
    paddingVertical: 12, textAlign: 'right', writingDirection: 'rtl',
  },

  chips: { flexDirection: row, flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: radius.pill,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },

  segmented: {
    flexDirection: row, backgroundColor: colors.bgAlt, borderRadius: radius.pill, padding: 4, gap: 2,
  },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: radius.pill },
  segmentOn: { backgroundColor: colors.white, ...shadow(0.5) },

  switchRow: { flexDirection: row, alignItems: 'center', gap: 12, paddingVertical: 8 },
  switchTrack: {
    width: 50, height: 30, borderRadius: 15, backgroundColor: colors.line, padding: 3, justifyContent: 'center',
  },
  switchKnob: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.white, ...shadow(1) },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.bg },
  empty: { alignItems: 'center', gap: 8, paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
  emptyIcon: {
    width: 58, height: 58, borderRadius: 29, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  errorNote: {
    flexDirection: row, alignItems: 'center', gap: 9, backgroundColor: colors.badSoft,
    borderRadius: radius.md, padding: 12,
  },
  fab: {
    position: 'absolute', left: spacing.md, flexDirection: row, alignItems: 'center', gap: 8,
    backgroundColor: colors.primary, paddingHorizontal: 18, height: 54, borderRadius: 27,
    justifyContent: 'center', ...shadow(3),
  },
});
