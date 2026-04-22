export type Role = "admin" | "manager" | "employee";
export type ApiSection = "gpr" | "tenders" | "materials";
export type UserStatus = "active" | "blocked";

export type AuthSnapshot = {
  token: string;
  role: Role;
  status: UserStatus;
  blockedReason?: string | null;
  allowedSections: ApiSection[];
  /** Имя или email для шапки; если нет в storage — после следующего входа подтянется из API. */
  userLabel?: string | null;
};
