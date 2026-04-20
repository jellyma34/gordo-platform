import { clearAuth } from "./authStorage";

/** Сообщение при 401 на защищённых запросах (истёкший/чужой JWT и т.п.). */
export const SESSION_EXPIRED_MESSAGE = "Сессия истекла, выполните повторный вход";

/** Событие (опционально): сессия сброшена; основной сценарий — редирект на /login. */
export const AUTH_EXPIRED_EVENT = "gordo-auth-expired";

const LOGIN_PATH = "/login";

/**
 * Fallback только при `next dev` (NODE_ENV=development).
 * В production без `NEXT_PUBLIC_API_URL` не подставляем dev backend.
 */
const DEV_FALLBACK_API_URL = "https://gordo-platform-dev.up.railway.app";

/** Известный хост dev API на Railway (для предупреждения в production). */
const DEV_API_HOST = "gordo-platform-dev.up.railway.app";

const MISSING_API_PLACEHOLDER = "https://invalid-api-base.gordo.local";

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

function resolvePublicApiUrl(): string {
  const fromEnv = normalizeApiBaseUrl((process.env.NEXT_PUBLIC_API_URL ?? "").trim());
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "development") {
    return normalizeApiBaseUrl(DEV_FALLBACK_API_URL) || DEV_FALLBACK_API_URL.replace(/\/+$/, "");
  }
  return "";
}

/** Базовый URL API (без завершающего `/`). */
export const API_URL = resolvePublicApiUrl();

function warnIfDevApiInProduction(): void {
  if (process.env.NODE_ENV !== "production" || typeof window === "undefined" || !API_URL) return;
  try {
    const host = new URL(API_URL).hostname.toLowerCase();
    if (host === DEV_API_HOST) {
      console.warn(
        "[gordo] API: в production-сборке указан dev-бэкенд. Задайте NEXT_PUBLIC_API_URL на URL бэкенда текущей среды (staging/production).",
      );
    }
  } catch {
    /* ignore */
  }
}

if (typeof window !== "undefined" && API_URL) {
  const h = window.location.hostname;
  if (h !== "localhost" && h !== "127.0.0.1") {
    try {
      const u = new URL(API_URL);
      if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
        console.warn(
          "[gordo] API указывает на localhost, а страница открыта с другого хоста. Задайте NEXT_PUBLIC_API_URL на URL бэкенда в интернете.",
        );
      }
    } catch {
      /* ignore */
    }
  }
  warnIfDevApiInProduction();
}

/** Полный URL эндпоинта backend. */
export function buildApiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = API_URL || MISSING_API_PLACEHOLDER;
  if (!API_URL && typeof window !== "undefined") {
    console.error(
      "[gordo] NEXT_PUBLIC_API_URL не задан в сборке. Укажите URL бэкенда в переменных окружения (Railway / CI).",
    );
  }
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

/**
 * Публичный запрос (без Bearer). Для логина и прочих незащищённых эндпоинтов.
 */
export async function fetchPublicApi(url: string, init: RequestInit): Promise<Response> {
  logApiRequest(url, false, init.method);
  return fetch(url, init);
}

/**
 * Запрос с `Authorization: Bearer` при наличии токена. При 401 — очистка сессии и редирект на логин.
 */
export async function fetchAuthorizedApi(
  url: string,
  token: string | null | undefined,
  init: RequestInit = {},
): Promise<Response> {
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
    } else {
      clearAuth();
    }
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }
  return res;
}

/**
 * Единая точка доступа к HTTP-клиенту (baseURL из env, см. {@link API_URL}).
 */
export const apiClient = {
  get baseUrl(): string {
    return API_URL;
  },
  buildUrl: buildApiUrl,
  fetchPublic: fetchPublicApi,
  fetchWithAuth: fetchAuthorizedApi,
} as const;
