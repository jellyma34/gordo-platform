"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { Loader2, Upload } from "lucide-react";

import type { ApartmentKpiHue, ApartmentPlanKpiPlanCalcDebug, ApartmentPlanPeriodKpiUiData } from "@/lib/apartmentsPlanPeriodKpi";
import type { ApartmentPlanKpiDealFactDebug } from "@/lib/apartmentPlanFactsFromDeals";
import type { ApartmentPlanCsvParseDiagnostics } from "@/lib/planDataSource/types";
import {
  apartmentKpiExecutionHue,
  apartmentKpiExecutionPercent,
  apartmentKpiProgressWidthPercent,
} from "@/lib/apartmentsPlanPeriodKpi";
import { dec1Fmt, numFmt } from "@/lib/salesPlanChartFormat";

/** Premium KPI dashboard UI tokens (~17% lighter than previous compact pass). */
const KPI_UI = {
  planGradient: "linear-gradient(180deg, #FFB257 0%, #FF7A00 100%)",
  factGradient: "linear-gradient(180deg, #5EA0FF 0%, #2563EB 100%)",
  dashboardBg: "#F7F8FA",
  cardBg: "#FFFFFF",
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
  titleSize: 14,
  titleTracking: "0.03em",
  deviationLabelSize: 14,
  deviationValueSize: 26,
  fulfillmentLabelSize: 14,
  fulfillmentValueSize: 34,
  runnerHeight: 6,
  runnerKnob: 14,
  runnerTrack: "#E9EDF5",
  ringSize: 196,
  ringStroke: 9,
  ringPercentSize: 50,
  ringSubtitleSize: 15,
} as const;

const KPI_PLAN_GRADIENT = KPI_UI.planGradient;
const KPI_FACT_GRADIENT = KPI_UI.factGradient;
const KPI_RUNNER_TRACK = KPI_UI.runnerTrack;
const KPI_MUTED_LABEL = KPI_UI.mutedLabel;
const KPI_CARD_SHADOW = KPI_UI.cardShadow;
const KPI_CARD_SHADOW_HOVER = KPI_UI.cardShadowHover;
const KPI_RUNNER_COLORS: Record<ApartmentKpiHue, string> = {
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

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function pctToneStyle(hue: ApartmentKpiHue, presDark: boolean): { color: string } {
  if (presDark) {
    if (hue === "green") return { color: "#34d399" };
    if (hue === "yellow") return { color: "#fbbf24" };
    return { color: "#fb7185" };
  }
  return { color: KPI_RUNNER_COLORS[hue] };
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
  return KPI_RUNNER_COLORS[hue];
}

function KpiSectionDivider({ presDark }: { presDark: boolean }) {
  return (
    <div
      className="w-full shrink-0"
      style={{
        borderTop: presDark ? "1px solid rgba(255,255,255,0.1)" : `1px solid ${KPI_UI.dividerColor}`,
        margin: `${KPI_UI.dividerMarginY}px 0`,
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
  const showKnob = w > 1.5;

  return (
    <div
      className="relative w-full shrink-0 overflow-visible rounded-full"
      style={{
        height: KPI_UI.runnerHeight,
        backgroundColor: presDark ? "rgba(255,255,255,0.12)" : KPI_RUNNER_TRACK,
        borderRadius: 999,
      }}
      role="progressbar"
      aria-valuenow={Math.round(w)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="relative h-full rounded-[inherit]"
        style={{
          width: `${w}%`,
          backgroundColor: fill,
          borderRadius: "inherit",
          transition: "width 0.6s ease",
        }}
      >
        {showKnob ? (
          <span
            className="absolute right-0 top-1/2 z-[1] -translate-y-1/2 translate-x-1/2 rounded-full bg-white"
            style={{
              width: KPI_UI.runnerKnob,
              height: KPI_UI.runnerKnob,
              boxShadow: "0 0 0 2px rgba(255,255,255,0.95), 0 2px 6px rgba(15,23,42,0.08)",
            }}
            aria-hidden
          />
        ) : null}
      </div>
    </div>
  );
}

function formatKpiCount(n: number): string {
  return numFmt.format(Math.round(n));
}

/** Column height = bar track + value label sitting on bar top. */
function kpiBarColumnHeightPx(): number {
  return KPI_UI.barMaxHeight + KPI_UI.barValueSize + KPI_UI.barValueGap;
}

type KpiBarColumnProps = {
  value: string;
  barHeightPx: number;
  valueColor: string;
  barFill?: { background: string; boxShadow: string };
  presDark: boolean;
  emptyBar?: boolean;
};

function KpiBarColumn({ value, barHeightPx, valueColor, barFill, presDark, emptyBar }: KpiBarColumnProps) {
  const h = Math.max(4, barHeightPx);
  const labelBottom = h + KPI_UI.barValueGap;

  return (
    <div
      className="relative flex shrink-0 items-end justify-center"
      style={{ width: KPI_UI.barWidth, height: kpiBarColumnHeightPx() }}
    >
      <span
        className="pointer-events-none absolute left-1/2 z-[1] -translate-x-1/2 whitespace-nowrap tabular-nums"
        style={{
          bottom: labelBottom,
          color: valueColor,
          fontSize: KPI_UI.barValueSize,
          fontWeight: 600,
          lineHeight: KPI_UI.barValueLineHeight,
          transition: "bottom 0.5s ease-out",
        }}
      >
        {value}
      </span>
      {emptyBar || !barFill ? (
        <div
          className={`w-full ${presDark ? "bg-white/10" : "bg-slate-200"}`}
          style={{ height: h, borderRadius: KPI_UI.barRadius }}
        />
      ) : (
        <div
          className="w-full transition-[height] duration-500 ease-out"
          style={{
            height: h,
            background: barFill.background,
            borderRadius: KPI_UI.barRadius,
            boxShadow: barFill.boxShadow,
          }}
        />
      )}
    </div>
  );
}

type MiniFactPlanColumnChartProps = {
  fact: number;
  plan: number | null;
  hasPlan: boolean;
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
};

function MiniFactPlanColumnChart({
  fact,
  plan,
  hasPlan,
  presDark,
  presentation,
  mplPremium,
}: MiniFactPlanColumnChartProps) {
  const [hovered, setHovered] = useState(false);
  const planVal = hasPlan && plan != null ? plan : 0;
  const maxValue = Math.max(fact, planVal, 1);
  const factHeightPct = (fact / maxValue) * 100;
  const planHeightPct = hasPlan && plan != null ? (plan / maxValue) * 100 : 0;
  const animFactH = useSmoothScalar(factHeightPct);
  const animPlanH = useSmoothScalar(planHeightPct);
  const deviation = hasPlan && plan != null ? fact - plan : null;

  const tooltipShell = presDark
    ? "border border-slate-500/40 bg-[#0b1220]/95 text-slate-100"
    : mplPremium && presentation
      ? "border border-white/50 bg-white/95 text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
      : "border border-slate-200 bg-white text-slate-900 shadow-lg";

  const mutedTip = presDark ? "text-slate-400" : "text-slate-500";
  const valueColor = presDark ? "#f1f5f9" : "#0f172a";
  const labelColor = presDark ? "#94a3b8" : KPI_MUTED_LABEL;

  const planBarPx = Math.max(4, (animPlanH / 100) * KPI_UI.barMaxHeight);
  const factBarPx = Math.max(4, (animFactH / 100) * KPI_UI.barMaxHeight);

  return (
    <div
      className="relative mx-auto w-full max-w-[200px] sm:max-w-[220px]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      tabIndex={0}
      role="img"
      aria-label={`План ${hasPlan && plan != null ? formatKpiCount(plan) : "—"}, факт ${formatKpiCount(fact)}`}
    >
      {hovered ? (
        <div
          className={`pointer-events-none absolute bottom-full left-1/2 z-20 mb-3 w-max min-w-[10rem] -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm ${tooltipShell}`}
          role="tooltip"
        >
          <div className="space-y-1 tabular-nums">
            <div>
              <span className={mutedTip}>Факт: </span>
              <span className="font-semibold text-[#1D4ED8]">{formatKpiCount(fact)}</span>
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

      <div
        className="mx-auto flex w-full flex-col items-center justify-end"
        style={{ minHeight: KPI_UI.chartAreaHeight }}
      >
        <div
          className="flex items-end justify-center"
          style={{ height: kpiBarColumnHeightPx(), gap: KPI_UI.barGap }}
        >
          <KpiBarColumn
            value={hasPlan && plan != null ? formatKpiCount(plan) : "—"}
            barHeightPx={hasPlan && plan != null ? planBarPx : 4}
            valueColor={valueColor}
            presDark={presDark}
            emptyBar={!(hasPlan && plan != null)}
            barFill={
              hasPlan && plan != null
                ? {
                    background: KPI_PLAN_GRADIENT,
                    boxShadow: "0 3px 10px rgba(255,122,0,0.1)",
                  }
                : undefined
            }
          />
          <KpiBarColumn
            value={formatKpiCount(fact)}
            barHeightPx={factBarPx}
            valueColor={valueColor}
            presDark={presDark}
            barFill={{
              background: KPI_FACT_GRADIENT,
              boxShadow: "0 3px 10px rgba(37,99,235,0.1)",
            }}
          />
        </div>

        <div
          className="mx-auto mt-1 w-full max-w-[200px]"
          style={{ borderBottom: `1px solid ${presDark ? "rgba(255,255,255,0.12)" : KPI_UI.baselineColor}` }}
        />

        <div className="mt-2.5 flex justify-center" style={{ gap: KPI_UI.barGap }}>
          <span
            className="text-center uppercase"
            style={{
              width: KPI_UI.barWidth,
              color: labelColor,
              fontSize: KPI_UI.barLabelSize,
              fontWeight: 600,
              letterSpacing: "0.06em",
            }}
          >
            План
          </span>
          <span
            className="text-center uppercase"
            style={{
              width: KPI_UI.barWidth,
              color: labelColor,
              fontSize: KPI_UI.barLabelSize,
              fontWeight: 600,
              letterSpacing: "0.06em",
            }}
          >
            Факт
          </span>
        </div>
      </div>
    </div>
  );
}

type KpiFactPlanCardBodyProps = {
  fact: number;
  plan: number | null;
  hasPlan: boolean;
  executionPct: number | null;
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
  dashCls: string;
};

function KpiFactPlanCardBody({
  fact,
  plan,
  hasPlan,
  executionPct,
  presDark,
  presentation,
  mplPremium,
  dashCls,
}: KpiFactPlanCardBodyProps) {
  const hue = executionPct != null ? apartmentKpiExecutionHue(executionPct) : null;
  const deviation = hasPlan && plan != null ? fact - plan : null;
  const runnerW =
    executionPct != null ? apartmentKpiProgressWidthPercent(executionPct) : 0;

  const runnerHue = hue ?? "red";

  const deviationLabelStyle = presDark
    ? { color: "#94a3b8", fontSize: KPI_UI.deviationLabelSize, fontWeight: 500 }
    : { color: KPI_MUTED_LABEL, fontSize: KPI_UI.deviationLabelSize, fontWeight: 500 };
  const fulfillmentLabelStyle = deviationLabelStyle;
  const deviationValueStyle = presDark
    ? { fontSize: "clamp(20px, 4vw, 26px)", fontWeight: 600, lineHeight: 1 }
    : { fontSize: KPI_UI.deviationValueSize, fontWeight: 600, lineHeight: 1 };
  const fulfillmentValueStyle = presDark
    ? { fontSize: "clamp(26px, 5vw, 34px)", fontWeight: 700, lineHeight: 1 }
    : { fontSize: KPI_UI.fulfillmentValueSize, fontWeight: 700, lineHeight: 1 };

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-visible">
      <div
        className="flex flex-1 flex-col items-center justify-center py-1"
        style={{ marginTop: KPI_UI.chartMarginY, marginBottom: KPI_UI.chartMarginY }}
      >
        <MiniFactPlanColumnChart
          fact={fact}
          plan={plan}
          hasPlan={hasPlan}
          presDark={presDark}
          presentation={presentation}
          mplPremium={mplPremium}
        />
      </div>

      <KpiSectionDivider presDark={presDark} />

      <div className="flex w-full items-center justify-between gap-3 whitespace-nowrap py-0.5">
        <span className="shrink-0" style={deviationLabelStyle}>
          Отклонение
        </span>
        <span
          className={`shrink-0 tabular-nums leading-none ${
            deviation != null ? deviationToneClass(deviation, presDark, presentation) : dashCls
          }`}
          style={deviationValueStyle}
        >
          {deviation != null ? formatKpiCount(deviation) : "—"}
        </span>
      </div>

      <KpiSectionDivider presDark={presDark} />

      <div className="mt-auto w-full shrink-0 space-y-2.5 pb-0.5">
        <div className="flex w-full items-start justify-between gap-3">
          <span className="shrink-0 pt-0.5" style={fulfillmentLabelStyle}>
            Выполнение
          </span>
          {executionPct != null && hue != null ? (
            <span
              className="shrink-0 tabular-nums leading-none"
              style={{
                ...fulfillmentValueStyle,
                ...pctToneStyle(hue, presDark),
              }}
            >
              {dec1Fmt.format(Math.round(executionPct * 10) / 10)}%
            </span>
          ) : (
            <span className={`shrink-0 leading-none ${dashCls}`} style={fulfillmentValueStyle}>
              —
            </span>
          )}
        </div>
        <KpiExecutionRunner widthPercent={runnerW} hue={runnerHue} presDark={presDark} />
      </div>
    </div>
  );
}

type CardShellProps = {
  title: string;
  children: ReactNode;
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
  skeleton?: boolean;
  centered?: boolean;
};

function KpiCircularProgressRing({
  percent,
  presDark,
}: {
  percent: number;
  presDark: boolean;
}) {
  const size = KPI_UI.ringSize;
  const strokeWidth = KPI_UI.ringStroke;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const animPct = useSmoothScalar(Math.min(100, Math.max(0, percent)));
  const offset = circumference - (animPct / 100) * circumference;
  const gradientId = "kpiBlueGradient";

  return (
    <div
      className="relative mx-auto flex items-center justify-center"
      style={{ width: KPI_UI.ringSize, height: KPI_UI.ringSize }}
    >
      <svg
        className="h-full w-full overflow-visible"
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#5EA0FF" />
            <stop offset="100%" stopColor="#2563EB" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={presDark ? "rgba(255,255,255,0.1)" : "#EEF2FF"}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={presDark ? "#3B82F6" : `url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
        <span
          className={`tabular-nums leading-none ${presDark ? "text-slate-100" : "text-slate-900"}`}
          style={{ fontSize: KPI_UI.ringPercentSize, fontWeight: 700, lineHeight: 1 }}
        >
          {dec1Fmt.format(Math.round(animPct * 10) / 10)}%
        </span>
        <span
          className="mt-1.5 uppercase"
          style={{
            fontSize: KPI_UI.ringSubtitleSize,
            fontWeight: 600,
            letterSpacing: "0.06em",
            color: presDark ? "#94a3b8" : KPI_MUTED_LABEL,
          }}
        >
          Реализовано
        </span>
      </div>
    </div>
  );
}

function KpiCardShell({ title, children, presDark, presentation, mplPremium, skeleton, centered }: CardShellProps) {
  void mplPremium;

  const hoverLift = skeleton
    ? ""
    : "transition-all duration-[250ms] ease hover:-translate-y-[2px]";

  const lightCardStyle = presDark
    ? undefined
    : {
        background: KPI_UI.cardBg,
        border: KPI_UI.cardBorder,
        borderRadius: KPI_UI.cardRadius,
        boxShadow: KPI_CARD_SHADOW,
        minHeight: KPI_UI.cardMinHeight,
        padding: KPI_UI.cardPadding,
      };

  const surface = presDark
    ? "rounded-[20px] border border-white/10 bg-slate-900/50 shadow-[0_8px_28px_rgba(0,0,0,0.28)]"
    : "rounded-[20px]";

  const titleStyle = presDark
    ? undefined
    : {
        fontSize: KPI_UI.titleSize,
        fontWeight: 600,
        letterSpacing: KPI_UI.titleTracking,
        color: KPI_MUTED_LABEL,
        textTransform: "uppercase" as const,
      };

  const titleCls = presDark
    ? "text-[13px] font-semibold uppercase tracking-[0.12em] text-slate-400"
    : "";

  return (
    <div
      className={`group flex h-full w-full min-w-0 flex-col overflow-visible ${surface} ${hoverLift}`}
      style={
        presDark
          ? { minHeight: KPI_UI.cardMinHeight, padding: KPI_UI.cardPadding }
          : lightCardStyle
      }
      onMouseEnter={
        presDark || skeleton
          ? undefined
          : (e) => {
              (e.currentTarget as HTMLDivElement).style.boxShadow = KPI_CARD_SHADOW_HOVER;
            }
      }
      onMouseLeave={
        presDark || skeleton
          ? undefined
          : (e) => {
              (e.currentTarget as HTMLDivElement).style.boxShadow = KPI_CARD_SHADOW;
            }
      }
    >
      <div className={`shrink-0 ${titleCls}`} style={titleStyle}>
        {title}
      </div>
      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-visible ${
          centered ? "items-center justify-center pt-2" : "pt-4"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function KpiSkeletonLine({ presDark }: { presDark: boolean }) {
  const track = presDark ? "bg-white/[0.08]" : "bg-slate-200/60";
  return <div className={`h-8 w-2/3 animate-pulse rounded-md ${track}`} aria-hidden />;
}

type CsvMeta = { fileName: string; updatedAt: string };

function CsvKpiDiagnosticsPanel({
  diagnostics,
  presDark,
  presentation,
}: {
  diagnostics: ApartmentPlanCsvParseDiagnostics;
  presDark: boolean;
  presentation: boolean;
}) {
  const { columnMapping, previewRows, delimiter, rawHeaders } = diagnostics;
  const titleCls = presDark ? "text-slate-200" : presentation ? "text-mpl-text" : "text-slate-900";
  const mutedCls = presDark ? "text-slate-400" : presentation ? "text-mpl-muted" : "text-slate-600";
  const box = presDark
    ? "rounded-xl border border-white/10 bg-slate-900/40"
    : presentation
      ? "rounded-xl border border-mpl-border/80 bg-mpl-card/80"
      : "rounded-xl border border-slate-200/90 bg-white/90";

  const cols = rawHeaders.length ? rawHeaders : columnMapping ? Object.values(columnMapping) : [];

  return (
    <div className={`mb-4 ${box} p-4 text-left`}>
      <div className={`text-xs font-semibold uppercase tracking-wide ${mutedCls}`}>Разбор CSV (отладка)</div>
      {diagnostics.csvType ? (
        <p className={`mt-2 text-xs ${mutedCls}`}>
          Тип CSV:{" "}
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {diagnostics.csvType === "bi_report" ? "BI Report" : "Широкая таблица (сырые строки)"}
          </span>
          {diagnostics.monthKeyUsed ? (
            <>
              {" "}
              · месяц для строк: <span className="font-mono font-semibold">{diagnostics.monthKeyUsed}</span>
            </>
          ) : null}
        </p>
      ) : null}
      {diagnostics.importedSegmentRows != null || diagnostics.ignoredSummaryRows != null ? (
        <p className={`mt-1 text-xs ${mutedCls}`}>
          Импортировано сегментов:{" "}
          <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
            {diagnostics.importedSegmentRows ?? "—"}
          </span>
          {diagnostics.ignoredSummaryRows != null ? (
            <>
              {" "}
              · пропущено агрегирующих строк:{" "}
              <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                {diagnostics.ignoredSummaryRows}
              </span>
            </>
          ) : null}
        </p>
      ) : null}
      {diagnostics.factSource === "system_json" ? (
        <p className={`mt-2 text-xs ${mutedCls}`}>
          Fact source: <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">SYSTEM JSON</span>
        </p>
      ) : null}
      {delimiter ? (
        <p className={`mt-2 text-xs ${mutedCls}`}>
          Разделитель: <span className="font-mono font-semibold">{delimiter === "\t" ? "TAB" : delimiter}</span>
        </p>
      ) : null}
      {columnMapping && Object.keys(columnMapping).length > 0 ? (
        <div className="mt-3">
          <div className={`text-xs font-semibold ${titleCls}`}>Сопоставление колонок</div>
          <ul className={`mt-1.5 list-inside list-disc space-y-0.5 text-xs ${mutedCls}`}>
            {Object.entries(columnMapping).map(([canonical, original]) => (
              <li key={canonical}>
                <span className="font-mono text-[11px] font-semibold text-sky-600/90 dark:text-sky-300/90">{canonical}</span>
                {" → "}
                <span className="text-slate-700 dark:text-slate-200">&quot;{original}&quot;</span>
              </li>
            ))}
          </ul>
        </div>
      ) : rawHeaders.length > 0 ? (
        <div className="mt-3">
          <div className={`text-xs font-semibold ${titleCls}`}>Заголовки в файле</div>
          <p className={`mt-1 font-mono text-[11px] leading-snug ${mutedCls}`}>{rawHeaders.join(" · ")}</p>
        </div>
      ) : null}

      {previewRows.length > 0 && cols.length > 0 ? (
        <div className="mt-4 min-w-0">
          <div className={`text-xs font-semibold ${titleCls}`}>Превью распознанных строк</div>
          <div className="mt-2 max-h-[220px] overflow-auto rounded-lg border border-slate-200/40 dark:border-white/10">
            <table className="w-full min-w-[480px] border-collapse text-left text-[11px]">
              <thead>
                <tr className={presDark ? "border-b border-white/10 bg-slate-950/50" : "border-b border-slate-200 bg-slate-50"}>
                  {cols.map((c) => (
                    <th key={c} className={`max-w-[10rem] whitespace-normal px-2 py-1.5 font-semibold ${mutedCls}`}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, ri) => (
                  <tr key={ri} className={presDark ? "border-b border-white/[0.06]" : "border-b border-slate-100"}>
                    {cols.map((c) => (
                      <td key={c} className="max-w-[10rem] whitespace-pre-wrap break-words px-2 py-1.5 tabular-nums text-slate-700 dark:text-slate-200">
                        {row[c] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PlanCalcKpiDebugPanel({
  debug,
  presDark,
  presentation,
}: {
  debug: ApartmentPlanKpiPlanCalcDebug;
  presDark: boolean;
  presentation: boolean;
}) {
  const mutedCls = presDark ? "text-slate-400" : presentation ? "text-mpl-muted" : "text-slate-600";
  const box = presDark
    ? "rounded-xl border border-white/10 bg-slate-900/40"
    : presentation
      ? "rounded-xl border border-mpl-border/80 bg-mpl-card/80"
      : "rounded-xl border border-slate-200/90 bg-white/90";

  return (
    <div className={`mb-4 ${box} p-4 text-left`}>
      <div className={`text-xs font-semibold uppercase tracking-wide ${mutedCls}`}>План KPI (отладка)</div>
      <p className={`mt-2 text-xs ${mutedCls}`}>
        Calculation strategy:{" "}
        <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">
          {debug.calculationStrategyLabel}
        </span>
      </p>
      {debug.kpiEntity ? (
        <p className={`mt-1 text-xs ${mutedCls}`}>
          KPI Entity: <span className="font-mono font-semibold">{debug.kpiEntity}</span>
        </p>
      ) : null}
      {debug.csvSummaryRow ? (
        <p className={`mt-1 text-xs ${mutedCls}`}>
          Using CSV row: <span className="font-semibold text-slate-800 dark:text-slate-100">{debug.csvSummaryRow}</span>
        </p>
      ) : null}
      {debug.selectedMonthLabel ? (
        <p className={`mt-1 text-xs ${mutedCls}`}>
          Selected month:{" "}
          <span className="font-semibold text-slate-800 dark:text-slate-100">{debug.selectedMonthLabel}</span>
        </p>
      ) : null}
      {debug.planCumulativeSource != null ? (
        <p className={`mt-1 text-xs ${mutedCls}`}>
          Plan cumulative source:{" "}
          <span className="font-mono font-semibold tabular-nums text-slate-800 dark:text-slate-100">
            {debug.planCumulativeSource}
          </span>
        </p>
      ) : null}
      <p className={`mt-1 text-xs ${mutedCls}`}>{debug.cumulativeDebugEn}</p>
      <p className={`mt-1 text-xs ${mutedCls} opacity-90`}>{debug.cumulativeDebugRu}</p>
    </div>
  );
}

function DealApartmentKpiDebugPanel({
  debug,
  presDark,
  presentation,
}: {
  debug: ApartmentPlanKpiDealFactDebug;
  presDark: boolean;
  presentation: boolean;
}) {
  const mutedCls = presDark ? "text-slate-400" : presentation ? "text-mpl-muted" : "text-slate-600";
  const box = presDark
    ? "rounded-xl border border-white/10 bg-slate-900/40"
    : presentation
      ? "rounded-xl border border-mpl-border/80 bg-mpl-card/80"
      : "rounded-xl border border-slate-200/90 bg-white/90";

  return (
    <div className={`mb-4 ${box} p-4 text-left`}>
      <div className={`text-xs font-semibold uppercase tracking-wide ${mutedCls}`}>Факт KPI (отладка)</div>
      <p className={`mt-2 text-xs ${mutedCls}`}>
        Fact source:{" "}
        <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">SYSTEM JSON</span>
      </p>
      <p className={`mt-1 text-xs ${mutedCls}`}>
        Deals loaded:{" "}
        <span className="font-mono font-semibold tabular-nums text-slate-800 dark:text-slate-100">{debug.dealsLoaded}</span>
      </p>
      <p className={`mt-1 text-xs ${mutedCls}`}>
        Unique sold apartments:{" "}
        <span className="font-mono font-semibold tabular-nums text-slate-800 dark:text-slate-100">
          {debug.uniqueSoldApartments}
        </span>
      </p>
      <p className={`mt-1 text-xs ${mutedCls}`}>
        Selected month:{" "}
        <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">{debug.selectedMonth}</span>
        {" · end "}
        <span className="font-mono font-semibold">{debug.endMonthKey}</span>
      </p>
      <p className={`mt-1 text-xs ${mutedCls}`}>
        Apartment rows in feed:{" "}
        <span className="font-mono font-semibold tabular-nums">{debug.apartmentRowsInFeed}</span>
        {" · status rejected: "}
        <span className="font-mono font-semibold tabular-nums">{debug.statusRejected}</span>
      </p>
      <p className={`mt-1 text-xs ${mutedCls}`}>
        Duplicate deals removed:{" "}
        <span className="font-mono font-semibold tabular-nums text-slate-800 dark:text-slate-100">
          {debug.duplicateDealRowsRemoved}
        </span>
        {" · rows after status: "}
        <span className="font-mono font-semibold tabular-nums">{debug.factRowsConsidered}</span>
      </p>
    </div>
  );
}

function KpiPlanDebugStrip({
  presDark,
  presentation,
}: {
  presDark: boolean;
  presentation: boolean;
}) {
  const mutedCls = presDark ? "text-slate-400" : presentation ? "text-mpl-muted" : "text-slate-600";
  const box = presDark
    ? "rounded-xl border border-white/10 bg-slate-900/40"
    : presentation
      ? "rounded-xl border border-mpl-border/80 bg-mpl-card/80"
      : "rounded-xl border border-slate-200/90 bg-white/90";

  return (
    <div className={`mb-4 ${box} p-4 text-left`}>
      <div className={`text-xs font-semibold uppercase tracking-wide ${mutedCls}`}>Разбор CSV (отладка)</div>
      <p className={`mt-2 text-xs ${mutedCls}`}>
        Plan source:{" "}
        <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">NOT LOADED</span>
      </p>
      <p className={`mt-1 text-xs ${mutedCls}`}>
        Fact source: <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">SYSTEM JSON</span>
      </p>
    </div>
  );
}

type Props = {
  data: ApartmentPlanPeriodKpiUiData;
  presentation: boolean;
  presDark: boolean;
  mplPremium: boolean;
  isEditMode?: boolean;
  csvHydrated?: boolean;
  csvLoading?: boolean;
  csvError?: string | null;
  csvMeta?: CsvMeta | null;
  hasCsv?: boolean;
  onCsvUpload?: (file: File) => Promise<void>;
  onCsvClear?: () => Promise<void>;
  csvDiagnostics?: ApartmentPlanCsvParseDiagnostics | null;
};

export function ApartmentPlanPeriodKpiBlock({
  data,
  presentation,
  presDark,
  mplPremium,
  isEditMode = false,
  csvHydrated = true,
  csvLoading = false,
  csvError = null,
  csvMeta = null,
  hasCsv = false,
  onCsvUpload,
  onCsvClear,
  csvDiagnostics = null,
}: Props) {
  const safeData: ApartmentPlanPeriodKpiUiData =
    data && typeof data === "object"
      ? data
      : { hasCsvPlan: false, factMonth: 0, factCumulative: 0 };
  const debouncedData = useDebouncedValue(safeData, 120);

  if (!data || typeof data !== "object") return null;

  const hasPlanKpi = debouncedData.hasCsvPlan;
  const planMonthDen = hasPlanKpi ? debouncedData.planMonth : null;
  const planCumDen = hasPlanKpi ? debouncedData.planCumulative : null;
  const totalVolDen = hasPlanKpi ? debouncedData.totalVolume : null;

  const titleCls = presDark ? "text-slate-100" : presentation ? "text-mpl-text" : "text-slate-950";
  const dashCls = presDark ? "text-slate-500" : presentation ? "text-mpl-muted" : "text-slate-400";

  const pctMonth = apartmentKpiExecutionPercent(debouncedData.factMonth, planMonthDen);
  const pctCum = apartmentKpiExecutionPercent(debouncedData.factCumulative, planCumDen);
  const pctTotal = apartmentKpiExecutionPercent(debouncedData.factCumulative, totalVolDen);

  const spctT = useSmoothScalar(pctTotal ?? 0);

  const factExceedsTotalVolume = hasPlanKpi && debouncedData.factCumulative > debouncedData.totalVolume;

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const busy = csvLoading;

  const processFile = useCallback(
    async (file: File) => {
      if (!onCsvUpload) return;
      if (!file.name.toLowerCase().endsWith(".csv")) {
        setLocalErr("Разрешены только файлы .csv");
        return;
      }
      setLocalErr(null);
      try {
        await onCsvUpload(file);
      } catch (e) {
        setLocalErr(e instanceof Error ? e.message : "Не удалось загрузить файл");
      }
    },
    [onCsvUpload],
  );

  const onInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) void processFile(file);
    },
    [processFile],
  );

  const onDragOver = useCallback((e: DragEvent) => {
    if (!isEditMode || !onCsvUpload || busy) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, [isEditMode, onCsvUpload, busy]);

  const onDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      if (!isEditMode || !onCsvUpload || busy) return;
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void processFile(file);
    },
    [isEditMode, onCsvUpload, busy, processFile],
  );

  const err = localErr || csvError;
  const isSoftCsvIssue = !localErr && !!csvError;

  const uploadBtnCls = presDark
    ? "inline-flex items-center gap-1.5 rounded-lg border border-slate-500/50 bg-slate-800/50 px-3 py-1.5 text-xs font-semibold text-slate-200 shadow-sm hover:border-slate-400/60 hover:bg-slate-800/80 disabled:cursor-not-allowed disabled:opacity-40"
    : "inline-flex items-center gap-1.5 rounded-lg border border-slate-300/90 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

  const showSkeleton = busy && isEditMode;

  const sectionPad = presDark ? "px-0 py-5" : presentation ? "px-0 py-6" : "px-1 py-6 sm:px-2 sm:py-7";
  const sectionSurfaceStyle =
    presDark || presentation ? undefined : { background: KPI_UI.dashboardBg };

  return (
    <div
      className={`relative z-0 mt-6 w-full min-w-0 border-t pt-6 ${
        presDark
          ? "border-white/10"
          : presentation
            ? "border-slate-200/40"
            : "border-slate-200/50"
      } ${dragOver && isEditMode ? (presDark ? "ring-2 ring-sky-500/40 ring-offset-2 ring-offset-slate-900" : "ring-2 ring-sky-400/50 ring-offset-2") : ""}`}
      style={sectionSurfaceStyle}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isEditMode && onCsvUpload ? <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onInputChange} /> : null}

      <div className={`relative z-[1] ${sectionPad}`}>
      <div className="relative z-[1] mb-5 flex min-w-0 flex-col gap-3 md:mb-6 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className={`text-base font-semibold leading-snug tracking-tight sm:text-lg ${titleCls}`}>
            Выполнение плана отчетного периода
          </h2>
        </div>
        {isEditMode && onCsvUpload ? (
          <div className="flex w-full min-w-0 flex-col gap-2 md:w-auto md:flex-row md:items-center md:justify-end">
            {hasCsv && csvMeta ? (
              <span
                className={`order-2 hidden truncate text-xs font-semibold tabular-nums md:order-1 md:block md:max-w-[14rem] md:pe-1 md:text-right ${
                  presDark ? "text-slate-400" : presentation ? "text-mpl-muted" : "text-slate-600"
                }`}
                title={csvMeta.fileName}
              >
                {csvMeta.fileName}
              </span>
            ) : null}
            <div className="order-1 flex min-w-0 flex-wrap items-center gap-2 md:order-2">
              <button
                type="button"
                disabled={busy}
                className={`${uploadBtnCls} shrink-0 transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] ${
                  hasCsv && !busy
                    ? presDark
                      ? "border-emerald-500/40 text-emerald-200"
                      : "border-emerald-500/50 text-emerald-800"
                    : ""
                }`}
                title={hasCsv ? "Нажмите, чтобы подгрузить другой CSV" : "Перетащите CSV сюда или выберите файл"}
                onClick={() => inputRef.current?.click()}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                {busy ? "Загрузка…" : hasCsv ? "CSV загружен" : "Подгрузить CSV"}
              </button>
              {hasCsv && onCsvClear ? (
                <button
                  type="button"
                  disabled={busy}
                  className="shrink-0 text-xs font-semibold text-rose-600 hover:text-rose-500 disabled:opacity-40"
                  onClick={() => void onCsvClear().catch((e) => setLocalErr(e instanceof Error ? e.message : "Ошибка сброса"))}
                >
                  Сбросить
                </button>
              ) : null}
            </div>
            {hasCsv && csvMeta ? (
              <span
                className={`order-3 truncate text-xs font-semibold tabular-nums md:hidden ${
                  presDark ? "text-slate-400" : presentation ? "text-mpl-muted" : "text-slate-600"
                }`}
                title={csvMeta.fileName}
              >
                {csvMeta.fileName}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {err ? (
        <div
          role="alert"
          className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${
            isSoftCsvIssue
              ? presDark
                ? "border-amber-500/40 bg-amber-950/35 text-amber-100"
                : "border-amber-200 bg-amber-50 text-amber-950"
              : presDark
                ? "border-rose-500/35 bg-rose-950/50 text-rose-100"
                : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          <div>{err}</div>
          {isSoftCsvIssue ? (
            <p className={`mt-2 text-xs font-normal ${presDark ? "text-amber-200/85" : "text-amber-900/85"}`}>
              Факт на карточках — из системы (сделки / отчёт). План и проценты выполнения по этому CSV не применены.
            </p>
          ) : null}
        </div>
      ) : null}

      {factExceedsTotalVolume ? (
        <div
          role="alert"
          className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${
            presDark
              ? "border-amber-500/40 bg-amber-950/35 text-amber-100"
              : "border-amber-200 bg-amber-50 text-amber-950"
          }`}
        >
          Fact data exceeds total apartment volume. Check deal deduplication.
        </div>
      ) : null}

      {isEditMode && csvHydrated && !hasCsv ? <KpiPlanDebugStrip presDark={presDark} presentation={presentation} /> : null}

      {isEditMode && hasCsv && debouncedData.hasCsvPlan && debouncedData.planCalcDebug ? (
        <PlanCalcKpiDebugPanel
          debug={debouncedData.planCalcDebug}
          presDark={presDark}
          presentation={presentation}
        />
      ) : null}

      {isEditMode && debouncedData.dealFactDebug ? (
        <DealApartmentKpiDebugPanel debug={debouncedData.dealFactDebug} presDark={presDark} presentation={presentation} />
      ) : isEditMode ? (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-xs ${
            presDark ? "border-white/10 bg-slate-900/30 text-slate-400" : "border-slate-200/90 bg-slate-50/80 text-slate-600"
          }`}
        >
          Fact source: <span className="font-mono font-semibold">SYSTEM JSON</span> — сделки ещё не загружены или пустой
          список.
        </div>
      ) : null}

      {isEditMode && csvDiagnostics && (csvDiagnostics.rawHeaders.length > 0 || (csvDiagnostics.previewRows?.length ?? 0) > 0) ? (
        <CsvKpiDiagnosticsPanel diagnostics={csvDiagnostics} presDark={presDark} presentation={presentation} />
      ) : null}

      {csvHydrated && isEditMode && !presentation ? (
        <div
          className={`mb-4 rounded-xl border px-4 py-2.5 text-xs ${
            presDark ? "border-white/10 bg-slate-900/30 text-slate-400" : "border-slate-200/90 bg-slate-50/80 text-slate-600"
          }`}
        >
          {!hasCsv ? (
            <span>
              CSV файл плана не загружен. Загрузите плановый отчёт для расчёта KPI выполнения. Факт отображается из системы.
            </span>
          ) : csvMeta ? (
            <div className="tabular-nums font-medium">
              <span className={presDark ? "text-slate-500" : "text-slate-500"}>Обновлено: </span>
              <span>
                {new Date(csvMeta.updatedAt).toLocaleString("ru-RU", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
        <div className="flex min-w-0 overflow-visible">
          <KpiCardShell
            title="План на отчетный месяц"
            presDark={presDark}
            presentation={presentation}
            mplPremium={mplPremium}
            skeleton={showSkeleton}
          >
            {showSkeleton ? (
              <KpiSkeletonLine presDark={presDark} />
            ) : (
              <KpiFactPlanCardBody
                fact={debouncedData.factMonth}
                plan={planMonthDen}
                hasPlan={hasPlanKpi}
                executionPct={pctMonth}
                presDark={presDark}
                presentation={presentation}
                mplPremium={mplPremium}
                dashCls={dashCls}
              />
            )}
          </KpiCardShell>
        </div>

        <div className="flex min-w-0 overflow-visible">
          <KpiCardShell
            title="План накопительно итогом"
            presDark={presDark}
            presentation={presentation}
            mplPremium={mplPremium}
            skeleton={showSkeleton}
          >
            {showSkeleton ? (
              <KpiSkeletonLine presDark={presDark} />
            ) : (
              <KpiFactPlanCardBody
                fact={debouncedData.factCumulative}
                plan={planCumDen}
                hasPlan={hasPlanKpi}
                executionPct={pctCum}
                presDark={presDark}
                presentation={presentation}
                mplPremium={mplPremium}
                dashCls={dashCls}
              />
            )}
          </KpiCardShell>
        </div>

        <div className="flex min-w-0 overflow-visible">
          <KpiCardShell
            title="% выполнения от общего объема"
            presDark={presDark}
            presentation={presentation}
            mplPremium={mplPremium}
            skeleton={showSkeleton}
            centered
          >
            {showSkeleton ? (
              <KpiSkeletonLine presDark={presDark} />
            ) : pctTotal != null ? (
              <div className="relative flex w-full flex-col items-center justify-center py-3">
                <KpiCircularProgressRing percent={spctT} presDark={presDark} />
              </div>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center px-2 py-3 text-center">
                <div
                  className="mx-auto flex items-center justify-center rounded-full border-[9px] border-[#EEF2FF]"
                  style={{ width: KPI_UI.ringSize, height: KPI_UI.ringSize }}
                >
                  <span
                    className={`tabular-nums leading-none ${dashCls}`}
                    style={{ fontSize: KPI_UI.ringPercentSize, fontWeight: 700 }}
                  >
                    —
                  </span>
                </div>
                <span
                  className="mt-1.5 uppercase"
                  style={{
                    fontSize: KPI_UI.ringSubtitleSize,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    color: KPI_MUTED_LABEL,
                  }}
                >
                  Реализовано
                </span>
              </div>
            )}
          </KpiCardShell>
        </div>
      </div>
      </div>
    </div>
  );
}
