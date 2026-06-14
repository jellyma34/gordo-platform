"use client";

import { useEffect, useId, useRef, useState } from "react";

import type { ApartmentKpiHue } from "@/lib/apartmentsPlanPeriodKpi";
import { apartmentKpiExecutionHue, apartmentKpiExecutionPercent } from "@/lib/apartmentsPlanPeriodKpi";
import type { ApartmentPlanTypeKpiSlice } from "@/lib/apartmentPlanTypeKpi";
import { dec1Fmt, numFmt } from "@/lib/salesPlanChartFormat";

/** Compact breakdown widget tokens (aligned with main KPI section). */
const MINI_UI = {
  cardBg: "#FFFFFF",
  cardRadius: 20,
  cardBorder: "1px solid rgba(226,232,240,0.55)",
  cardShadow: "0 4px 18px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.03)",
  cardMinHeight: 300,
  cardPadding: 18,
  titleSize: 15,
  metricLabelSize: 12,
  metricValueSize: 16,
  chartAreaHeight: 100,
  barMaxHeight: 88,
  barWidth: 28,
  barGap: 20,
  barRadius: "10px 10px 3px 3px",
  barValueSize: 15,
  barLabelSize: 10,
  mutedLabel: "#64748B",
  planGradient: "linear-gradient(180deg, #FFD4A8 0%, #FFAB5C 100%)",
  factGradient: "linear-gradient(180deg, #9EC5FF 0%, #5B9AE8 100%)",
  planBarShadow: "0 2px 8px rgba(255,171,92,0.18)",
  factBarShadow: "0 2px 8px rgba(91,154,232,0.18)",
  dividerColor: "rgba(226,232,240,0.55)",
  ringSize: 98,
  ringStroke: 9,
  ringPercentSize: 20,
  ringSubtitleSize: 9,
} as const;

const RING_STROKE: Record<ApartmentKpiHue, { light: string; dark: string }> = {
  green: { light: "#10B981", dark: "#34d399" },
  yellow: { light: "#F59E0B", dark: "#fbbf24" },
  red: { light: "#E11D48", dark: "#fb7185" },
};

function useSmoothScalar(target: number, durationMs = 400) {
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

function formatCount(n: number): string {
  return numFmt.format(Math.round(n));
}

function deviationClass(dev: number, presDark: boolean): string {
  if (dev >= 0) return presDark ? "text-emerald-300" : "text-emerald-700";
  return presDark ? "text-rose-300" : "text-rose-700";
}

function ringStrokeColor(hue: ApartmentKpiHue, presDark: boolean): string {
  return presDark ? RING_STROKE[hue].dark : RING_STROKE[hue].light;
}

type MetricRowProps = {
  label: string;
  value: string;
  valueClassName?: string;
  presDark: boolean;
};

function MetricRow({ label, value, valueClassName = "", presDark }: MetricRowProps) {
  const labelColor = presDark ? "#94a3b8" : MINI_UI.mutedLabel;
  const valueColor = valueClassName ? undefined : presDark ? "#f1f5f9" : "#0f172a";

  return (
    <div className="flex min-h-[1.625rem] items-center justify-between gap-3">
      <span className="shrink-0 leading-snug" style={{ fontSize: MINI_UI.metricLabelSize, color: labelColor, fontWeight: 500 }}>
        {label}
      </span>
      <span
        className={`shrink-0 tabular-nums leading-none ${valueClassName}`}
        style={{ fontSize: MINI_UI.metricValueSize, fontWeight: 600, ...(valueColor ? { color: valueColor } : {}) }}
      >
        {value}
      </span>
    </div>
  );
}

function MiniKpiCircularProgressRing({
  percent,
  presDark,
  gradientId,
}: {
  percent: number | null;
  presDark: boolean;
  gradientId: string;
}) {
  const size = MINI_UI.ringSize;
  const strokeWidth = MINI_UI.ringStroke;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcTarget = percent != null ? Math.min(100, Math.max(0, percent)) : 0;
  const animArc = useSmoothScalar(arcTarget, 600);
  const offset = circumference - (animArc / 100) * circumference;
  const hue = percent != null ? apartmentKpiExecutionHue(percent) : null;

  const trackStroke = presDark ? "rgba(255,255,255,0.1)" : "#EEF2FF";
  const activeStroke =
    hue != null
      ? ringStrokeColor(hue, presDark)
      : presDark
        ? "#3B82F6"
        : `url(#${gradientId})`;

  return (
    <div
      className="relative mx-auto flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      role={percent != null ? "img" : undefined}
      aria-label={percent != null ? `Выполнение ${dec1Fmt.format(Math.round(percent * 10) / 10)}%` : "Выполнение не рассчитано"}
    >
      <svg className="h-full w-full overflow-visible" viewBox={`0 0 ${size} ${size}`} aria-hidden>
        {hue == null && !presDark ? (
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#5EA0FF" />
              <stop offset="100%" stopColor="#2563EB" />
            </linearGradient>
          </defs>
        ) : null}
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackStroke} strokeWidth={strokeWidth} />
        {percent != null ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={activeStroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-1 text-center">
        {percent != null ? (
          <>
            <span
              className={`tabular-nums leading-none ${presDark ? "text-slate-100" : "text-slate-900"}`}
              style={{ fontSize: MINI_UI.ringPercentSize, fontWeight: 700, lineHeight: 1 }}
            >
              {dec1Fmt.format(Math.round(percent * 10) / 10)}%
            </span>
            <span
              className="mt-1 uppercase"
              style={{
                fontSize: MINI_UI.ringSubtitleSize,
                fontWeight: 600,
                letterSpacing: "0.06em",
                color: presDark ? "#94a3b8" : MINI_UI.mutedLabel,
              }}
            >
              Реализовано
            </span>
          </>
        ) : (
          <span
            className={`tabular-nums leading-none ${presDark ? "text-slate-500" : "text-slate-400"}`}
            style={{ fontSize: MINI_UI.ringPercentSize, fontWeight: 700 }}
          >
            —
          </span>
        )}
      </div>
    </div>
  );
}

type Props = {
  slice: ApartmentPlanTypeKpiSlice;
  hasPlan: boolean;
  presDark: boolean;
  presentation: boolean;
};

export function ApartmentTypeKpiMiniCard({ slice, hasPlan, presDark, presentation }: Props) {
  void presentation;

  const planCumDen = hasPlan ? slice.planCumulative : null;
  const pctRing = apartmentKpiExecutionPercent(slice.factCumulative, planCumDen);
  const deviation = hasPlan ? slice.factCumulative - slice.planCumulative : null;

  const planVal = hasPlan ? slice.planMonth : 0;
  const maxBar = Math.max(slice.factMonth, planVal, 1);
  const factBarPx = Math.max(4, (slice.factMonth / maxBar) * MINI_UI.barMaxHeight);
  const planBarPx = hasPlan ? Math.max(4, (planVal / maxBar) * MINI_UI.barMaxHeight) : 4;

  const titleColor = presDark ? "#f1f5f9" : "#0f172a";
  const muted = presDark ? "#94a3b8" : MINI_UI.mutedLabel;
  const barValueColor = presDark ? "#e2e8f0" : "#0f172a";
  const ringGradientId = useId().replace(/:/g, "");

  const lightCardStyle = presDark
    ? undefined
    : {
        background: MINI_UI.cardBg,
        border: MINI_UI.cardBorder,
        borderRadius: MINI_UI.cardRadius,
        boxShadow: MINI_UI.cardShadow,
      };

  return (
    <article
      className={`flex h-full min-h-0 min-w-0 flex-col ${
        presDark ? "rounded-[20px] border border-white/10 bg-slate-900/50 shadow-[0_6px_20px_rgba(0,0,0,0.22)]" : "rounded-[20px]"
      }`}
      style={{
        ...lightCardStyle,
        minHeight: MINI_UI.cardMinHeight,
        padding: MINI_UI.cardPadding,
      }}
    >
      <h3
        className="shrink-0 leading-tight tracking-tight"
        style={{ fontSize: MINI_UI.titleSize, fontWeight: 700, color: titleColor }}
      >
        {slice.label}
      </h3>

      <div className="mt-3 flex min-h-0 flex-1 items-stretch gap-3 sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col justify-end">
          <div
            className="flex w-full items-end justify-center"
            style={{ height: MINI_UI.barMaxHeight + 22, gap: MINI_UI.barGap }}
          >
            <div className="flex flex-col items-center justify-end" style={{ width: MINI_UI.barWidth }}>
              <span
                className="mb-1 tabular-nums leading-none"
                style={{ fontSize: MINI_UI.barValueSize, fontWeight: 600, color: barValueColor }}
              >
                {hasPlan ? formatCount(slice.planMonth) : "—"}
              </span>
              <div
                className="w-full transition-[height] duration-500 ease-out"
                style={{
                  height: planBarPx,
                  borderRadius: MINI_UI.barRadius,
                  background: hasPlan ? MINI_UI.planGradient : presDark ? "rgba(255,255,255,0.1)" : "#e2e8f0",
                  boxShadow: hasPlan ? MINI_UI.planBarShadow : undefined,
                }}
              />
            </div>
            <div className="flex flex-col items-center justify-end" style={{ width: MINI_UI.barWidth }}>
              <span
                className="mb-1 tabular-nums leading-none"
                style={{ fontSize: MINI_UI.barValueSize, fontWeight: 600, color: barValueColor }}
              >
                {formatCount(slice.factMonth)}
              </span>
              <div
                className="w-full transition-[height] duration-500 ease-out"
                style={{
                  height: factBarPx,
                  borderRadius: MINI_UI.barRadius,
                  background: MINI_UI.factGradient,
                  boxShadow: MINI_UI.factBarShadow,
                }}
              />
            </div>
          </div>
          <div className="mt-2 flex justify-center" style={{ gap: MINI_UI.barGap }}>
            <span
              className="text-center uppercase"
              style={{
                width: MINI_UI.barWidth,
                fontSize: MINI_UI.barLabelSize,
                fontWeight: 600,
                letterSpacing: "0.06em",
                color: muted,
              }}
            >
              План
            </span>
            <span
              className="text-center uppercase"
              style={{
                width: MINI_UI.barWidth,
                fontSize: MINI_UI.barLabelSize,
                fontWeight: 600,
                letterSpacing: "0.06em",
                color: muted,
              }}
            >
              Факт
            </span>
          </div>
        </div>

        <div
          className="flex shrink-0 flex-col items-center justify-center"
          style={{ borderLeft: `1px solid ${presDark ? "rgba(255,255,255,0.1)" : MINI_UI.dividerColor}`, paddingLeft: 12 }}
        >
          <MiniKpiCircularProgressRing percent={pctRing} presDark={presDark} gradientId={`miniKpiGrad-${ringGradientId}`} />
        </div>
      </div>

      <div
        className="mt-3 shrink-0 space-y-1.5 border-t pt-3"
        style={{ borderColor: presDark ? "rgba(255,255,255,0.1)" : MINI_UI.dividerColor }}
      >
        <MetricRow
          label="Накоп. план"
          value={hasPlan ? formatCount(slice.planCumulative) : "—"}
          presDark={presDark}
        />
        <MetricRow label="Накоп. факт" value={formatCount(slice.factCumulative)} presDark={presDark} />
        <MetricRow
          label="Отклонение"
          value={deviation != null ? formatCount(deviation) : "—"}
          valueClassName={deviation != null ? deviationClass(deviation, presDark) : ""}
          presDark={presDark}
        />
      </div>
    </article>
  );
}
