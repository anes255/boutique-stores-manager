import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { storage } from './storage';
import { api, bindTokens, loadBaseUrl } from './api';
import { restoreActiveStore } from './active-store';

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
      await restoreActiveStore();
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

  const login = useCallback(async (email, password) => {
    const data = await api.raw('/api/auth/login', {
      method: 'POST',
      body: { email: email.trim(), password },
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
    logout,
    changePassword,
    refreshUser,
  }), [user, booting, login, logout, changePassword, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
