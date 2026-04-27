"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { firstConstructionPath } from "@/lib/auth";

import { useAuth } from "./AuthProvider";

const HYDRATION_WARN_MS = 12_000;

export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { hydrated, token, role, allowedSections } = useAuth();
  const [hydrationTimedOut, setHydrationTimedOut] = useState(false);

  const isLogin = pathname === "/login";

  useEffect(() => {
    if (hydrated) return;
    const id = window.setTimeout(() => {
      console.error(
        "AuthGate: данные сессии не загрузились за %s мс (проверьте сеть и кэш .next)",
        HYDRATION_WARN_MS,
      );
      setHydrationTimedOut(true);
    }, HYDRATION_WARN_MS);
    return () => window.clearTimeout(id);
  }, [hydrated]);

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
    if (hydrationTimedOut) {
      return (
        <div className="mx-auto max-w-md p-6 text-center text-sm text-slate-800">
          <p className="font-medium">Ошибка загрузки данных</p>
          <p className="mt-2 text-slate-600">
            Сессия не инициализировалась. Удалите кэш сборки и перезапустите dev-сервер:{" "}
            <code className="rounded bg-slate-100 px-1">rm -rf .next</code> затем{" "}
            <code className="rounded bg-slate-100 px-1">npm run dev</code>.
          </p>
        </div>
      );
    }
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-4 text-sm text-slate-500">
        <span>Загрузка…</span>
        <span className="max-w-md text-center text-xs text-slate-400">
          Если экран не меняется и в консоли 404 по JS-чанкам — остановите сервер, удалите папку{" "}
          <code className="rounded bg-slate-100 px-1 text-slate-600">.next</code> и снова выполните{" "}
          <code className="rounded bg-slate-100 px-1 text-slate-600">npm run dev</code>.
        </span>
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
