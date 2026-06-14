"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  type ApiSection,
  AUTH_EXPIRED_EVENT,
  type AuthSnapshot,
  clearAuth,
  fetchAuthMe,
  loadStoredAuth,
  type Role,
  saveAuth,
} from "@/lib/auth";
import type { AuthStoredUser } from "@/lib/authTypes";

type AuthContextUser = {
  fio: string | null;
  fullName: string | null;
  full_name: string | null;
  name: string | null;
  email: string | null;
  role: Role;
};

type AuthContextValue = {
  hydrated: boolean;
  token: string | null;
  role: Role | null;
  /** Профиль сессии для UI (null без входа). */
  user: AuthContextUser | null;
  allowedSections: ApiSection[];
  isAdmin: boolean;
  isManager: boolean;
  /** Админ или руководитель: полный доступ к разделам строительства. */
  hasFullConstructionAccess: boolean;
  /** Админ или руководитель: вход в админ-панель пользователей. */
  canAccessAdminPanel: boolean;
  setSession: (s: AuthSnapshot) => void;
  logout: () => void;
  /** Метка из storage (ФИО/email после логина); fallback для шапки, если объект профиля ещё пустой. */
  sessionUserLabel: string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [userProfile, setUserProfile] = useState<AuthStoredUser | null>(null);
  const [allowedSections, setAllowedSections] = useState<ApiSection[]>([]);
  const [sessionUserLabel, setSessionUserLabel] = useState<string | null>(null);

  const setSession = useCallback((s: AuthSnapshot) => {
    const label = s.userLabel?.trim();
    const profileFromLabel = label
      ? label.includes("@")
        ? ({
            fio: null,
            fullName: null,
            full_name: null,
            name: null,
            email: label,
          } satisfies AuthStoredUser)
        : ({
            fio: null,
            fullName: null,
            full_name: null,
            name: label,
            email: null,
          } satisfies AuthStoredUser)
      : null;
    const profile = s.user ?? profileFromLabel;
    saveAuth(s.token, s.role, s.allowedSections, s.userLabel ?? null, profile);
    setToken(s.token);
    setRole(s.role);
    setUserProfile(profile);
    setAllowedSections(s.allowedSections);
    setSessionUserLabel(s.userLabel?.trim() || null);
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setToken(null);
    setRole(null);
    setUserProfile(null);
    setAllowedSections([]);
    setSessionUserLabel(null);
  }, []);

  // Раньше обычного useEffect, чтобы снять вечный «Загрузка…» в AuthGate сразу после коммита на клиенте
  useLayoutEffect(() => {
    let cancelled = false;
    const s = loadStoredAuth();
    if (s) {
      setToken(s.token);
      setRole(s.role);
      setUserProfile(s.user ?? null);
      setAllowedSections(s.allowedSections);
      setSessionUserLabel(s.userLabel?.trim() || null);
      if (s.token) {
        void fetchAuthMe(s.token)
          .then((fresh) => {
            if (cancelled || !fresh) return;
            setRole(fresh.role);
            setUserProfile(fresh.user ?? null);
            setAllowedSections(fresh.allowedSections);
            setSessionUserLabel(fresh.userLabel?.trim() || null);
            saveAuth(
              fresh.token,
              fresh.role,
              fresh.allowedSections,
              fresh.userLabel ?? null,
              fresh.user ?? null,
            );
          })
          .catch(() => {});
      }
    }
    setHydrated(true);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onSessionExpired = () => {
      logout();
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onSessionExpired);
  }, [logout]);

  const value = useMemo<AuthContextValue>(
    () => ({
      hydrated,
      token,
      role,
      user:
        token && role
          ? {
              fio: userProfile?.fio?.trim() || null,
              fullName: userProfile?.fullName?.trim() || null,
              full_name: userProfile?.full_name?.trim() || null,
              name: userProfile?.name?.trim() || null,
              email: userProfile?.email?.trim() || null,
              role,
            }
          : null,
      allowedSections,
      isAdmin: role === "admin",
      isManager: role === "manager",
      hasFullConstructionAccess: role === "admin" || role === "manager",
      canAccessAdminPanel: role === "admin" || role === "manager",
      setSession,
      logout,
      sessionUserLabel,
    }),
    [hydrated, token, role, userProfile, allowedSections, sessionUserLabel, setSession, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
