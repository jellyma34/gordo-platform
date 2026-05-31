"use client";

import type { CSSProperties, ReactNode } from "react";

import {
  GPR_DEP_KPI_THRESHOLD_DAYS,
  GPR_KPI_AVG_DEVIATION_EXPLAIN_PREFIX,
  GPR_KPI_THRESHOLD_EXPLAIN,
  GPR_PROGRESS_DELTA_CRITICAL_PP,
  GPR_SCHEDULE_DEVIATION_SIGN_NOTE,
} from "@/lib/gprConstructionDeviationConstants";
import { formatGprScheduleDeviationDisplayDays } from "@/lib/gprUtils";

export {
  GPR_DEP_KPI_THRESHOLD_DAYS,
  GPR_PROGRESS_DELTA_CRITICAL_PP,
  GPR_SCHEDULE_DEVIATION_SIGN_NOTE,
  GPR_KPI_THRESHOLD_EXPLAIN as KPI_THRESHOLD_EXPLAIN,
};

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

/** Отображение отклонения готовности (п.п. по прогрессу на дату отчёта). */
export function formatGprProgressDeltaPp(d: number | null): string {
  if (d === null) return "—";
  if (d === 0) return "0 п.п.";
  const sign = d > 0 ? "+" : "";
  return `${sign}${d} п.п.`;
}

/** Подсветка отклонения по сроку (дни): «−» — отставание (красный), «+» — опережение (зелёный). */
export function gprScheduleDeviationListStyle(d: number | null): CSSProperties {
  return gprProgressDeviationListStyle(d);
}

export function gprProgressDeviationListStyle(d: number | null): CSSProperties {
  if (d === null) {
    return { color: "#94a3b8", fontWeight: 700 };
  }
  if (d < 0) {
    return { color: "#ef4444", fontWeight: 700, textShadow: "0 0 8px rgba(239,68,68,0.35)" };
  }
  return { color: "#22c55e", fontWeight: 700, textShadow: "0 0 8px rgba(34,197,94,0.35)" };
}

/** Цвет маркера этапа в списке (подготовка — красный, строительство — зелёный). */
export function stageDeviationDotColor(groupKey: string): string {
  if (groupKey === "prep") return "#ef4444";
  if (groupKey === "build") return "#22c55e";
  if (groupKey === "network") return "#f59e0b";
  return "#94a3b8";
}

/** @deprecated Используйте gprScheduleDeviationListStyle — единая интерпретация знака. */
export function deviationListValueStyle(d: number | null): CSSProperties {
  return gprScheduleDeviationListStyle(d);
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

export function buildAvgDeviationExplanation(
  rows: { deviationDays: number | null; stageTitle?: string }[],
  avgDev: number | null,
  /** DD.MM — дата, на которую сравниваем факт с планом. */
  reportDateLabel: string = "",
): string {
  const datePhrase = reportDateLabel ? ` на ${reportDateLabel}` : "";
  const parts = rows
    .map((r) => r.deviationDays)
    .filter((d): d is number => d !== null)
    .map((d) => formatGprScheduleDeviationDisplayDays(d));
  const signNote = GPR_SCHEDULE_DEVIATION_SIGN_NOTE;
  if (parts.length === 0) {
    return `${GPR_KPI_AVG_DEVIATION_EXPLAIN_PREFIX}${datePhrase}. ${signNote} Данных по этапам пока нет.`;
  }
  const joined = parts.join(" и ");
  const itog = avgDev === null ? "—" : formatGprScheduleDeviationDisplayDays(avgDev, { decimals: true });
  return `${GPR_KPI_AVG_DEVIATION_EXPLAIN_PREFIX}${datePhrase}: (${joined}) → итог ${itog}. ${signNote}`;
}

export function GprDepKpiAccordionCard({
  cardKey,
  isOpen,
  onToggle,
  shellClassName,
  iconSlot,
  children,
  explanation,
  interactive = true,
}: {
  cardKey: GprDepKpiExplainKey;
  isOpen: boolean;
  onToggle: (k: GprDepKpiExplainKey) => void;
  shellClassName: string;
  iconSlot: ReactNode;
  children: ReactNode;
  explanation: string;
  /** В режиме презентации — только значения KPI, без раскрытия с формулами и интерпретацией. */
  interactive?: boolean;
}) {
  const body = (
    <div className="flex flex-1 items-center gap-3 px-3 py-3">
      {iconSlot}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );

  if (!interactive) {
    return (
      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col rounded-xl text-left ${shellClassName}`}
        aria-hidden
      >
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`flex min-h-0 min-w-0 flex-1 flex-col rounded-xl text-left transition hover:brightness-[1.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 ${shellClassName}`}
      aria-expanded={isOpen}
      onClick={() => onToggle(cardKey)}
    >
      {body}
      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-out ${
          isOpen ? "max-h-64 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <p
          className="mt-2 border-t border-white/[0.06] px-3 pb-3 pt-2.5 text-[12px] leading-relaxed whitespace-pre-line sm:text-[13px]"
          style={{ color: "#A3B3C7" }}
        >
          {explanation}
        </p>
      </div>
    </button>
  );
}
