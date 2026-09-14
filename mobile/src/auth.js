import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { storage } from './storage';
import { api, bindTokens, loadBaseUrl } from './api';

const ACCESS_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const accessRef = useRef(null);
  const refreshRef = useRef(null);
  const refreshingRef = useRef(null);

  const clear = useCallback(async () => {
    accessRef.current = null;
    refreshRef.current = null;
    setUser(null);
    await storage.remove(ACCESS_KEY);
    await storage.remove(REFRESH_KEY);
  }, []);

  const persist = useCallback(async (accessToken, refreshToken, nextUser) => {
    accessRef.current = accessToken;
    refreshRef.current = refreshToken;
    if (nextUser) setUser(nextUser);
    await storage.set(ACCESS_KEY, accessToken);
    await storage.set(REFRESH_KEY, refreshToken);
  }, []);

  /** Single-flight refresh so a burst of 401s does not rotate the token twice. */
  const doRefresh = useCallback(async () => {
    if (!refreshRef.current) return null;
    if (refreshingRef.current) return refreshingRef.current;

    refreshingRef.current = (async () => {
      try {
        const data = await api.raw('/api/auth/refresh', {
          method: 'POST',
          body: { refreshToken: refreshRef.current },
        });
        await persist(data.accessToken, data.refreshToken, data.user);
        return data.accessToken;
      } catch (_) {
        await clear();
        return null;
      } finally {
        refreshingRef.current = null;
      }
    })();

    return refreshingRef.current;
  }, [persist, clear]);

  useEffect(() => {
    bindTokens({
      get: () => accessRef.current,
      refresh: doRefresh,
      onLogout: () => { clear(); },
    });
  }, [doRefresh, clear]);

  // Restore a session on cold start.
  useEffect(() => {
    (async () => {
      await loadBaseUrl();
      const access = await storage.get(ACCESS_KEY);
      const refresh = await storage.get(REFRESH_KEY);
      accessRef.current = access;
      refreshRef.current = refresh;
      if (access) {
        try {
          const data = await api.get('/api/auth/me');
          setUser(data.user);
        } catch (_) {
          const fresh = await doRefresh();
          if (!fresh) await clear();
        }
      }
      setBooting(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // as: 'owner' (مستخدم رئيسي) أو 'worker' (مستخدم فرعي) حسب الزر الذي اختاره
  const login = useCallback(async (email, password, as) => {
    const data = await api.raw('/api/auth/login', {
      method: 'POST',
      body: { email: email.trim(), password, as },
    });
    await persist(data.accessToken, data.refreshToken, data.user);
    return data.user;
  }, [persist]);

  /** إنشاء حساب من شاشة التسجيل، ثم الدخول به مباشرة */
  const register = useCallback(async (as, body) => {
    const data = await api.raw(as === 'owner' ? '/api/auth/register-owner' : '/api/auth/register-worker', {
      method: 'POST',
      body,
    });
    await persist(data.accessToken, data.refreshToken, data.user);
    return data.user;
  }, [persist]);

  const logout = useCallback(async () => {
    const token = refreshRef.current;
    await clear();
    if (token) {
      api.raw('/api/auth/logout', { method: 'POST', body: { refreshToken: token } }).catch(() => {});
    }
  }, [clear]);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const data = await api.post('/api/auth/change-password', { currentPassword, newPassword });
    await persist(data.accessToken, data.refreshToken, null);
    const me = await api.get('/api/auth/me');
    setUser(me.user);
  }, [persist]);

  /** المالك يغيّر اسم المستخدم و/أو كلمة السر. الخادم يعيد جلسة جديدة لهذا الجهاز. */
  const updateCredentials = useCallback(async (body) => {
    const data = await api.post('/api/auth/credentials', body);
    await persist(data.accessToken, data.refreshToken, data.user);
    return data.user;
  }, [persist]);

  const refreshUser = useCallback(async () => {
    const me = await api.get('/api/auth/me');
    setUser(me.user);
    return me.user;
  }, []);

  const value = useMemo(() => ({
    user,
    booting,
    isAdmin: user?.role === 'admin',
    login,
    register,
    logout,
    changePassword,
    updateCredentials,
    refreshUser,
  }), [user, booting, login, register, logout, changePassword, updateCredentials, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
