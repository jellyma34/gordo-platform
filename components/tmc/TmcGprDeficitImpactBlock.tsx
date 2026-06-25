"use client";

import { TmcGprImpactChart } from "@/components/tmc/TmcGprImpactChart";
import { PDF_CHART_META_ATTR } from "@/lib/pdf/constructionPdfConstants";
import type { TmcGprImpactMaterialRow } from "@/lib/tmcGprImpact";

export function TmcGprDeficitImpactBlock({
  rows,
  pdfMeta,
}: {
  rows: TmcGprImpactMaterialRow[];
  pdfMeta: string;
}) {
  return (
    <div
      className="rounded-2xl border border-slate-600/45 bg-[#1e293b] p-6 shadow-[0_18px_48px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/[0.06]"
      data-pdf-chart-block
      data-pdf-section-title="Влияние дефицита ТМЦ на выполнение ГПР"
      {...{ [PDF_CHART_META_ATTR]: pdfMeta }}
      style={{
        background:
          "linear-gradient(160deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.95) 100%)",
      }}
    >
      <h3 className="text-lg font-semibold uppercase tracking-wide text-slate-50">
        Влияние дефицита ТМЦ на выполнение ГПР
      </h3>
      <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-400">
        Материалы с незакрытой потребностью и связанные этапы ГПР. Сортировка по impactScore —
        наверху материалы, которые с наибольшей вероятностью тормозят выполнение работ.
      </p>
      <div className="mt-4">
        <TmcGprImpactChart rows={rows} />
      </div>
    </div>
  );
}
