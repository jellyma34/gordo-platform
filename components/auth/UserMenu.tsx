"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "./AuthProvider";

export function UserMenu({ className }: { className?: string }) {
  const { canAccessAdminPanel, logout } = useAuth();
  const router = useRouter();

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      {canAccessAdminPanel && (
        <Link
          href="/admin"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Админ
        </Link>
      )}
      <button
        type="button"
        onClick={() => {
          logout();
          router.replace("/login");
        }}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Выйти
      </button>
    </div>
  );
}
