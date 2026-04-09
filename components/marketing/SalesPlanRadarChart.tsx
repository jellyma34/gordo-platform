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

const rubFmt = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});
const numFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const compactRub = (n: number) =>
  Math.abs(n) >= 1_000_000
    ? `${n < 0 ? "−" : ""}${numFmt.format(Math.round(Math.abs(n) / 1_000_000))} млн ₽`
    : rubFmt.format(n);

export type RadarChartRow = {
  subject: string;
  categoryLabel: string;
  planCumulative: number;
  factCumulative: number;
  valuePct: number;
  deltaPct: number;
  deltaRub: number;
  planBase: number;
  valueDisplay: number;
  tone: "red" | "yellow" | "green";
};

function getTone(valuePct: number): RadarChartRow["tone"] {
  if (valuePct < 80) return "red";
  if (valuePct <= 100) return "yellow";
  return "green";
}

function buildRows(categories: SalesRadarCategoryRow[]): RadarChartRow[] {
  return categories.map((c) => {
    const plan = c.planCumulative;
    const fact = c.factCumulative;
    const valuePctRaw = plan > 0 ? (fact / plan) * 100 : 0;
    const valuePct = Math.round(valuePctRaw * 10) / 10;
    const deltaPct = Math.round((valuePct - 100) * 10) / 10;
    const cap = 140;
    return {
      subject: c.axisLabel,
      categoryLabel: c.name,
      planCumulative: plan,
      factCumulative: fact,
      valuePct,
      deltaPct,
      deltaRub: fact - plan,
      planBase: 100,
      valueDisplay: Math.min(cap, valuePct),
      tone: getTone(valuePct),
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
  const devSignRub = row.deltaRub < 0 ? "−" : "+";
  const devSignPct = row.deltaPct < 0 ? "−" : "+";
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
        <div className="tabular-nums">К плану: {row.valuePct.toFixed(1)}%</div>
        <div
          className={
            presentation
              ? row.deltaRub < 0
                ? "text-red-300"
                : row.deltaRub > 0
                  ? "text-emerald-300"
                  : "text-slate-400"
              : row.deltaRub < 0
                ? "text-red-600"
                : row.deltaRub > 0
                  ? "text-emerald-600"
                  : "text-slate-500"
          }
        >
          Отклонение: {devSignPct}
          {Math.abs(row.deltaPct).toFixed(1)}% ({devSignRub}
          {rubFmt.format(Math.abs(row.deltaRub))})
        </div>
      </div>
    </div>
  );
}

type Props = {
  categories: SalesRadarCategoryRow[];
  presentation: boolean;
  centerPercentComplete?: number;
  centerDeviationRub?: number;
};

function tonePalette(tone: RadarChartRow["tone"]): { stroke: string; fill: string } {
  if (tone === "red") return { stroke: "#ef4444", fill: "rgba(239,68,68,0.18)" };
  if (tone === "yellow") return { stroke: "#f59e0b", fill: "rgba(245,158,11,0.16)" };
  return { stroke: "#22c55e", fill: "rgba(34,197,94,0.16)" };
}

function SegmentRadarShape({
  points,
  cx,
  cy,
}: {
  points?: Array<{ x: number; y: number; payload?: RadarChartRow }>;
  cx?: number;
  cy?: number;
}) {
  if (!points?.length || cx == null || cy == null) return null;
  return (
    <g>
      {points.map((p, i) => {
        const next = points[(i + 1) % points.length];
        if (!next) return null;
        const tone = p.payload?.tone ?? "yellow";
        const { stroke, fill } = tonePalette(tone);
        return (
          <g key={`seg-${i}`}>
            {/* Colored segment area: center -> point -> next point */}
            <path d={`M ${cx} ${cy} L ${p.x} ${p.y} L ${next.x} ${next.y} Z`} fill={fill} stroke="none" />
            {/* Colored edge for this category segment */}
            <line x1={p.x} y1={p.y} x2={next.x} y2={next.y} stroke={stroke} strokeWidth={2} strokeLinecap="round" />
            {/* Colored spoke from center to point */}
            <line x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={stroke} strokeWidth={1.4} strokeLinecap="round" opacity={0.9} />
          </g>
        );
      })}
    </g>
  );
}

export function SalesPlanRadarChart({ categories, presentation, centerPercentComplete, centerDeviationRub }: Props) {
  const data = useMemo(() => buildRows(categories), [categories]);
  const weak = useMemo(() => data.filter((r) => r.valuePct < 90).sort((a, b) => a.valuePct - b.valuePct), [data]);
  const strong = useMemo(() => data.filter((r) => r.valuePct > 100).sort((a, b) => b.valuePct - a.valuePct), [data]);
  const totalPlan = useMemo(() => data.reduce((s, r) => s + r.planCumulative, 0), [data]);
  const totalFact = useMemo(() => data.reduce((s, r) => s + r.factCumulative, 0), [data]);
  const centerPct = centerPercentComplete ?? (totalPlan > 0 ? (totalFact / totalPlan) * 100 : 0);
  const centerDev = centerDeviationRub ?? totalFact - totalPlan;

  const gridStroke = presentation ? "rgba(148,163,184,0.12)" : "rgba(100,116,139,0.14)";
  const tickFill = presentation ? "#94a3b8" : "#64748b";
  const planStroke = presentation ? "rgba(226, 232, 240, 0.45)" : "rgba(100, 116, 139, 0.5)";
  const factStroke = presentation ? "rgba(148,163,184,0.15)" : "rgba(100,116,139,0.2)";
  const centerTone =
    centerPct < 80
      ? presentation
        ? "text-red-300"
        : "text-red-700"
      : centerPct <= 100
        ? presentation
          ? "text-amber-300"
          : "text-amber-700"
        : presentation
          ? "text-emerald-300"
          : "text-emerald-700";

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[68%_32%]">
      <div className="flex min-w-0 items-center justify-center">
        <div className="relative h-[340px] w-full max-w-[520px] lg:min-w-[420px] sm:h-[380px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="52%" outerRadius="72%" data={data} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
            <PolarGrid radialLines={false} stroke={gridStroke} />
            <PolarAngleAxis dataKey="subject" tick={{ fill: tickFill, fontSize: 11, fontWeight: 600 }} tickLine={false} />
            <PolarRadiusAxis axisLine={false} tick={false} tickCount={3} domain={[0, 140]} />
            <Radar
              name="План (100%)"
              dataKey="planBase"
              stroke={planStroke}
              strokeWidth={1.1}
              strokeDasharray="4 4"
              fill="none"
              dot={false}
              isAnimationActive={false}
            />
            <Radar
              name="Факт"
              dataKey="valueDisplay"
              stroke={factStroke}
              strokeWidth={0.8}
              fill="none"
              shape={<SegmentRadarShape />}
              dot={(props: { cx?: number; cy?: number; payload?: RadarChartRow }) => {
                const { cx, cy, payload } = props;
                if (cx == null || cy == null || !payload) return null;
                const fill = payload.tone === "red" ? "#ef4444" : payload.tone === "yellow" ? "#f59e0b" : "#22c55e";
                return <circle cx={cx} cy={cy} r={4.5} fill={fill} stroke={presentation ? "#0f172a" : "#ffffff"} strokeWidth={1.5} />;
              }}
              isAnimationActive
              animationDuration={850}
            />
            <Tooltip content={<RadarTooltipContent presentation={presentation} />} />
          </RadarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className={
              presentation
                ? "rounded-full border border-slate-600/50 bg-[#0f172a]/90 px-4 py-3 text-center shadow-lg"
                : "rounded-full border border-slate-200 bg-white/90 px-4 py-3 text-center shadow-sm"
            }
          >
            <div className={`text-xl font-black tabular-nums ${centerTone}`}>{centerPct.toFixed(0)}%</div>
            <div
              className={`text-[11px] font-semibold tabular-nums ${
                centerDev < 0
                  ? presentation
                    ? "text-red-300"
                    : "text-red-700"
                  : presentation
                    ? "text-emerald-300"
                    : "text-emerald-700"
              }`}
            >
              {centerDev < 0 ? "−" : "+"}
              {compactRub(Math.abs(centerDev))}
            </div>
          </div>
        </div>
      </div>
      </div>

      <div className={presentation ? "rounded-xl border border-slate-600/50 bg-slate-900/35 p-2.5" : "rounded-xl border border-slate-200 bg-slate-50 p-2.5"}>
        <div className={`text-[11px] ${presentation ? "text-slate-400" : "text-slate-600"}`}>Аналитика сегментов</div>
        <div className="mt-3">
          <div className={`text-xs font-semibold uppercase ${presentation ? "text-red-300" : "text-red-700"}`}>Слабые сегменты</div>
          <ul className="mt-1.5 space-y-1.5">
            {weak.length ? weak.slice(0, 3).map((r) => (
              <li key={r.categoryLabel} className={`text-xs ${presentation ? "text-slate-200" : "text-slate-800"}`}>
                {r.categoryLabel}: {r.valuePct.toFixed(1)}% ({r.deltaRub < 0 ? "−" : "+"}
                {compactRub(Math.abs(r.deltaRub))})
              </li>
            )) : <li className={`text-xs ${presentation ? "text-slate-400" : "text-slate-500"}`}>Критичных просадок нет</li>}
          </ul>
        </div>
        <div className="mt-4">
          <div className={`text-xs font-semibold uppercase ${presentation ? "text-emerald-300" : "text-emerald-700"}`}>Сильные сегменты</div>
          <ul className="mt-1.5 space-y-1.5">
            {strong.length ? strong.slice(0, 3).map((r) => (
              <li key={r.categoryLabel} className={`text-xs ${presentation ? "text-slate-200" : "text-slate-800"}`}>
                {r.categoryLabel}: {r.valuePct.toFixed(1)}% (+{compactRub(Math.abs(r.deltaRub))})
              </li>
            )) : <li className={`text-xs ${presentation ? "text-slate-400" : "text-slate-500"}`}>Сегментов выше 100% нет</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
