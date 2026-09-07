/**
 * لوحة ألوان واحدة دافئة ومريحة للعين، مستعملة في كل التطبيق.
 * ورق كريمي + حبر طيني، مع ألوان ناعمة للرسوم البيانية.
 */
export const colors = {
  // الورق
  bg: '#FFF8F1',
  bgAlt: '#FDF1E4',
  surface: '#FFFFFF',
  surfaceSoft: '#FFFBF6',
  line: '#F0E2D2',
  lineSoft: '#F7ECE1',

  // الحبر
  ink: '#33291F',
  inkSoft: '#6B5C4F',
  inkMuted: '#9C8B7C',

  // اللون الأساسي
  primary: '#E8813A',
  primaryDark: '#C9662A',
  primarySoft: '#FDECDC',

  // ألوان مساعدة (نفس ترتيب سلاسل الرسوم البيانية)
  sage: '#4E8D7C',
  sageSoft: '#E2F0EB',
  lilac: '#7C6BD1',
  lilacSoft: '#EBE7FB',
  rose: '#E4698A',
  roseSoft: '#FBE6EC',
  sky: '#3E93C9',
  skySoft: '#E3F0F9',
  honey: '#F0B429',
  honeySoft: '#FDF1D5',

  // دلالية
  good: '#3E9C6A',
  goodSoft: '#E4F3EA',
  warn: '#D98324',
  warnSoft: '#FBEDD9',
  bad: '#D75A57',
  badSoft: '#FBE7E6',

  white: '#FFFFFF',
  shadow: '#8A6A4B',
};

export const series = [colors.primary, colors.sage, colors.lilac, colors.sky, colors.rose, colors.honey];

export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 };

export const spacing = { xs: 6, sm: 10, md: 16, lg: 22, xl: 30, xxl: 40 };

/**
 * التطبيق كله من اليمين إلى اليسار.
 * نكتب الاتجاه في الأنماط بدل I18nManager.forceRTL حتى يشتغل فورا
 * في Expo Go بدون إعادة تشغيل التطبيق.
 */
export const RTL = true;
export const row = 'row-reverse';
export const alignStart = 'flex-end';
export const alignEnd = 'flex-start';

export const font = {
  display: 'Cairo_700Bold',
  displaySemi: 'Cairo_600SemiBold',
  body: 'Tajawal_400Regular',
  bodyMedium: 'Tajawal_500Medium',
  bodyBold: 'Tajawal_700Bold',
  bodyBlack: 'Tajawal_800ExtraBold',
};

const rtlText = { writingDirection: 'rtl', textAlign: 'right' };

export const type = {
  hero: { fontFamily: font.display, fontSize: 28, lineHeight: 44, color: colors.ink, ...rtlText },
  title: { fontFamily: font.display, fontSize: 21, lineHeight: 36, color: colors.ink, ...rtlText },
  section: { fontFamily: font.displaySemi, fontSize: 16, lineHeight: 28, color: colors.ink, ...rtlText },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 26, color: colors.inkSoft, ...rtlText },
  bodyStrong: { fontFamily: font.bodyBold, fontSize: 15, lineHeight: 26, color: colors.ink, ...rtlText },
  label: { fontFamily: font.bodyMedium, fontSize: 13, lineHeight: 22, color: colors.inkMuted, ...rtlText },
  tiny: { fontFamily: font.bodyMedium, fontSize: 12, lineHeight: 20, color: colors.inkMuted, ...rtlText },
  number: { fontFamily: font.bodyBlack, fontSize: 24, lineHeight: 36, color: colors.ink, ...rtlText },
};

/** ظل دافئ وناعم، ليس رماديا قاسيا. */
export const shadow = (level = 1) => ({
  shadowColor: colors.shadow,
  shadowOpacity: 0.06 + level * 0.02,
  shadowRadius: 8 + level * 6,
  shadowOffset: { width: 0, height: 2 + level * 2 },
  elevation: level * 2,
});

export const CURRENCY = 'دج';

/** 1 234 567 ← "1.2 مليون"، مختصر ليدخل في البطاقات. */
export function compact(value) {
  const n = Number(value || 0);
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return trim(n / 1_000_000_000) + ' مليار';
  if (abs >= 1_000_000) return trim(n / 1_000_000) + ' مليون';
  if (abs >= 10_000) return String(Math.round(n / 1000)) + ' ألف';
  if (abs >= 1000) return trim(n / 1000) + ' ألف';
  return String(Math.round(n * 100) / 100);
}

const trim = (v) => v.toFixed(1).replace(/\.0$/, '');

export function money(value, currency = CURRENCY, opts = {}) {
  const cur = currency === 'DZD' ? CURRENCY : (currency || CURRENCY);
  const n = Number(value || 0);
  if (opts.compact) return `${compact(n)} ${cur}`;
  const fixed = Math.abs(n) >= 1000 ? Math.round(n) : Math.round(n * 100) / 100;
  return `${fixed.toLocaleString('en-US')} ${cur}`;
}

export function pct(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

/* ---------------------------------------------------------- التواريخ */
/* نكتب التنسيق بأنفسنا حتى تبقى الأرقام لاتينية على كل الأجهزة. */

const MONTHS = ['جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان',
  'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export const MONTHS_AR = MONTHS;

export function dayLabel(iso) {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function clock(d) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function prettyDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `اليوم ${clock(d)}`;
  const yest = new Date(now.getTime() - 86400000);
  if (d.toDateString() === yest.toDateString()) return `أمس ${clock(d)}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${clock(d)}`;
}

/** "2026-03" ← "مارس 2026" */
export function periodLabel(period) {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return period || '';
  const [y, m] = period.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}
