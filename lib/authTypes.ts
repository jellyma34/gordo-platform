export type Role = "admin" | "manager" | "employee";
export type ApiSection = "gpr" | "tenders" | "materials";
export type UserStatus = "active" | "blocked";

/** Профиль для шапки и localStorage (отдельно от агрегированного userLabel). */
export type AuthStoredUser = {
  /** ФИО (альтернативные имена полей с бэка/интеграций). */
  fio?: string | null;
  fullName?: string | null;
  /** Как в ответе API (snake_case). */
  full_name?: string | null;
  /** Сводное отображаемое имя после входа (дублирует приоритет ФИО). */
  name: string | null;
  email: string | null;
};

export type AuthSnapshot = {
  token: string;
  role: Role;
  status: UserStatus;
  blockedReason?: string | null;
  allowedSections: ApiSection[];
  /** Имя или email для шапки; если нет в storage — после следующего входа подтянется из API. */
  userLabel?: string | null;
  user?: AuthStoredUser | null;
};
