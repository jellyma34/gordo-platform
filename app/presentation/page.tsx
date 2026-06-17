"use client";

import { useEffect, useMemo } from "react";

import { useAppMode } from "@/components/mode/ModeProvider";
import { HubReportingPeriodSelector } from "@/components/presentation/HubReportingPeriodSelector";
import { HubSectionCards } from "@/components/presentation/HubSectionCards";
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
      <div className="presentation-hub-bg" aria-hidden />
      <div className="presentation-content">
        <header className="presentation-hero">
          <h1 className="presentation-hero-title">
            Сводка проекта{" "}
            <span className="presentation-hero-accent">на сегодня</span>
          </h1>
          <HubReportingPeriodSelector />
        </header>

        <div className="presentation-cards-wrap">
          <HubSectionCards
            blocks={blocks}
            gridClassName="presentation-section-grid"
            variant="presentation"
          />
        </div>
      </div>
    </div>
  );
}
