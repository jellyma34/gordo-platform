import type { GprTaskApiItem, GprTaskWritePayload } from "./gprUtils";

export type Role = "admin" | "manager" | "employee";
export type ApiSection = "gpr" | "tenders" | "materials";
export type UserStatus = "active" | "blocked";

/** Сообщение при 401 от POST /auth/login (для UI). */
export const INVALID_LOGIN_MESSAGE = "Неверный логин или пароль";
export const BLOCKED_LOGIN_MESSAGE = "Доступ ограничен. Обратитесь к администратору";

/**
 * Базовый URL API задаётся только через `NEXT_PUBLIC_API_URL`
 * (см. `.env.example`, для локальной разработки — `.env.local`).
 */
function normalizeApiBaseUrl(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";

  try {
    const u = new URL(trimmed);
    const host = u.hostname.toLowerCase();
    // Публичный домен Railway не должен содержать порт в URL (например :8000).
    if (host.endsWith(".railway.app") && u.port !== "") {
      u.port = "";
    }
    const isLoopback = host === "localhost" || host === "127.0.0.1";
    // Локальный FastAPI без TLS — https://localhost даёт ERR_SSL_PROTOCOL_ERROR
    if (isLoopback && u.protocol === "https:") {
      u.protocol = "http:";
      return u.href.replace(/\/$/, "");
    }
    return u.href.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

/** Базовый URL API (без завершающего `/`). */
export const API_URL = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);

/** Полный URL эндпоинта; бросает ошибку, если `NEXT_PUBLIC_API_URL` не задан. */
function api(path: string): string {
  if (!API_URL) {
    throw new Error(
      "NEXT_PUBLIC_API_URL не задан. Скопируйте .env.example в .env.local и укажите URL бэкенда.",
    );
  }
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_URL}${p}`;
}

if (process.env.VERCEL === "1" && !API_URL) {
  console.warn(
    "[gordo] NEXT_PUBLIC_API_URL не задан. Укажите публичный URL бэкенда в Vercel → Settings → Environment Variables.",
  );
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
}

const STORAGE_TOKEN = "gordo_token";
const STORAGE_ROLE = "gordo_role";
const STORAGE_SECTIONS = "gordo_allowed_sections";

export type AuthSnapshot = {
  token: string;
  role: Role;
  status: UserStatus;
  blockedReason?: string | null;
  allowedSections: ApiSection[];
};

function isApiSection(x: string): x is ApiSection {
  return x === "gpr" || x === "tenders" || x === "materials";
}

export function parseAllowedSections(raw: string | null): ApiSection[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is ApiSection => typeof x === "string" && isApiSection(x));
  } catch {
    return [];
  }
}

export function loadStoredAuth(): AuthSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const token = window.localStorage.getItem(STORAGE_TOKEN);
    const roleRaw = window.localStorage.getItem(STORAGE_ROLE);
    const sectionsRaw = window.localStorage.getItem(STORAGE_SECTIONS);
    if (
      !token ||
      (roleRaw !== "admin" && roleRaw !== "manager" && roleRaw !== "employee")
    )
      return null;
    return {
      token,
      role: roleRaw,
      status: "active",
      blockedReason: null,
      allowedSections: parseAllowedSections(sectionsRaw),
    };
  } catch {
    return null;
  }
}

export function saveAuth(token: string, role: Role, allowedSections: ApiSection[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_TOKEN, token);
  window.localStorage.setItem(STORAGE_ROLE, role);
  window.localStorage.setItem(STORAGE_SECTIONS, JSON.stringify(allowedSections));
}

export function clearAuth(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_TOKEN);
  window.localStorage.removeItem(STORAGE_ROLE);
  window.localStorage.removeItem(STORAGE_SECTIONS);
}

export type UiConstructionSection = "gpr" | "tenders" | "tmc";

export function uiToApi(ui: UiConstructionSection): ApiSection {
  return ui === "tmc" ? "materials" : ui;
}

export function canAccessConstructionSection(
  role: Role | null,
  allowed: ApiSection[],
  ui: UiConstructionSection,
): boolean {
  if (role === "admin" || role === "manager") return true;
  if (role !== "employee") return false;
  return allowed.includes(uiToApi(ui));
}

const SECTION_ORDER: ApiSection[] = ["gpr", "tenders", "materials"];

export function apiSectionToQuery(s: ApiSection): UiConstructionSection {
  return s === "materials" ? "tmc" : s;
}

/** Первый доступный раздел строительства (после входа сотрудника). */
export function firstConstructionPath(
  role: Role,
  allowed: ApiSection[],
  mode: "presentation" | "edit" = "presentation",
): string {
  const base = mode === "presentation" ? "/presentation/construction" : "/edit/construction";
  if (role === "admin" || role === "manager") return `${base}?section=gpr`;
  for (const s of SECTION_ORDER) {
    if (allowed.includes(s)) return `${base}?section=${apiSectionToQuery(s)}`;
  }
  return "/";
}

export async function loginRequest(email: string, password: string): Promise<AuthSnapshot> {
  try {
    const res = await fetch(api("/auth/login"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    if (res.status === 401) {
      throw new Error(INVALID_LOGIN_MESSAGE);
    }
    if (res.status === 403) {
      const err = (await res.json().catch(() => ({}))) as { detail?: unknown };
      if (typeof err.detail === "object" && err.detail !== null) {
        const d = err.detail as { code?: string; message?: string; reason?: string | null };
        if (d.code === "blocked_user") {
          const suffix = d.reason ? ` Причина: ${d.reason}` : "";
          throw new Error(`${BLOCKED_LOGIN_MESSAGE}${suffix}`);
        }
      }
      throw new Error(BLOCKED_LOGIN_MESSAGE);
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      token: string;
      user: { email: string; role: Role; status?: UserStatus; blocked_reason?: string | null; allowed_sections?: string[] };
    };
    const role = data.user.role;
    const allowedSections: ApiSection[] =
      role === "admin" || role === "manager"
        ? [...SECTION_ORDER]
        : (data.user.allowed_sections ?? []).filter((x): x is ApiSection => isApiSection(x));
    saveAuth(data.token, role, allowedSections);
    return {
      token: data.token,
      role,
      status: data.user.status === "blocked" ? "blocked" : "active",
      blockedReason: data.user.blocked_reason ?? null,
      allowedSections,
    };
  } catch (err) {
    if (err instanceof Error && err.message === INVALID_LOGIN_MESSAGE) {
      throw err;
    }
    if (err instanceof TypeError) {
      throw new Error("Ошибка соединения с сервером");
    }
    if (err instanceof Error) {
      if (err.message.startsWith("HTTP")) throw err;
    }
    throw new Error("Ошибка соединения с сервером");
  }
}

export type CreateUserPayload = {
  email: string;
  password: string;
  full_name?: string | null;
  role: Role;
  allowed_sections: ApiSection[];
};

export async function createUserRequest(token: string, body: CreateUserPayload) {
  const res = await fetch(api("/admin/create-user"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(typeof err.detail === "string" ? err.detail : "Не удалось создать пользователя");
  }
  return res.json() as Promise<{
    id: number;
    email: string;
    full_name?: string | null;
    role: string;
    allowed_sections: string[];
  }>;
}

export type AdminUserRow = {
  id: number;
  email: string;
  full_name: string | null;
  role: Role;
  status: UserStatus;
  blocked_reason?: string | null;
  blocked_at?: string | null;
  blocked_by_email?: string | null;
  allowed_sections: ApiSection[];
};

export function parseRole(raw: string): Role {
  if (raw === "admin" || raw === "manager" || raw === "employee") return raw;
  return "employee";
}

function parseUserRow(raw: {
  id: number;
  email: string;
  full_name?: string | null;
  role: string;
  status?: string;
  blocked_reason?: string | null;
  blocked_at?: string | null;
  blocked_by_email?: string | null;
  allowed_sections: string[];
}): AdminUserRow {
  return {
    id: raw.id,
    email: raw.email,
    full_name: raw.full_name?.trim() ? raw.full_name.trim() : null,
    role: parseRole(raw.role),
    status: raw.status === "blocked" ? "blocked" : "active",
    blocked_reason: raw.blocked_reason ?? null,
    blocked_at: raw.blocked_at ?? null,
    blocked_by_email: raw.blocked_by_email ?? null,
    allowed_sections: raw.allowed_sections.filter((s): s is ApiSection => isApiSection(s)),
  };
}

async function adminJsonError(res: Response, fallback: string): Promise<never> {
  const err = (await res.json().catch(() => ({}))) as { detail?: string };
  throw new Error(typeof err.detail === "string" ? err.detail : fallback);
}

export async function listAdminUsers(token: string): Promise<AdminUserRow[]> {
  const res = await fetch(api("/admin/users"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) await adminJsonError(res, "Не удалось загрузить пользователей");
  const data = (await res.json()) as Array<{
    id: number;
    email: string;
    full_name?: string | null;
    role: string;
    status?: string;
    blocked_reason?: string | null;
    blocked_at?: string | null;
    blocked_by_email?: string | null;
    allowed_sections: string[];
  }>;
  return data.map(parseUserRow);
}

export type UpdateUserPayload = {
  full_name?: string | null;
  role: Role;
  allowed_sections: ApiSection[];
};

export async function updateAdminUser(token: string, userId: number, body: UpdateUserPayload): Promise<AdminUserRow> {
  const res = await fetch(api(`/admin/users/${userId}`), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await adminJsonError(res, "Не удалось обновить пользователя");
  const raw = (await res.json()) as {
    id: number;
    email: string;
    full_name?: string | null;
    role: string;
    status?: string;
    blocked_reason?: string | null;
    blocked_at?: string | null;
    blocked_by_email?: string | null;
    allowed_sections: string[];
  };
  return parseUserRow(raw);
}

export async function blockAdminUser(token: string, userId: number, reason?: string): Promise<AdminUserRow> {
  const res = await fetch(api(`/admin/users/${userId}/block`), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ reason: reason?.trim() || null }),
  });
  if (!res.ok) await adminJsonError(res, "Не удалось заблокировать пользователя");
  const raw = (await res.json()) as {
    id: number;
    email: string;
    full_name?: string | null;
    role: string;
    status?: string;
    blocked_reason?: string | null;
    blocked_at?: string | null;
    blocked_by_email?: string | null;
    allowed_sections: string[];
  };
  return parseUserRow(raw);
}

export async function unblockAdminUser(token: string, userId: number): Promise<AdminUserRow> {
  const res = await fetch(api(`/admin/users/${userId}/unblock`), {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) await adminJsonError(res, "Не удалось разблокировать пользователя");
  const raw = (await res.json()) as {
    id: number;
    email: string;
    full_name?: string | null;
    role: string;
    status?: string;
    blocked_reason?: string | null;
    blocked_at?: string | null;
    blocked_by_email?: string | null;
    allowed_sections: string[];
  };
  return parseUserRow(raw);
}

export type UserAnalyticsTask = {
  task_id: number;
  code: string;
  name: string;
  status: "green" | "yellow" | "red" | "gray";
  deviation_days: number | null;
  completion: number;
};

export type UserAnalytics = {
  total_tasks: number;
  active_tasks: number;
  completion_percent: number;
  avg_deviation_days: number | null;
  green: number;
  yellow: number;
  red: number;
  gray: number;
  performance_score: number | null;
  low_efficiency: boolean;
  warning: string | null;
  tasks: UserAnalyticsTask[];
};

export async function getAdminUserAnalytics(token: string, userId: number): Promise<UserAnalytics> {
  const res = await fetch(api(`/admin/users/${userId}/analytics`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) await adminJsonError(res, "Не удалось загрузить аналитику пользователя");
  return res.json() as Promise<UserAnalytics>;
}

export type EntityVersionListItem = {
  id: number;
  entity_id: number;
  version_number: number;
  created_at: string;
  changed_by?: number;
  created_by: string | null;
  changed_by_name?: string | null;
  changed_by_role?: string;
  change_type?: string | null;
};

export type EntityVersionDetail = {
  id: number;
  entity_id: number;
  data: Record<string, unknown> | null;
  version_number: number;
  created_at: string;
  changed_by?: number;
  created_by: string | null;
  changed_by_name?: string | null;
  changed_by_role?: string;
  change_type?: string | null;
};

export async function listEntityVersions(token: string, entityId: number): Promise<EntityVersionListItem[]> {
  const res = await fetch(api(`/entity/${entityId}/versions`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) await adminJsonError(res, "Не удалось загрузить историю версий");
  return res.json() as Promise<EntityVersionListItem[]>;
}

export async function getEntityVersion(
  token: string,
  entityId: number,
  versionId: number,
): Promise<EntityVersionDetail> {
  const res = await fetch(api(`/entity/${entityId}/versions/${versionId}`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) await adminJsonError(res, "Не удалось загрузить версию");
  return res.json() as Promise<EntityVersionDetail>;
}

export async function rollbackEntityVersion(
  token: string,
  entityId: number,
  versionId: number,
): Promise<void> {
  const res = await fetch(api(`/entity/${entityId}/rollback/${versionId}`), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) await adminJsonError(res, "Не удалось откатить версию");
}

/** Запись в таблице ``entity_history`` (новый API). */
export type EntityHistoryListItem = {
  id: number;
  entity_id: number;
  entity_type?: string;
  changed_by: number;
  created_at: string;
  changed_by_name?: string | null;
  changed_by_role?: string;
  change_type?: string | null;
};

export type EntityHistoryDetail = {
  id: number;
  entity_id: number;
  entity_type?: string;
  data: Record<string, unknown> | null;
  changed_by: number;
  created_at: string;
  changed_by_name?: string | null;
  changed_by_role?: string;
  change_type?: string | null;
};

/** Список истории по дате (от старых к новым): ``GET /entity/{id}/history``. */
export async function listEntityHistory(token: string, entityId: number): Promise<EntityHistoryListItem[]> {
  const res = await fetch(api(`/entity/${entityId}/history`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) await adminJsonError(res, "Не удалось загрузить историю");
  return res.json() as Promise<EntityHistoryListItem[]>;
}

/** Снимок версии: ``GET /entity/{id}/history/{version_id}``. */
export async function getEntityHistoryItem(
  token: string,
  entityId: number,
  historyId: number,
): Promise<EntityHistoryDetail> {
  const res = await fetch(api(`/entity/${entityId}/history/${historyId}`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) await adminJsonError(res, "Не удалось загрузить запись истории");
  return res.json() as Promise<EntityHistoryDetail>;
}

export async function setAdminUserPassword(token: string, userId: number, password: string): Promise<void> {
  const res = await fetch(api(`/admin/users/${userId}/password`), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ password: password.trim() }),
  });
  if (!res.ok) await adminJsonError(res, "Не удалось сменить пароль");
}

export async function deleteAdminUser(token: string, userId: number): Promise<void> {
  const res = await fetch(api(`/admin/users/${userId}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) await adminJsonError(res, "Не удалось удалить пользователя");
}

export type ActivityLogRow = {
  id: number;
  user_email: string;
  role: string;
  action: string;
  entity: string;
  details: unknown;
  created_at: string;
};

export type ActivityLogsPageResponse = {
  items: ActivityLogRow[];
  total: number;
  page: number;
  page_size: number;
};

export type RelatedDeviationRow = {
  section: string;
  deviation_days: number;
  comment: string | null;
  link: string;
};

export async function listActivityLogs(
  token: string,
  page: number = 1,
  pageSize: number = 20,
): Promise<ActivityLogsPageResponse> {
  const q = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  const res = await fetch(`${api("/admin/logs")}?${q.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) await adminJsonError(res, "Не удалось загрузить историю");
  return res.json() as Promise<ActivityLogsPageResponse>;
}

export async function getRelatedDeviations(token: string, taskId: number): Promise<RelatedDeviationRow[]> {
  const res = await fetch(api(`/gpr/tasks/${taskId}/related-deviations`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) await adminJsonError(res, "Не удалось загрузить связанные отклонения");
  return res.json() as Promise<RelatedDeviationRow[]>;
}

export async function listGprTasksApi(token: string, partId?: number): Promise<GprTaskApiItem[]> {
  const q = partId != null ? `?part_id=${partId}` : "";
  const res = await fetch(api(`/gpr/tasks${q}`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) await adminJsonError(res, "Не удалось загрузить задачи ГПР");
  return res.json() as Promise<GprTaskApiItem[]>;
}

export async function updateGprTaskApi(
  token: string,
  taskId: number,
  body: GprTaskWritePayload,
): Promise<GprTaskApiItem> {
  console.log("SAVE REQUEST", taskId);
  const res = await fetch(api(`/gpr/tasks/${taskId}`), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await adminJsonError(res, "Не удалось сохранить задачу ГПР");
  return res.json() as Promise<GprTaskApiItem>;
}

export async function createGprTaskApi(token: string, body: GprTaskWritePayload): Promise<GprTaskApiItem> {
  console.log("SAVE REQUEST", "create", body.code);
  const res = await fetch(api(`/gpr/tasks`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await adminJsonError(res, "Не удалось создать задачу ГПР");
  return res.json() as Promise<GprTaskApiItem>;
}

/** Текущая задача ГПР из БД: `GET /entity/{id}` (алиас семантики «сущность»). */
export async function getEntityGprTaskApi(token: string, entityId: number): Promise<GprTaskApiItem> {
  const res = await fetch(api(`/entity/${entityId}`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) await adminJsonError(res, "Сущность не найдена или нет доступа");
  return res.json() as Promise<GprTaskApiItem>;
}

/** Случайный пароль на клиенте (до отправки на сервер; API пароль не возвращает). */
export function generateClientPassword(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 22);
}
