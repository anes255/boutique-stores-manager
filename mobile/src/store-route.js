import { createContext, useContext } from 'react';

/**
 * معرّف الفرع الذي تعمل داخله الشاشة.
 *
 * كل شاشة كانت تقرأ الفرع من معاملات مسارها. على الهاتف لا تصل هذه المعاملات
 * دائما إلى الشاشات المتداخلة، فتصل قيمة غير صالحة ويرد الخادم بـ "store_id: Invalid uuid".
 *
 * الآن تخطيط الفرع وحده يحدد المعرّف، مرة واحدة، ويتأكد أنه صالح،
 * ثم يمرره لكل ما تحته عبر هذا السياق، ومعه اسم الفرع.
 */
export const StoreRouteContext = createContext(null);
export const BranchContext = createContext(null);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** يعيد القيمة إن كانت معرّفا صالحا، وإلا null. */
export function asUuid(value) {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === 'string' && UUID.test(v) ? v : null;
}

export function useStoreRouteId() {
  return useContext(StoreRouteContext);
}

/** { id, name } للفرع المفتوح (الاسم يصل بعد لحظة) */
export function useBranch() {
  return useContext(BranchContext) || {};
}
