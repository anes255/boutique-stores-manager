import Constants from 'expo-constants';
import { storage } from './storage';

const OVERRIDE_KEY = 'api_url_override';

/**
 * In Expo Go the phone cannot reach "localhost", so we derive the dev
 * machine's LAN address from the packager host and talk to :4000 there.
 * EXPO_PUBLIC_API_URL (or the in-app override) always wins.
 */
function derivedUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost ||
    Constants.manifest2?.extra?.expoGo?.debuggerHost ||
    '';
  const host = hostUri.split(':')[0];
  if (host && host !== 'localhost' && host !== '127.0.0.1') return `http://${host}:4000`;

  const configured = Constants.expoConfig?.extra?.apiUrl;
  return (configured || 'http://localhost:4000').replace(/\/$/, '');
}

let baseUrl = derivedUrl();
let overrideLoaded = false;

export async function loadBaseUrl() {
  if (overrideLoaded) return baseUrl;
  const saved = await storage.get(OVERRIDE_KEY);
  if (saved) baseUrl = saved.replace(/\/$/, '');
  overrideLoaded = true;
  return baseUrl;
}

export function getBaseUrl() {
  return baseUrl;
}

export async function setBaseUrl(url) {
  const clean = (url || '').trim().replace(/\/$/, '');
  if (!clean) {
    await storage.remove(OVERRIDE_KEY);
    baseUrl = derivedUrl();
  } else {
    await storage.set(OVERRIDE_KEY, clean);
    baseUrl = clean;
  }
  return baseUrl;
}

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Injected by the auth provider so the client can refresh + retry once.
let tokenProvider = { get: () => null, refresh: async () => null, onLogout: () => {} };
export function bindTokens(provider) {
  tokenProvider = provider;
}

// مهلة قصوى لأي طلب. بدونها يبقى الزر يدور إلى ما لا نهاية
// عندما يكون الخادم مطفأ أو الشبكة تبتلع الطلب بصمت.
const TIMEOUT_MS = Number(process.env.EXPO_PUBLIC_API_TIMEOUT || 15000);

async function raw(path, { method = 'GET', body, token, signal } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  // نحترم إشارة الإلغاء القادمة من المتصل أيضا
  if (signal) signal.addEventListener?.('abort', () => controller.abort());

  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const timedOut = controller.signal.aborted;
    throw new ApiError(
      timedOut
        ? `الخادم لا يستجيب (${baseUrl}). تأكد أنه يعمل وأن هاتفك على نفس شبكة الواي فاي.`
        : `تعذّر الوصول إلى الخادم (${baseUrl}). تأكد أنه يعمل وأن هاتفك على نفس شبكة الواي فاي.`,
      0, timedOut ? 'timeout' : 'network'
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }

  if (!response.ok) {
    throw new ApiError(
      data?.error || `فشل الطلب (${response.status})`,
      response.status,
      data?.code
    );
  }
  return data;
}

/** Authenticated request with a single transparent refresh-and-retry. */
export async function request(path, options = {}) {
  const token = tokenProvider.get();
  try {
    return await raw(path, { ...options, token });
  } catch (err) {
    if (err.status !== 401 || options._retried) throw err;
    const fresh = await tokenProvider.refresh();
    if (!fresh) {
      tokenProvider.onLogout();
      throw err;
    }
    return raw(path, { ...options, token: fresh, _retried: true });
  }
}

export const api = {
  raw,
  get: (path, params) => request(path + toQuery(params)),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
};

export function toQuery(params) {
  if (!params) return '';
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ''
  );
  if (!entries.length) return '';
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}
