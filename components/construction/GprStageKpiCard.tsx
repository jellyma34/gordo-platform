"use client";

import { useEffect, useId, type ReactNode } from "react";
import { Check, Circle, Clock, HardHat, RefreshCw } from "lucide-react";
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

function parseGprKpiPercentLabel(raw: string): number | null {
  const text = raw.trim();
  if (!text || text === "—") return null;
  const value = Number.parseFloat(text.replace("%", "").replace(",", ".").replace("−", "-"));
  return Number.isFinite(value) ? value : null;
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
    ? GPR_KPI_COMPACT_LABEL_CLASS
    : "text-[10px] font-medium uppercase tracking-wider text-slate-500";
  const valueClass = compact
    ? `mt-1.5 ${GPR_KPI_COMPACT_VALUE_CLASS}`
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
          <span className={GPR_KPI_COMPACT_VALUE_CLASS}>{primaryCount}</span>
          <span className={GPR_KPI_COMPACT_SECONDARY_CLASS}>
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
        <div className={GPR_KPI_COMPACT_LABEL_CLASS}>{label}</div>
        <div className={`mt-2 ${GPR_KPI_COMPACT_VALUE_CLASS}`}>{value}</div>
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
        <div className={GPR_KPI_COMPACT_LABEL_CLASS}>{label}</div>
        <div
          className="mt-2 flex items-baseline gap-1 tabular-nums tracking-tight"
          title={title}
        >
          <span className={GPR_KPI_COMPACT_VALUE_CLASS}>{factValue}</span>
          <span className={GPR_KPI_COMPACT_SECONDARY_CLASS}>
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
  visualTone = "default",
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
  /** Спокойная подача без ярких цветовых ореолов (dashboard 2.05). */
  visualTone?: "default" | "calm";
  children: ReactNode;
}) {
  const calm = visualTone === "calm";
  return (
    <div
      className={`relative flex h-full flex-col rounded-[20px] border ${paddingClass} ${calm ? "" : "backdrop-blur-[16px]"}`}
      style={{
        background: gradient,
        borderColor: calm ? "rgba(148,163,184,0.18)" : `${glowColor}55`,
        boxShadow: calm
          ? "none"
          : `0 22px 56px rgba(0,0,0,0.52), 0 0 36px ${glowColor}28, inset 0 1px 0 rgba(255,255,255,0.1)`,
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
  compact = false,
  dense = false,
}: {
  children: ReactNode;
  tone: "green" | "yellow" | "red" | "gray";
  compact?: boolean;
  dense?: boolean;
}) {
  const toneClass =
    tone === "green"
      ? "bg-emerald-500/15 text-emerald-400 ring-emerald-400/20"
      : tone === "yellow"
        ? "bg-amber-500/15 text-amber-400 ring-amber-400/20"
        : tone === "red"
          ? "bg-rose-500/15 text-rose-400 ring-rose-400/20"
          : "bg-slate-500/15 text-slate-400 ring-slate-400/20";
  const sizeClass = dense
    ? "h-8 w-8 rounded-lg"
    : compact
      ? "h-9 w-9 rounded-lg"
      : "h-11 w-11 rounded-xl";
  return (
    <div
      className={`grid shrink-0 place-items-center ring-1 ${toneClass} ${sizeClass}`}
    >
      {children}
    </div>
  );
}

const GPR_KPI_CARD_TITLE_CLASS = "text-lg font-semibold leading-snug text-slate-50";

const GPR_KPI_COMPACT_LABEL_CLASS =
  "text-[10px] font-semibold uppercase tracking-wider text-slate-300";
const GPR_KPI_COMPACT_VALUE_CLASS =
  "text-2xl font-extrabold tabular-nums tracking-tight text-white";
const GPR_KPI_COMPACT_SECONDARY_CLASS =
  "text-xl font-medium tabular-nums tracking-tight text-slate-300/65";

function GprKpiCardTitle({
  code,
  title,
  nowrap = false,
}: {
  code?: string;
  title: string;
  nowrap?: boolean;
}) {
  return (
    <div className={`min-w-0 ${nowrap ? "whitespace-nowrap" : ""} ${GPR_KPI_CARD_TITLE_CLASS}`}>
      {code ? (
        <>
          <span className="font-medium">{code}</span>{" "}
        </>
      ) : null}
      {title}
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

/** Плоский фон dashboard-карточки 2.05 без цветовых ореолов. */
function calmDashboardCardTheme(theme: ReturnType<typeof cardThemeForTraffic>) {
  return {
    ...theme,
    gradient: "linear-gradient(180deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.98) 100%)",
  };
}

/** Цвета сегментов кольца dashboard 2.05 (референс). */
const DASHBOARD_RING_COLORS = {
  green: "#22c55e",
  cyan: "#38bdf8",
  orange: "#f59e0b",
  gray: "#94a3b8",
  track: "rgba(255,255,255,0.06)",
} as const;

function deviationValueColorClass(deltaPp: number | null): string {
  if (deltaPp === null) return "";
  if (deltaPp > 0) return "text-emerald-400";
  if (deltaPp < 0) return "text-rose-400";
  return "";
}

function GprKpiLargeProgressRing({
  factValue,
  planValue,
  completedCount,
  inProgressCount,
  lateCount,
  notStartedCount,
  className = "w-full max-w-[288px]",
}: {
  factValue: string;
  planValue: string;
  completedCount: number;
  inProgressCount: number;
  lateCount: number;
  notStartedCount: number;
  className?: string;
}) {
  const size = 100;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const total =
    completedCount + inProgressCount + lateCount + notStartedCount;
  const safeTotal = total > 0 ? total : 1;

  const greenLen = (completedCount / safeTotal) * circumference;
  const blueLen = (inProgressCount / safeTotal) * circumference;
  const orangeLen = (lateCount / safeTotal) * circumference;
  const grayLen = Math.max(0, circumference - (greenLen + blueLen + orangeLen));
  const greenStart = 0;
  const blueStart = greenLen;
  const orangeStart = greenLen + blueLen;
  const grayStart = greenLen + blueLen + orangeLen;

  const segmentProps = {
    cx: size / 2,
    cy: size / 2,
    r: radius,
    fill: "none" as const,
    strokeWidth,
    strokeLinecap: "butt" as const,
  };

  return (
    <div className={`relative aspect-square shrink-0 ${className}`}>
      <svg
        className="block h-full w-full -rotate-90"
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
      >
        <circle {...segmentProps} stroke={DASHBOARD_RING_COLORS.track} />
        {greenLen > 0 ? (
          <circle
            {...segmentProps}
            stroke={DASHBOARD_RING_COLORS.green}
            strokeDasharray={`${greenLen} ${circumference - greenLen}`}
            strokeDashoffset={-greenStart}
          />
        ) : null}
        {blueLen > 0 ? (
          <circle
            {...segmentProps}
            stroke={DASHBOARD_RING_COLORS.cyan}
            strokeDasharray={`${blueLen} ${circumference - blueLen}`}
            strokeDashoffset={-blueStart}
          />
        ) : null}
        {orangeLen > 0 ? (
          <circle
            {...segmentProps}
            stroke={DASHBOARD_RING_COLORS.orange}
            strokeDasharray={`${orangeLen} ${circumference - orangeLen}`}
            strokeDashoffset={-orangeStart}
          />
        ) : null}
        {grayLen > 0 ? (
          <circle
            {...segmentProps}
            stroke={DASHBOARD_RING_COLORS.gray}
            strokeDasharray={`${grayLen} ${circumference - grayLen}`}
            strokeDashoffset={-grayStart}
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="pointer-events-none text-center leading-none">
          <div className="text-[clamp(18px,5.2vw,28px)] font-extrabold tabular-nums tracking-tight text-white">
            {factValue}
          </div>
          {planValue !== "—" ? (
            <div className="mt-1 text-[clamp(9px,2.4vw,11px)] font-normal tabular-nums text-slate-500/65">
              из {planValue}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function GprKpiStatusListRow({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: ReactNode;
}) {
  return (
    <div className="relative grid h-[48px] grid-cols-[20px_1fr_auto] items-center gap-x-2.5 pl-2 pr-1">
      <div
        className="absolute bottom-2 left-0 top-2 w-px"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <div className="grid place-items-center" style={{ color }}>
        {icon}
      </div>
      <div className="min-w-0 truncate text-xs font-medium text-slate-400">{label}</div>
      <div className="shrink-0 text-lg font-bold tabular-nums leading-none text-white">{value}</div>
    </div>
  );
}

function GprKpiStatusList({
  items,
}: {
  items: Array<{
    label: string;
    value: number;
    color: string;
    icon: ReactNode;
  }>;
}) {
  return (
    <div>
      {items.map((item, index) => (
        <div key={item.label}>
          {index > 0 ? <div className="border-t border-white/[0.18]" aria-hidden /> : null}
          <GprKpiStatusListRow
            label={item.label}
            value={item.value}
            color={item.color}
            icon={item.icon}
          />
        </div>
      ))}
    </div>
  );
}

function GprStageKpiDashboardBody({
  title,
  code,
  theme,
  factValue,
  factTitle,
  planValue,
  deviationLabel,
  deviationValue,
  deviationDeltaPp,
  completedStages,
  totalStages,
  completedSharePct,
  completedShareNumerator,
  completedShareDenominator,
  businessCompletedCount,
  businessInProgressCount,
  businessLateCount,
  businessNotStartedCount,
}: {
  title: string;
  code?: string;
  theme: ReturnType<typeof cardThemeForTraffic>;
  factValue: string;
  factTitle?: string;
  planValue: string;
  deviationLabel: string;
  deviationValue: string;
  deviationDeltaPp: number | null;
  completedStages: number;
  totalStages: number;
  completedSharePct: number;
  completedShareNumerator: number;
  completedShareDenominator: number;
  businessCompletedCount: number;
  businessInProgressCount: number;
  businessLateCount: number;
  businessNotStartedCount: number;
}) {
  const completedShareLabel = "Доля выполненных работ";
  const statusCards = [
    {
      label: "Завершено",
      value: businessCompletedCount,
      color: DASHBOARD_RING_COLORS.green,
      icon: <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />,
    },
    {
      label: "В процессе",
      value: businessInProgressCount,
      color: DASHBOARD_RING_COLORS.cyan,
      icon: <RefreshCw className="h-3 w-3" strokeWidth={2.5} aria-hidden />,
    },
    {
      label: "С опозданием",
      value: businessLateCount,
      color: DASHBOARD_RING_COLORS.orange,
      icon: <Clock className="h-3 w-3" strokeWidth={2.5} aria-hidden />,
    },
    {
      label: "Не начато",
      value: businessNotStartedCount,
      color: COLORS.gray,
      icon: <Circle className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />,
    },
  ];

  return (
    <div
      className="grid h-full min-h-0 overflow-hidden"
      style={{
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "auto minmax(0, 1fr) auto",
      }}
    >
      {/* Заголовок */}
      <div
        className="mb-0.5 grid shrink-0 grid-cols-[32px_minmax(0,1fr)] items-center gap-1.5"
        style={{ gridColumn: "1 / -1" }}
      >
        <GprKpiIconBadge tone={theme.badgeTone} dense>
          <HardHat className="h-3.5 w-3.5" strokeWidth={2} />
        </GprKpiIconBadge>
        <GprKpiCardTitle code={code} title={title} nowrap />
      </div>

      {/* Левая колонка: кольцо + работы */}
      <div className="grid min-h-0 grid-rows-[auto_auto] content-center justify-items-center gap-0.5 self-center overflow-hidden pr-1">
        <div className="w-full" title={factTitle}>
          <GprKpiLargeProgressRing
            factValue={factValue}
            planValue={planValue}
            completedCount={businessCompletedCount}
            inProgressCount={businessInProgressCount}
            lateCount={businessLateCount}
            notStartedCount={businessNotStartedCount}
            className="mx-auto w-full max-w-[288px]"
          />
        </div>
        <div className="grid justify-items-center gap-0.5 text-center">
          <div className="tabular-nums leading-none tracking-tight">
            <span className="text-[22px] font-extrabold text-white">{completedStages}</span>
            <span className="text-[17px] font-medium text-slate-400"> / {totalStages}</span>
          </div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            РАБОТ
          </div>
        </div>
      </div>

      {/* Правая колонка: список статусов */}
      <div className="grid min-h-0 content-center self-center overflow-hidden pl-1">
        <GprKpiStatusList items={statusCards} />
      </div>

      {/* Нижняя панель KPI */}
      <div
        className="grid shrink-0 grid-cols-2 border-t border-slate-600/20"
        style={{ gridColumn: "1 / -1" }}
      >
        <div className="flex min-h-0 flex-col justify-center gap-0 border-r border-slate-600/20 px-2 py-2">
          <div className={GPR_KPI_COMPACT_LABEL_CLASS}>
            {deviationLabel.replace(/,\s*%$/, "")}
          </div>
          <div
            className={`${GPR_KPI_COMPACT_VALUE_CLASS} leading-tight ${deviationValueColorClass(deviationDeltaPp) || "text-white"}`}
          >
            {deviationValue}
          </div>
        </div>
        <div className="flex min-h-0 flex-col justify-center gap-0 px-2 py-2">
          <div className={GPR_KPI_COMPACT_LABEL_CLASS}>{completedShareLabel}</div>
          <div className={`${GPR_KPI_COMPACT_VALUE_CLASS} leading-tight`}>
            {pct1(completedSharePct)}
          </div>
          <div className={`${GPR_KPI_COMPACT_SECONDARY_CLASS} leading-tight`}>
            ({completedShareNumerator} из {completedShareDenominator})
          </div>
        </div>
      </div>
    </div>
  );
}

export type GprStageKpiMetricsVariant = "full" | "compact";

export type GprStageKpiLayoutVariant = "default" | "dashboard";

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
  /** Dashboard-компоновка (кольцо + статусные карточки) — только для 2.05. */
  layoutVariant?: GprStageKpiLayoutVariant;
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
  layoutVariant = "default",
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
        gradient={
          layoutVariant === "dashboard"
            ? calmDashboardCardTheme(theme).gradient
            : theme.gradient
        }
        waveColor={layoutVariant === "dashboard" ? undefined : theme.waveColor}
        waveOpacity={layoutVariant === "dashboard" ? undefined : theme.waveOpacity}
        visualTone={layoutVariant === "dashboard" ? "calm" : "default"}
        paddingClass={layoutVariant === "dashboard" ? "px-2.5 py-2" : "p-6"}
      >
        {layoutVariant === "dashboard" ? (
          <GprStageKpiDashboardBody
            title={title}
            code={code}
            theme={theme}
            factValue={factValue}
            factTitle={factTitle}
            planValue={planValue}
            deviationLabel={deviationLabel}
            deviationValue={deviationValue}
            deviationDeltaPp={deviationDeltaPp}
            completedStages={completedStages}
            totalStages={totalStages}
            completedSharePct={completedSharePct}
            completedShareNumerator={completedShareNumerator}
            completedShareDenominator={completedShareDenominator}
            businessCompletedCount={businessCompletedCount}
            businessInProgressCount={businessInProgressCount}
            businessLateCount={businessLateCount}
            businessNotStartedCount={businessNotStartedCount}
          />
        ) : (
          <>
            <div className="flex items-start gap-3">
              <GprKpiIconBadge tone={theme.badgeTone}>
                <HardHat className="h-5 w-5" strokeWidth={2} />
              </GprKpiIconBadge>
              <div className="min-w-0 flex-1">
                <GprKpiCardTitle code={code} title={title} />
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
          </>
        )}
      </GprPremiumKpiCard>
    </div>
  );
}
