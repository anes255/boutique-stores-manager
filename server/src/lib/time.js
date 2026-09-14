const { z } = require('zod');
const { badRequest } = require('./errors');

/**
 * كل التواريخ بتوقيت المحلات، وليس بتوقيت الخادم (UTC)،
 * حتى لا تُحسب مبيعات منتصف الليل في اليوم السابق.
 */
const TZ = process.env.APP_TZ || 'Africa/Algiers';

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** تاريخ اليوم بتوقيت المحلات: "2026-09-14" */
const today = () => dayFormat.format(new Date());

/** "2026-02-31" مرفوض، و"2026-02-28" مقبول */
const realDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'تاريخ غير صحيح').refine((v) => {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, 'تاريخ غير صحيح');

/** حقول الفترة في أي قائمة: يوم واحد (date) أو من/إلى (from, to) */
const periodFields = {
  date: realDay.optional(),
  from: realDay.optional(),
  to: realDay.optional(),
};

/** يعيد { from, to }. بدون أي تاريخ: اليوم. */
function resolvePeriod(q) {
  if (q.from || q.to) {
    if (!q.from || !q.to) throw badRequest('اختر تاريخ البداية وتاريخ النهاية');
    if (q.from > q.to) throw badRequest('تاريخ البداية بعد تاريخ النهاية');
    return { from: q.from, to: q.to };
  }
  const d = q.date || today();
  return { from: d, to: d };
}

/** لا نقبل عمليات بتاريخ في المستقبل */
function notFuture(day) {
  if (day && day > today()) throw badRequest('لا يمكن التسجيل بتاريخ في المستقبل');
  return day || today();
}

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

module.exports = { TZ, today, realDay, periodFields, resolvePeriod, notFuture, round2 };
