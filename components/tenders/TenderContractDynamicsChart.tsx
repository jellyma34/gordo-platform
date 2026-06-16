"use client";

import { useMemo } from "react";
import {
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
import {
  formatTmcProcurementPointLabel,
  type TmcProcurementChartMode,
  type TmcProcurementChartRow,
} from "@/components/tmc/TmcProcurementDynamicsChart";

const COLORS = {
  plan: "#94a3b8",
  fact: "#22c55e",
  card: "#1e293b",
} as const;

const PLAN_LABEL_Y_OFFSET = 18;
const FACT_LABEL_Y_OFFSET = 18;
const FACT_LABEL_Y_OFFSET_BELOW = 10;
const LABEL_HALF_H = 6;
const CLOSE_POINT_PX = 16;
const CLOSE_POINT_PLAN_LIFT_PX = 16;
const LABEL_FONT_SIZE = 10;
const FACT_LINE_WIDTH = 3;
const FACT_DOT_R = 4;
const FACT_ACTIVE_DOT_R = 7;

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
};

type MonotonePoint = { x: number; y: number };

type FactPathSegment = {
  key: string;
  d: string;
};

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

function isPlottableFact(fact: number | null | undefined): fact is number {
  return fact != null && Number.isFinite(fact);
}

function estimateLabelHalfWidth(text: string): number {
  return Math.max(10, text.length * 3.4);
}

function categoryPointX(
  row: TmcProcurementChartRow,
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

function factLabelYBelowPoint(pointY: number, plot: PlotRect | null | undefined): number {
  let y = pointY + FACT_LABEL_Y_OFFSET_BELOW;
  if (plot) {
    const maxLabelCenter = plot.y + plot.height - 6 - LABEL_HALF_H;
    if (y > maxLabelCenter) y = maxLabelCenter;
  }
  return y;
}

function buildFactGeometry(
  chartData: TmcProcurementChartRow[],
  xCat: XScale,
  plot: PlotRect | null | undefined,
  yScale: (value: number) => number | undefined,
): { nodes: FactNode[]; segments: FactPathSegment[] } {
  const nodes: FactNode[] = [];
  const segments: FactPathSegment[] = [];

  chartData.forEach((row, index) => {
    const x = categoryPointX(row, index, chartData.length, xCat, plot);
    if (x == null || !isPlottableFact(row.fact)) return;
    const y = yScale(row.fact);
    if (y == null || !Number.isFinite(y)) return;
    nodes.push({ index, x, y });
  });

  if (nodes.length < 2) return { nodes, segments };

  const points: MonotonePoint[] = nodes.map((node) => ({ x: node.x, y: node.y }));
  const tangents = computeMonotoneTangents(points);

  for (let i = 0; i < nodes.length - 1; i++) {
    const left = nodes[i]!;
    const right = nodes[i + 1]!;
    segments.push({
      key: `seg-${left.index}-${right.index}`,
      d: monotoneBezierPath(points[i]!, points[i + 1]!, tangents[i]!, tangents[i + 1]!),
    });
  }

  return { nodes, segments };
}

function buildPointLabels(
  chartData: TmcProcurementChartRow[],
  xCat: XScale,
  plot: PlotRect | null | undefined,
  yScale: (value: number) => number | undefined,
  mode: TmcProcurementChartMode,
): PointLabel[] {
  const labels: PointLabel[] = [];

  chartData.forEach((row, index) => {
    const x = categoryPointX(row, index, chartData.length, xCat, plot);
    if (x == null) return;

    const planText = formatTmcProcurementPointLabel(row.plan);
    const factValue = row.fact;
    const factText =
      factValue != null && Number.isFinite(factValue)
        ? formatTmcProcurementPointLabel(factValue)
        : "";

    const planPointY = row.plan > 0 ? yScale(row.plan) : null;
    let planY =
      planPointY != null && planText ? (planPointY as number) - PLAN_LABEL_Y_OFFSET : null;

    const factPointY = isPlottableFact(factValue) ? yScale(factValue) : null;
    let factY: number | null = null;
    if (factPointY != null && Number.isFinite(factPointY) && factText) {
      factY =
        mode === "cumulative"
          ? factLabelYBelowPoint(factPointY, plot)
          : factPointY - FACT_LABEL_Y_OFFSET;
    }

    if (
      mode === "monthly" &&
      planY != null &&
      factY != null &&
      planPointY != null &&
      factPointY != null &&
      Math.abs(planPointY - factPointY) <= CLOSE_POINT_PX
    ) {
      planY -= CLOSE_POINT_PLAN_LIFT_PX;
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
        fill: COLORS.fact,
        fontWeight: 700,
      });
    }
  });

  return labels;
}

function TenderContractFactLine({ chartData }: { chartData: TmcProcurementChartRow[] }) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const plot = usePlotArea();

  const { nodes, segments } = useMemo(() => {
    if (!xScale || !yScale) return { nodes: [] as FactNode[], segments: [] as FactPathSegment[] };
    return buildFactGeometry(
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
          stroke={COLORS.fact}
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
          fill={COLORS.fact}
          stroke="#ffffff"
          strokeWidth={2}
        />
      ))}
    </g>
  );
}

function TenderContractPointLabels({
  chartData,
  mode,
}: {
  chartData: TmcProcurementChartRow[];
  mode: TmcProcurementChartMode;
}) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const plot = usePlotArea();

  const labels = useMemo(() => {
    if (!xScale || !yScale) return [] as PointLabel[];
    return buildPointLabels(
      chartData,
      xScale as unknown as XScale,
      plot,
      yScale as unknown as (value: number) => number | undefined,
      mode,
    );
  }, [chartData, mode, plot, xScale, yScale]);

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

function ContractTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload?: TmcProcurementChartRow }>;
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
        План: <span className="font-medium text-white">{row.plan} договоров</span>
      </div>
      <div className="tabular-nums text-slate-300">
        Факт:{" "}
        <span className="font-medium text-white">
          {row.fact ?? "—"} {row.fact != null ? "договоров" : ""}
        </span>
      </div>
    </div>
  );
}

export function TenderContractDynamicsChart({
  chartData,
  mode = "monthly",
}: {
  chartData: TmcProcurementChartRow[];
  mode?: TmcProcurementChartMode;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={chartData}
        margin={{ top: 28, right: 10, left: 2, bottom: mode === "cumulative" ? 62 : 56 }}
      >
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
          tick={{ fill: "#94a3b8", fontSize: 11 }}
          tickFormatter={(v) => `${Math.round(Number(v))}`}
          allowDecimals={false}
        />
        <Tooltip content={<ContractTooltip />} />
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
        <TenderContractFactLine chartData={chartData} />
        <Line
          type="monotone"
          dataKey="fact"
          stroke="transparent"
          strokeWidth={12}
          dot={false}
          activeDot={(props: { cx?: number; cy?: number; index?: number }) => {
            const index = props.index ?? 0;
            const row = chartData[index];
            if (!row || !isPlottableFact(row.fact) || props.cx == null || props.cy == null) {
              return <g />;
            }
            return (
              <circle
                cx={props.cx}
                cy={props.cy}
                r={FACT_ACTIVE_DOT_R}
                fill={COLORS.fact}
                stroke="#ffffff"
                strokeWidth={2}
                style={{ filter: `drop-shadow(0 0 6px ${COLORS.fact})` }}
              />
            );
          }}
          connectNulls
          name="fact"
        />
        <TenderContractPointLabels chartData={chartData} mode={mode} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
