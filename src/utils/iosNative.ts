import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Keyboard } from '@capacitor/keyboard';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};

export interface NativeAppleSignInResult {
  user: string;
  email?: string;
  givenName?: string;
  familyName?: string;
  fullName?: string;
  identityToken?: string;
  authorizationCode?: string;
  rawNonce?: string;
}

interface NativeAppleSignInPluginInterface {
  authorize(): Promise<NativeAppleSignInResult>;
}

const NativeAppleSignIn = registerPlugin<NativeAppleSignInPluginInterface>('NativeAppleSignIn');

export async function performNativeIOSAppleSignIn(): Promise<{
  success: boolean;
  canceled?: boolean;
  data?: NativeAppleSignInResult;
  error?: string;
}> {
  if (!isNativeIOSApp()) {
    return { success: false, error: 'NOT_NATIVE_IOS' };
  }
  try {
    const data = await NativeAppleSignIn.authorize();
    return { success: true, data };
  } catch (err: any) {
    const code = String(err?.code || '').toUpperCase();
    const message = String(err?.message || '');
    if (code === 'CANCELED' || code === '1001' || message.includes('CANCELED')) {
      return { success: false, canceled: true };
    }
    return {
      success: false,
      error: message || 'تعذر فتح شاشة تسجيل الدخول بحساب Apple على الجهاز'
    };
  }
}

export async function crossPlatformJsonRequest<T = any>(params: {
  url: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const method = params.method || 'GET';
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(params.headers || {})
  };
  if (params.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  let nativeErrorMsg = '';
  if (isNativeIOSApp()) {
    try {
      const nativeRes = await CapacitorHttp.request({
        url: params.url,
        method,
        headers,
        ...(params.body !== undefined ? { data: params.body } : {}),
        connectTimeout: params.timeoutMs || 8000,
        readTimeout: params.timeoutMs || 8000
      });
      const status = Number(nativeRes.status) || 0;
      let parsed: any = nativeRes.data ?? null;
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch {
          // keep null if non-JSON string
          if (!parsed.trim().startsWith('{') && !parsed.trim().startsWith('[')) {
            parsed = null;
          }
        }
      }
      if (status >= 200 && status < 300) {
        return { ok: true, status, data: parsed as T };
      }
      if (status >= 300) {
        return {
          ok: false,
          status,
          data: parsed as T,
          error: (parsed && (parsed.message || parsed.error || parsed.hint)) || `HTTP ${status}`
        };
      }
      nativeErrorMsg = `HTTP ${status}`;
    } catch (err: any) {
      nativeErrorMsg = String(err?.message || 'NativeHttpError');
    }
  }

  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer =
      controller && params.timeoutMs
        ? setTimeout(() => controller.abort(), params.timeoutMs)
        : null;
    try {
      const res = await globalThis.fetch(params.url, {
        method,
        headers,
        ...(params.body !== undefined ? { body: JSON.stringify(params.body) } : {}),
        ...(controller ? { signal: controller.signal } : {})
      });
      const text = await res.text();
      let parsed: any = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = null;
      }
      if (res.ok) {
        return { ok: true, status: res.status, data: parsed as T };
      }
      return {
        ok: false,
        status: res.status,
        data: parsed as T,
        error: (parsed && (parsed.message || parsed.error)) || `HTTP ${res.status}`
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch (err: any) {
    const fetchErr = String(err?.message || 'NetworkError');
    return {
      ok: false,
      status: 0,
      data: null,
      error: nativeErrorMsg ? `${nativeErrorMsg} / ${fetchErr}` : fetchErr
    };
  }
}

const DEFAULT_PRODUCTION_BACKEND_URL = (env.VITE_API_BASE_URL || env.VITE_BACKEND_URL || '').trim();

function isDisallowedTemporaryTunnelUrl(url: string): boolean {
  return /ais-(?:dev|pre)-/i.test(url);
}

export function isNativeIOSApp(): boolean {
  try {
    if (Capacitor.isNativePlatform()) {
      return true;
    }
    if (typeof window !== 'undefined') {
      const proto = window.location.protocol;
      return proto === 'capacitor:' || proto === 'ionic:' || proto === 'file:';
    }
  } catch {
    // ignore
  }
  return false;
}

export function isLocalOrDevWebOrigin(): boolean {
  try {
    if (typeof window === 'undefined' || isNativeIOSApp()) return false;
    const host = (window.location.hostname || '').toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      /\.run\.app$/i.test(host)
    );
  } catch {
    return false;
  }
}

export function isStaticWebHostingOrigin(): boolean {
  try {
    if (typeof window === 'undefined' || isNativeIOSApp()) return false;
    const host = (window.location.hostname || '').toLowerCase();
    return host.endsWith('.vercel.app') || host.endsWith('.netlify.app');
  } catch {
    return false;
  }
}

export function getConfiguredApiBaseUrl(): string {
  // Always keep AI Studio dev/preview and localhost isolated on their own local Express backend
  if (isLocalOrDevWebOrigin()) {
    return '';
  }

  try {
    if (typeof window !== 'undefined') {
      const storedOverride = localStorage.getItem('fatteshha_api_base_url');
      if (storedOverride && storedOverride.startsWith('http')) {
        if (!isDisallowedTemporaryTunnelUrl(storedOverride)) {
          return storedOverride.replace(/\/+$/, '');
        }
      }
    }
  } catch {
    // ignore
  }

  if (env.VITE_API_BASE_URL && env.VITE_API_BASE_URL.startsWith('http')) {
    if (!isDisallowedTemporaryTunnelUrl(env.VITE_API_BASE_URL)) {
      return env.VITE_API_BASE_URL.replace(/\/+$/, '');
    }
  }

  if (isNativeIOSApp() || isStaticWebHostingOrigin()) {
    if (DEFAULT_PRODUCTION_BACKEND_URL.startsWith('http') && !isDisallowedTemporaryTunnelUrl(DEFAULT_PRODUCTION_BACKEND_URL)) {
      return DEFAULT_PRODUCTION_BACKEND_URL.replace(/\/+$/, '');
    }
    return 'https://ftsh.onrender.com';
  }

  return '';
}

export function isProductionBackendConfigured(): boolean {
  return Boolean(getConfiguredApiBaseUrl());
}

export function resolveApiUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return pathOrUrl;
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl;
  }
  const baseUrl = getConfiguredApiBaseUrl();
  if (!baseUrl) {
    return pathOrUrl;
  }
  const normalizedPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${baseUrl}${normalizedPath}`;
}

function decodeWsTokenUsername(token?: string | null): string | null {
  if (!token || typeof token !== 'string') return null;
  const trimmed = token.replace(/^Bearer\s+/i, '').trim();
  const parts = trimmed.split('.');
  if (parts.length !== 3 || parts[0] !== 'fts_tok') return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    const parsed = JSON.parse(atob(b64 + pad));
    if (parsed && typeof parsed.username === 'string' && parsed.username.trim()) {
      return parsed.username.trim().replace(/^@+/, '').toLowerCase().replace(/\s+/g, '_');
    }
  } catch {
    // ignore malformed token
  }
  return null;
}

export function resolveWebSocketUrl(
  rawWsUrl?: string,
  explicitToken?: string | null,
  expectedUsername?: string | null
): string {
  const baseUrl = getConfiguredApiBaseUrl();
  let resolved = '';

  if (baseUrl) {
    try {
      const parsedBase = new URL(baseUrl);
      const wsProto = parsedBase.protocol === 'https:' ? 'wss:' : 'ws:';
      if (rawWsUrl) {
        const qIndex = rawWsUrl.indexOf('?');
        const query = qIndex >= 0 ? rawWsUrl.slice(qIndex) : '';
        resolved = `${wsProto}//${parsedBase.host}/ws${query}`;
      } else {
        resolved = `${wsProto}//${parsedBase.host}/ws`;
      }
    } catch {
      // fall through
    }
  }

  if (!resolved) {
    if (rawWsUrl) {
      resolved = rawWsUrl;
    } else if (typeof window !== 'undefined') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      resolved = `${protocol}//${window.location.host}/ws`;
    } else {
      resolved = 'ws://localhost:3000/ws';
    }
  }

  try {
    if (typeof window !== 'undefined' && !resolved.includes('token=')) {
      const storedActiveUser = localStorage.getItem('fatteshha_active_user') || '';
      const rawExpected = expectedUsername || storedActiveUser;
      const targetUser = rawExpected
        ? rawExpected.trim().replace(/^@+/, '').toLowerCase().replace(/\s+/g, '_')
        : '';

      const matchesTarget = (tok?: string | null): boolean => {
        if (!tok) return false;
        if (!targetUser) return true;
        const tokUser = decodeWsTokenUsername(tok);
        return !tokUser || tokUser === targetUser;
      };

      let token = '';
      if (explicitToken && matchesTarget(explicitToken)) {
        token = explicitToken;
      }

      if (!token && targetUser) {
        const rawMap = localStorage.getItem('fatteshha_auth_tokens_v1');
        if (rawMap) {
          const map = JSON.parse(rawMap) as Record<string, string>;
          if (map[targetUser] && matchesTarget(map[targetUser])) {
            token = map[targetUser];
          }
        }
      }

      if (!token) {
        const activeToken = localStorage.getItem('fatteshha_active_token') || '';
        if (activeToken && matchesTarget(activeToken)) {
          token = activeToken;
        }
      }

      if (token) {
        resolved += (resolved.includes('?') ? '&' : '?') + `token=${encodeURIComponent(token)}`;
      }
    }
  } catch {
    // ignore storage access errors
  }

  return resolved;
}

// ============================================================================
// iOS HAPTICS (Taptic Engine with graceful web fallback)
// ============================================================================
export async function triggerHapticTap(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      await Haptics.impact({ style: ImpactStyle.Light });
    }
  } catch {
    // ignore on unsupported devices
  }
}

export async function triggerHapticWordFound(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      await Haptics.impact({ style: ImpactStyle.Medium });
    }
  } catch {
    // ignore
  }
}

export async function triggerHapticVictory(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      await Haptics.notification({ type: NotificationType.Success });
    }
  } catch {
    // ignore
  }
}

export async function triggerHapticError(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      await Haptics.notification({ type: NotificationType.Warning });
    }
  } catch {
    // ignore
  }
}

// ============================================================================
// NATIVE iOS INITIALIZATION & LIFECYCLE / NETWORK LISTENERS
// ============================================================================
export interface IOSLifecycleCallbacks {
  onResumeForeground?: () => void;
  onEnterBackground?: () => void;
  onNetworkStatusChange?: (connected: boolean) => void;
}

let isNativeInitialized = false;

export async function initializeIOSNativePlatform(callbacks?: IOSLifecycleCallbacks): Promise<() => void> {
  const cleanups: Array<() => void> = [];

  if (typeof window !== 'undefined') {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        callbacks?.onResumeForeground?.();
      } else if (document.visibilityState === 'hidden') {
        callbacks?.onEnterBackground?.();
      }
    };
    const onOnline = () => callbacks?.onNetworkStatusChange?.(true);
    const onOffline = () => callbacks?.onNetworkStatusChange?.(false);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    cleanups.push(() => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    });
  }

  if (!Capacitor.isNativePlatform()) {
    return () => cleanups.forEach(fn => fn());
  }

  try {
    if (!isNativeInitialized) {
      isNativeInitialized = true;
      await StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
      await Keyboard.setAccessoryBarVisible({ isVisible: true }).catch(() => {});
      await SplashScreen.hide().catch(() => {});
    }

    const appStateSub = await CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        callbacks?.onResumeForeground?.();
      } else {
        callbacks?.onEnterBackground?.();
      }
    });
    cleanups.push(() => {
      appStateSub.remove().catch(() => {});
    });

    const netSub = await Network.addListener('networkStatusChange', status => {
      callbacks?.onNetworkStatusChange?.(Boolean(status.connected));
    });
    cleanups.push(() => {
      netSub.remove().catch(() => {});
    });
  } catch {
    // Graceful fallback in web/simulator environments
  }

  return () => {
    cleanups.forEach(fn => fn());
  };
}
