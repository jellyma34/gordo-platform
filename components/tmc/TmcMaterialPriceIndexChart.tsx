"use client";

import { useMemo } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Line, LineChart, Tooltip, YAxis } from "@/components/charting/rechartsClient";
import type {
  TmcMaterialPriceIndexLineDataset,
  TmcMaterialPriceIndexLineSeries,
} from "@/lib/tmcPresentationAnalytics";

const COLORS = {
  card: "#1e293b",
  sparkline: "#60a5fa",
} as const;

const SPARKLINE_WIDTH = 148;
const SPARKLINE_HEIGHT = 40;
const SPARKLINE_STROKE = 2;
const SPARKLINE_DOT_R = 3;

type SparkPoint = {
  label: string;
  indexPct: number;
  priceRub: number;
};

function pctSigned1(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  const formatted = Math.abs(rounded).toFixed(1).replace(".", ",");
  if (rounded < 0) return `−${formatted}%`;
  if (rounded > 0) return `+${formatted}%`;
  return `${formatted}%`;
}

function formatIndexValue(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-6) {
    return `${Math.round(rounded)}%`;
  }
  return `${rounded.toFixed(1).replace(".", ",")}%`;
}

function formatPriceRub(value: number): string {
  const rounded = Math.round(value);
  const formatted = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(
    Math.abs(rounded),
  );
  if (rounded < 0) return `−${formatted} ₽`;
  return `${formatted} ₽`;
}

function getPlottableSparkPoints(series: TmcMaterialPriceIndexLineSeries): SparkPoint[] {
  return series.points
    .filter(
      (point): point is typeof point & { indexPct: number; priceRub: number } =>
        point.indexPct != null && point.indexPct > 0 && point.priceRub != null && point.priceRub > 0,
    )
    .map((point) => ({
      label: point.label,
      indexPct: point.indexPct,
      priceRub: point.priceRub,
    }));
}

function getSeriesSnapshot(series: TmcMaterialPriceIndexLineSeries): {
  currentIndex: number | null;
  changePct: number | null;
} {
  const plottable = getPlottableSparkPoints(series);
  if (plottable.length === 0) {
    return { currentIndex: null, changePct: null };
  }
  const last = plottable[plottable.length - 1]!;
  return {
    currentIndex: last.indexPct,
    changePct: last.indexPct - 100,
  };
}

function sortSeriesByAbsChange(series: TmcMaterialPriceIndexLineSeries[]): TmcMaterialPriceIndexLineSeries[] {
  return [...series].sort((a, b) => {
    const absA = Math.abs(getSeriesSnapshot(a).changePct ?? 0);
    const absB = Math.abs(getSeriesSnapshot(b).changePct ?? 0);
    if (absB !== absA) return absB - absA;
    if (a.hasEnoughData !== b.hasEnoughData) return a.hasEnoughData ? -1 : 1;
    return a.name.localeCompare(b.name, "ru");
  });
}

function PriceIndexKpiPanel({
  dataset,
}: {
  dataset: Pick<
    TmcMaterialPriceIndexLineDataset,
    | "maxGrowthPct"
    | "maxGrowthMaterial"
    | "maxGrowthMonthsLabel"
    | "maxDeclinePct"
    | "maxDeclineMaterial"
    | "maxDeclineMonthsLabel"
  >;
}) {
  return (
    <div className="grid min-w-[250px] shrink-0 gap-3 self-start text-right text-sm sm:max-w-xs">
      <div className="rounded-xl border border-slate-600/40 bg-slate-900/35 px-4 py-3">
        <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
          Максимальный рост
        </div>
        <div className="mt-1 font-semibold tabular-nums text-red-400">
          {dataset.maxGrowthPct > 0 ? pctSigned1(dataset.maxGrowthPct) : "—"}
        </div>
        <div className="mt-1 text-xs text-slate-400">Материал: {dataset.maxGrowthMaterial}</div>
        {dataset.maxGrowthMonthsLabel ? (
          <div className="text-xs text-slate-500">Месяц: {dataset.maxGrowthMonthsLabel}</div>
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
          <div className="text-xs text-slate-500">Месяц: {dataset.maxDeclineMonthsLabel}</div>
        ) : null}
      </div>
    </div>
  );
}

function SparklineTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: SparkPoint }>;
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const point = payload[0].payload;

  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-lg"
      style={{
        background: COLORS.card,
        borderColor: "rgba(148,163,184,0.35)",
        color: "#e2e8f0",
      }}
    >
      <div className="font-semibold text-slate-100">{point.label}</div>
      <div className="mt-1 tabular-nums text-slate-300">
        Цена: <span className="font-medium text-white">{formatPriceRub(point.priceRub)}</span>
      </div>
      <div className="tabular-nums text-slate-300">
        Индекс: <span className="font-medium text-white">{formatIndexValue(point.indexPct)}</span>
      </div>
    </div>
  );
}

function PriceIndexChangeBadge({ changePct }: { changePct: number | null }) {
  if (changePct == null) {
    return <span className="text-xs text-slate-500">—</span>;
  }

  const rounded = Math.round(changePct * 10) / 10;
  if (Math.abs(rounded) < 0.05) {
    return <span className="inline-flex items-center gap-1 text-xs tabular-nums text-slate-400">0%</span>;
  }

  if (rounded > 0) {
    return (
      <span className="inline-flex items-center justify-end gap-1 text-xs font-medium tabular-nums text-emerald-400">
        <ArrowUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {pctSigned1(rounded)}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center justify-end gap-1 text-xs font-medium tabular-nums text-red-400">
      <ArrowDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {pctSigned1(rounded)}
    </span>
  );
}

function MaterialPriceIndexSparkline({ series }: { series: TmcMaterialPriceIndexLineSeries }) {
  const sparkData = useMemo(() => getPlottableSparkPoints(series), [series]);

  const yDomain = useMemo((): [number, number] => {
    if (sparkData.length === 0) return [95, 105];
    const values = sparkData.map((point) => point.indexPct);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = Math.max(2, (max - min) * 0.12);
    return [min - padding, max + padding];
  }, [sparkData]);

  if (sparkData.length < 2) {
    return (
      <span className="text-xs text-slate-500">Недостаточно данных</span>
    );
  }

  return (
    <div style={{ width: SPARKLINE_WIDTH, height: SPARKLINE_HEIGHT }}>
      <LineChart
        width={SPARKLINE_WIDTH}
        height={SPARKLINE_HEIGHT}
        data={sparkData}
        margin={{ top: 6, right: 6, left: 6, bottom: 6 }}
      >
        <YAxis hide domain={yDomain} />
        <Tooltip content={<SparklineTooltip />} cursor={{ stroke: "rgba(148,163,184,0.35)", strokeWidth: 1 }} />
        <Line
          type="monotone"
          dataKey="indexPct"
          stroke={COLORS.sparkline}
          strokeWidth={SPARKLINE_STROKE}
          dot={{
            r: SPARKLINE_DOT_R,
            fill: COLORS.sparkline,
            stroke: "#ffffff",
            strokeWidth: 1.25,
          }}
          activeDot={{
            r: SPARKLINE_DOT_R + 1.5,
            fill: COLORS.sparkline,
            stroke: "#ffffff",
            strokeWidth: 1.5,
          }}
          connectNulls={false}
          isAnimationActive={false}
        />
      </LineChart>
    </div>
  );
}

function MaterialPriceIndexRow({ series }: { series: TmcMaterialPriceIndexLineSeries }) {
  const { currentIndex, changePct } = useMemo(() => getSeriesSnapshot(series), [series]);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-600/35 bg-slate-900/30 px-3 py-2.5">
      <div className="min-w-0 flex-[1.4]">
        <div className="truncate text-sm font-medium text-slate-100" title={series.name}>
          {series.name}
        </div>
      </div>

      <div
        className="flex shrink-0 items-center justify-center"
        style={{ width: SPARKLINE_WIDTH }}
      >
        {series.hasEnoughData ? (
          <MaterialPriceIndexSparkline series={series} />
        ) : (
          <span className="text-xs text-slate-500">Недостаточно данных</span>
        )}
      </div>

      <div className="w-[76px] shrink-0 text-right text-sm font-semibold tabular-nums text-slate-100">
        {currentIndex != null ? formatIndexValue(currentIndex) : "—"}
      </div>

      <div className="w-[84px] shrink-0 text-right">
        <PriceIndexChangeBadge changePct={changePct} />
      </div>
    </div>
  );
}

export function TmcMaterialPriceIndexLineChartView({
  dataset,
}: {
  dataset: TmcMaterialPriceIndexLineDataset;
}) {
  const sortedSeries = useMemo(() => sortSeriesByAbsChange(dataset.series), [dataset.series]);

  if (dataset.months.length < 2) {
    return (
      <div className="flex h-[320px] items-center justify-center text-sm text-slate-500">
        Недостаточно данных для расчёта индекса
      </div>
    );
  }

  if (sortedSeries.length === 0) {
    return (
      <div className="flex h-[320px] items-center justify-center text-sm text-slate-500">
        Недостаточно данных для расчёта индекса
        {dataset.insufficientDataCount > 0
          ? ` (${dataset.insufficientDataCount} ТМЦ с менее чем 2 месяцами поставок)`
          : null}
      </div>
    );
  }

  return (
    <div className="flex w-full gap-4">
      <div className="min-w-0 flex-1">
        <div className="mb-2 hidden gap-3 px-3 text-[10px] font-medium uppercase tracking-wider text-slate-500 sm:grid sm:grid-cols-[minmax(0,1.4fr)_148px_76px_84px]">
          <span>Материал</span>
          <span className="text-center">Динамика</span>
          <span className="text-right">Индекс</span>
          <span className="text-right">Изменение</span>
        </div>
        <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
          {sortedSeries.map((series) => (
            <MaterialPriceIndexRow key={series.dataKey} series={series} />
          ))}
        </div>
      </div>

      <PriceIndexKpiPanel dataset={dataset} />
    </div>
  );
}

/** @deprecated Используйте TmcMaterialPriceIndexLineChartView */
export const TmcMaterialPriceHeatmapView = TmcMaterialPriceIndexLineChartView;
export const TmcMaterialPriceIndexChartView = TmcMaterialPriceIndexLineChartView;
