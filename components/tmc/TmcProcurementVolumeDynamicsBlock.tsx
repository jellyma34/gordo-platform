"use client";

import { useMemo } from "react";
import { PlanFactGprDynamicsChartPanel } from "@/components/construction/PlanFactGprDynamicsChartPanel";
import type { PlanFactWorkTypeChartModel } from "@/lib/planFactWorkTypeTimeline";
import type { TMCItem } from "@/lib/tmcData";
import {
  buildTmcSupplyVolumeChartBundle,
  formatTmcSupplyVolumeTooltip,
} from "@/lib/tmcProcurementVolumeTimeline";

export function TmcProcurementVolumeDynamicsBlock({
  items,
  todayIso,
}: {
  items: TMCItem[];
  todayIso: string;
}) {
  const chartBundle = useMemo(
    () => buildTmcSupplyVolumeChartBundle(items, todayIso),
    [items, todayIso],
  );

  const buildTooltip = useMemo(() => {
    if (!chartBundle) return undefined;
    const metaByIndex = chartBundle.rowMeta;
    return (_model: PlanFactWorkTypeChartModel, index: number) => {
      const meta = metaByIndex[index];
      if (!meta) return "";
      return formatTmcSupplyVolumeTooltip(meta);
    };
  }, [chartBundle]);

  return (
    <div
      className="rounded-2xl border border-slate-600/45 bg-[#1e293b] p-6 shadow-[0_18px_48px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/[0.06]"
      data-pdf-chart-block
      data-pdf-section-title="Динамика объемов поставок, %"
      style={{
        background:
          "linear-gradient(160deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.95) 100%)",
      }}
    >
      <h3 className="text-lg font-semibold uppercase tracking-wide text-slate-50">
        Динамика объемов поставок, %
      </h3>

      <div className="mt-4 min-w-0">
        {chartBundle ? (
          <PlanFactGprDynamicsChartPanel
            model={chartBundle.model}
            buildTooltip={buildTooltip}
            planLegendLabel="План поставки"
            factLegendLabel="Факт поставки"
            showZeroFactPercent
          />
        ) : (
          <div className="flex h-40 items-center justify-center text-sm text-slate-500">
            Недостаточно данных ТМЦ для построения динамики объёмов поставок
          </div>
        )}
      </div>
    </div>
  );
}
