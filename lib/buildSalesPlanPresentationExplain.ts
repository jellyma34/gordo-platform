import { marketingMockData, mergeSalesPlanFact, filterByObjectAndDealType } from "@/lib/marketingMockData";
import type { SalesCategoryId, SalesReportPayload, SalesSeriesPoint, UpsellDiagnosticModel } from "@/lib/marketingSalesReportData";
import type { SalesTempoExplainMetricId } from "@/lib/salesPlanExplainMetricIds";
import { SALES_PLAN_PRESENTATION_EXPLAIN_CHARTS } from "@/lib/salesPlanPresentationExplainConfig";
import type { SalesPlanPresentationExplainChartId } from "@/lib/salesPlanPresentationExplainConfig";

export type { SalesTempoExplainMetricId } from "@/lib/salesPlanExplainMetricIds";

const numFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const dec1 = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function compactRub(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${dec1.format(n / 1_000_000_000)} млрд ₽`;
  if (abs >= 1_000_000) return `${dec1.format(n / 1_000_000)} млн ₽`;
  if (abs >= 1_000) return `${numFmt.format(Math.round(n / 1_000))} тыс. ₽`;
  return `${numFmt.format(Math.round(n))} ₽`;
}

function periodKeyTodayMonth(): string {
  const d = new Date();
  const y = d.getFullYear();
  return `${y}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type MonthlyExecRow = { periodKey: string; label: string; plan: number; fact: number; deviation: number };

function buildMonthlyPlanExecution(objectId: string, dealTypeId: string): MonthlyExecRow[] {
  const planFiltered = filterByObjectAndDealType(marketingMockData.salesPlan.month, objectId, dealTypeId);
  const factFiltered = filterByObjectAndDealType(marketingMockData.salesFact.month, objectId, dealTypeId);
  return mergeSalesPlanFact(planFiltered, factFiltered).map((row) => ({
    periodKey: row.periodKey,
    label: row.label,
    plan: row.planDeals,
    fact: row.factDeals,
    deviation: row.factDeals - row.planDeals,
  }));
}

/** Как в SalesPlanPanel: realistic, сохранённые планы = базовые из отчёта. */
function buildAdjustedSlices(report: SalesReportPayload) {
  const baseRev = report.salesData.revenue;
  const savedTotalPlan = baseRev.planCumulative;
  const baseCategoryPlans = report.categories.reduce<Record<SalesCategoryId, number>>((acc, row) => {
    acc[row.id] = row.planCumulative;
    return acc;
  }, {} as Record<SalesCategoryId, number>);
  const scenarioFactor = 1;
  const effectiveTotalPlan = Math.max(0, Math.round(savedTotalPlan * scenarioFactor));
  const effectiveCategoryPlans: Record<SalesCategoryId, number> = {
    apartments: Math.max(0, Math.round((baseCategoryPlans.apartments ?? 0) * scenarioFactor)),
    parking: Math.max(0, Math.round((baseCategoryPlans.parking ?? 0) * scenarioFactor)),
    storages: Math.max(0, Math.round((baseCategoryPlans.storages ?? 0) * scenarioFactor)),
    commercial: Math.max(0, Math.round((baseCategoryPlans.commercial ?? 0) * scenarioFactor)),
  };
  const rev = {
    ...baseRev,
    planCumulative: effectiveTotalPlan,
    deviationCumulative: baseRev.factCumulative - effectiveTotalPlan,
    percentComplete: effectiveTotalPlan > 0 ? (baseRev.factCumulative / effectiveTotalPlan) * 100 : 0,
  };
  const categoriesAdjusted = report.categories.map((cat) => {
    const plan = effectiveCategoryPlans[cat.id] ?? cat.planCumulative;
    const fact = cat.factCumulative;
    const deviation = fact - plan;
    const percentComplete = plan > 0 ? (fact / plan) * 100 : 0;
    return { ...cat, planCumulative: plan, deviation, percentComplete };
  });
  const radarCategoriesAdjusted = report.radarCategories.map((r) => {
    let group: SalesCategoryId = "commercial";
    if (r.id.startsWith("apt-")) group = "apartments";
    else if (r.id.includes("parking")) group = "parking";
    else if (r.id.includes("storage")) group = "storages";
    const base = baseCategoryPlans[group] || 1;
    const k = (effectiveCategoryPlans[group] || base) / base;
    return { ...r, planCumulative: Math.round(r.planCumulative * k) };
  });
  return { rev, baseRev, categoriesAdjusted, radarCategoriesAdjusted, report };
}

function buildSalesStructureRows(
  radarCategoriesAdjusted: ReturnType<typeof buildAdjustedSlices>["radarCategoriesAdjusted"],
  categoriesAdjusted: ReturnType<typeof buildAdjustedSlices>["categoriesAdjusted"],
  rev: { planCumulative: number },
  baseRev: { factCumulative: number },
  report: SalesReportPayload,
) {
  const byId = new Map(radarCategoriesAdjusted.map((r) => [r.id, r]));
  const apt1 = byId.get("apt-1");
  const apt2 = byId.get("apt-2");
  const apt3 = byId.get("apt-3");
  const parking = byId.get("parking-r");
  const storages = byId.get("storage-r");
  const commercial = byId.get("commercial-r");
  const apartmentsTotal = categoriesAdjusted.find((c) => c.id === "apartments");
  const apt4PlanRub = Math.max(
    0,
    (apartmentsTotal?.planCumulative ?? 0) - ((apt1?.planCumulative ?? 0) + (apt2?.planCumulative ?? 0) + (apt3?.planCumulative ?? 0)),
  );
  const apt4FactRub = Math.max(
    0,
    (apartmentsTotal?.factCumulative ?? 0) - ((apt1?.factCumulative ?? 0) + (apt2?.factCumulative ?? 0) + (apt3?.factCumulative ?? 0)),
  );
  const planAvgDealRub = rev.planCumulative / Math.max(1, report.salesData.units.planCumulative);
  const factAvgDealRub = baseRev.factCumulative / Math.max(1, report.salesData.units.factCumulative);
  const toUnits = (rub: number, avg: number) => (avg > 0 ? Math.max(0, Math.round(rub / avg)) : 0);
  const rows = [
    { key: "apt-1", label: "1-комнатные", planRub: apt1?.planCumulative ?? 0, factRub: apt1?.factCumulative ?? 0 },
    { key: "apt-2", label: "2-комнатные", planRub: apt2?.planCumulative ?? 0, factRub: apt2?.factCumulative ?? 0 },
    { key: "apt-3", label: "3-комнатные", planRub: apt3?.planCumulative ?? 0, factRub: apt3?.factCumulative ?? 0 },
    { key: "apt-4", label: "4+ комнатные", planRub: apt4PlanRub, factRub: apt4FactRub },
    { key: "parking", label: "Парковки", planRub: parking?.planCumulative ?? 0, factRub: parking?.factCumulative ?? 0 },
    { key: "storages", label: "Кладовые", planRub: storages?.planCumulative ?? 0, factRub: storages?.factCumulative ?? 0 },
    { key: "commercial", label: "Коммерция", planRub: commercial?.planCumulative ?? 0, factRub: commercial?.factCumulative ?? 0 },
  ];
  return rows.map((row) => {
    const planUnits = toUnits(row.planRub, planAvgDealRub);
    const factUnits = toUnits(row.factRub, factAvgDealRub);
    const pct = planUnits > 0 ? (factUnits / planUnits) * 100 : 0;
    return {
      ...row,
      planUnits,
      factUnits,
      percent: pct,
      deltaUnits: factUnits - planUnits,
      deltaRub: row.factRub - row.planRub,
    };
  });
}

type StructureRowExplain = ReturnType<typeof buildSalesStructureRows>[number];

function buildStructureBalanceRowsFrom(structureRows: StructureRowExplain[]) {
  const totalPlanUnits = structureRows.reduce((s, r) => s + r.planUnits, 0);
  const totalFactUnits = structureRows.reduce((s, r) => s + r.factUnits, 0);
  return structureRows.map((row) => {
    const planShare = totalPlanUnits > 0 ? (row.planUnits / totalPlanUnits) * 100 : 0;
    const factShare = totalFactUnits > 0 ? (row.factUnits / totalFactUnits) * 100 : 0;
    const deltaShare = factShare - planShare;
    return { ...row, planShare, factShare, deltaShare };
  });
}

type StructureBalanceRow = ReturnType<typeof buildStructureBalanceRowsFrom>[number];

export function buildStructureBalanceDiagnosticFrom(balanceRows: StructureBalanceRow[]) {
  const maxDelta = Math.max(1e-9, ...balanceRows.map((r) => Math.abs(r.deltaShare)));
  const axisMaxPp = Math.max(1, Math.ceil(maxDelta));
  const scaleTicks = Array.from({ length: axisMaxPp * 2 + 1 }, (_, i) => -axisMaxPp + i);
  const maxAbsRub = Math.max(1, ...balanceRows.map((r) => Math.abs(r.deltaRub)));
  const sorted = [...balanceRows].sort((a, b) => {
    const da = Math.abs(a.deltaRub);
    const db = Math.abs(b.deltaRub);
    if (db !== da) return db - da;
    return Math.abs(b.deltaShare) - Math.abs(a.deltaShare);
  });
  const negByLoss = [...balanceRows].filter((r) => r.deltaRub < 0).sort((a, b) => a.deltaRub - b.deltaRub);
  const lossRankByKey = new Map(negByLoss.map((r, i) => [r.key, i + 1]));
  const rows = sorted.map((row) => ({
    ...row,
    impactNorm: Math.abs(row.deltaRub) / maxAbsRub,
    lossRank: row.deltaRub < 0 ? (lossRankByKey.get(row.key) ?? null) : null,
  }));
  return { rows, maxDelta, axisMaxPp, scaleTicks, maxAbsRub };
}

export type SalesPlanStructureBalanceDiagnostic = ReturnType<typeof buildStructureBalanceDiagnosticFrom>;

function buildStructureReplacementInsight(balanceRows: StructureBalanceRow[]) {
  const positives = [...balanceRows]
    .filter((r) => r.deltaShare > 0)
    .sort((a, b) => b.deltaRub - a.deltaRub || b.deltaShare - a.deltaShare);
  const negatives = [...balanceRows]
    .filter((r) => r.deltaShare < 0)
    .sort((a, b) => a.deltaRub - b.deltaRub || a.deltaShare - b.deltaShare);
  const topPos = positives.slice(0, 2);
  const topNeg = negatives.slice(0, 2);
  const replacementText =
    topPos.length && topNeg.length
      ? `Рост ${topPos.map((r) => r.label).join(" и ")} происходит за счёт ${topNeg.map((r) => r.label).join(" и ")}.`
      : "Существенных замещений структуры не выявлено.";
  return { topPos, topNeg, replacementText };
}

function buildBalanceExecLines(
  velocityCompletionPct: number,
  balanceRows: StructureBalanceRow[],
  replacement: ReturnType<typeof buildStructureReplacementInsight>,
) {
  const topLoss = [...balanceRows]
    .filter((r) => r.deltaRub < 0)
    .sort((a, b) => a.deltaRub - b.deltaRub)
    .slice(0, 3);
  const negRubTotal = balanceRows.filter((r) => r.deltaRub < 0).reduce((s, r) => s + r.deltaRub, 0);
  const posRubTotal = balanceRows.filter((r) => r.deltaRub > 0).reduce((s, r) => s + r.deltaRub, 0);
  const { topPos, topNeg } = replacement;
  const line1 =
    topLoss.length > 0 ? `Проблема: ${topLoss.map((r) => r.label).join(", ")}.` : "Проблема: без явного отставания по сегментам.";
  const line2 =
    topPos.length && topNeg.length
      ? `Причина: доля ↑ ${topPos.map((r) => r.label).join(", ")} за счёт ↓ ${topNeg.map((r) => r.label).join(", ")}.`
      : "Причина: замещение по модели слабое.";
  const line3 =
    negRubTotal < 0
      ? `Следствие: ${compactRub(negRubTotal)} к выручке, компенсация +${compactRub(posRubTotal)}, темп ${velocityCompletionPct}% к плану.`
      : `Следствие: сальдо по ₽ ≥ 0, темп ${velocityCompletionPct}% к плану.`;
  return { line1, line2, line3 };
}

function seriesToRevenueDeviationPoints(seriesPoints: SalesSeriesPoint[]) {
  return seriesPoints.map((row) => {
    const b = row.revenue;
    return { label: row.label, deviation: b.factCumulative - b.planCumulative };
  });
}

export type SalesPlanRootCauseExplainSnapshot = {
  drivers: { id: string; labelRu: string; impactRub: number }[];
  driversSortedByImpact: { id: string; labelRu: string; impactRub: number }[];
  waterfallRows: { id: string; labelRu: string; impactRub: number; runningStart: number; runningEnd: number }[];
  structureDrilldown: { key: string; label: string; deltaRub: number }[];
  monthIncremental: { label: string; cum: number; incremental: number }[];
  trendRu: string;
  trendDetailRu: string;
  causal: { main: string; secondary: string | null; bridge: string; final: string };
  insight: string;
  wfMin: number;
  wfSpan: number;
};

export function buildRootCauseExplainSnapshot(
  report: SalesReportPayload,
  rev: { deviationCumulative: number },
  structureRows: StructureRowExplain[],
  seriesPoints: SalesSeriesPoint[],
  execLine1: string,
  execLine2: string,
): SalesPlanRootCauseExplainSnapshot {
  const baseDrivers = report.rootCauseWaterfall.drivers;
  const baseSum = baseDrivers.reduce((s, d) => s + d.impactRub, 0);
  const target = rev.deviationCumulative;
  const scale = baseSum !== 0 ? target / baseSum : 1;
  let drivers = baseDrivers.map((d) => ({
    id: d.id,
    labelRu: d.labelRu,
    impactRub: Math.round(d.impactRub * scale),
  }));
  const sumDrivers = () => drivers.reduce((s, d) => s + d.impactRub, 0);
  const drift = target - sumDrivers();
  if (drift !== 0 && drivers.length > 0) {
    let ix = 0;
    drivers.forEach((d, i) => {
      if (Math.abs(d.impactRub) > Math.abs(drivers[ix]!.impactRub)) ix = i;
    });
    drivers = drivers.map((d, i) => (i === ix ? { ...d, impactRub: d.impactRub + drift } : d));
  }
  const driversSortedByImpact = [...drivers].sort((a, b) => Math.abs(b.impactRub) - Math.abs(a.impactRub));
  let run = 0;
  const waterfallRows = drivers.map((d) => {
    const runningStart = run;
    run += d.impactRub;
    return { ...d, runningStart, runningEnd: run };
  });
  const structureDrilldown = [...structureRows]
    .filter((r) => r.deltaRub < 0)
    .sort((a, b) => a.deltaRub - b.deltaRub)
    .slice(0, 4)
    .map((r) => ({ key: r.key, label: r.label, deltaRub: r.deltaRub }));
  const revPts = seriesToRevenueDeviationPoints(seriesPoints);
  const monthIncremental = revPts.map((r, i, arr) => ({
    label: r.label,
    cum: r.deviation,
    incremental: i === 0 ? r.deviation : r.deviation - arr[i - 1]!.deviation,
  }));
  const firstCum = revPts[0]?.deviation ?? 0;
  const lastCum = revPts[revPts.length - 1]?.deviation ?? 0;
  let trendRu = "стабилизируется";
  let trendDetailRu = "Накопление отклонения без экстремального ускорения на горизонте ряда.";
  if (lastCum < firstCum - 12_000_000) {
    trendRu = "углубляется";
    trendDetailRu = "Накопительный недобор по выручке к последнему периоду сильнее, чем в начале ряда.";
  } else if (lastCum > firstCum + 12_000_000) {
    trendRu = "сходится к плану";
    trendDetailRu = "Накопленное отклонение по выручке снижается относительно старта периода.";
  }
  const incs = monthIncremental.map((m) => m.incremental);
  const lastInc = incs[incs.length - 1] ?? 0;
  const firstInc = incs[0] ?? 0;
  if (incs.length >= 2 && lastInc < firstInc - 25_000_000) {
    trendDetailRu += " Добавка к план-факту в последнем периоде заметно слабее первого — темп просел.";
  } else if (incs.length >= 2 && lastInc > firstInc + 25_000_000) {
    trendDetailRu += " Последний период добавляет к выручке больше относительно самого первого.";
  }
  const worst = driversSortedByImpact[0];
  const second = driversSortedByImpact[1];
  const causal = {
    main: worst
      ? `Корневая причина по вкладу: ${worst.labelRu} — ${worst.impactRub >= 0 ? "+" : "−"}${compactRub(Math.abs(worst.impactRub))}.`
      : "Недостаточно данных для выделения главного драйвера.",
    secondary:
      second && worst && second.id !== worst.id
        ? `Вторичный эффект: ${second.labelRu} (${second.impactRub >= 0 ? "+" : "−"}${compactRub(Math.abs(second.impactRub))}).`
        : null,
    bridge: `Мост согласован с блоком «Выполнение структуры продаж»: ${execLine2}`,
    final: `Финальный разрыв к плану: ${rev.deviationCumulative <= 0 ? "−" : "+"}${compactRub(Math.abs(rev.deviationCumulative))} (накопительно).`,
  };
  const insight = `Решение: приоритет — снять ${worst?.labelRu ?? "узкое место"}; ${execLine1}`;
  const wfMin = Math.min(...waterfallRows.flatMap((r) => [r.runningStart, r.runningEnd]));
  const wfMax = Math.max(...waterfallRows.flatMap((r) => [r.runningStart, r.runningEnd]));
  const wfSpan = Math.max(wfMax - wfMin, 1);
  return {
    drivers,
    driversSortedByImpact,
    waterfallRows,
    structureDrilldown,
    monthIncremental,
    trendRu,
    trendDetailRu,
    causal,
    insight,
    wfMin,
    wfSpan,
  };
}

function upsellConvBarColor(fact: number, plan: number) {
  if (plan <= 0) return "#FF4D4F";
  if (fact >= plan) return "#22C55E";
  return "#FF4D4F";
}

/** Расчёт блока upsell (используется и страницей explain из рабочего режима с подменой базы квартир). */
export function analyzeUpsellDiagnostic(up: UpsellDiagnosticModel) {
  const aptF = Math.max(1, up.apartmentDealsFact);
  const aptP = Math.max(1, up.apartmentDealsPlan);
  const benchmarkPctExplicit = up.benchmarkConversionPct;
  const rows = up.categories.map((c) => {
    const revDelta = c.actualRevenueRub - c.planRevenueRub;
    const execPct = c.planRevenueRub > 0 ? (c.actualRevenueRub / c.planRevenueRub) * 100 : 0;
    const convGapPct = c.plannedConversionPct - c.actualConversionPct;
    const planUpsellOrders = (c.plannedConversionPct / 100) * aptP;
    const revPerPlannedUpsell = c.planRevenueRub / Math.max(1, planUpsellOrders);
    const gapConvToPlan = Math.max(0, (c.plannedConversionPct - c.actualConversionPct) / 100);
    const potentialRevFromPlanConv = gapConvToPlan * aptF * revPerPlannedUpsell;
    const gapConvToTarget = Math.max(0, (up.targetConversionPct - c.actualConversionPct) / 100);
    const potentialRevToTarget = gapConvToTarget * aptF * revPerPlannedUpsell;
    const gapConvToBenchmark =
      benchmarkPctExplicit != null ? Math.max(0, (benchmarkPctExplicit - c.actualConversionPct) / 100) : 0;
    const potentialRevToBenchmark = gapConvToBenchmark * aptF * revPerPlannedUpsell;
    const scaledPlanRev = c.planRevenueRub * (aptF / aptP);
    return {
      ...c,
      revDelta,
      execPct,
      convGapPct,
      potentialRevFromPlanConv,
      potentialRevToTarget,
      potentialRevToBenchmark,
      scaledPlanRev,
      revPerPlannedUpsell,
    };
  });
  const totalPlan = rows.reduce((s, r) => s + r.planRevenueRub, 0);
  const totalActual = rows.reduce((s, r) => s + r.actualRevenueRub, 0);
  const totalRevDelta = totalActual - totalPlan;
  const scaledPlanTotal = rows.reduce((s, r) => s + r.scaledPlanRev, 0);
  const volumeRevGap = totalPlan - scaledPlanTotal;
  const conversionRevGap = scaledPlanTotal - totalActual;
  const totalPotentialPlanConv = rows.reduce((s, r) => s + r.potentialRevFromPlanConv, 0);
  const totalPotentialTarget = rows.reduce((s, r) => s + r.potentialRevToTarget, 0);
  const totalPotentialBenchmark = rows.reduce((s, r) => s + r.potentialRevToBenchmark, 0);
  const wRev = totalPlan > 0 ? rows.map((r) => r.planRevenueRub / totalPlan) : rows.map(() => 1 / Math.max(1, rows.length));
  const totalConvPlan = rows.reduce((s, r, i) => s + r.plannedConversionPct * wRev[i]!, 0);
  const totalConvFact = rows.reduce((s, r, i) => s + r.actualConversionPct * wRev[i]!, 0);
  const totalConvDeltaPP = totalConvFact - totalConvPlan;
  const aptExecPct = (aptF / aptP) * 100;
  const volumePenaltyRub = Math.max(0, volumeRevGap);
  const convPenaltyRub = Math.max(0, conversionRevGap);
  const driver: "conversion" | "base" | "mixed" =
    volumePenaltyRub < totalPlan * 0.005 && convPenaltyRub < totalPlan * 0.005
      ? "mixed"
      : convPenaltyRub >= volumePenaltyRub * 1.15
        ? "conversion"
        : volumePenaltyRub >= convPenaltyRub * 1.15
          ? "base"
          : "mixed";

  const worstByConvGap = [...rows].sort((a, b) => b.convGapPct - a.convGapPct)[0];
  const weakConvName = worstByConvGap && worstByConvGap.convGapPct > 0.5 ? worstByConvGap.name : rows[0]?.name ?? "—";
  const weakConvDeltaPP = worstByConvGap?.convGapPct ?? 0;

  const convCompare = rows.map((r) => ({
    name: r.name,
    factConv: Math.round(r.actualConversionPct * 10) / 10,
    planConv: Math.round(r.plannedConversionPct * 10) / 10,
    factPlanLabel: `${dec1.format(r.actualConversionPct)}% (plan ${dec1.format(r.plannedConversionPct)}%)`,
    fill: upsellConvBarColor(r.actualConversionPct, r.plannedConversionPct) || "#FF4D4F",
  }));

  const convChartYMax = Math.min(
    100,
    Math.max(
      50,
      Math.ceil(
        (Math.max(
          ...rows.flatMap((r) => [r.plannedConversionPct, r.actualConversionPct]),
          up.targetConversionPct,
          benchmarkPctExplicit ?? 0,
        ) +
          4) /
          5,
      ) * 5,
    ),
  );

  return {
    rows,
    totalPlan,
    totalActual,
    totalRevDelta,
    scaledPlanTotal,
    volumeRevGap,
    conversionRevGap,
    aptF,
    aptP,
    aptExecPct,
    totalConvPlan,
    totalConvFact,
    totalConvDeltaPP,
    totalPotentialPlanConv,
    totalPotentialTarget,
    totalPotentialBenchmark,
    targetPct: up.targetConversionPct,
    benchmarkPctExplicit,
    driver,
    volumePenaltyRub,
    convPenaltyRub,
    weakConvName,
    weakConvDeltaPP,
    convCompare,
    convChartYMax,
    hasBenchmark: benchmarkPctExplicit != null,
  };
}

export type SalesPlanExplainInteractiveValueKind = "deals" | "rub";

/** Общий идентификатор точки графика и строки пояснения (например период `2026-03` или категория `apt-1`). */
export type SalesPlanExplainInteractivePoint = {
  pointId: string;
  /** Подпись оси X / период в тултипе */
  label: string;
  plan: number;
  fact: number;
  detailLine: string;
};

export type SalesPlanExplainInteractive = {
  valueKind: SalesPlanExplainInteractiveValueKind;
  points: SalesPlanExplainInteractivePoint[];
};

export type SalesPlanDashboardExplainContext = ReturnType<typeof computeSalesPlanDashboardExplainContext>;

export function computeSalesPlanDashboardExplainContext(
  report: SalesReportPayload,
  objectId: string,
  dealTypeId: string,
  period: "month" | "quarter" = "month",
) {
  const cfg = SALES_PLAN_PRESENTATION_EXPLAIN_CHARTS;
  const monthlyPlanExecutionData = buildMonthlyPlanExecution(objectId, dealTypeId);
  const monthKey = periodKeyTodayMonth();
  const currentMonthIdx = (() => {
    const idx = monthlyPlanExecutionData.findIndex((r) => r.periodKey === monthKey);
    return idx >= 0 ? idx : Math.max(0, monthlyPlanExecutionData.length - 1);
  })();
  const totalMonths = Math.max(1, monthlyPlanExecutionData.length);
  const monthsPassed = Math.max(1, Math.min(totalMonths, currentMonthIdx + 1));
  const totalPlanDeals = monthlyPlanExecutionData.reduce((sum, r) => sum + r.plan, 0);
  const currentFact = monthlyPlanExecutionData.slice(0, monthsPassed).reduce((sum, r) => sum + r.fact, 0);
  const monthFact = monthlyPlanExecutionData[Math.max(0, monthsPassed - 1)]?.fact ?? 0;
  const planPerMonth = totalPlanDeals / totalMonths;
  const actualPerMonth = currentFact / monthsPassed;
  const velocityCompletionPct = planPerMonth > 0 ? Math.round((actualPerMonth / planPerMonth) * 100) : 0;
  const sumFact = monthlyPlanExecutionData.reduce((s, r) => s + r.fact, 0);
  const sumPlan = monthlyPlanExecutionData.reduce((s, r) => s + r.plan, 0);
  const ratioSum = sumPlan > 0 ? ((sumFact / sumPlan) * 100).toFixed(1) : "—";

  const { rev, baseRev, categoriesAdjusted, radarCategoriesAdjusted } = buildAdjustedSlices(report);
  const structureRows = buildSalesStructureRows(radarCategoriesAdjusted, categoriesAdjusted, rev, baseRev, report);
  const totalPlanUnits = structureRows.reduce((s, r) => s + r.planUnits, 0);
  const totalFactUnits = structureRows.reduce((s, r) => s + r.factUnits, 0);
  const planAvgDealRub = rev.planCumulative / Math.max(1, report.salesData.units.planCumulative);
  const factAvgDealRub = baseRev.factCumulative / Math.max(1, report.salesData.units.factCumulative);

  const seriesPoints = period === "month" ? report.series.month : report.series.quarter;
  const structureBalanceRows = buildStructureBalanceRowsFrom(structureRows);
  const structureBalanceDiagnostic = buildStructureBalanceDiagnosticFrom(structureBalanceRows);
  const structureReplacement = buildStructureReplacementInsight(structureBalanceRows);
  const balanceExecLines = buildBalanceExecLines(velocityCompletionPct, structureBalanceRows, structureReplacement);
  const rootCauseSnapshot = buildRootCauseExplainSnapshot(
    report,
    rev,
    structureRows,
    seriesPoints,
    balanceExecLines.line1,
    balanceExecLines.line2,
  );

  const up = analyzeUpsellDiagnostic(report.upsellDiagnostic);
  const upsellInteractivePoints: SalesPlanExplainInteractivePoint[] = up.rows.map((r, i) => {
    const w = up.totalPlan > 0 ? r.planRevenueRub / up.totalPlan : 0;
    const detailLine = `${r.name}: план ${compactRub(r.planRevenueRub)}, факт ${compactRub(r.actualRevenueRub)}, Δ ${r.revDelta >= 0 ? "+" : "−"}${compactRub(Math.abs(r.revDelta))}; вес w${i + 1} = ${compactRub(r.planRevenueRub)} / ${compactRub(up.totalPlan)} = ${(w * 100).toFixed(1)}%`;
    return {
      pointId: `upsell-${r.id}`,
      label: r.name,
      plan: r.planRevenueRub,
      fact: r.actualRevenueRub,
      detailLine,
    };
  });

  const filterNote =
    objectId !== "all" || dealTypeId !== "all"
      ? `Фильтры: объект «${objectId}», тип сделки «${dealTypeId}» — ряд план/факт по месяцам берётся из marketingMockData с отбором.`
      : "Фильтры «все объекты / все типы» — полный помесячный ряд из marketingMockData.";

  const tempoInteractivePoints: SalesPlanExplainInteractivePoint[] = monthlyPlanExecutionData.map((r) => ({
    pointId: r.periodKey,
    label: r.label,
    plan: r.plan,
    fact: r.fact,
    detailLine: `${r.label} (${r.periodKey}): plan ${numFmt.format(r.plan)}, fact ${numFmt.format(r.fact)}, Δ ${numFmt.format(r.deviation)}`,
  }));

  const worstStruct = [...structureRows].sort((a, b) => a.deltaRub - b.deltaRub)[0];
  const bestStruct = [...structureRows].sort((a, b) => b.deltaRub - a.deltaRub)[0];

  const structureInteractivePoints: SalesPlanExplainInteractivePoint[] = structureRows.map((r) => ({
    pointId: r.key,
    label: r.label,
    plan: r.planRub,
    fact: r.factRub,
    detailLine: `${r.label}: plan ${compactRub(r.planRub)} → ${r.planUnits} экв.шт.; fact ${compactRub(r.factRub)} → ${r.factUnits} экв.шт.; Δ₽ ${r.deltaRub >= 0 ? "+" : "−"}${compactRub(Math.abs(r.deltaRub))}; выполнение ${r.percent.toFixed(1)}%`,
  }));

  return {
    cfg,
    filterNote,
    objectId,
    dealTypeId,
    period,
    monthlyPlanExecutionData,
    monthKey,
    currentMonthIdx,
    totalMonths,
    monthsPassed,
    totalPlanDeals,
    currentFact,
    monthFact,
    planPerMonth,
    actualPerMonth,
    velocityCompletionPct,
    sumFact,
    sumPlan,
    ratioSum,
    rev,
    baseRev,
    report,
    structureRows,
    totalPlanUnits,
    totalFactUnits,
    planAvgDealRub,
    factAvgDealRub,
    up,
    tempoInteractivePoints,
    structureInteractivePoints,
    upsellInteractivePoints,
    worstStruct,
    bestStruct,
    seriesPoints,
    structureBalanceRows,
    structureBalanceDiagnostic,
    rootCauseSnapshot,
    balanceExecLines,
    structureReplacement,
  };
}

export type SalesPlanChartExplainVariable = { symbol: string; label: string; value?: string };

/** Четыре ячейки описания — как у блока «Ключевые показатели» на странице explain. */
export type ExplainMetricDescription = {
  whatItIs: string;
  purpose: string;
  whyImportant: string;
  howItAffects: string;
};

/** Вводный текст для секции explain «Выполнение структуры продаж — диагностика» (только страница explain). */
export const STRUCTURE_PERFORMANCE_DIAGNOSTICS_INTRO: ExplainMetricDescription = {
  whatItIs:
    "Диаграмма показывает, как фактический микс продаж по линейкам (1к…коммерция) отклоняется от планового микса в долях (п.п.) и какой денежный эффект (Δ ₽) даёт каждая линейка при текущих средних чеках.",
  purpose:
    "Отделить «перекос структуры» от простого недобора по штукам: сегмент может терять долю и одновременно тянуть минус по выручке — или наоборот.",
  whyImportant:
    "Цена, промо и доступность форматов сдвигают микс; без диагностики команда видит только итог по проекту, а не то, какая линейка искажает результат.",
  howItAffects:
    "Решения по продукту, скидкам и приоритету линеек в маркетинге опираются на сочетание Δ доли и Δ ₽: красные зоны — где структура усиливает недобор по деньгам.",
};

/** Вводное описание «Темп продаж» на explain (дашборд): смысл planPerMonth, actualPerMonth, ratio до формул и графиков. */
export const SALES_TEMPO_EXPLAIN_INTRO_DASHBOARD: ExplainMetricDescription = {
  whatItIs:
    "Три опоры блока: planPerMonth — ровная норма в сделках за месяц (суммарный план по горизонту, делённый на число месяцев); actualPerMonth — скользящий средний факт: накопленные сделки с начала периода, делённые на число прошедших месяцев; ratio — исполнение по сумме столбцов: отношение суммы фактов к сумме планов по всему помесячному ряду, в процентах. На экране это пунктир «нормы», цветная линия факта, свод на столбиках и процент «к норме».",
  purpose:
    "Дать единую картину: выдерживаем ли в среднем месячную планку (planPerMonth и actualPerMonth) и закрываем ли год по объёму сделок в сумме по месяцам (ratio), не смешивая это только с картиной одного календарного месяца.",
  whyImportant:
    "Перевыполнение одного месяца не гарантирует год, если actualPerMonth ниже нормы; наоборот, высокий ratio по столбцам при просадке скользящего среднего сигналит о неравномерности. Раздельный смысл planPerMonth, actualPerMonth и ratio снижает риск неверных выводов для руководства.",
  howItAffects:
    "Если actualPerMonth стабильно ниже planPerMonth — усиливают закрытие и промо; если ratio ниже 100% — ищут системный недобор по месяцам; если расходятся линия темпа и свод по столбцам — проверяют провалы в отдельных месяцах и структуру сделок.",
};

/** Вводное описание «Темп продаж» на explain (рабочий снимок таблицы). */
export const SALES_TEMPO_EXPLAIN_INTRO_WORK: ExplainMetricDescription = {
  whatItIs:
    "В рабочем режиме те же идеи выражены через агрегат таблицы: суммарный plan_month и fact_month по строкам задаёт «темп месяца»; накопительные план и факт по категориям — близко к ratio по году на дату снимка. Ровная норма месяца из презентации здесь не восстанавливается из календарного ряда отчёта, но смысл сопоставления факта к суммарному плану и накопительного исполнения совпадает с логикой planPerMonth, actualPerMonth и ratio на слайде.",
  purpose:
    "Понять по черновику таблицы, выдержан ли оперативный месяц по штукам и выручке и как накопленный факт тянет к годовому обязательству, прежде чем переходить к детальным формулам.",
  whyImportant:
    "Снимок sessionStorage может отличаться от отчёта презентации; явное описание метрик помогает не путать сумму по категориям с помесячным рядом отчёта и правильно читать проценты месяца и накопительно.",
  howItAffects:
    "Решения по корректировке плана в таблице и по выравниванию линеек опираются на те же сигналы: недобор месяца, отставание накопительного процента, расхождение штук и рублей между собой.",
};

/** Одна формула в explain «Темп продаж»: карточка в стиле KPI. */
export type ExplainFormulaDetailCard = {
  /** Короткое имя карточки (подзаголовок). */
  name: string;
  /** Связь с рядом графика / зоной explain — подсветка при наведении. */
  metricId?: SalesTempoExplainMetricId;
  formula: string;
  variables: SalesPlanChartExplainVariable[];
  calculation: string;
  whyThisFormula: string;
  interpretation: string;
};

/** Полное пояснение метрики/графика (единая структура для explain). */
export type ExplainMetricContent = {
  title: string;
  /** Если задано — блок с сеткой «Описание» и «Вывод» внизу. Если нет — полоска под графиком в стиле KPI (5 секций). */
  description?: ExplainMetricDescription;
  formulaLines: string[];
  variables: SalesPlanChartExplainVariable[];
  /** Подстановка чисел по текущему срезу */
  calculation: string;
  whyThisResult: string;
  /** Нижний «Вывод» для полного блока (с description). */
  conclusion?: string;
  /** Секция «Интерпретация» для полоски под графиком (без description). */
  interpretation?: string;
  /**
   * Структурные карточки по формулам (explain «Темп продаж»).
   * Если задано без `description`, заменяет общий список формул и агрегированные секции полоски.
   */
  formulaDetailCards?: ExplainFormulaDetailCard[];
  /** Краткий итог под карточками формул (опционально). */
  formulaSectionFooter?: string;
};

/** Блок статьи на странице explain (снимок дашборда или рабочей таблицы). */
export type SalesPlanPresentationExplainBlock = {
  id: SalesPlanPresentationExplainChartId;
  title: string;
  dataSources: string[];
  formulaLines: string[];
  calculationLines: string[];
  howSection: string;
  whySection: string;
  /** Связка «график ↔ строки»: один pointId на столбец и на строку. */
  interactive?: SalesPlanExplainInteractive;
  /** Карточки формул (formula / variables / calculation / reasoning / interpretation) в стиле KPI. */
  formulaDetailCards?: ExplainFormulaDetailCard[];
  formulaSectionFooter?: string;
  /** Сетка «Что это / Для чего / …» в стиле KPI (секция «Темп продаж» на explain). */
  introDescription?: ExplainMetricDescription;
};

export type SalesPlanChartExplainBundle = {
  structurePerformanceDiagnostics: ExplainMetricContent;
  salesTempoLine: ExplainMetricContent;
  salesTempoNorm: ExplainMetricContent;
  factVsPlanDeals: ExplainMetricContent;
  structureFactVsPlanRub: ExplainMetricContent;
  structureBalance: ExplainMetricContent;
  rootCauseDeviation: ExplainMetricContent;
  upsellCategoriesRub: ExplainMetricContent;
  upsellConversion: ExplainMetricContent;
};

export function buildSalesPlanChartExplainBundle(ctx: SalesPlanDashboardExplainContext): SalesPlanChartExplainBundle {
  const {
    objectId,
    dealTypeId,
    totalMonths,
    monthsPassed,
    sumFact,
    sumPlan,
    ratioSum,
    planPerMonth,
    actualPerMonth,
    velocityCompletionPct,
    currentFact,
    monthFact,
    monthlyPlanExecutionData,
    currentMonthIdx,
    rev,
    baseRev,
    structureRows,
    totalPlanUnits,
    totalFactUnits,
    planAvgDealRub,
    factAvgDealRub,
    up,
    structureBalanceDiagnostic,
    structureReplacement,
    rootCauseSnapshot,
    period,
  } = ctx;

  const ex1 = structureRows[0];
  const ex2 = structureRows[1];
  const balTop = structureBalanceDiagnostic.rows[0];
  const worstStruct = [...structureRows].sort((a, b) => a.deltaRub - b.deltaRub)[0];

  const wfFirst = rootCauseSnapshot.waterfallRows[0];
  const wfLastRun = rootCauseSnapshot.waterfallRows[rootCauseSnapshot.waterfallRows.length - 1]?.runningEnd ?? 0;

  const sliceNote =
    objectId !== "all" || dealTypeId !== "all"
      ? "Срез совпадает с фильтрами экрана (объект и тип сделки)."
      : "Срез: все объекты и все типы сделок в отчёте.";

  const perfDiagInterpretation = `${structureReplacement.replacementText} ${sliceNote}`.trim();
  const perfDiagConclusion =
    balTop && balTop.deltaShare < 0 && balTop.deltaRub < 0
      ? `В первую очередь стабилизируйте «${balTop.label}» — снять одновременно минус по доле и по ₽ даст наибольший эффект для выручки при сохранении микса в целом.`
      : "Явного «двойного минуса» (доля и ₽) по лидеру сортировки нет — держите баланс линеек под контролем при дальнейшем росте объёма.";

  const firstMonthRow = monthlyPlanExecutionData[0];
  const reportMonthRow = monthlyPlanExecutionData[Math.max(0, monthsPassed - 1)];
  const factM1 = firstMonthRow?.fact ?? 0;
  const labelM1 = firstMonthRow?.label ?? "—";
  const reportKey = reportMonthRow?.periodKey ?? "—";
  const reportLabel = reportMonthRow?.label ?? "—";
  const planReportMonth = monthlyPlanExecutionData[currentMonthIdx]?.plan ?? 0;

  const reportMonthExecPct = planReportMonth > 0 ? ((monthFact / planReportMonth) * 100).toFixed(1) : "—";
  const monthDeviation = monthFact - planReportMonth;

  const structRubWhy =
    worstStruct && worstStruct.deltaRub < 0
      ? `Наибольший недобор по ₽ в линейке «${worstStruct.label}» (${compactRub(worstStruct.deltaRub)}); это тянет общую картину структуры.`
      : "Явного лидера по отрицательному Δ ₽ в этом срезе нет — структура не задаёт главный минус.";

  const balanceWhy =
    balTop && balTop.deltaShare < 0 && balTop.deltaRub < 0
      ? `Сегмент «${balTop.label}» теряет долю в миксе при отрицательном Δ ₽ — типичный перекос структуры.`
      : "Перекос долей по сегментам не усиливает главный недобор по деньгам либо сальдо по структуре неотрицательное.";

  const rootWhy = `${rootCauseSnapshot.trendRu}: ${rootCauseSnapshot.trendDetailRu} ${rootCauseSnapshot.causal.main}`;

  const upsellRubWhy =
    up.totalRevDelta >= 0
      ? "Суммарная выручка upsell по категориям не хуже суммарного плана в этом срезе."
      : `Суммарный недобор по рублям (${compactRub(up.totalRevDelta)}) согласуется с драйвером «${up.driver}» (база квартир vs конверсия).`;

  const convWhy =
    up.driver === "conversion"
      ? "На масштабе фактической базы квартир недомонетизация upsell в первую очередь объясняется конверсией доп. продаж."
      : up.driver === "base"
        ? "Недобор сделок по квартирам снижает масштаб upsell относительно полного плана в рублях при тех же нормативах конверсии."
        : "И база квартир, и конверсия дают сопоставимый вклад в отклонение upsell.";

  const balSecond = structureBalanceDiagnostic.rows[1];

  return {
    structurePerformanceDiagnostics: {
      title: "Расчёт и смысл показателей",
      formulaLines: [
        "Δ_share_i = fact_share_i − plan_share_i (отклонение доли сегмента в миксе, п.п.).",
        "Оценка денежного следствия: revenue_impact ≈ Δ_share_i × avg_price × volume; в данных проекта итог по линейке задаётся напрямую как Δ₽_i = factRub_i − planRub_i.",
        "Ширина бара на диаграмме: (|Δ_share_i| / max|Δ_share|) × 50% от центра; цвет и подпись отражают знак Δ_share и Δ₽.",
      ],
      variables: [
        {
          symbol: "Сегмент 1",
          label: "лидер по |Δ₽| в этой сортировке",
          value: balTop ? balTop.label : "—",
        },
        {
          symbol: "planShare / factShare",
          label: "доли в миксе экв. шт.",
          value: balTop ? `${balTop.planShare.toFixed(1)}% / ${balTop.factShare.toFixed(1)}%` : "—",
        },
        {
          symbol: "Δ_share",
          label: "сдвиг доли, п.п.",
          value: balTop ? `${balTop.deltaShare >= 0 ? "+" : ""}${balTop.deltaShare.toFixed(1)}` : "—",
        },
        {
          symbol: "Δ₽",
          label: "факт выручки − план по линейке",
          value: balTop ? compactRub(balTop.deltaRub) : "—",
        },
        { symbol: "avg план / факт", label: "средний чек проекта", value: `${compactRub(planAvgDealRub)} / ${compactRub(factAvgDealRub)}` },
        { symbol: "Σ экв. шт.", label: "план / факт по структуре", value: `${numFmt.format(totalPlanUnits)} / ${numFmt.format(totalFactUnits)}` },
      ],
      calculation: balTop
        ? `«${balTop.label}»: planShare ${balTop.planShare.toFixed(1)}%, factShare ${balTop.factShare.toFixed(1)}% → Δ_share ${balTop.deltaShare >= 0 ? "+" : ""}${balTop.deltaShare.toFixed(1)} п.п. Выручка план ${compactRub(balTop.planRub)}, факт ${compactRub(balTop.factRub)} → Δ₽ ${balTop.deltaRub >= 0 ? "+" : "−"}${compactRub(Math.abs(balTop.deltaRub))}. Экв. шт.: план ${balTop.planUnits}, факт ${balTop.factUnits}.${balSecond ? ` Следующий по сортировке: «${balSecond.label}», Δ_share ${balSecond.deltaShare >= 0 ? "+" : ""}${balSecond.deltaShare.toFixed(1)} п.п., Δ₽ ${compactRub(balSecond.deltaRub)}.` : ""} ${sliceNote}`
        : "Нет строк структуры для расчёта.",
      whyThisResult: balanceWhy,
      interpretation: perfDiagInterpretation,
      conclusion: perfDiagConclusion,
    },
    salesTempoLine: {
      title: "Темп по месяцам",
      formulaLines: [],
      variables: [],
      calculation: "",
      whyThisResult: "",
      interpretation: "",
      formulaSectionFooter:
        velocityCompletionPct >= 100
          ? "Итог по линии: скользящий средний темп не ниже ровной нормы — контролируйте провалы по отдельным месяцам, чтобы не сорвать запас."
          : "Итог по линии: скользящий темп ниже нормы — усиливайте закрытие в слабых месяцах на графике «Факт vs план».",
      formulaDetailCards: [
        {
          name: "Суммы плана и факта по помесячному ряду",
          metricId: "sumPlanFact",
          formula: "Σ plan = Σ (план сделок по каждому месяцу горизонта); Σ fact = Σ (факт сделок по каждому месяцу).",
          variables: [
            { symbol: "Σ plan", label: "сумма планов по всем месяцам ряда", value: numFmt.format(sumPlan) },
            { symbol: "Σ fact", label: "сумма фактов по всем месяцам ряда", value: numFmt.format(sumFact) },
            { symbol: "N", label: "число месяцев в горизонте", value: String(totalMonths) },
          ],
          calculation: `По текущему срезу: Σ plan = ${numFmt.format(sumPlan)} сделок, Σ fact = ${numFmt.format(sumFact)} сделок (сумма столбцов помесячного ряда). ${sliceNote}`,
          whyThisFormula:
            "Без сумм по ряду нельзя ни сравнить год в целом, ни вывести равномерную норму месяца и сводный процент выполнения — это база для линии темпа и столбчатого графика.",
          interpretation:
            "Если Σ fact заметно ниже Σ plan, год «в целом» недобирает; отдельные сильные месяцы могут маскировать слабые — смотрите и свод, и помесячные столбцы.",
        },
        {
          name: "Сводное выполнение за горизонт (кумулятив)",
          metricId: "ratio",
          formula: "Выполнение по сумме столбцов (%) = Σ fact / Σ plan × 100%.",
          variables: [
            { symbol: "Σ fact / Σ plan", label: "свод по ряду", value: `${numFmt.format(sumFact)} / ${numFmt.format(sumPlan)}` },
            { symbol: "Свод, %", label: "отношение суммы фактов к сумме планов", value: `${ratioSum}%` },
          ],
          calculation: `Σ fact / Σ plan = ${numFmt.format(sumFact)} / ${numFmt.format(sumPlan)} = ${ratioSum}% — одна цифра «за весь ряд» рядом с анализом темпа. ${sliceNote}`,
          whyThisFormula:
            "Кумулятивный процент показывает, закрываем ли суммарный помесячный план по сделкам за весь горизонт, не усредняя искусственно по времени.",
          interpretation:
            Number(ratioSum) >= 100
              ? "Свод не ниже 100%: суммарный факт по месяцам не проигрывает сумме планов — «штучный» объём года в целом выдержан."
              : `Свод ${ratioSum}%: до полной суммы планов не хватает закрытий по месяцам — это согласуется с линией скользящего темпа, если он ниже нормы.`,
        },
        {
          name: "Норма месяца (ровный темп)",
          metricId: "planPerMonth",
          formula: "planPerMonth = Σ plan / N — сколько сделок в среднем нужно закрывать каждый месяц, чтобы ровно выполнить годовой план.",
          variables: [
            { symbol: "Σ plan", label: "сумма плана по месяцам", value: numFmt.format(sumPlan) },
            { symbol: "N", label: "месяцев в горизонте", value: String(totalMonths) },
            { symbol: "planPerMonth", label: "норма, сделок/мес.", value: dec1.format(planPerMonth) },
          ],
          calculation: `planPerMonth = ${numFmt.format(sumPlan)} / ${totalMonths} = ${dec1.format(planPerMonth)} сделок/мес. На графике это горизонтальная «линия плана». ${sliceNote}`,
          whyThisFormula:
            "Равномерная норма даёт единый ориентир: не «как получилось в одном месяце», а выдерживаем ли средний месячный темп относительно годового обязательства.",
          interpretation:
            "Если фактические месяцы часто ниже этой линии, кривая скользящего темпа обычно окажется под горизонталью — сигнал риска по году.",
        },
        {
          name: "Скользящий фактический темп (actualPerMonth)",
          metricId: "actualPerMonth",
          formula: "actualPerMonth = (накопленный факт с 1-го по k-й месяц) / k, где k — число прошедших месяцев для отчётной даты.",
          variables: [
            { symbol: "k", label: "прошедших месяцев", value: String(monthsPassed) },
            { symbol: "Накопл. факт", label: "сумма фактов с начала года по отчётный месяц", value: numFmt.format(currentFact) },
            { symbol: "actualPerMonth", label: "скользящий средний факт", value: dec1.format(actualPerMonth) },
          ],
          calculation: `На ${reportLabel} (${reportKey}): накоплено ${numFmt.format(currentFact)} сделок за ${monthsPassed} мес. → actualPerMonth = ${numFmt.format(currentFact)} / ${monthsPassed} = ${dec1.format(actualPerMonth)} сделок/мес. Для сравнения, в ${labelM1} за 1-й месяц: ${numFmt.format(factM1)} сделок → ${dec1.format(factM1)} сделок/мес. ${sliceNote}`,
          whyThisFormula:
            "Скользящее среднее снимает шум одного месяца: видно, тянет ли текущий накопленный результат равномерную норму, а не только всплеск или провал последних недель.",
          interpretation:
            actualPerMonth >= planPerMonth * 0.995
              ? "Скользящий факт у нормы или выше — линия на графике держится у горизонтали плана."
              : "Скользящий факт ниже planPerMonth — линия «факта» ниже горизонтали; без ускорения закрытия годовой план по сделкам под угрозой.",
        },
      ],
    },
    salesTempoNorm: {
      title: "Темп к норме",
      formulaLines: [],
      variables: [],
      calculation: "",
      whyThisResult: "",
      interpretation: "",
      formulaSectionFooter:
        velocityCompletionPct >= 100
          ? "Итог: индикатор не ниже 100% к норме — сохраняйте темп закрытия."
          : `Итог: индикатор ${velocityCompletionPct}% к норме — приоритет на догон по месяцам с отставанием.`,
      formulaDetailCards: [
        {
          name: "Индикатор «темп к норме»",
          metricId: "tempoNorm",
          formula: "Темп к норме (%) = actualPerMonth / planPerMonth * 100% (в карточке — округление до целого процента).",
          variables: [
            { symbol: "actualPerMonth", label: "скользящий факт, сделок/мес.", value: dec1.format(actualPerMonth) },
            { symbol: "planPerMonth", label: "ровная норма, сделок/мес.", value: dec1.format(planPerMonth) },
            { symbol: "% к норме", label: "отношение факта к норме", value: `${velocityCompletionPct}%` },
          ],
          calculation: `${dec1.format(actualPerMonth)} / ${dec1.format(planPerMonth)} * 100% = ${velocityCompletionPct}%. Проверка нормы: ${numFmt.format(sumPlan)} / ${totalMonths} = ${dec1.format(planPerMonth)} сделок/мес.; накопленный факт ${numFmt.format(currentFact)} / ${monthsPassed} = ${dec1.format(actualPerMonth)} сделок/мес. ${sliceNote}`,
          whyThisFormula:
            "Один процент сразу отвечает на вопрос бизнеса: «дотягиваем ли мы в среднем до месячной плановой планки», без ручного деления в уме.",
          interpretation:
            velocityCompletionPct >= 100
              ? "Не ниже 100%: среднемесячный накопленный факт не проигрывает ровной норме — запас или ровное закрытие."
              : `Ниже 100%: средний темп отстаёт от нормы ${dec1.format(planPerMonth)} сделок/мес. — нужен рост закрытий в следующих периодах.`,
        },
      ],
    },
    factVsPlanDeals: {
      title: "Факт vs план по месяцам (сделки)",
      formulaLines: [],
      variables: [],
      calculation: "",
      whyThisResult: "",
      interpretation: "",
      formulaSectionFooter:
        Number(ratioSum) >= 100
          ? "Итог по столбцам: суммарно факт не ниже суммы планов — контролируйте месяцы с минусом, чтобы не потерять запас."
          : `Итог по столбцам: свод ${ratioSum}% — закрывайте отставание в самых слабых месяцах.`,
      formulaDetailCards: [
        {
          name: "Помесячное сравнение (столбцы)",
          metricId: "monthlyCompare",
          formula: "В каждом месяце: рядом показываются факт и план в штуках сделок; отклонение Δ_month = fact_month − plan_month.",
          variables: [
            {
              symbol: "Месяц",
              label: "отчётная метка на графике",
              value: `${monthlyPlanExecutionData[currentMonthIdx]?.label ?? "—"} (${monthlyPlanExecutionData[currentMonthIdx]?.periodKey ?? "—"})`,
            },
            { symbol: "fact_month", label: "факт сделок", value: numFmt.format(monthFact) },
            { symbol: "plan_month", label: "план сделок", value: numFmt.format(planReportMonth) },
            { symbol: "Δ_month", label: "факт − план", value: `${monthDeviation >= 0 ? "+" : "−"}${numFmt.format(Math.abs(monthDeviation))}` },
          ],
          calculation: `Отчётный месяц: факт ${numFmt.format(monthFact)}, план ${numFmt.format(planReportMonth)} → Δ = ${monthDeviation >= 0 ? "+" : "−"}${numFmt.format(Math.abs(monthDeviation))} сделок. ${sliceNote}`,
          whyThisFormula:
            "Помесячное сравнение показывает, где именно «просели» или перевыполнили план, в отличие от скользящего среднего на линии темпа.",
          interpretation:
            monthDeviation >= 0
              ? "В выбранном отчётном месяце факт не ниже плана — локально план по штукам выдержан или перевыполнен."
              : "В отчётном месяце факт ниже плана — это вклад в отставание по году, даже если свод по году ещё зелёный.",
        },
        {
          name: "Месячное выполнение в процентах",
          metricId: "monthlyRatio",
          formula: "Доля месяца (%) = fact_month / plan_month × 100% при plan_month > 0.",
          variables: [
            { symbol: "fact_month", label: "факт", value: numFmt.format(monthFact) },
            { symbol: "plan_month", label: "план", value: numFmt.format(planReportMonth) },
            { symbol: "Месяц, %", label: "факт к плану", value: `${reportMonthExecPct}%` },
          ],
          calculation:
            planReportMonth > 0
              ? `${numFmt.format(monthFact)} / ${numFmt.format(planReportMonth)} × 100% = ${reportMonthExecPct}%. ${sliceNote}`
              : `План месяца = 0 — долю не считаем. ${sliceNote}`,
          whyThisFormula:
            "Процент удобен для бизнеса: быстро видно, «закрыли ли месяц» относительно плановой цифры, не сравнивая большие числа вручную.",
          interpretation:
            planReportMonth <= 0
              ? "План месяца нулевой — ориентируйтесь на абсолютный факт и на соседние месяцы."
              : Number(reportMonthExecPct) >= 100
                ? "Месяц не ниже 100% к плану — оперативный результат по штукам в норме или лучше."
                : `Месяц ${reportMonthExecPct}% к плану — локальный недобор по сделкам в этом календарном месяце.`,
        },
        {
          name: "Свод Σ fact / Σ plan по всему ряду",
          metricId: "ratio",
          formula: "Свод (%) = Σ fact / Σ plan × 100% — отношение сумм по всем месяцам столбчатого графика.",
          variables: [
            { symbol: "Σ fact", label: "сумма фактов", value: numFmt.format(sumFact) },
            { symbol: "Σ plan", label: "сумма планов", value: numFmt.format(sumPlan) },
            { symbol: "Свод, %", label: "исполнение по сумме столбцов", value: `${ratioSum}%` },
          ],
          calculation: `Σ fact / Σ plan = ${numFmt.format(sumFact)} / ${numFmt.format(sumPlan)} = ${ratioSum}%. ${sliceNote}`,
          whyThisFormula:
            "Столбчатый график по месяцам и этот свод отвечают на разные вопросы: «где провалы» vs «что в сумме за год» — оба нужны для решений.",
          interpretation:
            Number(ratioSum) >= 100
              ? "Суммарно по столбцам план по сделкам не проигран — но отдельные слабые месяцы всё равно требуют действий."
              : `Свод ${ratioSum}%: сумма фактов отстаёт от суммы планов — усиливайте закрытие в месяцах с наибольшим отрицательным Δ.`,
        },
        {
          name: "Как читать пару столбцов на графике",
          metricId: "barRead",
          formula: "Два столбца на месяц: план (опорная высота) и факт (фактическое закрытие); визуально сравниваются высоты.",
          variables: [
            { symbol: "Высоты", label: "смысл", value: "факт выше плана — перевыполнение месяца; ниже — недобор по штукам" },
          ],
          calculation: `Для ${monthlyPlanExecutionData[currentMonthIdx]?.label ?? "отчётного месяца"} сопоставьте высоту столбца факта (${numFmt.format(monthFact)}) с планом (${numFmt.format(planReportMonth)}). ${sliceNote}`,
          whyThisFormula:
            "Бар-чарт заточен под быстрый менеджерский взгляд: где план и факт расходятся больше всего — там оперативный фокус.",
          interpretation:
            "Используйте столбцы для тактики (какой месяц «лечить»), а линию темпа — для стратегии года (держим ли средний темп относительно нормы).",
        },
      ],
    },
    structureFactVsPlanRub: {
      title: "Структура продаж (факт vs план, ₽ по линейке)",
      description: {
        whatItIs:
          "Диаграмма по линейкам структуры (1к…коммерция): план и факт в рублях накопительно, с тем же масштабом плана ×1, что в презентации; экв. штуки считаются через средние чеки проекта.",
        purpose: "Понять, какой сегмент тянет или перекрывает выручку относительно плана — деньги, а не только «штуки в абстракции».",
        whyImportant: "Перекос структуры может дать выполнение по штукам при провале по ₽ — сигнал цены, микса и скидок.",
        howItAffects:
          "Продуктовые и ценовые решения по сегментам (квартирография, паркинг, коммерция) проверяются по столбцам Δ и доле линейки в общем плане.",
      },
      formulaLines: [
        "Δ₽_i = factRub_i − planRub_i.",
        "planUnits_i = round(planRub_i / planAvgDeal); factUnits_i = round(factRub_i / factAvgDeal); planAvgDeal = planRevenue_проект / planUnits_проект.",
        "% выполнения по экв. шт. = factUnits_i / planUnits_i × 100 при planUnits_i > 0.",
      ],
      variables: [
        { symbol: "planAvgDeal", label: "средний чек план по проекту", value: compactRub(planAvgDealRub) },
        { symbol: "factAvgDeal", label: "средний чек факт по проекту", value: compactRub(factAvgDealRub) },
        { symbol: "i", label: "линейка структуры (1к…коммерция)" },
      ],
      calculation: ex1
        ? `План выручки проекта (накопит.): ${compactRub(rev.planCumulative)}; факт: ${compactRub(baseRev.factCumulative)}. Пример «${ex1.label}»: plan ${compactRub(ex1.planRub)} → ${ex1.planUnits} экв. шт.; fact ${compactRub(ex1.factRub)} → ${ex1.factUnits} экв. шт.; Δ₽ ${ex1.deltaRub >= 0 ? "+" : "−"}${compactRub(Math.abs(ex1.deltaRub))}. «${ex2?.label ?? "—"}»: Δ₽ ${ex2 ? (ex2.deltaRub >= 0 ? "+" : "−") + compactRub(Math.abs(ex2.deltaRub)) : "—"}. Σ экв. план ${numFmt.format(totalPlanUnits)}, Σ экв. факт ${numFmt.format(totalFactUnits)}.`
        : "Нет строк структуры в срезе.",
      whyThisResult: structRubWhy,
      conclusion: `Суммарный микс в экв. шт.: план ${numFmt.format(totalPlanUnits)} vs факт ${numFmt.format(totalFactUnits)} — сопоставляйте с KPI по выручке и штукам.`,
    },
    structureBalance: {
      title: "Баланс структуры (доли)",
      description: {
        whatItIs:
          "Визуализация отклонения доли сегмента в фактическом миксе относительно планового микса (п.п.) с упорядочиванием по модулю денежного эффекта.",
        purpose: "Отделить «перекос доли» от простого недобора по ₽: сегмент может набирать долю, но нести минус по выручке.",
        whyImportant: "Маркетинг и ценообразование часто сдвигают микс в сторону низкомаржинальных линеек — баланс это показывает.",
        howItAffects:
          "Корректировка промо, ограничение доли дешёвых форматов и усиление «тяжёлых» линеек — ответ на отрицательные ΔShare при отрицательных Δ ₽.",
      },
      formulaLines: [
        "planShare_i = planUnits_i / Σ planUnits × 100%; factShare_i = factUnits_i / Σ factUnits × 100%.",
        "ΔShare_i = factShare_i − planShare_i (п.п.).",
        "Ширина бара от центра на слайде: (|ΔShare_i| / max|ΔShare|) × 50%.",
      ],
      variables: [
        { symbol: "max|ΔShare|", label: "максимум модулей отклонений долей", value: `${structureBalanceDiagnostic.maxDelta.toFixed(2)} п.п.` },
        { symbol: "Δ₽_i", label: "денежный эффект линейки (пример)", value: balTop ? `${balTop.label}: ${compactRub(balTop.deltaRub)}` : "—" },
      ],
      calculation: balTop
        ? `Крупнейший по |Δ ₽| в сортировке баланса: «${balTop.label}» — planShare ${balTop.planShare.toFixed(1)}%, factShare ${balTop.factShare.toFixed(1)}% → ΔShare ${balTop.deltaShare >= 0 ? "+" : ""}${balTop.deltaShare.toFixed(1)} п.п., Δ₽ ${compactRub(balTop.deltaRub)}.`
        : "Нет строк для расчёта баланса.",
      whyThisResult: balanceWhy,
      conclusion:
        balTop && balTop.deltaShare < 0 && balTop.deltaRub < 0
          ? `Приоритет: снять давление с «${balTop.label}» в миксе и компенсировать ₽ через целевые линейки.`
          : "Существенного перекоса долей с усилением недобора по ₽ в этом срезе нет.",
    },
    rootCauseDeviation: {
      title: "Разложение отклонения (водопад драйверов)",
      description: {
        whatItIs:
          "Водопад разложения накопительного отклонения выручки (факт − план) на драйверы из отчёта; шаги масштабируются к фактическому deviationCumulative.",
        purpose: "Связать итоговый разрыв по деньгам с управляемыми причинами (структура, конверсия, база и т.д.), а не только с таблицей.",
        whyImportant: "Без разложения команда видит «минус», но не знает, какой рычаг тянуть первым.",
        howItAffects:
          "Приоритизация инициатив (продукт, продажи, финансы) опирается на вклад драйверов в ₽ и согласование со структурой линеек.",
      },
      formulaLines: [
        "Δ выручки (накопит.) = factCumulative − planCumulative.",
        "impact_i' = round(impact_i × (Δ / Σ impact_base)); runningEnd_i = runningStart_i + impact_i'.",
        "Дрейф округления переносится в шаг с максимальным |impact|.",
      ],
      variables: [
        { symbol: "deviationCumulative", label: "накопительное отклонение выручки", value: compactRub(rev.deviationCumulative) },
        { symbol: "ряд тренда", label: "периодичность ряда для накопления", value: period === "month" ? "месяц" : "квартал" },
      ],
      calculation: wfFirst
        ? `Шаг 1: «${wfFirst.labelRu}», вклад ${wfFirst.impactRub >= 0 ? "+" : "−"}${compactRub(Math.abs(wfFirst.impactRub))}; накопление после шага: ${compactRub(wfFirst.runningEnd)}. После всех шагов: ${compactRub(wfLastRun)} (свод к Δ ${compactRub(rev.deviationCumulative)}).`
        : "В отчёте нет драйверов водопада.",
      whyThisResult: rootWhy,
      conclusion: rootCauseSnapshot.insight,
    },
    upsellCategoriesRub: {
      title: "Upsell: выручка по категориям (факт vs план)",
      description: {
        whatItIs:
          "Столбцы факт vs план по выручке доп. продаж (паркинг, кладовые и т.д.) в рублях; те же поля, что в upsellDiagnostic презентации.",
        purpose: "Увидеть, какая категория upsell недобирает или перекрывает план в деньгах при текущей базе квартир.",
        whyImportant: "Upsell часто критичен для маржи проекта при ограниченном объёме квартир.",
        howItAffects:
          "Скрипты продаж, пакеты и цены на паркинг/кладовые настраиваются по категориям с наибольшим отрицательным Δ ₽.",
      },
      formulaLines: [
        "w_i = planRevenueRub_i / Σ planRevenueRub — вес категории в плане upsell.",
        "Δ_i = actualRevenueRub_i − planRevenueRub_i — отклонение по категории в ₽.",
      ],
      variables: [
        { symbol: "aptF, aptP", label: "факт / план сделок по квартирам (база)", value: `${numFmt.format(up.aptF)} / ${numFmt.format(up.aptP)}` },
        { symbol: "Σ plan upsell", label: "сумма плановой выручки upsell", value: compactRub(up.totalPlan) },
      ],
      calculation: up.rows[0]
        ? `Пример категории «${up.rows[0].name}»: план ${compactRub(up.rows[0].planRevenueRub)}, факт ${compactRub(up.rows[0].actualRevenueRub)}, Δ ${up.rows[0].revDelta >= 0 ? "+" : "−"}${compactRub(Math.abs(up.rows[0].revDelta))}. Суммарно по upsell: факт ${compactRub(up.totalActual)} vs план ${compactRub(up.totalPlan)}.`
        : "Нет категорий upsell в данных.",
      whyThisResult: upsellRubWhy,
      conclusion:
        up.totalRevDelta >= 0
          ? `Суммарно upsell не хуже плана на ${compactRub(up.totalRevDelta)} — фиксируйте лучшие практики по категориям-лидерам.`
          : `Суммарный недобор ${compactRub(up.totalRevDelta)} — усиливайте категории с наибольшим минусом и проверьте конверсию ниже.`,
    },
    upsellConversion: {
      title: "Конверсия upsell (план vs факт, %)",
      description: {
        whatItIs:
          "Столбиковый график: плановая и фактическая конверсия доп. продаж к сделкам по квартирам по каждой категории; сводные проценты — взвешенное среднее по w_i из плана выручки upsell.",
        purpose: "Понять, «дожимается» ли доля доп. продаж от каждой квартиры относительно норматива, а не только рубли.",
        whyImportant: "Высокий объём квартир при низкой конверсии upsell оставляет деньги на столе даже при норме по штукам.",
        howItAffects:
          "Обучение менеджеров, обязательные допы в ДДУ и контроль воронки касаются именно конверсии; график показывает разрыв по категориям.",
      },
      formulaLines: [
        "Сводная конверсия (план) = Σ (plannedConversionPct_i × w_i).",
        "Сводная конверсия (факт) = Σ (actualConversionPct_i × w_i).",
        "Δ конверсии (п.п.) = факт − план по сводной метрике.",
      ],
      variables: [
        { symbol: "w_i", label: "доля плановой выручки категории в Σ план upsell" },
        { symbol: "Сводный план", label: "взвешенное плановое %", value: `${dec1.format(up.totalConvPlan)}%` },
        { symbol: "Сводный факт", label: "взвешенное фактическое %", value: `${dec1.format(up.totalConvFact)}%` },
      ],
      calculation: `Слабейшее звено по разрыву к плановой конверсии: «${up.weakConvName}», разрыв ≈ ${dec1.format(Math.max(0, up.weakConvDeltaPP))} п.п. Сводная конверсия: ${dec1.format(up.totalConvFact)}% (факт) vs ${dec1.format(up.totalConvPlan)}% (план), Δ ${up.totalConvDeltaPP >= 0 ? "+" : ""}${dec1.format(up.totalConvDeltaPP)} п.п. Ось графика в презентации до 60%; расчётный max для ряда = ${up.convChartYMax}%.`,
      whyThisResult: convWhy,
      conclusion: `Фокус: довести сводную конверсию с ${dec1.format(up.totalConvFact)}% к плану ${dec1.format(up.totalConvPlan)}% — начиная с «${up.weakConvName}».`,
    },
  };
}

export function buildSalesPlanPresentationExplainBlocks(
  report: SalesReportPayload,
  objectId: string,
  dealTypeId: string,
  period: "month" | "quarter" = "month",
): SalesPlanPresentationExplainBlock[] {
  const ctx = computeSalesPlanDashboardExplainContext(report, objectId, dealTypeId, period);
  const {
    cfg,
    totalMonths,
    monthsPassed,
    sumFact,
    sumPlan,
    ratioSum,
    planPerMonth,
    actualPerMonth,
    velocityCompletionPct,
    currentFact,
    monthFact,
    monthlyPlanExecutionData,
    currentMonthIdx,
    rev,
    baseRev,
    report: rep,
    structureRows,
    totalPlanUnits,
    totalFactUnits,
    planAvgDealRub,
    factAvgDealRub,
    up,
    tempoInteractivePoints,
    structureInteractivePoints,
    upsellInteractivePoints,
    worstStruct,
    bestStruct,
    rootCauseSnapshot,
  } = ctx;

  const sliceNoteBlock =
    objectId !== "all" || dealTypeId !== "all"
      ? "Срез совпадает с фильтрами экрана (объект и тип сделки)."
      : "Срез: все объекты и все типы сделок.";

  const salesTempo: SalesPlanPresentationExplainBlock = {
    id: "salesTempo",
    title: "Темп продаж",
    dataSources: [
      sliceNoteBlock,
      "Помесячные план и факт по числу сделок — из данных отчёта (как в презентации), с теми же фильтрами объекта и типа сделки, что на странице explain.",
    ],
    introDescription: SALES_TEMPO_EXPLAIN_INTRO_DASHBOARD,
    formulaLines: [],
    interactive: { valueKind: "deals", points: tempoInteractivePoints },
    calculationLines: [
      sliceNoteBlock,
      `Горизонт плана: ${totalMonths} мес.; в расчёте темпа учтено ${monthsPassed} прошедших месяц(ев).`,
      `Суммарный план по сделкам: ${numFmt.format(sumPlan)}; накопленный факт на дату отчёта: ${numFmt.format(currentFact)}.`,
      `Ровная норма: ${dec1.format(planPerMonth)} сделок/мес.; скользящий средний факт: ${dec1.format(actualPerMonth)} сделок/мес.; к норме: ${velocityCompletionPct}%.`,
      `Отчётный месяц: факт ${numFmt.format(monthFact)}, план ${numFmt.format(monthlyPlanExecutionData[currentMonthIdx]?.plan ?? 0)} (${monthlyPlanExecutionData[currentMonthIdx]?.periodKey ?? "—"}).`,
      `Свод по столбцам года: ${numFmt.format(sumFact)} к ${numFmt.format(sumPlan)} → ${ratioSum}% к сумме планов.`,
    ],
    howSection:
      "Слева — линия темпа по месяцам (ровная норма из годового плана и скользящий средний факт) и блок «темп к норме» под графиком. Справа — помесячное сравнение факта и плана по числу сделок. Под каждым графиком — пояснение в той же структуре, что у KPI.",
    whySection:
      velocityCompletionPct >= 100
        ? `Скользящий темп держит норму (${velocityCompletionPct}%): накопленный факт за ${monthsPassed} мес. не отстаёт от равномерного плана.`
        : velocityCompletionPct >= 92
          ? `Темп близок к норме (${velocityCompletionPct}%): недобор умеренный; слабые месяцы видны на столбцах справа.`
          : `Темп ниже нормы (${velocityCompletionPct}%): при среднем ${dec1.format(actualPerMonth)} сделок/мес. вы не дотягиваете до ровной нормы ${dec1.format(planPerMonth)} сделок/мес. — без ускорения закрытия годовой план по сделкам под угрозой.`,
  };

  const structure: SalesPlanPresentationExplainBlock = {
    id: "structure",
    title: "Структура продаж",
    dataSources: cfg.structure.sources,
    formulaLines: cfg.structure.formulas,
    interactive: { valueKind: "rub", points: structureInteractivePoints },
    calculationLines: [
      `План выручки проекта (накопит., сценарий ×1): ${compactRub(rev.planCumulative)}; факт выручки: ${compactRub(baseRev.factCumulative)}.`,
      `Средний чек план: planRevenue/planUnits = ${compactRub(rev.planCumulative)} / ${numFmt.format(rep.salesData.units.planCumulative)} = ${compactRub(planAvgDealRub)}.`,
      `Средний чек факт: ${compactRub(baseRev.factCumulative)} / ${numFmt.format(rep.salesData.units.factCumulative)} = ${compactRub(factAvgDealRub)}.`,
      `Σ planUnits (экв.) = ${numFmt.format(totalPlanUnits)}; Σ factUnits = ${numFmt.format(totalFactUnits)}.`,
    ],
    howSection:
      "Таблица «Выполнение структуры» и баланс долей используют выручку по линейкам радара (с корректировкой планов по сценарию) и перевод в эквивалент штук через средние чеки плана и факта по проекту. Так сопоставляются микс сделок и деньги.",
    whySection:
      worstStruct && worstStruct.deltaRub < 0
        ? `Наибольший недобор по деньгам: «${worstStruct.label}» (${compactRub(worstStruct.deltaRub)}). ${
            bestStruct && bestStruct.deltaRub > 0
              ? `Компенсирующий перекос: «${bestStruct.label}» (+${compactRub(bestStruct.deltaRub)}).`
              : "Явной компенсации по другим линейкам в данных меньше."
          } Это объясняет сообщения блока о перекосе структуры.`
        : "По категориям нет выраженного отрицательного Δ ₽ — структура не даёт главного недобора в этом срезе.",
  };

  const rootCauseDeviation: SalesPlanPresentationExplainBlock = {
    id: "rootCauseDeviation",
    title: "Разложение отклонения",
    dataSources: cfg.rootCauseDeviation.sources,
    formulaLines: cfg.rootCauseDeviation.formulas,
    calculationLines: [
      `Целевое накопительное отклонение выручки (факт − план): ${compactRub(rev.deviationCumulative)}.`,
      ...rootCauseSnapshot.waterfallRows.map(
        (w) =>
          `${w.labelRu}: вклад ${w.impactRub >= 0 ? "+" : "−"}${compactRub(Math.abs(w.impactRub))} → после шага ${w.runningEnd <= 0 ? "−" : "+"}${compactRub(Math.abs(w.runningEnd))}.`,
      ),
      rootCauseSnapshot.causal.final,
      `Тренд по ряду (${period}): ${rootCauseSnapshot.trendRu} — ${rootCauseSnapshot.trendDetailRu}`,
    ],
    howSection:
      "Водопад строится из драйверов отчёта: каждый столбец — вклад в ₽ к накопительному отклонению выручки. Сумма масштабируется к фактическому deviationCumulative; дрейф округления убирается в шаг с максимальным |вклад|. Топ структуры по отрицательным Δ ₽ совпадает с блоком структуры.",
    whySection: `${rootCauseSnapshot.causal.main} ${rootCauseSnapshot.causal.secondary ?? ""} ${rootCauseSnapshot.causal.bridge}`.trim(),
  };

  const upsell: SalesPlanPresentationExplainBlock = {
    id: "upsell",
    title: "Конверсия · монетизация (upsell)",
    dataSources: cfg.upsell.sources,
    formulaLines: cfg.upsell.formulas,
    interactive: { valueKind: "rub", points: upsellInteractivePoints },
    calculationLines: [
      `База квартир: факт ${numFmt.format(up.aptF)} / план ${numFmt.format(up.aptP)} → выполнение базы ${up.aptExecPct.toFixed(1)}%.`,
      `Сумма плановой выручки upsell: ${compactRub(up.totalPlan)}; факт: ${compactRub(up.totalActual)}; Δ = ${up.totalRevDelta >= 0 ? "+" : "−"}${compactRub(Math.abs(up.totalRevDelta))}.`,
      `Сводная конверсия (план): ${dec1.format(up.totalConvPlan)}% = Σ (план_конверсия_i × w_i).`,
      `Сводная конверсия (факт): ${dec1.format(up.totalConvFact)}% = Σ (факт_конверсия_i × w_i).`,
      `Разница: ${up.totalConvDeltaPP >= 0 ? "+" : ""}${dec1.format(up.totalConvDeltaPP)} п.п.`,
      `Масштаб плана под фактическую базу: Σ scaledPlanRev = ${compactRub(up.scaledPlanTotal)} (план upsell × aptF/aptP).`,
      `Недобор базы (к полному плану upsell): ${compactRub(up.volumePenaltyRub)}; недобор конверсии на этой базе: ${compactRub(up.convPenaltyRub)}.`,
      `Потенциал до плановой конверсии на текущей базе: до ${compactRub(up.totalPotentialPlanConv)}.`,
    ],
    howSection:
      "Конверсии upsell считаются к сделкам по квартирам: плановая и фактическая доля доп. продаж. Сводные проценты — взвешенное среднее по доле плановой выручки каждой категории (паркинг / кладовые). Выручка и Δ сравниваются с планом в рублях.",
    whySection:
      up.driver === "base"
        ? `Главный эффект сейчас от базы: недобор квартир (${numFmt.format(up.aptF)} / ${numFmt.format(up.aptP)}) снижает «естественный» масштаб upsell примерно на ${compactRub(up.volumePenaltyRub)} относительно полного плана.`
        : up.driver === "conversion"
          ? `Главный эффект — конверсия: на масштабированной базе ожидалось около ${compactRub(up.scaledPlanTotal)}, факт ${compactRub(up.totalActual)}; разрыв конверсии ≈ ${compactRub(up.convPenaltyRub)}.`
          : `База и конверсия дают сопоставимый вклад: недобор базы ~${compactRub(up.volumePenaltyRub)}, недобор конверсии ~${compactRub(up.convPenaltyRub)}.`,
  };

  return [salesTempo, structure, rootCauseDeviation, upsell];
}
