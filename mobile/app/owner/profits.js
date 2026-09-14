import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { useData } from '../../src/hooks';
import { colors, font, money, row, slashDate, todayIso } from '../../src/theme';
import { Loader } from '../../src/components/ui';
import { BigButton, Toggle, Notice, Feather, TONES } from '../../src/components/simple';
import { Page, SummaryRow, DataTable, RangeSheet, useDialog, useGoBack } from '../../src/components/kit';

/**
 * الأرباح لأي مدة: اليوم، هذا الشهر، أو من … إلى …
 * الربح من البيع = سعر البيع − سعر الشراء. الصافي = الربح − المصاريف.
 */
export default function Profits() {
  const goBack = useGoBack('/owner');
  const d = useDialog();
  const [mode, setMode] = useState('today');
  const [range, setRange] = useState(null);

  const today = todayIso();
  const period = mode === 'range' && range ? range
    : mode === 'month' ? { from: `${today.slice(0, 8)}01`, to: today }
      : { from: today, to: today };

  const { data, loading, refreshing, error, reload } = useData({
    sum: ['/api/reports/summary', period],
  }, [period.from, period.to]);

  if (loading && !data.sum) return <Loader text="جاري الحساب…" />;

  const t = data.sum?.totals || {};
  const branches = data.sum?.branches || [];
  const netTone = (v) => (Number(v) >= 0 ? TONES.green.fg : TONES.red.fg);

  return (
    <>
      <Page title="الأرباح" subtitle="كل الفروع" onBack={goBack} refreshing={refreshing} onRefresh={reload}>
        {error ? <Notice text={error} tone="red" /> : null}

        <Toggle
          options={[{ label: 'اليوم', value: 'today' }, { label: 'هذا الشهر', value: 'month' }, { label: 'من … إلى', value: 'range' }]}
          value={mode}
          onChange={(v) => (v === 'range' ? d.open({ kind: 'range' }) : setMode(v))}
        />
        <View style={styles.period}>
          <Feather name="calendar" size={20} color={colors.primary} />
          <Text style={styles.periodText}>
            {period.from === period.to ? slashDate(period.from) : `من ${slashDate(period.from)} إلى ${slashDate(period.to)}`}
          </Text>
          {mode === 'range' ? (
            <BigButton small filled={false} tone="orange" label="تغيير" onPress={() => d.open({ kind: 'range' })} />
          ) : null}
        </View>

        <SummaryRow items={[
          { label: 'المبيعات', value: money(t.sales_total), tone: 'green' },
          { label: 'سعر شراء ما بعته', value: money(t.cost_total), tone: 'grey' },
          { label: 'الربح من البيع', value: money(t.gross_profit), tone: 'blue' },
          { label: 'المصاريف', value: money(t.expenses_total), tone: 'orange' },
        ]} />
        <View style={[styles.net, { borderColor: netTone(t.net) }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.netLabel}>الصافي</Text>
            <Text style={styles.netHint}>الربح من البيع ناقص المصاريف · {t.pieces || 0} قطعة مبيعة</Text>
          </View>
          <Text style={[styles.netValue, { color: netTone(t.net) }]} numberOfLines={1} adjustsFontSizeToFit>
            {money(t.net)}
          </Text>
        </View>

        <Text style={styles.section}>حسب الفرع</Text>
        <DataTable
          columns={[
            { key: 'name', label: 'الفرع', flex: 1.3, bold: true },
            { key: 'sales', label: 'المبيعات', flex: 1.1, align: 'center', render: (r) => money(r.sales_total) },
            { key: 'gross', label: 'الربح', flex: 1.1, align: 'center', render: (r) => money(r.gross_profit) },
            { key: 'exp', label: 'المصاريف', flex: 1.1, align: 'center', render: (r) => money(r.expenses_total) },
            { key: 'net', label: 'الصافي', flex: 1.1, align: 'center', bold: true, render: (r) => money(r.net), color: (r) => netTone(r.net) },
          ]}
          rows={branches}
          empty="لا توجد فروع بعد"
          totalLabel="الصافي الكلي"
          total={money(t.net)}
        />
      </Page>

      <RangeSheet visible={d.dialog?.kind === 'range'} title="الأرباح بمدة" onClose={d.close}
        onSearch={(r) => { setRange(r); setMode('range'); d.finish(); }} />
    </>
  );
}

const rtl = { writingDirection: 'rtl', textAlign: 'right' };

const styles = StyleSheet.create({
  section: { fontFamily: font.display, fontSize: 20, lineHeight: 32, color: colors.ink, ...rtl },
  period: {
    flexDirection: row, alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF',
    borderRadius: 16, padding: 12, borderWidth: 1, borderColor: colors.line, minHeight: 56,
  },
  periodText: { flex: 1, fontFamily: font.bodyBlack, fontSize: 17, lineHeight: 26, color: colors.ink, ...rtl },
  net: {
    flexDirection: row, alignItems: 'center', gap: 12, padding: 16,
    borderRadius: 20, borderWidth: 2, backgroundColor: '#FFFFFF',
  },
  netLabel: { fontFamily: font.display, fontSize: 22, lineHeight: 34, color: colors.ink, ...rtl },
  netHint: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 22, color: colors.inkMuted, ...rtl },
  netValue: { fontFamily: font.bodyBlack, fontSize: 28, lineHeight: 40, maxWidth: '55%', textAlign: 'left' },
});
