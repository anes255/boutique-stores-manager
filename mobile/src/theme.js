/**
 * One warm, bright, low-glare palette used everywhere.
 * Cream paper + terracotta ink, with a handful of soft accents for charts.
 */
export const colors = {
  // paper
  bg: '#FFF8F1',
  bgAlt: '#FDF1E4',
  surface: '#FFFFFF',
  surfaceSoft: '#FFFBF6',
  line: '#F0E2D2',
  lineSoft: '#F7ECE1',

  // ink
  ink: '#33291F',
  inkSoft: '#6B5C4F',
  inkMuted: '#9C8B7C',

  // brand
  primary: '#E8813A',
  primaryDark: '#C9662A',
  primarySoft: '#FDECDC',

  // accents (also the chart series order)
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

  // semantic
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

export const font = {
  display: 'Fraunces_700Bold',
  displaySemi: 'Fraunces_600SemiBold',
  body: 'Nunito_400Regular',
  bodyMedium: 'Nunito_600SemiBold',
  bodyBold: 'Nunito_700Bold',
  bodyBlack: 'Nunito_800ExtraBold',
};

export const type = {
  hero: { fontFamily: font.display, fontSize: 30, lineHeight: 36, color: colors.ink },
  title: { fontFamily: font.display, fontSize: 23, lineHeight: 30, color: colors.ink },
  section: { fontFamily: font.displaySemi, fontSize: 17, lineHeight: 24, color: colors.ink },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 22, color: colors.inkSoft },
  bodyStrong: { fontFamily: font.bodyBold, fontSize: 15, lineHeight: 22, color: colors.ink },
  label: { fontFamily: font.bodyMedium, fontSize: 13, lineHeight: 18, color: colors.inkMuted },
  tiny: { fontFamily: font.bodyMedium, fontSize: 11.5, lineHeight: 16, color: colors.inkMuted },
  number: { fontFamily: font.bodyBlack, fontSize: 26, lineHeight: 32, color: colors.ink },
};

/** Soft, warm elevation - never a hard grey drop shadow. */
export const shadow = (level = 1) => ({
  shadowColor: colors.shadow,
  shadowOpacity: 0.06 + level * 0.02,
  shadowRadius: 8 + level * 6,
  shadowOffset: { width: 0, height: 2 + level * 2 },
  elevation: level * 2,
});

/** 1 234 567 -> "1.23M" style, kept short for tiles. */
export function compact(value) {
  const n = Number(value || 0);
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (abs >= 10_000) return Math.round(n / 1000) + 'K';
  if (abs >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(Math.round(n * 100) / 100);
}

export function money(value, currency = 'DZD', opts = {}) {
  const n = Number(value || 0);
  if (opts.compact) return `${compact(n)} ${currency}`;
  const fixed = Math.abs(n) >= 1000 ? Math.round(n) : Math.round(n * 100) / 100;
  return `${fixed.toLocaleString('en-US')} ${currency}`;
}

export function pct(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

export function dayLabel(iso) {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function prettyDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Today ${time}`;
  const yest = new Date(now.getTime() - 86400000);
  if (d.toDateString() === yest.toDateString()) return `Yesterday ${time}`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ` ${time}`;
}
