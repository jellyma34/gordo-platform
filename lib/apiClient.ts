import { clearAuth } from "./authStorage";

/** Сообщение при 401 на защищённых запросах (истёкший/чужой JWT и т.п.). */
export const SESSION_EXPIRED_MESSAGE = "Сессия истекла, выполните повторный вход";

/** Событие (опционально): сессия сброшена; основной сценарий — редирект на /login. */
export const AUTH_EXPIRED_EVENT = "gordo-auth-expired";

const LOGIN_PATH = "/login";

/** Локальный backend по умолчанию, если `NEXT_PUBLIC_API_URL` не задан (типичный `uvicorn` без флага порта). */
const LOCAL_DEV_API_DEFAULT = "http://localhost:8000";

/**
 * Если `NEXT_PUBLIC_API_URL` не задан при production-сборке (например, забыт в Railway).
 * Явный fallback — тот же хост, что и dev-бэкенд.
 */
export const NEXT_PUBLIC_API_URL_FALLBACK = "https://gordo-platform-dev.up.railway.app";

const PROD_BUILD_FALLBACK_API_URL = NEXT_PUBLIC_API_URL_FALLBACK;

const DEV_API_HOST = "gordo-platform-dev.up.railway.app";

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
  const fromEnv = normalizeApiBaseUrl(
    (process.env.NEXT_PUBLIC_API_URL || "").trim() || "",
  );
  if (fromEnv) {
    return fromEnv;
  }
  if (process.env.NODE_ENV === "development") {
    const local =
      normalizeApiBaseUrl(LOCAL_DEV_API_DEFAULT) || LOCAL_DEV_API_DEFAULT.replace(/\/+$/, "");
    return local;
  }
  const fallback =
    normalizeApiBaseUrl(PROD_BUILD_FALLBACK_API_URL) ||
    PROD_BUILD_FALLBACK_API_URL.replace(/\/+$/, "");
  if (typeof console !== "undefined" && console.warn) {
    console.warn(
      "[gordo] NEXT_PUBLIC_API_URL is not set — using fallback for this build. " +
        "Set NEXT_PUBLIC_API_URL in Railway / .env for the correct API.",
    );
  }
  return fallback;
}

/**
 * Базовый URL API: `process.env.NEXT_PUBLIC_API_URL`, в dev без env — localhost,
 * в production без env — {@link NEXT_PUBLIC_API_URL_FALLBACK}.
 */
export const API_URL = resolvePublicApiUrl();

function warnIfDevApiInProduction(): void {
  if (process.env.NODE_ENV !== "production" || typeof window === "undefined") return;
  try {
    const host = new URL(API_URL).hostname.toLowerCase();
    if (host === DEV_API_HOST) {
      console.warn(
        "[gordo] API: в production-сборке указан dev-бэкенд. Задайте NEXT_PUBLIC_API_URL на URL бэкенда текущей среды.",
      );
    }
  } catch {
    /* ignore */
  }
}

if (typeof window !== "undefined") {
  const h = window.location.hostname;
  if (h !== "localhost" && h !== "127.0.0.1") {
    try {
      const u = new URL(API_URL);
      if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
        console.warn(
          "[gordo] API указывает на localhost, а страница открыта с другого хоста. Задайте NEXT_PUBLIC_API_URL в интернете.",
        );
      }
    } catch {
      /* ignore */
    }
  }
  warnIfDevApiInProduction();
}

/** Полный абсолютный URL эндпоинта backend (схема + хост + path). */
export function buildApiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = API_URL.endsWith("/") ? API_URL : `${API_URL}/`;
  return new URL(p, base).href;
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
