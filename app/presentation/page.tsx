"use client";

import { useEffect } from "react";

import { useAppMode } from "@/components/mode/ModeProvider";
import { HubSectionCards } from "@/components/presentation/HubSectionCards";

export default function PresentationEntry() {
  const { setMode } = useAppMode();

  useEffect(() => {
    setMode("presentation");
  }, [setMode]);

  const blocks = [
    {
      title: "Строительство",
      description: "ГПР, тендеры и закупка ТМЦ — аналитика и контроль графика работ.",
      href: "/presentation/construction",
    },
    {
      title: "Маркетинг",
      description: "План продаж, динамика, воронка и рассрочка по ДДУ — в едином стиле с разделом «Строительство».",
      href: "/presentation/marketing/sales-plan",
      marketingPlanEntry: true,
    },
    {
      title: "Финансы",
      description: "Экономика проекта и финансовые показатели (в разработке).",
      href: "/presentation/finance",
    },
  ] as const;

  return (
    <div className="presentation-hub">
      <div className="presentation-content">
        <h1 className="presentation-subtitle text-lg font-medium leading-relaxed text-slate-300 md:text-xl">
          Выберите раздел для анализа
        </h1>

        <HubSectionCards blocks={blocks} gridClassName="presentation-section-grid" />
      </div>
    </div>
  );
}
