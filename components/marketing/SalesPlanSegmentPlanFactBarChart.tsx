"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

import { numFmt, rubFmt } from "@/lib/salesPlanChartFormat";
import { useMarketingPresVisual } from "@/components/marketing/marketingPresentationLightContext";

const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false });
const BarChart = dynamic(() => import("recharts").then((m) => m.BarChart), { ssr: false });
const Bar = dynamic(() => import("recharts").then((m) => m.Bar), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((m) => m.CartesianGrid), { ssr: false });
const LabelList = dynamic(() => import("recharts").then((m) => m.LabelList), { ssr: false });

export type SegmentPlanFactBarRow = {
  name: string;
  fact: number;
  plan: number;
};

function SegmentBarTooltip({
  active,
  payload,
  presDark,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: SegmentPlanFactBarRow }>;
  presDark: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as SegmentPlanFactBarRow | undefined;
  if (!row) return null;
  const pct = row.plan > 0 ? ((row.fact / row.plan) * 100).toFixed(1) : "—";
  const shell = presDark
    ? "rounded-lg border border-slate-500/40 bg-[#0b1220]/95 px-3 py-2 text-xs text-slate-100 shadow-lg"
    : "rounded-lg border border-mpl-border bg-mpl-card px-3 py-2 text-xs text-mpl-text shadow-lg";

  return (
    <div className={shell}>
      <div className={`font-semibold ${presDark ? "text-slate-100" : "text-mpl-text"}`}>{row.name}</div>
      <div className={`mt-1.5 space-y-1 tabular-nums ${presDark ? "text-slate-200" : "text-mpl-text"}`}>
        <div>
          <span className={presDark ? "text-slate-400" : "text-mpl-muted"}>Факт: </span>
          <span style={{ color: "#2563EB" }} className="font-medium">
            {rubFmt.format(Math.round(row.fact))}
          </span>
        </div>
        <div>
          <span className={presDark ? "text-slate-400" : "text-mpl-muted"}>План: </span>
          <span style={{ color: "#EA580C" }} className="font-medium">
            {rubFmt.format(Math.round(row.plan))}
          </span>
        </div>
        <div className={`border-t pt-1.5 ${presDark ? "border-slate-600/50" : "border-mpl-border"}`}>
          <span className={presDark ? "text-slate-400" : "text-mpl-muted"}>Выполнение: </span>
          <span className="font-semibold">{pct === "—" ? pct : `${pct}%`}</span>
        </div>
      </div>
    </div>
  );
}

/** Подписи над столбцами: «млн / млрд» без ₽ (меньше шума на графике). */
function formatSegmentBarTopLabel(value: number): string {
  if (value == null || !Number.isFinite(value)) return "";
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_000_000_000) {
    const b = abs / 1_000_000_000;
    const s =
      Math.abs(b - Math.round(b)) < 1e-6 ? String(Math.round(b)) : b.toFixed(1).replace(".", ",");
    return `${sign}${s} млрд`;
  }
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    const s =
      Math.abs(m - Math.round(m)) < 1e-6 ? String(Math.round(m)) : m.toFixed(1).replace(".", ",");
    return `${sign}${s} млн`;
  }
  return value.toLocaleString("ru-RU");
}

function formatBarTopLabel(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n === 0) return "";
  return formatSegmentBarTopLabel(n);
}

type Props = {
  rows: SegmentPlanFactBarRow[];
  presentation: boolean;
};

export function SalesPlanSegmentPlanFactBarChart({ rows, presentation }: Props) {
  const presDark = useMarketingPresVisual(presentation) === "presDark";

  const yDomain = useMemo((): [number, number] => {
    const vals = rows.flatMap((r) => [r.fact, r.plan]);
    const max = Math.max(0, ...vals);
    const head = max > 0 ? max * 0.14 : 1;
    return [0, max + head];
  }, [rows]);

  const gridStroke = presDark ? "rgba(148,163,184,0.12)" : "rgba(148,163,184,0.35)";
  const axisColor = presDark ? "#94a3b8" : "#64748b";

  if (rows.length === 0) {
    return null;
  }

  return (
    <div
      className={
        presDark
          ? "mb-7 overflow-visible rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4 shadow-sm sm:p-5"
          : presentation
            ? "mb-7 overflow-visible rounded-2xl border border-mpl-border bg-mpl-chart p-4 shadow-sm sm:p-5"
            : "mb-7 overflow-visible rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      }
    >
      <div className="mb-3">
        <h3 className={`text-sm font-semibold ${presDark ? "text-slate-100" : presentation ? "text-mpl-text" : "text-slate-900"}`}>
          Выполнение плана продаж по сегментам
        </h3>
        <p className={`mt-0.5 text-[11px] ${presDark ? "text-slate-500" : presentation ? "text-mpl-muted" : "text-slate-600"}`}>
          Выручка накопительно: факт и план по категориям (сгруппированные столбцы).
        </p>
      </div>

      <div className="h-[300px] min-h-[280px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            margin={{ top: 28, right: 8, left: 4, bottom: 8 }}
            barCategoryGap="24%"
            barGap={8}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fill: axisColor, fontSize: 11 }}
              axisLine={{ stroke: gridStroke }}
              tickLine={false}
              interval={0}
            />
            <YAxis
              domain={yDomain}
              tick={{ fill: axisColor, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => numFmt.format(Math.round(v as number))}
              width={44}
            />
            <Tooltip
              cursor={{ fill: presDark ? "rgba(148,163,184,0.06)" : "rgba(100,116,139,0.08)" }}
              content={<SegmentBarTooltip presDark={presDark} />}
            />
            <Bar
              dataKey="fact"
              name="Факт"
              fill="#2563EB"
              radius={[8, 8, 0, 0]}
              maxBarSize={52}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="fact"
                position="top"
                fill="#2563EB"
                fontSize={11}
                fontWeight={500}
                className="tabular-nums"
                formatter={formatBarTopLabel}
              />
            </Bar>
            <Bar
              dataKey="plan"
              name="План"
              fill="#EA580C"
              fillOpacity={0.72}
              stroke="#EA580C"
              strokeWidth={1}
              strokeDasharray="4 3"
              radius={[8, 8, 0, 0]}
              maxBarSize={52}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="plan"
                position="top"
                fill="#EA580C"
                fontSize={11}
                fontWeight={500}
                className="tabular-nums"
                formatter={formatBarTopLabel}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className={`mt-3 flex flex-wrap items-center gap-4 text-[10px] ${presDark ? "text-slate-500" : presentation ? "text-mpl-muted" : "text-slate-600"}`}>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm bg-[#2563EB]" />
          Факт
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm border border-dashed border-[#EA580C] bg-[#EA580C]/70" />
          План
        </span>
      </div>
    </div>
  );
}
