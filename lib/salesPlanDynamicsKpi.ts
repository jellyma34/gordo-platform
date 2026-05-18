/**
 * Единый расчёт 4 KPI дашборда плана продаж (как в SalesPlanPanel при базовом сценарии realistic ×1).
 */

import { filterByObject, mergeSalesPlanFact, marketingMockData } from "@/lib/marketingMockData";
import type { SalesCategoryId, SalesReportPayload, SalesSeriesPoint } from "@/lib/marketingSalesReportData";
import { compactRub, numFmt } from "@/lib/salesPlanChartFormat";

import type { KpiDashboardItem, KpiSignalLabel } from "@/components/marketing/SalesPlanKpiDashboard";

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
  const planFiltered = filterByObject(planRows, objectId);
  const factFiltered = filterByObject(factRows, objectId);
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

/** Месячное выполнение: ≥100% OK, 90–100% Риск, <90% Критично (интерпретация для презентации). */
function classifyMonthlySignal(pct: number): { tone: KpiCardTone; label: KpiSignalLabel } {
  if (pct >= 100) return { tone: "green", label: "OK" };
  if (pct >= 90) return { tone: "yellow", label: "Риск" };
  return { tone: "red", label: "Критично" };
}

/** Накопительное выполнение: ≥95% OK, 85–95% Риск, <85% Критично. */
function classifyCumulativeSignal(pct: number): { tone: KpiCardTone; label: KpiSignalLabel } {
  if (pct >= 95) return { tone: "green", label: "OK" };
  if (pct >= 85) return { tone: "yellow", label: "Риск" };
  return { tone: "red", label: "Критично" };
}

function relPctOfPlan(delta: number, plan: number, digits = 0): string | null {
  if (plan === 0) return null;
  const p = (delta / plan) * 100;
  const sign = p > 0 ? "+" : p < 0 ? "−" : "";
  return `${sign}${Math.abs(p).toFixed(digits)}%`;
}

function dealsDeltaWithPct(delta: number, planDeals: number): string {
  const sign = delta >= 0 ? "+" : "−";
  const abs = `${sign}${numFmt.format(Math.abs(delta))} шт`;
  const pct = relPctOfPlan(delta, planDeals);
  return pct ? `${abs} (${pct})` : abs;
}

function rubDeltaWithPct(deltaRub: number, planRub: number): string {
  const sign = deltaRub >= 0 ? "+" : "−";
  const abs = `${sign}${compactRub(Math.abs(deltaRub))}`;
  const pct = relPctOfPlan(deltaRub, planRub);
  return pct ? `${abs} (${pct})` : abs;
}

function miniLineColorByTone(tone: KpiCardTone, presentationLike: boolean): string {
  if (tone === "green") return presentationLike ? "#d1fae5" : "#047857";
  if (tone === "yellow") return presentationLike ? "#fffbeb" : "#b45309";
  return presentationLike ? "#ffe4e6" : "#b91c1c";
}

/** KPI презентации: те же входные величины и формулы, иной текст, Δ%, сигналы и расхождение шт / ₽. */
function buildPresentationDynamicsKpiItems(
  input: DynamicsKpiInput,
  presentationLikeForSparks: boolean,
): KpiDashboardItem[] {
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

  const cumSig = classifyCumulativeSignal(rev.percentComplete);
  const monthSig = classifyMonthlySignal(monthExecPct);

  const trendRiskNote =
    rev.percentComplete >= 80 && monthExecPct < 90
      ? " Накопительный показатель пока держится, но текущий темп ухудшается — риск невыполнения плана."
      : "";

  const mixNoteMonth =
    monthDeviationDeals < 0 && monthDeviationRevenue >= 0
      ? " Рост выручки обеспечен ценой/миксом, а не спросом (по шт. — отставание)."
      : "";

  const mixNoteCum =
    currentDeviation < 0 && cumulativeDeviationRevenue >= 0
      ? " Накопительно выручка удерживается за счёт цены/микса при отставании по объёму сделок."
      : "";

  const monthDevValue = `${dealsDeltaWithPct(monthDeviationDeals, monthPlanDeals)} / ${rubDeltaWithPct(monthDeviationRevenue, monthPlanRevenue)}`;
  const cumDevValue = `${dealsDeltaWithPct(currentDeviation, currentPlanCum)} / ${rubDeltaWithPct(cumulativeDeviationRevenue, rev.planCumulative)}`;

  const tooltipDevMonth = `${dealsDeltaWithPct(monthDeviationDeals, monthPlanDeals)} / ${rubDeltaWithPct(monthDeviationRevenue, monthPlanRevenue)}`;
  const tooltipDevCum = `${dealsDeltaWithPct(currentDeviation, currentPlanCum)} / ${rubDeltaWithPct(cumulativeDeviationRevenue, rev.planCumulative)}`;

  const cumulativeLineTone: KpiCardTone = (() => {
    const n = cumulativeDeviationSeries.length;
    if (n < 2) return "yellow";
    const last = cumulativeDeviationSeries[n - 1] ?? 0;
    const prev = cumulativeDeviationSeries[n - 2] ?? 0;
    if (last < 0 && last < prev) return "red";
    return "yellow";
  })();

  const cumExecDescription =
    (rev.percentComplete >= 95
      ? `Выполнение в безопасной зоне: накопленная выручка закрывает согласованную долю плана — запас по темпу снижает риск срыва годовых KPI. Ключевой фактор динамики — ${weakSegment}.`
      : rev.percentComplete >= 85
        ? `Зона внимания: накопление отстаёт от целевого коридора — без усиления месячного темпа недобой может перенестись на конец горизонта. Основной вклад в разрыв — ${lagSegment}; ${trendShort}.`
        : `Критическая зона: накопительное выполнение ниже допустимого порога — при сохранении динамики растёт вероятность невыполнения плана. Первично «тянет» ${lagSegment}, недобой закрепился с ${firstLagMonth}.`) + trendRiskNote;

  const monthExecDescription =
    monthExecPct >= 100
      ? `Темп месяца в норме или с запасом — текущий период не усугубляет накопительный риск; драйвер структуры — ${weakSegment}.`
      : monthExecPct >= 90
        ? `Темп месяца на нижней границе нормы: небольшой недобор не компенсирует возможное накопительное отставание, если слабость повторится. Уязвимость — ${lagSegment}, ${trendShort}.`
        : `Темп продаж ниже нормы: текущий месяц не компенсирует план — растёт риск накопительного отставания. Сегмент с наибольшим вкладом — ${lagSegment}, наихудшая точка динамики — ${worstLagMonth}.`;

  const monthDevDescription =
    (monthDeviationDeals < 0
      ? `Минус месяца по сделкам усиливает давление на годовой план; разрыв концентрируется в ${lagSegment} (худший период — ${worstLagMonth}). По выручке сигнал отдельно: объём (шт.) отражает спрос, выручка (₽) — цену и микс.`
      : `Плюс месяца по сделкам снижает накопительный риск; динамика: ${trendShort}. Шт. — спрос/объём, ₽ — цена и микс.`) + mixNoteMonth;

  const cumDevDescription =
    (currentDeviation < 0
      ? `Накопленное отставание по сделкам растёт с ${firstLagMonth}; основной источник — ${lagSegment}. Это прямой риск для закрытия годового объёма, если темп не выровнять.`
      : `Накопительное отклонение по сделкам не усугубляет план; опора на ${weakSegment}.`) + mixNoteCum;

  return [
    {
      key: "cum-exec",
      title: "Выполнение плана (накопительно)",
      value: `${rev.percentComplete.toFixed(1)}%`,
      sub: `Прогноз к концу: ${forecastPercentAdjusted.toFixed(1)}%`,
      description: cumExecDescription,
      signalLabel: cumSig.label,
      tone: cumSig.tone,
      hover: `План: ${compactRub(rev.planCumulative)} | Факт: ${compactRub(rev.factCumulative)} | Отклонение: ${rev.deviationCumulative >= 0 ? "+" : "−"}${compactRub(Math.abs(rev.deviationCumulative))}`,
      sparkline: cumulativeExecSeriesPct,
      tooltip: {
        metricMeaning:
          "Накопительная выручка к дате отчёта: доля закрытого плана (₽). Шт. на других карточках — отдельный сигнал спроса.",
        formula: "Формула: накопительный факт / накопительный план × 100%.",
        variables: [
          { symbol: "R_нак_факт", description: "накопительная фактическая выручка к отчётной дате" },
          { symbol: "R_нак_план", description: "накопительный плановый объём выручки к той же дате" },
        ],
        sigmaNote: PRESENTATION_SIGMA_LEGEND,
        calculation: `${compactRub(rev.factCumulative)} / ${compactRub(rev.planCumulative)} = ${rev.percentComplete.toFixed(1)}%`,
        explanation:
          "Выручка (₽) отражает цену и микс; не подменяет показатель спроса в штуках на соседних карточках.",
        interpretation:
          rev.percentComplete >= 95
            ? "Накопление в безопасном коридоре относительно годового плана по выручке."
            : rev.percentComplete >= 85
              ? "Накопление требует контроля: без усиления темпа возможен перенос недобоя."
              : "Накопление в критичной зоне — высокий риск невыполнения плана по выручке.",
        fact: `${compactRub(rev.factCumulative)}`,
        plan: `${compactRub(rev.planCumulative)}`,
        deviation: `${rev.deviationCumulative >= 0 ? "+" : "−"}${compactRub(Math.abs(rev.deviationCumulative))}`,
        miniChart: "Столбцы и линия — динамика % выполнения по периодам.",
        conclusion:
          forecastPercentAdjusted < 100
            ? `Прогноз ниже 100% — приоритет: выровнять темп в ${lagSegment}.`
            : "Прогноз допускает закрытие плана при сохранении темпа.",
      },
    },
    {
      key: "month-exec",
      title: "Выполнение за месяц",
      value: `${monthExecPct.toFixed(1)}%`,
      sub: `${currentMonthLabel} · факт/план · сделки (шт.)`,
      description: monthExecDescription,
      signalLabel: monthSig.label,
      tone: monthSig.tone,
      hover: `План: ${numFmt.format(monthPlanDeals)} шт | Факт: ${numFmt.format(monthFactDeals)} шт | Отклонение: ${monthDeviationDeals >= 0 ? "+" : "−"}${numFmt.format(Math.abs(monthDeviationDeals))} шт`,
      sparkBars: monthlyExecPctSeries,
      sparkLine: monthlyExecPctSeries,
      tooltip: {
        metricMeaning: "Месячное выполнение плана по сделкам (шт.) — сигнал спроса и объёма, не выручки.",
        formula: "Формула: факт месяца / план месяца × 100%.",
        variables: [
          { symbol: "fact_month", description: "фактическое число сделок в отчётном месяце" },
          { symbol: "plan_month", description: "плановое число сделок в том же месяце" },
        ],
        calculation:
          monthPlanDeals > 0
            ? `${numFmt.format(monthFactDeals)} / ${numFmt.format(monthPlanDeals)} = ${monthExecPct.toFixed(1)}%`
            : `${numFmt.format(monthFactDeals)} / 0 — план месяца не задан`,
        explanation: "Шт. показывают спрос/объём; расхождение со строкой по ₽ возможно из‑за цены и микса.",
        interpretation:
          monthExecPct >= 100
            ? "Месяц закрывает план по объёму сделок или перевыполняет."
            : monthExecPct >= 90
              ? "Месяц на грани: малый недобор может накапливать риск по году."
              : "Месяц материально недобирает объём — риск накопления отставания.",
        fact: `${numFmt.format(monthFactDeals)} шт`,
        plan: `${numFmt.format(monthPlanDeals)} шт`,
        deviation: `${monthDeviationDeals >= 0 ? "+" : "−"}${numFmt.format(Math.abs(monthDeviationDeals))} шт`,
        miniChart: "Последние периоды: % выполнения по сделкам.",
        conclusion:
          monthExecPct < 90
            ? `Нужен восстановительный темп; слабое звено — ${lagSegment}.`
            : "Текущий месяц не расширяет накопительный разрыв по шт.",
      },
    },
    {
      key: "month-dev",
      title: "Отклонение за месяц",
      value: monthDevValue,
      sub: `${currentMonthLabel} · Δ и Δ% к плану · шт. / ₽`,
      description: monthDevDescription,
      signalLabel: monthSig.label,
      tone: monthSig.tone,
      hover: `План: ${numFmt.format(monthPlanDeals)} шт, ${compactRub(monthPlanRevenue)} | Факт: ${numFmt.format(monthFactDeals)} шт, ${compactRub(monthFactRevenue)}`,
      sparkBars: monthlyDeviationSeries,
      sparkMode: "bars",
      sparkBaselineStroke: miniLineColorByTone(monthSig.tone, presentationLikeForSparks),
      sparkBaselineDasharray: "6 4",
      sparkBaselineWidth: 1.75,
      tooltip: {
        metricMeaning: "Абсолютное отклонение месяца: шт. (спрос) и ₽ (цена×микс).",
        formula: "Формула: факт месяца − план месяца (отдельно по шт. и по выручке).",
        variables: [
          { symbol: "fact_month", description: "фактическое число сделок в отчётном месяце" },
          { symbol: "plan_month", description: "плановое число сделок в том же месяце" },
          { symbol: "R_мес_факт", description: "фактическая выручка за тот же месяц" },
          { symbol: "R_мес_план", description: "плановая выручка за тот же месяц" },
        ],
        calculation: `${numFmt.format(monthFactDeals)} − ${numFmt.format(monthPlanDeals)}; выручка: ${compactRub(monthFactRevenue)} − ${compactRub(monthPlanRevenue)}`,
        explanation:
          "Если шт. хуже плана, а ₽ нет — выручку поддерживают цена/микс, а не объём; решения по спросу и по прайсу разделять.",
        interpretation:
          monthDeviationDeals < 0 && monthDeviationRevenue >= 0
            ? "Дивергенция шт. и ₽: рост выручки за счёт цены/микса при слабом спросе."
            : monthDeviationDeals >= 0
              ? "Месяц не ухудшает план по объёму сделок."
              : "Месяц ухудшает и объём — совпадает давление на выручку и спрос.",
        fact: `${numFmt.format(monthFactDeals)} шт / ${compactRub(monthFactRevenue)}`,
        plan: `${numFmt.format(monthPlanDeals)} шт / ${compactRub(monthPlanRevenue)}`,
        deviation: tooltipDevMonth,
        miniChart: "Столбцы — отклонение по месяцам в штуках.",
        conclusion:
          monthDeviationDeals < 0
            ? `Усилить объём в ${lagSegment} или явно зафиксировать опору на цене/миксе.`
            : "Отклонение месяца не добавляет угрозы по шт.",
      },
    },
    {
      key: "cum-dev",
      title: "Отклонение накопительное",
      value: cumDevValue,
      sub: cumulativeDealsSubLabel,
      description: cumDevDescription,
      signalLabel: cumSig.label,
      tone: cumSig.tone,
      hover: `План: ${numFmt.format(currentPlanCum)} шт | Факт: ${numFmt.format(currentFactCum)} шт`,
      sparkBars: cumulativeDeviationSeries,
      sparkLine: cumulativeDeviationSeries,
      sparkMode: "bars",
      sparkBarsFromBottom: true,
      sparkTone: currentDeviation < 0 ? "red" : cumulativeLineTone,
      surfaceTone: cumSig.tone,
      hideRadialOverlay: true,
      sparkBaselineStroke: "rgba(255,255,255,0.8)",
      sparkBaselineDasharray: "6 4",
      sparkBaselineWidth: 2,
      sparkLineStroke: "rgba(255,255,255,0.92)",
      tooltip: {
        metricMeaning: "Накопительно: отклонение по сделкам (шт.) и по выручке (₽) к дате отчёта.",
        formula: "Формула: накопительный факт − накопительный план (шт. и ₽ отдельно).",
        variables: [
          { symbol: "N_нак_факт", description: "накопительное число сделок (факт)" },
          { symbol: "N_нак_план", description: "накопительное число сделок (план)" },
          { symbol: "R_нак_факт", description: "накопительная фактическая выручка" },
          { symbol: "R_нак_план", description: "накопительный плановый объём выручки" },
        ],
        sigmaNote: PRESENTATION_SIGMA_LEGEND,
        calculation: `${numFmt.format(currentFactCum)} − ${numFmt.format(currentPlanCum)} шт; выручка: ${compactRub(rev.factCumulative)} − ${compactRub(rev.planCumulative)}`,
        explanation:
          "Совокупный разрыв по шт. и ₽; расхождение знаков указывает на роль цены/микса против спроса.",
        interpretation:
          currentDeviation < 0 && cumulativeDeviationRevenue >= 0
            ? "Накопительно объём отстаёт, выручка может держаться за счёт цены и микса."
            : currentDeviation >= 0
              ? "Накопительно объём сделок не хуже плана."
              : "Накопительно просадка и по шт., и по выручке — синхронный риск.",
        fact: `${numFmt.format(currentFactCum)} шт / ${compactRub(rev.factCumulative)}`,
        plan: `${numFmt.format(currentPlanCum)} шт / ${compactRub(rev.planCumulative)}`,
        deviation: tooltipDevCum,
        miniChart: "Накопительное отклонение по периодам.",
        conclusion:
          currentDeviation < 0
            ? `Перекрыть недобор: приоритет ${lagSegment}, иначе риск годового срыва по объёму.`
            : "Накопление по шт. не создаёт дополнительной угрозы.",
      },
    },
  ];
}

export function buildDynamicsKpiItems(
  input: DynamicsKpiInput,
  presentationLikeForSparks: boolean,
  usePresentationInterpretation = false,
): KpiDashboardItem[] {
  if (usePresentationInterpretation) {
    return buildPresentationDynamicsKpiItems(input, presentationLikeForSparks);
  }

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
