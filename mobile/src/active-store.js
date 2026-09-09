import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { storage } from './storage';

/**
 * المحل المفتوح حاليا.
 *
 * النوافذ (إضافة منتج، تموين، مصروف، موظف…) كانت تعتمد على وصول storeId
 * كمعامل في المسار. على الويب يظهر المعامل في الرابط فيصل دائما، أما على
 * الهاتف فقد يصل فارغا، فينتهي الطلب بـ "يجب تحديد المحل" أو بخطأ من الخادم.
 *
 * القيمة محفوظة في متغيّر على مستوى الوحدة وليس في حالة React فقط: فتح نافذة
 * قد يعيد تركيب شجرة المزوّدين، وعندها تضيع حالة useState. المتغيّر يبقى،
 * ونسخة في التخزين تنجو حتى من إعادة تشغيل التطبيق.
 */
const KEY = 'active_store_id';

let currentStoreId = null;
const listeners = new Set();

export function getActiveStoreId() {
  return currentStoreId;
}

export function rememberActiveStore(id) {
  if (!id || id === currentStoreId) return;
  currentStoreId = id;
  storage.set(KEY, id).catch(() => {});
  listeners.forEach((fn) => fn(id));
}

/** يُستدعى مرة عند الإقلاع حتى يعرف التطبيق آخر محل كان مفتوحا. */
export async function restoreActiveStore() {
  if (currentStoreId) return currentStoreId;
  const saved = await storage.get(KEY);
  if (saved) {
    currentStoreId = saved;
    listeners.forEach((fn) => fn(saved));
  }
  return currentStoreId;
}

const ActiveStoreContext = createContext(null);

export function ActiveStoreProvider({ children }) {
  const [storeId, setStoreId] = useState(currentStoreId);

  useEffect(() => {
    const fn = (id) => setStoreId(id);
    listeners.add(fn);
    // قد تكون القيمة تغيّرت قبل الاشتراك
    if (currentStoreId !== storeId) setStoreId(currentStoreId);
    return () => listeners.delete(fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setActiveStore = useCallback((id) => rememberActiveStore(id), []);
  const value = useMemo(() => ({ storeId, setActiveStore }), [storeId, setActiveStore]);
  return <ActiveStoreContext.Provider value={value}>{children}</ActiveStoreContext.Provider>;
}

export function useActiveStore() {
  return useContext(ActiveStoreContext) || { storeId: currentStoreId, setActiveStore: rememberActiveStore };
}

/**
 * معرّف المحل الذي تعمل عليه هذه الشاشة، بترتيب المصادر:
 * معامل المسار، ثم المحل المفتوح، ثم محل المستخدم نفسه (لحسابات المحل).
 */
export function useStoreId(paramStoreId, user) {
  const { storeId: active } = useActiveStore();
  const fromParam = Array.isArray(paramStoreId) ? paramStoreId[0] : paramStoreId;
  return fromParam || active || currentStoreId || user?.store_id || null;
}
