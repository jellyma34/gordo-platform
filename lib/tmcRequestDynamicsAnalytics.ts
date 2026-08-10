import type { GPRTask } from "@/lib/gprUtils";
import { isTmcControlledPosition, type TMCItem } from "@/lib/tmcData";
import { TMC_CONTRACT_CHART_START_MONTH } from "@/lib/tmcContractDynamicsAnalytics";
import {
  buildTmcRequestVsGprRows,
  classifyRequestProvisionStatus,
  type TmcRequestVsGprRow,
} from "@/lib/tmcProcurementAnalytics";

const DAY_MS = 86400000;

/** Тот же старт шкалы, что у «Динамика заключения договоров». */
export const TMC_REQUEST_CHART_START_MONTH = TMC_CONTRACT_CHART_START_MONTH;

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
  "not_submitted",
  "pending",
] as const;

export type TmcRequestDeviationBucketId = (typeof DEVIATION_BUCKET_ORDER)[number];

export type TmcRequestDynamicsUnit = {
  id: string;
  /** Рассчитанная плановая дата подачи заявки. */
  planApplicationDate: string;
  /** Фактическая дата подачи (если есть). */
  actualApplicationDate: string | null;
  /** Факт − план (дни); null если факта нет. */
  deviationDays: number | null;
  bucket: TmcRequestDeviationBucketId;
};

export type TmcRequestMonthlyDynamicsRow = {
  monthKey: string;
  label: string;
  monthTitle: string;
  plan: number;
  fact: number;
};

export type TmcRequestDeviationSegment = {
  bucket: TmcRequestDeviationBucketId;
  label: string;
  count: number;
  pct: number;
  color: string;
};

export type TmcRequestDynamicsAnalytics = {
  monthlyRows: TmcRequestMonthlyDynamicsRow[];
  deviationSegments: TmcRequestDeviationSegment[];
  /** Заявки с фактической датой подачи (центр donut). */
  factSubmittedCount: number;
  /** on_time / factSubmittedCount × 100. */
  onTimeOverallPct: number | null;
  units: TmcRequestDynamicsUnit[];
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

function chartMonthLabel(d: Date): string {
  const month = CHART_MONTH_LABELS[d.getMonth()] ?? "";
  const year = String(d.getFullYear()).slice(-2);
  return `${month} ${year}`;
}

function chartMonthTitle(d: Date): string {
  const raw = d.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function monthKeyFromIso(iso: string): string {
  return iso.slice(0, 7);
}

function dateToMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function isDateInChartRange(iso: string, projectStartMonth: string, endMonthKey: string): boolean {
  const mk = monthKeyFromIso(iso);
  return mk >= projectStartMonth && mk <= endMonthKey;
}

function lateDeviationBucketId(days: number): TmcRequestDeviationBucketId {
  if (days <= 0) return "on_time";
  if (days <= 3) return "days_1_3";
  if (days <= 7) return "days_4_7";
  if (days <= 14) return "days_8_14";
  return "days_over_14";
}

const DEVIATION_BUCKET_META: Record<
  TmcRequestDeviationBucketId,
  { label: string; color: string }
> = {
  on_time: { label: "В срок (0 дн.)", color: "#22c55e" },
  days_1_3: { label: "1–3 дня", color: "#84cc16" },
  days_4_7: { label: "4–7 дней", color: "#f59e0b" },
  days_8_14: { label: "8–14 дней", color: "#f97316" },
  days_over_14: { label: ">14 дней", color: "#ef4444" },
  not_submitted: { label: "Не поданы", color: "#94a3b8" },
  pending: { label: "Срок не наступил", color: "#64748b" },
};

function resolveDeviationDays(row: TmcRequestVsGprRow): number | null {
  if (!row.requestFactDate || !row.requestDeadlineDate) return null;
  if (row.deviationDays != null && Number.isFinite(row.deviationDays)) {
    return row.deviationDays;
  }
  return calendarDaysBetweenIso(row.requestDeadlineDate, row.requestFactDate);
}

function classifyRequestUnit(
  row: TmcRequestVsGprRow,
  reportDate: Date,
): TmcRequestDynamicsUnit | null {
  const planApplicationDate = row.requestDeadlineDate?.trim() || null;
  if (!planApplicationDate) return null;

  const actualApplicationDate = row.requestFactDate?.trim() || null;
  const provision = classifyRequestProvisionStatus(
    planApplicationDate,
    actualApplicationDate,
    reportDate,
  );

  if (provision.status === "incomplete") return null;

  if (actualApplicationDate) {
    const deviationDays = resolveDeviationDays(row);
    if (deviationDays == null) return null;
    return {
      id: row.id,
      planApplicationDate,
      actualApplicationDate,
      deviationDays,
      bucket: lateDeviationBucketId(deviationDays),
    };
  }

  if (provision.status === "pending") {
    return {
      id: row.id,
      planApplicationDate,
      actualApplicationDate: null,
      deviationDays: null,
      bucket: "pending",
    };
  }

  return {
    id: row.id,
    planApplicationDate,
    actualApplicationDate: null,
    deviationDays: null,
    bucket: "not_submitted",
  };
}

/** Уникальные позиции ТМЦ с определённой плановой датой заявки (1 позиция = 1 заявка). */
export function collectTmcRequestDynamicsUnits(
  items: TMCItem[],
  reportDate: Date = new Date(),
  gprTasks: GPRTask[] = [],
): TmcRequestDynamicsUnit[] {
  const rows = buildTmcRequestVsGprRows(items, reportDate, gprTasks);
  const seen = new Set<string>();
  const units: TmcRequestDynamicsUnit[] = [];

  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const unit = classifyRequestUnit(row, reportDate);
    if (unit) units.push(unit);
  }

  return units;
}

function buildMonthlyRows(
  units: TmcRequestDynamicsUnit[],
  reportDate: Date,
  projectStartMonth: string = TMC_REQUEST_CHART_START_MONTH,
): TmcRequestMonthlyDynamicsRow[] {
  const endMonthKey = dateToMonthKey(reportDate);
  if (projectStartMonth > endMonthKey) return [];

  const planByMonth = new Map<string, number>();
  const factByMonth = new Map<string, number>();

  for (const u of units) {
    if (isDateInChartRange(u.planApplicationDate, projectStartMonth, endMonthKey)) {
      const mk = monthKeyFromIso(u.planApplicationDate);
      planByMonth.set(mk, (planByMonth.get(mk) ?? 0) + 1);
    }
    if (
      u.actualApplicationDate &&
      isDateInChartRange(u.actualApplicationDate, projectStartMonth, endMonthKey)
    ) {
      const mk = monthKeyFromIso(u.actualApplicationDate);
      factByMonth.set(mk, (factByMonth.get(mk) ?? 0) + 1);
    }
  }

  const start = monthStartFromIso(`${projectStartMonth}-01`);
  const end = monthStartFromIso(`${endMonthKey}-01`);
  const rows: TmcRequestMonthlyDynamicsRow[] = [];
  let cursor = start;
  while (cursor.getTime() <= end.getTime()) {
    const mk = dateToMonthKey(cursor);
    rows.push({
      monthKey: mk,
      label: chartMonthLabel(cursor),
      monthTitle: chartMonthTitle(cursor),
      plan: planByMonth.get(mk) ?? 0,
      fact: factByMonth.get(mk) ?? 0,
    });
    cursor = addMonths(cursor, 1);
  }

  return rows;
}

function buildDeviationSegments(units: TmcRequestDynamicsUnit[]): TmcRequestDeviationSegment[] {
  const total = units.length;
  const counts = new Map<TmcRequestDeviationBucketId, number>();
  for (const id of DEVIATION_BUCKET_ORDER) counts.set(id, 0);

  for (const u of units) {
    counts.set(u.bucket, (counts.get(u.bucket) ?? 0) + 1);
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

export function buildTmcRequestDynamicsAnalytics(
  items: TMCItem[],
  reportDate: Date = new Date(),
  gprTasks: GPRTask[] = [],
): TmcRequestDynamicsAnalytics {
  const controlled = items.filter(isTmcControlledPosition);
  const units = collectTmcRequestDynamicsUnits(controlled, reportDate, gprTasks);
  const monthlyRows = buildMonthlyRows(units, reportDate);
  const deviationSegments = buildDeviationSegments(units);
  const withFact = units.filter((u) => u.actualApplicationDate);
  const onTimeCount = withFact.filter((u) => u.bucket === "on_time").length;

  return {
    monthlyRows,
    deviationSegments,
    factSubmittedCount: withFact.length,
    onTimeOverallPct:
      withFact.length > 0 ? Math.round((onTimeCount / withFact.length) * 100) : null,
    units,
  };
}

/** Dev-диагностика блока «Динамика заявок». */
export function logTmcRequestDynamicsDiagnostic(
  items: TMCItem[],
  reportDate: Date = new Date(),
  gprTasks: GPRTask[] = [],
): void {
  if (process.env.NODE_ENV === "production") return;
  const analytics = buildTmcRequestDynamicsAnalytics(items, reportDate, gprTasks);
  console.group("[TMC] Динамика заявок — диагностика");
  console.log("Позиций с плановой датой заявки:", analytics.units.length);
  console.log("С фактической подачей:", analytics.factSubmittedCount);
  console.log("В срок %:", analytics.onTimeOverallPct);
  console.log("Шкала:", TMC_REQUEST_CHART_START_MONTH, "→", dateToMonthKey(reportDate));
  console.table(
    analytics.monthlyRows.map((r) => ({
      month: r.label,
      plan: r.plan,
      fact: r.fact,
      deviation: r.fact - r.plan,
    })),
  );
  console.table(
    analytics.deviationSegments.map((s) => ({
      label: s.label,
      count: s.count,
      pct: s.pct,
    })),
  );
  console.groupEnd();
}
