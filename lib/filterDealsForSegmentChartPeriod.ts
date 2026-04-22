import type { NormalizedDealRow } from "@/components/marketing/DealsSection";

/** Режим периода для графика «Выполнение плана по сегментам» (локальный, не путать с MarketingPeriodGranularity). */
export type SegmentChartPeriodMode = "month" | "quarter" | "all";

export type FilterDealsForSegmentChartOptions = {
  /** Дата отчёта плана (YYYY-MM-DD), если нет явного месяца/квартала и нет валидных сделок. */
  fallbackAsOfYmd?: string | null;
  /**
   * Явный календарный месяц YYYY-MM (как в таблице «Сделки по месяцам»).
   * Если не задан — см. {@link resolveFallbackYearMonth}.
   */
  selectedMonthKey?: string | null;
  /**
   * Квартал: `YYYY-q`, где q = 0…3 (Q1 = янв–мар).
   * Если не задан — вычисляется из fallback месяца.
   */
  selectedQuarterId?: string | null;
};

function parseYmdToLocalParts(ymd: string): { year: number; monthIndex: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m] = ymd.slice(0, 7).split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return { year: y, monthIndex: m - 1 };
}

function monthKeyToYearMonth(k: string): { year: number; monthIndex: number } | null {
  if (!/^\d{4}-\d{2}$/.test(k)) return null;
  const [y, m] = k.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return { year: y, monthIndex: m - 1 };
}

/** Fallback: последний месяц в данных → как последняя строка «Сделки по месяцам»; иначе asOf; иначе сегодня. */
export function resolveFallbackYearMonth(
  rows: NormalizedDealRow[],
  fallbackAsOfYmd: string | null | undefined,
  now: Date,
): { selectedYear: number; selectedMonth: number } {
  const keys = [...new Set(rows.map((r) => r.monthKey).filter((k) => /^\d{4}-\d{2}$/.test(k)))].sort();
  if (keys.length > 0) {
    const maxKey = keys[keys.length - 1]!;
    const parts = monthKeyToYearMonth(maxKey);
    if (parts) return { selectedYear: parts.year, selectedMonth: parts.monthIndex };
  }
  const fromReport = fallbackAsOfYmd ? parseYmdToLocalParts(fallbackAsOfYmd) : null;
  if (fromReport) return { selectedYear: fromReport.year, selectedMonth: fromReport.monthIndex };
  return { selectedYear: now.getFullYear(), selectedMonth: now.getMonth() };
}

/** Сравнение календарного месяца с полями строки (как после normalizeDeal: monthKey / dealDate). */
function rowMatchesCalendarMonth(d: NormalizedDealRow, year: number, monthIndex: number): boolean {
  const head = String(d.dealDate ?? "").trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) {
    const [ys, ms] = head.split("-").map(Number);
    return ys === year && ms === monthIndex + 1;
  }
  if (/^\d{4}-\d{2}$/.test(d.monthKey)) {
    const [ys, ms] = d.monthKey.split("-").map(Number);
    return ys === year && ms === monthIndex + 1;
  }
  return false;
}

function rowMatchesQuarter(d: NormalizedDealRow, year: number, selectedQuarter: number): boolean {
  const head = String(d.dealDate ?? "").trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) {
    const [ys, ms, ds] = head.split("-").map(Number);
    if (ys !== year || ms < 1 || ms > 12) return false;
    void ds;
    const q = Math.floor((ms - 1) / 3);
    return q === selectedQuarter;
  }
  if (/^\d{4}-\d{2}$/.test(d.monthKey)) {
    const [ys, ms] = d.monthKey.split("-").map(Number);
    if (ys !== year || ms < 1 || ms > 12) return false;
    const q = Math.floor((ms - 1) / 3);
    return q === selectedQuarter;
  }
  return false;
}

function parseQuarterId(id: string): { year: number; quarter: number } | null {
  const m = /^(\d{4})-([0-3])$/.exec(id);
  if (!m) return null;
  const year = Number(m[1]);
  const quarter = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(quarter)) return null;
  return { year, quarter };
}

/**
 * Сначала отбор сделок по дате/месяцу, потом агрегация по сегментам (вызывающий код).
 * Календарный месяц/квартал — из явного выбора UI или из {@link resolveFallbackYearMonth}.
 */
export function filterDealsForSegmentChartPeriod(
  rows: NormalizedDealRow[],
  mode: SegmentChartPeriodMode,
  options?: FilterDealsForSegmentChartOptions,
  now: Date = new Date(),
): NormalizedDealRow[] {
  if (mode === "all") return rows;

  if (mode === "month") {
    const fromKey = options?.selectedMonthKey ? monthKeyToYearMonth(options.selectedMonthKey) : null;
    const { selectedYear, selectedMonth } = fromKey
      ? { selectedYear: fromKey.year, selectedMonth: fromKey.monthIndex }
      : resolveFallbackYearMonth(rows, options?.fallbackAsOfYmd, now);
    return rows.filter((d) => rowMatchesCalendarMonth(d, selectedYear, selectedMonth));
  }

  const qParsed = options?.selectedQuarterId ? parseQuarterId(options.selectedQuarterId) : null;
  if (qParsed) {
    return rows.filter((d) => rowMatchesQuarter(d, qParsed.year, qParsed.quarter));
  }

  const { selectedYear, selectedMonth } = resolveFallbackYearMonth(rows, options?.fallbackAsOfYmd, now);
  const selectedQuarter = Math.floor(selectedMonth / 3);
  return rows.filter((d) => rowMatchesQuarter(d, selectedYear, selectedQuarter));
}
