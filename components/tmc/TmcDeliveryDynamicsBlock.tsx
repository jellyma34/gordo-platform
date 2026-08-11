"use client";

import { useEffect, useMemo, useState } from "react";
import type { TMCItem } from "@/lib/tmcData";
import {
  buildTmcDeliveryDynamicsAnalytics,
  logTmcDeliveryDynamicsDiagnostic,
} from "@/lib/tmcDeliveryDynamicsAnalytics";
import { segmentedControlTabClass } from "@/components/marketing/marketingSegmentedControlClasses";
import { TmcDeliveryMonthlyDynamicsChart } from "@/components/tmc/TmcDeliveryMonthlyDynamicsChart";
import type { TmcPlanFactValueMode } from "@/components/tmc/TmcPlanFactTodayReferenceLine";
import { TmcDeliveryDeviationCompactPanel } from "@/components/tmc/TmcDeliveryDeviationCompactPanel";

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

export function TmcDeliveryDynamicsBlock({
  items,
  reportDate = new Date(),
  analytics: analyticsProp,
}: {
  items: TMCItem[];
  reportDate?: Date;
  analytics?: ReturnType<typeof buildTmcDeliveryDynamicsAnalytics>;
}) {
  const [valueMode, setValueMode] = useState<TmcPlanFactValueMode>("monthly");

  const analytics = useMemo(
    () => analyticsProp ?? buildTmcDeliveryDynamicsAnalytics(items, reportDate),
    [analyticsProp, items, reportDate],
  );

  useEffect(() => {
    logTmcDeliveryDynamicsDiagnostic(items, reportDate);
  }, [items, reportDate]);

  const hasMonthly = analytics.monthlyRows.length > 0;

  return (
    <div
      className="rounded-2xl border border-slate-600/45 bg-[#1e293b] p-6 shadow-[0_18px_48px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/[0.06]"
      data-pdf-chart-block
      data-pdf-section-title="Динамика поставок"
      style={{
        background:
          "linear-gradient(160deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.95) 100%)",
      }}
    >
      <h3 className="text-lg font-semibold text-slate-50">Динамика поставок</h3>

      <div className="mt-3 grid grid-cols-1 items-start gap-4 lg:gap-5 xl:grid-cols-[minmax(0,1fr)_250px]">
        <div className="flex min-w-0 flex-col">
          <div className="mb-1 flex flex-wrap items-center justify-end gap-2">
            <div className="inline-flex rounded-lg border border-slate-600/70 bg-slate-900/50 p-0.5">
              {(
                [
                  { id: "monthly" as const, label: "Помесячно" },
                  { id: "cumulative" as const, label: "Нарастающим итогом" },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setValueMode(m.id)}
                  className={segmentedControlTabClass(valueMode === m.id, "dark")}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <ChartInlineLegend />
          <div className="mt-1.5 h-[380px] w-full min-w-0">
            {hasMonthly ? (
              <TmcDeliveryMonthlyDynamicsChart
                rows={analytics.monthlyRows}
                reportDate={reportDate}
                mode={valueMode}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Недостаточно дат поставок для построения динамики
              </div>
            )}
          </div>
        </div>

        <div className="w-full shrink-0 xl:w-[250px]">
          <TmcDeliveryDeviationCompactPanel
            segments={analytics.deviationSegments}
            factDeliveredCount={analytics.factDeliveredCount}
            onTimeOverallPct={analytics.onTimeOverallPct}
            eligibleCount={analytics.units.length}
          />
        </div>
      </div>
    </div>
  );
}
