import { marketingMockData, mergeSalesPlanFact, filterByObjectAndDealType } from "@/lib/marketingMockData";
import type { SalesCategoryId, SalesReportPayload, UpsellDiagnosticModel } from "@/lib/marketingSalesReportData";
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
  };
}

export type SalesPlanPresentationExplainBlock = {
  id: SalesPlanPresentationExplainChartId;
  title: string;
  dataSources: string[];
  formulaLines: string[];
  calculationLines: string[];
  howSection: string;
  whySection: string;
};

export function buildSalesPlanPresentationExplainBlocks(
  report: SalesReportPayload,
  objectId: string,
  dealTypeId: string,
): SalesPlanPresentationExplainBlock[] {
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

  const up = analyzeUpsellDiagnostic(report.upsellDiagnostic);
  const wLines = up.rows.map((r, i) => {
    const w = up.totalPlan > 0 ? r.planRevenueRub / up.totalPlan : 0;
    return `${r.name}: w${i + 1} = ${compactRub(r.planRevenueRub)} / ${compactRub(up.totalPlan)} = ${(w * 100).toFixed(1)}%`;
  });

  const filterNote =
    objectId !== "all" || dealTypeId !== "all"
      ? `Фильтры: объект «${objectId}», тип сделки «${dealTypeId}» — ряд план/факт по месяцам берётся из marketingMockData с отбором.`
      : "Фильтры «все объекты / все типы» — полный помесячный ряд из marketingMockData.";

  const salesTempo: SalesPlanPresentationExplainBlock = {
    id: "salesTempo",
    title: "Темп продаж",
    dataSources: cfg.salesTempo.sources,
    formulaLines: cfg.salesTempo.formulas,
    calculationLines: [
      filterNote,
      `Горизонт: N = ${totalMonths} мес., учтено прошедших месяцев для факта: ${monthsPassed}.`,
      `Σ plan (deals) = ${numFmt.format(sumPlan)}; Σ fact = ${numFmt.format(sumFact)}; Σfact/Σplan = ${ratioSum}%.`,
      `Норма месяца planPerMonth = Σplan / N = ${numFmt.format(sumPlan)} / ${totalMonths} = ${dec1.format(planPerMonth)} сделок/мес.`,
      `Накопленный факт за прошедшие периоды = ${numFmt.format(currentFact)} → actualPerMonth = ${numFmt.format(currentFact)} / ${monthsPassed} = ${dec1.format(actualPerMonth)} сделок/мес.`,
      `Текущий месяц (отчётная дата): fact_month = ${numFmt.format(monthFact)} (ключ периода ${monthlyPlanExecutionData[currentMonthIdx]?.periodKey ?? "—"}).`,
      `Индикатор карточки: ${dec1.format(actualPerMonth)} / ${dec1.format(planPerMonth)} ≈ ${velocityCompletionPct}% к норме.`,
      ...monthlyPlanExecutionData.map(
        (r) => `${r.label}: plan ${numFmt.format(r.plan)}, fact ${numFmt.format(r.fact)}, Δ ${numFmt.format(r.deviation)}`,
      ),
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

  const worstStruct = [...structureRows].sort((a, b) => a.deltaRub - b.deltaRub)[0];
  const bestStruct = [...structureRows].sort((a, b) => b.deltaRub - a.deltaRub)[0];

  const structure: SalesPlanPresentationExplainBlock = {
    id: "structure",
    title: "Структура продаж",
    dataSources: cfg.structure.sources,
    formulaLines: cfg.structure.formulas,
    calculationLines: [
      `План выручки проекта (накопит., сценарий ×1): ${compactRub(rev.planCumulative)}; факт выручки: ${compactRub(baseRev.factCumulative)}.`,
      `Средний чек план: planRevenue/planUnits = ${compactRub(rev.planCumulative)} / ${numFmt.format(report.salesData.units.planCumulative)} = ${compactRub(planAvgDealRub)}.`,
      `Средний чек факт: ${compactRub(baseRev.factCumulative)} / ${numFmt.format(report.salesData.units.factCumulative)} = ${compactRub(factAvgDealRub)}.`,
      `Σ planUnits (экв.) = ${numFmt.format(totalPlanUnits)}; Σ factUnits = ${numFmt.format(totalFactUnits)}.`,
      ...structureRows.map(
        (r) =>
          `${r.label}: plan ${compactRub(r.planRub)} → ${r.planUnits} экв.шт.; fact ${compactRub(r.factRub)} → ${r.factUnits} экв.шт.; Δ₽ ${r.deltaRub >= 0 ? "+" : "−"}${compactRub(Math.abs(r.deltaRub))}; выполнение ${r.percent.toFixed(1)}%`,
      ),
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

  const upsell: SalesPlanPresentationExplainBlock = {
    id: "upsell",
    title: "Конверсия · монетизация (upsell)",
    dataSources: cfg.upsell.sources,
    formulaLines: cfg.upsell.formulas,
    calculationLines: [
      `База квартир: факт ${numFmt.format(up.aptF)} / план ${numFmt.format(up.aptP)} → выполнение базы ${up.aptExecPct.toFixed(1)}%.`,
      `Сумма плановой выручки upsell: ${compactRub(up.totalPlan)}; факт: ${compactRub(up.totalActual)}; Δ = ${up.totalRevDelta >= 0 ? "+" : "−"}${compactRub(Math.abs(up.totalRevDelta))}.`,
      ...wLines,
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

  return [salesTempo, structure, upsell];
}
