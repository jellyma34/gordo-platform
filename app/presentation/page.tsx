"use client";

import { useEffect, useMemo } from "react";

import { useAppMode } from "@/components/mode/ModeProvider";
import { HubSectionCards } from "@/components/presentation/HubSectionCards";
import { ProjectStatus } from "@/components/presentation/ProjectStatus";
import { getHomeDashboardSnapshot, getHubNavStatusTone } from "@/lib/homeDashboardSnapshot";

export default function PresentationEntry() {
  const { setMode } = useAppMode();
  const snapshot = useMemo(() => getHomeDashboardSnapshot(), []);

  useEffect(() => {
    setMode("presentation");
  }, [setMode]);

  const blocks = [
    {
      title: "Строительство",
      description: "ГПР, тендеры, ТМЦ — аналитика и график работ.",
      href: "/presentation/construction",
      status: getHubNavStatusTone(snapshot, "construction"),
    },
    {
      title: "Маркетинг",
      description: "План продаж, воронка и рассрочка по ДДУ.",
      href: "/presentation/marketing/sales-plan",
      status: getHubNavStatusTone(snapshot, "marketing"),
    },
    {
      title: "Финансы",
      description: "Экономика и показатели (модуль в разработке).",
      href: "/presentation/finance",
      status: getHubNavStatusTone(snapshot, "finance"),
    },
  ] as const;

  return (
    <div className="presentation-hub">
      <div className="presentation-content">
        <h1 className="presentation-subtitle text-lg font-medium leading-relaxed text-slate-300 md:text-xl">
          Сводка проекта на сегодня
        </h1>
        <p className="mb-4 text-center text-sm text-slate-400">Нажмите на блок, чтобы открыть раздел</p>

        <ProjectStatus project={snapshot.project} className="w-full" />

        <div className="mt-4 w-full">
          <HubSectionCards blocks={blocks} gridClassName="presentation-section-grid" />
        </div>
      </div>
    </div>
  );
}
