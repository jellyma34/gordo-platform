import Papa from "papaparse";

import type { PlanFactCsvMonthlyRow } from "@/lib/marketingSalesPlanExecutionTable";
import { parseSalesExecutionMoneyCell } from "@/lib/transformSalesExecutionCsv";

export type MarketingLeadsCsvTableKey = "adSpend" | "leads" | "deals";

export type MarketingLeadsCsvParsedTables = {
  adSpend: PlanFactCsvMonthlyRow[];
  leads: PlanFactCsvMonthlyRow[];
  deals: PlanFactCsvMonthlyRow[];
};

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function preprocessCell(raw: string | undefined | null): string {
  return stripBom(String(raw ?? ""))
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeaderKey(raw: string): string {
  return preprocessCell(raw)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/_/g, " ");
}

/** Числа из `лиды.csv`: пробелы, NBSP, запятая как десятичный разделитель. */
export function parseMarketingLeadsCsvNumberCell(raw: string | undefined | null): number {
  const t = stripBom(String(raw ?? ""))
    .replace(/\u00a0/g, "")
    .replace(/\s/g, "")
    .replace(",", ".");
  if (!t || t === "—" || t === "-") return 0;
  const low = t.toLowerCase();
  if (low.includes("дел/0") || low.includes("#div/0")) return 0;
  const n = Number(t.replace("%", ""));
  return Number.isFinite(n) ? n : 0;
}

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

function ruMonthNameToMm(monthRaw: string): string | null {
  const t = preprocessCell(monthRaw).toLowerCase().replace(/ё/g, "е");
  if (!t) return null;
  for (const [prefix, mm] of RU_MONTH_PREFIX_TO_MM) {
    if (t.startsWith(prefix)) return mm;
  }
  return null;
}

/** Хронология месяцев без года в CSV: rollover года при «дек → янв». */
export function assignPeriodKeysFromRuMonthNames(monthNames: readonly string[], baseYear?: number): string[] {
  let year = baseYear ?? new Date().getFullYear();
  let prevMm = 0;
  const keys: string[] = [];
  for (const name of monthNames) {
    const mm = ruMonthNameToMm(name);
    if (!mm) continue;
    const mi = Number(mm);
    if (prevMm > 0 && mi < prevMm) year += 1;
    keys.push(`${year}-${mm}`);
    prevMm = mi;
  }
  return keys;
}

function detectSection(row: string[]): MarketingLeadsCsvTableKey | null {
  const joined = row.map((c) => normalizeHeaderKey(c)).join(" ");
  if (!joined.trim()) return null;
  if (joined.includes("расход") && joined.includes("реклам")) return "adSpend";
  if (joined.includes("сделк")) return "deals";
  if (joined.includes("лид")) return "leads";
  return null;
}

function rowIsPlanFactHeader(row: string[]): boolean {
  const joined = row.map((c) => normalizeHeaderKey(c)).join(" ");
  return joined.includes("план") && joined.includes("факт");
}

function isFooterOrTechnicalRow(firstCell: string): boolean {
  const t = normalizeHeaderKey(firstCell);
  if (!t) return true;
  return t.startsWith("итого") || t.startsWith("всего") || t.includes("примечан");
}

function parseRowsToTable(rows: string[][], integerValues: boolean): PlanFactCsvMonthlyRow[] {
  const monthNames: string[] = [];
  const rawRows: Array<{ plan: number; fact: number }> = [];

  for (const row of rows) {
    if (!row?.length) continue;
    const monthCell = preprocessCell(row[0] ?? "");
    if (!monthCell || isFooterOrTechnicalRow(monthCell)) continue;
    const mm = ruMonthNameToMm(monthCell);
    if (!mm) continue;

    const planRaw = row[1] ?? "";
    const factRaw = row[2] ?? "";
    const plan = integerValues
      ? Math.round(parseMarketingLeadsCsvNumberCell(planRaw))
      : parseSalesExecutionMoneyCell(planRaw);
    const fact = integerValues
      ? Math.round(parseMarketingLeadsCsvNumberCell(factRaw))
      : parseSalesExecutionMoneyCell(factRaw);

    monthNames.push(monthCell);
    rawRows.push({ plan, fact });
  }

  const periodKeys = assignPeriodKeysFromRuMonthNames(monthNames);
  const out: PlanFactCsvMonthlyRow[] = [];
  for (let i = 0; i < rawRows.length && i < periodKeys.length; i++) {
    out.push({
      periodKey: periodKeys[i]!,
      planRub: rawRows[i]!.plan,
      factRub: rawRows[i]!.fact,
    });
  }
  return out;
}

export type ParseMarketingLeadsCsvOk = {
  ok: true;
  tables: MarketingLeadsCsvParsedTables;
  warnings: string[];
};

export type ParseMarketingLeadsCsvFail = {
  ok: false;
  error: string;
  warnings: string[];
};

export type ParseMarketingLeadsCsvResult = ParseMarketingLeadsCsvOk | ParseMarketingLeadsCsvFail;

/**
 * `лиды.csv`: три таблицы (Расходы на рекламу, Лиды, Сделки) с колонками месяц / План / Факт.
 */
export function parseMarketingLeadsCsv(text: string): ParseMarketingLeadsCsvResult {
  const warnings: string[] = [];
  const cleaned = stripBom(text).trim();
  if (!cleaned) {
    return { ok: false, error: "Файл пуст.", warnings };
  }

  const parsed = Papa.parse<string[]>(cleaned, {
    delimiter: ";",
    skipEmptyLines: false,
    header: false,
  });

  if (parsed.errors.length > 0) {
    const msg = parsed.errors[0]?.message ?? "Ошибка разбора CSV";
    return { ok: false, error: msg, warnings };
  }

  const matrix = (parsed.data as string[][]).map((row) =>
    row.map((c) => preprocessCell(String(c ?? ""))),
  );

  const buckets: Record<MarketingLeadsCsvTableKey, string[][]> = {
    adSpend: [],
    leads: [],
    deals: [],
  };

  let current: MarketingLeadsCsvTableKey | null = null;
  let expectData = false;

  for (const row of matrix) {
    if (!row.some((c) => c.trim())) {
      expectData = false;
      continue;
    }

    const section = detectSection(row);
    if (section) {
      current = section;
      expectData = false;
      continue;
    }

    if (current && rowIsPlanFactHeader(row)) {
      expectData = true;
      continue;
    }

    if (current && expectData) {
      const monthCell = row[0] ?? "";
      if (ruMonthNameToMm(monthCell)) {
        buckets[current].push(row);
      }
    }
  }

  const adSpend = parseRowsToTable(buckets.adSpend, false);
  const leads = parseRowsToTable(buckets.leads, true);
  const deals = parseRowsToTable(buckets.deals, true);

  if (adSpend.length === 0 && leads.length === 0 && deals.length === 0) {
    return {
      ok: false,
      error:
        "Не найдены таблицы «Расходы на рекламу», «Лиды» и «Сделки». Проверьте разделители «;» и заголовки План/Факт.",
      warnings,
    };
  }

  if (adSpend.length === 0) warnings.push("Таблица «Расходы на рекламу» пуста или не распознана.");
  if (leads.length === 0) warnings.push("Таблица «Лиды» пуста или не распознана.");
  if (deals.length === 0) warnings.push("Таблица «Сделки» пуста или не распознана.");

  warnings.push("Файл лиды.csv: расходы в ₽ (на графике — млн ₽); лиды и сделки — целые числа.");

  return {
    ok: true,
    tables: { adSpend, leads, deals },
    warnings,
  };
}
