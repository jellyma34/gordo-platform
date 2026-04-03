"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { firstConstructionPath } from "@/lib/auth";
import { useAuth } from "@/components/auth/AuthProvider";
import { useAppMode } from "@/components/mode/ModeProvider";

export default function HomePage() {
  const router = useRouter();
  const { setMode } = useAppMode();
  const { hydrated, role, allowedSections } = useAuth();

  useEffect(() => {
    if (!hydrated || !role) return;
    if (role === "employee") {
      router.replace(firstConstructionPath(role, allowedSections, "presentation"));
    }
  }, [hydrated, role, allowedSections, router]);

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Выбор режима работы</h1>
        <p className="mt-2 text-sm text-slate-600">
          Сначала выберите режим, затем переходите к разделам платформы.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            setMode("presentation");
            router.push("/presentation");
          }}
          className="rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-slate-300 hover:shadow"
        >
          <h2 className="text-lg font-semibold text-slate-900">Презентационный режим</h2>
          <p className="mt-2 text-sm text-slate-600">
            BI-дашборд, минимум шумов, фокус на KPI и управленческой аналитике.
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setMode("edit");
            router.push("/edit");
          }}
          className="rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-slate-300 hover:shadow"
        >
          <h2 className="text-lg font-semibold text-slate-900">Режим редактирования</h2>
          <p className="mt-2 text-sm text-slate-600">
            Работа с данными: inline-редактирование, сохранение/отмена, детализация.
          </p>
        </button>
      </section>
    </main>
  );
}
