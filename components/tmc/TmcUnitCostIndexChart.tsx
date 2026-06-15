"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/charting/rechartsClient";
import { AnalyticsLegendItem, AnalyticsLegendList } from "@/components/construction/AnalyticsLegendItem";

const COLORS = {
  fact: "#3b82f6",
  card: "#1e293b",
  reference: "rgba(148,163,184,0.55)",
} as const;

const LINE_STROKE_WIDTH = 2.5;
const DOT_RADIUS = 4;

export type TmcUnitCostIndexChartRow = {
  label: string;
  plan: number | null;
  fact: number | null;
};

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

function buildIndexYDomain(chartData: TmcUnitCostIndexChartRow[]): [number, number] {
  const values: number[] = [100];
  for (const row of chartData) {
    if (isPlottableIndex(row.fact)) values.push(row.fact);
  }

  if (values.length <= 1) return [80, 130];

  let min = Math.min(...values);
  let max = Math.max(...values);
  const span = Math.max(max - 100, 100 - min, 30);
  let low = Math.floor((100 - span) / 10) * 10;
  let high = Math.ceil((100 + span) / 10) * 10;
  low = Math.min(low, 80);
  high = Math.max(high, 120);
  return [low, high];
}

function IndexTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload?: TmcUnitCostIndexChartRow; value?: number }>;
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
        Средний индекс:{" "}
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
      <LineChart data={chartData} margin={{ top: 28, right: 10, left: 2, bottom: 56 }}>
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
          stroke={COLORS.reference}
          strokeDasharray="6 5"
          strokeWidth={1.5}
        />
        <Tooltip content={<IndexTooltip />} />
        <Line
          type="monotone"
          dataKey="fact"
          name="Средний индекс"
          stroke={COLORS.fact}
          strokeWidth={LINE_STROKE_WIDTH}
          dot={{
            r: DOT_RADIUS,
            fill: COLORS.fact,
            stroke: "#ffffff",
            strokeWidth: 1.5,
          }}
          activeDot={{
            r: DOT_RADIUS + 2,
            stroke: "#ffffff",
            strokeWidth: 2,
          }}
          connectNulls={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function TmcUnitCostIndexChartLegend() {
  return (
    <AnalyticsLegendList>
      <AnalyticsLegendItem markerColor={COLORS.fact} label="Средний индекс цены по всем ТМЦ" />
    </AnalyticsLegendList>
  );
}
