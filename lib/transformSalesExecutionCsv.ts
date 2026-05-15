import Papa from "papaparse";

import type { SalesPlanExecutionMonthlyPoint } from "./marketingSalesPlanExecutionTable";

/** Публичный вид строки после transform (млн ₽), как в ТЗ. */
export type SalesExecutionCsvMonthRow = {
  month: string;
  plan: number;
  fact: number;
  periodKey: string;
};

const RU_MONTH_PREFIX_TO_MM: ReadonlyArray<[string, string]> = [
  ["январ", "01"],
  ["феврал", "02"],
  ["март", "03"],
  ["апрел", "04"],
  ["мая", "05"],
  ["май", "05"],
  ["июн", "06"],
  ["июл", "07"],
  ["август", "08"],
  ["сентябр", "09"],
  ["октябр", "10"],
  ["ноябр", "11"],
  ["декабр", "12"],
];

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function preprocessCell(raw: string | undefined | null): string {
  return stripBom(String(raw ?? ""))
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Пусто, #ДЕЛ/0!, пробелы, «1 234,56» → число; иначе 0. */
export function parseSalesExecutionMoneyCell(raw: string | undefined | null): number {
  const t = preprocessCell(String(raw ?? ""));
  if (!t || t === "—" || t === "-") return 0;
  const low = t.toLowerCase();
  if (low.includes("дел/0") || low.includes("#div/0")) return 0;
  let s = t.replace(/\s/g, "").replace(",", ".");
  s = s.replace(/руб\.?/gi, "").replace(/₽/g, "");
  const n = Number(s.replace("%", ""));
  if (!Number.isFinite(n) || n === Infinity || n === -Infinity) return 0;
  return n;
}

function normalizeHeaderKey(raw: string): string {
  return preprocessCell(raw)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/_/g, " ");
}

function findColIndex(headers: string[], matcher: (h: string) => boolean): number | null {
  for (let i = 0; i < headers.length; i++) {
    const h = normalizeHeaderKey(headers[i] ?? "");
    if (matcher(h)) return i;
  }
  return null;
}

function ruMonthNameToMm(monthRaw: string): string | null {
  const t = preprocessCell(monthRaw).toLowerCase().replace(/ё/g, "е");
  if (!t) return null;
  for (const [prefix, mm] of RU_MONTH_PREFIX_TO_MM) {
    if (t.startsWith(prefix)) return mm;
  }
  return null;
}

function periodKeyFromYearMonth(yearStr: string, monthRaw: string): string | null {
  const y = Number(preprocessCell(yearStr));
  if (!Number.isFinite(y) || y < 1990 || y > 2100) return null;
  const mm = ruMonthNameToMm(monthRaw);
  if (!mm) return null;
  return `${y}-${mm}`;
}

export function lastYmdOfPeriodKey(periodKey: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(periodKey.trim());
  if (!m) return periodKey.trim();
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return periodKey.trim();
  const d = new Date(y, mo, 0).getDate();
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function chartMonthLabelRu(periodKey: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(periodKey.trim());
  if (!m) return periodKey;
  const mi = Number(m[2]) - 1;
  if (mi < 0 || mi > 11) return periodKey;
  const short = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"][mi]!;
  const yy = m[1]!.slice(2);
  return `${short}. ${yy}`;
}

/** Окно отображения «План vs факт» для выгрузки Верба (включительно). */
const CHART_PERIOD_FROM = "2025-09";
const CHART_PERIOD_TO = "2026-05";

function periodKeyCompare(a: string, b: string): number {
  return a.localeCompare(b);
}

function periodKeysInclusive(from: string, to: string): string[] {
  const fm = /^(\d{4})-(\d{2})$/.exec(from.trim());
  const tm = /^(\d{4})-(\d{2})$/.exec(to.trim());
  if (!fm || !tm) return [];
  let y = Number(fm[1]);
  let mo = Number(fm[2]);
  const yEnd = Number(tm[1]);
  const moEnd = Number(tm[2]);
  if (![y, mo, yEnd, moEnd].every((n) => Number.isFinite(n))) return [];
  const out: string[] = [];
  while (y < yEnd || (y === yEnd && mo <= moEnd)) {
    out.push(`${y}-${String(mo).padStart(2, "0")}`);
    mo += 1;
    if (mo > 12) {
      mo = 1;
      y += 1;
    }
  }
  return out;
}

/** Фиксированные индексы для выгрузки «план сделок Верба» (разделитель `;`). */
const FALLBACK_COL = {
  year: 0,
  month: 1,
  aptSum: 3,
  parkSum: 9,
  storageSum: 13,
  commercialSum: 17,
  planTotal: 21,
} as const;

function detectWideVerbaDealsHeader(headers: string[]): boolean {
  const h = headers.map(normalizeHeaderKey).join("|");
  return (
    h.includes("год") &&
    h.includes("месяц") &&
    h.includes("квартир") &&
    h.includes("сумм") &&
    h.includes("итогов") &&
    h.includes("сделок") &&
    h.includes("месяц")
  );
}

function resolveColumnIndices(headers: string[]): {
  year: number;
  month: number;
  aptSum: number;
  parkSum: number;
  storageSum: number;
  commercialSum: number;
  planTotal: number;
} | null {
  if (!detectWideVerbaDealsHeader(headers)) return null;

  const y = findColIndex(headers, (h) => h === "год" || h.startsWith("год"));
  const mo = findColIndex(headers, (h) => h === "месяц" || h.startsWith("месяц"));
  const apt = findColIndex(
    headers,
    (h) => h.includes("квартир") && h.includes("сумм") && !h.includes("привед") && !h.includes("общ"),
  );
  const park = findColIndex(headers, (h) => h.includes("паркинг") && h.includes("сумм"));
  const stor = findColIndex(headers, (h) => h.includes("кладов") && h.includes("сумм"));
  const comm = findColIndex(headers, (h) => h.includes("коммерц") && h.includes("сумм"));
  const plan = findColIndex(
    headers,
    (h) => h.includes("итогов") && h.includes("сделок") && h.includes("месяц") && h.includes("сумм"),
  );

  if (y == null || mo == null || apt == null || park == null || stor == null || comm == null || plan == null) {
    return {
      year: FALLBACK_COL.year,
      month: FALLBACK_COL.month,
      aptSum: FALLBACK_COL.aptSum,
      parkSum: FALLBACK_COL.parkSum,
      storageSum: FALLBACK_COL.storageSum,
      commercialSum: FALLBACK_COL.commercialSum,
      planTotal: FALLBACK_COL.planTotal,
    };
  }

  return {
    year: y,
    month: mo,
    aptSum: apt,
    parkSum: park,
    storageSum: stor,
    commercialSum: comm,
    planTotal: plan,
  };
}

/**
 * Разбор широкого CSV «план сделок Верба»: `;`, колонки Год + месяц, **только план** из «итоговая сумма сделок за месяц».
 * Факт продаж/поступлений для графика «План vs факт» берётся из отдельного CSV факта (график платежей), не из этого файла.
 * Возвращает `null`, если формат не распознан.
 */
export function transformSalesExecutionCsv(text: string): {
  monthlyRub: SalesPlanExecutionMonthlyPoint[];
  chartRows: SalesExecutionCsvMonthRow[];
  warnings: string[];
} | null {
  const stripped = stripBom(text);
  if (!preprocessCell(stripped)) return null;

  const parsed = Papa.parse<string[]>(stripped, {
    header: false,
    skipEmptyLines: "greedy",
    delimiter: ";",
  });
  const rows = (parsed.data as string[][]).filter((r) => Array.isArray(r) && r.some((c) => preprocessCell(String(c))));
  if (rows.length < 2) return null;

  const headerRow = rows[0]!.map((c) => preprocessCell(c));
  const col = resolveColumnIndices(headerRow);
  if (!col) return null;

  const byPeriod = new Map<string, number>();
  const warnings: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const yearStr = preprocessCell(row[col.year] ?? "");
    const monthStr = preprocessCell(row[col.month] ?? "");
    if (!yearStr && !monthStr) continue;
    const mLow = monthStr.toLowerCase();
    if (mLow.includes("итого") || mLow.includes("расторж")) continue;

    const pk = periodKeyFromYearMonth(yearStr, monthStr);
    if (!pk) {
      if (yearStr || monthStr) {
        warnings.push(`Строка ${i + 1}: пропуск — не удалось сопоставить месяц «${monthStr}» и год «${yearStr}».`);
      }
      continue;
    }

    const planRub = parseSalesExecutionMoneyCell(row[col.planTotal]);
    const planRubSafe = Number.isFinite(planRub) ? planRub : 0;

    byPeriod.set(pk, (byPeriod.get(pk) ?? 0) + planRubSafe);
  }

  if (byPeriod.size === 0) return null;

  const timeline = periodKeysInclusive(CHART_PERIOD_FROM, CHART_PERIOD_TO);
  if (timeline.length === 0) return null;

  const outRub: SalesPlanExecutionMonthlyPoint[] = [];
  const chartRows: SalesExecutionCsvMonthRow[] = [];

  for (const periodKey of timeline) {
    const planRubSafe = Number.isFinite(byPeriod.get(periodKey)) ? (byPeriod.get(periodKey) ?? 0) : 0;

    outRub.push({
      periodKey,
      planRub: planRubSafe,
      /** Совместимость типа; для графика не используется — факт из CSV поступлений. */
      factRub: 0,
    });

    chartRows.push({
      periodKey,
      month: chartMonthLabelRu(periodKey),
      plan: Math.round((planRubSafe / 1_000_000) * 1000) / 1000,
      fact: 0,
    });
  }

  outRub.sort((a, b) => periodKeyCompare(a.periodKey, b.periodKey));
  chartRows.sort((a, b) => periodKeyCompare(a.periodKey, b.periodKey));

  warnings.push(
    "Помесячный план для графика «План vs факт» взят из широкого CSV исполнения (Год, месяц, итоговая сумма сделок за месяц). Факт поступлений подставляется из отдельного CSV факта.",
  );

  return { monthlyRub: outRub, chartRows, warnings };
}
