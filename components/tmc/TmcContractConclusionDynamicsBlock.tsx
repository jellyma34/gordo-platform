"use client";

import { useEffect, useMemo } from "react";
import type { TMCItem } from "@/lib/tmcData";
import {
  buildTmcContractConclusionAnalytics,
  logTmcContractConclusionDiagnostic,
} from "@/lib/tmcContractDynamicsAnalytics";
import { TmcContractMonthlyDynamicsChart } from "@/components/tmc/TmcContractMonthlyDynamicsChart";
import { TmcContractDeviationCompactPanel } from "@/components/tmc/TmcContractDeviationCompactPanel";

function ChartInlineLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-slate-400">
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-block h-0 w-5 border-t-2 border-dashed border-slate-400"
          aria-hidden
        />
        План
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-0.5 w-5 rounded-full bg-emerald-500" aria-hidden />
        Факт
      </span>
    </div>
  );
}

export function TmcContractConclusionDynamicsBlock({
  items,
  reportDate = new Date(),
}: {
  items: TMCItem[];
  reportDate?: Date;
}) {
  const analytics = useMemo(
    () => buildTmcContractConclusionAnalytics(items, reportDate),
    [items, reportDate],
  );

  useEffect(() => {
    logTmcContractConclusionDiagnostic(items, reportDate);
  }, [items, reportDate]);

  const hasMonthly = analytics.monthlyRows.length > 0;

  return (
    <div
      className="rounded-2xl border border-slate-600/45 bg-[#1e293b] p-6 shadow-[0_18px_48px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/[0.06]"
      data-pdf-chart-block
      data-pdf-section-title="Динамика заключения договоров"
      style={{
        background:
          "linear-gradient(160deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.95) 100%)",
      }}
    >
      <div>
        <h3 className="text-lg font-semibold text-slate-50">Динамика заключения договоров</h3>
        <p className="mt-1 text-sm text-slate-400">
          Своевременность контрактования по импортированным данным ТМЦ
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:gap-5 xl:grid-cols-[minmax(0,1fr)_250px]">
        <div className="flex min-w-0 flex-col">
          <ChartInlineLegend />
          <div className="mt-1.5 h-[380px] w-full min-w-0">
            {hasMonthly ? (
              <TmcContractMonthlyDynamicsChart rows={analytics.monthlyRows} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Недостаточно дат договоров для построения динамики
              </div>
            )}
          </div>
        </div>

        <div className="w-full shrink-0 xl:w-[250px]">
          <h4 className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
            Распределение отклонений
          </h4>
          <TmcContractDeviationCompactPanel
            segments={analytics.deviationSegments}
            factConcludedCount={analytics.factConcludedCount}
            onTimeOverallPct={analytics.onTimeOverallPct}
          />
        </div>
      </div>
    </div>
  );
}
