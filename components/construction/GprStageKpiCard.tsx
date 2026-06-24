"use client";

import { useEffect, useId, type ReactNode } from "react";
import { HardHat } from "lucide-react";
import { KpiDonutChart, type KpiDonutSegment } from "@/components/tmc/KpiDonutChart";

const COLORS = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
  orange: "#f97316",
  gray: "#6b7280",
  cyan: "#06b6d4",
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
  noDivider,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  title?: string;
  compact?: boolean;
  noDivider?: boolean;
}) {
  const labelClass = compact
    ? "text-[10px] font-semibold uppercase tracking-wider text-slate-300"
    : "text-[10px] font-medium uppercase tracking-wider text-slate-500";
  const valueClass = compact
    ? "mt-1.5 text-2xl font-extrabold tabular-nums tracking-tight text-white"
    : "mt-1 text-base font-semibold tabular-nums text-slate-300/80";
  return (
    <div className="space-y-1.5">
      {noDivider ? null : <GprKpiDivider />}
      <div className={noDivider ? "" : compact ? "pt-3" : "pt-4"}>
        <div className={labelClass}>{label}</div>
        <div className={`${valueClass} ${valueClassName ?? ""}`} title={title}>
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
  noDivider,
}: {
  label: string;
  primaryCount: number;
  totalCount: number;
  compact?: boolean;
  noDivider?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      {noDivider ? null : <GprKpiDivider />}
      <div className={noDivider ? "" : compact ? "pt-3" : "pt-4"}>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-300">{label}</div>
        <div className="mt-2 flex items-baseline gap-1 tabular-nums tracking-tight">
          <span className="text-2xl font-extrabold text-white">{primaryCount}</span>
          <span className="text-xl font-medium text-slate-300/65">
            из {totalCount}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Подпись «N из M (X%)» — процент всегда из числителя и знаменателя. */
export function formatGprCompletedShareDisplay(numerator: number, denominator: number): string {
  if (denominator <= 0) return "—";
  const pct = Math.round((numerator / denominator) * 1000) / 10;
  return `${numerator} из ${denominator} (${pct1(pct)})`;
}

function GprKpiCompletedShareRow({
  label,
  numerator,
  denominator,
  compact,
  noDivider,
}: {
  label: string;
  numerator: number;
  denominator: number;
  compact?: boolean;
  noDivider?: boolean;
}) {
  const value = formatGprCompletedShareDisplay(numerator, denominator);
  return (
    <div className="space-y-1.5">
      {noDivider ? null : <GprKpiDivider />}
      <div className={noDivider ? "" : compact ? "pt-3" : "pt-4"}>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-300">{label}</div>
        <div className="mt-2 text-2xl font-extrabold tabular-nums tracking-tight text-white">{value}</div>
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
  noDivider,
}: {
  label: string;
  factValue: string;
  planValue: string;
  title?: string;
  compact?: boolean;
  noDivider?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      {noDivider ? null : <GprKpiDivider />}
      <div className={noDivider ? "" : compact ? "pt-3" : "pt-4"}>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-300">{label}</div>
        <div
          className="mt-2 flex items-baseline gap-1 tabular-nums tracking-tight"
          title={title}
        >
          <span className="text-2xl font-extrabold text-white">{factValue}</span>
          <span className="text-xl font-medium text-slate-300/65">
            из {planValue}
          </span>
        </div>
      </div>
    </div>
  );
}

function GprKpiWave({
  color,
  opacity = 0.45,
  heightClass = "h-28",
}: {
  color: string;
  opacity?: number;
  /**
   * Класс высоты декоративной волны (по умолчанию `h-28`, как в этапных карточках).
   * Для сводной карточки «Проект» передаётся более низкая волна,
   * чтобы не «съедала» полезное вертикальное пространство.
   */
  heightClass?: string;
}) {
  const gradId = useId().replace(/:/g, "");
  return (
    <div className={`pointer-events-none absolute inset-x-0 bottom-0 z-0 ${heightClass}`}>
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
  paddingClass = "p-6",
  waveHeightClass,
  children,
}: {
  glowColor: string;
  gradient: string;
  waveColor?: string;
  waveOpacity?: number;
  /**
   * Класс паддинга карточки. По умолчанию `p-6`, как в карточках этапов.
   * Для итоговой карточки «Проект» передаётся более крупный паддинг,
   * чтобы визуально подчеркнуть статус сводной (главной) панели KPI.
   */
  paddingClass?: string;
  /**
   * Класс высоты декоративной волны.
   * Передаётся в `GprKpiWave`. Если не указан — используется дефолт `h-28`.
   */
  waveHeightClass?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`relative flex h-full flex-col rounded-[20px] border ${paddingClass} backdrop-blur-[16px]`}
      style={{
        background: gradient,
        borderColor: `${glowColor}55`,
        boxShadow: `0 22px 56px rgba(0,0,0,0.52), 0 0 36px ${glowColor}28, inset 0 1px 0 rgba(255,255,255,0.1)`,
      }}
    >
      {waveColor ? (
        <GprKpiWave
          color={waveColor}
          opacity={waveOpacity}
          heightClass={waveHeightClass}
        />
      ) : null}
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

export type GprStageKpiDonutStatusVariant = "workItem" | "trafficKpi" | "businessKpi";

export type GprStageKpiCardProps = {
  title: string;
  /**
   * Шифр корневого вида работ из ГПР (например, "2.04").
   * Если задан — выводится перед названием в заголовке карточки.
   * Для агрегированной карточки ("Жилой дом" и т.п.) не передаётся.
   */
  code?: string;
  status: GprStageKpiTraffic;
  /** Компактный набор KPI (карточки этапов жилого дома 2.04 / 2.05). */
  metricsVariant?: GprStageKpiMetricsVariant;
  /**
   * Источник сегментов donut:
   * - workItem — классификация по этапам (по умолчанию);
   * - trafficKpi — четыре KPI-категории: в срок / с риском / просрочено / с опозданием;
   * - businessKpi — бизнес-статусы: завершено / в процессе / завершено с опозданием / просрочено / не начато.
   */
  donutStatusVariant?: GprStageKpiDonutStatusVariant;
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
  /** @deprecated Отображение строится из completedShareNumerator / completedShareDenominator. */
  completedSharePct: number;
  /** Числитель доли выполненных работ (совпадает с расчётом процента). */
  completedShareNumerator: number;
  /** Знаменатель доли выполненных работ (совпадает с расчётом процента). */
  completedShareDenominator: number;
  donutOnTimeCount: number;
  donutRiskCount: number;
  donutOverdueCount: number;
  donutCompletedLateCount: number;
  donutNotStartedCount: number;
  /** Бизнес-классификация (donutStatusVariant === "businessKpi"). */
  businessCompletedCount?: number;
  businessInProgressCount?: number;
  businessLateCount?: number;
  businessOverdueCount?: number;
  businessNotStartedCount?: number;
  problematicSharePct: number;
};

export function GprStageKpiCard({
  title,
  code,
  status,
  metricsVariant = "full",
  donutStatusVariant = "workItem",
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
  completedShareNumerator,
  completedShareDenominator,
  donutOnTimeCount,
  donutRiskCount,
  donutOverdueCount,
  donutCompletedLateCount,
  donutNotStartedCount,
  businessCompletedCount = 0,
  businessInProgressCount = 0,
  businessLateCount = 0,
  businessOverdueCount = 0,
  businessNotStartedCount = 0,
}: GprStageKpiCardProps) {
  const theme = cardThemeForTraffic(status);
  const compactMetrics = metricsVariant === "compact";
  const completedShareLabel = "Доля выполненных работ";
  const completedShareDisplay = formatGprCompletedShareDisplay(
    completedShareNumerator,
    completedShareDenominator,
  );

  const donutSegments: KpiDonutSegment[] =
    donutStatusVariant === "businessKpi"
      ? [
          { label: "Завершено", value: businessCompletedCount, color: COLORS.green },
          { label: "В процессе", value: businessInProgressCount, color: COLORS.cyan },
          { label: "Завершено с опозданием", value: businessLateCount, color: COLORS.orange },
          { label: "Просрочено", value: businessOverdueCount, color: COLORS.red },
          { label: "Не начато", value: businessNotStartedCount, color: COLORS.gray },
        ]
      : donutStatusVariant === "trafficKpi"
      ? [
          { label: "В срок", value: donutOnTimeCount, color: COLORS.green },
          { label: "С риском", value: donutRiskCount, color: COLORS.yellow },
          { label: "Просрочено", value: donutOverdueCount, color: COLORS.red },
          {
            label: "Выполнено с опозданием",
            value: donutCompletedLateCount,
            color: COLORS.orange,
          },
        ]
      : [
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
    donutStatusVariant === "businessKpi"
      ? businessCompletedCount +
        businessInProgressCount +
        businessLateCount +
        businessOverdueCount +
        businessNotStartedCount
      : donutStatusVariant === "trafficKpi"
      ? donutOnTimeCount + donutRiskCount + donutOverdueCount + donutCompletedLateCount
      : donutOnTimeCount +
        donutRiskCount +
        donutOverdueCount +
        donutCompletedLateCount +
        donutNotStartedCount;

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (donutStatusVariant === "businessKpi") {
      const sum =
        businessCompletedCount +
        businessInProgressCount +
        businessLateCount +
        businessOverdueCount +
        businessNotStartedCount;
      console.log("[GprStageKpiCard:businessKpi]", {
        title,
        "Завершено": businessCompletedCount,
        "В процессе": businessInProgressCount,
        "Завершено с опозданием": businessLateCount,
        "Просрочено": businessOverdueCount,
        "Не начато": businessNotStartedCount,
        Итого: sum,
        totalStages,
        sumEqualsTotalStages: sum === totalStages,
      });
      return;
    }
    if (donutStatusVariant !== "trafficKpi") return;
    const sum =
      donutOnTimeCount + donutRiskCount + donutOverdueCount + donutCompletedLateCount;
    console.log("[GprStageKpiCard:trafficKpi]", {
      title,
      totalStages,
      donutOnTimeCount,
      donutRiskCount,
      donutOverdueCount,
      donutCompletedLateCount,
      sum,
      donutNotStartedCount,
      sumEqualsTotalStages: sum === totalStages,
    });
  }, [
    title,
    donutStatusVariant,
    totalStages,
    donutOnTimeCount,
    donutRiskCount,
    donutOverdueCount,
    donutCompletedLateCount,
    donutNotStartedCount,
    businessCompletedCount,
    businessInProgressCount,
    businessLateCount,
    businessOverdueCount,
    businessNotStartedCount,
  ]);

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
    { label: completedShareLabel, value: completedShareDisplay },
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
            <div className="text-lg font-semibold leading-snug text-slate-50">
              {code ? (
                <>
                  <span className="font-medium">{code}</span>{" "}
                </>
              ) : null}
              {title}
            </div>
          </div>
        </div>

        <div className={compactMetrics ? "mt-3" : "mt-4"}>
          {compactMetrics ? (
            <>
              <GprKpiSplitPercentRow
                label={factLabel}
                factValue={factValue}
                planValue={planValue}
                title={factTitle}
                compact
                noDivider
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
              <GprKpiCompletedShareRow
                label={completedShareLabel}
                numerator={completedShareNumerator}
                denominator={completedShareDenominator}
                compact
              />
            </>
          ) : (
            fullMetricRows.map((row, index) => (
              <GprKpiMetricRow
                key={row.label}
                label={row.label}
                value={row.value}
                valueClassName={row.valueClassName}
                title={row.title}
                noDivider={index === 0}
              />
            ))
          )}
        </div>

        <div className={`space-y-1.5 ${compactMetrics ? "mt-2" : "mt-4"}`}>
          <GprKpiDivider />
          <div className={compactMetrics ? "pt-2" : "pt-3"}>
            <KpiDonutChart
              segments={donutSegments}
              percentBase={donutStatusTotal}
              chartHeight={100}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1" aria-hidden />
      </GprPremiumKpiCard>
    </div>
  );
}
