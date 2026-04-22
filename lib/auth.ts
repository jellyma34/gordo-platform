import type { GprTaskApiItem, GprTaskWritePayload } from "./gprUtils";

import {
  buildApiUrl,
  fetchAuthorizedApi,
  fetchPublicApi,
  SESSION_EXPIRED_MESSAGE,
} from "./apiClient";
import { clearAuth, loadStoredAuth, parseAllowedSections, saveAuth } from "./authStorage";
import {
  API_SECTION_KEYS,
  type ApiSection,
  type AuthSnapshot,
  type AuthStoredUser,
  isApiSection,
  type Role,
  type UserStatus,
} from "./authTypes";

export type { ApiSection, AuthSnapshot, AuthStoredUser, Role, UserStatus } from "./authTypes";
export {
  API_SECTION_KEYS,
  API_SECTION_LABELS,
  defaultNewEmployeeSections,
  formatAllowedSectionsRu,
  isApiSection,
  sectionsRecordAll,
  sectionsRecordFromAllowed,
} from "./authTypes";
export {
  API_URL,
  apiClient,
  AUTH_EXPIRED_EVENT,
  isApiDebugLoggingEnabled,
  NEXT_PUBLIC_API_URL_FALLBACK,
  SESSION_EXPIRED_MESSAGE,
} from "./apiClient";
export { clearAuth, loadStoredAuth, parseAllowedSections, saveAuth } from "./authStorage";

/** Сообщение при 401 от POST /auth/login (для UI). */
export const INVALID_LOGIN_MESSAGE = "Неверный логин или пароль";
export const BLOCKED_LOGIN_MESSAGE = "Доступ ограничен. Обратитесь к администратору";

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

const CONSTRUCTION_SECTION_ORDER: Array<Exclude<ApiSection, "marketing">> = ["gpr", "tenders", "materials"];

export function apiSectionToQuery(s: Exclude<ApiSection, "marketing">): UiConstructionSection {
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
  for (const s of CONSTRUCTION_SECTION_ORDER) {
    if (allowed.includes(s)) return `${base}?section=${apiSectionToQuery(s)}`;
  }
  if (allowed.includes("marketing")) {
    return mode === "presentation" ? "/presentation/marketing/sales-plan" : "/edit/marketing";
  }
  return "/";
}

function trimLoginStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}

function pickUserLabelFromLoginUser(user: {
  email: string;
  fio?: string | null;
  fullName?: string | null;
  full_name?: string | null;
  name?: string | null;
}): string | null {
  return (
    trimLoginStr(user.fio) ||
    trimLoginStr(user.fullName) ||
    trimLoginStr(user.full_name) ||
    trimLoginStr(user.name) ||
    trimLoginStr(user.email) ||
    null
  );
}

/** Строка для шапки: профиль сессии + необязательная метка из storage (без заглушки «Пользователь» в данных). */
export function resolveHeaderDisplayName(
  user: {
    fio?: string | null;
    fullName?: string | null;
    full_name?: string | null;
    name?: string | null;
    email?: string | null;
  } | null,
  sessionUserLabel?: string | null,
): string {
  const line =
    user?.fio?.trim() ||
    user?.fullName?.trim() ||
    user?.full_name?.trim() ||
    user?.name?.trim() ||
    user?.email?.trim();
  if (line) return line;
  const lab = sessionUserLabel?.trim();
  if (lab && lab !== "Пользователь") return lab;
  return "Пользователь";
}

/** Тело `user` из POST /auth/login и GET /auth/me. */
export type ApiLoginUser = {
  email: string;
  role: Role;
  status?: UserStatus;
  blocked_reason?: string | null;
  allowed_sections?: string[];
  fio?: string | null;
  fullName?: string | null;
  full_name?: string | null;
  name?: string | null;
};

function storedUserFromApiUser(user: ApiLoginUser): AuthStoredUser {
  const fio = trimLoginStr(user.fio);
  const fullName = trimLoginStr(user.fullName);
  const full_name = trimLoginStr(user.full_name);
  const name = trimLoginStr(user.name);
  const email = trimLoginStr(user.email);
  const bestDisplayName = fio || fullName || full_name || name || email || null;
  return {
    fio,
    fullName,
    full_name,
    name: bestDisplayName,
    email,
  };
}

function allowedSectionsFromApiUser(role: Role, user: ApiLoginUser): ApiSection[] {
  if (role === "admin" || role === "manager") {
    return [...API_SECTION_KEYS];
  }
  const known = (user.allowed_sections ?? []).filter((x): x is ApiSection => isApiSection(x));
  return [...known].sort((a, b) => API_SECTION_KEYS.indexOf(a) - API_SECTION_KEYS.indexOf(b));
}

export function authSnapshotFromApiUser(token: string, user: ApiLoginUser): AuthSnapshot {
  const role = user.role;
  const allowedSections = allowedSectionsFromApiUser(role, user);
  const storedUser = storedUserFromApiUser(user);
  const userLabel = pickUserLabelFromLoginUser(user);
  return {
    token,
    role,
    status: user.status === "blocked" ? "blocked" : "active",
    blockedReason: user.blocked_reason ?? null,
    allowedSections,
    userLabel,
    user: storedUser,
  };
}

/**
 * Актуальный профиль с бэка (ФИО в fio / fullName / full_name).
 * Старый бэкенд без маршрута вернёт 404 — сессия из storage сохраняется.
 */
export async function fetchAuthMe(token: string): Promise<AuthSnapshot | null> {
  try {
    const res = await fetchAuthorizedApi(buildApiUrl("/auth/me"), token, { method: "GET" });
    if (!res.ok) return null;
    const user = (await res.json()) as ApiLoginUser;
    const snap = authSnapshotFromApiUser(token, user);
    saveAuth(snap.token, snap.role, snap.allowedSections, snap.userLabel ?? null, snap.user ?? null);
    return snap;
  } catch (e) {
    if (e instanceof Error && e.message === SESSION_EXPIRED_MESSAGE) throw e;
    return null;
  }
}

export async function loginRequest(email: string, password: string): Promise<AuthSnapshot> {
  try {
    const res = await fetchPublicApi(buildApiUrl("/auth/login"), {
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

    const data = (await res.json()) as { token: string; user: ApiLoginUser };
    const snap = authSnapshotFromApiUser(data.token, data.user);
    saveAuth(snap.token, snap.role, snap.allowedSections, snap.userLabel ?? null, snap.user ?? null);
    return snap;
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
  const res = await fetchAuthorizedApi(buildApiUrl("/admin/create-user"), token, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
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
    allowed_sections: (() => {
      const known = raw.allowed_sections.filter((s): s is ApiSection => isApiSection(s));
      return [...known].sort((a, b) => API_SECTION_KEYS.indexOf(a) - API_SECTION_KEYS.indexOf(b));
    })(),
  };
}

async function adminJsonError(res: Response, fallback: string): Promise<never> {
  const err = (await res.json().catch(() => ({}))) as { detail?: string };
  throw new Error(typeof err.detail === "string" ? err.detail : fallback);
}

export async function listAdminUsers(token: string): Promise<AdminUserRow[]> {
  const res = await fetchAuthorizedApi(buildApiUrl("/admin/users"), token, {});
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
  const res = await fetchAuthorizedApi(buildApiUrl(`/admin/users/${userId}`), token, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
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
  const res = await fetchAuthorizedApi(buildApiUrl(`/admin/users/${userId}/block`), token, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
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
  const res = await fetchAuthorizedApi(buildApiUrl(`/admin/users/${userId}/unblock`), token, {
    method: "PUT",
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
  const res = await fetchAuthorizedApi(buildApiUrl(`/admin/users/${userId}/analytics`), token, {});
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
  const res = await fetchAuthorizedApi(buildApiUrl(`/entity/${entityId}/versions`), token, {});
  if (!res.ok) await adminJsonError(res, "Не удалось загрузить историю версий");
  return res.json() as Promise<EntityVersionListItem[]>;
}

export async function getEntityVersion(
  token: string,
  entityId: number,
  versionId: number,
): Promise<EntityVersionDetail> {
  const res = await fetchAuthorizedApi(buildApiUrl(`/entity/${entityId}/versions/${versionId}`), token, {});
  if (!res.ok) await adminJsonError(res, "Не удалось загрузить версию");
  return res.json() as Promise<EntityVersionDetail>;
}

export async function rollbackEntityVersion(
  token: string,
  entityId: number,
  versionId: number,
  entityType: "gpr" | "tender" | "tmc" = "gpr",
): Promise<void> {
  const res = await fetchAuthorizedApi(buildApiUrl(`/entity/${entityId}/rollback/${versionId}?type=${entityType}`), token, {
    method: "POST",
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
export async function listEntityHistory(
  token: string,
  entityId: number,
  entityType: "gpr" | "tender" | "tmc" = "gpr",
): Promise<EntityHistoryListItem[]> {
  const res = await fetchAuthorizedApi(buildApiUrl(`/entity/${entityId}/history?type=${entityType}`), token, {});
  if (!res.ok) await adminJsonError(res, "Не удалось загрузить историю");
  return res.json() as Promise<EntityHistoryListItem[]>;
}

/** Снимок версии: ``GET /entity/{id}/history/{version_id}``. */
export async function getEntityHistoryItem(
  token: string,
  entityId: number,
  historyId: number,
  entityType: "gpr" | "tender" | "tmc" = "gpr",
): Promise<EntityHistoryDetail> {
  const res = await fetchAuthorizedApi(buildApiUrl(`/entity/${entityId}/history/${historyId}?type=${entityType}`), token, {});
  if (!res.ok) await adminJsonError(res, "Не удалось загрузить запись истории");
  return res.json() as Promise<EntityHistoryDetail>;
}

/** Удаление записи истории (только администратор). ``DELETE /entity/{id}/history/{version_id}``. */
export async function deleteEntityHistoryVersion(
  token: string,
  entityId: number,
  historyId: number,
  entityType: "gpr" | "tender" | "tmc" = "gpr",
): Promise<void> {
  const res = await fetchAuthorizedApi(buildApiUrl(`/entity/${entityId}/history/${historyId}?type=${entityType}`), token, {
    method: "DELETE",
  });
  if (!res.ok) await adminJsonError(res, "Не удалось удалить версию истории");
  if (res.headers.get("content-type")?.includes("application/json")) {
    await res.json().catch(() => undefined);
  }
}

export async function setAdminUserPassword(token: string, userId: number, password: string): Promise<void> {
  const res = await fetchAuthorizedApi(buildApiUrl(`/admin/users/${userId}/password`), token, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password: password.trim() }),
  });
  if (!res.ok) await adminJsonError(res, "Не удалось сменить пароль");
}

export async function deleteAdminUser(token: string, userId: number): Promise<void> {
  const res = await fetchAuthorizedApi(buildApiUrl(`/admin/users/${userId}`), token, {
    method: "DELETE",
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
  const res = await fetchAuthorizedApi(`${buildApiUrl("/admin/logs")}?${q.toString()}`, token, {});
  if (!res.ok) await adminJsonError(res, "Не удалось загрузить историю");
  return res.json() as Promise<ActivityLogsPageResponse>;
}

export async function getRelatedDeviations(token: string, taskId: number): Promise<RelatedDeviationRow[]> {
  const res = await fetchAuthorizedApi(buildApiUrl(`/gpr/tasks/${taskId}/related-deviations`), token, {});
  if (!res.ok) await adminJsonError(res, "Не удалось загрузить связанные отклонения");
  return res.json() as Promise<RelatedDeviationRow[]>;
}

export async function listGprTasksApi(token: string, partId?: number): Promise<GprTaskApiItem[]> {
  const q = partId != null ? `?part_id=${partId}` : "";
  const res = await fetchAuthorizedApi(buildApiUrl(`/gpr/tasks${q}`), token, {});
  if (!res.ok) await adminJsonError(res, "Не удалось загрузить задачи ГПР");
  return res.json() as Promise<GprTaskApiItem[]>;
}

export async function updateGprTaskApi(
  token: string,
  taskId: number,
  body: GprTaskWritePayload,
): Promise<GprTaskApiItem> {
  const res = await fetchAuthorizedApi(buildApiUrl(`/gpr/tasks/${taskId}`), token, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await adminJsonError(res, "Не удалось сохранить задачу ГПР");
  return res.json() as Promise<GprTaskApiItem>;
}

export async function createGprTaskApi(token: string, body: GprTaskWritePayload): Promise<GprTaskApiItem> {
  const res = await fetchAuthorizedApi(buildApiUrl(`/gpr/tasks`), token, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await adminJsonError(res, "Не удалось создать задачу ГПР");
  return res.json() as Promise<GprTaskApiItem>;
}

/** Текущая задача ГПР из БД: `GET /entity/{id}` (алиас семантики «сущность»). */
export async function getEntityGprTaskApi(token: string, entityId: number): Promise<GprTaskApiItem> {
  const res = await fetchAuthorizedApi(buildApiUrl(`/entity/${entityId}`), token, {});
  if (!res.ok) await adminJsonError(res, "Сущность не найдена или нет доступа");
  return res.json() as Promise<GprTaskApiItem>;
}

/** Алиас для UI rollback: получить актуальную сущность после операции. */
export async function getTask(token: string, entityId: number): Promise<GprTaskApiItem> {
  return getEntityGprTaskApi(token, entityId);
}

/** Случайный пароль на клиенте (до отправки на сервер; API пароль не возвращает). */
export function generateClientPassword(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 22);
}
