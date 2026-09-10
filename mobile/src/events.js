/**
 * إشارة "تغيّرت البيانات".
 *
 * كانت الشاشات تعيد التحميل فقط عند استعادة التركيز بعد إغلاق النافذة.
 * هذا غير موثوق على الهاتف: نافذة iOS المنبثقة لا تأخذ التركيز من الشاشة
 * التي تحتها، فلا تعيد القائمة التحميل ويبقى المنتج أو الموظف الجديد مخفيا.
 * الآن كل عملية حفظ ناجحة تُطلق هذه الإشارة، وكل قائمة مفتوحة تعيد التحميل.
 */
const listeners = new Set();

export function notifyDataChanged() {
  listeners.forEach((fn) => {
    try { fn(); } catch (_) { /* لا نترك شاشة واحدة تعطل الباقي */ }
  });
}

export function onDataChanged(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
