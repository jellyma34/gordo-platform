"use client";

import { useId, useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
  XAxis,
  YAxis,
} from "@/components/charting/rechartsClient";
import { AnalyticsLegendItem, AnalyticsLegendList } from "@/components/construction/AnalyticsLegendItem";
import { createTmcMaterialXAxisTick } from "@/components/tmc/TmcMaterialXAxisTick";
import type { TmcVolumeCompletionTone, TmcVolumeDynamicsRow } from "@/lib/tmcPresentationAnalytics";
import { tmcMaterialAxisLineCount } from "@/lib/tmcMaterialAxisLabels";

const COLORS = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
  teal: "#2dd4bf",
  plan: "#94a3b8",
  card: "#1e293b",
} as const;

const Y_TICKS = [0, 25, 50, 75, 100, 125, 150] as const;
const PLAN_LABEL_Y_OFFSET = 18;
const FACT_LABEL_Y_OFFSET = 8;
const LABEL_HALF_H = 6;
const LABEL_MIN_X_GAP = 4;
const LABEL_FONT_SIZE = 10;
const CLOSE_POINT_PX = 14;

type ChartRow = TmcVolumeDynamicsRow & { label: string };

type PlotRect = { x: number; y: number; width: number; height: number };

type XScale = {
  (value: string): number | undefined;
  (value: string, opts: { position: "middle" }): number | undefined;
};

type LabelSeries = "plan" | "fact";

type PointLabel = {
  key: string;
  index: number;
  series: LabelSeries;
  x: number;
  y: number;
  text: string;
  halfW: number;
  priority: number;
};

function factDotColor(tone: TmcVolumeCompletionTone): string {
  if (tone === "critical") return COLORS.red;
  if (tone === "warning") return COLORS.yellow;
  if (tone === "over") return COLORS.teal;
  return COLORS.green;
}

function formatCompletionPctText(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  if (Number.isInteger(rounded)) return String(Math.round(rounded));
  return rounded.toFixed(1).replace(".", ",");
}

function formatCompletionLabel(pct: number): string {
  return `${formatCompletionPctText(pct)}%`;
}

function pctSigned1(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  const formatted = Math.abs(rounded).toFixed(1).replace(".", ",");
  if (rounded < 0) return `−${formatted}%`;
  if (rounded > 0) return `+${formatted}%`;
  return `${formatted}%`;
}

function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(n);
}

function fmtQtyWithUnit(n: number, unit: string): string {
  const formatted = fmtQty(n);
  if (formatted === "—") return formatted;
  return unit && unit !== "—" ? `${formatted} ${unit}` : formatted;
}

function estimateLabelHalfWidth(text: string): number {
  return Math.max(12, text.length * 3.5);
}

function categoryPointX(
  row: ChartRow,
  index: number,
  chartLen: number,
  xScale: XScale,
  plot: PlotRect | null | undefined,
): number | null {
  let cx = xScale(row.label, { position: "middle" }) ?? xScale(row.label);
  if (cx == null && plot && chartLen > 0) {
    cx = plot.x + ((index + 0.5) / chartLen) * plot.width;
  }
  return cx != null && Number.isFinite(cx) ? cx : null;
}

function labelsOverlap(a: PointLabel, b: PointLabel): boolean {
  const xOverlap = !(
    a.x + a.halfW + LABEL_MIN_X_GAP < b.x - b.halfW ||
    a.x - a.halfW - LABEL_MIN_X_GAP > b.x + b.halfW
  );
  const yOverlap = !(
    a.y + LABEL_HALF_H < b.y - LABEL_HALF_H || a.y - LABEL_HALF_H > b.y + LABEL_HALF_H
  );
  return xOverlap && yOverlap;
}

function resolvePointLabels(draft: PointLabel[]): PointLabel[] {
  const sorted = [...draft].sort((a, b) => b.priority - a.priority);
  const placed: PointLabel[] = [];

  for (const candidate of sorted) {
    let accepted = false;
    for (let step = 0; step <= 4; step++) {
      const tryLabel = { ...candidate, y: candidate.y - step * 10 };
      if (!placed.some((p) => labelsOverlap(tryLabel, p))) {
        placed.push(tryLabel);
        accepted = true;
        break;
      }
    }
    if (!accepted) continue;
  }

  return placed;
}

function buildVolumePointLabels(
  chartData: ChartRow[],
  xCat: XScale,
  plot: PlotRect | null | undefined,
  yScale: (value: number) => number | undefined,
): PointLabel[] {
  const draft: PointLabel[] = [];

  chartData.forEach((row, index) => {
    const x = categoryPointX(row, index, chartData.length, xCat, plot);
    if (x == null) return;

    const planPointY = yScale(row.plan);
    const factPointY = yScale(row.fact);
    if (planPointY == null || factPointY == null) return;

    const samePoint = Math.abs(row.fact - row.plan) < 0.05;
    const factText = formatCompletionPctText(row.fact);

    if (samePoint) {
      draft.push({
        key: `single-${row.name}-${index}`,
        index,
        series: "fact",
        x,
        y: factPointY - FACT_LABEL_Y_OFFSET,
        text: "100",
        halfW: estimateLabelHalfWidth("100"),
        priority: 2000,
      });
      return;
    }

    let planY = planPointY - PLAN_LABEL_Y_OFFSET;
    let factY = factPointY - FACT_LABEL_Y_OFFSET;

    if (Math.abs(planPointY - factPointY) <= CLOSE_POINT_PX) {
      const probePlan: PointLabel = {
        key: "probe-plan",
        index,
        series: "plan",
        x,
        y: planY,
        text: "100",
        halfW: estimateLabelHalfWidth("100"),
        priority: 0,
      };
      const probeFact: PointLabel = {
        key: "probe-fact",
        index,
        series: "fact",
        x,
        y: factY,
        text: factText,
        halfW: estimateLabelHalfWidth(factText),
        priority: 0,
      };
      if (labelsOverlap(probePlan, probeFact)) {
        planY -= 10;
      }
    }

    draft.push({
      key: `plan-${row.name}-${index}`,
      index,
      series: "plan",
      x,
      y: planY,
      text: "100",
      halfW: estimateLabelHalfWidth("100"),
      priority: row.volumePlan + 1,
    });

    draft.push({
      key: `fact-${row.name}-${index}`,
      index,
      series: "fact",
      x,
      y: factY,
      text: factText,
      halfW: estimateLabelHalfWidth(factText),
      priority: row.completionPct + 1000,
    });
  });

  return resolvePointLabels(draft);
}

function TmcVolumePointLabels({ chartData }: { chartData: ChartRow[] }) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const plot = usePlotArea();

  const labels = useMemo(() => {
    if (!xScale || !yScale) return [] as PointLabel[];
    return buildVolumePointLabels(
      chartData,
      xScale as unknown as XScale,
      plot,
      yScale as unknown as (value: number) => number | undefined,
    );
  }, [chartData, plot, xScale, yScale]);

  if (labels.length === 0) return null;

  return (
    <g pointerEvents="none">
      {labels.map((item) => (
        <text
          key={item.key}
          x={item.x}
          y={item.y}
          textAnchor="middle"
          dominantBaseline="central"
          fill={item.series === "plan" ? COLORS.plan : factDotColor(chartData[item.index]?.tone ?? "complete")}
          fontSize={LABEL_FONT_SIZE}
          fontWeight={item.series === "fact" ? 700 : 500}
          className="tabular-nums"
        >
          {item.text}
        </text>
      ))}
    </g>
  );
}

function TmcVolumeDynamicsTooltip({
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
        <div>План объёма: {fmtQtyWithUnit(row.volumePlan, row.unit)}</div>
        <div>Факт объёма: {fmtQtyWithUnit(row.volumeFact, row.unit)}</div>
        <div>Процент выполнения: {formatCompletionLabel(row.completionPct)}</div>
        <div>Отклонение %: {pctSigned1(row.deviationPct)}</div>
      </div>
    </div>
  );
}

function VolumeFactDot(props: {
  cx?: number;
  cy?: number;
  payload?: ChartRow;
}) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return null;
  const color = factDotColor(payload.tone);
  return (
    <circle cx={cx} cy={cy} r={4} fill={color} stroke="#ffffff" strokeWidth={2} />
  );
}

export function TmcVolumeDynamicsChart({ rows }: { rows: TmcVolumeDynamicsRow[] }) {
  const gradId = useId().replace(/:/g, "");

  const chartData = useMemo<ChartRow[]>(
    () => rows.map((row) => ({ ...row, label: row.name })),
    [rows],
  );

  const xTickAngle = chartData.length > 6 ? -42 : 0;
  const xTickAnchor = chartData.length > 6 ? ("end" as const) : ("middle" as const);
  const materialXTick = useMemo(
    () => createTmcMaterialXAxisTick({ angle: xTickAngle, textAnchor: xTickAnchor }),
    [xTickAngle, xTickAnchor],
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

  if (chartData.length === 0) {
    return (
      <div className="flex h-[320px] items-center justify-center text-sm text-slate-500">
        Нет данных для построения динамики объёмов
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 28, right: 10, left: 2, bottom: 8 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.green} stopOpacity={0.28} />
                <stop offset="100%" stopColor={COLORS.green} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="4 4" />
            <XAxis
              dataKey="label"
              interval={0}
              height={xAxisHeight}
              tickLine={false}
              axisLine={{ stroke: "rgba(148,163,184,0.25)" }}
              tick={materialXTick}
            />
            <YAxis
              domain={[0, 150]}
              ticks={[...Y_TICKS]}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip cursor={{ fill: "rgba(148,163,184,0.06)" }} content={<TmcVolumeDynamicsTooltip />} />
            <Area
              type="monotone"
              dataKey="fact"
              fill={`url(#${gradId})`}
              stroke="none"
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="plan"
              stroke="rgba(148,163,184,0.55)"
              strokeWidth={1.5}
              strokeDasharray="6 5"
              dot={{
                r: 3,
                fill: COLORS.plan,
                stroke: "#ffffff",
                strokeWidth: 1.5,
              }}
              name="plan"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="fact"
              stroke={COLORS.green}
              strokeWidth={3}
              dot={<VolumeFactDot />}
              activeDot={{
                r: 7,
                stroke: "#ffffff",
                strokeWidth: 2,
              }}
              name="fact"
              connectNulls={false}
              isAnimationActive={false}
            />
            <TmcVolumePointLabels chartData={chartData} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 border-t border-slate-700/40 pt-3">
        <AnalyticsLegendList>
          <AnalyticsLegendItem
            markerColor="rgba(148,163,184,0.7)"
            label="План объёма (100%)"
          />
          <AnalyticsLegendItem markerColor={COLORS.green} label="Факт объёма (%)" />
        </AnalyticsLegendList>
      </div>
    </div>
  );
}
