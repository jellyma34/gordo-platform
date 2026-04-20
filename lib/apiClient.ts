import { clearAuth } from "./authStorage";

export const SESSION_EXPIRED_MESSAGE = "Сессия истекла, выполните повторный вход";

export const AUTH_EXPIRED_EVENT = "gordo-auth-expired";

const LOGIN_PATH = "/login";

const KNOWN_DEV_API_HOST = "gordo-platform-dev.up.railway.app";

function normalizeApiBaseUrl(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";

  try {
    const u = new URL(trimmed);
    const host = u.hostname.toLowerCase();
    if (host.endsWith(".railway.app") && u.port !== "") {
      u.port = "";
    }
    const isLoopback = host === "localhost" || host === "127.0.0.1";
    if (isLoopback && u.protocol === "https:") {
      u.protocol = "http:";
      return u.href.replace(/\/$/, "");
    }
    return u.href.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

/**
 * Читает `NEXT_PUBLIC_API_URL` при каждом вызове (не кэшируется в модульной константе).
 * Примечание: в клиентском бандле Next.js подставляет значения `NEXT_PUBLIC_*` на этапе сборки.
 */
export function getApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url?.trim()) {
    console.error("API URL not set");
    return "";
  }
  return url.trim();
}

let clientWarningsDone = false;

function runClientWarningsOnce(base: string): void {
  if (clientWarningsDone || typeof window === "undefined" || !base) return;
  clientWarningsDone = true;

  const h = window.location.hostname;
  if (h !== "localhost" && h !== "127.0.0.1") {
    try {
      const u = new URL(base);
      if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
        console.warn(
          "[gordo] API указывает на localhost, а страница открыта с другого хоста. Задайте NEXT_PUBLIC_API_URL на URL бэкенда в интернете.",
        );
      }
    } catch {
      /* ignore */
    }
  }

  if (process.env.NODE_ENV === "production") {
    try {
      const host = new URL(base).hostname.toLowerCase();
      if (host === KNOWN_DEV_API_HOST) {
        console.warn(
          "[gordo] В production-сборке указан dev-бэкенд. Задайте NEXT_PUBLIC_API_URL на URL бэкенда среды (staging/production).",
        );
      }
    } catch {
      /* ignore */
    }
  }
}

function ensureRequestUrl(url: string): void {
  if (!url?.trim()) {
    throw new Error("API URL not set");
  }
}

export function buildApiUrl(path: string): string {
  const raw = getApiUrl();
  if (!raw) {
    return "";
  }
  const base = normalizeApiBaseUrl(raw);
  if (!base) {
    console.error("API URL not set");
    return "";
  }
  runClientWarningsOnce(base);
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base.replace(/\/+$/, "")}${p}`;
}

export function isApiDebugLoggingEnabled(): boolean {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEBUG_API === "1") return true;
  return process.env.NODE_ENV === "development";
}

function logApiRequest(url: string, hasToken: boolean, method?: string): void {
  if (!isApiDebugLoggingEnabled()) return;
  if (typeof console !== "undefined" && typeof console.debug === "function") {
    console.debug("[gordo API]", { url, hasToken, method: method ?? "GET" });
  }
}

function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  const next = `${window.location.pathname}${window.location.search}`;
  const url =
    next && next !== LOGIN_PATH
      ? `${LOGIN_PATH}?next=${encodeURIComponent(next)}`
      : LOGIN_PATH;
  window.location.assign(url);
}

export async function fetchPublicApi(url: string, init: RequestInit): Promise<Response> {
  ensureRequestUrl(url);
  logApiRequest(url, false, init.method);
  return fetch(url, init);
}

export async function fetchAuthorizedApi(
  url: string,
  token: string | null | undefined,
  init: RequestInit = {},
): Promise<Response> {
  ensureRequestUrl(url);
  const headers = new Headers(init.headers ?? {});
  const hasToken = Boolean(token?.trim());
  if (hasToken) {
    headers.set("Authorization", `Bearer ${token}`);
  } else if (isApiDebugLoggingEnabled() && typeof console !== "undefined" && console.warn) {
    console.warn("[gordo] API: нет токена для защищённого запроса", url);
  }
  logApiRequest(url, hasToken, init.method);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    clearAuth();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
      redirectToLogin();
    }
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }
  return res;
}

export const apiClient = {
  get baseUrl(): string {
    const raw = getApiUrl();
    if (!raw) return "";
    return normalizeApiBaseUrl(raw) || raw;
  },
  getApiUrl,
  buildUrl: buildApiUrl,
  fetchPublic: fetchPublicApi,
  fetchWithAuth: fetchAuthorizedApi,
} as const;
