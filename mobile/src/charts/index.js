import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, {
  Path, Line, Rect, Circle, G, Defs, LinearGradient, Stop, Text as SvgText,
} from 'react-native-svg';
import { colors, compact, font, radius, series as palette, type } from '../theme';

/* Small helpers ------------------------------------------------------ */

const num = (v) => Number(v || 0);

function niceMax(value) {
  const v = num(value);
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

/** Catmull-Rom -> cubic bezier, for a soft but honest line. */
function smoothPath(points) {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/* ------------------------------------------------------------------ */
/** Filled trend line with an optional second comparison series. */
export function TrendChart({
  data = [], height = 190, lines = [{ key: 'value', color: colors.primary, label: 'Revenue' }],
  labelKey = 'label', formatValue = compact, showAxis = true,
}) {
  const [width, setWidth] = useState(320);
  const [active, setActive] = useState(null);

  const padL = showAxis ? 38 : 8;
  const padR = 10;
  const padT = 14;
  const padB = 24;
  const innerW = Math.max(1, width - padL - padR);
  const innerH = Math.max(1, height - padT - padB);

  const max = useMemo(() => {
    let m = 0;
    for (const row of data) for (const l of lines) m = Math.max(m, num(row[l.key]));
    return niceMax(m || 1);
  }, [data, lines]);

  if (!data.length) return <ChartEmpty height={height} />;

  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
  const xAt = (i) => padL + i * stepX;
  const yAt = (v) => padT + innerH - (num(v) / max) * innerH;

  const gridLines = [0, 0.25, 0.5, 0.75, 1];
  const labelEvery = Math.max(1, Math.ceil(data.length / 5));

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Svg width="100%" height={height}>
        <Defs>
          {lines.map((l, i) => (
            <LinearGradient key={i} id={`grad${i}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={l.color} stopOpacity="0.28" />
              <Stop offset="1" stopColor={l.color} stopOpacity="0.02" />
            </LinearGradient>
          ))}
        </Defs>

        {gridLines.map((g, i) => {
          const y = padT + innerH - g * innerH;
          return (
            <G key={i}>
              <Line x1={padL} y1={y} x2={width - padR} y2={y} stroke={colors.lineSoft} strokeWidth="1" />
              {showAxis ? (
                <SvgText x={padL - 6} y={y + 4} fontSize="9.5" fill={colors.inkMuted}
                  textAnchor="end" fontFamily={font.bodyMedium}>
                  {compact(max * g)}
                </SvgText>
              ) : null}
            </G>
          );
        })}

        {lines.map((l, li) => {
          const pts = data.map((row, i) => ({ x: xAt(i), y: yAt(row[l.key]) }));
          const line = smoothPath(pts);
          const area = `${line} L ${xAt(data.length - 1)} ${padT + innerH} L ${padL} ${padT + innerH} Z`;
          return (
            <G key={l.key}>
              {li === 0 ? <Path d={area} fill={`url(#grad${li})`} /> : null}
              <Path d={line} stroke={l.color} strokeWidth="2.6" fill="none"
                strokeLinecap="round" strokeLinejoin="round" />
              {active != null ? (
                <Circle cx={xAt(active)} cy={yAt(data[active][l.key])} r="4.5"
                  fill={colors.white} stroke={l.color} strokeWidth="2.5" />
              ) : null}
            </G>
          );
        })}

        {active != null ? (
          <Line x1={xAt(active)} y1={padT} x2={xAt(active)} y2={padT + innerH}
            stroke={colors.inkMuted} strokeWidth="1" strokeDasharray="3 4" />
        ) : null}

        {data.map((row, i) => (
          i % labelEvery === 0 || i === data.length - 1 ? (
            <SvgText key={i} x={xAt(i)} y={height - 6} fontSize="9.5" fill={colors.inkMuted}
              textAnchor="middle" fontFamily={font.bodyMedium}>
              {row[labelKey]}
            </SvgText>
          ) : null
        ))}
      </Svg>

      {/* transparent touch strips so any point can be inspected */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={{ flexDirection: 'row', height: height - padB, marginLeft: padL, marginRight: padR }}>
          {data.map((_, i) => (
            <Pressable key={i} style={{ flex: 1 }} onPressIn={() => setActive(i)} onPressOut={() => setActive(null)} />
          ))}
        </View>
      </View>

      {active != null ? (
        <View style={styles.tooltip}>
          <Text style={[type.tiny, { color: colors.inkSoft }]}>{data[active][labelKey]}</Text>
          {lines.map((l) => (
            <View key={l.key} style={styles.tipRow}>
              <View style={[styles.dot, { backgroundColor: l.color }]} />
              <Text style={[type.tiny, { color: colors.ink, fontFamily: font.bodyBold }]}>
                {l.label}: {formatValue(data[active][l.key])}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.legend}>
          {lines.map((l) => (
            <View key={l.key} style={styles.tipRow}>
              <View style={[styles.dot, { backgroundColor: l.color }]} />
              <Text style={type.tiny}>{l.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/** Vertical bars - good for "this week", hours of the day, per-store totals. */
export function BarChart({ data = [], height = 180, color = colors.primary, formatValue = compact,
  labelKey = 'label', valueKey = 'value', colorKey }) {
  const [width, setWidth] = useState(320);
  const [active, setActive] = useState(null);

  const padT = 20;
  const padB = 26;
  const innerH = Math.max(1, height - padT - padB);
  const max = useMemo(() => niceMax(Math.max(...data.map((d) => num(d[valueKey])), 1)), [data, valueKey]);

  if (!data.length) return <ChartEmpty height={height} />;

  const slot = width / data.length;
  const barW = Math.max(6, Math.min(30, slot * 0.55));

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Svg width="100%" height={height}>
        {data.map((row, i) => {
          const v = num(row[valueKey]);
          const h = Math.max(2, (v / max) * innerH);
          const x = i * slot + (slot - barW) / 2;
          const y = padT + innerH - h;
          const fill = colorKey && row[colorKey] ? row[colorKey] : color;
          const dim = active != null && active !== i;
          return (
            <G key={i}>
              <Rect x={x} y={padT} width={barW} height={innerH} rx={barW / 2} fill={colors.lineSoft} opacity="0.6" />
              <Rect x={x} y={y} width={barW} height={h} rx={barW / 2} fill={fill} opacity={dim ? 0.35 : 1} />
              {active === i ? (
                <SvgText x={x + barW / 2} y={y - 6} fontSize="10" fill={colors.ink}
                  textAnchor="middle" fontFamily={font.bodyBold}>
                  {formatValue(v)}
                </SvgText>
              ) : null}
              <SvgText x={x + barW / 2} y={height - 8} fontSize="9.5" fill={colors.inkMuted}
                textAnchor="middle" fontFamily={font.bodyMedium}>
                {row[labelKey]}
              </SvgText>
            </G>
          );
        })}
      </Svg>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={{ flexDirection: 'row', height: height - padB }}>
          {data.map((_, i) => (
            <Pressable key={i} style={{ flex: 1 }} onPressIn={() => setActive(i)} onPressOut={() => setActive(null)} />
          ))}
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/** Donut with a centred headline - category / payment splits. */
export function DonutChart({ data = [], size = 168, thickness = 26, centerLabel, centerValue, formatValue = compact }) {
  const total = data.reduce((s, d) => s + num(d.value), 0);
  const [active, setActive] = useState(null);

  if (!data.length || total <= 0) return <ChartEmpty height={size} />;

  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const arcs = data.map((d, i) => {
    const fraction = num(d.value) / total;
    const arc = {
      color: d.color || palette[i % palette.length],
      dash: fraction * circumference,
      offset,
      label: d.label,
      value: num(d.value),
      pct: fraction * 100,
    };
    offset += arc.dash;
    return arc;
  });

  const shown = active != null ? arcs[active] : null;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
      <Svg width={size} height={size}>
        <G transform={`rotate(-90 ${cx} ${cy})`}>
          <Circle cx={cx} cy={cy} r={r} stroke={colors.lineSoft} strokeWidth={thickness} fill="none" />
          {arcs.map((a, i) => (
            <Circle
              key={i}
              cx={cx} cy={cy} r={r}
              stroke={a.color}
              strokeWidth={active === i ? thickness + 5 : thickness}
              strokeDasharray={`${Math.max(0, a.dash - 2)} ${circumference}`}
              strokeDashoffset={-a.offset}
              strokeLinecap="round"
              fill="none"
              opacity={active != null && active !== i ? 0.35 : 1}
            />
          ))}
        </G>
        <SvgText x={cx} y={cy - 2} fontSize="17" fill={colors.ink} textAnchor="middle" fontFamily={font.bodyBlack}>
          {shown ? formatValue(shown.value) : (centerValue ?? formatValue(total))}
        </SvgText>
        <SvgText x={cx} y={cy + 15} fontSize="10" fill={colors.inkMuted} textAnchor="middle" fontFamily={font.bodyMedium}>
          {shown ? `${shown.pct.toFixed(0)}%` : (centerLabel || 'Total')}
        </SvgText>
      </Svg>

      <View style={{ flex: 1, gap: 8 }}>
        {arcs.map((a, i) => (
          <Pressable key={i} onPressIn={() => setActive(i)} onPressOut={() => setActive(null)}
            style={styles.tipRow}>
            <View style={[styles.dot, { backgroundColor: a.color }]} />
            <Text style={[type.tiny, { flex: 1, color: colors.inkSoft }]} numberOfLines={1}>{a.label}</Text>
            <Text style={[type.tiny, { fontFamily: font.bodyBold, color: colors.ink }]}>
              {a.pct.toFixed(0)}%
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/** Horizontal ranked bars - best sellers, store league table. */
export function RankBars({ data = [], formatValue = compact, color = colors.primary, colorKey, max: maxProp }) {
  const max = maxProp || Math.max(...data.map((d) => num(d.value)), 1);
  if (!data.length) return <ChartEmpty height={110} />;
  return (
    <View style={{ gap: 12 }}>
      {data.map((d, i) => {
        const w = Math.max(3, (num(d.value) / max) * 100);
        const tone = colorKey && d[colorKey] ? d[colorKey] : (d.color || color);
        return (
          <View key={i} style={{ gap: 5 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[type.tiny, { color: colors.inkSoft, flex: 1 }]} numberOfLines={1}>{d.label}</Text>
              <Text style={[type.tiny, { fontFamily: font.bodyBold, color: colors.ink }]}>
                {formatValue(d.value)}
              </Text>
            </View>
            <View style={styles.rankTrack}>
              <View style={{ width: `${w}%`, height: 9, borderRadius: 9, backgroundColor: tone }} />
            </View>
            {d.sub ? <Text style={type.tiny}>{d.sub}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/** Compact inline sparkline for list rows and store cards. */
export function Sparkline({ data = [], width = 90, height = 30, color = colors.primary, valueKey = 'value' }) {
  if (data.length < 2) return <View style={{ width, height }} />;
  const values = data.map((d) => num(d[valueKey]));
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * width,
    y: height - 3 - ((v - min) / span) * (height - 6),
  }));
  const d = smoothPath(pts);
  return (
    <Svg width={width} height={height}>
      <Path d={`${d} L ${width} ${height} L 0 ${height} Z`} fill={color} opacity="0.12" />
      <Path d={d} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
    </Svg>
  );
}

/* ------------------------------------------------------------------ */
/** Half-circle gauge for "how close to the monthly target". */
export function Gauge({ value = 0, size = 150, thickness = 16, color = colors.primary, label }) {
  const clamped = Math.max(0, Math.min(100, num(value)));
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const half = Math.PI * r;
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size / 2 + 14}>
        <G transform={`rotate(180 ${cx} ${cy})`}>
          <Circle cx={cx} cy={cy} r={r} stroke={colors.lineSoft} strokeWidth={thickness}
            strokeDasharray={`${half} ${half * 2}`} strokeLinecap="round" fill="none" />
          <Circle cx={cx} cy={cy} r={r} stroke={color} strokeWidth={thickness}
            strokeDasharray={`${(clamped / 100) * half} ${half * 3}`} strokeLinecap="round" fill="none" />
        </G>
        <SvgText x={cx} y={cy - 6} fontSize="22" fill={colors.ink} textAnchor="middle" fontFamily={font.bodyBlack}>
          {clamped.toFixed(0)}%
        </SvgText>
        {label ? (
          <SvgText x={cx} y={cy + 10} fontSize="10" fill={colors.inkMuted} textAnchor="middle"
            fontFamily={font.bodyMedium}>{label}</SvgText>
        ) : null}
      </Svg>
    </View>
  );
}

function ChartEmpty({ height }) {
  return (
    <View style={[styles.chartEmpty, { height }]}>
      <Text style={type.tiny}>No data for this period yet</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 6, justifyContent: 'center' },
  tooltip: {
    marginTop: 6, alignSelf: 'center', backgroundColor: colors.bgAlt,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.md, gap: 2,
  },
  rankTrack: { height: 9, borderRadius: 9, backgroundColor: colors.lineSoft, overflow: 'hidden' },
  chartEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft, borderRadius: radius.md },
});
