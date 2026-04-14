"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { SalesPlanExplainInteractive } from "@/lib/buildSalesPlanPresentationExplain";

const PLAN_FILL = "#0ea5e9";
const FACT_FILL = "#34d399";

type ChartRow = {
  pointId: string;
  label: string;
  plan: number;
  fact: number;
  detailLine: string;
};

function formatByKind(kind: "deals" | "rub", n: number): string {
  if (kind === "deals") return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(
    Math.round(n),
  );
}

function CustomTooltip({
  active,
  payload,
  valueKind,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartRow }>;
  valueKind: "deals" | "rub";
}) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const delta = d.fact - d.plan;
  const sign = delta >= 0 ? "+" : "−";
  return (
    <div className="rounded-lg border border-slate-600 bg-slate-950/95 px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-white">{d.label}</p>
      <p className="mt-1 text-slate-300">
        <span className="text-sky-300">План:</span> {formatByKind(valueKind, d.plan)}
      </p>
      <p className="text-slate-300">
        <span className="text-emerald-300">Факт:</span> {formatByKind(valueKind, d.fact)}
      </p>
      <p className="text-slate-200">
        <span className="text-amber-200">Δ:</span> {sign}
        {formatByKind(valueKind, Math.abs(delta))}
      </p>
      <p className="mt-1 font-mono text-[10px] text-slate-500">id: {d.pointId}</p>
    </div>
  );
}

export function SalesPlanExplainInteractiveSection({
  blockId,
  interactive,
}: {
  blockId: string;
  interactive: SalesPlanExplainInteractive;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const data = interactive.points as ChartRow[];
  const dim = activeId != null;
  const hasActive = activeId != null;

  const setFromBar = (row: unknown) => {
    const r = row as ChartRow;
    if (r?.pointId) setActiveId(r.pointId);
  };

  return (
    <div className="mt-4 space-y-4" onMouseLeave={() => setActiveId(null)}>
      <p className="text-[11px] leading-snug text-slate-500">
        График и список ниже связаны одним id точки (например период <span className="font-mono text-slate-400">2026-03</span> или
        категория). Наведите на столбец или строку — второй элемент подсветится.
      </p>
      <div className="h-[280px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 52 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.45} />
            <XAxis
              dataKey="label"
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              interval={0}
              angle={-32}
              textAnchor="end"
              height={72}
            />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} width={44} />
            <Tooltip content={<CustomTooltip valueKind={interactive.valueKind} />} />
            <Legend wrapperStyle={{ fontSize: 12, color: "#cbd5e1" }} />
            <Bar dataKey="plan" name="План" radius={[4, 4, 0, 0]} cursor="pointer" onMouseEnter={setFromBar}>
              {data.map((entry) => {
                const on = !dim || activeId === entry.pointId;
                const glow = activeId === entry.pointId;
                return (
                  <Cell
                    key={`${entry.pointId}-plan`}
                    fill={PLAN_FILL}
                    fillOpacity={on ? 1 : 0.3}
                    stroke={glow ? "#7dd3fc" : "transparent"}
                    strokeWidth={glow ? 2 : 0}
                    style={{
                      filter: glow ? "drop-shadow(0 0 10px rgba(56,189,248,0.55))" : undefined,
                    }}
                  />
                );
              })}
            </Bar>
            <Bar dataKey="fact" name="Факт" radius={[4, 4, 0, 0]} cursor="pointer" onMouseEnter={setFromBar}>
              {data.map((entry) => {
                const on = !dim || activeId === entry.pointId;
                const glow = activeId === entry.pointId;
                return (
                  <Cell
                    key={`${entry.pointId}-fact`}
                    fill={FACT_FILL}
                    fillOpacity={on ? 1 : 0.3}
                    stroke={glow ? "#6ee7b7" : "transparent"}
                    strokeWidth={glow ? 2 : 0}
                    style={{
                      filter: glow ? "drop-shadow(0 0 10px rgba(52,211,153,0.5))" : undefined,
                    }}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">По каждой точке</h4>
        <ul className="mt-2 space-y-1.5">
          {data.map((p) => {
            const on = activeId === p.pointId;
            return (
              <li
                key={`${blockId}-row-${p.pointId}`}
                onMouseEnter={() => setActiveId(p.pointId)}
                className={
                  on
                    ? "cursor-default rounded-lg border border-sky-500/50 bg-sky-950/55 px-2 py-2 font-mono text-[11px] leading-relaxed text-slate-100 shadow-[0_0_22px_-6px_rgba(56,189,248,0.55)]"
                    : hasActive
                      ? "cursor-default rounded-lg border border-transparent px-2 py-2 font-mono text-[11px] leading-relaxed text-slate-400 opacity-30"
                      : "cursor-default rounded-lg border border-transparent px-2 py-2 font-mono text-[11px] leading-relaxed text-slate-300"
                }
              >
                <span className="mr-2 inline-block min-w-[5.5rem] text-[10px] font-semibold text-sky-400/90">{p.pointId}</span>
                <span>{p.detailLine}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
