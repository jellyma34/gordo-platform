"use client";

import { LogOut, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { resolveHeaderDisplayName } from "@/lib/auth";

import { useAuth } from "./AuthProvider";

export type UserMenuTheme = "light" | "dark" | "marketing";

export function UserMenu({
  className,
  theme = "light",
}: {
  className?: string;
  theme?: UserMenuTheme;
}) {
  const { canAccessAdminPanel, logout, user, sessionUserLabel } = useAuth();
  const router = useRouter();

  const displayName = resolveHeaderDisplayName(user, sessionUserLabel);
  const roleLine = user?.role === "admin" ? "Администратор" : "";

  const ghostControl =
    "cursor-pointer border-0 bg-transparent shadow-none outline-none transition-opacity hover:opacity-70";

  const userShell =
    theme === "dark"
      ? `flex items-center gap-2 rounded-lg px-1 py-1.5 text-left text-slate-200 no-underline ${ghostControl}`
      : theme === "marketing"
        ? `flex items-center gap-2 rounded-lg px-1 py-1.5 text-left text-slate-800 no-underline ${ghostControl}`
        : `flex items-center gap-2 rounded-lg px-1 py-1.5 text-left text-gray-900 no-underline ${ghostControl}`;

  const logoutShell =
    theme === "dark"
      ? `flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm text-slate-200 ${ghostControl}`
      : theme === "marketing"
        ? `flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm text-slate-800 ${ghostControl}`
        : `flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm text-gray-900 ${ghostControl}`;

  const roleSub = theme === "dark" ? "text-slate-400" : theme === "marketing" ? "text-slate-500" : "text-gray-500";

  const chipInner = (
    <>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-transparent" aria-hidden>
        <User className="h-4 w-4 text-current" strokeWidth={2} />
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-0.5 leading-tight">
        <span className="truncate text-sm font-normal">{displayName}</span>
        {roleLine ? <span className={`truncate text-xs ${roleSub}`}>{roleLine}</span> : null}
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
        <LogOut className="h-4 w-4 shrink-0 text-current" strokeWidth={2} aria-hidden />
        <span>Выйти</span>
      </button>
    </div>
  );
}
