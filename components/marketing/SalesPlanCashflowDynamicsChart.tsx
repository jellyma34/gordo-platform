"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import {
  CASHFLOW_PLAN_FROM_REVENUE_RATIO,
  cashflowRowsForChart,
  type CashflowChartMode,
  type CashflowChartRow,
  type CashflowSeriesRow,
} from "@/lib/buildCashflowSeries";
import { numFmt } from "@/lib/salesPlanChartFormat";

const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false });
const LineChart = dynamic(() => import("recharts").then((m) => m.LineChart), { ssr: false });
const Line = dynamic(() => import("recharts").then((m) => m.Line), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((m) => m.CartesianGrid), { ssr: false });
const LabelList = dynamic(() => import("recharts").then((m) => m.LabelList), { ssr: false });

function formatRubLabel(n: number): string {
  return `${numFmt.format(Math.round(n))} ₽`;
}

function CashflowTooltip({
  active,
  payload,
  presentation,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: CashflowChartRow }>;
  presentation: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as CashflowChartRow | undefined;
  if (!row) return null;
  const base = presentation ? "border-slate-500/45 bg-[#0b1220]/95 text-slate-100" : "border-slate-200 bg-white text-slate-900";
  return (
    <div className={`rounded-lg px-3 py-2 text-xs shadow-lg ring-1 ${base}`}>
      <div className={`font-semibold ${presentation ? "text-slate-200" : "text-slate-800"}`}>{row.label}</div>
      <div className="mt-1 space-y-0.5 tabular-nums">
        <div className="flex justify-between gap-4">
          <span className={presentation ? "text-slate-400" : "text-slate-500"}>Факт</span>
          <span className="text-[#1e40af]">{formatRubLabel(row.fact)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className={presentation ? "text-slate-400" : "text-slate-500"}>План</span>
          <span className="text-orange-500">{formatRubLabel(row.plan)}</span>
        </div>
        <div className="flex justify-between gap-4 border-t border-slate-600/40 pt-1">
          <span className={presentation ? "text-slate-400" : "text-slate-500"}>Отклонение</span>
          <span className={row.deviation >= 0 ? "text-emerald-400" : "text-rose-400"}>{formatRubLabel(row.deviation)}</span>
        </div>
      </div>
    </div>
  );
}

type Props = {
  rows: CashflowSeriesRow[];
  planScale: number;
  presentation: boolean;
};

export function SalesPlanCashflowDynamicsChart({ rows, planScale, presentation }: Props) {
  const [mode, setMode] = useState<CashflowChartMode>("monthly");

  const chartData = useMemo(() => cashflowRowsForChart(rows, mode, planScale), [rows, mode, planScale]);

  const toggleClass = (active: boolean) =>
    presentation
      ? active
        ? "bg-slate-700/80 text-slate-100 ring-1 ring-slate-500/50"
        : "text-slate-400 ring-1 ring-slate-600/60 hover:bg-slate-800/80"
      : active
        ? "bg-slate-900 text-white"
        : "text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50";

  if (chartData.length === 0) {
    return (
      <div
        className={
          presentation
            ? "rounded-xl border border-slate-600/45 bg-[#1e293b]/80 p-4 text-sm text-slate-400"
            : "rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600"
        }
      >
        Нет данных поступлений по месяцам для графика.
      </div>
    );
  }

  const gridStroke = presentation ? "rgba(148,163,184,0.12)" : "rgba(148,163,184,0.35)";
  const axisColor = presentation ? "#94a3b8" : "#64748b";

  return (
    <div
      className={
        presentation
          ? "mb-7 rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4 shadow-sm sm:p-5"
          : "mb-7 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      }
    >
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className={`text-sm font-semibold ${presentation ? "text-slate-100" : "text-slate-900"}`}>Динамика поступлений, ₽</h3>
          <p className={`mt-0.5 text-[11px] ${presentation ? "text-slate-500" : "text-slate-600"}`}>
            План и факт поступлений на эскроу (без сделок). План: из помесячного плана выручки × {CASHFLOW_PLAN_FROM_REVENUE_RATIO}.
          </p>
        </div>
        <div className="flex shrink-0 gap-1 rounded-lg p-0.5 ring-1 ring-inset ring-slate-600/40">
          <button
            type="button"
            onClick={() => setMode("monthly")}
            className={`rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition ${toggleClass(mode === "monthly")}`}
          >
            Помесячно
          </button>
          <button
            type="button"
            onClick={() => setMode("cumulative")}
            className={`rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition ${toggleClass(mode === "cumulative")}`}
          >
            Нарастающим итогом
          </button>
        </div>
      </div>

      <div className="h-[320px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 28, right: 8, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 10 }} axisLine={{ stroke: gridStroke }} tickLine={false} />
            <YAxis
              tick={{ fill: axisColor, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${numFmt.format(Math.round(v as number))}`}
              width={56}
            />
            <Tooltip content={<CashflowTooltip presentation={presentation} />} cursor={{ stroke: presentation ? "rgba(148,163,184,0.35)" : "rgba(100,116,139,0.35)" }} />
            <Line
              type="monotone"
              dataKey="fact"
              name="Факт"
              stroke="#1e40af"
              strokeWidth={2.25}
              dot={{ r: 4, fill: "#1e40af", stroke: presentation ? "#0f172a" : "#fff", strokeWidth: 1 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="fact"
                position="top"
                offset={8}
                className="fill-[#93c5fd] text-[9px] font-medium tabular-nums"
                formatter={(v: number) => formatRubLabel(v)}
              />
            </Line>
            <Line
              type="monotone"
              dataKey="plan"
              name="План"
              stroke="#ea580c"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={{ r: 3.5, fill: "#ea580c", stroke: presentation ? "#0f172a" : "#fff", strokeWidth: 1 }}
              activeDot={{ r: 4.5 }}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="plan"
                position="top"
                offset={22}
                className="fill-[#fdba74] text-[9px] font-medium tabular-nums"
                formatter={(v: number) => formatRubLabel(v)}
              />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className={`mt-3 flex flex-wrap items-center gap-4 text-[10px] ${presentation ? "text-slate-500" : "text-slate-600"}`}>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-6 rounded bg-[#1e40af]" />
          Факт
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-6 rounded border border-dashed border-orange-500 bg-transparent" />
          План
        </span>
      </div>
    </div>
  );
}
