import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { api } from './api';
import { onDataChanged } from './events';

/**
 * Fetch-on-mount + refetch-on-focus data hook.
 * `requests` is a map of name -> [path, params]; all of them load together
 * so a dashboard shows one spinner, not eight.
 */
export function useData(requests, deps = [], options = {}) {
  const { refetchOnFocus = true, enabled = true } = options;
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const mounted = useRef(true);
  const buildRef = useRef(requests);
  buildRef.current = requests;

  useEffect(() => () => { mounted.current = false; }, []);

  const run = useCallback(async (isRefresh) => {
    if (!enabled) { setLoading(false); return; }
    if (isRefresh) setRefreshing(true);
    try {
      const entries = Object.entries(buildRef.current);
      const results = await Promise.all(
        entries.map(([, [path, params]]) => api.get(path, params))
      );
      if (!mounted.current) return;
      const next = {};
      entries.forEach(([key], i) => { next[key] = results[i]; });
      setData(next);
      setError(null);
    } catch (err) {
      if (mounted.current) setError(err.message || 'Something went wrong');
    } finally {
      if (mounted.current) { setLoading(false); setRefreshing(false); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  useEffect(() => { setLoading(true); run(false); }, [run]);

  useFocusEffect(
    useCallback(() => {
      if (refetchOnFocus) run(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [run, refetchOnFocus])
  );

  // التركيز وحده لا يكفي على الهاتف: نعيد التحميل كلما حُفظ شيء في أي نافذة
  useEffect(() => onDataChanged(() => run(true)), [run]);

  return { data, loading, refreshing, error, reload: () => run(true) };
}

/** Small helper for save buttons: tracks pending state and surfaces the error. */
export function useSubmit(fn) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = useCallback(async (...args) => {
    setSaving(true);
    setError(null);
    try {
      const result = await fn(...args);
      return { ok: true, result };
    } catch (err) {
      setError(err.message || 'Could not save');
      return { ok: false, error: err };
    } finally {
      setSaving(false);
    }
  }, [fn]);

  return { submit, saving, error, setError };
}
