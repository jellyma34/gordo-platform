"use client";

import Link from "next/link";
import { useId } from "react";
import { ArrowRight, HardHat, LineChart, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { GprStageKpiCard } from "@/components/construction/GprStageKpiCard";
import { KpiDonutChart } from "@/components/tmc/KpiDonutChart";

import type {
  HomeConstructionProjectKpi,
  HomeMarketingProjectKpi,
  HomeTenderBudgetKpi,
  HomeTmcPurchasedDeviationKpi,
  StatusTone,
} from "@/lib/homeDashboardSnapshot";

const statusDotClass: Record<StatusTone, string> = {
  green: "bg-emerald-400",
  yellow: "bg-amber-400",
  red: "bg-rose-500",
};

const statusTitle: Record<StatusTone, string> = {
  green: "В норме",
  yellow: "Внимание",
  red: "Требует внимания",
};

/** Единая внутренняя сетка KPI «Строительство» на Dashboard. */
const HUB_CONSTRUCTION_KPI_TITLE_CLASS =
  "text-[9px] font-medium uppercase tracking-wider text-slate-500";
const HUB_CONSTRUCTION_KPI_MAIN_CLASS = "mt-1.5 tabular-nums tracking-tight";
const HUB_CONSTRUCTION_KPI_MIDDLE_CLASS = "mt-2 flex flex-col gap-2.5";
const HUB_CONSTRUCTION_KPI_CHART_BLOCK_CLASS = "mt-3 space-y-1";

export type HubBlock = {
  title: string;
  /** Одна строка */
  description: string;
  href: string;
  status: StatusTone;
  /** Расширенная карточка (только «Строительство» на хабе). */
  wide?: boolean;
  constructionProjectKpi?: HomeConstructionProjectKpi;
  marketingProjectKpi?: HomeMarketingProjectKpi;
  tenderBudgetKpi?: HomeTenderBudgetKpi;
  tmcPurchasedDeviationKpi?: HomeTmcPurchasedDeviationKpi;
};

type SectionTheme = {
  Icon: LucideIcon;
  glowColor: string;
  waveColor: string;
  gradient: string;
};

const PREMIUM_THEMES: Record<string, SectionTheme> = {
  Строительство: {
    Icon: HardHat,
    glowColor: "#a855f7",
    waveColor: "#a855f7",
    gradient:
      "linear-gradient(155deg, rgba(168,85,247,0.22) 0%, rgba(30,27,75,0.42) 38%, rgba(11,18,32,0.78) 100%)",
  },
  Маркетинг: {
    Icon: LineChart,
    glowColor: "#818cf8",
    waveColor: "#6366f1",
    gradient:
      "linear-gradient(155deg, rgba(99,102,241,0.24) 0%, rgba(30,27,75,0.42) 38%, rgba(11,18,32,0.78) 100%)",
  },
  Финансы: {
    Icon: Wallet,
    glowColor: "#38bdf8",
    waveColor: "#22d3ee",
    gradient:
      "linear-gradient(155deg, rgba(56,189,248,0.2) 0%, rgba(15,40,71,0.4) 38%, rgba(11,18,32,0.78) 100%)",
  },
};

const DEFAULT_THEME: SectionTheme = PREMIUM_THEMES["Финансы"];

type Props = {
  blocks: readonly HubBlock[];
  gridClassName?: string;
  variant?: "default" | "presentation";
};

function HubCardWaveGrid({ color }: { color: string }) {
  const uid = useId().replace(/:/g, "");
  const gradId = `hub-grad-${uid}`;
  const gridId = `hub-grid-${uid}`;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[52%]">
      <svg viewBox="0 0 460 180" preserveAspectRatio="none" className="h-full w-full" aria-hidden>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.38" />
            <stop offset="55%" stopColor={color} stopOpacity="0.14" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <pattern id={gridId} width="28" height="28" patternUnits="userSpaceOnUse">
            <path
              d="M 28 0 L 0 0 0 28"
              fill="none"
              stroke={color}
              strokeOpacity="0.16"
              strokeWidth="0.75"
            />
          </pattern>
        </defs>
        <rect x="0" y="24" width="460" height="156" fill={`url(#${gridId})`} opacity="0.85" />
        <path
          d="M0,72 C72,108 148,44 232,76 S360,104 460,68 L460,180 L0,180 Z"
          fill={`url(#${gradId})`}
        />
        <path
          d="M0,88 C96,104 188,58 284,82 S392,98 460,78"
          fill="none"
          stroke={color}
          strokeOpacity="0.32"
          strokeWidth="1.5"
        />
        <path
          d="M0,104 C110,118 210,86 310,108 S400,114 460,96"
          fill="none"
          stroke={color}
          strokeOpacity="0.18"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}

function PremiumHubCard({ block }: { block: HubBlock }) {
  const theme = PREMIUM_THEMES[block.title] ?? DEFAULT_THEME;
  const { Icon, glowColor, waveColor, gradient } = theme;
  const isWideConstruction = Boolean(block.wide && block.constructionProjectKpi);
  const isMarketingCompactKpi = block.title === "Маркетинг" && Boolean(block.marketingProjectKpi);
  const isFinanceHub = block.title === "Финансы";
  const useTopHeaderLayout = isWideConstruction || isMarketingCompactKpi || isFinanceHub;

  const rubKpiAmount = (value: number): string => {
    const formatted = new Intl.NumberFormat("ru-RU").format(Math.round(Math.abs(value)));
    if (value < 0) return `−${formatted}`;
    return formatted;
  };
  const rubKpiSignedAmount = (value: number): string => {
    if (value === 0) return "0";
    const formatted = new Intl.NumberFormat("ru-RU").format(Math.round(Math.abs(value)));
    return value < 0 ? `−${formatted}` : `+${formatted}`;
  };
  const pctSigned1 = (n: number): string => {
    const formatted = Math.abs(n).toFixed(1).replace(".", ",");
    if (n < 0) return `−${formatted}%`;
    if (n > 0) return `+${formatted}%`;
    return `${formatted}%`;
  };
  const rub = (value: number): string => new Intl.NumberFormat("ru-RU").format(Math.round(value));
  const rubCompactMln = (value: number): string => {
    const mln = Math.round(value / 1_000_000);
    return `${new Intl.NumberFormat("ru-RU").format(mln)} млн ₽`;
  };
  return (
    <Link
      href={block.href}
      scroll
      className={[
        "hub-premium-card group relative flex w-full cursor-pointer flex-col overflow-hidden rounded-[22px] border no-underline backdrop-blur-[18px] transition-[transform,box-shadow,border-color] duration-300 ease-out will-change-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/50",
        isWideConstruction
          ? "hub-premium-card--construction-wide min-h-[280px]"
          : "min-h-[250px] max-w-[460px]",
      ].join(" ")}
      style={{
        background: gradient,
        borderColor: `${glowColor}40`,
        boxShadow: `0 18px 52px rgba(0,0,0,0.48), 0 0 36px ${glowColor}16, inset 0 1px 0 rgba(255,255,255,0.1)`,
        ["--hub-glow" as string]: glowColor,
      }}
      aria-label={`Перейти: ${block.title}`}
    >
      <HubCardWaveGrid color={waveColor} />

      <div
        className={[
          "relative z-[1] flex h-full p-5 md:min-h-[300px] md:p-6",
          isWideConstruction ? "flex-col gap-5" : "flex-col",
        ].join(" ")}
      >
        <div className={isWideConstruction ? "flex min-w-0 flex-1 flex-col" : "flex h-full min-h-[300px] flex-col"}>
          <div className="flex items-start justify-between gap-4">
            <div className={useTopHeaderLayout ? "flex min-w-0 items-start gap-3" : undefined}>
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ring-1 backdrop-blur-sm"
                style={{
                  background: `${glowColor}1a`,
                  color: glowColor,
                  boxShadow: `0 0 24px ${glowColor}22`,
                  borderColor: `${glowColor}30`,
                }}
              >
                <Icon className="h-7 w-7" strokeWidth={1.75} aria-hidden />
              </div>
              {useTopHeaderLayout ? (
                <div className="min-w-0 pt-0.5">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`inline-block h-2 w-2 shrink-0 rounded-full ${isMarketingCompactKpi ? statusDotClass.red : statusDotClass[block.status]}`}
                      title={statusTitle[block.status]}
                      aria-hidden
                    />
                    <h2 className="text-xl font-semibold tracking-tight text-slate-50 md:text-2xl">{block.title}</h2>
                  </div>
                </div>
              ) : null}
            </div>

            <span
              className={[
                "hub-premium-arrow flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-[transform,background-color,box-shadow] duration-300 ease-out group-hover:border-white/20 group-hover:bg-white/[0.14]",
                isWideConstruction ? "absolute right-6 top-6 z-[2] md:right-7 md:top-7" : "",
              ].join(" ")}
              aria-hidden
            >
              <ArrowRight className="h-5 w-5" strokeWidth={2} />
            </span>
          </div>

          <div className={isWideConstruction ? "pt-4" : isMarketingCompactKpi || isFinanceHub ? "pt-2" : "mt-auto pt-6"}>
            <div className="flex items-center gap-2.5">
              {!useTopHeaderLayout ? (
                <>
                  <span
                    className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusDotClass[block.status]}`}
                    title={statusTitle[block.status]}
                    aria-hidden
                  />
                  <h2 className="text-xl font-semibold tracking-tight text-slate-50 md:text-2xl">{block.title}</h2>
                </>
              ) : null}
            </div>
            {isFinanceHub ? (
              <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-slate-300/85 md:text-[15px]">
                {block.description}
              </p>
            ) : !useTopHeaderLayout ? (
              <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-slate-300/85 md:text-[15px]">
                {block.description}
              </p>
            ) : null}
          </div>

          {isWideConstruction ? (
            <div className="min-w-0 pt-2">
              <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="min-w-0 h-full" aria-label="Мини-версия KPI Проект">
                  <GprStageKpiCard
                    title="Проект"
                    status={block.constructionProjectKpi!.status}
                    metricsVariant="compact"
                    layoutVariant="dashboard"
                    donutStatusVariant="trafficKpi"
                    factLabel="Факт выполнения"
                    factValue={block.constructionProjectKpi!.factValue}
                    planLabel="Плановая готовность"
                    planValue={block.constructionProjectKpi!.planValue}
                    deviationLabel="Отклонение готовности, %"
                    deviationValue={block.constructionProjectKpi!.deviationValue}
                    deviationDeltaPp={block.constructionProjectKpi!.deviationDeltaPp}
                    completedStages={block.constructionProjectKpi!.completedStages}
                    totalStages={block.constructionProjectKpi!.totalStages}
                    onTimeCount={block.constructionProjectKpi!.onTimeCount}
                    atRiskCount={block.constructionProjectKpi!.atRiskCount}
                    overdueCount={block.constructionProjectKpi!.overdueCount}
                    completedSharePct={block.constructionProjectKpi!.completedSharePct}
                    completedShareNumerator={block.constructionProjectKpi!.completedShareNumerator}
                    completedShareDenominator={block.constructionProjectKpi!.completedShareDenominator}
                    donutOnTimeCount={block.constructionProjectKpi!.donutOnTimeCount}
                    donutRiskCount={block.constructionProjectKpi!.donutRiskCount}
                    donutOverdueCount={block.constructionProjectKpi!.donutOverdueCount}
                    donutCompletedLateCount={block.constructionProjectKpi!.donutCompletedLateCount}
                    donutNotStartedCount={block.constructionProjectKpi!.donutNotStartedCount}
                    businessCompletedCount={block.constructionProjectKpi!.businessCompletedCount}
                    businessInProgressCount={block.constructionProjectKpi!.businessInProgressCount}
                    businessLateCount={block.constructionProjectKpi!.businessLateCount}
                    businessOverdueCount={block.constructionProjectKpi!.businessOverdueCount}
                    businessNotStartedCount={block.constructionProjectKpi!.businessNotStartedCount}
                    problematicSharePct={0}
                    dashboardBottomKpi={block.constructionProjectKpi!.dashboardBottomKpi}
                    dashboardStatusNotStartedOnTimeCount={
                      block.constructionProjectKpi!.dashboardStatusNotStartedOnTimeCount
                    }
                    dashboardTopDeviationKpi={{
                      label: "Отклонение готовности ГПР",
                      value: block.constructionProjectKpi!.deviationValue,
                      delta: block.constructionProjectKpi!.deviationDeltaPp,
                    }}
                    hideDashboardBottomKpi
                    hideDashboardHeader
                    dashboardLegendBelowChart
                    dashboardCompact
                    dashboardPremiumSurface
                    hideHeaderBadge
                  />
                </div>
                {block.tenderBudgetKpi ? (
                  <div
                    className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-[22px] border p-4"
                    style={{
                      background: block.tenderBudgetKpi.gradient,
                      borderColor: `${block.tenderBudgetKpi.glowColor}40`,
                      boxShadow:
                        `0 18px 52px rgba(0,0,0,0.48), 0 0 36px ${block.tenderBudgetKpi.glowColor}16, inset 0 1px 0 rgba(255,255,255,0.1)`,
                    }}
                    aria-label="KPI Отклонение от тендерного бюджета"
                  >
                    <div className={HUB_CONSTRUCTION_KPI_TITLE_CLASS}>
                      {block.tenderBudgetKpi.title}
                    </div>
                    <div className={HUB_CONSTRUCTION_KPI_MAIN_CLASS}>
                      <span
                        className={`text-4xl font-extrabold ${
                          block.tenderBudgetKpi.mainRub < 0
                            ? "text-emerald-400"
                            : block.tenderBudgetKpi.mainRub > 0
                              ? "text-[#ff5b6b]"
                              : "text-white"
                        }`}
                      >
                        {rubKpiSignedAmount(block.tenderBudgetKpi.mainRub)}
                      </span>
                    </div>
                    <div className={HUB_CONSTRUCTION_KPI_MIDDLE_CLASS}>
                      <div className="border-t border-slate-600/35 pt-3">
                        <div className={HUB_CONSTRUCTION_KPI_TITLE_CLASS}>
                          ЭКОНОМИЯ
                        </div>
                        <div className="mt-1 flex items-baseline gap-1 tabular-nums tracking-tight">
                          <span className="text-[19px] font-extrabold text-white">
                            {rubKpiAmount(block.tenderBudgetKpi.economyRub)}
                          </span>
                          <span className="text-[15px] font-medium text-slate-300/65">
                            из {rubKpiAmount(block.tenderBudgetKpi.concludedPlanRub)}
                          </span>
                        </div>
                      </div>
                      <div className="border-t border-slate-600/35 pt-3">
                        <div className={HUB_CONSTRUCTION_KPI_TITLE_CLASS}>
                          ПЕРЕРАСХОД
                        </div>
                        <div className="mt-0.5 text-[19px] font-extrabold tabular-nums tracking-tight text-[#ff5b6b]">
                          {rubKpiAmount(block.tenderBudgetKpi.overrunRub)}
                        </div>
                      </div>
                    </div>
                    <div className={HUB_CONSTRUCTION_KPI_CHART_BLOCK_CLASS}>
                      <div className="border-t border-slate-600/35" />
                      <div className="pt-2">
                        <KpiDonutChart
                          segments={block.tenderBudgetKpi.budgetDeviationSegments}
                          percentBase={block.tenderBudgetKpi.budgetBlockTenderCount}
                          chartHeight={188}
                          legendPosition="bottom"
                          legendColumns={2}
                          compactLegend
                          fullLegendLabels
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
                {block.tmcPurchasedDeviationKpi ? (
                  <div
                    className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-[22px] border p-4"
                    style={{
                      background: block.tmcPurchasedDeviationKpi.gradient,
                      borderColor: `${block.tmcPurchasedDeviationKpi.glowColor}40`,
                      boxShadow:
                        `0 18px 52px rgba(0,0,0,0.48), 0 0 36px ${block.tmcPurchasedDeviationKpi.glowColor}16, inset 0 1px 0 rgba(255,255,255,0.1)`,
                    }}
                    aria-label="KPI Отклонение от закупленного"
                  >
                    <div className={HUB_CONSTRUCTION_KPI_TITLE_CLASS}>
                      {block.tmcPurchasedDeviationKpi.title}
                    </div>
                    <div className={HUB_CONSTRUCTION_KPI_MAIN_CLASS}>
                      <span
                        className={`text-4xl font-extrabold ${
                          block.tmcPurchasedDeviationKpi.mainRub < 0
                            ? "text-emerald-400"
                            : block.tmcPurchasedDeviationKpi.mainRub > 0
                              ? "text-[#ff5b6b]"
                              : "text-white"
                        }`}
                      >
                        {rubKpiSignedAmount(block.tmcPurchasedDeviationKpi.mainRub)} ₽
                      </span>
                    </div>
                    <div className={HUB_CONSTRUCTION_KPI_MIDDLE_CLASS}>
                      <div className="border-t border-slate-600/35 pt-3">
                        <div className={HUB_CONSTRUCTION_KPI_TITLE_CLASS}>
                          ПОТРАЧЕНО
                        </div>
                        <div className="mt-1 flex items-baseline gap-1 tabular-nums tracking-tight">
                          <span className="text-[19px] font-extrabold text-white">
                            {rubKpiAmount(block.tmcPurchasedDeviationKpi.mainRub + block.tmcPurchasedDeviationKpi.purchasedPlanRub)}
                          </span>
                          <span className="text-[15px] font-medium text-slate-300/65">
                            из {rubKpiAmount(block.tmcPurchasedDeviationKpi.purchasedPlanRub)}
                          </span>
                        </div>
                      </div>
                      <div className="border-t border-slate-600/35 pt-3">
                        <div className={HUB_CONSTRUCTION_KPI_TITLE_CLASS}>
                          ПЕРЕРАСХОД
                        </div>
                        <div className="mt-0.5 text-[19px] font-extrabold tabular-nums tracking-tight text-[#ff5b6b]">
                          {rubKpiAmount(block.tmcPurchasedDeviationKpi.overrunRub)}
                        </div>
                      </div>
                    </div>
                    <div className={HUB_CONSTRUCTION_KPI_CHART_BLOCK_CLASS}>
                      <div className="border-t border-slate-600/35" />
                      <div className="pt-2">
                        <KpiDonutChart
                          segments={block.tmcPurchasedDeviationKpi.budgetDeviationSegments}
                          chartHeight={188}
                          legendPosition="bottom"
                          legendColumns={2}
                          compactLegend
                          fullLegendLabels
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : isMarketingCompactKpi ? (
            <div className="mt-3 min-h-0">
              <div className="relative flex h-full min-h-[182px] min-w-0 flex-col overflow-hidden rounded-[18px] border border-white/10 bg-slate-950/30 p-4">
                <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_1px_minmax(0,0.95fr)] gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-slate-300">{block.marketingProjectKpi!.title}</div>
                    <div className="mt-2 tabular-nums leading-none tracking-tight text-white">
                      <span className="text-3xl font-extrabold">{rub(block.marketingProjectKpi!.soldUnits)}</span>
                      <span className="ml-1 text-[20px] font-medium text-slate-300/70">
                        из {rub(block.marketingProjectKpi!.totalUnits)} шт
                      </span>
                    </div>
                    <div className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-slate-100">
                      {rubCompactMln(block.marketingProjectKpi!.projectRevenueRub)}
                    </div>
                  </div>
                  <div className="h-full w-px bg-white/10" aria-hidden />
                  <div className="min-w-0 space-y-3.5 pl-1">
                    <div>
                      <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                        Факт поступлений
                      </div>
                      <div className="mt-1 text-[19px] font-bold tabular-nums tracking-tight text-white">
                        {rub(block.marketingProjectKpi!.factReceiptsRub)} ₽
                      </div>
                    </div>
                    <div className="border-t border-white/10 pt-3">
                      <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                        Средняя стоимость м²
                      </div>
                      <div className="mt-1 text-[19px] font-bold tabular-nums tracking-tight text-white">
                        {rub(block.marketingProjectKpi!.avgPricePerSqmRub)} ₽/м²
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

/**
 * Навигационные карточки разделов: клик по всей области ведёт в маршрут (Link), без KPI внутри.
 */
export function HubSectionCards({
  blocks,
  gridClassName = "hub-section-grid",
  variant = "default",
}: Props) {
  if (variant === "presentation") {
    return (
      <section className={gridClassName} aria-label="Разделы платформы">
        {blocks.map((block) => (
          <PremiumHubCard key={block.href} block={block} />
        ))}
      </section>
    );
  }

  return (
    <section className={gridClassName} aria-label="Разделы платформы">
      {blocks.map((block) => (
        <Link
          key={block.href}
          href={block.href}
          scroll
          className={[
            "group relative block cursor-pointer overflow-hidden rounded-xl no-underline",
            "border border-slate-600/40 bg-slate-900/90 p-4 shadow-md ring-0",
            "transition duration-200 ease-out will-change-transform",
            "hover:z-[1] hover:scale-[1.02] hover:border-slate-500/60 hover:bg-slate-900",
            "hover:shadow-lg hover:shadow-cyan-500/20",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500/60",
            "md:p-5",
          ].join(" ")}
          aria-label={`Перейти: ${block.title}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusDotClass[block.status]}`}
                  title={statusTitle[block.status]}
                  aria-hidden
                />
                <h2 className="text-lg font-semibold tracking-tight text-slate-50 md:text-xl">{block.title}</h2>
              </div>
              <p className="mt-2 line-clamp-1 text-sm leading-snug text-slate-400">{block.description}</p>
            </div>
            <span
              className="shrink-0 pt-0.5 text-xl font-light text-slate-500 transition-colors group-hover:text-cyan-400"
              aria-hidden
            >
              →
            </span>
          </div>
        </Link>
      ))}
    </section>
  );
}
