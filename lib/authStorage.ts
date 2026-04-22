import type { ApiSection, AuthSnapshot, Role } from "./authTypes";

const STORAGE_TOKEN = "gordo_token";
const STORAGE_ROLE = "gordo_role";
const STORAGE_SECTIONS = "gordo_allowed_sections";
const STORAGE_USER_LABEL = "gordo_user_label";

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
    const userLabel = window.localStorage.getItem(STORAGE_USER_LABEL);
    return {
      token,
      role: roleRaw,
      status: "active",
      blockedReason: null,
      allowedSections: parseAllowedSections(sectionsRaw),
      userLabel: userLabel && userLabel.trim() !== "" ? userLabel : null,
    };
  } catch {
    return null;
  }
}

export function saveAuth(
  token: string,
  role: Role,
  allowedSections: ApiSection[],
  userLabel?: string | null,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_TOKEN, token);
  window.localStorage.setItem(STORAGE_ROLE, role);
  window.localStorage.setItem(STORAGE_SECTIONS, JSON.stringify(allowedSections));
  if (userLabel != null && String(userLabel).trim() !== "") {
    window.localStorage.setItem(STORAGE_USER_LABEL, String(userLabel).trim());
  } else {
    window.localStorage.removeItem(STORAGE_USER_LABEL);
  }
}

export function clearAuth(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_TOKEN);
  window.localStorage.removeItem(STORAGE_ROLE);
  window.localStorage.removeItem(STORAGE_SECTIONS);
  window.localStorage.removeItem(STORAGE_USER_LABEL);
}
