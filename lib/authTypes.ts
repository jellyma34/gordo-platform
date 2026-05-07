export type Role = "admin" | "manager" | "employee";

/** Коды разделов в API и в `allowed_sections` (порядок — для отображения в админке). */
export const API_SECTION_KEYS = ["gpr", "tenders", "materials", "marketing"] as const;
export type ApiSection = (typeof API_SECTION_KEYS)[number];

export const API_SECTION_LABELS: Record<ApiSection, string> = {
  gpr: "ГПР",
  tenders: "Тендеры",
  materials: "ТМЦ",
  marketing: "Маркетинг",
};

export function isApiSection(x: string): x is ApiSection {
  return (API_SECTION_KEYS as readonly string[]).includes(x);
}

export function formatAllowedSectionsRu(sections: ApiSection[]): string {
  if (sections.length === 0) return "—";
  const sorted = [...sections].sort(
    (a, b) => API_SECTION_KEYS.indexOf(a) - API_SECTION_KEYS.indexOf(b),
  );
  return sorted.map((s) => API_SECTION_LABELS[s] ?? s).join(", ");
}

export function sectionsRecordAll(value: boolean): Record<ApiSection, boolean> {
  return Object.fromEntries(API_SECTION_KEYS.map((k) => [k, value])) as Record<ApiSection, boolean>;
}

export function sectionsRecordFromAllowed(allowed: Iterable<ApiSection>): Record<ApiSection, boolean> {
  const set = new Set(allowed);
  return Object.fromEntries(API_SECTION_KEYS.map((k) => [k, set.has(k)])) as Record<ApiSection, boolean>;
}

export function defaultNewEmployeeSections(): Record<ApiSection, boolean> {
  const r = sectionsRecordAll(false);
  r.gpr = true;
  return r;
}

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
