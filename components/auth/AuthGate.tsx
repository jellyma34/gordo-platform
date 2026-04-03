"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { firstConstructionPath } from "@/lib/auth";

import { useAuth } from "./AuthProvider";

export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { hydrated, token, role, allowedSections } = useAuth();

  const isLogin = pathname === "/login";

  useEffect(() => {
    if (!hydrated) return;

    if (isLogin) {
      if (token && role) {
        if (role === "admin" || role === "manager") router.replace("/");
        else router.replace(firstConstructionPath(role, allowedSections, "presentation"));
      }
      return;
    }

    if (!token) {
      const next = encodeURIComponent(pathname || "/");
      router.replace(`/login?next=${next}`);
    }
  }, [hydrated, isLogin, token, role, pathname, router]);

  if (!hydrated) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        Загрузка…
      </div>
    );
  }

  if (!isLogin && !token) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        Перенаправление на вход…
      </div>
    );
  }

  if (isLogin && token) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        Перенаправление…
      </div>
    );
  }

  return <>{children}</>;
}
