"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

import type { SalesRadarCategoryRow } from "@/lib/marketingSalesReportData";

const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false });
const RadarChart = dynamic(() => import("recharts").then((m) => m.RadarChart), { ssr: false });
const Radar = dynamic(() => import("recharts").then((m) => m.Radar), { ssr: false });
const PolarGrid = dynamic(() => import("recharts").then((m) => m.PolarGrid), { ssr: false });
const PolarAngleAxis = dynamic(() => import("recharts").then((m) => m.PolarAngleAxis), { ssr: false });
const PolarRadiusAxis = dynamic(() => import("recharts").then((m) => m.PolarRadiusAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });
const Legend = dynamic(() => import("recharts").then((m) => m.Legend), { ssr: false });

const rubFmt = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

export type RadarChartRow = {
  subject: string;
  categoryLabel: string;
  planCumulative: number;
  factCumulative: number;
  /** Базовая линия плана на диаграмме (%). */
  planPct: number;
  /** Фактический % выполнения (без обрезки для tooltip). */
  factPct: number;
  /** Значение на оси радиуса (может быть >100). */
  factPctDisplay: number;
  deviation: number;
};

function vertexColor(pct: number): string {
  if (pct > 100) return "#22c55e";
  if (pct >= 90) return "#94a3b8";
  return "#ef4444";
}

function polygonColors(rows: RadarChartRow[]): { stroke: string; fill: string } {
  const pcts = rows.map((r) => r.factPct);
  const minP = Math.min(...pcts);
  const maxP = Math.max(...pcts);
  if (minP < 90) return { stroke: "#f87171", fill: "rgba(248, 113, 113, 0.22)" };
  if (maxP > 100) return { stroke: "#4ade80", fill: "rgba(74, 222, 128, 0.22)" };
  return { stroke: "#94a3b8", fill: "rgba(148, 163, 184, 0.28)" };
}

function buildRows(categories: SalesRadarCategoryRow[]): RadarChartRow[] {
  return categories.map((c) => {
    const plan = c.planCumulative;
    const fact = c.factCumulative;
    const factPct = plan > 0 ? (fact / plan) * 100 : 0;
    const rounded = Math.round(factPct * 10) / 10;
    const cap = 135;
    return {
      subject: c.axisLabel,
      categoryLabel: c.name,
      planCumulative: plan,
      factCumulative: fact,
      planPct: 100,
      factPct: rounded,
      factPctDisplay: Math.min(cap, rounded),
      deviation: fact - plan,
    };
  });
}

function RadarTooltipContent({
  active,
  payload,
  presentation,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: RadarChartRow }>;
  presentation: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const dev = row.deviation;
  const devSign = dev < 0 ? "−" : "+";
  return (
    <div
      className={
        presentation
          ? "max-w-xs rounded-lg border border-slate-500/50 bg-[#0f172a] p-3 text-xs text-slate-200 shadow-xl"
          : "max-w-xs rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-800 shadow-lg"
      }
    >
      <div className={`font-semibold ${presentation ? "text-slate-100" : "text-slate-900"}`}>
        {row.categoryLabel}
      </div>
      <div className="mt-2 space-y-1.5">
        <div>План: {rubFmt.format(row.planCumulative)}</div>
        <div>Факт: {rubFmt.format(row.factCumulative)}</div>
        <div className="tabular-nums">Выполнение: {row.factPct.toFixed(1)}%</div>
        <div
          className={
            presentation
              ? dev < 0
                ? "text-red-300"
                : dev > 0
                  ? "text-emerald-300"
                  : "text-slate-400"
              : dev < 0
                ? "text-red-600"
                : dev > 0
                  ? "text-emerald-600"
                  : "text-slate-500"
          }
        >
          Отклонение: {devSign}
          {rubFmt.format(Math.abs(dev))}
        </div>
      </div>
    </div>
  );
}

type Props = {
  categories: SalesRadarCategoryRow[];
  presentation: boolean;
};

export function SalesPlanRadarChart({ categories, presentation }: Props) {
  const data = useMemo(() => buildRows(categories), [categories]);
  const { stroke, fill } = useMemo(() => polygonColors(data), [data]);

  const gridStroke = presentation ? "rgba(148,163,184,0.2)" : "rgba(100,116,139,0.25)";
  const tickFill = presentation ? "#94a3b8" : "#64748b";
  const planStroke = presentation ? "rgba(226, 232, 240, 0.55)" : "rgba(100, 116, 139, 0.75)";

  return (
    <div className="h-[340px] w-full min-w-0 sm:h-[380px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="52%" outerRadius="68%" data={data} margin={{ top: 16, right: 24, bottom: 8, left: 24 }}>
          <PolarGrid stroke={gridStroke} />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fill: tickFill, fontSize: 11, fontWeight: 500 }}
            tickLine={false}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 135]}
            ticks={[0, 50, 90, 100, 120]}
            tick={{ fill: tickFill, fontSize: 10 }}
            tickFormatter={(v) => `${v}%`}
          />
          <Radar
            name="План (100%)"
            dataKey="planPct"
            stroke={planStroke}
            strokeWidth={1.2}
            fill="none"
            fillOpacity={0}
            dot={false}
            isAnimationActive={false}
          />
          <Radar
            name="Факт (% выполнения)"
            dataKey="factPctDisplay"
            stroke={stroke}
            strokeWidth={2}
            fill={fill}
            fillOpacity={1}
            dot={(props: { cx?: number; cy?: number; payload?: RadarChartRow }) => {
              const { cx, cy, payload } = props;
              if (cx == null || cy == null || !payload) return null;
              const c = vertexColor(payload.factPct);
              return <circle cx={cx} cy={cy} r={5} fill={c} stroke="rgba(15,23,42,0.85)" strokeWidth={1} />;
            }}
            isAnimationActive={false}
          />
          <Tooltip content={<RadarTooltipContent presentation={presentation} />} />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            formatter={(value) => <span style={{ color: tickFill }}>{value}</span>}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
