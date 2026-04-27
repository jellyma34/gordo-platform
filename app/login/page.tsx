"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import {
  AUTH_LOGIN_MOCK_ENABLED,
  BLOCKED_LOGIN_MESSAGE,
  firstConstructionPath,
  INVALID_LOGIN_MESSAGE,
  loginRequest,
} from "@/lib/auth";

import { useAuth } from "@/components/auth/AuthProvider";

function safeNext(path: string | null): string | null {
  if (!path || !path.startsWith("/")) return null;
  if (path.startsWith("//")) return null;
  return path;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setSession } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);

      const snap = await loginRequest(email.trim(), password);
      setSession(snap);
      const next = safeNext(searchParams.get("next"));
      if (next) {
        router.replace(next);
        return;
      }
      if (snap.role === "admin" || snap.role === "manager") {
        router.replace("/");
        return;
      }
      router.replace(firstConstructionPath(snap.role, snap.allowedSections, "presentation"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === INVALID_LOGIN_MESSAGE) {
        setError(INVALID_LOGIN_MESSAGE);
      } else if (msg.startsWith(BLOCKED_LOGIN_MESSAGE)) {
        setError(msg);
      } else {
        setError("Ошибка соединения с сервером");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center p-6">
      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Вход</h1>
        <p className="mt-2 text-sm text-slate-600">Введите email и пароль.</p>
        {AUTH_LOGIN_MOCK_ENABLED ? (
          <p className="mt-1 text-xs text-amber-800">
            Режим без API: при любой непустой паре email/пароль будет выполнен локальный вход (для разработки).
          </p>
        ) : null}

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              Пароль
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "Вход…" : "Войти"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-500">Загрузка…</div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
