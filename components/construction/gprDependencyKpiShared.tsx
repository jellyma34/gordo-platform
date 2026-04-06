"use client";

import type { CSSProperties, ReactNode } from "react";

/** Порог по сроку (дн.) для KPI и заливки план/факт на графиках зависимостей. */
export const GPR_DEP_KPI_THRESHOLD_DAYS = 14;

export function formatDeviationDays(d: number | null): string {
  if (d === null) return "—";
  if (d === 0) return "0 дн.";
  const sign = d > 0 ? "+" : "";
  return `${sign}${d} дн.`;
}

export function formatAvgDeviationDays(avg: number): string {
  const r = Math.round(avg);
  const sign = r > 0 ? "+" : "";
  return `${sign}${r} дн.`;
}

/** Цвет маркера этапа в списке (подготовка — красный, строительство — зелёный). */
export function stageDeviationDotColor(groupKey: string): string {
  if (groupKey === "prep") return "#ef4444";
  if (groupKey === "build") return "#22c55e";
  if (groupKey === "network") return "#f59e0b";
  return "#94a3b8";
}

/** Подсветка числа отклонения по знаку. */
export function deviationListValueStyle(d: number | null): CSSProperties {
  if (d === null) {
    return { color: "#94a3b8", fontWeight: 700 };
  }
  if (d > 0) {
    return {
      color: "#ef4444",
      fontWeight: 700,
      textShadow: "0 0 8px rgba(239,68,68,0.35)",
    };
  }
  return {
    color: "#22c55e",
    fontWeight: 700,
    textShadow: "0 0 8px rgba(34,197,94,0.35)",
  };
}

export function KpiMiniIconRuler() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path strokeLinecap="round" d="M4 18h16M6 18V9M10 18v-5M14 18V7M18 18v-3" />
    </svg>
  );
}

export function KpiMiniIconChart() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 19h16M7 15l3-4 4 6 5-10" />
    </svg>
  );
}

export function KpiMiniIconAlert() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4M12 17h.01M10.3 4.2h3.4L21 18H3L10.3 4.2z" />
    </svg>
  );
}

export type GprDepKpiExplainKey = "threshold" | "avg" | "risk";

export const KPI_THRESHOLD_EXPLAIN =
  "Порог 14 дней — это допустимое отклонение. Задачи с превышением считаются критическими.";

export function buildAvgDeviationExplanation(
  rows: { deviationDays: number | null }[],
  avgDev: number | null,
): string {
  const parts = rows
    .map((r) => r.deviationDays)
    .filter((d): d is number => d !== null)
    .map((d) => `${d > 0 ? "+" : ""}${d} дн.`);
  if (parts.length === 0) {
    return "Рассчитывается как среднее арифметическое отклонений по сроку по этапам, когда появятся данные.";
  }
  const joined = parts.join(" и ");
  const itog = avgDev === null ? "—" : formatAvgDeviationDays(avgDev);
  return `Рассчитывается как среднее значение отклонений по этапам: (${joined}) → итог: ${itog}`;
}

export function GprDepKpiAccordionCard({
  cardKey,
  isOpen,
  onToggle,
  shellClassName,
  iconSlot,
  children,
  explanation,
}: {
  cardKey: GprDepKpiExplainKey;
  isOpen: boolean;
  onToggle: (k: GprDepKpiExplainKey) => void;
  shellClassName: string;
  iconSlot: ReactNode;
  children: ReactNode;
  explanation: string;
}) {
  return (
    <button
      type="button"
      className={`flex min-h-0 min-w-0 flex-1 flex-col rounded-xl text-left transition hover:brightness-[1.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 ${shellClassName}`}
      aria-expanded={isOpen}
      onClick={() => onToggle(cardKey)}
    >
      <div className="flex flex-1 items-center gap-3 px-3 py-3">
        {iconSlot}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-out ${
          isOpen ? "max-h-48 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <p
          className="mt-2 border-t border-white/[0.06] px-3 pb-3 pt-2.5 text-[12px] leading-relaxed sm:text-[13px]"
          style={{ color: "#A3B3C7" }}
        >
          {explanation}
        </p>
      </div>
    </button>
  );
}
