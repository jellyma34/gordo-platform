"use client";

import { useEffect } from "react";
import Link from "next/link";

import { ExplainMetricBlock, ExplainMetricDescriptionGrid } from "@/components/marketing/ExplainMetricBlock";
import { KpiDashboard } from "@/components/marketing/SalesPlanKpiDashboard";
import type { ConstructionExplainSection } from "@/lib/buildConstructionPresentationExplain";

const card =
  "rounded-2xl border border-slate-600/50 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-950/95 p-4 shadow-lg ring-1 ring-white/5 sm:p-5";

type Props = {
  partLabel: string;
  sections: ConstructionExplainSection[];
  /** Возврат в рабочий раздел строительства (редактирование). */
  backHref: string;
  /** Прокрутка к блоку gpr | structure | tenders | tmc. */
  focusSection?: string | null;
};

export function ConstructionWorkExplainView({
  partLabel,
  sections,
  backHref,
  focusSection = null,
}: Props) {
  useEffect(() => {
    if (!focusSection) return;
    const id = `construction-explain-${focusSection}`;
    window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [focusSection]);

  return (
    <main className="min-h-screen bg-[#0f172a] px-3 py-6 text-slate-100 sm:px-4 md:px-6">
      <div className="mx-auto w-full max-w-[900px] space-y-6">
        <header className={card}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-sky-300/90">
                Строительство → Рабочий разбор
              </p>
              <h1 className="mt-1 text-xl font-bold text-white sm:text-2xl">Разбор показателей</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
                Формулы, интерпретация и диагностика по ГПР, тендерам и ТМЦ для выбранной части проекта. Слайды презентации
                содержат только KPI и графики; подробный анализ — здесь, в рабочем режиме.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Link
                href={backHref}
                className="rounded-lg border border-slate-600 bg-slate-950/80 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
              >
                ← К строительству
              </Link>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            <span className="text-slate-300">Часть проекта: {partLabel}</span>
          </p>
        </header>

        {sections.map((sec) => (
          <section key={sec.id} id={`construction-explain-${sec.id}`} className={card}>
            <h2 className="text-base font-bold uppercase tracking-wide text-white sm:text-lg">{sec.title}</h2>

            <div className="mt-4">
              <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Описание</h3>
              <div className="mt-2">
                <ExplainMetricDescriptionGrid description={sec.description} />
              </div>
            </div>

            <div className="mt-5">
              <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Ключевые показатели</h3>
              <div className="mt-2">
                <KpiDashboard mode="explain" items={sec.kpiItems} />
              </div>
            </div>

            <div className="mt-5">
              <ExplainMetricBlock content={sec.formulas} />
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
