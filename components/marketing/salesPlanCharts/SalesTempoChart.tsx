"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import { dec1Fmt, numFmt } from "@/lib/salesPlanChartFormat";
import type { SalesTempoExplainMetricId } from "@/lib/salesPlanExplainMetricIds";
import { TEMPO_LINE_DATAKEY_TO_METRIC } from "@/lib/salesPlanExplainMetricIds";
import { lineLastDeviationPct, type SalesVelocityLineRow } from "@/lib/salesPlanVelocityChartData";

import { FormulaVariablesLegend, type FormulaVariableEntry } from "./FormulaVariablesLegend";
import { chartPresentationLike, type SalesPlanChartMode } from "./types";

const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false });
const ComposedChart = dynamic(() => import("recharts").then((m) => m.ComposedChart), { ssr: false });
const Area = dynamic(() => import("recharts").then((m) => m.Area), { ssr: false });
const Line = dynamic(() => import("recharts").then((m) => m.Line), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((m) => m.CartesianGrid), { ssr: false });

export type SalesTempoPresentationDetail = {
  formula: string;
  calculation: string;
  explanation: string;
  interpretation: string;
  variables?: FormulaVariableEntry[];
  sigmaNote?: string;
};

export type SalesTempoLineRow = SalesVelocityLineRow & {
  detailLine?: string;
  presentationDetail?: SalesTempoPresentationDetail;
};

function TempoTooltipMetricBridge({
  active,
  payload,
  onExplainMetricHover,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ dataKey?: unknown }>;
  onExplainMetricHover?: (id: SalesTempoExplainMetricId | null) => void;
}) {
  useLayoutEffect(() => {
    if (!onExplainMetricHover) return;
    if (!active || !payload?.length) {
      onExplainMetricHover(null);
      return;
    }
    const raw = payload[0]?.dataKey;
    const dk = typeof raw === "string" || typeof raw === "number" ? String(raw) : "";
    const id = dk ? TEMPO_LINE_DATAKEY_TO_METRIC[dk] : undefined;
    onExplainMetricHover(id ?? null);
  }, [active, payload, onExplainMetricHover]);
  return null;
}

function SalesVelocityLineTooltip({
  active,
  payload,
  label,
  presentation,
  mode,
  blockExplain,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: SalesTempoLineRow }>;
  label?: string;
  presentation: boolean;
  mode: SalesPlanChartMode;
  blockExplain?: { dataSources: string[]; formulaLines: string[]; howSection?: string };
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const shell =
    presentation
      ? "max-w-sm rounded-lg border border-cyan-500/30 bg-[#0f172a]/95 p-3 text-xs text-slate-200 shadow-[0_0_24px_rgba(56,189,248,0.12)]"
      : "max-w-sm rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-800 shadow-lg";
  const planLabel = mode === "explain" ? "План (норма/мес.)" : "Плановый темп";
  const factLabel = mode === "explain" ? "Факт (скольз./мес.)" : "Фактический темп";
  const ratioPct =
    row.plannedRate > 0 ? ((row.actualRate / row.plannedRate) * 100).toFixed(1) : "—";
  return (
    <div className={shell}>
      <div className={`font-semibold ${presentation ? "text-slate-100" : "text-slate-900"}`}>{label ?? row.label}</div>
      <div className="mt-2 space-y-1 tabular-nums">
        <div className="flex justify-between gap-4">
          <span className={presentation ? "text-slate-400" : "text-slate-500"}>{factLabel}</span>
          <span className="font-medium">{dec1Fmt.format(row.actualRate)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className={presentation ? "text-slate-400" : "text-slate-500"}>{planLabel}</span>
          <span className="font-medium">{dec1Fmt.format(row.plannedRate)}</span>
        </div>
        {mode === "explain" ? (
          <div className={`flex justify-between gap-4 border-t pt-1.5 ${presentation ? "border-slate-500/30" : "border-slate-200"}`}>
            <span className={presentation ? "text-slate-400" : "text-slate-500"}>Факт / план, %</span>
            <span className="font-semibold">{ratioPct}%</span>
          </div>
        ) : null}
        <div className={`flex justify-between gap-4 font-medium ${row.rateDelta >= 0 ? (presentation ? "text-emerald-300" : "text-emerald-700") : presentation ? "text-rose-300" : "text-rose-700"}`}>
          <span>{mode === "explain" ? "Отклонение от нормы" : "К плану"}</span>
          <span>
            {row.rateDelta >= 0 ? "+" : "−"}
            {dec1Fmt.format(Math.abs(row.rateDelta))} ({row.rateDeltaPct >= 0 ? "+" : ""}
            {row.rateDeltaPct.toFixed(1)}%)
          </span>
        </div>
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

function SalesTempoPresentationHoverStrip({ row, presentation }: { row: SalesTempoLineRow; presentation: boolean }) {
  const shell = presentation
    ? "pointer-events-none absolute left-2 top-2 z-10 max-w-[min(100%-1rem,200px)] rounded-md border border-cyan-500/35 bg-[#0f172a]/92 px-2 py-1 text-[9px] text-slate-200 shadow-md"
    : "pointer-events-none absolute left-2 top-2 z-10 max-w-[min(100%-1rem,200px)] rounded-md border border-slate-200 bg-white/95 px-2 py-1 text-[9px] text-slate-800 shadow-md";
  return (
    <div className={shell}>
      <div className={`font-semibold tabular-nums ${presentation ? "text-slate-100" : "text-slate-900"}`}>{row.label}</div>
      <div className={`mt-0.5 tabular-nums font-medium ${presentation ? "text-slate-200" : "text-slate-800"}`}>{dec1Fmt.format(row.actualRate)}</div>
    </div>
  );
}

function SalesTempoPresentationDetailPanel({
  row,
  presentation,
}: {
  row: SalesTempoLineRow;
  presentation: boolean;
}) {
  const shell = presentation
    ? "rounded-lg border border-cyan-500/30 bg-[#0f172a]/95 p-3 text-[10px] leading-snug text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    : "rounded-lg border border-slate-200 bg-white p-3 text-[10px] leading-snug text-slate-800 shadow-sm";
  const d = row.presentationDetail;
  return (
    <div className={shell}>
      <div className={`text-[11px] font-bold uppercase tracking-wide ${presentation ? "text-cyan-200/90" : "text-cyan-800"}`}>Точка: {row.label}</div>
      <div className="mt-2 space-y-1 tabular-nums">
        <div className="flex justify-between gap-2">
          <span className={presentation ? "text-slate-400" : "text-slate-500"}>Плановый темп</span>
          <span>{dec1Fmt.format(row.plannedRate)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className={presentation ? "text-slate-400" : "text-slate-500"}>Фактический темп</span>
          <span>{dec1Fmt.format(row.actualRate)}</span>
        </div>
        <div
          className={`flex justify-between gap-2 border-t pt-1 font-medium ${row.rateDelta >= 0 ? (presentation ? "border-slate-500/30 text-emerald-300" : "border-slate-200 text-emerald-700") : presentation ? "border-slate-500/30 text-rose-300" : "border-slate-200 text-rose-700"}`}
        >
          <span>К плану</span>
          <span>
            {row.rateDelta >= 0 ? "+" : "−"}
            {dec1Fmt.format(Math.abs(row.rateDelta))} ({row.rateDeltaPct >= 0 ? "+" : ""}
            {row.rateDeltaPct.toFixed(1)}%)
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

export type SalesTempoChartProps = {
  mode: SalesPlanChartMode;
  lineData: SalesTempoLineRow[];
  velocityCompletionPct: number;
  actualPerMonth: number;
  activePointId?: string | null;
  onPointHover?: (pointId: string | null) => void;
  /** Explain: подсветка карточки формулы по ряду графика (dataKey → metricId). */
  onExplainMetricHover?: (id: SalesTempoExplainMetricId | null) => void;
  blockExplain?: { dataSources: string[]; formulaLines: string[]; howSection?: string };
  /** Строка «факт / % к норме» под графиком. На explain-странице можно скрыть, если блок вынесен отдельно. */
  showVelocityFooter?: boolean;
  className?: string;
  chartHeightClass?: string;
};

export function SalesTempoChart({
  mode,
  lineData,
  velocityCompletionPct,
  actualPerMonth,
  activePointId = null,
  onPointHover,
  onExplainMetricHover,
  blockExplain,
  showVelocityFooter = true,
  className = "",
  chartHeightClass = "h-[300px]",
}: SalesTempoChartProps) {
  const uid = useId().replace(/:/g, "");
  const presentation = chartPresentationLike(mode);
  const presentationTooltipUx = mode === "presentation";
  const axisColor = presentation ? "#94a3b8" : "#64748b";
  const gridColor = presentation ? "rgba(148,163,184,0.12)" : "rgba(100,116,139,0.15)";
  const yTickDeals = (v: number) => numFmt.format(v);

  const velocityLineLastDeviationPct = useMemo(() => lineLastDeviationPct(lineData), [lineData]);

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
    if (i < 0 || i >= lineData.length) return null;
    return i;
  };

  const onPointClick = (idx: number | null) => {
    if (!presentationTooltipUx || idx == null) return;
    if (idx < 0 || idx >= lineData.length) return;
    setSelectedPoint(idx);
  };

  return (
    <div ref={rootRef} className={className}>
      <div className={`flex flex-col gap-3 xl:flex-row xl:items-stretch ${presentationTooltipUx ? "xl:gap-4" : ""}`}>
        <div className={`relative min-w-0 flex-1 ${chartHeightClass}`}>
          <div
            aria-hidden
            className={
              presentation
                ? "pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_62%,rgba(56,189,248,0.18)_0%,rgba(56,189,248,0.05)_38%,rgba(15,23,42,0)_74%)]"
                : "pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_62%,rgba(56,189,248,0.12)_0%,rgba(56,189,248,0.03)_36%,rgba(255,255,255,0)_72%)]"
            }
          />
          {presentationTooltipUx && hoverTickIndex != null && lineData[hoverTickIndex] ? (
            <SalesTempoPresentationHoverStrip row={lineData[hoverTickIndex]!} presentation={presentation} />
          ) : null}
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={lineData}
              margin={{ top: 12, right: 10, left: 0, bottom: 10 }}
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
              <linearGradient id={`${uid}-actualStroke`} x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="48%" stopColor="#fbbf24" />
                <stop offset="100%" stopColor="#fb7185" />
              </linearGradient>
              <linearGradient id={`${uid}-actualArea`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.32} />
                <stop offset="42%" stopColor="#fbbf24" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#fb7185" stopOpacity={0.03} />
              </linearGradient>
              <filter id={`${uid}-actualGlow`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id={`${uid}-lastDotGlow`} x="-120%" y="-120%" width="340%" height="340%">
                <feGaussianBlur stdDeviation="3.5" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 9 }} axisLine={{ stroke: gridColor }} tickLine={false} />
            <YAxis tick={{ fill: axisColor, fontSize: 9 }} axisLine={false} width={40} tickFormatter={yTickDeals} />
            {presentationTooltipUx ? (
              <Tooltip
                content={() => null}
                cursor={{ stroke: presentation ? "rgba(148,163,184,0.35)" : "rgba(100,116,139,0.45)", strokeWidth: 1 }}
                wrapperStyle={{ display: "none", pointerEvents: "none" }}
              />
            ) : (
              <Tooltip
                shared={!onExplainMetricHover}
                content={({ active, payload, label }) => (
                  <>
                    {onExplainMetricHover ? (
                      <TempoTooltipMetricBridge active={active} payload={payload} onExplainMetricHover={onExplainMetricHover} />
                    ) : null}
                    <SalesVelocityLineTooltip
                      active={active}
                      payload={payload}
                      label={label != null ? String(label) : undefined}
                      presentation={presentation}
                      mode={mode}
                      blockExplain={blockExplain}
                    />
                  </>
                )}
              />
            )}
            <Area
              type="monotone"
              dataKey="actualRate"
              stroke="none"
              fill={`url(#${uid}-actualArea)`}
              fillOpacity={1}
              baseLine={0}
              isAnimationActive={false}
              style={mode === "explain" && onExplainMetricHover ? { pointerEvents: "none" } : undefined}
            />
            <Line
              type="monotone"
              dataKey="plannedRate"
              name="Плановый темп"
              stroke={presentation ? "rgba(248,250,252,0.92)" : "#64748b"}
              strokeWidth={1.85}
              strokeDasharray="6 4"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="actualRate"
              name="Фактический темп"
              stroke={`url(#${uid}-actualStroke)`}
              strokeWidth={2.85}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={(dotProps: { cx?: number; cy?: number; index?: number; payload?: SalesTempoLineRow }) => {
                const { cx, cy, index, payload } = dotProps;
                if (cx == null || cy == null || index == null) return null;
                const isLast = index === lineData.length - 1;
                const pid = payload?.periodKey;
                const explainGlow = mode === "explain" && activePointId != null && pid === activePointId;

                if (presentationTooltipUx && !isLast) {
                  const sel = selectedPoint === index;
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={sel ? 6 : 3.5}
                      fill={sel ? "#fefce8" : "#38bdf8"}
                      stroke="#38bdf8"
                      strokeWidth={sel ? 2.2 : 1.1}
                      style={{ cursor: "pointer" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onPointClick(index);
                      }}
                    />
                  );
                }

                if (mode === "explain" && !isLast) {
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={explainGlow ? 8 : 4}
                      fill={explainGlow ? "#fefce8" : "#38bdf8"}
                      stroke="#38bdf8"
                      strokeWidth={explainGlow ? 2.5 : 1.2}
                      style={{ cursor: "pointer" }}
                      onMouseEnter={() => {
                        onPointHover?.(pid ?? null);
                        onExplainMetricHover?.("actualPerMonth");
                      }}
                    />
                  );
                }

                if (!isLast) return null;
                const presLastSel = presentationTooltipUx && selectedPoint === index;
                return (
                  <g
                    onMouseEnter={() => {
                      if (mode === "explain") {
                        onPointHover?.(pid ?? null);
                        onExplainMetricHover?.("actualPerMonth");
                      }
                    }}
                    onClick={(e) => {
                      if (!presentationTooltipUx) return;
                      e.stopPropagation();
                      onPointClick(index);
                    }}
                    style={presentationTooltipUx ? { cursor: "pointer" } : undefined}
                  >
                    <circle
                      cx={cx}
                      cy={cy}
                      r={explainGlow && mode === "explain" ? 14 : presLastSel ? 13 : 11}
                      fill="#38bdf8"
                      fillOpacity={explainGlow && mode === "explain" ? 0.32 : presLastSel ? 0.34 : 0.22}
                      filter={`url(#${uid}-lastDotGlow)`}
                    />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={explainGlow && mode === "explain" ? 8 : presLastSel ? 7.5 : 6}
                      fill="#fefce8"
                      stroke="#38bdf8"
                      strokeWidth={explainGlow && mode === "explain" ? 2.5 : presLastSel ? 2.6 : 2.2}
                    />
                    <g transform={`translate(${cx + 18}, ${cy - 16})`}>
                      <rect
                        x={0}
                        y={-11}
                        rx={999}
                        ry={999}
                        width={52}
                        height={24}
                        fill={
                          velocityLineLastDeviationPct < 0
                            ? presentation
                              ? "rgba(244,63,94,0.30)"
                              : "rgba(254,226,226,0.95)"
                            : presentation
                              ? "rgba(16,185,129,0.30)"
                              : "rgba(220,252,231,0.95)"
                        }
                        stroke={
                          velocityLineLastDeviationPct < 0
                            ? presentation
                              ? "rgba(251,113,133,0.65)"
                              : "rgba(225,29,72,0.5)"
                            : presentation
                              ? "rgba(52,211,153,0.65)"
                              : "rgba(22,163,74,0.5)"
                        }
                        style={{
                          filter:
                            velocityLineLastDeviationPct < 0
                              ? "drop-shadow(0 0 10px rgba(255,80,80,0.4))"
                              : "drop-shadow(0 0 10px rgba(34,197,94,0.35))",
                        }}
                      />
                      <text
                        x={26}
                        y={4}
                        textAnchor="middle"
                        className="text-[12px] font-bold tabular-nums"
                        fill={
                          velocityLineLastDeviationPct < 0
                            ? presentation
                              ? "#fecdd3"
                              : "#be123c"
                            : presentation
                              ? "#bbf7d0"
                              : "#166534"
                        }
                      >
                        {velocityLineLastDeviationPct >= 0 ? "+" : ""}
                        {velocityLineLastDeviationPct}%
                      </text>
                    </g>
                  </g>
                );
              }}
              isAnimationActive={false}
              style={{ filter: `url(#${uid}-actualGlow) drop-shadow(0 0 7px rgba(56,189,248,0.45))` }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {presentationTooltipUx ? (
        <aside className="w-full shrink-0 xl:w-[min(280px,34%)] xl:max-w-[280px]" aria-label="Подробности по выбранной точке">
          {selectedPoint != null && lineData[selectedPoint] ? (
            <SalesTempoPresentationDetailPanel row={lineData[selectedPoint]!} presentation={presentation} />
          ) : (
            <div
              className={
                presentation
                  ? "rounded-lg border border-cyan-500/20 bg-[#0f172a]/55 p-3 text-[10px] leading-snug text-slate-400"
                  : "rounded-lg border border-slate-200 bg-slate-50 p-3 text-[10px] leading-snug text-slate-600"
              }
            >
              Кликните по точке на линии, чтобы открыть подробную аналитику. При наведении — только период и фактический темп (без формул).
            </div>
          )}
        </aside>
      ) : null}
      </div>
      {showVelocityFooter ? (
        <div className={`flex h-[18px] items-center justify-center gap-x-3 text-[10px] font-medium leading-tight ${presentation ? "text-slate-400" : "text-slate-600"}`}>
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${presentation ? "bg-slate-300" : "bg-slate-500"}`} />
            <span>Факт</span>
          </span>
          <span aria-hidden>—</span>
          <span className="tabular-nums">{velocityCompletionPct}%</span>
          <span className={`font-semibold tabular-nums ${presentation ? "text-amber-200" : "text-amber-700"}`}>
            {dec1Fmt.format(actualPerMonth)} сделок
          </span>
        </div>
      ) : null}
    </div>
  );
}
