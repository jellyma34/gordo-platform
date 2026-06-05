"use client";

import { useMemo } from "react";
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

const COLORS = {
  green: "#22c55e",
  plan: "#94a3b8",
  card: "#1e293b",
} as const;

const PLAN_LABEL_Y_OFFSET = 18;
const FACT_LABEL_Y_OFFSET = 8;
const FACT_LABEL_Y_OFFSET_BELOW = 10;
const FACT_LABEL_Y_OFFSET_BELOW_MIN = 8;
const FACT_LABEL_Y_OFFSET_BELOW_MAX = 12;
const LABEL_HALF_H = 6;
const LABEL_MIN_X_GAP = 4;
const LABEL_FONT_SIZE = 10;
const CLOSE_POINT_PX = 16;
const AXIS_LABEL_CLEARANCE_PX = 6;

export type TmcProcurementChartMode = "monthly" | "cumulative";

export type TmcProcurementChartRow = {
  label: string;
  plan: number;
  fact: number | null;
};

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

/** Подпись точки: значение в млн без единиц измерения. */
export function formatTmcProcurementPointLabel(mln: number): string {
  if (!Number.isFinite(mln) || mln === 0) return "";

  const sign = mln < 0 ? "−" : "";
  const abs = Math.abs(mln);

  if (Math.abs(abs - Math.round(abs)) < 1e-6) {
    return `${sign}${Math.round(abs).toLocaleString("ru-RU")}`;
  }
  if (abs >= 1) {
    return `${sign}${abs.toFixed(1).replace(".", ",")}`;
  }
  return `${sign}${abs.toFixed(2).replace(".", ",")}`;
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

function factLabelYBelowPoint(
  pointY: number,
  plot: PlotRect | null | undefined,
  preferredOffset = FACT_LABEL_Y_OFFSET_BELOW,
): number {
  let offset = Math.min(
    FACT_LABEL_Y_OFFSET_BELOW_MAX,
    Math.max(FACT_LABEL_Y_OFFSET_BELOW_MIN, preferredOffset),
  );
  let y = pointY + offset;

  if (plot) {
    const plotBottom = plot.y + plot.height;
    const maxLabelCenter = plotBottom - AXIS_LABEL_CLEARANCE_PX - LABEL_HALF_H;
    if (y > maxLabelCenter) {
      y = maxLabelCenter;
      offset = y - pointY;
    }
    if (offset < FACT_LABEL_Y_OFFSET_BELOW_MIN) {
      offset = Math.max(4, maxLabelCenter - pointY);
      y = pointY + offset;
    }
  }

  return y;
}

function resolveProcurementPointLabels(
  draft: PointLabel[],
  mode: TmcProcurementChartMode,
): PointLabel[] {
  const sorted = [...draft].sort((a, b) => b.priority - a.priority);
  const placed: PointLabel[] = [];

  for (const candidate of sorted) {
    let accepted = false;
    const factBelow = candidate.series === "fact" && mode === "cumulative";

    for (let step = 0; step <= 4; step++) {
      const delta = factBelow ? step * 6 : -step * 10;
      const tryLabel = { ...candidate, y: candidate.y + delta };
      const overlaps = placed.some((p) => labelsOverlap(tryLabel, p));
      if (!overlaps) {
        placed.push(tryLabel);
        accepted = true;
        break;
      }
    }

    if (!accepted) continue;
  }

  return placed.sort((a, b) => a.index - b.index || (a.series === "plan" ? -1 : 1));
}

function buildProcurementPointLabels(
  chartData: TmcProcurementChartRow[],
  xCat: XScale,
  plot: PlotRect | null | undefined,
  yScale: (value: number) => number | undefined,
  mode: TmcProcurementChartMode,
): PointLabel[] {
  const draft: PointLabel[] = [];

  chartData.forEach((row, index) => {
    const x = categoryPointX(row, index, chartData.length, xCat, plot);
    if (x == null) return;

    const planPointY = row.plan > 0 ? yScale(row.plan) : null;
    const factValue = row.fact;
    const factPointY =
      factValue != null && Number.isFinite(factValue) && factValue > 0
        ? yScale(factValue)
        : null;

    const planText = formatTmcProcurementPointLabel(row.plan);
    const factText =
      factValue != null && Number.isFinite(factValue)
        ? formatTmcProcurementPointLabel(factValue)
        : "";

    let planY =
      planPointY != null && planText
        ? planPointY - PLAN_LABEL_Y_OFFSET
        : null;
    let factY: number | null = null;
    if (factPointY != null && factText) {
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
      const planHalfW = estimateLabelHalfWidth(planText);
      const factHalfW = estimateLabelHalfWidth(factText);
      const probePlan: PointLabel = {
        key: "probe-plan",
        index,
        series: "plan",
        x,
        y: planY,
        text: planText,
        halfW: planHalfW,
        priority: 0,
      };
      const probeFact: PointLabel = {
        key: "probe-fact",
        index,
        series: "fact",
        x,
        y: factY,
        text: factText,
        halfW: factHalfW,
        priority: 0,
      };
      if (labelsOverlap(probePlan, probeFact)) {
        planY -= 10;
      }
    }

    if (planY != null && planText) {
      draft.push({
        key: `plan-${row.label}-${index}`,
        index,
        series: "plan",
        x,
        y: planY,
        text: planText,
        halfW: estimateLabelHalfWidth(planText),
        priority: row.plan + 1,
      });
    }

    if (factY != null && factText) {
      draft.push({
        key: `fact-${row.label}-${index}`,
        index,
        series: "fact",
        x,
        y: factY,
        text: factText,
        halfW: estimateLabelHalfWidth(factText),
        priority: (factValue ?? 0) + 1000,
      });
    }
  });

  return resolveProcurementPointLabels(draft, mode);
}

function TmcProcurementPointLabels({
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
    return buildProcurementPointLabels(
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
          fill={item.series === "plan" ? COLORS.plan : "#86efac"}
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

export function TmcProcurementDynamicsChart({
  chartData,
  chartGradId,
  mode = "monthly",
}: {
  chartData: TmcProcurementChartRow[];
  chartGradId: string;
  mode?: TmcProcurementChartMode;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={chartData}
        margin={{ top: 28, right: 10, left: 2, bottom: mode === "cumulative" ? 62 : 56 }}
      >
        <defs>
          <linearGradient id={chartGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.green} stopOpacity={0.32} />
            <stop offset="100%" stopColor={COLORS.green} stopOpacity={0} />
          </linearGradient>
        </defs>
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
        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => `${v} млн`} />
        <Tooltip
          contentStyle={{
            background: COLORS.card,
            border: "1px solid rgba(148,163,184,0.35)",
            color: "#e2e8f0",
          }}
          formatter={(value: unknown, name: unknown) => [
            value == null ? "—" : `${value} млн ₽`,
            String(name) === "plan" ? "План закупок" : "Факт закупок",
          ]}
        />
        <Area
          type="monotone"
          dataKey="fact"
          fill={`url(#${chartGradId})`}
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
        />
        <Line
          type="monotone"
          dataKey="fact"
          stroke={COLORS.green}
          strokeWidth={3}
          dot={{
            r: 4,
            fill: COLORS.green,
            stroke: "#ffffff",
            strokeWidth: 2,
          }}
          activeDot={{
            r: 7,
            fill: COLORS.green,
            stroke: "#ffffff",
            strokeWidth: 2,
            style: { filter: `drop-shadow(0 0 6px ${COLORS.green})` },
          }}
          name="fact"
          connectNulls={false}
        />
        <TmcProcurementPointLabels chartData={chartData} mode={mode} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
