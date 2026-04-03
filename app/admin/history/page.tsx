"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AdminNav } from "@/components/admin/AdminNav";
import { EditLayout } from "@/components/EditLayout";
import { useAuth } from "@/components/auth/AuthProvider";
import { UserMenu } from "@/components/auth/UserMenu";
import { type ActivityLogRow, listActivityLogs } from "@/lib/auth";

function formatLogDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function actionRu(action: string): string {
  if (action === "create") return "Создание";
  if (action === "update") return "Изменение";
  if (action === "delete") return "Удаление";
  return action;
}

function entityRu(entity: string): string {
  if (entity === "gpr") return "ГПР";
  if (entity === "tenders") return "Тендеры";
  if (entity === "materials") return "ТМЦ";
  if (entity === "users") return "Пользователи";
  return entity;
}

function roleRu(role: string): string {
  if (role === "admin") return "Администратор";
  if (role === "manager") return "Руководитель";
  if (role === "employee") return "Сотрудник";
  return role;
}

function DetailsCell({ details }: { details: unknown }) {
  if (details === null || details === undefined) {
    return <span className="text-slate-400">—</span>;
  }
  let text: string;
  try {
    text = JSON.stringify(details, null, 2);
  } catch {
    text = String(details);
  }
  return (
    <pre className="max-h-40 max-w-[min(28rem,60vw)] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-2 font-mono text-xs text-slate-800">
      {text}
    </pre>
  );
}

export default function AdminHistoryPage() {
  const router = useRouter();
  const { hydrated, token, canAccessAdminPanel } = useAuth();
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [rows, setRows] = useState<ActivityLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
      const data = await listActivityLogs(token, page, pageSize);
      setRows(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить историю");
    } finally {
      setLoading(false);
    }
  }, [token, page]);

  useEffect(() => {
    if (!hydrated) return;
    if (!token) return;
    if (!canAccessAdminPanel) {
      router.replace("/");
      return;
    }
    void load();
  }, [hydrated, token, canAccessAdminPanel, router, load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

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
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Главная
          </Link>
        </div>
        <UserMenu />
      </div>

      <AdminNav />

      <EditLayout
        title="История действий"
        subtitle="Кто и когда менял данные в разделах и учётных записях."
        showActions={false}
      >
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            Всего записей: <span className="font-medium text-slate-900">{total}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={loading || page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Назад
            </button>
            <span className="text-sm text-slate-600">
              Страница {page} из {totalPages}
            </span>
            <button
              type="button"
              disabled={loading || page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Вперёд
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[960px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="whitespace-nowrap px-3 py-3 font-semibold text-slate-800">Дата</th>
                <th className="px-3 py-3 font-semibold text-slate-800">Пользователь</th>
                <th className="whitespace-nowrap px-3 py-3 font-semibold text-slate-800">Роль</th>
                <th className="whitespace-nowrap px-3 py-3 font-semibold text-slate-800">Действие</th>
                <th className="whitespace-nowrap px-3 py-3 font-semibold text-slate-800">Раздел</th>
                <th className="px-3 py-3 font-semibold text-slate-800">Детали</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Загрузка…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Записей пока нет
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 align-top last:border-0">
                    <td className="whitespace-nowrap px-3 py-3 text-slate-800">{formatLogDate(r.created_at)}</td>
                    <td className="max-w-[200px] break-all px-3 py-3 text-slate-900">{r.user_email}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-800">{roleRu(r.role)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-800">{actionRu(r.action)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-800">{entityRu(r.entity)}</td>
                    <td className="px-3 py-3">
                      <DetailsCell details={r.details} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </EditLayout>
    </main>
  );
}
