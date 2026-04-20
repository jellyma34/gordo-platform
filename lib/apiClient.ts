import { clearAuth } from "./authStorage";

export const SESSION_EXPIRED_MESSAGE = "Сессия истекла, выполните повторный вход";

export const AUTH_EXPIRED_EVENT = "gordo-auth-expired";

const LOGIN_PATH = "/login";

/** Сырое значение из env (для логов при невалидном URL). */
const NEXT_PUBLIC_API_URL_RAW = process.env.NEXT_PUBLIC_API_URL;

/**
 * Итоговый базовый URL после нормализации: trim, снятие обрамляющих кавычек, удаление завершающего `/`.
 * Инлайнится на этапе сборки для `NEXT_PUBLIC_*`.
 */
export const API_URL = NEXT_PUBLIC_API_URL_RAW
  ? NEXT_PUBLIC_API_URL_RAW.trim()
      .replace(/^["']|["']$/g, "")
      .replace(/\/$/, "")
  : "";

let loggedInvalidApiUrl = false;

function logInvalidApiUrlOnce(rawValue: string | undefined): void {
  if (loggedInvalidApiUrl) return;
  loggedInvalidApiUrl = true;
  if (typeof console !== "undefined" && console.error) {
    console.error("❌ NEXT_PUBLIC_API_URL invalid:", rawValue);
  }
}

function isApiUrlValid(): boolean {
  return API_URL.startsWith("http://") || API_URL.startsWith("https://");
}

/**
 * База без хвостового `/` и без суффикса `/api`, чтобы не получить `.../api/api/...`
 * при добавлении префикса `/api`.
 */
function normalizeBaseUrl(raw: string): string {
  let t = raw.trim().replace(/\/+$/, "");
  if (t.toLowerCase().endsWith("/api")) {
    t = t.slice(0, -4).replace(/\/+$/, "");
  }
  return t;
}

/**
 * Нормализованный origin (`https://host`), без `/api`. `null`, если переменная не задана или не абсолютный http(s) URL.
 * Не бросает исключений (в т.ч. на этапе сборки).
 */
export function resolveApiOrigin(): string | null {
  if (!isApiUrlValid()) {
    logInvalidApiUrlOnce(NEXT_PUBLIC_API_URL_RAW);
    return null;
  }
  return normalizeBaseUrl(API_URL);
}

/** Сообщение при попытке запроса с невалидным URL (только в runtime, внутри fetch*). */
export function getApiConfigurationError(): string | null {
  if (!isApiUrlValid()) {
    return "API URL is not configured correctly";
  }
  return null;
}

/**
 * Префикс REST после origin. По умолчанию `/api` → итог `{origin}/api/...`.
 * Пустая строка `NEXT_PUBLIC_API_PREFIX=""` — только для отладки со старым бэкендом.
 */
function getApiPathPrefix(): string {
  const raw = process.env.NEXT_PUBLIC_API_PREFIX;
  if (raw === "") {
    return "";
  }
  const p = (raw ?? "/api").trim();
  if (p === "") {
    return "";
  }
  return p.startsWith("/") ? p : `/${p}`;
}

/**
 * База для отображения/совместимости: валидный origin или пустая строка (без подставных URL).
 */
export function getApiUrl(): string {
  return resolveApiOrigin() ?? "";
}

/**
 * `{origin}/api/...` — абсолютный URL на бэкенд.
 * Пример: `buildApiUrl("/admin/users")` → `https://backend.../api/admin/users`.
 * При невалидном `NEXT_PUBLIC_API_URL` возвращает пустую строку (без исключений, в т.ч. при сборке).
 */
export function buildApiUrl(path: string): string {
  const base = resolveApiOrigin();
  if (!base) {
    return "";
  }
  const prefix = getApiPathPrefix();
  const p = path.startsWith("/") ? path : `/${path}`;
  const pathPart = `${prefix}${p}`;
  return new URL(pathPart, base.endsWith("/") ? base : `${base}/`).href;
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

export async function fetchPublicApi(path: string, init: RequestInit): Promise<Response> {
  const cfg = getApiConfigurationError();
  if (cfg) throw new Error(cfg);
  const url = buildApiUrl(path);
  logApiRequest(url, false, init.method);
  return fetch(url, init);
}

export async function fetchAuthorizedApi(
  path: string,
  token: string | null | undefined,
  init: RequestInit = {},
): Promise<Response> {
  const cfg = getApiConfigurationError();
  if (cfg) throw new Error(cfg);
  const url = buildApiUrl(path);
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
    return resolveApiOrigin() ?? "";
  },
  getApiUrl,
  buildUrl: buildApiUrl,
  fetchPublic: fetchPublicApi,
  fetchWithAuth: fetchAuthorizedApi,
} as const;
