import { isTmcControlledPosition, type TMCItem } from "@/lib/tmcData";
import { TMC_PROCUREMENT_CHART_START_MONTH } from "@/lib/tmcPresentationAnalytics";

const DAY_MS = 86400000;

/** Старт временной шкалы графика «Динамика заключения договоров» (ЖК Верба, 1 очередь). */
export const TMC_CONTRACT_CHART_START_MONTH = TMC_PROCUREMENT_CHART_START_MONTH;

const CHART_MONTH_LABELS = [
  "Янв",
  "Фев",
  "Мар",
  "Апр",
  "Май",
  "Июн",
  "Июл",
  "Авг",
  "Сен",
  "Окт",
  "Ноя",
  "Дек",
] as const;

const DEVIATION_BUCKET_ORDER = [
  "on_time",
  "days_1_3",
  "days_4_7",
  "days_8_14",
  "days_over_14",
  "not_concluded",
  "pending",
] as const;

export type TmcContractDeviationBucketId = (typeof DEVIATION_BUCKET_ORDER)[number];

export type TmcUniqueContract = {
  contractKey: string;
  contractNumber: string | null;
  contractPlanDate: string | null;
  contractFactDate: string | null;
  contractDeviationDays: number | null;
  /** Классификация своевременности (единый алгоритм с KPI). */
  bucket?: TmcContractDeviationBucketId;
};

export type TmcContractMonthlyDynamicsRow = {
  monthKey: string;
  /** Короткая подпись оси X: «Сен 25». */
  label: string;
  /** Полное название для tooltip: «Сентябрь 2025». */
  monthTitle: string;
  /** Уникальных договоров с плановой датой заключения в месяце. */
  plan: number;
  /** Уникальных договоров с фактической датой заключения в месяце. */
  fact: number;
};

export type TmcContractDeviationSegment = {
  bucket: TmcContractDeviationBucketId;
  label: string;
  count: number;
  pct: number;
  color: string;
};

export type TmcContractConclusionAnalytics = {
  monthlyRows: TmcContractMonthlyDynamicsRow[];
  deviationSegments: TmcContractDeviationSegment[];
  factConcludedCount: number;
  onTimeOverallPct: number | null;
  uniqueContracts: TmcUniqueContract[];
};

export type TmcContractConclusionDiagnostic = {
  csvRowCount: number;
  excludedEmptyOrNonPosition: number;
  excludedNoContractData: number;
  eligibleTmcRows: number;
  uniqueContractCount: number;
  withPlanDate: number;
  withFactDate: number;
  overdueCount: number;
  onTimeCount: number;
  excludedFactBeforeProjectStart: number;
  excludedPlanBeforeProjectStart: number;
  chartStartMonth: string;
  chartEndMonth: string;
  monthlyBreakdown: Array<{
    month: string;
    plan: number;
    fact: number;
    deviation: number;
  }>;
  deviationBuckets: Array<{ label: string; count: number; pct: number }>;
};

function isoStartMs(iso: string | null | undefined): number | null {
  const t = (iso ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(t)) return null;
  const ms = new Date(`${t.slice(0, 10)}T12:00:00`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function calendarDaysBetweenIso(planIso: string, factIso: string): number | null {
  const a = isoStartMs(planIso);
  const b = isoStartMs(factIso);
  if (a == null || b == null) return null;
  return Math.round((b - a) / DAY_MS);
}

function monthStartFromIso(iso: string): Date {
  const [y, m] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, 1, 12, 0, 0);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1, 12, 0, 0);
}

function contractChartMonthLabel(d: Date): string {
  const month = CHART_MONTH_LABELS[d.getMonth()] ?? "";
  const year = String(d.getFullYear()).slice(-2);
  return `${month} ${year}`;
}

function contractChartMonthTitle(d: Date): string {
  const raw = d.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function monthKeyFromIso(iso: string): string {
  return iso.slice(0, 7);
}

function dateToMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthKeyFromDate(d: Date): string {
  return dateToMonthKey(d);
}

function pickEarlierIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
}

function pickLaterIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

function normalizeContractNumber(raw: string | undefined | null): string | null {
  const t = (raw ?? "").trim();
  if (!t || t === "-" || t === "0" || t === "—") return null;
  return t.replace(/\s+/g, " ").toLowerCase();
}

/** Позиция с релевантными договорными данными (без групп WBS и пустых строк). */
export function isTmcContractAnalyticsRow(item: TMCItem): boolean {
  if (!isTmcControlledPosition(item)) return false;
  const plan = item.contractPlanDate?.trim();
  const fact = item.contractFactDate?.trim();
  const num = normalizeContractNumber(item.contract);
  const lead = item.contractLeadTimeDays;
  return Boolean(plan || fact || num || (lead != null && Number.isFinite(lead)));
}

function buildContractKey(item: TMCItem): string | null {
  const num = normalizeContractNumber(item.contract);
  if (num) return `num:${num}`;

  const plan = item.contractPlanDate?.trim() || "";
  const fact = item.contractFactDate?.trim() || "";
  const supplier = (item.supplier ?? "").trim().toLowerCase();
  if (!plan && !fact) return null;

  return `composite:${plan}|${fact}|${supplier}`;
}

function mergeContractRow(existing: TmcUniqueContract, item: TMCItem): TmcUniqueContract {
  const plan = item.contractPlanDate?.trim() || null;
  const fact = item.contractFactDate?.trim() || null;
  const deviation =
    fact != null && item.contractDeviationDays != null
      ? item.contractDeviationDays
      : existing.contractDeviationDays;

  return {
    ...existing,
    contractPlanDate: pickEarlierIso(existing.contractPlanDate, plan),
    contractFactDate: pickLaterIso(existing.contractFactDate, fact),
    contractDeviationDays: deviation,
  };
}

export function dedupeTmcContracts(items: TMCItem[]): TmcUniqueContract[] {
  const map = new Map<string, TmcUniqueContract>();

  for (const item of items) {
    if (!isTmcContractAnalyticsRow(item)) continue;
    const key = buildContractKey(item);
    if (!key) continue;

    const num = normalizeContractNumber(item.contract);
    const existing = map.get(key);
    if (existing) {
      map.set(key, mergeContractRow(existing, item));
    } else {
      map.set(key, {
        contractKey: key,
        contractNumber: num,
        contractPlanDate: item.contractPlanDate?.trim() || null,
        contractFactDate: item.contractFactDate?.trim() || null,
        contractDeviationDays: item.contractDeviationDays,
      });
    }
  }

  return [...map.values()];
}

export function resolveContractDeviationDays(contract: TmcUniqueContract): number | null {
  if (!contract.contractFactDate) return null;
  if (contract.contractDeviationDays != null && Number.isFinite(contract.contractDeviationDays)) {
    return contract.contractDeviationDays;
  }
  if (contract.contractPlanDate) {
    return calendarDaysBetweenIso(contract.contractPlanDate, contract.contractFactDate);
  }
  return null;
}

export function isTmcContractOverdue(contract: TmcUniqueContract): boolean {
  const dev = resolveContractDeviationDays(contract);
  return dev != null && dev > 0;
}

export function isTmcContractOnTime(contract: TmcUniqueContract): boolean {
  if (!contract.contractFactDate) return false;
  const dev = resolveContractDeviationDays(contract);
  return dev != null && dev <= 0;
}

function deviationBucketId(days: number): TmcContractDeviationBucketId {
  if (days <= 0) return "on_time";
  if (days <= 3) return "days_1_3";
  if (days <= 7) return "days_4_7";
  if (days <= 14) return "days_8_14";
  return "days_over_14";
}

const DEVIATION_BUCKET_META: Record<
  TmcContractDeviationBucketId,
  { label: string; color: string }
> = {
  on_time: { label: "В срок (0 дн.)", color: "#22c55e" },
  days_1_3: { label: "1–3 дня", color: "#84cc16" },
  days_4_7: { label: "4–7 дней", color: "#f59e0b" },
  days_8_14: { label: "8–14 дней", color: "#f97316" },
  days_over_14: { label: ">14 дней", color: "#ef4444" },
  not_concluded: { label: "Не заключён", color: "#94a3b8" },
  pending: { label: "Срок не наступил", color: "#64748b" },
};

function reportDateNoonMs(reportDate: Date): number {
  return new Date(
    reportDate.getFullYear(),
    reportDate.getMonth(),
    reportDate.getDate(),
    12,
    0,
    0,
  ).getTime();
}

function classifyContractBucket(
  contract: TmcUniqueContract,
  reportDate: Date,
): TmcContractDeviationBucketId | null {
  const plan = contract.contractPlanDate;
  const fact = contract.contractFactDate;
  if (!plan) {
    // Без плана нельзя классифицировать своевременность; факт без плана — вне timing-donut.
    return null;
  }
  const planMs = isoStartMs(plan);
  if (planMs == null) return null;
  const reportMs = reportDateNoonMs(reportDate);

  if (fact) {
    const dev = resolveContractDeviationDays(contract);
    if (dev == null) return null;
    return deviationBucketId(dev);
  }

  if (planMs > reportMs) return "pending";
  return "not_concluded";
}

function isDateInChartRange(iso: string, projectStartMonth: string, endMonthKey: string): boolean {
  const mk = monthKeyFromIso(iso);
  return mk >= projectStartMonth && mk <= endMonthKey;
}

/** План / факт заключения уникальных договоров по месяцам проекта. */
function buildMonthlyRows(
  contracts: TmcUniqueContract[],
  reportDate: Date,
  projectStartMonth: string = TMC_CONTRACT_CHART_START_MONTH,
): TmcContractMonthlyDynamicsRow[] {
  const endMonthKey = dateToMonthKey(reportDate);
  if (projectStartMonth > endMonthKey) return [];

  const planByMonth = new Map<string, number>();
  const factByMonth = new Map<string, number>();

  for (const c of contracts) {
    if (c.contractPlanDate && isDateInChartRange(c.contractPlanDate, projectStartMonth, endMonthKey)) {
      const mk = monthKeyFromIso(c.contractPlanDate);
      planByMonth.set(mk, (planByMonth.get(mk) ?? 0) + 1);
    }
    if (c.contractFactDate && isDateInChartRange(c.contractFactDate, projectStartMonth, endMonthKey)) {
      const mk = monthKeyFromIso(c.contractFactDate);
      factByMonth.set(mk, (factByMonth.get(mk) ?? 0) + 1);
    }
  }

  const start = monthStartFromIso(`${projectStartMonth}-01`);
  const end = monthStartFromIso(`${endMonthKey}-01`);

  const rows: TmcContractMonthlyDynamicsRow[] = [];
  let cursor = start;
  while (cursor.getTime() <= end.getTime()) {
    const mk = monthKeyFromDate(cursor);
    rows.push({
      monthKey: mk,
      label: contractChartMonthLabel(cursor),
      monthTitle: contractChartMonthTitle(cursor),
      plan: planByMonth.get(mk) ?? 0,
      fact: factByMonth.get(mk) ?? 0,
    });
    cursor = addMonths(cursor, 1);
  }

  return rows;
}

function buildDeviationSegments(
  contracts: TmcUniqueContract[],
  reportDate: Date,
): TmcContractDeviationSegment[] {
  const classified = contracts
    .map((c) => {
      const bucket = classifyContractBucket(c, reportDate);
      return bucket ? { ...c, bucket } : null;
    })
    .filter((c): c is TmcUniqueContract & { bucket: TmcContractDeviationBucketId } => c != null);

  const total = classified.length;
  const counts = new Map<TmcContractDeviationBucketId, number>();
  for (const id of DEVIATION_BUCKET_ORDER) counts.set(id, 0);

  for (const c of classified) {
    counts.set(c.bucket, (counts.get(c.bucket) ?? 0) + 1);
  }

  return DEVIATION_BUCKET_ORDER.map((bucket) => {
    const count = counts.get(bucket) ?? 0;
    const meta = DEVIATION_BUCKET_META[bucket];
    return {
      bucket,
      label: meta.label,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
      color: meta.color,
    };
  });
}

export function buildTmcContractConclusionAnalytics(
  items: TMCItem[],
  reportDate: Date = new Date(),
): TmcContractConclusionAnalytics {
  const uniqueContracts = dedupeTmcContracts(items).map((c) => {
    const bucket = classifyContractBucket(c, reportDate);
    return bucket ? { ...c, bucket } : c;
  });
  const monthlyRows = buildMonthlyRows(uniqueContracts, reportDate);
  const deviationSegments = buildDeviationSegments(uniqueContracts, reportDate);
  const withFact = uniqueContracts.filter((c) => c.contractFactDate);
  const onTimeCount = withFact.filter(isTmcContractOnTime).length;

  return {
    monthlyRows,
    deviationSegments,
    factConcludedCount: withFact.length,
    onTimeOverallPct:
      withFact.length > 0 ? Math.round((onTimeCount / withFact.length) * 100) : null,
    uniqueContracts,
  };
}

export function diagnoseTmcContractConclusion(
  items: TMCItem[],
  reportDate: Date = new Date(),
): TmcContractConclusionDiagnostic {
  const csvRowCount = items.length;
  let excludedEmptyOrNonPosition = 0;
  let excludedNoContractData = 0;

  for (const item of items) {
    if (!isTmcControlledPosition(item)) {
      excludedEmptyOrNonPosition += 1;
      continue;
    }
    if (!isTmcContractAnalyticsRow(item)) {
      excludedNoContractData += 1;
    }
  }

  const analytics = buildTmcContractConclusionAnalytics(items, reportDate);
  const endMonthKey = dateToMonthKey(reportDate);
  let excludedFactBeforeProjectStart = 0;
  let excludedPlanBeforeProjectStart = 0;
  for (const c of analytics.uniqueContracts) {
    if (c.contractFactDate && !isDateInChartRange(c.contractFactDate, TMC_CONTRACT_CHART_START_MONTH, endMonthKey)) {
      excludedFactBeforeProjectStart += 1;
    }
    if (c.contractPlanDate && !isDateInChartRange(c.contractPlanDate, TMC_CONTRACT_CHART_START_MONTH, endMonthKey)) {
      excludedPlanBeforeProjectStart += 1;
    }
  }

  return {
    csvRowCount,
    excludedEmptyOrNonPosition,
    excludedNoContractData,
    eligibleTmcRows: items.filter(isTmcContractAnalyticsRow).length,
    uniqueContractCount: analytics.uniqueContracts.length,
    withPlanDate: analytics.uniqueContracts.filter((c) => c.contractPlanDate).length,
    withFactDate: analytics.uniqueContracts.filter((c) => c.contractFactDate).length,
    overdueCount: analytics.uniqueContracts.filter(isTmcContractOverdue).length,
    onTimeCount: analytics.uniqueContracts.filter(isTmcContractOnTime).length,
    excludedFactBeforeProjectStart,
    excludedPlanBeforeProjectStart,
    chartStartMonth: TMC_CONTRACT_CHART_START_MONTH,
    chartEndMonth: endMonthKey,
    monthlyBreakdown: analytics.monthlyRows.map((r) => ({
      month: r.label,
      plan: r.plan,
      fact: r.fact,
      deviation: r.fact - r.plan,
    })),
    deviationBuckets: analytics.deviationSegments.map((s) => ({
      label: s.label,
      count: s.count,
      pct: s.pct,
    })),
  };
}

/** Dev-диагностика построения блока «Динамика заключения договоров». */
export function logTmcContractConclusionDiagnostic(
  items: TMCItem[],
  reportDate: Date = new Date(),
): void {
  if (process.env.NODE_ENV === "production") return;
  const diag = diagnoseTmcContractConclusion(items, reportDate);
  console.group("[TMC] Динамика заключения договоров — диагностика");
  console.log("Строк CSV:", diag.csvRowCount);
  console.log("Исключено (не позиция / группа):", diag.excludedEmptyOrNonPosition);
  console.log("Исключено (нет договорных данных):", diag.excludedNoContractData);
  console.log("Строк ТМЦ с договорными данными:", diag.eligibleTmcRows);
  console.log("Уникальных договоров:", diag.uniqueContractCount);
  console.log("С плановой датой:", diag.withPlanDate);
  console.log("С фактической датой:", diag.withFactDate);
  console.log("Просроченных:", diag.overdueCount);
  console.log("Заключено в срок:", diag.onTimeCount);
  console.log("Шкала:", diag.chartStartMonth, "→", diag.chartEndMonth);
  console.log("Исключено (факт до старта проекта):", diag.excludedFactBeforeProjectStart);
  console.log("Исключено (план до старта проекта):", diag.excludedPlanBeforeProjectStart);
  console.table(diag.monthlyBreakdown);
  console.table(diag.deviationBuckets);
  console.groupEnd();
}
