"use client";

import { useMemo } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/charting/rechartsClient";
import type {
  TmcMaterialPriceIndexLineDataset,
  TmcMaterialPriceIndexLineSeries,
  TmcPriceHeatmapMonth,
} from "@/lib/tmcPresentationAnalytics";

const COLORS = {
  card: "#1e293b",
  sparkline: "#60a5fa",
} as const;

const SPARKLINE_HEIGHT = 40;
const SPARKLINE_STROKE = 2;
const SPARKLINE_DOT_R = 3;
/** Единые отступы линейной области для sparkline и общей шкалы — нужны для попиксельного совпадения. */
const SPARKLINE_PLOT_MARGIN = { top: 6, right: 8, left: 8, bottom: 6 } as const;
const SHARED_AXIS_HEIGHT = 56;
const SHARED_AXIS_TICK_HEIGHT = 48;
/** Единая сетка строки/колонок «Материал | Динамика | Цена | Индекс | Изменение». */
const PRICE_INDEX_ROW_GRID_COLS =
  "sm:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_64px_76px_84px]";

type SparkPoint = {
  label: string;
  indexPct: number;
  priceRub: number;
};

/** Данные точки sparkline: nullable, чтобы X сохранял позицию даже без значения. */
type SparklineDataPoint = {
  label: string;
  indexPct: number | null;
  priceRub: number | null;
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

function formatUnitPricePlain(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return String(Math.round(value));
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
  currentUnitPrice: number | null;
} {
  const plottable = getPlottableSparkPoints(series);
  if (plottable.length === 0) {
    return { currentIndex: null, changePct: null, currentUnitPrice: null };
  }
  const last = plottable[plottable.length - 1]!;
  return {
    currentIndex: last.indexPct,
    changePct: last.indexPct - 100,
    currentUnitPrice: last.priceRub,
  };
}

function sortSeriesByName(series: TmcMaterialPriceIndexLineSeries[]): TmcMaterialPriceIndexLineSeries[] {
  return [...series].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

function SparklineTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: SparklineDataPoint }>;
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const point = payload[0].payload;
  if (point.indexPct == null || point.priceRub == null) return null;

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
  // Полный ряд месяцев (включая null) — точки X совпадают с общей шкалой снизу.
  const sparkData = useMemo<SparklineDataPoint[]>(
    () =>
      series.points.map((point) => ({
        label: point.label,
        indexPct: point.indexPct,
        priceRub: point.priceRub,
      })),
    [series.points],
  );
  const plottable = useMemo(() => getPlottableSparkPoints(series), [series]);

  const yDomain = useMemo((): [number, number] => {
    if (plottable.length === 0) return [95, 105];
    const values = plottable.map((point) => point.indexPct);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = Math.max(2, (max - min) * 0.12);
    return [min - padding, max + padding];
  }, [plottable]);

  if (plottable.length < 2) {
    return <span className="text-xs text-slate-500">Недостаточно данных</span>;
  }

  return (
    <div className="h-[40px] w-full min-w-0">
      <ResponsiveContainer width="100%" height={SPARKLINE_HEIGHT}>
        <LineChart data={sparkData} margin={SPARKLINE_PLOT_MARGIN}>
          <XAxis hide dataKey="label" type="category" interval={0} />
          <YAxis hide domain={yDomain} />
          <Tooltip
            content={<SparklineTooltip />}
            cursor={{ stroke: "rgba(148,163,184,0.35)", strokeWidth: 1 }}
          />
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
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Единая горизонтальная шкала месяцев под колонкой «Динамика».
 * Использует те же отступы (`SPARKLINE_PLOT_MARGIN`) и категориальную ось,
 * что и каждый sparkline, чтобы тики совпадали с точками графиков.
 */
function PriceIndexSharedMonthAxis({ months }: { months: TmcPriceHeatmapMonth[] }) {
  const data = useMemo(
    () => months.map((month) => ({ label: month.label })),
    [months],
  );

  if (data.length === 0) return null;

  return (
    <div className="w-full min-w-0" style={{ height: SHARED_AXIS_HEIGHT }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={SPARKLINE_PLOT_MARGIN}>
          <XAxis
            dataKey="label"
            type="category"
            interval={0}
            tickLine={false}
            axisLine={{ stroke: "rgba(148,163,184,0.25)" }}
            tick={{ fill: "#94a3b8", fontSize: 10, angle: -32, textAnchor: "end" }}
            tickMargin={6}
            height={SHARED_AXIS_TICK_HEIGHT}
          />
          <YAxis hide domain={[0, 1]} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function MaterialPriceIndexRow({ series }: { series: TmcMaterialPriceIndexLineSeries }) {
  const { currentIndex, changePct, currentUnitPrice } = useMemo(
    () => getSeriesSnapshot(series),
    [series],
  );

  return (
    <div
      className={`grid items-center gap-3 rounded-xl border border-slate-600/35 bg-slate-900/30 px-3 py-2.5 ${PRICE_INDEX_ROW_GRID_COLS}`}
    >
      <div className="min-w-0">
        <div className="break-words text-sm font-medium leading-snug text-slate-100">
          {series.name}
        </div>
      </div>

      <div className="flex min-w-0 items-center justify-center">
        {series.hasEnoughData ? (
          <MaterialPriceIndexSparkline series={series} />
        ) : (
          <span className="text-xs text-slate-500">Недостаточно данных</span>
        )}
      </div>

      <div className="text-right text-sm font-semibold tabular-nums text-slate-100">
        {currentUnitPrice != null ? formatUnitPricePlain(currentUnitPrice) : "—"}
      </div>

      <div className="text-right text-sm font-semibold tabular-nums text-slate-100">
        {currentIndex != null ? formatIndexValue(currentIndex) : "—"}
      </div>

      <div className="text-right">
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
  const sortedSeries = useMemo(() => sortSeriesByName(dataset.series), [dataset.series]);

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
        Нет материалов в импорте ТМЦ
      </div>
    );
  }

  return (
    <div className="w-full">
      <div
        className={`mb-2 hidden gap-3 px-3 text-[10px] font-medium uppercase tracking-wider text-slate-500 sm:grid ${PRICE_INDEX_ROW_GRID_COLS}`}
      >
        <span>Материал</span>
        <span className="text-center">Динамика</span>
        <span className="text-right">Цена</span>
        <span className="text-right">Индекс</span>
        <span className="text-right">Изменение</span>
      </div>
      <div className="space-y-2">
        {sortedSeries.map((series) => (
          <MaterialPriceIndexRow key={series.dataKey} series={series} />
        ))}
      </div>
      {/* Единая шкала месяцев под колонкой «Динамика».
          Та же колоночная сетка, что и у карточек материалов, поэтому тики
          встают ровно под точками каждого sparkline. Внутреннего скролла нет —
          блок растёт по высоте, страница использует общий скролл. */}
      <div
        className={`mt-2 hidden items-stretch gap-3 border-t border-slate-700/40 px-3 pt-2 sm:grid ${PRICE_INDEX_ROW_GRID_COLS}`}
      >
        <span aria-hidden />
        <PriceIndexSharedMonthAxis months={dataset.months} />
        <span aria-hidden />
        <span aria-hidden />
        <span aria-hidden />
      </div>
    </div>
  );
}

/** @deprecated Используйте TmcMaterialPriceIndexLineChartView */
export const TmcMaterialPriceHeatmapView = TmcMaterialPriceIndexLineChartView;
export const TmcMaterialPriceIndexChartView = TmcMaterialPriceIndexLineChartView;
