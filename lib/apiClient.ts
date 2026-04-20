import { clearAuth } from "./authStorage";

export const SESSION_EXPIRED_MESSAGE = "Сессия истекла, выполните повторный вход";

export const AUTH_EXPIRED_EVENT = "gordo-auth-expired";

const LOGIN_PATH = "/login";

/**
 * База без хвостового `/` и без суффикса `/api`, чтобы не получить `.../api/api/...`
 * при добавлении префикса из getApiPrefix().
 */
function normalizeBaseUrl(raw: string): string {
  let t = raw.trim().replace(/\/+$/, "");
  if (t.toLowerCase().endsWith("/api")) {
    t = t.slice(0, -4).replace(/\/+$/, "");
  }
  return t;
}

/**
 * Префикс путей API (как на backend: `/api/auth`, `/api/admin`, …).
 * Пустая строка — без префикса (только для отладки со старым бэкендом без `/api`).
 * По умолчанию: `/api`.
 */
function getApiPrefix(): string {
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

/** Зарезервированный origin для сборки, когда `NEXT_PUBLIC_API_URL` не задан (без хардкода окружений). */
const UNCONFIGURED_API_BASE = "https://unconfigured.invalid";

let getApiUrlConfigWarned = false;

function warnApiUrlConfigOnce(message: string): void {
  if (getApiUrlConfigWarned) return;
  getApiUrlConfigWarned = true;
  if (typeof console !== "undefined" && console.warn) {
    console.warn(`[gordo] ${message}`);
  }
}

/**
 * База бэкенда: `NEXT_PUBLIC_API_URL` (`https://…` / `http://…`).
 * При отсутствии или неверном формате не бросает на этапе `next build` / prerender — логирует и даёт placeholder
 * (опционально переопределение через `NEXT_PUBLIC_API_FALLBACK_BASE` в Railway без правки кода).
 */
export function getApiUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  const url = (raw ?? "").trim();
  const fallback = (process.env.NEXT_PUBLIC_API_FALLBACK_BASE ?? "").trim();

  if (!url) {
    warnApiUrlConfigOnce(
      "NEXT_PUBLIC_API_URL is not set. Set the FastAPI origin in Railway. Until then, API base is a placeholder; calls will fail until configured.",
    );
    if (fallback && /^https?:\/\//i.test(fallback)) {
      return fallback;
    }
    return UNCONFIGURED_API_BASE;
  }
  if (!/^https?:\/\//i.test(url)) {
    warnApiUrlConfigOnce(
      "NEXT_PUBLIC_API_URL must be an absolute URL with http:// or https:// (not a path like /api). Using placeholder.",
    );
    if (fallback && /^https?:\/\//i.test(fallback)) {
      return fallback;
    }
    return UNCONFIGURED_API_BASE;
  }
  if (isApiDebugLoggingEnabled() && typeof console !== "undefined" && console.debug) {
    console.debug("[gordo API] NEXT_PUBLIC_API_URL (base):", url);
  }
  return url;
}

/**
 * `{NEXT_PUBLIC_API_URL}/api/...` — всегда абсолютный URL на бэкенд.
 * Путь без повторного `/api`: `buildApiUrl("/admin/users")` → `https://backend.../api/admin/users`.
 */
export function buildApiUrl(path: string): string {
  const base = normalizeBaseUrl(getApiUrl());
  const prefix = getApiPrefix();
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
  const url = buildApiUrl(path);
  logApiRequest(url, false, init.method);
  return fetch(url, init);
}

export async function fetchAuthorizedApi(
  path: string,
  token: string | null | undefined,
  init: RequestInit = {},
): Promise<Response> {
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
    return normalizeBaseUrl(getApiUrl());
  },
  getApiUrl,
  buildUrl: buildApiUrl,
  fetchPublic: fetchPublicApi,
  fetchWithAuth: fetchAuthorizedApi,
} as const;
