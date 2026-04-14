/**
 * Единый расчёт 4 KPI дашборда плана продаж (как в SalesPlanPanel при базовом сценарии realistic ×1).
 */

import { filterByObjectAndDealType, mergeSalesPlanFact, marketingMockData } from "@/lib/marketingMockData";
import type { SalesCategoryId, SalesReportPayload, SalesSeriesPoint } from "@/lib/marketingSalesReportData";
import { compactRub, numFmt } from "@/lib/salesPlanChartFormat";

import type { KpiDashboardItem } from "@/components/marketing/SalesPlanKpiDashboard";

const PRESENTATION_SIGMA_LEGEND = "сумма по выбранным категориям или периодам";

type MonthlyPlanExecutionRow = {
  periodKey: string;
  label: string;
  plan: number;
  fact: number;
  deviation: number;
};

type MonthlyExecutionInsights = {
  firstNegative: MonthlyPlanExecutionRow | null;
  worstMonth: MonthlyPlanExecutionRow | null;
  trend: "improving" | "worsening" | "stable" | "neutral";
};

function periodKeyTodayMonth(): string {
  const d = new Date();
  const y = d.getFullYear();
  return `${y}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function buildMonthlyExecutionInsights(rows: MonthlyPlanExecutionRow[], todayMonthKey: string): MonthlyExecutionInsights {
  const firstNegative = rows.find((r) => r.deviation < 0) ?? null;
  let worstMonth: MonthlyPlanExecutionRow | null = null;
  for (const r of rows) {
    if (!worstMonth || r.deviation < worstMonth.deviation) worstMonth = r;
  }
  const n = rows.length;
  let trend: MonthlyExecutionInsights["trend"] = "neutral";
  if (n >= 3) {
    const k = Math.max(1, Math.floor(n / 3));
    const avgDev = (slice: MonthlyPlanExecutionRow[]) =>
      slice.reduce((s, r) => s + r.deviation, 0) / Math.max(1, slice.length);
    const diff = avgDev(rows.slice(n - k)) - avgDev(rows.slice(0, k));
    const threshold = 0.75;
    if (diff > threshold) trend = "improving";
    else if (diff < -threshold) trend = "worsening";
    else trend = "stable";
  }
  return { firstNegative, worstMonth, trend };
}

function seriesToLineData(points: SalesSeriesPoint[], metric: "revenue") {
  return points.map((row) => {
    const b = row[metric];
    const deviation = b.factCumulative - b.planCumulative;
    return {
      periodKey: row.periodKey,
      label: row.label,
      plan: b.planCumulative,
      fact: b.factCumulative,
      deviation,
    };
  });
}

type DeviationContributionRow = {
  id: SalesCategoryId;
  name: string;
  deviation: number;
  percentComplete: number;
};

function buildDeviationContribution(
  categories: Array<{
    id: SalesCategoryId;
    name: string;
    planCumulative: number;
    factCumulative: number;
    deviation: number;
    percentComplete: number;
  }>,
): DeviationContributionRow[] {
  return [...categories]
    .map((c) => ({
      id: c.id,
      name: c.name,
      deviation: c.deviation,
      percentComplete: c.percentComplete,
    }))
    .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));
}

type DealControlRow = {
  periodKey: string;
  planCumulative: number;
  factCumulative: number;
};

function buildDealControlData(points: ReturnType<typeof mergeSalesPlanFact>): DealControlRow[] {
  let planRun = 0;
  let factRun = 0;
  return points.map((p) => {
    planRun += p.planDeals;
    factRun += p.factDeals;
    return { periodKey: p.periodKey, planCumulative: planRun, factCumulative: factRun };
  });
}

export type DynamicsKpiInput = {
  rev: {
    planCumulative: number;
    factCumulative: number;
    deviationCumulative: number;
    percentComplete: number;
  };
  forecastPercentAdjusted: number;
  cumulativeExecSeriesPct: number[];
  monthlyExecPctSeries: number[];
  monthlyDeviationSeries: number[];
  cumulativeDeviationSeries: number[];
  monthPlanDeals: number;
  monthFactDeals: number;
  monthExecPct: number;
  monthDeviationDeals: number;
  monthPlanRevenue: number;
  monthFactRevenue: number;
  monthDeviationRevenue: number;
  currentPlanCum: number;
  currentFactCum: number;
  currentDeviation: number;
  cumulativeDeviationRevenue: number;
  lagSegment: string;
  firstLagMonth: string;
  worstLagMonth: string;
  trendShort: string;
  weakSegment: string;
  /** Подзаголовок для карточек месяца (как в панели). */
  currentMonthLabel: string;
  /** Подзаголовок для накопительного отклонения по сделкам, напр. «К 31 мар. 2026». */
  cumulativeDealsSubLabel: string;
};

export type SalesPlanKpiPeriod = "month" | "quarter";

export function formatSalesPlanAsOfKpiSub(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length !== 3) return `К ${isoDate}`;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  const months = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"] as const;
  const mo = months[m - 1];
  if (!mo || [y, m, d].some((n) => Number.isNaN(n))) return `К ${isoDate}`;
  return `К ${d} ${mo}. ${y}`;
}

function periodKeyTodayForGranularity(period: SalesPlanKpiPeriod): string {
  const dt = new Date();
  const y = dt.getFullYear();
  if (period === "month") return `${y}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
  const q = Math.floor(dt.getMonth() / 3) + 1;
  return `${y}-Q${q}`;
}

export function buildDynamicsKpiInputFromReport(
  report: SalesReportPayload,
  objectId: string,
  dealTypeId: string,
  period: SalesPlanKpiPeriod = "month",
): DynamicsKpiInput {
  const baseRev = report.salesData.revenue;
  const effectiveTotalPlan = baseRev.planCumulative;
  const rev = {
    planCumulative: effectiveTotalPlan,
    factCumulative: baseRev.factCumulative,
    deviationCumulative: baseRev.factCumulative - effectiveTotalPlan,
    percentComplete: effectiveTotalPlan > 0 ? (baseRev.factCumulative / effectiveTotalPlan) * 100 : 0,
  };

  const categoriesAdjusted = report.categories.map((cat) => {
    const plan = cat.planCumulative;
    const fact = cat.factCumulative;
    const deviation = fact - plan;
    const percentComplete = plan > 0 ? (fact / plan) * 100 : 0;
    return { ...cat, planCumulative: plan, deviation, percentComplete };
  });

  const deviationContribution = buildDeviationContribution(categoriesAdjusted);
  const topNegativeContribution = deviationContribution.filter((r) => r.deviation < 0)[0];
  const topWeakRadar = [...report.radarCategories]
    .map((r) => ({
      name: r.name,
      pct: r.planCumulative > 0 ? (r.factCumulative / r.planCumulative) * 100 : 0,
      deviation: r.factCumulative - r.planCumulative,
    }))
    .sort((a, b) => a.pct - b.pct)[0];
  const weakSegment = topWeakRadar?.name ?? "сегменты";
  const lagSegment = topNegativeContribution?.name ?? weakSegment;

  const planRows = period === "month" ? marketingMockData.salesPlan.month : marketingMockData.salesPlan.quarter;
  const factRows = period === "month" ? marketingMockData.salesFact.month : marketingMockData.salesFact.quarter;
  const planFiltered = filterByObjectAndDealType(planRows, objectId, dealTypeId);
  const factFiltered = filterByObjectAndDealType(factRows, objectId, dealTypeId);
  const monthlyPlanExecutionData: MonthlyPlanExecutionRow[] = mergeSalesPlanFact(planFiltered, factFiltered).map((row) => ({
    periodKey: row.periodKey,
    label: row.label,
    plan: row.planDeals,
    fact: row.factDeals,
    deviation: row.factDeals - row.planDeals,
  }));

  const todayMonthKey = periodKeyTodayMonth();
  const monthlyExecutionInsights = buildMonthlyExecutionInsights(monthlyPlanExecutionData, todayMonthKey);
  const currentMonthIdx = (() => {
    const idx = monthlyPlanExecutionData.findIndex((r) => r.periodKey === todayMonthKey);
    return idx >= 0 ? idx : Math.max(0, monthlyPlanExecutionData.length - 1);
  })();
  const currentMonthPoint = monthlyPlanExecutionData[currentMonthIdx];

  let planRun = 0;
  let factRun = 0;
  const cumulativeExecSeriesPct = monthlyPlanExecutionData.map((row) => {
    planRun += row.plan;
    factRun += row.fact;
    return planRun > 0 ? (factRun / planRun) * 100 : 0;
  });
  const monthlyExecPctSeries = monthlyPlanExecutionData.slice(-6).map((r) => (r.plan > 0 ? (r.fact / r.plan) * 100 : 0));
  const monthlyDeviationSeries = monthlyPlanExecutionData.slice(-6).map((r) => r.deviation);
  let runDev = 0;
  const cumulativeDeviationSeries = monthlyPlanExecutionData.slice(-6).map((r) => {
    runDev += r.deviation;
    return runDev;
  });

  const monthPlanDeals = currentMonthPoint?.plan ?? 0;
  const monthFactDeals = currentMonthPoint?.fact ?? 0;
  const monthDeviationDeals = currentMonthPoint?.deviation ?? 0;
  const monthExecPct = monthPlanDeals > 0 ? (monthFactDeals / monthPlanDeals) * 100 : 0;

  const seriesPoints = period === "month" ? report.series.month : report.series.quarter;
  const revenueLineData = seriesToLineData(seriesPoints, "revenue");
  const dealControlData = buildDealControlData(mergeSalesPlanFact(planFiltered, factFiltered));
  const todayPeriodKey = periodKeyTodayForGranularity(period);
  const currentIdx = Math.max(
    0,
    dealControlData.findIndex((r) => r.periodKey === todayPeriodKey) >= 0
      ? dealControlData.findIndex((r) => r.periodKey === todayPeriodKey)
      : dealControlData.length - 1,
  );
  const effectiveCurrentIdx =
    dealControlData.findIndex((r) => r.periodKey === todayPeriodKey) >= 0 ? currentIdx : dealControlData.length - 1;
  const currentRevCum = revenueLineData[effectiveCurrentIdx];
  const prevRevCum = effectiveCurrentIdx > 0 ? revenueLineData[effectiveCurrentIdx - 1] : undefined;
  const monthPlanRevenue = Math.max(0, (currentRevCum?.plan ?? 0) - (prevRevCum?.plan ?? 0));
  const monthFactRevenue = Math.max(0, (currentRevCum?.fact ?? 0) - (prevRevCum?.fact ?? 0));
  const monthDeviationRevenue = monthFactRevenue - monthPlanRevenue;

  const currentPoint = dealControlData[effectiveCurrentIdx];
  const currentPlanCum = currentPoint?.planCumulative ?? 0;
  const currentFactCum = currentPoint?.factCumulative ?? 0;
  const currentDeviation = currentFactCum - currentPlanCum;

  const analytics = period === "month" ? report.planAnalytics.month : report.planAnalytics.quarter;
  const rrAdjusted = { ...analytics.runRate, horizonPlanCumulativeRub: effectiveTotalPlan };
  const forecastPercentAdjusted =
    effectiveTotalPlan > 0 ? (rrAdjusted.forecastCumulativeEndRub / effectiveTotalPlan) * 100 : 0;

  const firstLagMonth = monthlyExecutionInsights.firstNegative?.label ?? "последние месяцы";
  const worstLagMonth = monthlyExecutionInsights.worstMonth?.label ?? firstLagMonth;
  const trendShort =
    monthlyExecutionInsights.trend === "improving"
      ? "тренд улучшается"
      : monthlyExecutionInsights.trend === "worsening"
        ? "тренд ухудшается"
        : monthlyExecutionInsights.trend === "stable"
          ? "тренд стабильный"
          : "тренд пока нечитабелен";

  return {
    rev,
    forecastPercentAdjusted,
    cumulativeExecSeriesPct,
    monthlyExecPctSeries,
    monthlyDeviationSeries,
    cumulativeDeviationSeries,
    monthPlanDeals,
    monthFactDeals,
    monthExecPct,
    monthDeviationDeals,
    monthPlanRevenue,
    monthFactRevenue,
    monthDeviationRevenue,
    currentPlanCum,
    currentFactCum,
    currentDeviation,
    cumulativeDeviationRevenue: rev.deviationCumulative,
    lagSegment,
    firstLagMonth,
    worstLagMonth,
    trendShort,
    weakSegment,
    currentMonthLabel: currentMonthPoint?.label ?? "Текущий месяц",
    cumulativeDealsSubLabel: formatSalesPlanAsOfKpiSub(report.asOf),
  };
}

type KpiCardTone = "green" | "yellow" | "red";

function miniLineColorByTone(tone: KpiCardTone, presentationLike: boolean): string {
  if (tone === "green") return presentationLike ? "#d1fae5" : "#047857";
  if (tone === "yellow") return presentationLike ? "#fffbeb" : "#b45309";
  return presentationLike ? "#ffe4e6" : "#b91c1c";
}

export function buildDynamicsKpiItems(input: DynamicsKpiInput, presentationLikeForSparks: boolean): KpiDashboardItem[] {
  const {
    rev,
    forecastPercentAdjusted,
    cumulativeExecSeriesPct,
    monthlyExecPctSeries,
    monthlyDeviationSeries,
    cumulativeDeviationSeries,
    monthPlanDeals,
    monthFactDeals,
    monthExecPct,
    monthDeviationDeals,
    monthPlanRevenue,
    monthFactRevenue,
    monthDeviationRevenue,
    currentPlanCum,
    currentFactCum,
    currentDeviation,
    cumulativeDeviationRevenue,
    lagSegment,
    firstLagMonth,
    worstLagMonth,
    trendShort,
    weakSegment,
    currentMonthLabel,
    cumulativeDealsSubLabel,
  } = input;

  const cumulativeExecTone: KpiCardTone =
    forecastPercentAdjusted >= 100 ? "green" : forecastPercentAdjusted >= 90 ? "yellow" : "red";
  const monthExecTone: KpiCardTone = monthExecPct >= 100 ? "green" : monthExecPct >= 95 ? "yellow" : "red";
  const monthDevTone: KpiCardTone = monthDeviationDeals >= 0 ? "green" : monthDeviationDeals >= -5 ? "yellow" : "red";
  const cumulativeDevTone: KpiCardTone = currentDeviation >= 0 ? "green" : currentDeviation >= -5 ? "yellow" : "red";

  const cumulativeLineTone: KpiCardTone = (() => {
    const n = cumulativeDeviationSeries.length;
    if (n < 2) return "yellow";
    const last = cumulativeDeviationSeries[n - 1] ?? 0;
    const prev = cumulativeDeviationSeries[n - 2] ?? 0;
    if (last < 0 && last < prev) return "red";
    return "yellow";
  })();

  const cumulativeDeviationHeader = `${currentDeviation > 0 ? "+" : currentDeviation < 0 ? "−" : ""}${numFmt.format(Math.abs(currentDeviation))} / ${cumulativeDeviationRevenue > 0 ? "+" : cumulativeDeviationRevenue < 0 ? "−" : ""}${numFmt.format(Math.round(Math.abs(cumulativeDeviationRevenue) / 1_000_000))} млн`;

  return [
    {
      key: "cum-exec",
      title: "Выполнение плана (накопительно)",
      value: `${rev.percentComplete.toFixed(1)}%`,
      sub: `Прогноз к концу: ${forecastPercentAdjusted.toFixed(1)}%`,
      description:
        forecastPercentAdjusted < 90
          ? `Основное отставание дает ${lagSegment}; заметный недобор начался с ${firstLagMonth}.`
          : forecastPercentAdjusted < 100
            ? `Риск связан с ${lagSegment}, но ${trendShort} и просадка частично компенсируется.`
            : `План закрывается за счет ускорения в последних месяцах; ${lagSegment} уже не критичен.`,
      tone: cumulativeExecTone,
      hover: `План: ${compactRub(rev.planCumulative)} | Факт: ${compactRub(rev.factCumulative)} | Отклонение: ${rev.deviationCumulative >= 0 ? "+" : "−"}${compactRub(Math.abs(rev.deviationCumulative))}`,
      sparkline: cumulativeExecSeriesPct,
      tooltip: {
        metricMeaning: "Показывает, какую долю накопительного плана уже закрыли по факту.",
        formula: "Формула: накопительный факт / накопительный план × 100%.",
        variables: [
          { symbol: "R_нак_факт", description: "накопительная фактическая выручка к отчётной дате" },
          { symbol: "R_нак_план", description: "накопительный плановый объём выручки к той же дате" },
        ],
        sigmaNote: PRESENTATION_SIGMA_LEGEND,
        calculation: `${compactRub(rev.factCumulative)} / ${compactRub(rev.planCumulative)} = ${rev.percentComplete.toFixed(1)}%`,
        explanation:
          "Формула используется для оценки выполнения плана — показывает, какую долю от запланированного объёма выручки (накопительно) составляет факт.",
        interpretation:
          rev.percentComplete >= 100
            ? "План по накопительной выручке выполнен или перевыполнен."
            : `План по накопительной выручке не выполнен, отставание ${(100 - rev.percentComplete).toFixed(1)} п.п.`,
        fact: `${compactRub(rev.factCumulative)}`,
        plan: `${compactRub(rev.planCumulative)}`,
        deviation: `${rev.deviationCumulative >= 0 ? "+" : "−"}${compactRub(Math.abs(rev.deviationCumulative))}`,
        miniChart: "Столбцы и линия показывают динамику % выполнения по месяцам; точка — последний месяц.",
        conclusion: forecastPercentAdjusted < 100 ? `Риск недовыполнения связан с ${lagSegment}.` : "Текущая динамика позволяет закрыть план.",
      },
    },
    {
      key: "month-exec",
      title: "Выполнение за месяц",
      value: `${monthExecPct.toFixed(1)}%`,
      sub: `${currentMonthLabel} · факт/план`,
      description:
        monthExecPct < 90
          ? `Месяц недовыполнен: слабее всего ${lagSegment}, а точка спада — ${worstLagMonth}.`
          : monthExecPct < 100
            ? `Почти в плане; отрыв дают ${lagSegment}, но ${trendShort}.`
            : `Месяц компенсирует прошлый недобор, особенно в сегменте ${weakSegment}.`,
      tone: monthExecTone,
      hover: `План: ${numFmt.format(monthPlanDeals)} шт | Факт: ${numFmt.format(monthFactDeals)} шт | Отклонение: ${monthDeviationDeals >= 0 ? "+" : "−"}${numFmt.format(Math.abs(monthDeviationDeals))} шт`,
      sparkBars: monthlyExecPctSeries,
      sparkLine: monthlyExecPctSeries,
      tooltip: {
        metricMeaning: "Показывает выполнение плана именно за текущий месяц.",
        formula: "Формула: факт месяца / план месяца × 100%.",
        variables: [
          { symbol: "fact_month", description: "фактическое число сделок в отчётном месяце" },
          { symbol: "plan_month", description: "плановое число сделок в том же месяце" },
        ],
        calculation:
          monthPlanDeals > 0
            ? `${numFmt.format(monthFactDeals)} / ${numFmt.format(monthPlanDeals)} = ${monthExecPct.toFixed(1)}%`
            : `${numFmt.format(monthFactDeals)} /0 — план месяца не задан, % не считается`,
        explanation:
          "Сравнивает фактические продажи (сделки) с планом за отчётный месяц, чтобы оценить выполнение периода, а не только накопительный итог.",
        interpretation:
          monthExecPct >= 100
            ? "План за месяц выполнен или перевыполнен."
            : `План за месяц не выполняется, отставание ${(100 - monthExecPct).toFixed(1)}%`,
        fact: `${numFmt.format(monthFactDeals)} шт`,
        plan: `${numFmt.format(monthPlanDeals)} шт`,
        deviation: `${monthDeviationDeals >= 0 ? "+" : "−"}${numFmt.format(Math.abs(monthDeviationDeals))} шт`,
        miniChart: "Столбцы — % выполнения по последним месяцам, линия — сглаженный тренд %, точка — текущее значение.",
        conclusion: monthExecPct < 100 ? `Недобор формируется в ${lagSegment}.` : "Месяц отрабатывает план с запасом.",
      },
    },
    {
      key: "month-dev",
      title: "Отклонение за месяц",
      value: `${monthDeviationDeals >= 0 ? "+" : "−"}${numFmt.format(Math.abs(monthDeviationDeals))} шт / ${monthDeviationRevenue >= 0 ? "+" : "−"}${compactRub(Math.abs(monthDeviationRevenue))}`,
      sub: `${currentMonthLabel} · к плану`,
      description:
        monthDeviationDeals < 0
          ? `Минус месяца формируют ${lagSegment}; худший период — ${worstLagMonth}.`
          : `Плюс месяца частично компенсирует провал с ${firstLagMonth}, динамика: ${trendShort}.`,
      tone: monthDevTone,
      hover: `План: ${numFmt.format(monthPlanDeals)} шт, ${compactRub(monthPlanRevenue)} | Факт: ${numFmt.format(monthFactDeals)} шт, ${compactRub(monthFactRevenue)} | Отклонение: ${monthDeviationDeals >= 0 ? "+" : "−"}${numFmt.format(Math.abs(monthDeviationDeals))} шт, ${monthDeviationRevenue >= 0 ? "+" : "−"}${compactRub(Math.abs(monthDeviationRevenue))}`,
      sparkBars: monthlyDeviationSeries,
      sparkMode: "bars",
      sparkBaselineStroke: miniLineColorByTone(monthExecTone, presentationLikeForSparks),
      sparkBaselineDasharray: "6 4",
      sparkBaselineWidth: 1.75,
      tooltip: {
        metricMeaning: "Показывает отклонение текущего месяца в штуках и выручке.",
        formula: "Формула: факт месяца − план месяца.",
        variables: [
          { symbol: "fact_month", description: "фактическое число сделок в отчётном месяце" },
          { symbol: "plan_month", description: "плановое число сделок в том же месяце" },
          { symbol: "R_мес_факт", description: "фактическая выручка за тот же месяц" },
          { symbol: "R_мес_план", description: "плановая выручка за тот же месяц" },
        ],
        calculation: `${numFmt.format(monthFactDeals)} − ${numFmt.format(monthPlanDeals)} = ${monthDeviationDeals >= 0 ? "+" : "−"}${numFmt.format(Math.abs(monthDeviationDeals))} шт; выручка: ${compactRub(monthFactRevenue)} − ${compactRub(monthPlanRevenue)} = ${monthDeviationRevenue >= 0 ? "+" : "−"}${compactRub(Math.abs(monthDeviationRevenue))}`,
        explanation:
          "Показывает абсолютный разрыв между фактом и планом за месяц в тех же единицах, что и план (сделки и выручка), без приведения к процентам.",
        interpretation:
          monthDeviationDeals >= 0
            ? "Месяц даёт не меньше сделок, чем запланировано — недобор по штукам за период отсутствует."
            : `Месяц недобран на ${numFmt.format(Math.abs(monthDeviationDeals))} сделок — это прямой вклад в отставание от плана.`,
        fact: `${numFmt.format(monthFactDeals)} шт / ${compactRub(monthFactRevenue)}`,
        plan: `${numFmt.format(monthPlanDeals)} шт / ${compactRub(monthPlanRevenue)}`,
        deviation: `${monthDeviationDeals >= 0 ? "+" : "−"}${numFmt.format(Math.abs(monthDeviationDeals))} шт / ${monthDeviationRevenue >= 0 ? "+" : "−"}${compactRub(Math.abs(monthDeviationRevenue))}`,
        miniChart: "Столбцы вверх/вниз показывают отклонение по месяцам; зеленый — плюс, красный — минус.",
        conclusion: monthDeviationDeals < 0 ? `Минус месяца усиливает отставание, особенно в ${lagSegment}.` : "Плюс месяца частично компенсирует предыдущий недобор.",
      },
    },
    {
      key: "cum-dev",
      title: "Отклонение накопительное",
      value: cumulativeDeviationHeader,
      sub: cumulativeDealsSubLabel,
      description:
        currentDeviation < 0
          ? `Накопленное отставание растёт с ${firstLagMonth}; ключевой источник — ${lagSegment}.`
          : `Накопительное отклонение сокращается; ключевой драйвер — ${weakSegment}.`,
      tone: cumulativeDevTone,
      hover: `План: ${numFmt.format(currentPlanCum)} шт | Факт: ${numFmt.format(currentFactCum)} шт | Отклонение: ${currentDeviation >= 0 ? "+" : "−"}${numFmt.format(Math.abs(currentDeviation))} шт`,
      sparkBars: cumulativeDeviationSeries,
      sparkLine: cumulativeDeviationSeries,
      sparkMode: "bars",
      sparkBarsFromBottom: true,
      sparkTone: currentDeviation < 0 ? "red" : cumulativeLineTone,
      surfaceTone: monthExecTone,
      hideRadialOverlay: true,
      sparkBaselineStroke: "rgba(255,255,255,0.8)",
      sparkBaselineDasharray: "6 4",
      sparkBaselineWidth: 2,
      sparkLineStroke: "rgba(255,255,255,0.92)",
      tooltip: {
        metricMeaning: "Показывает суммарное отклонение от плана к текущей дате.",
        formula: "Формула: накопительный факт − накопительный план.",
        variables: [
          { symbol: "N_нак_факт", description: "накопительное число сделок (факт) к отчётной дате" },
          { symbol: "N_нак_план", description: "накопительное число сделок (план) к той же дате" },
          { symbol: "R_нак_факт", description: "накопительная фактическая выручка к отчётной дате" },
          { symbol: "R_нак_план", description: "накопительный плановый объём выручки к той же дате" },
        ],
        sigmaNote: PRESENTATION_SIGMA_LEGEND,
        calculation: `${numFmt.format(currentFactCum)} − ${numFmt.format(currentPlanCum)} = ${currentDeviation >= 0 ? "+" : "−"}${numFmt.format(Math.abs(currentDeviation))} шт; выручка: ${compactRub(rev.factCumulative)} − ${compactRub(rev.planCumulative)} = ${cumulativeDeviationRevenue >= 0 ? "+" : "−"}${compactRub(Math.abs(cumulativeDeviationRevenue))}`,
        explanation:
          "Суммирует все месяцы до отчётной даты: сколько сделок и выручки не дотянуто или сделано сверху относительно накопительного плана.",
        interpretation:
          currentDeviation >= 0
            ? "Накопительно сделок не меньше плана — в штуках отставания по горизонту нет."
            : `Накопительный недобор ${numFmt.format(Math.abs(currentDeviation))} сделок — запас по времени и темпу нужно наращивать, иначе риск невыполнения годового плана.`,
        fact: `${numFmt.format(currentFactCum)} шт / ${compactRub(rev.factCumulative)}`,
        plan: `${numFmt.format(currentPlanCum)} шт / ${compactRub(rev.planCumulative)}`,
        deviation: `${currentDeviation >= 0 ? "+" : "−"}${numFmt.format(Math.abs(currentDeviation))} шт / ${cumulativeDeviationRevenue >= 0 ? "+" : "−"}${compactRub(Math.abs(cumulativeDeviationRevenue))}`,
        miniChart: "Линия показывает накопительное отклонение по месяцам; выделенная точка — текущее накопленное значение.",
        conclusion: currentDeviation < 0 ? `Отставание накоплено с ${firstLagMonth}; ключевой вклад — ${lagSegment}.` : "Накопительное отклонение компенсируется текущим ростом.",
      },
    },
  ];
}
