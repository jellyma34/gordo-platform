"use client";

import type { ReactNode } from "react";

import { FormulaVariablesLegend, type FormulaVariableEntry } from "@/components/marketing/salesPlanCharts";

export type KpiCardTone = "green" | "yellow" | "red";

export type KpiDashboardMode = "presentation" | "presentationLight" | "explain" | "work";

export type KpiSignalLabel = "OK" | "Риск" | "Критично";

export type KpiDashboardItem = {
  key: string;
  title: string;
  value: ReactNode;
  sub: string;
  description: string;
  /** Бейдж в режиме презентации (OK / Риск / Критично) */
  signalLabel?: KpiSignalLabel;
  tone: KpiCardTone;
  surfaceTone?: KpiCardTone;
  hideRadialOverlay?: boolean;
  hover: string;
  sparkline?: number[];
  sparkBars?: number[];
  sparkLine?: number[];
  sparkMode?: "combo" | "bars" | "line";
  sparkBarsFromBottom?: boolean;
  sparkHideBaseline?: boolean;
  sparkBaselineStroke?: string;
  sparkBaselineDasharray?: string;
  sparkBaselineWidth?: number;
  sparkLineStroke?: string;
  sparkTone?: KpiCardTone;
  tooltip: {
    metricMeaning: string;
    formula: string;
    variables?: FormulaVariableEntry[];
    sigmaNote?: string;
    calculation: string;
    explanation: string;
    interpretation: string;
    fact: string;
    plan: string;
    deviation: string;
    miniChart: string;
    conclusion: string;
  };
};

function miniLineColorByTone(tone: KpiCardTone, darkSurface: boolean): string {
  if (tone === "green") return darkSurface ? "#d1fae5" : "#047857";
  if (tone === "yellow") return darkSurface ? "#fffbeb" : "#b45309";
  return darkSurface ? "#ffe4e6" : "#b91c1c";
}

export function KpiDashboard({
  mode,
  items,
  className = "",
  gridClassName = "w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))]",
}: {
  mode: KpiDashboardMode;
  items: KpiDashboardItem[];
  className?: string;
  /** Сетка карточек: по умолчанию 4 равные колонки на lg+; иначе передайте свой класс (напр. 5 KPI). */
  gridClassName?: string;
}) {
  const presentationLike = mode === "presentation" || mode === "explain" || mode === "presentationLight";
  /** Тёмные градиенты KPI — только старая тёмная презентация и explain. */
  const kpiDarkSurface = mode === "presentation" || mode === "explain";

  const toneStyles = (tone: KpiCardTone) =>
    tone === "green"
      ? {
          value: kpiDarkSurface ? "text-emerald-300" : "text-emerald-700",
          miniBar: kpiDarkSurface ? "#34d399" : "#10b981",
          miniLine: kpiDarkSurface ? "#d1fae5" : "#047857",
          glow: kpiDarkSurface ? "shadow-[0_14px_36px_rgba(16,185,129,0.26)]" : "shadow-[0_12px_30px_rgba(16,185,129,0.18)]",
          insetGlow: kpiDarkSurface
            ? "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_36px_rgba(16,185,129,0.15)]"
            : "shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_0_0_26px_rgba(16,185,129,0.10)]",
          radial:
            kpiDarkSurface
              ? "radial-gradient(circle at 18% 15%, rgba(74,222,128,0.28), transparent 52%)"
              : "radial-gradient(circle at 18% 15%, rgba(74,222,128,0.24), transparent 55%)",
          card: kpiDarkSurface
            ? "bg-gradient-to-br from-emerald-900/42 via-slate-900/38 to-slate-900/60"
            : "bg-gradient-to-br from-emerald-100/85 via-white to-emerald-50/70",
        }
      : tone === "yellow"
        ? {
            value: kpiDarkSurface ? "text-amber-300" : "text-amber-700",
            miniBar: kpiDarkSurface ? "#fbbf24" : "#f59e0b",
            miniLine: kpiDarkSurface ? "#fffbeb" : "#b45309",
            glow: kpiDarkSurface ? "shadow-[0_14px_36px_rgba(245,158,11,0.24)]" : "shadow-[0_12px_30px_rgba(245,158,11,0.16)]",
            insetGlow: kpiDarkSurface
              ? "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_36px_rgba(245,158,11,0.14)]"
              : "shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_0_0_26px_rgba(245,158,11,0.10)]",
            radial:
              kpiDarkSurface
                ? "radial-gradient(circle at 18% 15%, rgba(251,191,36,0.30), transparent 52%)"
                : "radial-gradient(circle at 18% 15%, rgba(251,191,36,0.26), transparent 55%)",
            card: kpiDarkSurface
              ? "bg-gradient-to-br from-amber-900/40 via-slate-900/38 to-slate-900/60"
              : "bg-gradient-to-br from-amber-100/85 via-white to-amber-50/70",
          }
        : {
            value: kpiDarkSurface ? "text-red-300" : "text-red-700",
            miniBar: kpiDarkSurface ? "#fb7185" : "#ef4444",
            miniLine: kpiDarkSurface ? "#ffe4e6" : "#b91c1c",
            glow: kpiDarkSurface ? "shadow-[0_14px_36px_rgba(239,68,68,0.26)]" : "shadow-[0_12px_30px_rgba(239,68,68,0.16)]",
            insetGlow: kpiDarkSurface
              ? "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_36px_rgba(239,68,68,0.14)]"
              : "shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_0_0_26px_rgba(239,68,68,0.10)]",
            radial:
              kpiDarkSurface
                ? "radial-gradient(circle at 18% 15%, rgba(251,113,133,0.30), transparent 52%)"
                : "radial-gradient(circle at 18% 15%, rgba(251,113,133,0.24), transparent 55%)",
            card: kpiDarkSurface
              ? "bg-gradient-to-br from-red-900/40 via-slate-900/38 to-slate-900/60"
              : "bg-gradient-to-br from-red-100/85 via-white to-red-50/70",
          };

  return (
    <div className={`grid min-w-0 max-w-full ${gridClassName} ${className}`}>
      {items.map((kpi) => {
        const valueStyle = toneStyles(kpi.tone);
        const surfaceStyle = toneStyles(kpi.surfaceTone ?? kpi.tone);
        const sparkStyle = toneStyles(kpi.sparkTone ?? kpi.tone);
        const rawBars = kpi.sparkBars ?? kpi.sparkline ?? [];
        const rawLine = kpi.sparkLine ?? kpi.sparkline ?? [];
        const sparkMode = kpi.sparkMode ?? "combo";
        const isBarsOnly = sparkMode === "bars";
        const isLineOnly = sparkMode === "line";
        const barsFromBottom = isBarsOnly && !!kpi.sparkBarsFromBottom;
        const pairCount = isBarsOnly
          ? rawLine.length > 0
            ? Math.min(rawBars.length, rawLine.length)
            : rawBars.length
          : Math.min(rawBars.length, rawLine.length);
        const bars = rawBars.slice(rawBars.length - pairCount);
        const line = rawLine.slice(rawLine.length - pairCount);
        const hasSpark = pairCount >= 2;
        const barMin = hasSpark ? Math.min(...bars) : 0;
        const barMax = hasSpark ? Math.max(...bars) : 1;
        const barRange = Math.max(1e-6, barMax - barMin);
        const lineMin = line.length ? Math.min(...line) : 0;
        const lineMax = line.length ? Math.max(...line) : 1;
        const lineRange = Math.max(1e-6, lineMax - lineMin);
        const w = 172;
        const h = isBarsOnly && !barsFromBottom ? 56 : 40;
        const absMax = Math.max(1, Math.abs(barMin), Math.abs(barMax));
        const zeroY = isBarsOnly ? (barsFromBottom ? h : h * 0.5) : h - ((0 - lineMin) / lineRange) * h;
        const n = pairCount;
        const gap = isBarsOnly ? 6 : 4;
        const barW = n > 0 ? (w - gap * Math.max(0, n - 1)) / Math.max(1, n) : w;
        const rx = Math.min(6, Math.max(0, barW / 2));
        const pts =
          hasSpark && line.length
            ? line.map((v, i) => {
                const x = i * (barW + gap) + barW / 2;
                const y = isBarsOnly
                  ? barsFromBottom
                    ? h - ((v - barMin) / barRange) * h
                    : v >= 0
                      ? zeroY - (Math.abs(v) / absMax) * (h / 2)
                      : zeroY + (Math.abs(v) / absMax) * (h / 2)
                  : h - ((v - lineMin) / lineRange) * h;
                return { x, y };
              })
            : [];
        const linePath =
          pts.length >= 2
            ? (() => {
                let d = `M ${pts[0]!.x.toFixed(2)} ${pts[0]!.y.toFixed(2)}`;
                for (let i = 1; i < pts.length; i++) {
                  const p0 = pts[i - 1]!;
                  const p1 = pts[i]!;
                  const mx = (p0.x + p1.x) / 2;
                  const my = (p0.y + p1.y) / 2;
                  d += ` Q ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`;
                }
                const last = pts[pts.length - 1]!;
                d += ` T ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
                return d;
              })()
            : "";
        const lastPt = pts.length ? pts[pts.length - 1]! : null;

        const baselineStroke =
          kpi.sparkBaselineStroke ??
          (kpi.key === "month-dev" ? miniLineColorByTone(kpi.surfaceTone ?? kpi.tone, kpiDarkSurface) : undefined) ??
          (kpiDarkSurface ? "rgba(148,163,184,0.55)" : "rgba(71,85,105,0.45)");

        return (
          <div key={kpi.key} className="flex min-w-0 flex-col">
            <div
              className={`group relative min-h-0 min-w-0 flex-1 overflow-visible rounded-xl ${surfaceStyle.card} ${surfaceStyle.glow} ${surfaceStyle.insetGlow}${
                mode === "presentationLight" ? " top-card" : ""
              }`}
              title={kpi.hover}
            >
              {!kpi.hideRadialOverlay ? (
                <div className="pointer-events-none absolute inset-0" style={{ background: surfaceStyle.radial }} />
              ) : null}
              <div className="relative px-2.5 py-2.5 sm:px-3 sm:py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className={`min-w-0 text-[11px] uppercase tracking-wide ${kpiDarkSurface ? "text-slate-400" : "text-slate-500"}`}>
                    {kpi.title}
                  </div>
                  {(mode === "presentation" || mode === "presentationLight") && kpi.signalLabel ? (
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        kpi.signalLabel === "OK"
                          ? mode === "presentationLight"
                            ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200"
                            : "bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-400/35"
                          : kpi.signalLabel === "Риск"
                            ? mode === "presentationLight"
                              ? "bg-amber-100 text-amber-900 ring-1 ring-amber-200"
                              : "bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/35"
                            : mode === "presentationLight"
                              ? "bg-rose-100 text-rose-800 ring-1 ring-rose-200"
                              : "bg-rose-500/25 text-rose-100 ring-1 ring-rose-400/40"
                      }`}
                    >
                      {kpi.signalLabel}
                    </span>
                  ) : null}
                </div>
                {typeof kpi.value === "string" ? (
                  <div className={`mt-1 text-xl font-extrabold leading-none tabular-nums sm:text-2xl ${valueStyle.value}`}>
                    {kpi.value}
                  </div>
                ) : (
                  <div className={`mt-1 ${valueStyle.value}`}>{kpi.value}</div>
                )}
                {hasSpark ? (
                  <div className="mt-1.5">
                    <svg
                      viewBox={`0 0 ${w} ${h}`}
                      className={`${isBarsOnly && !barsFromBottom ? "h-12" : "h-9"} w-full overflow-visible`}
                      preserveAspectRatio="none"
                      aria-hidden
                    >
                      {isBarsOnly && !kpi.sparkHideBaseline ? (
                        <line
                          x1={0}
                          y1={zeroY}
                          x2={w}
                          y2={zeroY}
                          stroke={baselineStroke}
                          strokeDasharray={kpi.sparkBaselineDasharray}
                          strokeWidth={kpi.sparkBaselineWidth ?? 1}
                        />
                      ) : null}
                      {!isLineOnly
                        ? bars.map((_, i) => {
                            const x = i * (barW + gap);
                            return (
                              <rect
                                key={`bg-${kpi.key}-${i}`}
                                x={x}
                                y={0}
                                width={barW}
                                height={h}
                                rx={rx}
                                fill={sparkStyle.miniBar}
                                opacity={isBarsOnly ? 0.12 : 0.2}
                              />
                            );
                          })
                        : null}
                      {!isLineOnly
                        ? bars.map((v, i) => {
                            const x = i * (barW + gap);
                            const hh = isBarsOnly
                              ? barsFromBottom
                                ? ((v - barMin) / barRange) * h
                                : (Math.abs(v) / absMax) * (h / 2)
                              : ((v - barMin) / barRange) * h;
                            const y = isBarsOnly ? (barsFromBottom ? h - hh : v >= 0 ? zeroY - hh : zeroY) : h - hh;
                            const neutralBand = absMax * 0.06;
                            const toneForBar = isBarsOnly
                              ? Math.abs(v) <= neutralBand
                                ? "neutral"
                                : v > 0
                                  ? "positive"
                                  : "negative"
                              : null;
                            const fill = isBarsOnly
                              ? toneForBar === "positive"
                                ? "rgba(52, 211, 153, 0.82)"
                                : toneForBar === "negative"
                                  ? "rgba(251, 113, 133, 0.82)"
                                  : "rgba(148, 163, 184, 0.62)"
                              : sparkStyle.miniBar;
                            const isLastBar = i === bars.length - 1;
                            const scaleBoost = isBarsOnly && isLastBar ? 1.06 : 1;
                            const activeGlow =
                              toneForBar === "positive"
                                ? "rgba(52, 211, 153, 0.38)"
                                : toneForBar === "negative"
                                  ? "rgba(251, 113, 133, 0.4)"
                                  : "rgba(148, 163, 184, 0.28)";
                            const activeGlowWide =
                              toneForBar === "positive"
                                ? "rgba(52, 211, 153, 0.15)"
                                : toneForBar === "negative"
                                  ? "rgba(251, 113, 133, 0.15)"
                                  : "rgba(148, 163, 184, 0.12)";
                            const glowFilter =
                              isBarsOnly && isLastBar
                                ? `drop-shadow(0 0 12px ${activeGlow}) drop-shadow(0 0 24px ${activeGlowWide})`
                                : undefined;
                            return (
                              <rect
                                key={`main-${kpi.key}-${i}`}
                                x={x}
                                y={y}
                                width={barW}
                                height={hh}
                                rx={rx}
                                fill={fill}
                                opacity={isBarsOnly ? (isLastBar ? 0.98 : 0.5) : 0.7}
                                style={
                                  isBarsOnly
                                    ? {
                                        transformBox: "fill-box",
                                        transformOrigin: "center",
                                        transform: `scale(${scaleBoost})`,
                                        filter: glowFilter,
                                      }
                                    : undefined
                                }
                              />
                            );
                          })
                        : null}
                      {linePath ? (
                        <path
                          d={linePath}
                          fill="none"
                          stroke={kpi.sparkLineStroke ?? sparkStyle.miniLine}
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ) : null}
                      {lastPt ? (
                        <>
                          <circle cx={lastPt.x} cy={lastPt.y} r="2.75" fill={kpi.sparkLineStroke ?? sparkStyle.miniLine} />
                          <circle cx={lastPt.x} cy={lastPt.y} r="5.5" fill={kpi.sparkLineStroke ?? sparkStyle.miniLine} opacity={0.14} />
                        </>
                      ) : null}
                    </svg>
                  </div>
                ) : null}
                <div className={`mt-0.5 text-[11px] ${kpiDarkSurface ? "text-slate-400" : "text-slate-600"}`}>{kpi.sub}</div>
                <p
                  className={`mt-1.5 text-[12px] leading-tight ${kpiDarkSurface ? "text-slate-300/70" : "text-slate-700/70"} ${mode === "presentation" || mode === "presentationLight" ? "line-clamp-3" : "line-clamp-2"}`}
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: mode === "presentation" || mode === "presentationLight" ? 3 : 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {kpi.description}
                </p>
              </div>
              {mode !== "explain" ? (
                <div
                  className={`pointer-events-none absolute left-2 right-2 top-[calc(100%+8px)] z-20 rounded-xl px-3 py-3 opacity-0 backdrop-blur-md transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 sm:left-auto sm:right-0 sm:w-[320px] ${
                    mode === "presentationLight"
                      ? "border border-black/[0.05] bg-white/90 text-mpl-text shadow-xl backdrop-blur-md"
                      : kpiDarkSurface
                        ? "border border-slate-500/45 bg-[#0b1220]/90 text-slate-200 shadow-[0_16px_40px_rgba(15,23,42,0.65)]"
                        : "border border-slate-200/80 bg-slate-900/92 text-slate-100 shadow-[0_14px_34px_rgba(15,23,42,0.28)]"
                  }`}
                >
                  <div className="text-[12px] font-semibold leading-tight">{kpi.title}</div>
                  <div
                    className={`mt-1 text-[12px] leading-snug ${mode === "presentationLight" ? "text-mpl-muted" : "text-slate-300"}`}
                  >
                    {kpi.tooltip.metricMeaning}
                  </div>
                  {mode === "work" ? (
                    <>
                      <div className="mt-1 text-[11px] leading-snug text-slate-400">{kpi.tooltip.formula}</div>
                      <FormulaVariablesLegend
                        variables={kpi.tooltip.variables}
                        sigmaNote={kpi.tooltip.sigmaNote}
                        presentation={kpiDarkSurface}
                      />
                      <div className="mt-2 space-y-1 text-[11px] leading-snug text-slate-300">
                        <div>
                          <span className="font-semibold text-slate-400">Как считается: </span>
                          {kpi.tooltip.calculation}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-400">Почему эта формула: </span>
                          {kpi.tooltip.explanation}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-400">Вывод: </span>
                          {kpi.tooltip.interpretation}
                        </div>
                      </div>
                    </>
                  ) : null}
                  <div className="mt-2 space-y-1 text-[12px] tabular-nums">
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-400">Факт</span>
                      <span>{kpi.tooltip.fact}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-400">План</span>
                      <span>{kpi.tooltip.plan}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-400">Отклонение</span>
                      <span>{kpi.tooltip.deviation}</span>
                    </div>
                  </div>
                  {mode === "work" ? (
                    <>
                      <div className="mt-2 text-[11px] leading-snug text-slate-300">Mini chart: {kpi.tooltip.miniChart}</div>
                      <div className="mt-1 text-[12px] leading-snug text-slate-100">Вывод: {kpi.tooltip.conclusion}</div>
                    </>
                  ) : (
                    <div className="mt-2 border-t border-slate-600/40 pt-2 text-[12px] leading-snug text-slate-100">{kpi.tooltip.conclusion}</div>
                  )}
                </div>
              ) : null}
            </div>
            {mode === "explain" ? (
              <div className="mt-2 rounded-b-xl border border-t-0 border-white/10 bg-[#0f172a]/70 px-3 py-3 text-[10px] leading-snug text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Формула</div>
                <p className="mt-1 text-slate-400">{kpi.tooltip.formula}</p>
                {kpi.tooltip.variables?.length ? (
                  <div className="mt-2">
                    <div className="text-[9px] font-bold uppercase text-slate-500">Обозначения</div>
                    <FormulaVariablesLegend variables={kpi.tooltip.variables} sigmaNote={kpi.tooltip.sigmaNote} presentation />
                  </div>
                ) : null}
                <div className="mt-2">
                  <span className="font-semibold text-slate-400">Как считается: </span>
                  <span className="font-mono text-[10px] text-slate-200">{kpi.tooltip.calculation}</span>
                </div>
                <p className="mt-2">
                  <span className="font-semibold text-slate-400">Почему эта формула: </span>
                  {kpi.tooltip.explanation}
                </p>
                <p className="mt-2">
                  <span className="font-semibold text-slate-400">Интерпретация: </span>
                  {kpi.tooltip.interpretation}
                </p>
                <p className="mt-2 text-[10px] text-slate-500">Мини-график: {kpi.tooltip.miniChart}</p>
                <p className="mt-2 border-t border-white/10 pt-2 text-[11px] font-medium text-slate-200">{kpi.tooltip.conclusion}</p>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
