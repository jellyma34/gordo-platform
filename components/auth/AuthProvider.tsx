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
  type AuthSnapshot,
  clearAuth,
  loadStoredAuth,
  type Role,
  saveAuth,
} from "@/lib/auth";

type AuthContextValue = {
  hydrated: boolean;
  token: string | null;
  role: Role | null;
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
  const [allowedSections, setAllowedSections] = useState<ApiSection[]>([]);

  useEffect(() => {
    const s = loadStoredAuth();
    if (s) {
      setToken(s.token);
      setRole(s.role);
      setAllowedSections(s.allowedSections);
    }
    setHydrated(true);
  }, []);

  const setSession = useCallback((s: AuthSnapshot) => {
    saveAuth(s.token, s.role, s.allowedSections);
    setToken(s.token);
    setRole(s.role);
    setAllowedSections(s.allowedSections);
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setToken(null);
    setRole(null);
    setAllowedSections([]);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      hydrated,
      token,
      role,
      allowedSections,
      isAdmin: role === "admin",
      isManager: role === "manager",
      hasFullConstructionAccess: role === "admin" || role === "manager",
      canAccessAdminPanel: role === "admin" || role === "manager",
      setSession,
      logout,
    }),
    [hydrated, token, role, allowedSections, setSession, logout],
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
