"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
  XAxis,
  YAxis,
} from "@/components/charting/rechartsClient";
import { AnalyticsLegendItem, AnalyticsLegendList } from "@/components/construction/AnalyticsLegendItem";
import { tmcUnitCostIndexColor } from "@/lib/tmcPresentationAnalytics";

const COLORS = {
  plan: "#94a3b8",
  card: "#1e293b",
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
} as const;

const PLAN_LABEL_Y_OFFSET = 18;
const FACT_LABEL_Y_OFFSET = 8;
const LABEL_HALF_H = 6;
const CLOSE_POINT_PX = 16;
const LABEL_FONT_SIZE = 10;
const FACT_LINE_WIDTH = 3;
const FACT_DOT_R = 4;
const FACT_ACTIVE_DOT_R = 7;

export type TmcUnitCostIndexChartRow = {
  label: string;
  plan: number | null;
  fact: number | null;
};

type PlotRect = { x: number; y: number; width: number; height: number };

type XScale = {
  (value: string): number | undefined;
  (value: string, opts: { position: "middle" }): number | undefined;
};

type PointLabel = {
  key: string;
  x: number;
  y: number;
  text: string;
  halfW: number;
  fill: string;
  fontWeight: number;
};

type FactNode = {
  index: number;
  x: number;
  y: number;
  color: string;
};

type MonotonePoint = { x: number; y: number };

type FactPathSegment = {
  key: string;
  d: string;
  color: string;
};

function formatIndexPointLabel(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  const rounded = Math.round(value * 10) / 10;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-6) {
    return `${Math.round(rounded)}`;
  }
  return rounded.toFixed(1).replace(".", ",");
}

function formatIndexAxisTick(value: number): string {
  if (!Number.isFinite(value)) return "";
  return `${Math.round(value)}%`;
}

function formatIndexTooltipValue(value: unknown): string {
  if (value == null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const rounded = Math.round(n * 10) / 10;
  const formatted =
    Math.abs(rounded - Math.round(rounded)) < 1e-6
      ? `${Math.round(rounded)}`
      : rounded.toFixed(1).replace(".", ",");
  return `${formatted}%`;
}

function isPlottableIndex(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 0;
}

function estimateLabelHalfWidth(text: string): number {
  return Math.max(10, text.length * 3.4);
}

function categoryPointX(
  row: TmcUnitCostIndexChartRow,
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

function computeMonotoneTangents(points: MonotonePoint[]): number[] {
  const n = points.length;
  if (n === 0) return [];
  if (n === 1) return [0];

  const tangents = new Array<number>(n).fill(0);
  const deltas = new Array<number>(n - 1);

  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1]!.x - points[i]!.x;
    deltas[i] = dx !== 0 ? (points[i + 1]!.y - points[i]!.y) / dx : 0;
  }

  tangents[0] = deltas[0]!;
  tangents[n - 1] = deltas[n - 2]!;

  for (let i = 1; i < n - 1; i++) {
    const d0 = deltas[i - 1]!;
    const d1 = deltas[i]!;
    tangents[i] = d0 * d1 <= 0 ? 0 : (d0 + d1) / 2;
  }

  for (let i = 0; i < n - 1; i++) {
    const delta = deltas[i]!;
    if (Math.abs(delta) < 1e-8) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const alpha = tangents[i]! / delta;
    const beta = tangents[i + 1]! / delta;
    const tau = alpha * alpha + beta * beta;
    if (tau > 9) {
      const scale = 3 / Math.sqrt(tau);
      tangents[i] = scale * alpha * delta;
      tangents[i + 1] = scale * beta * delta;
    }
  }

  return tangents;
}

function monotoneBezierPath(
  p0: MonotonePoint,
  p1: MonotonePoint,
  tangent0: number,
  tangent1: number,
): string {
  const dx = p1.x - p0.x;
  if (Math.abs(dx) < 1e-8) {
    return `M${p0.x},${p0.y}L${p1.x},${p1.y}`;
  }
  const cp1x = p0.x + dx / 3;
  const cp1y = p0.y + (tangent0 * dx) / 3;
  const cp2x = p1.x - dx / 3;
  const cp2y = p1.y - (tangent1 * dx) / 3;
  return `M${p0.x},${p0.y}C${cp1x},${cp1y} ${cp2x},${cp2y} ${p1.x},${p1.y}`;
}

function isPlottablePlan(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 0;
}

function buildIndexYDomain(chartData: TmcUnitCostIndexChartRow[]): [number, number] {
  const values: number[] = [100];
  for (const row of chartData) {
    if (isPlottablePlan(row.plan)) values.push(row.plan);
    if (isPlottableIndex(row.fact)) values.push(row.fact);
  }

  if (values.length <= 1) return [80, 130];

  let min = Math.min(...values);
  let max = Math.max(...values);
  const span = Math.max(max - 100, 100 - min, 30);
  let low = Math.floor((100 - span) / 10) * 10;
  let high = Math.ceil((100 + span) / 10) * 10;
  low = Math.min(low, 80);
  high = Math.max(high, 130);
  if (high - low < 50) {
    low = 80;
    high = 130;
  }
  return [low, high];
}

function buildIndexFactGeometry(
  chartData: TmcUnitCostIndexChartRow[],
  xCat: XScale,
  plot: PlotRect | null | undefined,
  yScale: (value: number) => number | undefined,
): { nodes: FactNode[]; segments: FactPathSegment[] } {
  const nodes: FactNode[] = [];
  const segments: FactPathSegment[] = [];

  chartData.forEach((row, index) => {
    const x = categoryPointX(row, index, chartData.length, xCat, plot);
    if (x == null || !isPlottableIndex(row.fact)) return;
    const y = yScale(row.fact);
    if (y == null || !Number.isFinite(y)) return;
    nodes.push({
      index,
      x,
      y,
      color: tmcUnitCostIndexColor(row.fact),
    });
  });

  if (nodes.length < 2) return { nodes, segments };

  const points: MonotonePoint[] = nodes.map((node) => ({ x: node.x, y: node.y }));
  const tangents = computeMonotoneTangents(points);

  for (let i = 0; i < nodes.length - 1; i++) {
    const right = nodes[i + 1]!;
    const destRow = chartData[right.index];
    if (!destRow || !isPlottableIndex(destRow.fact)) continue;
    segments.push({
      key: `seg-${nodes[i]!.index}-${right.index}`,
      d: monotoneBezierPath(points[i]!, points[i + 1]!, tangents[i]!, tangents[i + 1]!),
      color: tmcUnitCostIndexColor(destRow.fact),
    });
  }

  return { nodes, segments };
}

function buildIndexPointLabels(
  chartData: TmcUnitCostIndexChartRow[],
  xCat: XScale,
  plot: PlotRect | null | undefined,
  yScale: (value: number) => number | undefined,
): PointLabel[] {
  const labels: PointLabel[] = [];

  chartData.forEach((row, index) => {
    const x = categoryPointX(row, index, chartData.length, xCat, plot);
    if (x == null) return;

    const planText = isPlottablePlan(row.plan) ? formatIndexPointLabel(row.plan) : "";
    const factValue = row.fact;
    const factText = isPlottableIndex(factValue) ? formatIndexPointLabel(factValue) : "";

    const planPointY = isPlottablePlan(row.plan) ? yScale(row.plan) : null;
    let planY =
      planPointY != null && planText ? (planPointY as number) - PLAN_LABEL_Y_OFFSET : null;

    const factPointY = isPlottableIndex(factValue) ? yScale(factValue) : null;
    let factY: number | null = null;
    if (factPointY != null && Number.isFinite(factPointY) && factText) {
      factY = factPointY - FACT_LABEL_Y_OFFSET;
    }

    if (
      planY != null &&
      factY != null &&
      planPointY != null &&
      factPointY != null &&
      Math.abs(planPointY - factPointY) <= CLOSE_POINT_PX
    ) {
      planY -= 10;
    }

    if (planY != null && planText) {
      labels.push({
        key: `plan-${row.label}-${index}`,
        x,
        y: planY,
        text: planText,
        halfW: estimateLabelHalfWidth(planText),
        fill: COLORS.plan,
        fontWeight: 500,
      });
    }

    if (factY != null && factText) {
      labels.push({
        key: `fact-${row.label}-${index}`,
        x,
        y: factY,
        text: factText,
        halfW: estimateLabelHalfWidth(factText),
        fill: tmcUnitCostIndexColor(factValue),
        fontWeight: 700,
      });
    }
  });

  return labels;
}

function TmcUnitCostIndexSegmentedFactLine({
  chartData,
}: {
  chartData: TmcUnitCostIndexChartRow[];
}) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const plot = usePlotArea();

  const { nodes, segments } = useMemo(() => {
    if (!xScale || !yScale) return { nodes: [] as FactNode[], segments: [] as FactPathSegment[] };
    return buildIndexFactGeometry(
      chartData,
      xScale as unknown as XScale,
      plot,
      yScale as unknown as (value: number) => number | undefined,
    );
  }, [chartData, plot, xScale, yScale]);

  if (nodes.length === 0) return null;

  return (
    <g pointerEvents="none" aria-hidden>
      {segments.map((seg) => (
        <path
          key={seg.key}
          d={seg.d}
          fill="none"
          stroke={seg.color}
          strokeWidth={FACT_LINE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {nodes.map((node) => (
        <circle
          key={`dot-${node.index}`}
          cx={node.x}
          cy={node.y}
          r={FACT_DOT_R}
          fill={node.color}
          stroke="#ffffff"
          strokeWidth={2}
        />
      ))}
    </g>
  );
}

function TmcUnitCostIndexPointLabels({ chartData }: { chartData: TmcUnitCostIndexChartRow[] }) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const plot = usePlotArea();

  const labels = useMemo(() => {
    if (!xScale || !yScale) return [] as PointLabel[];
    return buildIndexPointLabels(
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
          fill={item.fill}
          fontSize={LABEL_FONT_SIZE}
          fontWeight={item.fontWeight}
          className="tabular-nums"
        >
          {item.text}
        </text>
      ))}
    </g>
  );
}

function IndexTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload?: TmcUnitCostIndexChartRow; dataKey?: string; value?: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-lg"
      style={{
        background: COLORS.card,
        borderColor: "rgba(148,163,184,0.35)",
        color: "#e2e8f0",
      }}
    >
      <div className="font-semibold text-slate-100">{label}</div>
      <div className="mt-1 tabular-nums text-slate-300">
        Плановый индекс:{" "}
        <span className="font-medium text-white">{formatIndexTooltipValue(row.plan)}</span>
      </div>
      <div className="tabular-nums text-slate-300">
        Фактический индекс:{" "}
        <span className="font-medium text-white">{formatIndexTooltipValue(row.fact)}</span>
      </div>
    </div>
  );
}

export function TmcUnitCostIndexChart({ chartData }: { chartData: TmcUnitCostIndexChartRow[] }) {
  const yDomain = useMemo(() => buildIndexYDomain(chartData), [chartData]);
  const yTicks = useMemo(() => {
    const [low, high] = yDomain;
    const ticks: number[] = [];
    for (let value = low; value <= high; value += 10) {
      ticks.push(value);
    }
    if (!ticks.includes(100)) ticks.push(100);
    return [...new Set(ticks)].sort((a, b) => a - b);
  }, [yDomain]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={chartData} margin={{ top: 28, right: 10, left: 2, bottom: 56 }}>
        <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="4 4" />
        <XAxis
          dataKey="label"
          interval={0}
          height={52}
          tick={{
            fill: "#94a3b8",
            fontSize: 10,
            angle: -90,
            textAnchor: "end",
          }}
        />
        <YAxis
          domain={yDomain}
          ticks={yTicks}
          tick={{ fill: "#94a3b8", fontSize: 11 }}
          tickFormatter={(v) => formatIndexAxisTick(Number(v))}
          label={{
            value: "Индекс цены, %",
            angle: -90,
            position: "insideLeft",
            fill: "#64748b",
            fontSize: 10,
            dx: -4,
          }}
        />
        <ReferenceLine
          y={100}
          stroke="rgba(148,163,184,0.55)"
          strokeDasharray="6 5"
          strokeWidth={1.5}
        />
        <Tooltip content={<IndexTooltip />} />
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
          connectNulls={false}
          name="plan"
        />
        <TmcUnitCostIndexSegmentedFactLine chartData={chartData} />
        <Line
          type="monotone"
          dataKey="fact"
          stroke="transparent"
          strokeWidth={12}
          dot={false}
          activeDot={(props: { cx?: number; cy?: number; index?: number }) => {
            const index = props.index ?? 0;
            const row = chartData[index];
            if (!row || !isPlottableIndex(row.fact) || props.cx == null || props.cy == null) {
              return <g />;
            }
            const color = tmcUnitCostIndexColor(row.fact);
            return (
              <circle
                cx={props.cx}
                cy={props.cy}
                r={FACT_ACTIVE_DOT_R}
                fill={color}
                stroke="#ffffff"
                strokeWidth={2}
                style={{ filter: `drop-shadow(0 0 6px ${color})` }}
              />
            );
          }}
          connectNulls
          name="fact"
        />
        <TmcUnitCostIndexPointLabels chartData={chartData} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function TmcUnitCostIndexChartLegend() {
  return (
    <AnalyticsLegendList>
      <AnalyticsLegendItem
        markerColor="rgba(148,163,184,0.7)"
        label="Плановая цена за единицу (пунктир)"
      />
      <AnalyticsLegendItem markerColor={COLORS.green} label="Фактическая цена — 95–105%" />
      <AnalyticsLegendItem markerColor={COLORS.yellow} label="Фактическая цена — 80–95% / 105–120%" />
      <AnalyticsLegendItem markerColor={COLORS.red} label="Фактическая цена — ниже 80% / выше 120%" />
    </AnalyticsLegendList>
  );
}
