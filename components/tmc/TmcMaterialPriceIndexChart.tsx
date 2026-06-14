"use client";

import { useMemo, useState } from "react";
import { AnalyticsLegendItem, AnalyticsLegendList } from "@/components/construction/AnalyticsLegendItem";
import { segmentedControlTabClass } from "@/components/marketing/marketingSegmentedControlClasses";
import type {
  TmcMaterialPriceHeatmapDataset,
  TmcPriceHeatmapCell,
  TmcPriceHeatmapCellTone,
  TmcPriceHeatmapMaterialRow,
  TmcPriceIndexSortMode,
} from "@/lib/tmcPresentationAnalytics";

const COLORS = {
  empty: "rgba(15,23,42,0.92)",
  neutral: "rgba(71,85,105,0.62)",
  up: "#ef4444",
  down: "#22c55e",
  border: "rgba(148,163,184,0.18)",
  header: "#94a3b8",
} as const;

type HoveredCell = {
  row: TmcPriceHeatmapMaterialRow;
  cell: TmcPriceHeatmapCell;
  monthLabel: string;
};

function roundPriceRub(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

function priceRub(value: number): string {
  const rounded = roundPriceRub(value);
  const formatted = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(rounded);
  if (rounded < 0) return `−${formatted} ₽`;
  return `${formatted} ₽`;
}

function pctSigned1(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  const formatted = Math.abs(rounded).toFixed(1).replace(".", ",");
  if (rounded < 0) return `−${formatted}%`;
  if (rounded > 0) return `+${formatted}%`;
  return `${formatted}%`;
}

function heatmapCellBackground(tone: TmcPriceHeatmapCellTone, changePct: number | null): string {
  if (tone === "empty") return COLORS.empty;
  if (tone === "neutral") return COLORS.neutral;
  const intensity = Math.min(1, Math.abs(changePct ?? 0) / 25);
  if (tone === "up") {
    const alpha = 0.32 + intensity * 0.52;
    return `rgba(239,68,68,${alpha})`;
  }
  const alpha = 0.32 + intensity * 0.52;
  return `rgba(34,197,94,${alpha})`;
}

function heatmapCellTextColor(tone: TmcPriceHeatmapCellTone): string {
  if (tone === "empty") return "#64748b";
  return "#f8fafc";
}

function formatHeatmapCellPrice(price: number): string {
  const rounded = roundPriceRub(price);
  const compact = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(rounded);
  return `${compact} ₽`;
}

function PriceIndexKpiPanel({ dataset }: { dataset: TmcMaterialPriceHeatmapDataset }) {
  return (
    <div className="grid min-w-[250px] shrink-0 gap-3 text-right text-sm sm:max-w-xs">
      <div className="rounded-xl border border-slate-600/40 bg-slate-900/35 px-4 py-3">
        <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
          Максимальный рост
        </div>
        <div className="mt-1 font-semibold tabular-nums text-red-400">
          {dataset.maxGrowthPct > 0 ? pctSigned1(dataset.maxGrowthPct) : "—"}
        </div>
        <div className="mt-1 text-xs text-slate-400">Материал: {dataset.maxGrowthMaterial}</div>
        {dataset.maxGrowthMonthsLabel ? (
          <div className="text-xs text-slate-500">Месяцы: {dataset.maxGrowthMonthsLabel}</div>
        ) : null}
      </div>
      <div className="rounded-xl border border-slate-600/40 bg-slate-900/35 px-4 py-3">
        <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
          Максимальное снижение
        </div>
        <div className="mt-1 font-semibold tabular-nums text-emerald-400">
          {dataset.maxDeclinePct < 0 ? pctSigned1(dataset.maxDeclinePct) : "—"}
        </div>
        <div className="mt-1 text-xs text-slate-400">Материал: {dataset.maxDeclineMaterial}</div>
        {dataset.maxDeclineMonthsLabel ? (
          <div className="text-xs text-slate-500">Месяцы: {dataset.maxDeclineMonthsLabel}</div>
        ) : null}
      </div>
    </div>
  );
}

function PriceIndexSortSwitcher({
  sortMode,
  onSortModeChange,
}: {
  sortMode: TmcPriceIndexSortMode;
  onSortModeChange: (mode: TmcPriceIndexSortMode) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-slate-600/70 bg-slate-900/50 p-0.5">
      {(
        [
          { id: "byAlphabet" as const, label: "По алфавиту" },
          { id: "byChange" as const, label: "По изменению цены" },
        ] as const
      ).map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSortModeChange(item.id)}
          className={segmentedControlTabClass(sortMode === item.id, "dark")}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function HeatmapTooltip({ hovered }: { hovered: HoveredCell | null }) {
  if (!hovered) return null;
  const { row, cell, monthLabel } = hovered;

  return (
    <div className="rounded-lg border border-slate-600/50 bg-[#1e293b] px-3 py-2.5 text-xs shadow-lg">
      <div className="font-semibold text-slate-100">Материал: {row.name}</div>
      <div className="mt-2 space-y-2 tabular-nums text-slate-300">
        <div>
          <div className="text-slate-400">Месяц:</div>
          <div className="font-medium text-slate-100">{monthLabel}</div>
        </div>
        <div>
          <div className="text-slate-400">Цена:</div>
          <div className="font-medium text-slate-100">{priceRub(cell.price ?? 0)}</div>
        </div>
        {cell.previousMonthPrice != null && cell.previousMonthPrice > 0 ? (
          <div>
            <div className="text-slate-400">Предыдущий месяц:</div>
            <div className="font-medium text-slate-100">{priceRub(cell.previousMonthPrice)}</div>
          </div>
        ) : null}
        {cell.changePct != null ? (
          <div>
            <div className="text-slate-400">Изменение:</div>
            <div className="font-medium text-slate-100">{pctSigned1(cell.changePct)}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PriceHeatmapLegend() {
  return (
    <div className="mt-3 border-t border-slate-700/40 pt-3">
      <AnalyticsLegendList>
        <AnalyticsLegendItem markerColor={COLORS.up} label="Рост цены к пред. поставке" />
        <AnalyticsLegendItem markerColor={COLORS.down} label="Снижение цены к пред. поставке" />
        <AnalyticsLegendItem markerColor={COLORS.neutral} label="Без существенного изменения" />
        <AnalyticsLegendItem markerColor={COLORS.empty} label="Нет данных" />
      </AnalyticsLegendList>
    </div>
  );
}

export function TmcMaterialPriceHeatmapView({
  dataset,
  sortMode,
  onSortModeChange,
}: {
  dataset: TmcMaterialPriceHeatmapDataset;
  sortMode: TmcPriceIndexSortMode;
  onSortModeChange: (mode: TmcPriceIndexSortMode) => void;
}) {
  const [hovered, setHovered] = useState<HoveredCell | null>(null);

  const monthLabelByKey = useMemo(
    () => new Map(dataset.months.map((month) => [month.monthKey, month.labelLong])),
    [dataset.months],
  );

  const gridTemplateColumns = useMemo(
    () => `minmax(148px, 1.4fr) repeat(${dataset.months.length}, minmax(72px, 1fr))`,
    [dataset.months.length],
  );

  if (dataset.months.length === 0 || dataset.rows.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <PriceIndexSortSwitcher sortMode={sortMode} onSortModeChange={onSortModeChange} />
        <div className="flex h-[320px] items-center justify-center text-sm text-slate-500">
          Недостаточно фактических поставок для матрицы цен
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <PriceIndexSortSwitcher sortMode={sortMode} onSortModeChange={onSortModeChange} />
        <PriceIndexKpiPanel dataset={dataset} />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-slate-700/35 bg-slate-900/20">
          <div
            className="grid min-w-max text-xs"
            style={{ gridTemplateColumns }}
          >
            <div className="sticky left-0 z-20 border-b border-r border-slate-700/40 bg-slate-900/95 px-3 py-2 font-medium text-slate-400">
              ТМЦ
            </div>
            {dataset.months.map((month) => (
              <div
                key={month.monthKey}
                className="border-b border-slate-700/40 px-1 py-2 text-center font-medium text-slate-400"
              >
                <span
                  className="inline-block whitespace-nowrap"
                  style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                >
                  {month.label}
                </span>
              </div>
            ))}

            {dataset.rows.map((row) => (
              <HeatmapMaterialRow
                key={row.name}
                row={row}
                months={dataset.months}
                monthLabelByKey={monthLabelByKey}
                onHover={setHovered}
              />
            ))}
          </div>
        </div>

        <div className="w-full shrink-0 lg:w-[240px]">
          <HeatmapTooltip hovered={hovered} />
        </div>
      </div>

      <PriceHeatmapLegend />
    </div>
  );
}

function HeatmapMaterialRow({
  row,
  months,
  monthLabelByKey,
  onHover,
}: {
  row: TmcPriceHeatmapMaterialRow;
  months: TmcMaterialPriceHeatmapDataset["months"];
  monthLabelByKey: Map<string, string>;
  onHover: (value: HoveredCell | null) => void;
}) {
  const cellByMonth = useMemo(
    () => new Map(row.cells.map((cell) => [cell.monthKey, cell])),
    [row.cells],
  );

  return (
    <>
      <div
        className="sticky left-0 z-10 border-b border-r border-slate-700/30 bg-slate-900/95 px-3 py-2 font-medium text-slate-200"
        title={row.name}
      >
        {row.shortLabel}
      </div>
      {months.map((month) => {
        const cell = cellByMonth.get(month.monthKey) ?? {
          monthKey: month.monthKey,
          price: null,
          changePct: null,
          tone: "empty" as const,
          previousMonthKey: null,
          previousMonthPrice: null,
        };

        return (
          <button
            key={`${row.name}-${month.monthKey}`}
            type="button"
            className="flex min-h-[52px] items-center justify-center border-b border-slate-700/25 px-1 py-2 text-center transition-opacity hover:opacity-90"
            style={{
              background: heatmapCellBackground(cell.tone, cell.changePct),
              color: heatmapCellTextColor(cell.tone),
            }}
            onMouseEnter={() =>
              onHover({
                row,
                cell,
                monthLabel: monthLabelByKey.get(month.monthKey) ?? month.labelLong,
              })
            }
            onMouseLeave={() => onHover(null)}
            onFocus={() =>
              onHover({
                row,
                cell,
                monthLabel: monthLabelByKey.get(month.monthKey) ?? month.labelLong,
              })
            }
            onBlur={() => onHover(null)}
          >
            <span className="tabular-nums leading-tight [font-size:clamp(9px,1.6vw,11px)]">
              {cell.price != null && cell.price > 0 ? formatHeatmapCellPrice(cell.price) : "−"}
            </span>
          </button>
        );
      })}
    </>
  );
}

/** @deprecated Используйте TmcMaterialPriceHeatmapView */
export const TmcMaterialPriceIndexChartView = TmcMaterialPriceHeatmapView;
