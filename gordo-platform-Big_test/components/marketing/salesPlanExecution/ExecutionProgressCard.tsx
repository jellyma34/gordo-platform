"use client";

import {
  apartmentKpiExecutionHue,
  apartmentKpiProgressWidthPercent,
} from "@/lib/apartmentsPlanPeriodKpi";
import { dec1Fmt } from "@/lib/salesPlanChartFormat";

const HUE_FILL: Record<ReturnType<typeof apartmentKpiExecutionHue>, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-rose-500",
};

const HUE_TRACK: Record<ReturnType<typeof apartmentKpiExecutionHue>, string> = {
  green: "bg-emerald-100/90",
  yellow: "bg-amber-100/90",
  red: "bg-rose-100/90",
};

const HUE_TEXT: Record<ReturnType<typeof apartmentKpiExecutionHue>, string> = {
  green: "text-emerald-700",
  yellow: "text-amber-800",
  red: "text-rose-700",
};

type Props = {
  percentComplete: number | null;
  presDark: boolean;
  presentation: boolean;
};

export function ExecutionProgressCard({ percentComplete, presDark, presentation }: Props) {
  const pct = percentComplete ?? 0;
  const hue = apartmentKpiExecutionHue(pct);
  const width = apartmentKpiProgressWidthPercent(pct);
  const label =
    percentComplete != null && Number.isFinite(percentComplete) ? `${dec1Fmt.format(percentComplete)}%` : "—";

  if (presDark) {
    return (
      <div className="rounded-xl border border-white/10 bg-slate-900/35 px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
            Выполнение плана
          </span>
          <span className="text-lg font-bold tabular-nums text-slate-100">{label}</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-700/80">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              hue === "green" ? "bg-emerald-400" : hue === "yellow" ? "bg-amber-400" : "bg-rose-400"
            }`}
            style={{ width: `${width}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        presentation
          ? "rounded-xl border border-black/[0.05] bg-white/70 px-4 py-3.5 shadow-[0_2px_12px_rgba(15,23,42,0.04)] sm:px-5"
          : "rounded-xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm sm:px-5"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          Выполнение плана
        </span>
        <span className={`text-lg font-bold tabular-nums ${HUE_TEXT[hue]}`}>{label}</span>
      </div>
      <div className={`mt-3 h-2 overflow-hidden rounded-full ${HUE_TRACK[hue]}`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${HUE_FILL[hue]}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
