"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import type { EntityKpiTheme } from "@/lib/entityKpiTheme";
import { formatDduRevenueRubParts } from "@/lib/dduRevenuePeriodKpi";
import { formatProjectValueRubParts } from "@/lib/projectValuePeriodKpi";
import { formatInstallmentAreaSqmParts } from "@/lib/installmentAreaPeriodKpi";
import {
  apartmentKpiExecutionHue,
  apartmentKpiProgressWidthPercent,
  type ApartmentKpiHue,
} from "@/lib/apartmentsPlanPeriodKpi";
import { dec1Fmt, dec2Fmt, numFmt } from "@/lib/salesPlanChartFormat";

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

/** Компактные токены для блока комнатности (4 в ряд, внутри — rail + 3 KPI горизонтально). */
export const ROOM_TYPE_KPI_UI = {
  ...ENTITY_KPI_UI,
  cardMinHeight: 360,
  cardPadding: 14,
  chartAreaHeight: 118,
  chartMarginY: 14,
  barMaxHeight: 72,
  barWidth: 30,
  barGap: 18,
  barValueSize: 15,
  barLabelSize: 9,
  dividerMarginY: 12,
  deviationLabelSize: 11,
  deviationValueSize: 20,
  fulfillmentValueSize: 26,
  ringSize: 132,
  ringPercentSize: 32,
  ringSubtitleSize: 11,
} as const;

/** Компактная типографика KPI площади (парковки / кладовые в Рассрочка ДДУ). */
export const kpiValueSizeCompact = 28;
export const kpiMetricSizeCompact = 20;
export const kpiChartLabelSizeCompact = 14;
export const kpiMetricUnitScale = 0.72;
export const kpiMetricUnitOpacity = 0.9;

export const INSTALLMENT_AREA_ENTITY_KPI_UI = {
  ...ENTITY_KPI_UI,
  barValueSize: kpiChartLabelSizeCompact,
  deviationLabelSize: 12,
  deviationValueSize: kpiMetricSizeCompact,
  fulfillmentValueSize: kpiValueSizeCompact,
} as const;

export type EntityKpiCardsDensity =
  | "default"
  | "room-type"
  | "installment-area-entity"
  | "ddu-revenue-entity"
  | "project-value-entity";

function kpiUiTokens(density: EntityKpiCardsDensity) {
  if (density === "room-type") return ROOM_TYPE_KPI_UI;
  if (
    density === "installment-area-entity" ||
    density === "ddu-revenue-entity" ||
    density === "project-value-entity"
  ) {
    return INSTALLMENT_AREA_ENTITY_KPI_UI;
  }
  return ENTITY_KPI_UI;
}

function usesInstallmentAreaSqmLabels(theme: EntityKpiTheme, density: EntityKpiCardsDensity): boolean {
  return theme.id === "installment_area" || density === "installment-area-entity";
}

function usesCompactCurrencyLabels(theme: EntityKpiTheme, density: EntityKpiCardsDensity): boolean {
  return (
    theme.id === "ddu_revenue" ||
    theme.id === "project_value" ||
    density === "ddu-revenue-entity" ||
    density === "project-value-entity"
  );
}

function compactCurrencyParts(theme: EntityKpiTheme, value: number) {
  return theme.id === "project_value"
    ? formatProjectValueRubParts(value)
    : formatDduRevenueRubParts(value);
}

function usesSplitMetricLabels(theme: EntityKpiTheme, density: EntityKpiCardsDensity): boolean {
  return usesInstallmentAreaSqmLabels(theme, density) || usesCompactCurrencyLabels(theme, density);
}

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

type KpiMiniChartUi = {
  barGap: number;
  barColumnWidth: number;
  barWidth: number;
  barValueSize: number;
  barValueExtraLine: number;
  chartAreaHeight: number;
  chartShellClass: string;
  chartInnerMaxClass: string;
};

function kpiMiniChartUi(theme: EntityKpiTheme, density: EntityKpiCardsDensity = "default"): KpiMiniChartUi {
  if (density === "room-type") {
    return {
      barGap: ROOM_TYPE_KPI_UI.barGap,
      barColumnWidth: ROOM_TYPE_KPI_UI.barWidth,
      barWidth: ROOM_TYPE_KPI_UI.barWidth,
      barValueSize: ROOM_TYPE_KPI_UI.barValueSize,
      barValueExtraLine: 0,
      chartAreaHeight: ROOM_TYPE_KPI_UI.chartAreaHeight,
      chartShellClass: "relative mx-auto w-full min-w-0 max-w-[168px]",
      chartInnerMaxClass: "mx-auto w-full max-w-[168px]",
    };
  }
  if (usesSplitMetricLabels(theme, density)) {
    const barValueSize =
      density === "installment-area-entity" ||
      density === "ddu-revenue-entity" ||
      density === "project-value-entity"
        ? kpiChartLabelSizeCompact
        : 16;
    const barValueExtraLine =
      density === "installment-area-entity" ||
      density === "ddu-revenue-entity" ||
      density === "project-value-entity"
        ? 10
        : 14;
    return {
      barGap: 56,
      barColumnWidth: 120,
      barWidth: ENTITY_KPI_UI.barWidth,
      barValueSize,
      barValueExtraLine,
      chartAreaHeight: ENTITY_KPI_UI.chartAreaHeight,
      chartShellClass: "relative mx-auto w-full min-w-[280px] max-w-[320px] sm:min-w-[296px]",
      chartInnerMaxClass: "mx-auto w-full max-w-[320px]",
    };
  }
  return {
    barGap: ENTITY_KPI_UI.barGap,
    barColumnWidth: ENTITY_KPI_UI.barWidth,
    barWidth: ENTITY_KPI_UI.barWidth,
    barValueSize: ENTITY_KPI_UI.barValueSize,
    barValueExtraLine: 0,
    chartAreaHeight: ENTITY_KPI_UI.chartAreaHeight,
    chartShellClass: "relative mx-auto w-full max-w-[200px] sm:max-w-[220px]",
    chartInnerMaxClass: "mx-auto w-full max-w-[200px]",
  };
}

function kpiBarColumnHeightPx(ui: KpiMiniChartUi): number {
  return ENTITY_KPI_UI.barMaxHeight + ui.barValueSize + ENTITY_KPI_UI.barValueGap + ui.barValueExtraLine;
}

function KpiBarValueLabel({
  value,
  hasValue,
  theme,
  formatMetric,
  color,
  bottomPx,
  fontSize,
  columnWidth,
  density = "default",
}: {
  value: number;
  hasValue: boolean;
  theme: EntityKpiTheme;
  formatMetric: (n: number) => string;
  color: string;
  bottomPx: number;
  fontSize: number;
  columnWidth: number;
  density?: EntityKpiCardsDensity;
}) {
  if (!hasValue) {
    return (
      <span
        className="pointer-events-none absolute left-1/2 z-[1] -translate-x-1/2 text-center tabular-nums"
        style={{
          bottom: bottomPx,
          width: columnWidth,
          color,
          fontSize,
          fontWeight: 600,
          lineHeight: 1.1,
        }}
      >
        —
      </span>
    );
  }

  if (usesSplitMetricLabels(theme, density)) {
    const parts = usesCompactCurrencyLabels(theme, density)
      ? compactCurrencyParts(theme, value)
      : formatInstallmentAreaSqmParts(value);
    if (parts.value === "—") {
      return (
        <span
          className="pointer-events-none absolute left-1/2 z-[1] -translate-x-1/2 text-center tabular-nums"
          style={{ bottom: bottomPx, width: columnWidth, color, fontSize, fontWeight: 700, lineHeight: 1.2 }}
        >
          —
        </span>
      );
    }
    return (
      <span
        className="pointer-events-none absolute left-1/2 z-[1] flex -translate-x-1/2 flex-col items-center text-center tabular-nums"
        style={{
          bottom: bottomPx,
          width: columnWidth,
          color,
          fontSize,
          fontWeight: 700,
          lineHeight: 1.2,
          whiteSpace: "normal",
        }}
      >
        <span>{parts.value}</span>
        <span
          className="font-semibold"
          style={{ fontSize: `${kpiMetricUnitScale}em`, opacity: kpiMetricUnitOpacity, lineHeight: 1.2 }}
        >
          {"unit" in parts ? parts.unit : ""}
        </span>
      </span>
    );
  }

  return (
    <span
      className="pointer-events-none absolute left-1/2 z-[1] -translate-x-1/2 whitespace-nowrap text-center tabular-nums"
      style={{
        bottom: bottomPx,
        width: columnWidth,
        color,
        fontSize,
        fontWeight: 600,
      }}
    >
      {formatMetric(value)}
    </span>
  );
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
  density = "default",
  formatMetric = formatKpiCount,
  planBarLabel = "План",
  factBarLabel = "Факт",
}: {
  fact: number;
  plan: number | null;
  hasPlan: boolean;
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
  theme: EntityKpiTheme;
  density?: EntityKpiCardsDensity;
  formatMetric?: (n: number) => string;
  planBarLabel?: string;
  factBarLabel?: string;
}) {
  const UI = kpiUiTokens(density);
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
  const labelColor = presDark ? "#94a3b8" : UI.mutedLabel;
  const chartUi = kpiMiniChartUi(theme, density);
  const colH = kpiBarColumnHeightPx(chartUi);
  const planBarPx = Math.max(4, (animPlanH / 100) * UI.barMaxHeight);
  const factBarPx = Math.max(4, (animFactH / 100) * UI.barMaxHeight);

  return (
    <div
      className={chartUi.chartShellClass}
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
                {formatMetric(fact)}
              </span>
            </div>
            <div>
              <span className={mutedTip}>План: </span>
              <span className="font-semibold text-[#FF6A00]">
                {hasPlan && plan != null ? formatMetric(planVal) : "—"}
              </span>
            </div>
            <div>
              <span className={mutedTip}>Отклонение: </span>
              {deviation != null ? (
                <span className={`font-semibold ${deviationToneClass(deviation, presDark, presentation)}`}>
                  {formatMetric(deviation)}
                </span>
              ) : (
                <span className="font-semibold">—</span>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mx-auto flex w-full flex-col items-center justify-end" style={{ minHeight: chartUi.chartAreaHeight }}>
        <div className="flex items-end justify-center" style={{ height: colH, gap: chartUi.barGap }}>
          <div
            className="relative flex shrink-0 flex-col items-center justify-end"
            style={{ width: chartUi.barColumnWidth, height: colH }}
          >
            <KpiBarValueLabel
              value={planVal}
              hasValue={hasPlan && plan != null}
              theme={theme}
              formatMetric={formatMetric}
              color={valueColor}
              bottomPx={planBarPx + UI.barValueGap}
              fontSize={chartUi.barValueSize}
              columnWidth={chartUi.barColumnWidth}
              density={density}
            />
            <div
              className="w-full transition-[height] duration-500 ease-out"
              style={{
                width: chartUi.barWidth,
                height: planBarPx,
                background: hasPlan && plan != null ? theme.planGradient : undefined,
                borderRadius: UI.barRadius,
                boxShadow: hasPlan && plan != null ? "0 3px 10px rgba(255,122,0,0.1)" : undefined,
              }}
            />
          </div>
          <div
            className="relative flex shrink-0 flex-col items-center justify-end"
            style={{ width: chartUi.barColumnWidth, height: colH }}
          >
            <KpiBarValueLabel
              value={fact}
              hasValue
              theme={theme}
              formatMetric={formatMetric}
              color={valueColor}
              bottomPx={factBarPx + UI.barValueGap}
              fontSize={chartUi.barValueSize}
              columnWidth={chartUi.barColumnWidth}
              density={density}
            />
            <div
              className="w-full transition-[height] duration-500 ease-out"
              style={{
                width: chartUi.barWidth,
                height: factBarPx,
                background: theme.factGradient,
                borderRadius: UI.barRadius,
                boxShadow: theme.factBarShadow,
              }}
            />
          </div>
        </div>
        <div
          className={`mt-1 w-full ${chartUi.chartInnerMaxClass}`}
          style={{ borderBottom: `1px solid ${presDark ? "rgba(255,255,255,0.12)" : UI.baselineColor}` }}
        />
        <div className="mt-2.5 flex justify-center" style={{ gap: chartUi.barGap }}>
          <span
            className="text-center uppercase"
            style={{
              width: chartUi.barColumnWidth,
              color: labelColor,
              fontSize: UI.barLabelSize,
              fontWeight: 600,
            }}
          >
            {planBarLabel}
          </span>
          <span
            className="text-center uppercase"
            style={{
              width: chartUi.barColumnWidth,
              color: labelColor,
              fontSize: UI.barLabelSize,
              fontWeight: 600,
            }}
          >
            {factBarLabel}
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
  density = "default",
  formatMetric = formatKpiCount,
  planBarLabel = "План",
  factBarLabel = "Факт",
  hideExecutionPct = false,
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
  density?: EntityKpiCardsDensity;
  formatMetric?: (n: number) => string;
  planBarLabel?: string;
  factBarLabel?: string;
  hideExecutionPct?: boolean;
}) {
  const UI = kpiUiTokens(density);
  const hue = executionPct != null ? apartmentKpiExecutionHue(executionPct) : null;
  const deviation = hasPlan && plan != null ? fact - plan : null;
  const runnerW = executionPct != null ? apartmentKpiProgressWidthPercent(executionPct) : 0;
  const deviationLabelStyle = { color: presDark ? "#94a3b8" : UI.mutedLabel, fontSize: UI.deviationLabelSize, fontWeight: 500 };
  const compactTypo =
    density === "installment-area-entity" ||
    density === "ddu-revenue-entity" ||
    density === "project-value-entity";
  const deviationValueStyle = compactTypo
    ? { fontSize: kpiMetricSizeCompact, fontWeight: 700, lineHeight: 1.2 }
    : presDark
      ? { fontSize: density === "room-type" ? 18 : "clamp(20px, 4vw, 26px)", fontWeight: 600, lineHeight: 1 }
      : { fontSize: UI.deviationValueSize, fontWeight: 600, lineHeight: 1 };
  const fulfillmentValueStyle = compactTypo
    ? { fontSize: kpiValueSizeCompact, fontWeight: 700, lineHeight: 1 }
    : presDark
      ? { fontSize: density === "room-type" ? 22 : "clamp(26px, 5vw, 34px)", fontWeight: 700, lineHeight: 1 }
      : { fontSize: UI.fulfillmentValueSize, fontWeight: 700, lineHeight: 1 };

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-visible">
      <div
        className="flex flex-1 flex-col items-center justify-center py-1"
        style={{ marginTop: UI.chartMarginY, marginBottom: UI.chartMarginY }}
      >
        <ThemedMiniFactPlanColumnChart
          fact={fact}
          plan={plan}
          hasPlan={hasPlan}
          presDark={presDark}
          presentation={presentation}
          mplPremium={mplPremium}
          theme={theme}
          density={density}
          formatMetric={formatMetric}
          planBarLabel={planBarLabel}
          factBarLabel={factBarLabel}
        />
      </div>
      <KpiSectionDivider presDark={presDark} />
      <div className="flex w-full items-center justify-between gap-3 whitespace-nowrap py-0.5">
        <span style={deviationLabelStyle}>Отклонение</span>
        <span
          className={`shrink-0 tabular-nums ${deviation != null ? deviationToneClass(deviation, presDark, presentation) : dashCls}`}
          style={deviationValueStyle}
        >
          {deviation != null ? (
            compactTypo ? (
              (() => {
                const parts = usesCompactCurrencyLabels(theme, density)
                  ? compactCurrencyParts(theme, deviation)
                  : formatInstallmentAreaSqmParts(deviation);
                if (parts.value === "—") return "—";
                const unitLabel = "unit" in parts ? parts.unit : "";
                return (
                  <>
                    {parts.value}{" "}
                    <span style={{ fontSize: `${kpiMetricUnitScale}em`, opacity: kpiMetricUnitOpacity }}>{unitLabel}</span>
                  </>
                );
              })()
            ) : (
              formatMetric(deviation)
            )
          ) : (
            "—"
          )}
        </span>
      </div>
      {hideExecutionPct ? null : <KpiSectionDivider presDark={presDark} />}
      {hideExecutionPct ? null : (
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
      )}
    </div>
  );
}

function KpiSingleMetricCardBody({
  value,
  presDark,
  theme,
  density = "default",
  formatMetric = formatKpiCount,
}: {
  value: number;
  presDark: boolean;
  theme: EntityKpiTheme;
  density?: EntityKpiCardsDensity;
  formatMetric?: (n: number) => string;
}) {
  const UI = kpiUiTokens(density);
  const compactTypo =
    density === "installment-area-entity" ||
    density === "ddu-revenue-entity" ||
    density === "project-value-entity";
  const valueStyle = compactTypo
    ? { fontSize: kpiValueSizeCompact, fontWeight: 700, lineHeight: 1.15 }
    : { fontSize: "clamp(28px, 5vw, 36px)", fontWeight: 700, lineHeight: 1.1 };
  const color = presDark ? theme.ringStrokeDark : "#0f172a";

  if (usesCompactCurrencyLabels(theme, density)) {
    const parts = compactCurrencyParts(theme, value);
    if (parts.value === "—") {
      return (
        <div className="flex min-h-[140px] w-full flex-col items-center justify-center py-6">
          <span className="tabular-nums" style={{ ...valueStyle, color }}>
            —
          </span>
        </div>
      );
    }
    return (
      <div className="flex min-h-[140px] w-full flex-col items-center justify-center py-6">
        <span
          className="flex flex-col items-center text-center tabular-nums"
          style={{ color, fontSize: valueStyle.fontSize, fontWeight: valueStyle.fontWeight, lineHeight: 1.2 }}
        >
          <span>{parts.value}</span>
          {"unit" in parts ? (
            <span
              className="font-semibold"
              style={{ fontSize: `${kpiMetricUnitScale}em`, opacity: kpiMetricUnitOpacity, marginTop: 4 }}
            >
              {parts.unit}
            </span>
          ) : null}
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-h-[140px] w-full flex-col items-center justify-center py-6">
      <span className="text-center tabular-nums" style={{ ...valueStyle, color }}>
        {formatMetric(value)}
      </span>
    </div>
  );
}

function ThemedKpiCircularProgressRing({
  percent,
  presDark,
  theme,
  density = "default",
  ringCaption = "Реализовано",
}: {
  percent: number;
  presDark: boolean;
  theme: EntityKpiTheme;
  density?: EntityKpiCardsDensity;
  ringCaption?: string;
}) {
  const UI = kpiUiTokens(density);
  const size = UI.ringSize;
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
        <span className={`tabular-nums leading-none ${presDark ? "text-slate-100" : "text-slate-900"}`} style={{ fontSize: UI.ringPercentSize, fontWeight: 700 }}>
          {animPct < 10
            ? `${dec2Fmt.format(Math.round(animPct * 100) / 100)}%`
            : `${dec1Fmt.format(Math.round(animPct * 10) / 10)}%`}
        </span>
        <span className="mt-1.5 uppercase" style={{ fontSize: UI.ringSubtitleSize, fontWeight: 600, letterSpacing: "0.06em", color: presDark ? "#94a3b8" : UI.mutedLabel }}>
          {ringCaption}
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
  density = "default",
}: {
  title: string;
  children: ReactNode;
  presDark: boolean;
  skeleton?: boolean;
  centered?: boolean;
  density?: EntityKpiCardsDensity;
}) {
  const UI = kpiUiTokens(density);
  const surface = presDark
    ? "rounded-[20px] border border-white/10 bg-slate-900/50 shadow-[0_8px_28px_rgba(0,0,0,0.28)]"
    : "rounded-[20px] border bg-white";
  const lightStyle = presDark
    ? { minHeight: UI.cardMinHeight, padding: UI.cardPadding }
    : {
        background: "#FFFFFF",
        border: UI.cardBorder,
        borderRadius: UI.cardRadius,
        boxShadow: UI.cardShadow,
        minHeight: UI.cardMinHeight,
        padding: UI.cardPadding,
      };
  const titleFontSize = density === "room-type" ? 10 : 14;

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
                fontSize: titleFontSize,
                fontWeight: 600,
                letterSpacing: "0.03em",
                color: UI.mutedLabel,
                textTransform: "uppercase" as const,
                lineHeight: 1.2,
              }
        }
      >
        {title}
      </div>
      <div className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-visible ${centered ? "items-center justify-center pt-2" : density === "room-type" ? "pt-2" : "pt-4"}`}>
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
  /** Подписи столбиков KPI «План на отчетный месяц» (устав / текущ. план). */
  monthCardPlanLabel?: string;
  monthCardFactLabel?: string;
  hideMonthExecutionPct?: boolean;
  middleCardMode?: "fact-plan" | "single-value";
  middleCardTitle?: string;
  volumeCardTitle?: string;
  volumeRingCaption?: string;
};

export function EntityPlanPeriodKpiCardsGrid({
  theme,
  data,
  presDark,
  presentation,
  mplPremium,
  skeleton,
  formatMetric,
  layout = "full",
  cardsDensity = "default",
}: {
  theme: EntityKpiTheme;
  data: EntityPlanPeriodKpiCardsData;
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
  skeleton?: boolean;
  /** По умолчанию целые шт; для площади — `formatInstallmentAreaSqm`. */
  formatMetric?: (n: number) => string;
  layout?: "full" | "stacked" | "room-type";
  /** Компактная типографика площади (парковки / кладовые). */
  cardsDensity?: EntityKpiCardsDensity;
}) {
  const fmt = formatMetric ?? formatKpiCount;
  const density = cardsDensity;
  const dashCls = presDark ? "text-slate-500" : presentation ? "text-mpl-muted" : "text-slate-400";
  const spctVolume = useSmoothScalar(data.pctVolume ?? 0);
  const gridCls =
    layout === "stacked"
      ? "grid min-w-0 flex-1 grid-cols-1 gap-4"
      : "grid min-w-0 flex-1 grid-cols-1 gap-5 md:grid-cols-3 md:gap-6";

  return (
    <div className={gridCls}>
      <div className="flex min-w-0 overflow-visible">
        <KpiCardShell title="План на отчетный месяц" presDark={presDark} skeleton={skeleton} density={density}>
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
              density={density}
              formatMetric={fmt}
              planBarLabel={data.monthCardPlanLabel ?? "План"}
              factBarLabel={data.monthCardFactLabel ?? "Факт"}
              hideExecutionPct={data.hideMonthExecutionPct}
            />
          )}
        </KpiCardShell>
      </div>
      <div className="flex min-w-0 overflow-visible">
        <KpiCardShell
          title={data.middleCardTitle ?? "План накопительно итогом"}
          presDark={presDark}
          skeleton={skeleton}
          density={density}
          centered={data.middleCardMode === "single-value"}
        >
          {skeleton ? (
            <KpiSkeletonLine presDark={presDark} />
          ) : data.middleCardMode === "single-value" ? (
            <KpiSingleMetricCardBody
              value={data.factCumulative}
              presDark={presDark}
              theme={theme}
              density={density}
              formatMetric={fmt}
            />
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
              density={density}
              formatMetric={fmt}
            />
          )}
        </KpiCardShell>
      </div>
      <div className="flex min-w-0 overflow-visible">
        <KpiCardShell
          title={data.volumeCardTitle ?? "% выполнения от общего объема"}
          presDark={presDark}
          skeleton={skeleton}
          centered
          density={density}
        >
          {skeleton ? (
            <KpiSkeletonLine presDark={presDark} />
          ) : data.pctVolume != null ? (
            <div className="relative flex w-full flex-col items-center justify-center py-3">
              <ThemedKpiCircularProgressRing
                percent={spctVolume}
                presDark={presDark}
                theme={theme}
                density={density}
                ringCaption={data.volumeRingCaption ?? "Реализовано"}
              />
            </div>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center px-2 py-3 text-center">
              <div
                className="mx-auto flex items-center justify-center rounded-full border-[9px]"
                style={{
                  width: kpiUiTokens(density).ringSize,
                  height: kpiUiTokens(density).ringSize,
                  borderColor: theme.ringTrackBorder,
                }}
              >
                <span
                  className={`tabular-nums leading-none ${dashCls}`}
                  style={{ fontSize: kpiUiTokens(density).ringPercentSize, fontWeight: 700 }}
                >
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
