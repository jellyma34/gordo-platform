import type { ApiSection, AuthSnapshot, AuthStoredUser, Role } from "./authTypes";
import { API_SECTION_KEYS, isApiSection } from "./authTypes";

const STORAGE_TOKEN = "gordo_token";
const STORAGE_ROLE = "gordo_role";
const STORAGE_SECTIONS = "gordo_allowed_sections";
const STORAGE_USER_LABEL = "gordo_user_label";
const STORAGE_USER = "gordo_user";

function optTrim(rec: Record<string, unknown>, key: string): string | null {
  const v = rec[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function parseStoredUser(raw: string | null): AuthStoredUser | null {
  if (!raw?.trim()) return null;
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return null;
    const rec = o as Record<string, unknown>;
    const fio = optTrim(rec, "fio");
    const fullName = optTrim(rec, "fullName");
    const full_name = optTrim(rec, "full_name");
    const name = optTrim(rec, "name");
    const email = optTrim(rec, "email");
    if (!fio && !fullName && !full_name && !name && !email) return null;
    return { fio, fullName, full_name, name, email };
  } catch {
    return null;
  }
}

function legacyUserFromLabel(userLabel: string): AuthStoredUser {
  const t = userLabel.trim();
  if (t.includes("@")) {
    return { fio: null, fullName: null, full_name: null, name: null, email: t };
  }
  return { fio: null, fullName: null, full_name: null, name: t, email: null };
}

export function parseAllowedSections(raw: string | null): ApiSection[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    const known = v.filter((x): x is ApiSection => typeof x === "string" && isApiSection(x));
    return [...known].sort((a, b) => API_SECTION_KEYS.indexOf(a) - API_SECTION_KEYS.indexOf(b));
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
    const userLabelRaw = window.localStorage.getItem(STORAGE_USER_LABEL);
    const userLabel = userLabelRaw && userLabelRaw.trim() !== "" ? userLabelRaw.trim() : null;
    let user = parseStoredUser(window.localStorage.getItem(STORAGE_USER));
    if (!user && userLabel) user = legacyUserFromLabel(userLabel);
    return {
      token,
      role: roleRaw,
      status: "active",
      blockedReason: null,
      allowedSections: parseAllowedSections(sectionsRaw),
      userLabel,
      user,
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
  user?: AuthStoredUser | null,
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
  if (
    user &&
    (user.fio || user.fullName || user.full_name || user.name || user.email)
  ) {
    window.localStorage.setItem(
      STORAGE_USER,
      JSON.stringify({
        fio: user.fio ?? null,
        fullName: user.fullName ?? null,
        full_name: user.full_name ?? null,
        name: user.name,
        email: user.email,
      }),
    );
  } else {
    window.localStorage.removeItem(STORAGE_USER);
  }
}

export function clearAuth(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_TOKEN);
  window.localStorage.removeItem(STORAGE_ROLE);
  window.localStorage.removeItem(STORAGE_SECTIONS);
  window.localStorage.removeItem(STORAGE_USER_LABEL);
  window.localStorage.removeItem(STORAGE_USER);
}
