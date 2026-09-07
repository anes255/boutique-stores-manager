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

async function raw(path, { method = 'GET', body, token, signal } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    throw new ApiError(
      `Cannot reach the server at ${baseUrl}. Check that it is running and that your phone is on the same Wi-Fi.`,
      0, 'network'
    );
  }

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }

  if (!response.ok) {
    throw new ApiError(
      data?.error || `Request failed (${response.status})`,
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
