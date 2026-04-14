import { marketingMockData, mergeSalesPlanFact, filterByObjectAndDealType } from "@/lib/marketingMockData";
import type { SalesCategoryId, SalesReportPayload, SalesSeriesPoint, UpsellDiagnosticModel } from "@/lib/marketingSalesReportData";
import { SALES_PLAN_PRESENTATION_EXPLAIN_CHARTS } from "@/lib/salesPlanPresentationExplainConfig";
import type { SalesPlanPresentationExplainChartId } from "@/lib/salesPlanPresentationExplainConfig";

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

export type SalesPlanChartExplainContent = {
  title: string;
  formula: string;
  variables: SalesPlanChartExplainVariable[];
  calculationExample: string;
  interpretation: string;
  conclusion: string;
};

export type SalesPlanChartExplainBundle = {
  salesTempo: SalesPlanChartExplainContent;
  factVsPlanDeals: SalesPlanChartExplainContent;
  structureFactVsPlanRub: SalesPlanChartExplainContent;
  structureBalance: SalesPlanChartExplainContent;
  rootCauseDeviation: SalesPlanChartExplainContent;
  upsellCategoriesRub: SalesPlanChartExplainContent;
  upsellConversion: SalesPlanChartExplainContent;
};

export function buildSalesPlanChartExplainBundle(ctx: SalesPlanDashboardExplainContext): SalesPlanChartExplainBundle {
  const {
    filterNote,
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
    rootCauseSnapshot,
    period,
  } = ctx;

  const ex1 = structureRows[0];
  const ex2 = structureRows[1];
  const balTop = structureBalanceDiagnostic.rows[0];

  const wfFirst = rootCauseSnapshot.waterfallRows[0];
  const wfLastRun = rootCauseSnapshot.waterfallRows[rootCauseSnapshot.waterfallRows.length - 1]?.runningEnd ?? 0;

  return {
    salesTempo: {
      title: "Темп продаж (линия)",
      formula: "T_факт(k) = (Σ fact_1..k) / k; T_план = (Σ plan_1..N) / N; индикатор ≈ T_факт(monthsPassed) / T_план × 100%.",
      variables: [
        { symbol: "N", label: "число месяцев горизонта", value: String(totalMonths) },
        { symbol: "k", label: "число прошедших месяцев для накопленного факта", value: String(monthsPassed) },
        { symbol: "Σ plan", label: "сумма плановых сделок по месяцам", value: `${numFmt.format(sumPlan)}` },
        { symbol: "Σ fact", label: "сумма фактических сделок по всем месяцам ряда", value: `${numFmt.format(sumFact)}` },
      ],
      calculationExample: `${filterNote} Норма месяца: ${numFmt.format(sumPlan)}/${totalMonths} = ${dec1.format(planPerMonth)} сделок/мес. Накопленный факт за ${monthsPassed} мес.: ${numFmt.format(currentFact)} → ${dec1.format(actualPerMonth)} сделок/мес. Индикатор: ${dec1.format(actualPerMonth)}/${dec1.format(planPerMonth)} ≈ ${velocityCompletionPct}%.`,
      interpretation:
        "Линия темпа сравнивает скользящий средний факт по уже прошедшим месяцам с равномерной помесячной нормой из суммарного плана.",
      conclusion:
        velocityCompletionPct >= 100
          ? "Темп не ниже равномерной нормы: средний факт за прошедшие месяцы выдерживает плановый ритм."
          : `Темп ${velocityCompletionPct}% к норме — средний факт ${dec1.format(actualPerMonth)} сделок/мес. относительно нормы ${dec1.format(planPerMonth)} сделок/мес.; проверьте месяцы с отрицательным Δ на столбцах справа.`,
    },
    factVsPlanDeals: {
      title: "Факт vs план (сделки по месяцам)",
      formula: "deviation_month = fact_month − plan_month.",
      variables: [
        { symbol: "fact_month", label: "факт сделок в месяце" },
        { symbol: "plan_month", label: "план сделок в том же месяце" },
      ],
      calculationExample: `Тот же merge marketingMockData, что в презентации. Пример периода ${monthlyPlanExecutionData[currentMonthIdx]?.periodKey ?? "—"}: fact_month = ${numFmt.format(monthFact)}; Σfact/Σplan по всему ряду = ${ratioSum}%.`,
      interpretation: "Каждый столбец — самостоятельное выполнение плана в календарном месяце, без накопления.",
      conclusion:
        Number(ratioSum) >= 100
          ? "Суммарно по горизонту факт сделок не ниже суммы плана — объём закрытия выдержан по штукам."
          : `Сводное отношение Σfact/Σplan = ${ratioSum}% сигнализирует о недоборе по сделкам к сумме помесячных планов.`,
    },
    structureFactVsPlanRub: {
      title: "Структура продаж (факт vs план, ₽ по линейке)",
      formula: "Δ₽_i = factRub_i − planRub_i; planUnits_i = round(planRub_i / planAvgDeal); factUnits_i = round(factRub_i / factAvgDeal); %_i = factUnits_i / planUnits_i × 100 (при planUnits_i > 0).",
      variables: [
        { symbol: "planAvgDeal", label: "средний чек план по проекту", value: compactRub(planAvgDealRub) },
        { symbol: "factAvgDeal", label: "средний чек факт по проекту", value: compactRub(factAvgDealRub) },
        { symbol: "i", label: "линейка структуры (1к…коммерция)" },
      ],
      calculationExample: ex1
        ? `Пример «${ex1.label}»: plan ${compactRub(ex1.planRub)} → ${ex1.planUnits} экв. шт.; fact ${compactRub(ex1.factRub)} → ${ex1.factUnits} экв. шт.; Δ₽ ${ex1.deltaRub >= 0 ? "+" : "−"}${compactRub(Math.abs(ex1.deltaRub))}. Вторая линейка: «${ex2?.label ?? "—"}» — Δ₽ ${ex2 ? (ex2.deltaRub >= 0 ? "+" : "−") + compactRub(Math.abs(ex2.deltaRub)) : "—"}.`
        : "Нет строк структуры.",
      interpretation:
        "Столбцы используют выручку по линейкам радара с тем же масштабом плана (×1), что и в презентации; экв. штуки нужны, чтобы сравнить микс при разных средних чеках.",
      conclusion: `Σ экв. план ${numFmt.format(totalPlanUnits)}, Σ экв. факт ${numFmt.format(totalFactUnits)} — суммарный микс в «штуках плана» и «штуках факта».`,
    },
    structureBalance: {
      title: "Баланс структуры (доли)",
      formula: "planShare_i = planUnits_i / Σ planUnits × 100%; factShare_i = factUnits_i / Σ factUnits × 100%; ΔShare_i = factShare_i − planShare_i (п.п.). Ширина бара на слайде: (|ΔShare_i| / max|ΔShare|)·50% от центра.",
      variables: [
        { symbol: "max|ΔShare|", label: "максимум модулей отклонений долей", value: `${structureBalanceDiagnostic.maxDelta.toFixed(2)} п.п.` },
        { symbol: "Δ₽_i", label: "денежный эффект линейки", value: balTop ? `${balTop.label}: ${compactRub(balTop.deltaRub)}` : "—" },
      ],
      calculationExample: balTop
        ? `Крупнейший вклад по модулю ₽: «${balTop.label}» — planShare ${balTop.planShare.toFixed(1)}%, factShare ${balTop.factShare.toFixed(1)}% → ΔShare ${balTop.deltaShare >= 0 ? "+" : ""}${balTop.deltaShare.toFixed(1)} п.п., Δ₽ ${compactRub(balTop.deltaRub)}.`
        : "Нет данных баланса.",
      interpretation:
        "Баланс показывает, выросла ли доля сегмента в фактическом миксе относительно планового; денежный Δ показывает, усиливает ли это недобор по выручке.",
      conclusion:
        balTop && balTop.deltaShare < 0 && balTop.deltaRub < 0
          ? `Главный «минус» по деньгам среди крупных отклонений доли: «${balTop.label}» — согласуйте действия с блоком структуры в презентации.`
          : "Перекос долей не усиливает главный недобор по ₽ или сальдо неотрицательное.",
    },
    rootCauseDeviation: {
      title: "Разложение отклонения (водопад драйверов)",
      formula: "impact_i' = round(impact_i × (deviationCumulative / Σ impact_base)); runningEnd_i = runningStart_i + impact_i'; подгонка дрейфа в крупнейший по |impact| шаг.",
      variables: [
        { symbol: "deviationCumulative", label: "накопительное отклонение выручки (факт − план)", value: compactRub(rev.deviationCumulative) },
        { symbol: "ряд", label: "периодичность тренда", value: period === "month" ? "месяц" : "квартал" },
      ],
      calculationExample: wfFirst
        ? `Первый шаг водопада: «${wfFirst.labelRu}», вклад ${wfFirst.impactRub >= 0 ? "+" : "−"}${compactRub(Math.abs(wfFirst.impactRub))}; старт ${compactRub(wfFirst.runningStart)} → конец ${compactRub(wfFirst.runningEnd)}. Итоговая кумуляция после всех шагов: ${compactRub(wfLastRun)} (должна совпасть с Δ выручки ${compactRub(rev.deviationCumulative)}).`
        : "Нет драйверов в отчёте.",
      interpretation: `${rootCauseSnapshot.trendRu}: ${rootCauseSnapshot.trendDetailRu} ${rootCauseSnapshot.causal.main}`,
      conclusion: rootCauseSnapshot.insight,
    },
    upsellCategoriesRub: {
      title: "Upsell: выручка по категориям (факт vs план)",
      formula: "w_i = planRevenueRub_i / Σ planRevenueRub; Δ_i = actualRevenueRub_i − planRevenueRub_i.",
      variables: up.rows[0]
        ? [
            { symbol: "aptF, aptP", label: "факт / план сделок по квартирам", value: `${numFmt.format(up.aptF)} / ${numFmt.format(up.aptP)}` },
            { symbol: "Σ plan upsell", label: "сумма плановой выручки upsell", value: compactRub(up.totalPlan) },
          ]
        : [],
      calculationExample: up.rows[0]
        ? `«${up.rows[0].name}»: план ${compactRub(up.rows[0].planRevenueRub)}, факт ${compactRub(up.rows[0].actualRevenueRub)}, Δ ${up.rows[0].revDelta >= 0 ? "+" : "−"}${compactRub(Math.abs(up.rows[0].revDelta))}.`
        : "Нет категорий upsell.",
      interpretation: "Столбцы в ₽ совпадают с презентацией: те же поля upsellDiagnostic и веса для сводной конверсии.",
      conclusion:
        up.totalRevDelta >= 0
          ? `Суммарно upsell не хуже плана на ${compactRub(up.totalRevDelta)}.`
          : `Суммарный недобор upsell: ${compactRub(up.totalRevDelta)} — смотрите драйвер (${up.driver}) и конверсии ниже.`,
    },
    upsellConversion: {
      title: "Конверсия upsell (план vs факт, %)",
      formula: "Сводная конверсия план: Σ (plannedConversionPct_i × w_i); факт: Σ (actualConversionPct_i × w_i); Δ = факт − план (п.п.).",
      variables: [
        { symbol: "w_i", label: "доля плановой выручки категории в Σ план upsell" },
        { symbol: "Сводный план", label: "взвешенное плановое %", value: `${dec1.format(up.totalConvPlan)}%` },
        { symbol: "Сводный факт", label: "взвешенное фактическое %", value: `${dec1.format(up.totalConvFact)}%` },
      ],
      calculationExample: `Слабейшее звено по разрыву к плану: «${up.weakConvName}», разрыв ≈ ${dec1.format(Math.max(0, up.weakConvDeltaPP))} п.п. Ось графика в презентации до 60%; расчётный max для ряда = ${up.convChartYMax}%.`,
      interpretation:
        up.driver === "conversion"
          ? "Главный разрыв между масштабированным планом при плановой конверсии и фактической выручкой — конверсия."
          : up.driver === "base"
            ? "Недобор базы квартир сжимает масштаб upsell относительно полного плана в рублях."
            : "База и конверсия дают сопоставимый эффект — смотрите оба ряда столбиков.",
      conclusion: `Сводная конверсия ${dec1.format(up.totalConvFact)}% при плане ${dec1.format(up.totalConvPlan)}% (${up.totalConvDeltaPP >= 0 ? "+" : ""}${dec1.format(up.totalConvDeltaPP)} п.п.).`,
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
    filterNote,
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

  const salesTempo: SalesPlanPresentationExplainBlock = {
    id: "salesTempo",
    title: "Темп продаж",
    dataSources: cfg.salesTempo.sources,
    formulaLines: cfg.salesTempo.formulas,
    interactive: { valueKind: "deals", points: tempoInteractivePoints },
    calculationLines: [
      filterNote,
      `Горизонт: N = ${totalMonths} мес., учтено прошедших месяцев для факта: ${monthsPassed}.`,
      `Σ plan (deals) = ${numFmt.format(sumPlan)}; Σ fact = ${numFmt.format(sumFact)}; Σfact/Σplan = ${ratioSum}%.`,
      `Норма месяца planPerMonth = Σplan / N = ${numFmt.format(sumPlan)} / ${totalMonths} = ${dec1.format(planPerMonth)} сделок/мес.`,
      `Накопленный факт за прошедшие периоды = ${numFmt.format(currentFact)} → actualPerMonth = ${numFmt.format(currentFact)} / ${monthsPassed} = ${dec1.format(actualPerMonth)} сделок/мес.`,
      `Текущий месяц (отчётная дата): fact_month = ${numFmt.format(monthFact)} (ключ периода ${monthlyPlanExecutionData[currentMonthIdx]?.periodKey ?? "—"}).`,
      `Индикатор карточки: ${dec1.format(actualPerMonth)} / ${dec1.format(planPerMonth)} ≈ ${velocityCompletionPct}% к норме.`,
    ],
    howSection:
      "Графики «Темп по месяцам» и «Факт vs план» строятся из помесячного merge плана и факта сделок (кол-во сделок). Норма месяца — равномерное распределение суммарного плана по горизонту; скользящий факт — среднее по уже прошедшим месяцам. Отдельно показывается факт последнего отчётного месяца к норме.",
    whySection:
      velocityCompletionPct >= 100
        ? `Скользящий темп (${velocityCompletionPct}% к норме) не ниже плана: накопленный факт за ${monthsPassed} мес. выдерживает среднемесячную норму.`
        : velocityCompletionPct >= 92
          ? `Темп близок к норме (${velocityCompletionPct}%): недобор умеренный; по отдельным месяцам смотрите отрицательные Δ — там локальные провалы.`
          : `Темп ниже нормы (${velocityCompletionPct}%): при текущем среднем факте ${dec1.format(actualPerMonth)} сделок/мес. вы не дотягиваете до равномерной нормы ${dec1.format(planPerMonth)} сделок/мес. — риск недобора к концу горизонта.`,
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
