"use client";

import { useEffect, useMemo } from "react";

import { useAppMode } from "@/components/mode/ModeProvider";
import { HubSectionCards } from "@/components/presentation/HubSectionCards";
import { getHomeDashboardSnapshot, getHubNavStatusTone } from "@/lib/homeDashboardSnapshot";

export default function EditEntry() {
  const { setMode } = useAppMode();
  const snapshot = useMemo(() => getHomeDashboardSnapshot(), []);

  useEffect(() => {
    setMode("edit");
  }, [setMode]);

  const blocks = [
    {
      title: "Строительство",
      description: "ГПР, тендеры и ТМЦ — контроль стройки.",
      href: "/edit/construction",
      status: getHubNavStatusTone(snapshot, "construction"),
    },
    {
      title: "Маркетинг",
      description: "План продаж, сценарии и таблица план/факт — в рабочем режиме.",
      href: "/marketing/sales-plan/work",
      status: getHubNavStatusTone(snapshot, "marketing"),
    },
    {
      title: "Экономика и финансы",
      description: "Показатели и экономика проекта (модуль в разработке).",
      href: "/edit/finance",
      status: getHubNavStatusTone(snapshot, "finance"),
    },
  ] as const;

  return (
    <main className="mx-auto min-h-[60vh] max-w-7xl space-y-3 bg-slate-50 p-3 md:p-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <h1 className="text-2xl font-semibold text-slate-900">Редактирование</h1>
        <p className="mt-1 text-sm text-slate-600">Сводка проекта на сегодня</p>
        <p className="mt-0.5 text-sm text-slate-500">Нажмите на блок, чтобы перейти в раздел.</p>
      </div>

      <HubSectionCards blocks={blocks} gridClassName="hub-section-grid" />
    </main>
  );
}
