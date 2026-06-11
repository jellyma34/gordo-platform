"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/charting/rechartsClient";
import { AnalyticsLegendItem, AnalyticsLegendList } from "@/components/construction/AnalyticsLegendItem";
import { createTmcMaterialXAxisTick } from "@/components/tmc/TmcMaterialXAxisTick";
import { TmcMaterialPriceHeatmapView } from "@/components/tmc/TmcMaterialPriceIndexChart";
import {
  TmcUnitCostIndexChart,
  TmcUnitCostIndexChartLegend,
  type TmcUnitCostIndexChartRow,
} from "@/components/tmc/TmcUnitCostIndexChart";
import type {
  TmcMaterialCostDynamicsMode,
  TmcMaterialCostDynamicsRow,
  TmcMaterialPriceHeatmapDataset,
  TmcPriceIndexSortMode,
} from "@/lib/tmcPresentationAnalytics";
import { tmcMaterialAxisLineCount } from "@/lib/tmcMaterialAxisLabels";

const COLORS = {
  green: "#22c55e",
  factLabel: "#86efac",
  plan: "#94a3b8",
  planFill: "rgba(148,163,184,0.88)",
} as const;

const CHART_HEIGHT = 360;
const CHART_MARGIN_TOP = 32;
const CHART_MARGIN_BOTTOM = 8;

/** Смещение подписи План влево / Факт вправо от центра своего столбца. */
const PLAN_LABEL_X_SHIFT = -9;
const FACT_LABEL_X_SHIFT = 9;
const BASE_LABEL_TOP_OFFSET = 8;
const LABEL_HALF_H = 7;
const LABEL_MIN_X_GAP = 4;
const LABEL_MIN_Y_GAP = 3;
const VERTICAL_STAGGER_STEP = 11;
const MAX_VERTICAL_STAGGER_STEPS = 5;
/** Шаг категории в пространстве коллизий (относительные единицы). */
const CATEGORY_COLLISION_PITCH = 120;
const PLAN_BAR_CENTER_OFFSET = -22;
const FACT_BAR_CENTER_OFFSET = 22;
const SMALL_VALUE_THRESHOLD = 100;
const SMALL_VALUE_MIN_CENTER_GAP = 20;

type BarLabelSeries = "plan" | "fact";

type BarLabelLayout = {
  dx: number;
  extraDy: number;
};

type ChartRow = TmcMaterialCostDynamicsRow & {
  plan: number;
  fact: number;
  label: string;
};

function roundPriceRub(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

function priceRub(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = roundPriceRub(value);
  const formatted = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(rounded);
  if (rounded < 0) return `−${formatted} ₽`;
  return `${formatted} ₽`;
}

function formatBarTopLabel(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  const rounded = roundPriceRub(n);
  if (rounded < 0) {
    return `−${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.abs(rounded))}`;
  }
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(rounded);
}

function pctSigned1(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  const formatted = Math.abs(rounded).toFixed(1).replace(".", ",");
  if (rounded < 0) return `−${formatted}%`;
  if (rounded > 0) return `+${formatted}%`;
  return `${formatted}%`;
}

function buildBarYDomain(rows: ChartRow[]): [number, number] {
  let max = 0;
  for (const row of rows) {
    max = Math.max(max, row.plan, row.fact);
  }
  return [0, max > 0 ? Math.ceil(max * 1.14) : 1];
}

function estimateLabelHalfWidth(text: string): number {
  return Math.max(7, text.length * 3.3);
}

type LabelCollisionBox = {
  key: string;
  x: number;
  y: number;
  halfW: number;
  halfH: number;
};

function labelCollisionBoxesOverlap(a: LabelCollisionBox, b: LabelCollisionBox): boolean {
  const xOverlap = !(
    a.x + a.halfW + LABEL_MIN_X_GAP < b.x - b.halfW ||
    a.x - a.halfW - LABEL_MIN_X_GAP > b.x + b.halfW
  );
  const yOverlap = !(
    a.y + a.halfH + LABEL_MIN_Y_GAP < b.y - b.halfH ||
    a.y - a.halfH - LABEL_MIN_Y_GAP > b.y + b.halfH
  );
  return xOverlap && yOverlap;
}

function valueToLabelBaseY(
  value: number,
  yDomain: [number, number],
  plotTop: number,
  plotHeight: number,
): number {
  if (value <= 0 || yDomain[1] <= 0) return plotTop;
  return plotTop + plotHeight * (1 - value / yDomain[1]) - BASE_LABEL_TOP_OFFSET;
}

/**
 * Предрасчёт смещений подписей: горизонтальный разнос План/Факт + вертикальный stagger при overlap.
 */
function buildMaterialCostBarLabelLayouts(
  chartData: ChartRow[],
  yDomain: [number, number],
  plotTop: number,
  plotHeight: number,
): Map<string, BarLabelLayout> {
  type Draft = {
    key: string;
    series: BarLabelSeries;
    dx: number;
    x: number;
    y: number;
    halfW: number;
    priority: number;
  };

  const drafts: Draft[] = [];

  chartData.forEach((row, index) => {
    const planText = formatBarTopLabel(row.plan);
    const factText = formatBarTopLabel(row.fact);
    const categoryX = index * CATEGORY_COLLISION_PITCH;
    const smallPair =
      row.plan > 0 &&
      row.fact > 0 &&
      row.plan < SMALL_VALUE_THRESHOLD &&
      row.fact < SMALL_VALUE_THRESHOLD;
    const planShift = smallPair ? PLAN_LABEL_X_SHIFT - 3 : PLAN_LABEL_X_SHIFT;
    const factShift = smallPair ? FACT_LABEL_X_SHIFT + 3 : FACT_LABEL_X_SHIFT;
    const planCenterX = categoryX + PLAN_BAR_CENTER_OFFSET + planShift;
    const factCenterX = categoryX + FACT_BAR_CENTER_OFFSET + factShift;

    if (planText) {
      drafts.push({
        key: `plan-${index}`,
        series: "plan",
        dx: planShift,
        x: planCenterX,
        y: valueToLabelBaseY(row.plan, yDomain, plotTop, plotHeight),
        halfW: estimateLabelHalfWidth(planText),
        priority: row.plan + 1,
      });
    }
    if (factText) {
      drafts.push({
        key: `fact-${index}`,
        series: "fact",
        dx: factShift,
        x: factCenterX,
        y: valueToLabelBaseY(row.fact, yDomain, plotTop, plotHeight),
        halfW: estimateLabelHalfWidth(factText),
        priority: row.fact,
      });
    }

    if (smallPair && planText && factText) {
      const gap = factCenterX - planCenterX;
      if (gap < SMALL_VALUE_MIN_CENTER_GAP) {
        const widen = (SMALL_VALUE_MIN_CENTER_GAP - gap) / 2;
        const planDraft = drafts[drafts.length - 2];
        const factDraft = drafts[drafts.length - 1];
        if (planDraft && factDraft) {
          planDraft.x -= widen;
          factDraft.x += widen;
        }
      }
    }
  });

  const sorted = [...drafts].sort((a, b) => b.priority - a.priority);
  const placed: Draft[] = [];
  const layoutMap = new Map<string, BarLabelLayout>();

  for (const draft of sorted) {
    const dx = draft.dx;
    let resolved = false;

    for (let step = 0; step <= MAX_VERTICAL_STAGGER_STEPS; step += 1) {
      const extraDy = step * VERTICAL_STAGGER_STEP;
      const tryBox: LabelCollisionBox = {
        key: draft.key,
        x: draft.x,
        y: draft.y - extraDy,
        halfW: draft.halfW,
        halfH: LABEL_HALF_H,
      };
      const overlaps = placed.some((other) => {
        const otherLayout = layoutMap.get(other.key)!;
        const otherBox: LabelCollisionBox = {
          key: other.key,
          x: other.x,
          y: other.y - otherLayout.extraDy,
          halfW: other.halfW,
          halfH: LABEL_HALF_H,
        };
        return labelCollisionBoxesOverlap(tryBox, otherBox);
      });
      if (!overlaps) {
        placed.push(draft);
        layoutMap.set(draft.key, { dx, extraDy });
        resolved = true;
        break;
      }
    }

    if (!resolved) {
      layoutMap.set(draft.key, {
        dx,
        extraDy: MAX_VERTICAL_STAGGER_STEPS * VERTICAL_STAGGER_STEP,
      });
    }
  }

  return layoutMap;
}

type BarLabelContentProps = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  value?: unknown;
  index?: number;
};

function createMaterialCostBarLabelContent(
  series: BarLabelSeries,
  fill: string,
  fontWeight: number,
  layoutMap: Map<string, BarLabelLayout>,
) {
  return function MaterialCostBarLabel(props: BarLabelContentProps) {
    const x = typeof props.x === "number" ? props.x : Number(props.x);
    const y = typeof props.y === "number" ? props.y : Number(props.y);
    const width = typeof props.width === "number" ? props.width : Number(props.width);
    const index = props.index;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || index == null) {
      return null;
    }

    const text = formatBarTopLabel(props.value);
    if (!text) return null;

    const layout = layoutMap.get(`${series}-${index}`) ?? {
      dx: series === "plan" ? PLAN_LABEL_X_SHIFT : FACT_LABEL_X_SHIFT,
      extraDy: 0,
    };
    const cx = x + width / 2 + layout.dx;
    const labelY = y - BASE_LABEL_TOP_OFFSET - layout.extraDy;

    return (
      <text
        x={cx}
        y={labelY}
        textAnchor="middle"
        dominantBaseline="auto"
        fill={fill}
        fontSize={10}
        fontWeight={fontWeight}
        className="tabular-nums pointer-events-none"
      >
        {text}
      </text>
    );
  };
}

function TmcMaterialCostTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: ChartRow }>;
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const row = payload[0].payload;

  return (
    <div className="rounded-lg border border-slate-600/50 bg-[#1e293b] px-3 py-2.5 text-xs shadow-lg">
      <div className="font-semibold text-slate-100">{row.name}</div>
      <div className="mt-2 space-y-1 tabular-nums text-slate-300">
        <div>Плановая цена: {priceRub(row.planUnitPrice)}</div>
        <div>Фактическая цена: {priceRub(row.factUnitPrice)}</div>
        <div>Отклонение: {priceRub(row.deviationRub)}</div>
        <div>Отклонение %: {pctSigned1(row.deviationPct)}</div>
      </div>
    </div>
  );
}

function TmcMaterialCostIndexView({ chartData }: { chartData: TmcUnitCostIndexChartRow[] }) {
  return (
    <div className="flex w-full flex-col">
      <div className="h-[320px] w-full min-w-0">
        <TmcUnitCostIndexChart chartData={chartData} />
      </div>
      <div className="mt-3 border-t border-slate-700/40 pt-3">
        <TmcUnitCostIndexChartLegend />
      </div>
    </div>
  );
}

function TmcMaterialCostByMaterialView({ rows }: { rows: TmcMaterialCostDynamicsRow[] }) {
  const chartData = useMemo<ChartRow[]>(
    () =>
      rows.map((row) => ({
        ...row,
        label: row.name,
        plan: roundPriceRub(row.planUnitPrice),
        fact: roundPriceRub(row.factUnitPrice),
      })),
    [rows],
  );

  const xTickAngle = chartData.length > 6 ? -32 : 0;
  const xTickAnchor = chartData.length > 6 ? ("end" as const) : ("middle" as const);
  const materialXTick = useMemo(
    () => createTmcMaterialXAxisTick({ angle: xTickAngle, textAnchor: xTickAnchor }),
    [xTickAngle, xTickAnchor],
  );

  const yDomain = useMemo(() => buildBarYDomain(chartData), [chartData]);

  const hasPlottablePrices = useMemo(
    () => chartData.some((row) => row.plan > 0 || row.fact > 0),
    [chartData],
  );

  const xAxisHeight = useMemo(() => {
    const maxLines = chartData.reduce(
      (max, row) => Math.max(max, tmcMaterialAxisLineCount(row.name)),
      1,
    );
    const angled = chartData.length > 6;
    if (angled) return maxLines > 1 ? 88 : 72;
    return maxLines > 1 ? 56 : 40;
  }, [chartData]);

  const labelLayouts = useMemo(() => {
    const plotTop = CHART_MARGIN_TOP;
    const plotHeight = CHART_HEIGHT - CHART_MARGIN_TOP - CHART_MARGIN_BOTTOM - xAxisHeight;
    return buildMaterialCostBarLabelLayouts(chartData, yDomain, plotTop, plotHeight);
  }, [chartData, yDomain, xAxisHeight]);

  const planBarLabel = useMemo(
    () => createMaterialCostBarLabelContent("plan", COLORS.plan, 500, labelLayouts),
    [labelLayouts],
  );
  const factBarLabel = useMemo(
    () => createMaterialCostBarLabelContent("fact", COLORS.factLabel, 700, labelLayouts),
    [labelLayouts],
  );

  const barCategoryGap = chartData.length > 8 ? "22%" : chartData.length > 4 ? "18%" : "14%";

  if (chartData.length === 0) {
    return (
      <div className="flex h-[320px] items-center justify-center text-sm text-slate-500">
        Нет данных для построения динамики стоимости
      </div>
    );
  }

  if (!hasPlottablePrices) {
    return (
      <div className="flex h-[320px] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-slate-400">
        <p>Не удалось построить график: отсутствуют цены закупки за единицу.</p>
        <p className="text-xs text-slate-500">
          Проверьте колонки «Цена закупки за ед. (руб.)» — План / Факт в импорте ТМЦ.
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col">
      <div className="h-[360px] w-full min-w-0">
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <BarChart
            data={chartData}
            margin={{ top: 32, right: 16, left: 4, bottom: 8 }}
            barCategoryGap={barCategoryGap}
            barGap={4}
          >
            <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="4 4" vertical={false} />
            <XAxis
              type="category"
              dataKey="label"
              interval={0}
              tickLine={false}
              axisLine={{ stroke: "rgba(148,163,184,0.25)" }}
              tick={materialXTick}
              height={xAxisHeight}
            />
            <YAxis
              type="number"
              domain={yDomain}
              width={72}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickFormatter={(v) =>
                `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(Number(v)))} ₽`
              }
              axisLine={{ stroke: "rgba(148,163,184,0.25)" }}
              tickLine={false}
              label={{
                value: "Стоимость за единицу, ₽",
                angle: -90,
                position: "insideLeft",
                fill: "#64748b",
                fontSize: 10,
                dx: -4,
              }}
            />
            <Tooltip cursor={{ fill: "rgba(148,163,184,0.06)" }} content={<TmcMaterialCostTooltip />} />
            <Bar
              dataKey="plan"
              name="План"
              fill={COLORS.planFill}
              stroke="#ffffff"
              strokeWidth={1}
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
              isAnimationActive={false}
            >
              <LabelList dataKey="plan" content={planBarLabel} />
            </Bar>
            <Bar
              dataKey="fact"
              name="Факт"
              fill={COLORS.green}
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
              isAnimationActive={false}
            >
              <LabelList dataKey="fact" content={factBarLabel} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 border-t border-slate-700/40 pt-3">
        <AnalyticsLegendList>
          <AnalyticsLegendItem markerColor={COLORS.plan} label="Плановая цена за единицу" />
          <AnalyticsLegendItem markerColor={COLORS.green} label="Фактическая цена за единицу" />
        </AnalyticsLegendList>
      </div>
    </div>
  );
}

export function TmcMaterialCostDynamicsChart({
  rows,
  mode = "byMaterial",
  indexChartData,
  priceHeatmapDataset,
  priceIndexSortMode = "byAlphabet",
  onPriceIndexSortModeChange,
}: {
  rows: TmcMaterialCostDynamicsRow[];
  mode?: TmcMaterialCostDynamicsMode;
  indexChartData?: TmcUnitCostIndexChartRow[];
  priceHeatmapDataset?: TmcMaterialPriceHeatmapDataset;
  priceIndexSortMode?: TmcPriceIndexSortMode;
  onPriceIndexSortModeChange?: (mode: TmcPriceIndexSortMode) => void;
}) {
  if (mode === "byPriceIndex") {
    return (
      <TmcMaterialPriceHeatmapView
        dataset={
          priceHeatmapDataset ?? {
            months: [],
            rows: [],
            maxGrowthPct: 0,
            maxGrowthMaterial: "—",
            maxGrowthMonthsLabel: null,
            maxDeclinePct: 0,
            maxDeclineMaterial: "—",
            maxDeclineMonthsLabel: null,
          }
        }
        sortMode={priceIndexSortMode}
        onSortModeChange={onPriceIndexSortModeChange ?? (() => {})}
      />
    );
  }

  if (mode === "byMonth") {
    if (!indexChartData || indexChartData.length === 0) {
      return (
        <div className="flex h-[320px] items-center justify-center text-sm text-slate-500">
          Недостаточно дат план/факт поставки для построения индекса цены
        </div>
      );
    }

    return <TmcMaterialCostIndexView chartData={indexChartData} />;
  }

  return <TmcMaterialCostByMaterialView rows={rows} />;
}
