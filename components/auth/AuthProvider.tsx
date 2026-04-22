"use client";

import {
  createContext,
  useCallback,
  useContext,
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
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [userProfile, setUserProfile] = useState<AuthStoredUser | null>(null);
  const [allowedSections, setAllowedSections] = useState<ApiSection[]>([]);

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
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setToken(null);
    setRole(null);
    setUserProfile(null);
    setAllowedSections([]);
  }, []);

  useEffect(() => {
    const s = loadStoredAuth();
    if (s) {
      setToken(s.token);
      setRole(s.role);
      setUserProfile(s.user ?? null);
      setAllowedSections(s.allowedSections);
    }
    setHydrated(true);
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
    }),
    [hydrated, token, role, userProfile, allowedSections, setSession, logout],
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
