"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import type { EntityKpiTheme } from "@/lib/entityKpiTheme";
import {
  apartmentKpiExecutionHue,
  apartmentKpiProgressWidthPercent,
  type ApartmentKpiHue,
} from "@/lib/apartmentsPlanPeriodKpi";
import { dec1Fmt, numFmt } from "@/lib/salesPlanChartFormat";

export const ENTITY_KPI_UI = {
  cardMinHeight: 400,
  cardPadding: 24,
  cardRadius: 20,
  cardBorder: "1px solid rgba(226,232,240,0.55)",
  cardShadow: "0 4px 18px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.03)",
  cardShadowHover: "0 8px 24px rgba(15,23,42,0.05), 0 2px 6px rgba(15,23,42,0.04)",
  chartAreaHeight: 150,
  chartMarginY: 24,
  barMaxHeight: 96,
  barWidth: 44,
  barGap: 32,
  barRadius: "12px 12px 3px 3px",
  barValueSize: 20,
  barValueGap: 4,
  barValueLineHeight: 1,
  barLabelSize: 11,
  baselineColor: "rgba(226,232,240,0.55)",
  dividerColor: "rgba(226,232,240,0.55)",
  dividerMarginY: 18,
  mutedLabel: "#64748B",
  deviationLabelSize: 14,
  deviationValueSize: 26,
  fulfillmentValueSize: 34,
  runnerHeight: 6,
  runnerKnob: 14,
  runnerTrack: "#E9EDF5",
  ringSize: 196,
  ringStroke: 9,
  ringPercentSize: 50,
  ringSubtitleSize: 15,
} as const;

const RUNNER_COLORS: Record<ApartmentKpiHue, string> = {
  green: "#10B981",
  yellow: "#F59E0B",
  red: "#E11D48",
};

function useSmoothScalar(target: number, durationMs = 480) {
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(display);
  displayRef.current = display;

  useEffect(() => {
    const from = displayRef.current;
    let start: number | null = null;
    let raf = 0;
    const tick = (now: number) => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return display;
}

function pctToneStyle(hue: ApartmentKpiHue, presDark: boolean): { color: string } {
  if (presDark) {
    if (hue === "green") return { color: "#34d399" };
    if (hue === "yellow") return { color: "#fbbf24" };
    return { color: "#fb7185" };
  }
  return { color: RUNNER_COLORS[hue] };
}

function deviationToneClass(dev: number, presDark: boolean, presentation: boolean): string {
  if (dev >= 0) {
    return presDark ? "text-emerald-300" : presentation ? "text-emerald-700" : "text-emerald-700";
  }
  return presDark ? "text-rose-300" : presentation ? "text-rose-700" : "text-rose-700";
}

function runnerFillColor(hue: ApartmentKpiHue, presDark: boolean): string {
  if (presDark) {
    if (hue === "green") return "#34d399";
    if (hue === "yellow") return "#fbbf24";
    return "#fb7185";
  }
  return RUNNER_COLORS[hue];
}

function formatKpiCount(n: number): string {
  return numFmt.format(Math.round(n));
}

function kpiBarColumnHeightPx(): number {
  return ENTITY_KPI_UI.barMaxHeight + ENTITY_KPI_UI.barValueSize + ENTITY_KPI_UI.barValueGap;
}

function KpiSectionDivider({ presDark }: { presDark: boolean }) {
  return (
    <div
      className="w-full shrink-0"
      style={{
        borderTop: presDark ? "1px solid rgba(255,255,255,0.1)" : `1px solid ${ENTITY_KPI_UI.dividerColor}`,
        margin: `${ENTITY_KPI_UI.dividerMarginY}px 0`,
      }}
      aria-hidden
    />
  );
}

function KpiExecutionRunner({
  widthPercent,
  hue,
  presDark,
}: {
  widthPercent: number;
  hue: ApartmentKpiHue;
  presDark: boolean;
}) {
  const animW = useSmoothScalar(widthPercent, 600);
  const w = Math.min(100, Math.max(0, animW));
  const fill = runnerFillColor(hue, presDark);

  return (
    <div
      className="relative w-full shrink-0 overflow-visible rounded-full"
      style={{
        height: ENTITY_KPI_UI.runnerHeight,
        backgroundColor: presDark ? "rgba(255,255,255,0.12)" : ENTITY_KPI_UI.runnerTrack,
        borderRadius: 999,
      }}
      role="progressbar"
      aria-valuenow={Math.round(w)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="relative h-full rounded-[inherit]"
        style={{ width: `${w}%`, backgroundColor: fill, borderRadius: "inherit", transition: "width 0.6s ease" }}
      >
        {w > 1.5 ? (
          <span
            className="absolute right-0 top-1/2 z-[1] -translate-y-1/2 translate-x-1/2 rounded-full bg-white"
            style={{
              width: ENTITY_KPI_UI.runnerKnob,
              height: ENTITY_KPI_UI.runnerKnob,
              boxShadow: "0 0 0 2px rgba(255,255,255,0.95), 0 2px 6px rgba(15,23,42,0.08)",
            }}
            aria-hidden
          />
        ) : null}
      </div>
    </div>
  );
}

function ThemedMiniFactPlanColumnChart({
  fact,
  plan,
  hasPlan,
  presDark,
  presentation,
  mplPremium,
  theme,
}: {
  fact: number;
  plan: number | null;
  hasPlan: boolean;
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
  theme: EntityKpiTheme;
}) {
  const [hovered, setHovered] = useState(false);
  const planVal = hasPlan && plan != null ? plan : 0;
  const maxValue = Math.max(fact, planVal, 1);
  const animFactH = useSmoothScalar((fact / maxValue) * 100);
  const animPlanH = useSmoothScalar(hasPlan && plan != null ? (plan / maxValue) * 100 : 0);
  const deviation = hasPlan && plan != null ? fact - plan : null;

  const tooltipShell = presDark
    ? "border border-slate-500/40 bg-[#0b1220]/95 text-slate-100"
    : mplPremium && presentation
      ? "border border-white/50 bg-white/95 text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
      : "border border-slate-200 bg-white text-slate-900 shadow-lg";

  const mutedTip = presDark ? "text-slate-400" : "text-slate-500";
  const valueColor = presDark ? "#f1f5f9" : "#0f172a";
  const labelColor = presDark ? "#94a3b8" : ENTITY_KPI_UI.mutedLabel;
  const planBarPx = Math.max(4, (animPlanH / 100) * ENTITY_KPI_UI.barMaxHeight);
  const factBarPx = Math.max(4, (animFactH / 100) * ENTITY_KPI_UI.barMaxHeight);

  return (
    <div
      className="relative mx-auto w-full max-w-[200px] sm:max-w-[220px]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      tabIndex={0}
      role="img"
    >
      {hovered ? (
        <div
          className={`pointer-events-none absolute bottom-full left-1/2 z-20 mb-3 w-max min-w-[10rem] -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm ${tooltipShell}`}
        >
          <div className="space-y-1 tabular-nums">
            <div>
              <span className={mutedTip}>Факт: </span>
              <span className="font-semibold" style={{ color: theme.factTooltipColor }}>
                {formatKpiCount(fact)}
              </span>
            </div>
            <div>
              <span className={mutedTip}>План: </span>
              <span className="font-semibold text-[#FF6A00]">
                {hasPlan && plan != null ? formatKpiCount(planVal) : "—"}
              </span>
            </div>
            <div>
              <span className={mutedTip}>Отклонение: </span>
              {deviation != null ? (
                <span className={`font-semibold ${deviationToneClass(deviation, presDark, presentation)}`}>
                  {formatKpiCount(deviation)}
                </span>
              ) : (
                <span className="font-semibold">—</span>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mx-auto flex w-full flex-col items-center justify-end" style={{ minHeight: ENTITY_KPI_UI.chartAreaHeight }}>
        <div className="flex items-end justify-center" style={{ height: kpiBarColumnHeightPx(), gap: ENTITY_KPI_UI.barGap }}>
          <div className="relative flex shrink-0 items-end justify-center" style={{ width: ENTITY_KPI_UI.barWidth, height: kpiBarColumnHeightPx() }}>
            <span
              className="pointer-events-none absolute left-1/2 z-[1] -translate-x-1/2 whitespace-nowrap tabular-nums"
              style={{
                bottom: planBarPx + ENTITY_KPI_UI.barValueGap,
                color: valueColor,
                fontSize: ENTITY_KPI_UI.barValueSize,
                fontWeight: 600,
              }}
            >
              {hasPlan && plan != null ? formatKpiCount(plan) : "—"}
            </span>
            <div
              className="w-full transition-[height] duration-500 ease-out"
              style={{
                height: planBarPx,
                background: hasPlan && plan != null ? theme.planGradient : undefined,
                borderRadius: ENTITY_KPI_UI.barRadius,
                boxShadow: hasPlan && plan != null ? "0 3px 10px rgba(255,122,0,0.1)" : undefined,
              }}
            />
          </div>
          <div className="relative flex shrink-0 items-end justify-center" style={{ width: ENTITY_KPI_UI.barWidth, height: kpiBarColumnHeightPx() }}>
            <span
              className="pointer-events-none absolute left-1/2 z-[1] -translate-x-1/2 whitespace-nowrap tabular-nums"
              style={{
                bottom: factBarPx + ENTITY_KPI_UI.barValueGap,
                color: valueColor,
                fontSize: ENTITY_KPI_UI.barValueSize,
                fontWeight: 600,
              }}
            >
              {formatKpiCount(fact)}
            </span>
            <div
              className="w-full transition-[height] duration-500 ease-out"
              style={{
                height: factBarPx,
                background: theme.factGradient,
                borderRadius: ENTITY_KPI_UI.barRadius,
                boxShadow: theme.factBarShadow,
              }}
            />
          </div>
        </div>
        <div
          className="mx-auto mt-1 w-full max-w-[200px]"
          style={{ borderBottom: `1px solid ${presDark ? "rgba(255,255,255,0.12)" : ENTITY_KPI_UI.baselineColor}` }}
        />
        <div className="mt-2.5 flex justify-center" style={{ gap: ENTITY_KPI_UI.barGap }}>
          <span className="text-center uppercase" style={{ width: ENTITY_KPI_UI.barWidth, color: labelColor, fontSize: ENTITY_KPI_UI.barLabelSize, fontWeight: 600 }}>
            План
          </span>
          <span className="text-center uppercase" style={{ width: ENTITY_KPI_UI.barWidth, color: labelColor, fontSize: ENTITY_KPI_UI.barLabelSize, fontWeight: 600 }}>
            Факт
          </span>
        </div>
      </div>
    </div>
  );
}

function ThemedKpiFactPlanCardBody({
  fact,
  plan,
  hasPlan,
  executionPct,
  presDark,
  presentation,
  mplPremium,
  dashCls,
  theme,
}: {
  fact: number;
  plan: number | null;
  hasPlan: boolean;
  executionPct: number | null;
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
  dashCls: string;
  theme: EntityKpiTheme;
}) {
  const hue = executionPct != null ? apartmentKpiExecutionHue(executionPct) : null;
  const deviation = hasPlan && plan != null ? fact - plan : null;
  const runnerW = executionPct != null ? apartmentKpiProgressWidthPercent(executionPct) : 0;
  const deviationLabelStyle = { color: presDark ? "#94a3b8" : ENTITY_KPI_UI.mutedLabel, fontSize: ENTITY_KPI_UI.deviationLabelSize, fontWeight: 500 };
  const deviationValueStyle = presDark
    ? { fontSize: "clamp(20px, 4vw, 26px)", fontWeight: 600, lineHeight: 1 }
    : { fontSize: ENTITY_KPI_UI.deviationValueSize, fontWeight: 600, lineHeight: 1 };
  const fulfillmentValueStyle = presDark
    ? { fontSize: "clamp(26px, 5vw, 34px)", fontWeight: 700, lineHeight: 1 }
    : { fontSize: ENTITY_KPI_UI.fulfillmentValueSize, fontWeight: 700, lineHeight: 1 };

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-visible">
      <div className="flex flex-1 flex-col items-center justify-center py-1" style={{ marginTop: ENTITY_KPI_UI.chartMarginY, marginBottom: ENTITY_KPI_UI.chartMarginY }}>
        <ThemedMiniFactPlanColumnChart fact={fact} plan={plan} hasPlan={hasPlan} presDark={presDark} presentation={presentation} mplPremium={mplPremium} theme={theme} />
      </div>
      <KpiSectionDivider presDark={presDark} />
      <div className="flex w-full items-center justify-between gap-3 whitespace-nowrap py-0.5">
        <span style={deviationLabelStyle}>Отклонение</span>
        <span className={`shrink-0 tabular-nums ${deviation != null ? deviationToneClass(deviation, presDark, presentation) : dashCls}`} style={deviationValueStyle}>
          {deviation != null ? formatKpiCount(deviation) : "—"}
        </span>
      </div>
      <KpiSectionDivider presDark={presDark} />
      <div className="mt-auto w-full shrink-0 space-y-2.5 pb-0.5">
        <div className="flex w-full items-start justify-between gap-3">
          <span className="shrink-0 pt-0.5" style={deviationLabelStyle}>
            Выполнение
          </span>
          {executionPct != null && hue != null ? (
            <span className="shrink-0 tabular-nums" style={{ ...fulfillmentValueStyle, ...pctToneStyle(hue, presDark) }}>
              {dec1Fmt.format(Math.round(executionPct * 10) / 10)}%
            </span>
          ) : (
            <span className={`shrink-0 ${dashCls}`} style={fulfillmentValueStyle}>
              —
            </span>
          )}
        </div>
        <KpiExecutionRunner widthPercent={runnerW} hue={hue ?? "red"} presDark={presDark} />
      </div>
    </div>
  );
}

function ThemedKpiCircularProgressRing({
  percent,
  presDark,
  theme,
}: {
  percent: number;
  presDark: boolean;
  theme: EntityKpiTheme;
}) {
  const size = ENTITY_KPI_UI.ringSize;
  const strokeWidth = ENTITY_KPI_UI.ringStroke;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const animPct = useSmoothScalar(Math.min(100, Math.max(0, percent)));
  const offset = circumference - (animPct / 100) * circumference;
  const gradientId = `kpiRingGrad-${theme.id}`;

  return (
    <div className="relative mx-auto flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="h-full w-full overflow-visible" viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={theme.ringGradientStops.top} />
            <stop offset="100%" stopColor={theme.ringGradientStops.bottom} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={presDark ? "rgba(255,255,255,0.1)" : theme.ringTrackBorder} strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={presDark ? theme.ringStrokeDark : `url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
        <span className={`tabular-nums leading-none ${presDark ? "text-slate-100" : "text-slate-900"}`} style={{ fontSize: ENTITY_KPI_UI.ringPercentSize, fontWeight: 700 }}>
          {dec1Fmt.format(Math.round(animPct * 10) / 10)}%
        </span>
        <span className="mt-1.5 uppercase" style={{ fontSize: ENTITY_KPI_UI.ringSubtitleSize, fontWeight: 600, letterSpacing: "0.06em", color: presDark ? "#94a3b8" : ENTITY_KPI_UI.mutedLabel }}>
          Реализовано
        </span>
      </div>
    </div>
  );
}

function KpiCardShell({
  title,
  children,
  presDark,
  skeleton,
  centered,
}: {
  title: string;
  children: ReactNode;
  presDark: boolean;
  skeleton?: boolean;
  centered?: boolean;
}) {
  const surface = presDark
    ? "rounded-[20px] border border-white/10 bg-slate-900/50 shadow-[0_8px_28px_rgba(0,0,0,0.28)]"
    : "rounded-[20px] border bg-white";
  const lightStyle = presDark
    ? { minHeight: ENTITY_KPI_UI.cardMinHeight, padding: ENTITY_KPI_UI.cardPadding }
    : {
        background: "#FFFFFF",
        border: ENTITY_KPI_UI.cardBorder,
        borderRadius: ENTITY_KPI_UI.cardRadius,
        boxShadow: ENTITY_KPI_UI.cardShadow,
        minHeight: ENTITY_KPI_UI.cardMinHeight,
        padding: ENTITY_KPI_UI.cardPadding,
      };

  return (
    <div
      className={`group flex h-full w-full min-w-0 flex-col overflow-visible ${surface} ${skeleton ? "" : "transition-all duration-[250ms] ease hover:-translate-y-[2px]"}`}
      style={lightStyle}
      onMouseEnter={
        presDark || skeleton
          ? undefined
          : (e) => {
              (e.currentTarget as HTMLDivElement).style.boxShadow = ENTITY_KPI_UI.cardShadowHover;
            }
      }
      onMouseLeave={
        presDark || skeleton
          ? undefined
          : (e) => {
              (e.currentTarget as HTMLDivElement).style.boxShadow = ENTITY_KPI_UI.cardShadow;
            }
      }
    >
      <div
        className={`shrink-0 ${presDark ? "text-[13px] font-semibold uppercase tracking-[0.12em] text-slate-400" : ""}`}
        style={
          presDark
            ? undefined
            : {
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: "0.03em",
                color: ENTITY_KPI_UI.mutedLabel,
                textTransform: "uppercase" as const,
              }
        }
      >
        {title}
      </div>
      <div className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-visible ${centered ? "items-center justify-center pt-2" : "pt-4"}`}>
        {children}
      </div>
    </div>
  );
}

function KpiSkeletonLine({ presDark }: { presDark: boolean }) {
  return <div className={`h-8 w-2/3 animate-pulse rounded-md ${presDark ? "bg-white/[0.08]" : "bg-slate-200/60"}`} aria-hidden />;
}

export type EntityPlanPeriodKpiCardsData = {
  hasCsvPlan: boolean;
  factMonth: number;
  factCumulative: number;
  planMonth: number | null;
  planCumulative: number | null;
  totalProjectPlan: number | null;
  pctMonth: number | null;
  pctCum: number | null;
  pctVolume: number | null;
};

export function EntityPlanPeriodKpiCardsGrid({
  theme,
  data,
  presDark,
  presentation,
  mplPremium,
  skeleton,
}: {
  theme: EntityKpiTheme;
  data: EntityPlanPeriodKpiCardsData;
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
  skeleton?: boolean;
}) {
  const dashCls = presDark ? "text-slate-500" : presentation ? "text-mpl-muted" : "text-slate-400";
  const spctVolume = useSmoothScalar(data.pctVolume ?? 0);

  return (
    <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
      <div className="flex min-w-0 overflow-visible">
        <KpiCardShell title="План на отчетный месяц" presDark={presDark} skeleton={skeleton}>
          {skeleton ? (
            <KpiSkeletonLine presDark={presDark} />
          ) : (
            <ThemedKpiFactPlanCardBody
              fact={data.factMonth}
              plan={data.planMonth}
              hasPlan={data.hasCsvPlan}
              executionPct={data.pctMonth}
              presDark={presDark}
              presentation={presentation}
              mplPremium={mplPremium}
              dashCls={dashCls}
              theme={theme}
            />
          )}
        </KpiCardShell>
      </div>
      <div className="flex min-w-0 overflow-visible">
        <KpiCardShell title="План накопительно итогом" presDark={presDark} skeleton={skeleton}>
          {skeleton ? (
            <KpiSkeletonLine presDark={presDark} />
          ) : (
            <ThemedKpiFactPlanCardBody
              fact={data.factCumulative}
              plan={data.planCumulative}
              hasPlan={data.hasCsvPlan}
              executionPct={data.pctCum}
              presDark={presDark}
              presentation={presentation}
              mplPremium={mplPremium}
              dashCls={dashCls}
              theme={theme}
            />
          )}
        </KpiCardShell>
      </div>
      <div className="flex min-w-0 overflow-visible">
        <KpiCardShell title="% выполнения от общего объема" presDark={presDark} skeleton={skeleton} centered>
          {skeleton ? (
            <KpiSkeletonLine presDark={presDark} />
          ) : data.pctVolume != null ? (
            <div className="relative flex w-full flex-col items-center justify-center py-3">
              <ThemedKpiCircularProgressRing percent={spctVolume} presDark={presDark} theme={theme} />
            </div>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center px-2 py-3 text-center">
              <div
                className="mx-auto flex items-center justify-center rounded-full border-[9px]"
                style={{ width: ENTITY_KPI_UI.ringSize, height: ENTITY_KPI_UI.ringSize, borderColor: theme.ringTrackBorder }}
              >
                <span className={`tabular-nums leading-none ${dashCls}`} style={{ fontSize: ENTITY_KPI_UI.ringPercentSize, fontWeight: 700 }}>
                  —
                </span>
              </div>
            </div>
          )}
        </KpiCardShell>
      </div>
    </div>
  );
}
