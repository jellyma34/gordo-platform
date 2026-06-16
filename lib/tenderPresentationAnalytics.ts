import {
  hasTenderSignedContract,
  matchesTenderConductedKpiStatusLabel,
  resolveTenderCycleStatus,
  TENDER_CONDUCTED_KPI_CYCLE_STATUSES,
  TENDER_CYCLE_STATUS_COLORS,
  TENDER_CYCLE_STATUS_LABEL,
  tenderStatusDistributionLabel,
  type Tender,
  type TenderCycleStatus,
  type TenderProcurementStatus,
} from "@/lib/tenderData";
import type { KpiDonutSegment } from "@/components/tmc/KpiDonutChart";

export const TENDER_KPI_DONUT_COLORS = {
  conductedOnTime: "#22c55e",
  conductedLate: "#ef4444",
  contractConcluded: "#3b82f6",
  contractNotConcluded: "#6b7280",
  notAnnounced: "#6b7280",
  noApplications: "#f59e0b",
  evaluationIncomplete: "#eab308",
  contractNotAgreed: "#f97316",
  contractNotSigned: "#dc2626",
  overdueOther: "#94a3b8",
  economy: "#22c55e",
  onBudget: "#3b82f6",
  overrun: "#ef4444",
  noFact: "#6b7280",
} as const;

export function parseTenderIsoDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function tenderPlanCostRub(t: Tender): number {
  return t.cost ?? 0;
}

export function tenderFactCostRub(t: Tender): number {
  if (t.factCost != null && Number.isFinite(t.factCost)) return t.factCost;
  if (t.factContractDate?.trim()) return t.cost ?? 0;
  return 0;
}

export function hasTenderBudgetFact(t: Tender): boolean {
  if (t.factCost != null && t.factCost > 0) return true;
  return Boolean(t.factContractDate?.trim()) && tenderPlanCostRub(t) > 0;
}

export function hasTenderContractor(t: Tender): boolean {
  return Boolean(t.contractor?.trim());
}

/** KPI «Проведено»: статус цикла, подпись из CSV/БД, факт начала или подписанный договор. */
export function isTenderConducted(t: Tender): boolean {
  const cycle = resolveTenderCycleStatus(t);
  if (TENDER_CONDUCTED_KPI_CYCLE_STATUSES.has(cycle)) return true;
  if (t.statusLabel && matchesTenderConductedKpiStatusLabel(t.statusLabel)) return true;
  if (t.factStart?.trim()) return true;
  if (hasTenderSignedContract(t)) return true;
  return false;
}

export function isTenderOverdue(t: Tender, today: Date = new Date()): boolean {
  if (hasTenderSignedContract(t)) return false;
  const plan = parseTenderIsoDate(t.planContractDate);
  if (!plan) return false;
  return plan.getTime() < today.getTime();
}

export function isTenderInProgress(t: Tender, today: Date = new Date()): boolean {
  if (hasTenderSignedContract(t)) return false;
  const plan = parseTenderIsoDate(t.planContractDate);
  if (!plan) return false;
  return plan.getTime() >= today.getTime();
}

export type TenderDistribution = {
  conducted: number;
  inProgress: number;
  overdue: number;
  noData: number;
  total: number;
  riskPct: number;
};

export function computeTenderDistribution(tenders: Tender[], today: Date = new Date()): TenderDistribution {
  let conducted = 0;
  let inProgress = 0;
  let overdue = 0;
  let noData = 0;
  for (const t of tenders) {
    const plan = parseTenderIsoDate(t.planContractDate);
    const fact = parseTenderIsoDate(t.factContractDate);
    if (fact) conducted += 1;
    else if (!plan) noData += 1;
    else if (plan.getTime() < today.getTime()) overdue += 1;
    else inProgress += 1;
  }
  const total = tenders.length;
  const riskScore = total > 0 ? (overdue * 1 + inProgress * 0.5) / total : 0;
  const riskPct = Math.round(riskScore * 100);
  return { conducted, inProgress, overdue, noData, total, riskPct };
}

export type TenderProcurementKpi = {
  conductedCount: number;
  totalCount: number;
  conductedPlanRub: number;
  conductedFactRub: number;
  /** Σ planCost по всем тендерам реестра. */
  totalPlanRub: number;
  /** Σ factCost проведённых / N проведённых; 0 если проведённых нет. */
  conductedAvgCheckRub: number;
  /** Σ factCost проведённых / Σ planCost всех тендеров × 100, %. */
  totalVolumeExecutionPct: number;
  overdueCount: number;
  /** Σ planCost просроченных тендеров. */
  overduePlanRub: number;
  /** Σ planCost просроченных / N просроченных; 0 если просроченных нет. */
  overdueAvgCheckRub: number;
  /** Σ planCost просроченных / Σ planCost всех тендеров × 100, %. */
  overdueVolumeSharePct: number;
};

export function computeTenderProcurementKpi(
  tenders: Tender[],
  today: Date = new Date(),
): TenderProcurementKpi {
  const dist = computeTenderDistribution(tenders, today);
  let conductedCount = 0;
  let conductedPlanRub = 0;
  let conductedFactRub = 0;
  let totalPlanRub = 0;
  let overduePlanRub = 0;

  for (const t of tenders) {
    const plan = tenderPlanCostRub(t);
    const fact = tenderFactCostRub(t);
    totalPlanRub += plan;
    if (isTenderConducted(t)) {
      conductedCount += 1;
      conductedPlanRub += plan;
      conductedFactRub += fact > 0 ? fact : plan;
    }
    if (isTenderOverdue(t, today)) {
      overduePlanRub += plan;
    }
  }

  const conductedAvgCheckRub =
    conductedCount > 0 ? conductedFactRub / conductedCount : 0;
  const totalVolumeExecutionPct =
    totalPlanRub > 0
      ? Math.round((conductedFactRub / totalPlanRub) * 1000) / 10
      : 0;
  const overdueAvgCheckRub =
    dist.overdue > 0 ? overduePlanRub / dist.overdue : 0;
  const overdueVolumeSharePct =
    totalPlanRub > 0
      ? Math.round((overduePlanRub / totalPlanRub) * 1000) / 10
      : 0;

  return {
    conductedCount,
    totalCount: dist.total,
    conductedPlanRub,
    conductedFactRub,
    totalPlanRub,
    conductedAvgCheckRub,
    totalVolumeExecutionPct,
    overdueCount: dist.overdue,
    overduePlanRub,
    overdueAvgCheckRub,
    overdueVolumeSharePct,
  };
}

export type TenderOverdueReasonBucket =
  | "notAnnounced"
  | "noApplications"
  | "evaluationIncomplete"
  | "contractNotAgreed"
  | "contractNotSigned"
  | "overdueOther";

function tenderStatus(t: Tender): TenderProcurementStatus | undefined {
  return t.status;
}

/**
 * Взаимоисключающая причина просрочки (план договора прошёл, факта нет).
 * Приоритет: не объявлен → нет заявок → оценка → согласование → подписание → прочее.
 */
export function classifyTenderOverdueReasonBucket(
  t: Tender,
  today: Date = new Date(),
): TenderOverdueReasonBucket | null {
  if (!isTenderOverdue(t, today)) return null;

  const factStart = t.factStart?.trim();
  const contractor = hasTenderContractor(t);
  const status = tenderStatus(t);

  if (!factStart) return "notAnnounced";
  if (!contractor) {
    if (status === "in_progress" || status === "delayed") return "evaluationIncomplete";
    return "noApplications";
  }
  if (status === "completed" || status === "delayed") return "contractNotSigned";
  if (status === "in_progress" || status === "planned") return "contractNotAgreed";
  return "overdueOther";
}

export const TENDER_BUDGET_ON_PLAN_TOLERANCE_PCT = 3;

export type TenderBudgetBucket = "economy" | "onBudget" | "overrun" | "noFact";

export function tenderItemBudgetDeviationPct(t: Tender): number | null {
  if (!hasTenderBudgetFact(t)) return null;
  const plan = tenderPlanCostRub(t);
  const fact = tenderFactCostRub(t);
  if (plan <= 0) return fact > 0 ? 100 : 0;
  return Math.round(((fact - plan) / plan) * 1000) / 10;
}

export function classifyTenderBudgetBucket(t: Tender): TenderBudgetBucket | null {
  if (tenderPlanCostRub(t) <= 0 && !hasTenderBudgetFact(t)) return null;
  if (!hasTenderBudgetFact(t)) return "noFact";

  const deviationPct = tenderItemBudgetDeviationPct(t);
  if (deviationPct === null) return "noFact";
  if (Math.abs(deviationPct) <= TENDER_BUDGET_ON_PLAN_TOLERANCE_PCT) return "onBudget";
  if (deviationPct < 0) return "economy";
  return "overrun";
}

export type TenderBudgetFinancialResult = {
  economyRub: number;
  overrunRub: number;
  balanceRub: number;
  concludedPlanRub: number;
  concludedFactRub: number;
  deviationRub: number;
  deviationPct: number;
};

export function computeTenderBudgetFinancialResult(tenders: Tender[]): TenderBudgetFinancialResult {
  let economyRub = 0;
  let overrunRub = 0;
  let concludedPlanRub = 0;

  for (const t of tenders) {
    if (!hasTenderBudgetFact(t)) continue;
    const plan = tenderPlanCostRub(t);
    const fact = tenderFactCostRub(t);
    concludedPlanRub += plan;
    economyRub += Math.max(plan - fact, 0);
    overrunRub += Math.max(fact - plan, 0);
  }

  const concludedFactRub = concludedPlanRub - economyRub + overrunRub;
  const deviationRub = concludedFactRub - concludedPlanRub;
  const deviationPct =
    concludedPlanRub > 0 ? Math.round((deviationRub / concludedPlanRub) * 1000) / 10 : 0;

  return {
    economyRub,
    overrunRub,
    balanceRub: economyRub - overrunRub,
    concludedPlanRub,
    concludedFactRub,
    deviationRub,
    deviationPct,
  };
}

export type TenderKpiDonutDistributions = {
  conductedPipeline: KpiDonutSegment[];
  overdueReasons: KpiDonutSegment[];
  budgetDeviation: KpiDonutSegment[];
  /** Общее количество тендеров реестра — единая база для KPI donut. */
  totalTenders: number;
  /** Тендеры, попавшие в блок «Отклонение от тендерного бюджета». */
  budgetBlockTenderCount: number;
};

const CONDUCTED_PIPELINE_CYCLE_STATUSES: TenderCycleStatus[] = [
  "conducted",
  "contractSigned",
  "contractNotConcluded",
];

const OVERDUE_REASON_LABELS: Record<TenderOverdueReasonBucket, string> = {
  notAnnounced: "Не объявлен тендер",
  noApplications: "Нет заявок",
  evaluationIncomplete: "Не завершена оценка",
  contractNotAgreed: "Не согласован договор",
  contractNotSigned: "Не подписан договор",
  overdueOther: "Прочее",
};

const OVERDUE_REASON_COLORS: Record<TenderOverdueReasonBucket, string> = {
  notAnnounced: TENDER_KPI_DONUT_COLORS.notAnnounced,
  noApplications: TENDER_KPI_DONUT_COLORS.noApplications,
  evaluationIncomplete: TENDER_KPI_DONUT_COLORS.evaluationIncomplete,
  contractNotAgreed: TENDER_KPI_DONUT_COLORS.contractNotAgreed,
  contractNotSigned: TENDER_KPI_DONUT_COLORS.contractNotSigned,
  overdueOther: TENDER_KPI_DONUT_COLORS.overdueOther,
};

const BUDGET_LABELS: Record<TenderBudgetBucket, string> = {
  economy: "Экономия",
  onBudget: "В пределах бюджета",
  overrun: "Перерасход",
  noFact: "Нет факта",
};

const BUDGET_COLORS: Record<TenderBudgetBucket, string> = {
  economy: TENDER_KPI_DONUT_COLORS.economy,
  onBudget: TENDER_KPI_DONUT_COLORS.onBudget,
  overrun: TENDER_KPI_DONUT_COLORS.overrun,
  noFact: TENDER_KPI_DONUT_COLORS.noFact,
};

function classifyConductedPipelineStatus(
  t: Tender,
): (typeof CONDUCTED_PIPELINE_CYCLE_STATUSES)[number] | null {
  if (!isTenderConducted(t)) return null;
  const cycle = resolveTenderCycleStatus(t);
  if (cycle === "contractSigned" || hasTenderSignedContract(t)) return "contractSigned";
  if (cycle === "contractNotConcluded") return "contractNotConcluded";
  return "conducted";
}

function buildConductedStatusSegments(tenders: Tender[]): KpiDonutSegment[] {
  const counts: Record<(typeof CONDUCTED_PIPELINE_CYCLE_STATUSES)[number], number> = {
    conducted: 0,
    contractSigned: 0,
    contractNotConcluded: 0,
  };

  for (const t of tenders) {
    const pipeline = classifyConductedPipelineStatus(t);
    if (pipeline) counts[pipeline] += 1;
  }

  return CONDUCTED_PIPELINE_CYCLE_STATUSES.map((cycle) => ({
    label: TENDER_CYCLE_STATUS_LABEL[cycle],
    value: counts[cycle],
    color: TENDER_CYCLE_STATUS_COLORS[cycle],
  }));
}

function buildOverdueReasonSegments(
  counts: Record<TenderOverdueReasonBucket, number>,
): KpiDonutSegment[] {
  const order: TenderOverdueReasonBucket[] = [
    "notAnnounced",
    "noApplications",
    "evaluationIncomplete",
    "contractNotAgreed",
    "contractNotSigned",
    "overdueOther",
  ];
  return order
    .filter((key) => counts[key] > 0)
    .map((key) => ({
      label: OVERDUE_REASON_LABELS[key],
      value: counts[key],
      color: OVERDUE_REASON_COLORS[key],
    }));
}

function buildBudgetSegments(counts: Record<TenderBudgetBucket, number>): KpiDonutSegment[] {
  const order: TenderBudgetBucket[] = ["economy", "onBudget", "overrun", "noFact"];
  return order
    .filter((key) => counts[key] > 0)
    .map((key) => ({
      label: BUDGET_LABELS[key],
      value: counts[key],
      color: BUDGET_COLORS[key],
    }));
}

/** Единый проход по тендерам для трёх KPI donut-диаграмм. */
export function computeTenderKpiDonutDistributions(
  tenders: Tender[],
  today: Date = new Date(),
): TenderKpiDonutDistributions {
  const overdueCounts: Record<TenderOverdueReasonBucket, number> = {
    notAnnounced: 0,
    noApplications: 0,
    evaluationIncomplete: 0,
    contractNotAgreed: 0,
    contractNotSigned: 0,
    overdueOther: 0,
  };
  const budgetCounts: Record<TenderBudgetBucket, number> = {
    economy: 0,
    onBudget: 0,
    overrun: 0,
    noFact: 0,
  };

  for (const t of tenders) {
    const overdueBucket = classifyTenderOverdueReasonBucket(t, today);
    if (overdueBucket) overdueCounts[overdueBucket] += 1;

    const budgetBucket = classifyTenderBudgetBucket(t);
    if (budgetBucket) budgetCounts[budgetBucket] += 1;
  }

  const budgetBlockTenderCount = Object.values(budgetCounts).reduce((sum, count) => sum + count, 0);

  return {
    conductedPipeline: buildConductedStatusSegments(tenders),
    overdueReasons: buildOverdueReasonSegments(overdueCounts),
    budgetDeviation: buildBudgetSegments(budgetCounts),
    totalTenders: tenders.length,
    budgetBlockTenderCount,
  };
}

export const TENDER_CONDUCT_LAG_COLORS = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
} as const;

function tenderMonthStartFromIso(iso: string): Date {
  const [y, m] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, 1, 12, 0, 0);
}

function tenderAddMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1, 12, 0, 0);
}

function tenderMonthLabelRu(d: Date): string {
  return d.toLocaleDateString("ru-RU", { month: "short", year: "2-digit" });
}

/** Плановая дата проведения: дата договора по плану. */
export function resolveTenderConductPlanDate(t: Tender): string | null {
  return t.planContractDate?.trim() || null;
}

/** Фактическая дата проведения: дата договора или дата начала (завершения) тендера. */
export function resolveTenderConductFactDate(t: Tender): string | null {
  const contract = t.factContractDate?.trim();
  if (contract) return contract;
  if (isTenderConducted(t)) {
    const start = t.factStart?.trim();
    if (start) return start;
  }
  return null;
}

/** Цвет линии факта: зелёный — в плане, жёлтый — отставание до 10%, красный — более 10%. */
export function tenderConductLagColor(plan: number, fact: number | null): string {
  if (fact == null || !Number.isFinite(fact)) return TENDER_CONDUCT_LAG_COLORS.green;
  if (fact >= plan) return TENDER_CONDUCT_LAG_COLORS.green;
  if (plan <= 0) return TENDER_CONDUCT_LAG_COLORS.green;
  const lagPct = ((plan - fact) / plan) * 100;
  if (lagPct <= 10) return TENDER_CONDUCT_LAG_COLORS.yellow;
  return TENDER_CONDUCT_LAG_COLORS.red;
}

export type TenderMonthlyConductPoint = {
  iso: string;
  label: string;
  planCount: number;
  factCount: number | null;
  planCumCount: number;
  factCumCount: number | null;
};

/**
 * Помесячная динамика проведения тендеров (шт.):
 * план — planContractDate, факт — conducted + factContractDate / factStart.
 */
export function buildTenderMonthlyConductSeries(
  tenders: Tender[],
  today: Date = new Date(),
): TenderMonthlyConductPoint[] {
  const planByMonth = new Map<string, number>();
  const factByMonth = new Map<string, number>();
  const todayIso = today.toISOString().slice(0, 10);

  for (const t of tenders) {
    const planDate = resolveTenderConductPlanDate(t);
    if (planDate) {
      const mk = planDate.slice(0, 7);
      planByMonth.set(mk, (planByMonth.get(mk) ?? 0) + 1);
    }

    if (!isTenderConducted(t)) continue;
    const factDate = resolveTenderConductFactDate(t);
    if (!factDate) continue;
    const mk = factDate.slice(0, 7);
    factByMonth.set(mk, (factByMonth.get(mk) ?? 0) + 1);
  }

  const monthKeys = new Set([...planByMonth.keys(), ...factByMonth.keys()]);
  if (monthKeys.size === 0) return [];

  const sorted = [...monthKeys].sort();
  const start = tenderMonthStartFromIso(`${sorted[0]}-01`);
  const end = tenderMonthStartFromIso(`${sorted[sorted.length - 1]}-01`);
  const todayMonth = todayIso.slice(0, 7);
  const points: TenderMonthlyConductPoint[] = [];
  let planCum = 0;
  let factCum = 0;
  let cursor = start;

  while (cursor.getTime() <= end.getTime()) {
    const iso = cursor.toISOString().slice(0, 10);
    const mk = iso.slice(0, 7);
    const planCount = planByMonth.get(mk) ?? 0;
    const factCount = factByMonth.get(mk) ?? 0;
    planCum += planCount;
    factCum += factCount;
    const factVisible = mk <= todayMonth;
    points.push({
      iso,
      label: tenderMonthLabelRu(cursor),
      planCount,
      factCount: factVisible ? factCount : null,
      planCumCount: planCum,
      factCumCount: factVisible ? factCum : null,
    });
    cursor = tenderAddMonths(cursor, 1);
  }

  return points;
}

export type TenderConductDynamicsKpi = {
  conductedCount: number;
  totalCount: number;
  conductedVolumeRub: number;
  avgCheckRub: number;
  planExecutionPct: number;
  lagCount: number;
  planCountAtToday: number;
};

/** KPI сводки под графиком «Аналитика проведения тендеров». */
export function computeTenderConductDynamicsKpi(
  tenders: Tender[],
  today: Date = new Date(),
): TenderConductDynamicsKpi {
  const todayIso = today.toISOString().slice(0, 10);
  let conductedCount = 0;
  let conductedVolumeRub = 0;
  let planCountAtToday = 0;

  for (const t of tenders) {
    const planDate = resolveTenderConductPlanDate(t);
    if (planDate && planDate <= todayIso) {
      planCountAtToday += 1;
    }
    if (isTenderConducted(t)) {
      conductedCount += 1;
      const fact = tenderFactCostRub(t);
      conductedVolumeRub += fact > 0 ? fact : tenderPlanCostRub(t);
    }
  }

  const totalCount = tenders.length;
  const avgCheckRub = conductedCount > 0 ? conductedVolumeRub / conductedCount : 0;
  const planExecutionPct =
    totalCount > 0 ? Math.round((conductedCount / totalCount) * 1000) / 10 : 0;
  const lagCount = conductedCount - planCountAtToday;

  return {
    conductedCount,
    totalCount,
    conductedVolumeRub,
    avgCheckRub,
    planExecutionPct,
    lagCount,
    planCountAtToday,
  };
}

/** console.table для проверки расчёта динамики проведения тендеров. */
export function logTenderConductDynamicsDiagnostics(series: TenderMonthlyConductPoint[]): void {
  if (process.env.NODE_ENV === "production") return;
  console.table(
    series.map((p) => ({
      month: p.label,
      plan: p.planCount,
      fact: p.factCount ?? 0,
      "накопительный план": p.planCumCount,
      "накопительный факт": p.factCumCount ?? 0,
    })),
  );
}

export type TenderMonthlyCostPoint = {
  iso: string;
  label: string;
  planRub: number;
  factRub: number | null;
  planCumRub: number;
  factCumRub: number | null;
};

/**
 * Помесячная динамика стоимости тендеров (₽):
 * план — сумма cost по planContractDate, факт — сумма factCost (или cost
 * для уже подписанных тендеров) по factContractDate / factStart.
 */
export function buildTenderMonthlyCostSeries(
  tenders: Tender[],
  today: Date = new Date(),
): TenderMonthlyCostPoint[] {
  const planByMonth = new Map<string, number>();
  const factByMonth = new Map<string, number>();
  const todayIso = today.toISOString().slice(0, 10);

  for (const t of tenders) {
    const planDate = resolveTenderConductPlanDate(t);
    const planCost = tenderPlanCostRub(t);
    if (planDate && planCost > 0) {
      const mk = planDate.slice(0, 7);
      planByMonth.set(mk, (planByMonth.get(mk) ?? 0) + planCost);
    }

    if (!isTenderConducted(t)) continue;
    const factDate = resolveTenderConductFactDate(t);
    if (!factDate) continue;
    const factCost = tenderFactCostRub(t);
    if (factCost <= 0) continue;
    const mk = factDate.slice(0, 7);
    factByMonth.set(mk, (factByMonth.get(mk) ?? 0) + factCost);
  }

  const monthKeys = new Set([...planByMonth.keys(), ...factByMonth.keys()]);
  if (monthKeys.size === 0) return [];

  const sorted = [...monthKeys].sort();
  const start = tenderMonthStartFromIso(`${sorted[0]}-01`);
  const end = tenderMonthStartFromIso(`${sorted[sorted.length - 1]}-01`);
  const todayMonth = todayIso.slice(0, 7);
  const points: TenderMonthlyCostPoint[] = [];
  let planCum = 0;
  let factCum = 0;
  let cursor = start;

  while (cursor.getTime() <= end.getTime()) {
    const iso = cursor.toISOString().slice(0, 10);
    const mk = iso.slice(0, 7);
    const planRub = planByMonth.get(mk) ?? 0;
    const factRub = factByMonth.get(mk) ?? 0;
    planCum += planRub;
    factCum += factRub;
    const factVisible = mk <= todayMonth;
    points.push({
      iso,
      label: tenderMonthLabelRu(cursor),
      planRub,
      factRub: factVisible ? factRub : null,
      planCumRub: planCum,
      factCumRub: factVisible ? factCum : null,
    });
    cursor = tenderAddMonths(cursor, 1);
  }

  return points;
}

export type TenderMonthlyContractPoint = {
  iso: string;
  label: string;
  planCount: number;
  factCount: number | null;
  planCumCount: number;
  factCumCount: number | null;
};

/**
 * Помесячная динамика заключения договоров (шт.):
 * план — t.planContractDate, факт — t.factContractDate
 * (строго подписанный договор по CSV, без fallback на factStart).
 */
export function buildTenderMonthlyContractSeries(
  tenders: Tender[],
  today: Date = new Date(),
): TenderMonthlyContractPoint[] {
  const planByMonth = new Map<string, number>();
  const factByMonth = new Map<string, number>();
  const todayIso = today.toISOString().slice(0, 10);

  for (const t of tenders) {
    const planDate = t.planContractDate?.trim();
    if (planDate) {
      const mk = planDate.slice(0, 7);
      planByMonth.set(mk, (planByMonth.get(mk) ?? 0) + 1);
    }

    const factDate = t.factContractDate?.trim();
    if (factDate) {
      const mk = factDate.slice(0, 7);
      factByMonth.set(mk, (factByMonth.get(mk) ?? 0) + 1);
    }
  }

  const monthKeys = new Set([...planByMonth.keys(), ...factByMonth.keys()]);
  if (monthKeys.size === 0) return [];

  const sorted = [...monthKeys].sort();
  const start = tenderMonthStartFromIso(`${sorted[0]}-01`);
  const end = tenderMonthStartFromIso(`${sorted[sorted.length - 1]}-01`);
  const todayMonth = todayIso.slice(0, 7);
  const points: TenderMonthlyContractPoint[] = [];
  let planCum = 0;
  let factCum = 0;
  let cursor = start;

  while (cursor.getTime() <= end.getTime()) {
    const iso = cursor.toISOString().slice(0, 10);
    const mk = iso.slice(0, 7);
    const planCount = planByMonth.get(mk) ?? 0;
    const factCount = factByMonth.get(mk) ?? 0;
    planCum += planCount;
    factCum += factCount;
    const factVisible = mk <= todayMonth;
    points.push({
      iso,
      label: tenderMonthLabelRu(cursor),
      planCount,
      factCount: factVisible ? factCount : null,
      planCumCount: planCum,
      factCumCount: factVisible ? factCum : null,
    });
    cursor = tenderAddMonths(cursor, 1);
  }

  return points;
}

/** Диагностика заключения договоров: общий план/факт и количество строк CSV в расчёте. */
export function logTenderContractDynamicsDiagnostics(tenders: Tender[]): void {
  if (process.env.NODE_ENV === "production") return;

  let totalPlan = 0;
  let totalFact = 0;
  let rowsUsed = 0;

  for (const t of tenders) {
    const planDate = t.planContractDate?.trim();
    const factDate = t.factContractDate?.trim();
    if (planDate || factDate) rowsUsed += 1;
    if (planDate) totalPlan += 1;
    if (factDate) totalFact += 1;
  }

  console.group("[Tenders Contracts] Динамика заключения договоров — диагностика");
  console.log("Общее количество договоров по плану:", totalPlan);
  console.log("Общее количество договоров по факту:", totalFact);
  console.log("Строк CSV в расчёте:", rowsUsed);
  console.log("Всего тендеров в реестре:", tenders.length);
  console.groupEnd();
}

/** Диагностика стоимости тендеров: общий план/факт и количество строк CSV в расчёте. */
export function logTenderCostDynamicsDiagnostics(tenders: Tender[]): void {
  if (process.env.NODE_ENV === "production") return;

  let totalPlanRub = 0;
  let totalFactRub = 0;
  let rowsUsed = 0;

  for (const t of tenders) {
    const plan = tenderPlanCostRub(t);
    const fact = isTenderConducted(t) ? tenderFactCostRub(t) : 0;
    if (plan > 0 || fact > 0) rowsUsed += 1;
    totalPlanRub += plan;
    if (fact > 0) totalFactRub += fact;
  }

  const fmt = (v: number) => new Intl.NumberFormat("ru-RU").format(Math.round(v));

  console.group("[Tenders Cost] Аналитика стоимости — диагностика");
  console.log("Общий план по стоимости:", `${fmt(totalPlanRub)} ₽`);
  console.log("Общий факт по стоимости:", `${fmt(totalFactRub)} ₽`);
  console.log("Строк CSV в расчёте:", rowsUsed);
  console.log("Всего тендеров в реестре:", tenders.length);
  console.groupEnd();
}

/** Диагностика KPI «Проведено» и donut-распределения (dev). */
export function logTenderConductedKpiDiagnostics(tenders: Tender[]): void {
  if (process.env.NODE_ENV === "production") return;

  const uniqueStatusLabels = new Map<string, number>();
  const distributionLabels = new Map<string, number>();
  const conductedKpiLabels = new Map<string, number>();
  let conductedKpiCount = 0;

  for (const t of tenders) {
    const raw = t.statusLabel?.trim() || "(пусто)";
    uniqueStatusLabels.set(raw, (uniqueStatusLabels.get(raw) ?? 0) + 1);

    const distLabel = tenderStatusDistributionLabel(t);
    distributionLabels.set(distLabel, (distributionLabels.get(distLabel) ?? 0) + 1);

    if (isTenderConducted(t)) {
      conductedKpiCount += 1;
      const kpiLabel = t.statusLabel?.trim() || TENDER_CYCLE_STATUS_LABEL[resolveTenderCycleStatus(t)];
      conductedKpiLabels.set(kpiLabel, (conductedKpiLabels.get(kpiLabel) ?? 0) + 1);
    }
  }

  console.group("[Tenders KPI] Проведено — диагностика");
  console.log("Всего тендеров:", tenders.length);
  console.log("Уникальные statusLabel из данных:", Object.fromEntries(uniqueStatusLabels));
  console.log(
    "Распределение диаграммы:",
    Object.fromEntries(distributionLabels),
  );
  console.log("KPI «Проведено», шт:", conductedKpiCount);
  console.log(
    "Статусы в KPI «Проведено»:",
    Object.fromEntries(conductedKpiLabels),
  );
  console.groupEnd();
}
