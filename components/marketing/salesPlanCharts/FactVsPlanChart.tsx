"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { compactRub, numFmt } from "@/lib/salesPlanChartFormat";
import type { SalesTempoExplainMetricId } from "@/lib/salesPlanExplainMetricIds";
import {
  barLastDeviationPct,
  velocityFactPlanBarFillId,
  velocityFactPlanWorstIndex,
  type MonthlyVelocityBarRow,
} from "@/lib/salesPlanVelocityChartData";

import { FormulaVariablesLegend, type FormulaVariableEntry } from "./FormulaVariablesLegend";
import { chartPresentationLike, type SalesPlanChartMode } from "./types";

const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false });
const ComposedChart = dynamic(() => import("recharts").then((m) => m.ComposedChart), { ssr: false });
const Bar = dynamic(() => import("recharts").then((m) => m.Bar), { ssr: false });
const Cell = dynamic(() => import("recharts").then((m) => m.Cell), { ssr: false });
const LabelList = dynamic(() => import("recharts").then((m) => m.LabelList), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((m) => m.CartesianGrid), { ssr: false });

export type FactVsPlanPresentationDetail = {
  formula: string;
  calculation: string;
  explanation: string;
  interpretation: string;
  variables?: FormulaVariableEntry[];
  sigmaNote?: string;
};

export type FactVsPlanBarRow = MonthlyVelocityBarRow & {
  /** Текст пояснения для explain-тултипа */
  detailLine?: string;
  presentationDetail?: FactVsPlanPresentationDetail;
};

function FactVsPlanTooltip({
  active,
  payload,
  label,
  presentation,
  valueKind,
  mode,
  blockExplain,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: FactVsPlanBarRow }>;
  label?: string;
  presentation: boolean;
  valueKind: "deals" | "rub";
  mode: SalesPlanChartMode;
  blockExplain?: { dataSources: string[]; formulaLines: string[]; howSection?: string };
}) {
  if (!active || !payload?.length) return null;
  const row = payload.map((item) => item?.payload).find(
    (p): p is FactVsPlanBarRow =>
      p != null &&
      typeof (p as { fact?: unknown }).fact === "number" &&
      typeof (p as { plan?: unknown }).plan === "number",
  );
  if (!row) return null;
  const dev = row.deviation ?? row.fact - row.plan;
  const shell =
    presentation
      ? "max-w-sm rounded-lg border border-sky-500/30 bg-[#0f172a]/95 p-3 text-xs text-slate-200 shadow-[0_0_20px_rgba(56,189,248,0.14)]"
      : "max-w-sm rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-800 shadow-lg";

  const fmtVal = (n: number) =>
    valueKind === "deals" ? numFmt.format(n) : compactRub(n);

  return (
    <div className={shell}>
      <div className={`text-[11px] font-bold uppercase tracking-wide ${presentation ? "text-sky-200/90" : "text-sky-800"}`}>
        Факт vs План
      </div>
      <div className={`mt-1 font-semibold ${presentation ? "text-slate-100" : "text-slate-900"}`}>{label ?? row.label}</div>
      <div className="mt-2 space-y-1.5 tabular-nums">
        <div className="flex justify-between gap-4">
          <span className={presentation ? "text-slate-400" : "text-slate-500"}>Факт</span>
          <span className="font-medium">{fmtVal(row.fact)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className={presentation ? "text-slate-400" : "text-slate-500"}>План</span>
          <span className="font-medium">{fmtVal(row.plan)}</span>
        </div>
        <div className={`flex justify-between gap-4 border-t pt-1.5 ${presentation ? "border-slate-500/30" : "border-slate-200"}`}>
          <span className={presentation ? "text-slate-400" : "text-slate-500"}>Отклонение</span>
          <span
            className={`font-semibold ${
              dev > 0 ? (presentation ? "text-emerald-300" : "text-emerald-700") : dev < 0 ? (presentation ? "text-rose-300" : "text-rose-700") : presentation ? "text-slate-300" : "text-slate-600"
            }`}
          >
            {dev >= 0 ? "+" : "−"}
            {valueKind === "deals" ? numFmt.format(Math.abs(dev)) : compactRub(Math.abs(dev))}
          </span>
        </div>
        {mode === "explain" && row.plan > 0 ? (
          <div className={`flex justify-between gap-4 ${presentation ? "text-slate-300" : "text-slate-700"}`}>
            <span className={presentation ? "text-slate-400" : "text-slate-500"}>Факт / план, %</span>
            <span className="font-semibold tabular-nums">{((row.fact / row.plan) * 100).toFixed(1)}%</span>
          </div>
        ) : null}
      </div>
      {mode === "explain" && blockExplain ? (
        <div className={`mt-3 space-y-2 border-t pt-2 ${presentation ? "border-slate-500/30" : "border-slate-200"}`}>
          {blockExplain.dataSources.length > 0 ? (
            <div>
              <div className={`text-[10px] font-bold uppercase ${presentation ? "text-slate-400" : "text-slate-500"}`}>Источники</div>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-[10px] leading-snug">
                {blockExplain.dataSources.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {blockExplain.formulaLines.length > 0 ? (
            <div>
              <div className={`text-[10px] font-bold uppercase ${presentation ? "text-slate-400" : "text-slate-500"}`}>Формулы</div>
              <ol className="mt-1 list-inside list-decimal space-y-0.5 font-mono text-[10px] leading-snug">
                {blockExplain.formulaLines.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ol>
            </div>
          ) : null}
          {row.detailLine ? (
            <p className={`text-[10px] leading-snug ${presentation ? "text-slate-300" : "text-slate-600"}`}>
              <span className="font-semibold">По точке: </span>
              {row.detailLine}
            </p>
          ) : null}
          {blockExplain.howSection ? (
            <p className={`text-[10px] leading-snug ${presentation ? "text-slate-400" : "text-slate-600"}`}>
              <span className="font-semibold">Как считается: </span>
              {blockExplain.howSection}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FactVsPlanPresentationHoverStrip({
  row,
  presentation,
  valueKind,
}: {
  row: FactVsPlanBarRow;
  presentation: boolean;
  valueKind: "deals" | "rub";
}) {
  const fmtVal = (n: number) => (valueKind === "deals" ? numFmt.format(n) : compactRub(n));
  const shell = presentation
    ? "pointer-events-none absolute left-2 top-2 z-10 max-w-[min(100%-1rem,200px)] rounded-md border border-sky-500/35 bg-[#0f172a]/92 px-2 py-1 text-[9px] text-slate-200 shadow-md"
    : "pointer-events-none absolute left-2 top-2 z-10 max-w-[min(100%-1rem,200px)] rounded-md border border-slate-200 bg-white/95 px-2 py-1 text-[9px] text-slate-800 shadow-md";
  return (
    <div className={shell}>
      <div className={`font-semibold tabular-nums ${presentation ? "text-slate-100" : "text-slate-900"}`}>{row.label}</div>
      <div className={`mt-0.5 tabular-nums font-medium ${presentation ? "text-slate-200" : "text-slate-800"}`}>{fmtVal(row.fact)}</div>
    </div>
  );
}

function FactVsPlanPresentationDetailPanel({
  row,
  presentation,
  valueKind,
}: {
  row: FactVsPlanBarRow;
  presentation: boolean;
  valueKind: "deals" | "rub";
}) {
  const dev = row.deviation ?? row.fact - row.plan;
  const fmtVal = (n: number) => (valueKind === "deals" ? numFmt.format(n) : compactRub(n));
  const shell = presentation
    ? "rounded-lg border border-sky-500/30 bg-[#0f172a]/95 p-3 text-[10px] leading-snug text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    : "rounded-lg border border-slate-200 bg-white p-3 text-[10px] leading-snug text-slate-800 shadow-sm";
  const d = row.presentationDetail;
  return (
    <div className={shell}>
      <div className={`text-[11px] font-bold uppercase tracking-wide ${presentation ? "text-sky-200/90" : "text-sky-800"}`}>Месяц: {row.label}</div>
      <div className="mt-2 space-y-1.5 tabular-nums">
        <div className="flex justify-between gap-2">
          <span className={presentation ? "text-slate-400" : "text-slate-500"}>Факт</span>
          <span className="font-medium">{fmtVal(row.fact)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className={presentation ? "text-slate-400" : "text-slate-500"}>План</span>
          <span className="font-medium">{fmtVal(row.plan)}</span>
        </div>
        <div className={`flex justify-between gap-2 border-t pt-1.5 ${presentation ? "border-slate-500/30" : "border-slate-200"}`}>
          <span className={presentation ? "text-slate-400" : "text-slate-500"}>Отклонение</span>
          <span
            className={`font-semibold ${
              dev > 0 ? (presentation ? "text-emerald-300" : "text-emerald-700") : dev < 0 ? (presentation ? "text-rose-300" : "text-rose-700") : presentation ? "text-slate-300" : "text-slate-600"
            }`}
          >
            {dev >= 0 ? "+" : "−"}
            {valueKind === "deals" ? numFmt.format(Math.abs(dev)) : compactRub(Math.abs(dev))}
          </span>
        </div>
      </div>
      {d ? (
        <div className={`mt-3 space-y-2 border-t pt-2 ${presentation ? "border-slate-500/30" : "border-slate-200"}`}>
          <div>
            <div className={`text-[9px] font-bold uppercase ${presentation ? "text-slate-400" : "text-slate-500"}`}>Формула</div>
            <p className="mt-0.5">{d.formula}</p>
            <FormulaVariablesLegend variables={d.variables} sigmaNote={d.sigmaNote} presentation={presentation} />
          </div>
          <div>
            <div className={`text-[9px] font-bold uppercase ${presentation ? "text-slate-400" : "text-slate-500"}`}>Подстановка</div>
            <p className="mt-0.5 font-mono text-[9px]">{d.calculation}</p>
          </div>
          <div>
            <div className={`text-[9px] font-bold uppercase ${presentation ? "text-slate-400" : "text-slate-500"}`}>Пояснение</div>
            <p className="mt-0.5">{d.explanation}</p>
          </div>
          <div>
            <div className={`text-[9px] font-bold uppercase ${presentation ? "text-slate-400" : "text-slate-500"}`}>Интерпретация</div>
            <p className="mt-0.5">{d.interpretation}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export type FactVsPlanChartProps = {
  mode: SalesPlanChartMode;
  rows: FactVsPlanBarRow[];
  valueKind?: "deals" | "rub";
  velocityCompletionPct?: number;
  /** Подпись слева в легенде снизу (только для темпа сделок) */
  legendFactLabel?: string;
  /** Explain: подсветка и тултип */
  activePointId?: string | null;
  onPointHover?: (pointId: string | null) => void;
  /** Explain «Темп продаж»: связь столбцов/легенды с карточками формул. */
  onExplainMetricHover?: (id: SalesTempoExplainMetricId | null) => void;
  blockExplain?: { dataSources: string[]; formulaLines: string[]; howSection?: string };
  className?: string;
  chartHeightClass?: string;
};

export function FactVsPlanChart({
  mode,
  rows,
  valueKind = "deals",
  velocityCompletionPct,
  legendFactLabel = "Факт",
  activePointId = null,
  onPointHover,
  onExplainMetricHover,
  blockExplain,
  className = "",
  chartHeightClass = "h-[300px]",
}: FactVsPlanChartProps) {
  const uid = useId().replace(/:/g, "");
  const presentation = chartPresentationLike(mode);
  const presentationTooltipUx = mode === "presentation";
  const axisColor = presentation ? "#94a3b8" : "#64748b";
  const gridColor = presentation ? "rgba(148,163,184,0.12)" : "rgba(100,116,139,0.15)";
  const yTick = (v: number) => (valueKind === "deals" ? numFmt.format(v) : compactRub(v));

  const worstIdx = useMemo(() => velocityFactPlanWorstIndex(rows), [rows]);
  const lastDevPct = useMemo(() => barLastDeviationPct(rows), [rows]);

  const rootRef = useRef<HTMLDivElement>(null);
  const [hoverTickIndex, setHoverTickIndex] = useState<number | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);

  useEffect(() => {
    if (!presentationTooltipUx) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = rootRef.current;
      const t = e.target as Node | null;
      if (!el || !t || !el.contains(t)) setSelectedPoint(null);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [presentationTooltipUx]);

  const resolveTickIndex = (raw: number | string | undefined) => {
    if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
    const i = Math.round(raw);
    if (i < 0 || i >= rows.length) return null;
    return i;
  };

  const onPointClick = (idx: number | null) => {
    if (!presentationTooltipUx || idx == null) return;
    if (idx < 0 || idx >= rows.length) return;
    setSelectedPoint(idx);
  };

  const setHoverFromPayload = (p: unknown) => {
    if (mode !== "explain" || !onPointHover) return;
    const row = p as FactVsPlanBarRow;
    const id = row?.pointId ?? row?.periodKey ?? null;
    onPointHover(id);
  };

  const onPlanBarEnter = (p: unknown) => {
    setHoverFromPayload(p);
    if (mode === "explain") onExplainMetricHover?.("monthlyCompare");
  };

  const onFactBarEnter = (p: unknown) => {
    setHoverFromPayload(p);
    if (mode === "explain") onExplainMetricHover?.("monthlyRatio");
  };

  const barPresentationClick = (item: { originalDataIndex?: number }, _index: number) => {
    const idx = typeof item.originalDataIndex === "number" ? item.originalDataIndex : _index;
    onPointClick(idx);
  };

  const dim = mode === "explain" && activePointId != null;

  return (
    <div ref={rootRef} className={className}>
      <div className={`flex flex-col gap-3 xl:flex-row xl:items-stretch ${presentationTooltipUx ? "xl:gap-4" : ""}`}>
        <div className={`relative min-w-0 flex-1 ${chartHeightClass}`}>
          <div
            aria-hidden
            className={
              presentation
                ? "pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_52%_62%,rgba(250,204,21,0.16)_0%,rgba(250,204,21,0.05)_36%,rgba(15,23,42,0)_74%)]"
                : "pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_52%_62%,rgba(250,204,21,0.11)_0%,rgba(250,204,21,0.03)_34%,rgba(255,255,255,0)_72%)]"
            }
          />
          {presentationTooltipUx && hoverTickIndex != null && rows[hoverTickIndex] ? (
            <FactVsPlanPresentationHoverStrip row={rows[hoverTickIndex]!} presentation={presentation} valueKind={valueKind} />
          ) : null}
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={rows}
              margin={{ top: 6, right: 10, left: 0, bottom: 2 }}
              barGap="-100%"
              barCategoryGap="14%"
              onMouseMove={(s) => {
                if (presentationTooltipUx) {
                  const idx = resolveTickIndex(s.activeTooltipIndex as number | undefined);
                  setHoverTickIndex(idx);
                }
              }}
              onMouseLeave={() => {
                if (mode === "explain") {
                  onPointHover?.(null);
                  onExplainMetricHover?.(null);
                }
                if (presentationTooltipUx) setHoverTickIndex(null);
              }}
            >
            <defs>
              <linearGradient id={`${uid}-barGreen`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#bbf7d0" />
                <stop offset="40%" stopColor="#4ade80" />
                <stop offset="100%" stopColor="#15803d" />
              </linearGradient>
              <linearGradient id={`${uid}-barYellow`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fef9c3" />
                <stop offset="45%" stopColor="#facc15" />
                <stop offset="100%" stopColor="#a16207" />
              </linearGradient>
              <linearGradient id={`${uid}-barRed`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fecdd3" />
                <stop offset="50%" stopColor="#f87171" />
                <stop offset="100%" stopColor="#b91c1c" />
              </linearGradient>
              <filter id={`${uid}-barSoftGlow`} x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="2.4" result="bg" />
                <feMerge>
                  <feMergeNode in="bg" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 9 }} axisLine={{ stroke: gridColor }} tickLine={false} />
            <YAxis tick={{ fill: axisColor, fontSize: 9 }} axisLine={false} width={40} tickFormatter={yTick} />
            {presentationTooltipUx ? (
              <Tooltip
                content={() => null}
                cursor={{ fill: presentation ? "rgba(148,163,184,0.07)" : "rgba(100,116,139,0.08)" }}
                wrapperStyle={{ display: "none", pointerEvents: "none" }}
              />
            ) : (
              <Tooltip
                content={({ active, payload, label }) => (
                  <FactVsPlanTooltip
                    active={active}
                    payload={payload}
                    label={label != null ? String(label) : undefined}
                    presentation={presentation}
                    valueKind={valueKind}
                    mode={mode}
                    blockExplain={blockExplain}
                  />
                )}
              />
            )}
            <Bar
              dataKey="plan"
              name="План"
              fill={presentation ? "rgba(255,255,255,0.42)" : "rgba(71,85,105,0.4)"}
              stroke={presentation ? "rgba(255,255,255,0.28)" : "rgba(100,116,139,0.45)"}
              strokeWidth={0.9}
              maxBarSize={36}
              radius={[8, 8, 2, 2]}
              isAnimationActive={false}
              legendType="rect"
              onMouseEnter={mode === "explain" ? onPlanBarEnter : setHoverFromPayload}
              onClick={presentationTooltipUx ? barPresentationClick : undefined}
            >
              {presentationTooltipUx
                ? rows.map((entry, index) => {
                    const sel = selectedPoint === index;
                    return (
                      <Cell
                        key={`plan-${entry.label}-${index}`}
                        fill={presentation ? "rgba(255,255,255,0.42)" : "rgba(71,85,105,0.4)"}
                        stroke={
                          sel
                            ? "#7dd3fc"
                            : presentation
                              ? "rgba(255,255,255,0.28)"
                              : "rgba(100,116,139,0.45)"
                        }
                        strokeWidth={sel ? 2.4 : 0.9}
                      />
                    );
                  })
                : mode === "explain"
                  ? rows.map((entry, index) => {
                      const pid = entry.pointId ?? entry.periodKey;
                      const on = !dim || activePointId === pid;
                      const glow = activePointId === pid;
                      return (
                        <Cell
                          key={`plan-${entry.label}-${index}`}
                          fill={presentation ? "rgba(255,255,255,0.42)" : "rgba(71,85,105,0.4)"}
                          fillOpacity={on ? 1 : 0.28}
                          stroke={glow ? (presentation ? "#e2e8f0" : "#475569") : presentation ? "rgba(255,255,255,0.28)" : "rgba(100,116,139,0.45)"}
                          strokeWidth={glow ? 2.2 : 0.9}
                        />
                      );
                    })
                  : null}
            </Bar>
            <Bar
              dataKey="fact"
              name="Факт"
              fill={`url(#${uid}-barYellow)`}
              maxBarSize={24}
              radius={[7, 7, 2, 2]}
              style={{ filter: `url(#${uid}-barSoftGlow)` }}
              legendType="rect"
              onMouseEnter={mode === "explain" ? onFactBarEnter : setHoverFromPayload}
              onClick={presentationTooltipUx ? barPresentationClick : undefined}
            >
              {rows.map((entry, index) => {
                const pid = entry.pointId ?? entry.periodKey;
                const isWorst = index === worstIdx && worstIdx >= 0;
                const baseFill = velocityFactPlanBarFillId(uid, entry);
                const explainDim = mode === "explain" && dim && activePointId !== pid;
                const glow = mode === "explain" && activePointId === pid;
                const presSel = presentationTooltipUx && selectedPoint === index;
                return (
                  <Cell
                    key={`velocity-fact-${entry.label}-${index}`}
                    fill={baseFill}
                    fillOpacity={explainDim ? 0.35 : 1}
                    stroke={
                      presSel
                        ? "#e0f2fe"
                        : glow
                          ? "#38bdf8"
                          : isWorst
                            ? presentation
                              ? "#fda4af"
                              : "#e11d48"
                            : presentation
                              ? "rgba(255,255,255,0.38)"
                              : "rgba(248,250,252,0.65)"
                    }
                    strokeWidth={presSel ? 3.1 : glow ? 3 : isWorst ? 2.75 : 1.1}
                    style={
                      presSel
                        ? { filter: "drop-shadow(0 0 14px rgba(56,189,248,0.55))" }
                        : glow
                          ? { filter: "drop-shadow(0 0 12px rgba(56,189,248,0.65))" }
                          : isWorst
                            ? { filter: "drop-shadow(0 0 10px rgba(244,63,94,0.75))" }
                            : undefined
                    }
                  />
                );
              })}
              <LabelList
                dataKey="fact"
                content={(props: { x?: number | string; y?: number | string; width?: number | string; index?: number }) => {
                  if (props.index !== rows.length - 1) return null;
                  const x = typeof props.x === "number" ? props.x : Number(props.x);
                  const y = typeof props.y === "number" ? props.y : Number(props.y);
                  const width = typeof props.width === "number" ? props.width : Number(props.width);
                  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width)) return null;
                  const cx = x + width + 14;
                  const cy = y - 14;
                  return (
                    <g>
                      <rect
                        x={cx - 26}
                        y={cy - 12}
                        rx={999}
                        ry={999}
                        width={52}
                        height={24}
                        fill={
                          lastDevPct < 0
                            ? presentation
                              ? "rgba(244,63,94,0.30)"
                              : "rgba(254,226,226,0.95)"
                            : presentation
                              ? "rgba(16,185,129,0.30)"
                              : "rgba(220,252,231,0.95)"
                        }
                        stroke={
                          lastDevPct < 0
                            ? presentation
                              ? "rgba(251,113,133,0.65)"
                              : "rgba(225,29,72,0.5)"
                            : presentation
                              ? "rgba(52,211,153,0.65)"
                              : "rgba(22,163,74,0.5)"
                        }
                        style={{
                          filter:
                            lastDevPct < 0
                              ? "drop-shadow(0 0 10px rgba(255,80,80,0.4))"
                              : "drop-shadow(0 0 10px rgba(34,197,94,0.35))",
                        }}
                      />
                      <text
                        x={cx}
                        y={cy + 4}
                        textAnchor="middle"
                        className="text-[12px] font-bold tabular-nums"
                        fill={
                          lastDevPct < 0
                            ? presentation
                              ? "#fecdd3"
                              : "#be123c"
                            : presentation
                              ? "#bbf7d0"
                              : "#166534"
                        }
                      >
                        {lastDevPct >= 0 ? "+" : ""}
                        {lastDevPct}%
                      </text>
                    </g>
                  );
                }}
              />
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {presentationTooltipUx ? (
        <aside className="w-full shrink-0 xl:w-[min(280px,34%)] xl:max-w-[280px]" aria-label="Подробности по выбранному месяцу">
          {selectedPoint != null && rows[selectedPoint] ? (
            <FactVsPlanPresentationDetailPanel row={rows[selectedPoint]!} presentation={presentation} valueKind={valueKind} />
          ) : (
            <div
              className={
                presentation
                  ? "rounded-lg border border-sky-500/20 bg-[#0f172a]/55 p-3 text-[10px] leading-snug text-slate-400"
                  : "rounded-lg border border-slate-200 bg-slate-50 p-3 text-[10px] leading-snug text-slate-600"
              }
            >
              Кликните по столбцу месяца, чтобы открыть подробную аналитику. При наведении — только период и факт (без формул).
            </div>
          )}
        </aside>
      ) : null}
      </div>
      <div
        role="group"
        aria-label="Легенда графика: факт и план"
        className={`flex h-[18px] items-center justify-center gap-x-7 text-[10px] font-medium leading-tight ${presentation ? "text-slate-400" : "text-slate-600"}`}
      >
        <div
          className={`flex items-center gap-2 ${mode === "explain" && onExplainMetricHover ? "cursor-help rounded px-1 py-0.5 hover:bg-white/5" : ""}`}
          onMouseEnter={() => mode === "explain" && onExplainMetricHover?.("barRead")}
          onMouseLeave={() => mode === "explain" && onExplainMetricHover?.(null)}
        >
          <span
            className="h-3 w-4 shrink-0 rounded-sm shadow-sm"
            style={{
              background: presentation
                ? "linear-gradient(180deg, #4ade80 0%, #facc15 55%, #f87171 100%)"
                : "linear-gradient(180deg, #16a34a 0%, #ca8a04 55%, #dc2626 100%)",
            }}
          />
          <span>{legendFactLabel}</span>
        </div>
        {velocityCompletionPct != null ? (
          <span
            className={`inline-flex items-center gap-1 tabular-nums ${mode === "explain" && onExplainMetricHover ? "cursor-help rounded px-1 py-0.5 hover:bg-white/5" : ""}`}
            onMouseEnter={() => mode === "explain" && onExplainMetricHover?.("ratio")}
            onMouseLeave={() => mode === "explain" && onExplainMetricHover?.(null)}
          >
            <span aria-hidden>—</span>
            <span>{velocityCompletionPct}%</span>
          </span>
        ) : null}
        <div
          className={`flex items-center gap-2 ${mode === "explain" && onExplainMetricHover ? "cursor-help rounded px-1 py-0.5 hover:bg-white/5" : ""}`}
          onMouseEnter={() => mode === "explain" && onExplainMetricHover?.("monthlyCompare")}
          onMouseLeave={() => mode === "explain" && onExplainMetricHover?.(null)}
        >
          <span className={`h-3 w-4 shrink-0 rounded-sm border ${presentation ? "border-white/25 bg-white/[0.42]" : "border-slate-400/50 bg-slate-500/40"}`} />
          <span>План</span>
        </div>
      </div>
    </div>
  );
}
