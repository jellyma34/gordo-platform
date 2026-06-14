"use client";

import { useEffect, useRef, useState } from "react";

import type { EntityKpiTheme } from "@/lib/entityKpiTheme";
import { ENTITY_KPI_UI } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiCards";
import { dec1Fmt } from "@/lib/salesPlanChartFormat";

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

type Props = {
  percent: number;
  presDark: boolean;
  theme: EntityKpiTheme;
};

/** Круговой progress «% от общего объёма» для блока площади. */
export function InstallmentAreaRadial({ percent, presDark, theme }: Props) {
  const animPct = useSmoothScalar(percent, 600);
  const size = ENTITY_KPI_UI.ringSize;
  const strokeWidth = ENTITY_KPI_UI.ringStroke;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, animPct)) / 100) * circumference;
  const gradientId = `installment-area-ring-${theme.id}`;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="block" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={theme.ringGradientStops.top} />
            <stop offset="100%" stopColor={theme.ringGradientStops.bottom} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={theme.ringTrackBorder}
          strokeWidth={strokeWidth}
        />
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
        <span
          className={`tabular-nums leading-none ${presDark ? "text-slate-100" : "text-slate-900"}`}
          style={{ fontSize: ENTITY_KPI_UI.ringPercentSize, fontWeight: 700 }}
        >
          {dec1Fmt.format(Math.round(animPct * 10) / 10)}%
        </span>
        <span
          className="mt-1.5 uppercase"
          style={{
            fontSize: ENTITY_KPI_UI.ringSubtitleSize,
            fontWeight: 600,
            letterSpacing: "0.06em",
            color: presDark ? "#94a3b8" : ENTITY_KPI_UI.mutedLabel,
          }}
        >
          Реализовано
        </span>
      </div>
    </div>
  );
}
