"use client";

import { useEffect } from "react";

import { useAppMode } from "@/components/mode/ModeProvider";
import { HubSectionCards } from "@/components/presentation/HubSectionCards";

export default function EditEntry() {
  const { setMode } = useAppMode();

  useEffect(() => {
    setMode("edit");
  }, [setMode]);

  const blocks = [
    {
      title: "Строительство",
      description: "ГПР, закупка услуг (тендеры) и закупка ТМЦ.",
      href: "/edit/construction",
    },
    {
      title: "Маркетинг",
      description:
        "Рабочий режим плана: сценарии, таблица план/факт по категориям и журнал изменений; отчёт и рассрочка — в разделе «Маркетинг».",
      href: "/marketing/sales-plan/work",
      marketingPlanEntry: true,
    },
    {
      title: "Экономика и финансы",
      description: "Финансовые показатели и экономика проекта (в разработке).",
      href: "/edit/finance",
    },
  ] as const;

  return (
    <main className="mx-auto min-h-[60vh] max-w-7xl space-y-6 bg-slate-50 p-4 md:p-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Редактирование</h1>
        <p className="mt-2 text-sm text-slate-600">Выберите блок платформы.</p>
      </div>

      <HubSectionCards blocks={blocks} gridClassName="hub-section-grid" />
    </main>
  );
}
