import { clearAuth } from "./authStorage";

export const SESSION_EXPIRED_MESSAGE = "Сессия истекла, выполните повторный вход";

export const AUTH_EXPIRED_EVENT = "gordo-auth-expired";

const LOGIN_PATH = "/login";

const raw = process.env.NEXT_PUBLIC_API_URL;

function trimEnvApiValue(value: string): string {
  let s = value.trim();
  for (;;) {
    const q =
      (s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"));
    if (!q) break;
    s = s.slice(1, -1).trim();
  }
  return s;
}

export let API_URL: string | null = null;

if (raw) {
  try {
    const normalized = trimEnvApiValue(raw);
    const parsed = new URL(normalized);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      API_URL = parsed.origin;
    } else {
      console.error("❌ Invalid NEXT_PUBLIC_API_URL:", raw);
    }
  } catch {
    console.error("❌ Invalid NEXT_PUBLIC_API_URL:", raw);
  }
}

if (!API_URL) {
  console.error("❌ API URL is not configured correctly:", raw);
}

/**
 * Полный URL к бэкенду: `{origin}{path}`, где `path` обычно `/api/...`.
 * При `!API_URL` возвращает пустую строку (без исключений на этапе сборки).
 */
export function buildUrl(path: string): string {
  if (!API_URL) {
    return "";
  }
  return `${API_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

export const buildApiUrl = buildUrl;

export function resolveApiOrigin(): string | null {
  return API_URL;
}

export function getApiConfigurationError(): string | null {
  if (!API_URL) {
    return "API URL is not configured";
  }
  return null;
}

export function getApiUrl(): string {
  return API_URL ?? "";
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
  if (!API_URL) {
    throw new Error("API URL is not configured");
  }
  const url = buildUrl(path);
  logApiRequest(url, false, init.method);
  return fetch(url, init);
}

export async function fetchAuthorizedApi(
  path: string,
  token: string | null | undefined,
  init: RequestInit = {},
): Promise<Response> {
  if (!API_URL) {
    throw new Error("API URL is not configured");
  }
  const url = buildUrl(path);
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
    return API_URL ?? "";
  },
  getApiUrl,
  buildUrl,
  buildApiUrl,
  fetchPublic: fetchPublicApi,
  fetchWithAuth: fetchAuthorizedApi,
} as const;
