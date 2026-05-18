"use client";

import { useMemo } from "react";

import {
  compareForObjectParamsTable,
  DEALS_LABEL_EM_DASH,
  dealEffectiveObjectPriceRub,
  dealObjectPricePerM2,
  dealRowShowsPricePerM2Cell,
  dealRowsIncludeApartmentsForPricePerM2Table,
  type DealSegmentKey,
  type NormalizedDealRow,
} from "@/components/marketing/DealsSection";
import {
  formatDealObjectAreaSqm,
  formatDealObjectTotalCompactRub,
  formatDealPricePerM2CompactRub,
} from "@/lib/dealsObjectParamsAnalyticsFormat";
import { numFmt } from "@/lib/salesPlanChartFormat";

const PREVIEW_CAP = 500;

const KPI_SURFACE =
  "relative overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white via-white to-slate-50/80 px-4 py-3 shadow-[0_8px_30px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-sm";

const TABLE_SHELL =
  "overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-[0_8px_32px_rgba(15,23,42,0.045)] backdrop-blur-[6px]";

const TYPE_COL: Record<DealSegmentKey, string> = {
  apartment: "Квартира",
  parking: "Машино-место",
  storage: "Кладовая",
  commercial: "Коммерция",
  other: "Прочее",
};

type Props = {
  rows: NormalizedDealRow[];
  loading: boolean;
};

function computeSummary(rows: NormalizedDealRow[]) {
  let totalRub = 0;
  let areaSum = 0;
  let areaCount = 0;
  for (const r of rows) {
    const price = dealEffectiveObjectPriceRub(r);
    if (Number.isFinite(price) && price > 0) totalRub += price;
    const a = r.objectParams.areaTotal;
    if (a != null && Number.isFinite(a) && a > 0) {
      areaSum += a;
      areaCount += 1;
    }
  }
  let aptWeightedNum = 0;
  let aptWeightedDen = 0;
  for (const r of rows) {
    if (r.dealType !== "apartment") continue;
    const price = dealEffectiveObjectPriceRub(r);
    const a = r.objectParams.areaTotal;
    if (price > 0 && a != null && Number.isFinite(a) && a > 0) {
      aptWeightedNum += price;
      aptWeightedDen += a;
    }
  }
  const avgArea = areaCount > 0 ? areaSum / areaCount : null;
  const avgRubPerM2 = aptWeightedDen > 0 ? Math.round(aptWeightedNum / aptWeightedDen) : null;
  return { totalRub, avgArea, avgRubPerM2 };
}

export function MarketingDealsObjectParamsPanel({ rows, loading }: Props) {
  const sorted = useMemo(() => [...rows].sort(compareForObjectParamsTable), [rows]);
  const slice = useMemo(() => sorted.slice(0, PREVIEW_CAP), [sorted]);
  const summary = useMemo(() => computeSummary(rows), [rows]);
  const showRubPerM2Column = useMemo(() => dealRowsIncludeApartmentsForPricePerM2Table(rows), [rows]);
  const tableColCount = showRubPerM2Column ? 5 : 4;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Параметры объектов</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
          Стоимость и площадь из выгрузки. Колонка ₽/м² — только для квартир в срезе. Средняя цена за м² считается по квартирам с
          площадью и суммой. Учитывается тот же фильтр «Объект / ЖК», что и у предпросмотра.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className={KPI_SURFACE}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500/80">Общая стоимость</div>
          <div className="mt-2 text-lg font-bold tabular-nums tracking-tight text-slate-900 sm:text-xl">
            {rows.length === 0 ? DEALS_LABEL_EM_DASH : formatDealObjectTotalCompactRub(summary.totalRub)}
          </div>
        </div>
        <div className={KPI_SURFACE}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500/80">Средняя площадь</div>
          <div className="mt-2 text-lg font-bold tabular-nums tracking-tight text-slate-900 sm:text-xl">
            {summary.avgArea == null ? DEALS_LABEL_EM_DASH : formatDealObjectAreaSqm(summary.avgArea)}
          </div>
        </div>
        <div className={KPI_SURFACE}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500/80">Средняя цена за м²</div>
          <div className="mt-2 text-lg font-bold tabular-nums tracking-tight text-slate-900 sm:text-xl">
            {formatDealPricePerM2CompactRub(summary.avgRubPerM2)}
          </div>
          <p className="mt-1 text-[9px] leading-snug text-slate-500/85">Только квартиры, взвешенная по площади.</p>
        </div>
      </div>

      <div className={TABLE_SHELL}>
        <div className="max-h-[min(520px,70vh)] w-full overflow-auto">
          <table className={`${showRubPerM2Column ? "min-w-[560px]" : "min-w-[480px]"} w-full border-collapse text-left text-[13px]`}>
            <thead className="sticky top-0 z-[1] border-b border-slate-200/90 bg-slate-50/95 backdrop-blur-sm">
              <tr className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                <th className="min-w-0 px-4 py-3 pr-2 font-medium">Объект</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Тип</th>
                <th className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums">Площадь</th>
                <th className="whitespace-nowrap px-4 py-3 pl-2 text-right font-medium tabular-nums">Стоимость</th>
                {showRubPerM2Column ? (
                  <th className="w-[6.5rem] whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">₽/м²</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={tableColCount} className="px-4 py-12 text-center text-sm text-slate-500">
                    Загрузка…
                  </td>
                </tr>
              ) : slice.length === 0 ? (
                <tr>
                  <td colSpan={tableColCount} className="px-4 py-12 text-center text-sm text-slate-600">
                    Нет строк в этом срезе — измените фильтры или загрузите JSON.
                  </td>
                </tr>
              ) : (
                slice.map((row, idx) => {
                  const price = dealEffectiveObjectPriceRub(row);
                  const priceDisp = price > 0 ? formatDealObjectTotalCompactRub(price) : DEALS_LABEL_EM_DASH;
                  const area = row.objectParams.areaTotal;
                  const ppm2 = dealObjectPricePerM2(price > 0 ? price : null, area);
                  const objectId = row.objectUnitLabel ?? row.objectLabel ?? DEALS_LABEL_EM_DASH;
                  const typeCol = TYPE_COL[row.dealType] ?? row.dealTypeLabel;
                  const showCell = showRubPerM2Column && dealRowShowsPricePerM2Cell(row);
                  return (
                    <tr
                      key={`${row.dealDate}-${objectId}-${idx}`}
                      className="border-b border-slate-100/90 transition-colors hover:bg-slate-50/80"
                    >
                      <td className="min-w-0 max-w-[14rem] px-4 py-2.5 pr-2 font-medium text-slate-900 sm:max-w-[18rem]">
                        <span className="block truncate tabular-nums">{objectId}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">{typeCol}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-800">{formatDealObjectAreaSqm(area)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 pl-2 text-right tabular-nums text-slate-900">{priceDisp}</td>
                      {showRubPerM2Column ? (
                        <td className="w-[6.5rem] whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-slate-800">
                          {showCell ? formatDealPricePerM2CompactRub(ppm2) : null}
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!loading && sorted.length > slice.length ? (
        <p className="text-[11px] text-slate-500">
          Показано {numFmt.format(slice.length)} из {numFmt.format(sorted.length)} строк в фильтре.
        </p>
      ) : null}
    </div>
  );
}
