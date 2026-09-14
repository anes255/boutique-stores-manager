import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, RefreshControl, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, font, row, spacing, slashDate, todayIso } from '../theme';
import { BigButton, Sheet, Notice, DatePicker, Feather, TONES } from './simple';

/**
 * قطع الشاشات كما في الأوراق: عنوان مع زر رجوع وتاريخ، جدول، أزرار أسفل الجدول،
 * ونوافذ صغيرة للإضافة والتعديل والحذف والبحث بمدة.
 */

const rtl = { writingDirection: 'rtl', textAlign: 'right' };

export const toNumber = (v) => {
  const n = Number(String(v ?? '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : NaN;
};

/** اسم المنتج مع مقاسه ولونه: "فستان · M · أسود" */
export const productLabel = (p) => [p?.name, p?.size, p?.color].filter(Boolean).join(' · ');

/* ------------------------------------------------------------------ الصفحة */

export function Page({ title, subtitle, date, onBack, right, children, footer, refreshing, onRefresh }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.head, { paddingTop: insets.top + 10 }]}>
        {onBack ? (
          <Pressable onPress={onBack} style={styles.back} hitSlop={10} accessibilityLabel="رجوع">
            <Feather name="arrow-right" size={26} color={colors.ink} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          {subtitle ? <Text style={styles.sub} numberOfLines={1}>{subtitle}</Text> : null}
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
        </View>
        {right || (date ? <Text style={styles.date}>{slashDate(date)}</Text> : null)}
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh}
            tintColor={colors.primary} colors={[colors.primary]} />
        ) : undefined}
      >
        {children}
      </ScrollView>
      {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>{footer}</View> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ اختيار اليوم أعلى القائمة */

export function DateBar({ value, onPress }) {
  const isToday = value === todayIso();
  return (
    <Pressable onPress={onPress} style={styles.dateBar} accessibilityLabel="تغيير اليوم">
      <Feather name="calendar" size={22} color={colors.primary} />
      <Text style={styles.dateBarText}>{isToday ? `اليوم  ${slashDate(value)}` : slashDate(value)}</Text>
      <Feather name="chevron-down" size={22} color={colors.inkSoft} />
    </Pressable>
  );
}

/** نافذة اختيار يوم واحد */
export function DaySheet({ visible, value, onPick, onClose }) {
  const [v, setV] = useState(value);
  useEffect(() => { if (visible) setV(value); }, [visible, value]);
  return (
    <Sheet visible={visible} title="اختر اليوم" onClose={onClose}
      footer={(
        <View style={{ flexDirection: row, gap: 10 }}>
          <BigButton label="اليوم" tone="grey" filled={false} style={{ flex: 1 }} onPress={() => onPick(todayIso())} />
          <BigButton label="عرض" icon="check" tone="green" style={{ flex: 2 }} onPress={() => onPick(v)} />
        </View>
      )}>
      {v ? <DatePicker value={v} onChange={setV} /> : null}
    </Sheet>
  );
}

/** نافذة «بحث بمدة»: من … إلى … ثم بحث */
export function RangeSheet({ visible, onClose, onSearch, title = 'بحث بمدة' }) {
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [editing, setEditing] = useState('from');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!visible) return;
    const t = todayIso();
    setFrom(`${t.slice(0, 8)}01`);
    setTo(t);
    setEditing('from');
    setError(null);
  }, [visible]);

  const go = () => {
    if (from > to) { setError('تاريخ البداية يجب أن يكون قبل تاريخ النهاية'); return; }
    onSearch({ from, to });
  };

  return (
    <Sheet visible={visible} title={title} onClose={onClose}
      footer={<BigButton label="بحث" icon="search" tone="green" onPress={go} />}>
      <View style={{ flexDirection: row, gap: 10 }}>
        {[['from', 'من', from], ['to', 'إلى', to]].map(([key, label, value]) => (
          <Pressable key={key} onPress={() => setEditing(key)}
            style={[styles.endBox, editing === key && styles.endBoxOn]}>
            <Text style={styles.endLabel}>{label}</Text>
            <Text style={styles.endValue}>{slashDate(value)}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hintCenter}>{editing === 'from' ? 'اختر تاريخ البداية' : 'اختر تاريخ النهاية'}</Text>
      {from && to ? (
        <DatePicker key={editing} value={editing === 'from' ? from : to}
          onChange={(v) => (editing === 'from' ? setFrom(v) : setTo(v))} />
      ) : null}
      <Notice text={error} tone="red" />
    </Sheet>
  );
}

/* ------------------------------------------------------------------ الجدول */

/**
 * جدول من اليمين لليسار. الضغط على سطر يختاره (يتلوّن)، والضغط مرة ثانية يلغي الاختيار.
 * columns: [{ key, label, flex, align, render(row), bold, color(row) }]
 */
export function DataTable({ columns, rows, keyOf = (r) => r.id, selected, onSelect, empty = 'لا يوجد شيء بعد',
  totalLabel, total }) {
  return (
    <View style={styles.table}>
      <View style={[styles.tr, styles.th]}>
        {columns.map((c) => (
          <Text key={c.key} numberOfLines={1}
            style={[styles.thText, { flex: c.flex || 1, textAlign: c.align || 'right' }]}>
            {c.label}
          </Text>
        ))}
      </View>

      {rows.length === 0 ? <Text style={styles.empty}>{empty}</Text> : rows.map((r, i) => {
        const k = keyOf(r);
        const on = selected != null && selected === k;
        const cells = columns.map((c) => (
          <Text key={c.key} numberOfLines={c.lines || 3}
            style={[
              styles.td, { flex: c.flex || 1, textAlign: c.align || 'right' },
              c.bold && styles.tdBold, c.color && { color: c.color(r) }, on && { color: colors.ink },
            ]}>
            {c.render ? c.render(r) : String(r[c.key] ?? '')}
          </Text>
        ));
        return onSelect ? (
          <Pressable key={k} onPress={() => onSelect(on ? null : k)}
            style={[styles.tr, i % 2 === 1 && styles.trAlt, on && styles.trOn]}>
            {cells}
          </Pressable>
        ) : (
          <View key={k} style={[styles.tr, i % 2 === 1 && styles.trAlt]}>{cells}</View>
        );
      })}

      {totalLabel ? (
        <View style={[styles.tr, styles.tfoot]}>
          <Text style={[styles.tfootText, { flex: 1 }]}>{totalLabel}</Text>
          <Text style={styles.tfootValue}>{total}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** الأزرار تحت الجدول: إضافة / تعديل / حذف / بحث بمدة */
export function ActionBar({ actions }) {
  const list = actions.filter(Boolean);
  return (
    <View style={styles.actions}>
      {list.map((a) => (
        <BigButton key={a.label} small label={a.label} icon={a.icon} tone={a.tone || 'blue'}
          filled={a.filled !== false} disabled={a.disabled} onPress={a.onPress}
          style={[styles.action, list.length === 1 && { flexBasis: '100%' }]} />
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ الصفحة الرئيسية */

/** مربعات الأرقام في أعلى الصفحة الرئيسية (المربعات المنقطة في الأوراق) */
export function SummaryRow({ items }) {
  return (
    <View style={styles.summary}>
      {items.filter(Boolean).map((it) => {
        const t = TONES[it.tone || 'grey'];
        return (
          <Pressable key={it.key || it.label} onPress={it.onPress} disabled={!it.onPress}
            style={[styles.sumBox, { borderColor: t.solid, backgroundColor: t.soft }]}>
            <Text style={[styles.sumLabel, { color: t.fg }]} numberOfLines={1}>{it.label}</Text>
            <Text style={[styles.sumValue, { color: t.fg }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
              {it.value}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** زر كبير في القائمة الرئيسية */
export function MenuButton({ label, icon, tone = 'orange', onPress, hint }) {
  const t = TONES[tone];
  return (
    <Pressable onPress={onPress}
      style={({ pressed }) => [styles.menu, pressed && { transform: [{ scale: 0.98 }] }]}>
      <View style={[styles.menuIcon, { backgroundColor: t.soft }]}>
        <Feather name={icon} size={28} color={t.fg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.menuLabel}>{label}</Text>
        {hint ? <Text style={styles.menuHint} numberOfLines={1}>{hint}</Text> : null}
      </View>
      <Feather name="chevron-left" size={26} color={colors.inkMuted} />
    </Pressable>
  );
}

/* ------------------------------------------------------------------ حقول النماذج */

/**
 * قائمة منسدلة (المنتج ▼). تنفتح تحت الحقل نفسه، بدون نافذة فوق نافذة.
 * options: [{ value, label, sub, disabled }]
 */
export function SelectField({ label, value, options, onChange, placeholder = 'اختر…', empty = 'لا توجد خيارات' }) {
  const [open, setOpen] = useState(!value);
  const [q, setQ] = useState('');
  const current = options.find((o) => o.value === value);
  const shown = q.trim()
    ? options.filter((o) => `${o.label} ${o.sub || ''}`.toLowerCase().includes(q.trim().toLowerCase()))
    : options;

  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <Pressable onPress={() => setOpen((v) => !v)} style={[styles.select, open && styles.selectOpen]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.selectText, !current && { color: colors.inkMuted }]} numberOfLines={1}>
            {current ? current.label : placeholder}
          </Text>
          {current?.sub ? <Text style={styles.selectSub} numberOfLines={1}>{current.sub}</Text> : null}
        </View>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={24} color={colors.inkSoft} />
      </Pressable>

      {open ? (
        <View style={styles.options}>
          {options.length > 8 ? (
            <TextInput value={q} onChangeText={setQ} placeholder="ابحث…" placeholderTextColor={colors.inkMuted}
              style={styles.search} autoCorrect={false} />
          ) : null}
          {shown.length === 0 ? <Text style={styles.empty}>{empty}</Text> : shown.map((o) => (
            <Pressable key={o.value} disabled={o.disabled}
              onPress={() => { onChange(o.value); setOpen(false); setQ(''); }}
              style={[styles.option, o.value === value && styles.optionOn, o.disabled && { opacity: 0.45 }]}>
              <Text style={styles.optionText} numberOfLines={1}>{o.label}</Text>
              {o.sub ? <Text style={styles.optionSub} numberOfLines={1}>{o.sub}</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** حقل تاريخ (2026/08/05 ▼) ينفتح تحته اختيار السنة والشهر واليوم */
export function DateField({ label, value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <Pressable onPress={() => setOpen((v) => !v)} style={[styles.select, open && styles.selectOpen]}>
        <Feather name="calendar" size={22} color={colors.primary} />
        <Text style={[styles.selectText, { flex: 1 }]}>
          {slashDate(value)}{value === todayIso() ? '  (اليوم)' : ''}
        </Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={24} color={colors.inkSoft} />
      </Pressable>
      {open ? <DatePicker value={value} onChange={onChange} /> : null}
    </View>
  );
}

/** نافذة تأكيد: ✗ لا / ✓ نعم */
export function ConfirmSheet({ visible, title = 'تأكيد', text, yes = 'نعم', onYes, onClose, busy, error }) {
  return (
    <Sheet visible={visible} title={title} onClose={onClose}
      footer={(
        <View style={{ flexDirection: row, gap: 10 }}>
          <BigButton label="لا" icon="x" tone="grey" filled={false} style={{ flex: 1 }} onPress={onClose} />
          <BigButton label={yes} icon="check" tone="red" style={{ flex: 1 }} loading={busy} onPress={onYes} />
        </View>
      )}>
      <Text style={styles.confirmText}>{text}</Text>
      <Notice text={error} tone="red" />
    </Sheet>
  );
}

/** سطر «العنوان ····· القيمة» داخل النوافذ */
export function InfoLine({ label, value, tone }) {
  return (
    <View style={styles.infoLine}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, tone && { color: tone }]}>{value}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ حالة النوافذ */

/** نافذة واحدة في كل مرة، مع نموذجها وحالة الحفظ ورسالة النجاح */
export function useDialog() {
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const open = useCallback((d, initial = {}) => { setError(null); setForm(initial); setDialog(d); }, []);
  const close = useCallback(() => { setDialog(null); setError(null); }, []);
  const set = useCallback((k) => (v) => setForm((f) => ({ ...f, [k]: v })), []);
  const flash = useCallback((text, tone = 'green') => {
    clearTimeout(timer.current);
    setNotice({ text, tone });
    timer.current = setTimeout(() => setNotice(null), 4000);
  }, []);
  const run = useCallback(async (fn) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }, []);

  // close: زر X (لا يغلق أثناء الحفظ). finish: الإغلاق بعد نجاح الحفظ.
  return { dialog, form, busy, error, notice, open, close: busy ? () => {} : close, finish: close, set, flash, run, setError };
}

/** رجوع للصفحة السابقة، أو إلى `fallback` إذا فُتحت الصفحة مباشرة */
export function useGoBack(fallback) {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  }, [router, fallback]);
}

/** رسالة أعلى الصفحة (تم الحفظ / اختر سطرا أولا) */
export function Flash({ notice }) {
  if (!notice) return null;
  return <Notice text={notice.text} tone={notice.tone} />;
}

const styles = StyleSheet.create({
  head: {
    flexDirection: row, alignItems: 'center', gap: 12,
    paddingHorizontal: spacing.md, paddingBottom: 12, backgroundColor: colors.bg,
    borderBottomWidth: 1, borderBottomColor: colors.lineSoft,
  },
  back: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center',
  },
  sub: { fontFamily: font.bodyBold, fontSize: 15, lineHeight: 24, color: colors.primary, ...rtl },
  title: { fontFamily: font.display, fontSize: 24, lineHeight: 38, color: colors.ink, ...rtl },
  date: { fontFamily: font.bodyBlack, fontSize: 15, lineHeight: 24, color: colors.inkSoft, writingDirection: 'ltr' },
  body: { padding: spacing.md, gap: 14, paddingBottom: 30 },
  footer: {
    paddingHorizontal: spacing.md, paddingTop: 12, backgroundColor: colors.bg,
    borderTopWidth: 1, borderTopColor: colors.lineSoft, gap: 10,
  },

  dateBar: {
    flexDirection: row, alignItems: 'center', gap: 10, alignSelf: 'stretch',
    backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 16, height: 56,
    borderWidth: 1.5, borderColor: colors.line,
  },
  dateBarText: { flex: 1, fontFamily: font.bodyBlack, fontSize: 18, lineHeight: 28, color: colors.ink, ...rtl },

  endBox: {
    flex: 1, alignItems: 'center', gap: 2, padding: 12, borderRadius: 18,
    backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: colors.line,
  },
  endBoxOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  endLabel: { fontFamily: font.bodyBold, fontSize: 16, lineHeight: 24, color: colors.inkSoft },
  endValue: { fontFamily: font.bodyBlack, fontSize: 18, lineHeight: 28, color: colors.ink, writingDirection: 'ltr' },
  hintCenter: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 24, color: colors.inkMuted, textAlign: 'center' },

  table: {
    backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden',
    borderWidth: 1.5, borderColor: colors.line,
  },
  tr: {
    flexDirection: row, alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.lineSoft,
  },
  trAlt: { backgroundColor: colors.surfaceSoft },
  trOn: { backgroundColor: '#FFE3C7', borderBottomColor: colors.primary },
  th: { backgroundColor: colors.bgAlt, paddingVertical: 10 },
  thText: { fontFamily: font.bodyBlack, fontSize: 15, lineHeight: 22, color: colors.inkSoft, writingDirection: 'rtl' },
  td: { fontFamily: font.bodyBold, fontSize: 16, lineHeight: 24, color: colors.ink, writingDirection: 'rtl' },
  tdBold: { fontFamily: font.bodyBlack },
  empty: {
    fontFamily: font.bodyBold, fontSize: 16, lineHeight: 26, color: colors.inkMuted,
    textAlign: 'center', paddingVertical: 22, paddingHorizontal: 12,
  },
  tfoot: { backgroundColor: colors.primarySoft, borderBottomWidth: 0, paddingVertical: 14 },
  tfootText: { fontFamily: font.bodyBlack, fontSize: 17, lineHeight: 26, color: colors.primaryDark, ...rtl },
  tfootValue: { fontFamily: font.bodyBlack, fontSize: 20, lineHeight: 30, color: colors.primaryDark },

  actions: { flexDirection: row, flexWrap: 'wrap', gap: 10 },
  action: { flexGrow: 1, flexBasis: '45%' },

  summary: { flexDirection: row, flexWrap: 'wrap', gap: 10 },
  sumBox: {
    flexGrow: 1, flexBasis: '45%', minHeight: 86, borderRadius: 18, padding: 12, gap: 4,
    borderWidth: 2, borderStyle: 'dashed', justifyContent: 'center',
  },
  sumLabel: { fontFamily: font.bodyBlack, fontSize: 15, lineHeight: 22, ...rtl },
  sumValue: { fontFamily: font.bodyBlack, fontSize: 22, lineHeight: 32, ...rtl },

  menu: {
    flexDirection: row, alignItems: 'center', gap: 14, backgroundColor: '#FFFFFF',
    borderRadius: 20, padding: 14, minHeight: 76, borderWidth: 1.5, borderColor: colors.line,
  },
  menuIcon: { width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { fontFamily: font.bodyBlack, fontSize: 20, lineHeight: 30, color: colors.ink, ...rtl },
  menuHint: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 22, color: colors.inkMuted, ...rtl },

  fieldLabel: { fontFamily: font.bodyBold, fontSize: 17, lineHeight: 26, color: colors.ink, ...rtl },
  select: {
    flexDirection: row, alignItems: 'center', gap: 10, minHeight: 60, borderRadius: 16,
    borderWidth: 1.5, borderColor: colors.line, backgroundColor: '#FFFFFF', paddingHorizontal: 16,
  },
  selectOpen: { borderColor: colors.primary },
  selectText: { fontFamily: font.bodyBlack, fontSize: 18, lineHeight: 28, color: colors.ink, ...rtl },
  selectSub: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 22, color: colors.inkSoft, ...rtl },
  options: {
    backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1.5, borderColor: colors.line,
    overflow: 'hidden',
  },
  search: {
    height: 50, paddingHorizontal: 14, fontFamily: font.bodyBold, fontSize: 17, color: colors.ink,
    borderBottomWidth: 1, borderBottomColor: colors.lineSoft, ...rtl,
  },
  option: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  optionOn: { backgroundColor: colors.primarySoft },
  optionText: { fontFamily: font.bodyBlack, fontSize: 18, lineHeight: 28, color: colors.ink, ...rtl },
  optionSub: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 22, color: colors.inkSoft, ...rtl },

  confirmText: { fontFamily: font.bodyBold, fontSize: 19, lineHeight: 32, color: colors.ink, ...rtl },
  infoLine: {
    flexDirection: row, alignItems: 'center', justifyContent: 'space-between', gap: 10,
    backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12,
  },
  infoLabel: { fontFamily: font.bodyBold, fontSize: 17, lineHeight: 28, color: colors.inkSoft, ...rtl },
  infoValue: { fontFamily: font.bodyBlack, fontSize: 19, lineHeight: 30, color: colors.ink },
});
