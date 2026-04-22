"use client";

import { LogOut, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { Role } from "@/lib/authTypes";
import { useAuth } from "./AuthProvider";

function roleSubtitle(role: Role | null): string {
  if (role === "admin") return "Администратор";
  if (role === "manager") return "Руководитель";
  return "Сотрудник";
}

export type UserMenuTheme = "light" | "dark" | "marketing";

export function UserMenu({
  className,
  theme = "light",
}: {
  className?: string;
  theme?: UserMenuTheme;
}) {
  const { canAccessAdminPanel, logout, userLabel, role } = useAuth();
  const router = useRouter();
  const userName = (userLabel?.trim() || "Пользователь") as string;

  const userShell =
    theme === "dark"
      ? "flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-slate-200 transition-colors hover:bg-white/10"
      : theme === "marketing"
        ? "flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2 text-left text-slate-900 transition-colors hover:bg-slate-100/90"
        : "flex items-center gap-3 rounded-xl border border-gray-200 bg-white/60 px-3 py-2 text-left text-gray-900 transition-colors hover:bg-white/80";

  const logoutShell =
    theme === "dark"
      ? "flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-white/10"
      : theme === "marketing"
        ? "flex items-center gap-2 rounded-xl bg-transparent px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
        : "flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50";

  const avatarBg = theme === "dark" ? "bg-white/10" : "bg-blue-100";
  const avatarIcon = theme === "dark" ? "text-sky-300" : "text-blue-600";
  const roleSub = theme === "dark" ? "text-slate-400" : theme === "marketing" ? "text-slate-500" : "text-gray-500";
  const logoutIcon = theme === "dark" ? "text-slate-400" : "text-slate-500";

  const chipInner = (
    <>
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${avatarBg}`}
        aria-hidden
      >
        <User className={`h-4 w-4 ${avatarIcon}`} strokeWidth={2} />
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-0.5 leading-tight">
        <span className="truncate text-sm font-medium">{userName}</span>
        <span className={`truncate text-xs ${roleSub}`}>{roleSubtitle(role)}</span>
      </div>
    </>
  );

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      {canAccessAdminPanel ? (
        <Link href="/admin" className={userShell}>
          {chipInner}
        </Link>
      ) : (
        <div className={userShell}>{chipInner}</div>
      )}
      <button
        type="button"
        onClick={() => {
          logout();
          router.replace("/login");
        }}
        className={logoutShell}
      >
        <LogOut className={`h-4 w-4 shrink-0 ${logoutIcon}`} strokeWidth={2} aria-hidden />
        <span>Выйти</span>
      </button>
    </div>
  );
}
