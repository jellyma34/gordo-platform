"use client";

import { useId, type ReactNode } from "react";
import { HardHat } from "lucide-react";
import { KpiDonutChart, type KpiDonutSegment } from "@/components/tmc/KpiDonutChart";

const COLORS = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
  orange: "#f97316",
  gray: "#6b7280",
} as const;

export type GprStageKpiTraffic = "green" | "yellow" | "red" | "gray";

function pct1(n: number): string {
  return `${n.toFixed(1).replace(".", ",")}%`;
}

function GprKpiDivider() {
  return <div className="border-t border-slate-600/35" />;
}

function GprKpiLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{children}</div>
  );
}

function GprKpiMetricRow({
  label,
  value,
  valueClassName,
  title,
  compact,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  title?: string;
  compact?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <GprKpiDivider />
      <div className={compact ? "pt-3" : "pt-4"}>
        <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</div>
        <div
          className={`mt-1 text-base font-semibold tabular-nums text-slate-300/80 ${valueClassName ?? ""}`}
          title={title}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function GprKpiSplitCountRow({
  label,
  primaryCount,
  totalCount,
  compact,
}: {
  label: string;
  primaryCount: number;
  totalCount: number;
  compact?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <GprKpiDivider />
      <div className={compact ? "pt-3" : "pt-4"}>
        <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</div>
        <div className="mt-1 flex items-baseline gap-1 tabular-nums">
          <span className="text-base font-semibold text-white">{primaryCount}</span>
          <span className="text-base font-semibold text-slate-400/70">
            из {totalCount}
          </span>
        </div>
      </div>
    </div>
  );
}

function GprKpiSplitPercentRow({
  label,
  factValue,
  planValue,
  title,
  compact,
}: {
  label: string;
  factValue: string;
  planValue: string;
  title?: string;
  compact?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <GprKpiDivider />
      <div className={compact ? "pt-3" : "pt-4"}>
        <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</div>
        <div className="mt-1 flex items-baseline gap-1 tabular-nums" title={title}>
          <span className="text-base font-semibold text-white">{factValue}</span>
          <span className="text-base font-semibold text-slate-400/70">
            из {planValue}
          </span>
        </div>
      </div>
    </div>
  );
}

function GprKpiWave({ color, opacity = 0.45 }: { color: string; opacity?: number }) {
  const gradId = useId().replace(/:/g, "");
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-28">
      <svg viewBox="0 0 400 96" preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity={opacity} />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0,52 C90,88 170,24 260,56 S350,82 400,48 L400,96 L0,96 Z"
          fill={`url(#${gradId})`}
        />
        <path
          d="M0,60 C110,74 210,40 310,64 S380,70 400,58"
          fill="none"
          stroke={color}
          strokeOpacity={opacity * 0.7}
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}

function GprPremiumKpiCard({
  glowColor,
  gradient,
  waveColor,
  waveOpacity,
  children,
}: {
  glowColor: string;
  gradient: string;
  waveColor?: string;
  waveOpacity?: number;
  children: ReactNode;
}) {
  return (
    <div
      className="relative flex h-full flex-col rounded-[20px] border p-6 backdrop-blur-[16px]"
      style={{
        background: gradient,
        borderColor: `${glowColor}55`,
        boxShadow: `0 22px 56px rgba(0,0,0,0.52), 0 0 36px ${glowColor}28, inset 0 1px 0 rgba(255,255,255,0.1)`,
      }}
    >
      {waveColor ? <GprKpiWave color={waveColor} opacity={waveOpacity} /> : null}
      <div className="relative z-[1] flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

function GprKpiIconBadge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "green" | "yellow" | "red" | "gray";
}) {
  const toneClass =
    tone === "green"
      ? "bg-emerald-500/15 text-emerald-400 ring-emerald-400/20"
      : tone === "yellow"
        ? "bg-amber-500/15 text-amber-400 ring-amber-400/20"
        : tone === "red"
          ? "bg-rose-500/15 text-rose-400 ring-rose-400/20"
          : "bg-slate-500/15 text-slate-400 ring-slate-400/20";
  return (
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${toneClass}`}
    >
      {children}
    </div>
  );
}

function cardThemeForTraffic(status: GprStageKpiTraffic): {
  glowColor: string;
  gradient: string;
  waveColor: string;
  waveOpacity: number;
  badgeTone: "green" | "yellow" | "red" | "gray";
} {
  if (status === "green") {
    return {
      glowColor: COLORS.green,
      gradient:
        "linear-gradient(145deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.92) 55%, rgba(21,128,61,0.14) 100%)",
      waveColor: COLORS.green,
      waveOpacity: 0.45,
      badgeTone: "green",
    };
  }
  if (status === "yellow") {
    return {
      glowColor: COLORS.yellow,
      gradient:
        "linear-gradient(145deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.92) 55%, rgba(146,64,14,0.16) 100%)",
      waveColor: COLORS.yellow,
      waveOpacity: 0.3,
      badgeTone: "yellow",
    };
  }
  if (status === "red") {
    return {
      glowColor: COLORS.red,
      gradient:
        "linear-gradient(145deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.92) 55%, rgba(127,29,29,0.16) 100%)",
      waveColor: COLORS.red,
      waveOpacity: 0.25,
      badgeTone: "red",
    };
  }
  return {
    glowColor: COLORS.gray,
    gradient:
      "linear-gradient(145deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.92) 55%, rgba(71,85,105,0.14) 100%)",
    waveColor: COLORS.gray,
    waveOpacity: 0.2,
    badgeTone: "gray",
  };
}

function deviationValueColorClass(deltaPp: number | null): string {
  if (deltaPp === null) return "";
  if (deltaPp > 0) return "text-emerald-400";
  if (deltaPp < 0) return "text-rose-400";
  return "";
}

export type GprStageKpiMetricsVariant = "full" | "compact";

export type GprStageKpiCardProps = {
  title: string;
  status: GprStageKpiTraffic;
  /** Полный набор KPI или сокращённый (подготовка территории). */
  metricsVariant?: GprStageKpiMetricsVariant;
  factLabel: string;
  factValue: string;
  factTitle?: string;
  planLabel: string;
  planValue: string;
  deviationLabel: string;
  deviationValue: string;
  deviationDeltaPp: number | null;
  completedStages: number;
  totalStages: number;
  onTimeCount: number;
  atRiskCount: number;
  overdueCount: number;
  completedSharePct: number;
  donutOnTimeCount: number;
  donutRiskCount: number;
  donutOverdueCount: number;
  donutCompletedLateCount: number;
  donutNotStartedCount: number;
  problematicSharePct: number;
};

export function GprStageKpiCard({
  title,
  status,
  metricsVariant = "full",
  factLabel,
  factValue,
  factTitle,
  planLabel,
  planValue,
  deviationLabel,
  deviationValue,
  deviationDeltaPp,
  completedStages,
  totalStages,
  onTimeCount,
  atRiskCount,
  overdueCount,
  completedSharePct,
  donutOnTimeCount,
  donutRiskCount,
  donutOverdueCount,
  donutCompletedLateCount,
  donutNotStartedCount,
  problematicSharePct,
}: GprStageKpiCardProps) {
  const theme = cardThemeForTraffic(status);
  const compactMetrics = metricsVariant === "compact";

  const donutSegments: KpiDonutSegment[] = [
    { label: "В срок", value: donutOnTimeCount, color: COLORS.green },
    { label: "Риск", value: donutRiskCount, color: COLORS.yellow },
    { label: "Просрочено", value: donutOverdueCount, color: COLORS.red },
    {
      label: "Выполнено с опозданием",
      value: donutCompletedLateCount,
      color: COLORS.orange,
    },
    { label: "Не начато", value: donutNotStartedCount, color: COLORS.gray },
  ];

  const donutStatusTotal =
    donutOnTimeCount +
    donutRiskCount +
    donutOverdueCount +
    donutCompletedLateCount +
    donutNotStartedCount;
  const centerColor =
    problematicSharePct > 30
      ? COLORS.red
      : problematicSharePct > 10
        ? COLORS.yellow
        : COLORS.green;

  const fullMetricRows: {
    label: string;
    value: string;
    valueClassName?: string;
    title?: string;
  }[] = [
    { label: factLabel, value: factValue, title: factTitle },
    { label: planLabel, value: planValue },
    {
      label: deviationLabel,
      value: deviationValue,
      valueClassName: deviationValueColorClass(deviationDeltaPp),
    },
    { label: "Выполнено этапов ГПР", value: String(completedStages) },
    { label: "Всего этапов ГПР", value: String(totalStages) },
    { label: "Количество этапов в срок", value: String(onTimeCount) },
    {
      label: "Количество этапов с риском",
      value: String(atRiskCount),
      valueClassName: atRiskCount > 0 ? "text-amber-300" : undefined,
    },
    { label: "Количество просроченных этапов", value: String(overdueCount) },
    {
      label: "Количество этапов, выполненных с опозданием",
      value: String(donutCompletedLateCount),
      valueClassName: donutCompletedLateCount > 0 ? "text-orange-400" : undefined,
    },
    { label: "Доля выполненных этапов, %", value: pct1(completedSharePct) },
  ];

  return (
    <div className="flex h-full min-w-0 flex-col" data-traffic-card={status}>
      <GprPremiumKpiCard
        glowColor={theme.glowColor}
        gradient={theme.gradient}
        waveColor={theme.waveColor}
        waveOpacity={theme.waveOpacity}
      >
        <div className="flex items-start gap-3">
          <GprKpiIconBadge tone={theme.badgeTone}>
            <HardHat className="h-5 w-5" strokeWidth={2} />
          </GprKpiIconBadge>
          <div className="min-w-0 flex-1">
            <GprKpiLabel>{title}</GprKpiLabel>
          </div>
        </div>

        <div className={compactMetrics ? "mt-0.5" : "mt-1"}>
          {compactMetrics ? (
            <>
              <GprKpiSplitPercentRow
                label={factLabel}
                factValue={factValue}
                planValue={planValue}
                title={factTitle}
                compact
              />
              <GprKpiSplitCountRow
                label="Выполнение"
                primaryCount={completedStages}
                totalCount={totalStages}
                compact
              />
              <GprKpiMetricRow
                label={deviationLabel}
                value={deviationValue}
                valueClassName={deviationValueColorClass(deviationDeltaPp)}
                compact
              />
              <GprKpiMetricRow
                label="Доля выполненных этапов, %"
                value={pct1(completedSharePct)}
                compact
              />
            </>
          ) : (
            fullMetricRows.map((row) => (
              <GprKpiMetricRow
                key={row.label}
                label={row.label}
                value={row.value}
                valueClassName={row.valueClassName}
                title={row.title}
              />
            ))
          )}
        </div>

        <div className={`space-y-1.5 ${compactMetrics ? "mt-2" : "mt-4"}`}>
          <GprKpiDivider />
          <div className={compactMetrics ? "pt-2" : "pt-3"}>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-300">
              Распределение статусов ГПР
            </div>
            <KpiDonutChart
              segments={donutSegments}
              percentBase={donutStatusTotal}
              chartHeight={100}
              centerValue={pct1(problematicSharePct)}
              centerSublabel="проблемных"
              centerValueColor={centerColor}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1" aria-hidden />
      </GprPremiumKpiCard>
      <p className="mt-2 px-1 text-[11px] leading-snug text-slate-400">
        Распределение статусов рассчитано по этапам ГПР объекта.
      </p>
    </div>
  );
}
