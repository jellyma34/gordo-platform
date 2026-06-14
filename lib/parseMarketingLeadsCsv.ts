import Papa from "papaparse";

import type { PlanFactCsvMonthlyRow } from "@/lib/marketingSalesPlanExecutionTable";

export type MarketingLeadsCsvTableKey = "adSpend" | "leads" | "costPerLead";

export type MarketingLeadsCsvParsedTables = {
  adSpend: PlanFactCsvMonthlyRow[];
  leads: PlanFactCsvMonthlyRow[];
  costPerLead: PlanFactCsvMonthlyRow[];
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
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Числа из `лиды.csv`: убрать пробелы/NBSP, запятая → точка. */
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
  const t = normalizeHeaderKey(monthRaw);
  if (!t) return null;
  for (const [prefix, mm] of RU_MONTH_PREFIX_TO_MM) {
    if (t.startsWith(prefix)) return mm;
  }
  return null;
}

/** Из «январь 2026», «01.2026» или отдельной ячейки года. */
export function parseMarketingLeadsMonthCell(raw: string): { monthLabel: string; year?: number } {
  const t = preprocessCell(raw);
  if (!t) return { monthLabel: "" };
  const y4 = t.match(/\b(19\d{2}|20\d{2})\b/);
  const year = y4 ? Number(y4[1]) : undefined;
  const monthLabel = t.replace(/\b(19\d{2}|20\d{2})\b/g, "").replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  return { monthLabel, year: Number.isFinite(year) ? year : undefined };
}

/**
 * Ключи периода только для переданных месяцев CSV.
 * Смена года — только при переходе декабрь → январь (не при любом убывании номера месяца).
 */
export function assignPeriodKeysFromRuMonthNames(
  monthNames: readonly string[],
  explicitYears?: readonly (number | undefined)[],
  baseYear?: number,
): string[] {
  const keys: string[] = [];
  let year = baseYear ?? new Date().getFullYear();
  let prevMi = 0;

  for (let i = 0; i < monthNames.length; i++) {
    const parsed = parseMarketingLeadsMonthCell(monthNames[i] ?? "");
    const label = parsed.monthLabel || (monthNames[i] ?? "");
    const mm = ruMonthNameToMm(label);
    if (!mm) continue;

    const rowYear = explicitYears?.[i] ?? parsed.year;
    if (rowYear != null && Number.isFinite(rowYear)) {
      year = rowYear;
      prevMi = Number(mm);
      keys.push(`${year}-${mm}`);
      continue;
    }

    const mi = Number(mm);
    if (prevMi === 12 && mi === 1) year += 1;
    keys.push(`${year}-${mm}`);
    prevMi = mi;
  }
  return keys;
}

function isCostPerLeadSectionLabel(t: string): boolean {
  return t.includes("стоимост") && t.includes("лид");
}

function detectSectionKey(row: string[]): MarketingLeadsCsvTableKey | null {
  for (const cell of row) {
    const t = normalizeHeaderKey(cell);
    if (!t) continue;
    if (t.includes("расход") && t.includes("реклам")) return "adSpend";
    if (isCostPerLeadSectionLabel(t)) return "costPerLead";
    if (t === "лиды" || t === "лид" || (t.includes("лид") && !t.includes("сделк"))) return "leads";
  }
  const joined = row.map((c) => normalizeHeaderKey(c)).join(" ");
  if (!joined) return null;
  if (joined.includes("расход") && joined.includes("реклам")) return "adSpend";
  if (isCostPerLeadSectionLabel(joined)) return "costPerLead";
  if (joined.includes("лид") && !joined.includes("сделк") && !joined.includes("стоимост")) return "leads";
  return null;
}

function rowIsPlanFactHeader(row: string[]): boolean {
  const joined = row.map((c) => normalizeHeaderKey(c)).join(" ");
  return joined.includes("план") && joined.includes("факт");
}

function findPlanFactColumns(row: string[]): { planCol: number; factCol: number } | null {
  let planCol: number | null = null;
  let factCol: number | null = null;
  for (let i = 0; i < row.length; i++) {
    const h = normalizeHeaderKey(row[i] ?? "");
    if (!h) continue;
    if (h.includes("план") && !h.includes("факт") && planCol == null) planCol = i;
    if (h.includes("факт") && factCol == null) factCol = i;
  }
  if (planCol == null || factCol == null) return null;
  return { planCol, factCol };
}

function isFooterOrTechnicalRow(firstCell: string): boolean {
  const t = normalizeHeaderKey(firstCell);
  if (!t) return true;
  return t.startsWith("итого") || t.startsWith("всего") || t.includes("примечан");
}

/** План/факт: одна ячейка или склеить части («1» + «116» + «736» → 1 116 736). */
function parsePlanFactPair(row: string[], planCol: number, factCol: number): { plan: number; fact: number } {
  const pick = (from: number, to: number) =>
    parseMarketingLeadsCsvNumberCell(row.slice(from, to + 1).join(" "));

  if (planCol < factCol && factCol < row.length) {
    const gap = factCol - planCol;
    if (gap === 1) {
      return {
        plan: parseMarketingLeadsCsvNumberCell(row[planCol]),
        fact: parseMarketingLeadsCsvNumberCell(row[factCol]),
      };
    }
    return {
      plan: pick(planCol, factCol - 1),
      fact: parseMarketingLeadsCsvNumberCell(row[factCol]),
    };
  }

  const tail = row.slice(1).filter((c) => preprocessCell(c));
  if (tail.length >= 2) {
    const factRaw = tail[tail.length - 1]!;
    const planRaw = tail.slice(0, -1).join(" ");
    return {
      plan: parseMarketingLeadsCsvNumberCell(planRaw),
      fact: parseMarketingLeadsCsvNumberCell(factRaw),
    };
  }

  return { plan: 0, fact: 0 };
}

type SectionBuffer = {
  rows: string[][];
  planCol: number | null;
  factCol: number | null;
};

function parseYearOnlyCell(cell: string): number | null {
  const m = /^(19\d{2}|20\d{2})$/.exec(preprocessCell(cell));
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) ? y : null;
}

function parseSectionBuffer(buf: SectionBuffer, integerValues: boolean): PlanFactCsvMonthlyRow[] {
  const monthNames: string[] = [];
  const explicitYears: Array<number | undefined> = [];
  const rawRows: Array<{ plan: number; fact: number }> = [];

  for (const row of buf.rows) {
    let monthCol = 0;
    let rowYear: number | undefined;
    const y0 = parseYearOnlyCell(row[0] ?? "");
    if (y0 != null) {
      rowYear = y0;
      monthCol = 1;
    }

    const monthParsed = parseMarketingLeadsMonthCell(row[monthCol] ?? "");
    const monthLabel = monthParsed.monthLabel || preprocessCell(row[monthCol] ?? "");
    if (!monthLabel || isFooterOrTechnicalRow(monthLabel)) continue;
    if (!ruMonthNameToMm(monthLabel)) continue;

    let plan: number;
    let fact: number;
    if (buf.planCol != null && buf.factCol != null) {
      ({ plan, fact } = parsePlanFactPair(row, buf.planCol, buf.factCol));
    } else {
      const tail = row.slice(monthCol + 1).filter((c) => preprocessCell(c));
      plan = parseMarketingLeadsCsvNumberCell(tail.length >= 2 ? tail.slice(0, -1).join(" ") : tail[0]);
      fact = parseMarketingLeadsCsvNumberCell(tail.length >= 2 ? tail[tail.length - 1] : tail[1]);
    }

    if (integerValues) {
      plan = Math.round(plan);
      fact = Math.round(fact);
    }

    if (plan === 0 && fact === 0) continue;

    monthNames.push(monthLabel);
    explicitYears.push(rowYear ?? monthParsed.year);
    rawRows.push({ plan, fact });
  }

  const periodKeys = assignPeriodKeysFromRuMonthNames(monthNames, explicitYears);
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
 * `лиды.csv`: блоки «Расходы на рекламу», «Лиды», «Стоимость лида» (месяц / План / Факт).
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

  const buffers: Record<MarketingLeadsCsvTableKey, SectionBuffer> = {
    adSpend: { rows: [], planCol: null, factCol: null },
    leads: { rows: [], planCol: null, factCol: null },
    costPerLead: { rows: [], planCol: null, factCol: null },
  };

  let current: MarketingLeadsCsvTableKey | null = null;

  for (const row of matrix) {
    if (!row.some((c) => c.trim())) continue;

    const section = detectSectionKey(row);
    if (section) {
      current = section;
      continue;
    }

    if (!current) continue;

    if (rowIsPlanFactHeader(row)) {
      const cols = findPlanFactColumns(row);
      if (cols) {
        buffers[current].planCol = cols.planCol;
        buffers[current].factCol = cols.factCol;
      }
      continue;
    }

    const monthCell = row[0] ?? "";
    if (ruMonthNameToMm(monthCell)) {
      buffers[current].rows.push(row);
    }
  }

  const adSpend = parseSectionBuffer(buffers.adSpend, false);
  const leads = parseSectionBuffer(buffers.leads, true);
  const costPerLead = parseSectionBuffer(buffers.costPerLead, true);

  if (adSpend.length === 0 && leads.length === 0 && costPerLead.length === 0) {
    return {
      ok: false,
      error:
        "Не найдены таблицы «Расходы на рекламу», «Лиды» или «Стоимость лида». Проверьте разделитель «;» и заголовки План/Факт.",
      warnings,
    };
  }

  if (adSpend.length === 0) warnings.push("Таблица «Расходы на рекламу» пуста или не распознана.");
  if (leads.length === 0) warnings.push("Таблица «Лиды» пуста или не распознана.");
  if (costPerLead.length === 0) warnings.push("Таблица «Стоимость лида» пуста или не распознана.");

  warnings.push(
    "Файл лиды.csv: расходы в ₽ (на графике — млн ₽); лиды — целые числа; стоимость лида — ₽ из отдельной секции CSV.",
  );

  return {
    ok: true,
    tables: { adSpend, leads, costPerLead },
    warnings,
  };
}
