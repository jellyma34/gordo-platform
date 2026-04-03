"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { AdminNav } from "@/components/admin/AdminNav";
import { useAuth } from "@/components/auth/AuthProvider";
import { UserMenu } from "@/components/auth/UserMenu";
import { EditLayout } from "@/components/EditLayout";

export default function AdminPage() {
  const router = useRouter();
  const { hydrated, token, canAccessAdminPanel } = useAuth();

  useEffect(() => {
    if (!hydrated) return;
    if (!token) return;
    if (!canAccessAdminPanel) router.replace("/");
  }, [hydrated, token, canAccessAdminPanel, router]);

  if (!hydrated || !token || !canAccessAdminPanel) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        Проверка доступа…
      </div>
    );
  }

  return (
    <main className="mx-auto min-h-[60vh] max-w-7xl space-y-4 bg-slate-50 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="text-sm font-medium text-slate-600 hover:text-slate-900">
          ← Главная
        </Link>
        <UserMenu />
      </div>

      <AdminNav />

      <EditLayout
        title="Админ-панель"
        subtitle="Управление доступом и пользователями."
        showActions={false}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/admin/users"
            className="inline-flex rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow"
          >
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Пользователи</h2>
              <p className="mt-1 text-sm text-slate-600">
                Список, создание, роли, разделы, сброс пароля и удаление.
              </p>
              <span className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                Открыть
              </span>
            </div>
          </Link>
          <Link
            href="/admin/history"
            className="inline-flex rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow"
          >
            <div>
              <h2 className="text-lg font-semibold text-slate-900">История</h2>
              <p className="mt-1 text-sm text-slate-600">
                Журнал действий: кто и что менял в системе.
              </p>
              <span className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                Открыть
              </span>
            </div>
          </Link>
        </div>
      </EditLayout>
    </main>
  );
}
