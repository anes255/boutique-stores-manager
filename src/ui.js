import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useNav } from './nav';

export const C = {
  paper: '#fbfbf8',
  ink: '#1c2b6b',
  red: '#9b1c1c',
  line: '#c9cfe3',
  soft: '#eef1fa',
  sel: '#dfe6ff',
  muted: '#6b7390',
};

// ---------- helpers ----------
const pad = (n) => String(n).padStart(2, '0');
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
};
export const toSqlDate = (d) => d.replace(/\//g, '-');
export const num = (v) => Number(v || 0);
export const fmt = (v) => {
  const n = num(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};
export const parseNum = (s) => {
  const n = Number(String(s).replace(',', '.').trim());
  return Number.isFinite(n) ? n : NaN;
};

// Loads async data and reloads on demand.
export function useLoad(fn, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await fn());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  }, deps);
  // runs on mount, when deps change, and every time the screen comes back into focus
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  return { data, error, loading, reload: load };
}

// ---------- window frame ----------
export function Screen({ title, date, children, scroll = true, footer }) {
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const { canGoBack } = nav;
  const Body = scroll ? ScrollView : View;
  return (
    <KeyboardAvoidingView
      style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={s.window}>
        <View style={s.bar}>
          <View style={s.barBtns}>
            <Pressable style={s.barBtn} onPress={nav.home} hitSlop={6}>
              <Text style={s.barX}>✕</Text>
            </Pressable>
            {canGoBack && (
              <Pressable style={s.barBtn} onPress={nav.back} hitSlop={6}>
                <Text style={s.barArrow}>→</Text>
              </Pressable>
            )}
          </View>
        </View>
        <View style={s.titleRow}>
          <Text style={s.title}>{title}</Text>
          {date ? <Text style={s.date}>{date}</Text> : null}
        </View>
        <Body
          style={s.body}
          contentContainerStyle={scroll ? s.bodyContent : undefined}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </Body>
        {footer ? <View style={s.footer}>{footer}</View> : null}
      </View>
    </KeyboardAvoidingView>
  );
}

// ---------- controls ----------
export function Btn({ title, onPress, disabled, variant, style }) {
  const [busy, setBusy] = useState(false);
  const press = async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      await onPress?.();
    } finally {
      setBusy(false);
    }
  };
  const danger = variant === 'danger';
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={press}
      style={({ pressed }) => [
        s.btn,
        primary && s.btnPrimary,
        danger && s.btnDanger,
        (disabled || busy) && { opacity: 0.45 },
        pressed && { opacity: 0.7 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? '#fff' : C.ink} />
      ) : (
        <Text style={[s.btnText, primary && { color: '#fff' }, danger && { color: C.red }]}>{title}</Text>
      )}
    </Pressable>
  );
}

// Delete button that opens a "حذف ..." window with ✕ / نعم
export function DeleteBtn({ title = 'حذف', disabled, confirmTitle, message, onConfirm }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const close = () => setOpen(false);
  return (
    <>
      <Btn title={title} variant="danger" disabled={disabled} onPress={() => { setError(''); setOpen(true); }} />
      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={s.backdrop}>
          <View style={s.sheet}>
            <View style={s.bar}>
              <View style={s.barBtns}>
                <Pressable style={s.barBtn} onPress={close} hitSlop={6}>
                  <Text style={s.barX}>✕</Text>
                </Pressable>
              </View>
            </View>
            <View style={{ padding: 16 }}>
              <Text style={s.title}>{confirmTitle}</Text>
              <Text style={s.confirmMsg}>{message || 'هل انت متأكد من الحذف؟'}</Text>
              <ErrorText>{error}</ErrorText>
              <BtnRow>
                <Btn
                  title="نعم"
                  variant="danger"
                  onPress={async () => {
                    try {
                      await onConfirm();
                      close();
                    } catch (e) {
                      setError(e.message);
                    }
                  }}
                />
                <Btn title="✕" onPress={close} />
              </BtnRow>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

export function BtnRow({ children }) {
  return <View style={s.btnRow}>{children}</View>;
}

export function Field({ label, value, onChangeText, secure, numeric, placeholder }) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        autoCapitalize="none"
        autoCorrect={false}
        textAlign="right"
      />
    </View>
  );
}

// Dropdown "value ▼" that opens a list.
export function Select({ label, value, options, onChange, placeholder = 'اختر', compact }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  const box = (
    <Pressable style={[s.select, compact && s.selectCompact]} onPress={() => setOpen(true)}>
      <Text style={s.selectArrow}>▼</Text>
      <Text style={[s.selectText, !current && { color: C.muted }]} numberOfLines={1}>
        {current ? current.label : placeholder}
      </Text>
    </Pressable>
  );
  return (
    <>
      {label ? (
        <View style={s.field}>
          <Text style={s.label}>{label}</Text>
          {box}
        </View>
      ) : (
        box
      )}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>{label || placeholder}</Text>
            <FlatList
              data={options}
              keyExtractor={(o) => String(o.value)}
              ListEmptyComponent={<Text style={s.empty}>لا توجد عناصر</Text>}
              renderItem={({ item }) => (
                <Pressable
                  style={[s.option, item.value === value && { backgroundColor: C.sel }]}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  <Text style={s.optionText}>{item.label}</Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const YEARS = Array.from({ length: 11 }, (_, i) => 2022 + i);
// Three dropdowns: year ▼ / month ▼ / day ▼  -> "YYYY/MM/DD"
export function DateInput({ label, value, onChange }) {
  const [y, m, d] = value.split('/').map(Number);
  const daysIn = new Date(y, m, 0).getDate();
  const set = (ny, nm, nd) => {
    const max = new Date(ny, nm, 0).getDate();
    onChange(`${ny}/${pad(nm)}/${pad(Math.min(nd, max))}`);
  };
  const row = (
    <View style={s.dateRow}>
      <View style={{ flex: 1.4 }}>
        <Select compact value={y} onChange={(v) => set(v, m, d)} placeholder="السنة"
          options={YEARS.map((v) => ({ value: v, label: String(v) }))} />
      </View>
      <View style={{ flex: 1 }}>
        <Select compact value={m} onChange={(v) => set(y, v, d)} placeholder="الشهر"
          options={Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: pad(i + 1) }))} />
      </View>
      <View style={{ flex: 1 }}>
        <Select compact value={d} onChange={(v) => set(y, m, v)} placeholder="اليوم"
          options={Array.from({ length: daysIn }, (_, i) => ({ value: i + 1, label: pad(i + 1) }))} />
      </View>
    </View>
  );
  if (!label) return row;
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      {row}
    </View>
  );
}

// columns: [{key, title, flex, render?}]
export function Table({ columns, rows, selectedId, onSelect, totalLabel, total, emptyText = 'لا توجد بيانات' }) {
  return (
    <View style={s.table}>
      <View style={[s.tr, s.th]}>
        {columns.map((c) => (
          <Text key={c.key} style={[s.cell, s.thText, { flex: c.flex || 1 }]}>{c.title}</Text>
        ))}
      </View>
      {rows.length === 0 ? (
        <Text style={s.empty}>{emptyText}</Text>
      ) : (
        rows.map((r) => (
          <Pressable
            key={r.id}
            disabled={!onSelect}
            onPress={() => onSelect?.(selectedId === r.id ? null : r.id)}
            style={[s.tr, selectedId === r.id && { backgroundColor: C.sel }]}
          >
            {columns.map((c) => (
              <Text key={c.key} style={[s.cell, { flex: c.flex || 1 }]}>
                {c.render ? c.render(r) : r[c.key]}
              </Text>
            ))}
          </Pressable>
        ))
      )}
      {totalLabel ? (
        <View style={[s.tr, s.totalRow]}>
          <Text style={[s.cell, s.totalText, { flex: 2 }]}>{totalLabel}</Text>
          <Text style={[s.cell, s.totalText, { flex: 1 }]}>{fmt(total)}</Text>
        </View>
      ) : null}
    </View>
  );
}

// Dashed summary box used on home screens.
export function StatBox({ label, value }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value == null ? '…' : fmt(value)}</Text>
    </View>
  );
}

export function StatRow({ children }) {
  return <View style={s.statRow}>{children}</View>;
}

export function ErrorText({ children }) {
  if (!children) return null;
  return <Text style={s.error}>{children}</Text>;
}

export function Hint({ children }) {
  return <Text style={s.hint}>{children}</Text>;
}

export function Loading() {
  return <ActivityIndicator style={{ marginVertical: 24 }} color={C.ink} />;
}

// Big stacked menu button (home screens).
export function MenuBtn({ title, onPress }) {
  return (
    <Pressable style={({ pressed }) => [s.menuBtn, pressed && { backgroundColor: C.soft }]} onPress={onPress}>
      <Text style={s.menuText}>{title}</Text>
    </Pressable>
  );
}

export const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#e9e6dc' },
  window: {
    flex: 1,
    margin: 8,
    borderWidth: 2,
    borderColor: C.ink,
    borderRadius: 6,
    backgroundColor: C.paper,
    overflow: 'hidden',
  },
  bar: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderColor: C.ink,
    height: 40,
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  barBtns: { flexDirection: 'row', gap: 6 },
  barBtn: {
    width: 32,
    height: 28,
    borderWidth: 1.5,
    borderColor: C.ink,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
  },
  barX: { color: C.ink, fontSize: 16, fontWeight: '700' },
  barArrow: { color: C.red, fontSize: 18, fontWeight: '700' },
  titleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  title: { fontSize: 20, fontWeight: '800', color: C.ink, textAlign: 'right', flexShrink: 1 },
  date: { fontSize: 13, color: C.ink, fontWeight: '600' },
  body: { flex: 1 },
  bodyContent: { padding: 14, paddingBottom: 30 },
  footer: { padding: 12, borderTopWidth: 1, borderColor: C.line },

  btn: {
    borderWidth: 1.5,
    borderColor: C.ink,
    borderRadius: 4,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    minHeight: 46,
    flexGrow: 1,
  },
  btnPrimary: { backgroundColor: C.ink },
  btnDanger: { borderColor: C.red },
  btnText: { color: C.ink, fontSize: 16, fontWeight: '700' },
  btnRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 12 },

  field: { marginBottom: 12 },
  label: { color: C.ink, fontSize: 15, fontWeight: '700', textAlign: 'right', marginBottom: 5 },
  input: {
    borderWidth: 1.5,
    borderColor: C.ink,
    borderRadius: 4,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 16,
    color: '#111',
    textAlign: 'right',
  },

  select: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: C.ink,
    borderRadius: 4,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  selectCompact: { paddingHorizontal: 6 },
  selectArrow: { color: C.ink, fontSize: 11 },
  selectText: { flex: 1, textAlign: 'right', fontSize: 16, color: '#111' },
  dateRow: { flexDirection: 'row', gap: 6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: '#fff', borderRadius: 8, maxHeight: '75%', borderWidth: 2, borderColor: C.ink },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: C.ink,
    textAlign: 'right',
    padding: 12,
    borderBottomWidth: 1.5,
    borderColor: C.ink,
  },
  option: { paddingVertical: 13, paddingHorizontal: 14, borderBottomWidth: 1, borderColor: C.line },
  optionText: { fontSize: 16, textAlign: 'right', color: '#111' },

  table: { borderWidth: 1.5, borderColor: C.ink, borderRadius: 3, backgroundColor: '#fff' },
  tr: { flexDirection: 'row-reverse', borderBottomWidth: 1, borderColor: C.line, minHeight: 40 },
  th: { backgroundColor: C.soft, borderBottomWidth: 1.5, borderColor: C.ink },
  cell: {
    paddingHorizontal: 6,
    paddingVertical: 9,
    textAlign: 'center',
    fontSize: 14,
    color: '#111',
    borderLeftWidth: 1,
    borderColor: C.line,
  },
  thText: { fontWeight: '800', color: C.ink },
  totalRow: { backgroundColor: C.soft, borderBottomWidth: 0, borderTopWidth: 1.5, borderColor: C.ink },
  totalText: { fontWeight: '800', color: C.ink },
  empty: { textAlign: 'center', color: C.muted, padding: 16 },

  stat: {
    flex: 1,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: C.ink,
    borderRadius: 4,
    padding: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  statLabel: { color: C.ink, fontWeight: '700', fontSize: 14 },
  statValue: { color: C.red, fontWeight: '800', fontSize: 20, marginTop: 4 },
  statRow: { flexDirection: 'row-reverse', gap: 10, marginBottom: 16 },

  menuBtn: {
    borderWidth: 1.5,
    borderColor: C.ink,
    borderRadius: 4,
    paddingVertical: 15,
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  menuText: { color: C.ink, fontSize: 17, fontWeight: '800', textAlign: 'center' },

  error: { color: C.red, textAlign: 'right', marginVertical: 8, fontWeight: '600' },
  hint: { color: C.muted, textAlign: 'right', marginBottom: 10 },
  confirmMsg: { fontSize: 16, color: '#222', textAlign: 'right', marginTop: 12 },
});
