import Papa from "papaparse";

import {
  emptySalesPlanExecutionDataset,
  type SalesPlanExecutionDataset,
  type SalesPlanExecutionMonthlyPoint,
  type SalesPlanExecutionRow,
  type SalesPlanExecutionRowId,
  type SalesPlanExecutionSummary,
} from "@/lib/marketingSalesPlanExecutionTable";
import { lastYmdOfPeriodKey, transformSalesExecutionCsv } from "@/lib/transformSalesExecutionCsv";

/** Сырые строки CSV после нормализации заголовков (legacy path). */

export type SalesPlanExecutionCsvRow = Record<string, string>;

export type SalesPlanExecutionCsvParseOk = {
  ok: true;

  dataset: SalesPlanExecutionDataset;

  warnings: string[];
};

export type SalesPlanExecutionCsvParseResult =
  | SalesPlanExecutionCsvParseOk
  | { ok: false; error: string; warnings?: string[] };

/** Гибкое сопоставление колонок (рус/англ, выгрузки Excel/Верба). Длинные алиасы важнее при скоринге. */

export const COLUMN_ALIASES = {
  category: [
    "Наименование",

    "Категория",

    "Тип",

    "Сегмент",

    "Показатель",

    "category_id",

    "category",

    "категория",

    "название",

    "наименование",

    "код",

    "тип объекта",

    "тип_объекта",

    "segment",
  ],

  planProject: [
    "План проекта",

    "План на проект",

    "Общий план",

    "План (проект)",

    "plan_project_rub",

    "plan_project",

    "план_проект",

    "план_проекта",

    "планпроекта",

    "План",
  ],

  planMonth: [
    "План на отчет. месяц",

    "План на отчётный месяц",

    "План на отчетный месяц",

    "План месяца",

    "Месячный план",

    "План отчетного месяца",

    "plan_report_month_rub",

    "план_отчетного_месяца",

    "план_месяц",

    "план месяц",
  ],

  planAccumulated: [
    "План накопит. итогом",

    "План накопит.",

    "План накопительно",

    "План накоп.",

    "План накоп",

    "plan_cumulative_rub",

    "plan_cumulative",

    "план_накопительно",

    "план_накоп",

    "планнакоп",
  ],

  factAccumulated: [
    "Факт* накопительно по заключен. ДДУ",

    "Факт* накопительно",

    "Факт накопительно по заключен. ДДУ",

    "Факт накопительно",

    "Факт накоп",

    "Факт (накоп.)",

    "fact_cumulative_rub",

    "fact_cumulative",

    "факт_накопительно",

    "факт_накоп",

    "фактнакоп",

    "Факт всего",

    "Факт",
  ],

  factMonth: [
    "Факт за месяц",
    "Факт месяца",
    "Факт отчетного месяца",
    "Факт* в отчет. месяце",
    "Факт* в отчет месяце",
    "Факт в отчет. месяце",
    "Факт в отчет месяце",
    "Факт в отчет. месяце по заключен. ДДУ",
    "Факт в отчет месяце по заключен. ДДУ",
  ],

  deviation: [
    "Отклонение",

    "Откл.",

    "Отклонение руб",

    "deviation_rub",

    "отклонение",
  ],

  percent: [
    "% выполнения накопительно",

    "% выполнения",

    "Выполнение",

    "% вып.",

    "completion_pct",

    "percent_complete",

    "выполнение",

    "выполнение_pct",
  ],

  dealsPlan: [
    "Сделок план",

    "Кол-во сделок план",

    "deals_plan",

    "сделок_план",

    "кол_сделок_план",
  ],

  dealsFact: [
    "Сделок факт",

    "Кол-во сделок факт",

    "deals_fact",

    "сделок_факт",

    "кол_сделок_факт",
  ],

  reportDate: [
    "Отчетная дата",

    "Отчётная дата",

    "report_date",

    "дата отчета",

    "дата_отчета",

    "as_of",
  ],

  periodKey: ["period_key", "Период", "Месяц", "YYYY-MM", "период", "месяц"],

  monthPlan: [
    "plan_month_rub",

    "План (месяц)",

    "план_месяц_rub",

    "план помесячно",
  ],

  monthFact: ["fact_month_rub", "Факт (месяц)", "факт_месяц_rub"],
} as const;

/** Заголовки колонки «тип строки» в старых CSV (kind / monthly). */
const CSV_KIND_ALIASES = [
  "kind",
  "тип",
  "row_type",
  "тип_строки",
  "type",
] as const;

export type SalesPlanColumnSlot = keyof typeof COLUMN_ALIASES;

const ORDERED_ROW_IDS: SalesPlanExecutionRowId[] = [
  "apartments",

  "apt_1r",

  "apt_2r",

  "apt_3r",

  "apt_4p",

  "parking",

  "storage",

  "commercial",

  "total",
];

const DEFAULT_ROW_NAMES: Record<SalesPlanExecutionRowId, string> = {
  apartments: "Квартиры",

  apt_1r: "1-ком квартиры",

  apt_2r: "2-ком квартиры",

  apt_3r: "3-ком квартиры",

  apt_4p: "4-ком и более",

  parking: "Парковки",

  storage: "Кладовые",

  commercial: "Коммерция",

  total: "ИТОГО",
};

const CATEGORY_TO_ID: ReadonlyArray<{
  keys: readonly string[];
  id: SalesPlanExecutionRowId;
}> = [
  {
    keys: ["apartments", "квартиры", "квартиры_всего", "жилые", "residential"],
    id: "apartments",
  },

  {
    keys: ["apt_1r", "1-ком", "1ком", "1к", "1_room", "однокомнатные"],
    id: "apt_1r",
  },

  {
    keys: ["apt_2r", "2-ком", "2ком", "2к", "2_room", "двухкомнатные"],
    id: "apt_2r",
  },

  {
    keys: ["apt_3r", "3-ком", "3ком", "3к", "3_room", "трехкомнатные"],
    id: "apt_3r",
  },

  {
    keys: ["apt_4p", "4-ком", "4+ком", "4ком", "4_room", "четырехкомнатные"],
    id: "apt_4p",
  },

  {
    keys: ["parking", "парковки", "парковка", "мм", "машиноместа"],
    id: "parking",
  },

  { keys: ["storage", "кладовые", "кладовая"], id: "storage" },

  {
    keys: ["commercial", "коммерция", "нжп", "коммерческие", "коммерческие помещения"],
    id: "commercial",
  },

  { keys: ["total", "итого", "всего", "sum", "итог"], id: "total" },
];

/** Строка считается аналитикой по названию, даже без маркера summary (Верба и др.). */

const ANALYTICS_NAME_MARKERS = [
  "квартир",

  "парковк",

  "кладов",

  "коммерц",

  "1-ком",

  "2-ком",

  "3-ком",

  "4-ком",

  "одноком",

  "двухком",

  "трехком",

  "четырехком",

  "итого",

  "всего",

  "машиномест",

  "апартамент",
];

function dbg(...args: unknown[]) {
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console

    console.log(...args);
  }
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Excel РФ: чаще `;`, экспорт с запятой в числах — `,`. */
function sniffCsvDelimiter(text: string): string {
  const lines = stripBom(text).split(/\r?\n/).slice(0, 48);
  let commas = 0;
  let semis = 0;
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    commas += (t.match(/,/g) ?? []).length;
    semis += (t.match(/;/g) ?? []).length;
  }
  return semis > commas ? ";" : ",";
}

/** Декодирование загрузки: UTF-8 и при необходимости Windows-1251 (кириллица в Excel). */

export function decodeSalesPlanExecutionCsvBytes(buf: ArrayBuffer): string {
  const variants = tryDecodeSalesPlanExecutionCsvBytes(buf);

  if (variants.length === 1) return variants[0];

  const score = (s: string) => {
    const cyr = (s.match(/[А-Яа-яЁё]/g) ?? []).length;

    const repl = (s.match(/\uFFFD/g) ?? []).length;

    return cyr * 3 - repl * 20;
  };

  let best = variants[0];

  let bestS = score(best);

  for (let i = 1; i < variants.length; i++) {
    const sc = score(variants[i]!);

    if (sc > bestS) {
      best = variants[i]!;

      bestS = sc;
    }
  }

  return best;
}

export function tryDecodeSalesPlanExecutionCsvBytes(
  buf: ArrayBuffer,
): string[] {
  const out: string[] = [];

  const utf8 = stripBom(new TextDecoder("utf-8", { fatal: false }).decode(buf));

  out.push(utf8);

  try {
    const w1251 = stripBom(
      new TextDecoder("windows-1251", { fatal: false }).decode(buf),
    );

    if (w1251 !== utf8) out.push(w1251);
  } catch {
    /* ignore */
  }

  return out;
}

function normalizeHeaderKey(raw: string): string {
  return stripBom(raw)
    .trim()

    .toLowerCase()

    .replace(/\u00a0/g, " ")

    .replace(/\s+/g, "_")

    .replace(/[()«»]/g, "");
}

/** Текст ячейки: trim, пробелы, NBSP. */

export function preprocessCell(raw: string | undefined | null): string {
  return stripBom(String(raw ?? ""))
    .replace(/\u00a0/g, " ")

    .replace(/\s+/g, " ")

    .trim();
}

function normalizeForAlias(raw: string): string {
  return preprocessCell(raw)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/_/g, " ");
}

/** Безопасный разбор денег/чисел: пробелы, «млн», запятая, неразрывные пробелы. */

export function parseExecutionCsvNumber(
  raw: string | undefined | null,
): number | null {
  if (raw == null) return null;

  let s = preprocessCell(String(raw)).replace(/\s/g, "");

  if (!s || s === "—" || s === "-") return null;

  s = s.replace(",", ".");

  const lower = s.toLowerCase();

  let mult = 1;

  if (/\bмлрд\b/u.test(lower) || lower.includes("млрд")) {
    mult = 1_000_000_000;

    s = s.replace(/\s*млрд\.?\s*/giu, "");
  } else if (/\bмлн\b/u.test(lower) || lower.includes("млн")) {
    mult = 1_000_000;

    s = s.replace(/\s*млн\.?\s*/giu, "");
  }

  s = s

    .replace(/\s/g, "")

    .replace(/руб\.?/gi, "")

    .replace(/₽/g, "");

  const n = Number(s.replace("%", ""));

  if (!Number.isFinite(n)) return null;

  return n * mult;
}

function pickCell(
  row: SalesPlanExecutionCsvRow,
  keys: readonly string[],
): string {
  for (const k of keys) {
    const nk = normalizeHeaderKey(k);

    for (const [hk, val] of Object.entries(row)) {
      if (
        normalizeHeaderKey(hk) === nk &&
        val != null &&
        String(val).trim() !== ""
      )
        return String(val);
    }
  }

  return "";
}

function resolveCategoryId(raw: string): SalesPlanExecutionRowId | null {
  const key = normalizeHeaderKey(raw).replace(/_/g, "");

  if (!key) return null;

  for (const { keys, id } of CATEGORY_TO_ID) {
    for (const alias of keys) {
      if (
        key === alias.replace(/_/g, "") ||
        key.includes(alias.replace(/_/g, ""))
      )
        return id;
    }
  }

  return null;
}

function isAnalyticsLabel(cat: string): boolean {
  const t = normalizeForAlias(cat);

  if (!t) return false;

  if (resolveCategoryId(t)) return true;

  return ANALYTICS_NAME_MARKERS.some((m) => t.includes(m));
}

function parseYmdLoose(s: string): string | null {
  const t = preprocessCell(s);

  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);

  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  const d = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(t);

  if (d) return `${d[3]}-${d[2]}-${d[1]}`;

  return null;
}

function parseMonthKey(s: string): string | null {
  const t = preprocessCell(s);

  if (/^\d{4}-\d{2}$/.test(t)) return t;

  const d = /^(\d{2})\.(\d{4})$/.exec(t);

  if (d) return `${d[2]}-${d[1]}`;

  return null;
}

/** YYYY-MM из заголовков/ячеек Excel (ноя 25, март 2025, 2025.03, …). */
function parseFlexibleMonthKey(raw: string): string | null {
  const t = preprocessCell(raw);

  if (!t) return null;

  const strict = parseMonthKey(t);

  if (strict) return strict;

  const inv = /^(\d{1,2})[./-](\d{4})$/.exec(t.replace(/\s/g, ""));

  if (inv) return `${inv[2]}-${String(inv[1]).padStart(2, "0")}`;

  const ymp = /^(\d{4})[./\s-]+(\d{1,2})$/.exec(t.replace(/\s/g, ""));

  if (ymp) return `${ymp[1]}-${String(ymp[2]).padStart(2, "0")}`;

  const ruLong =
    /(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-я]*[.\s]+(20\d{2})/iu.exec(
      t,
    );

  if (ruLong) {
    const mi = ruFullMonthToMm(ruLong[1]!);

    if (mi) return `${ruLong[2]}-${mi}`;
  }

  const ruShort =
    /\b(янв|фев|мар|апр|ма[йя]|июн|июл|авг|сен|окт|ноя|дек)[.\s'']*['']?(\d{2})\b/iu.exec(
      t.replace(/\u00a0/g, " "),
    );

  if (ruShort) {
    const mi = ruAbbrevMonthToMm(ruShort[1]!.toLowerCase());

    if (!mi) return null;

    const yy = Number(ruShort[2]);

    const y = yy >= 70 ? 1900 + yy : 2000 + yy;

    return `${y}-${mi}`;
  }

  return null;
}

function ruFullMonthToMm(word: string): string | null {
  const w = word.toLowerCase();

  const pairs: [RegExp, string][] = [
    [/^январ/i, "01"],
    [/^феврал/i, "02"],
    [/^март/i, "03"],
    [/^апрел/i, "04"],
    [/^ма[йя]/i, "05"],
    [/^июн/i, "06"],
    [/^июл/i, "07"],
    [/^август/i, "08"],
    [/^сентябр/i, "09"],
    [/^октябр/i, "10"],
    [/^ноябр/i, "11"],
    [/^декабр/i, "12"],
  ];

  for (const [re, mm] of pairs) {
    if (re.test(w)) return mm;
  }

  return null;
}

function ruAbbrevMonthToMm(abbr: string): string | null {
  const a = abbr.slice(0, 3);

  const map: Record<string, string> = {
    янв: "01",
    фев: "02",
    мар: "03",
    апр: "04",
    май: "05",
    маи: "05",
    июн: "06",
    июл: "07",
    авг: "08",
    сен: "09",
    окт: "10",
    ноя: "11",
    дек: "12",
  };

  return map[a] ?? null;
}

function findMonthKeyInCells(vals: string[]): string | null {
  for (const v of vals) {
    const c = preprocessCell(v);

    const pk = parseFlexibleMonthKey(c);

    if (pk) return pk;

    const m = /\b(20\d{2})-(\d{2})\b/.exec(c);

    if (m) return `${m[1]}-${m[2]}`;
  }

  return null;
}

/** Две первые суммы в строке (после служебных колонок) — помесячные выгрузки без явных имён «план/факт». */
function inferMonthPlanFactFromRow(
  row: string[],
  mapping: ColumnMapping,
): { plan: number; fact: number } | null {
  const skip = new Set<number>();

  if (mapping.category != null) skip.add(mapping.category);

  if (mapping.periodKey != null) skip.add(mapping.periodKey);

  if (mapping.reportDate != null) skip.add(mapping.reportDate);

  const nums: number[] = [];

  for (let j = 0; j < row.length; j++) {
    if (skip.has(j)) continue;

    const n = parseNumAt(row, j);

    if (n != null && Number.isFinite(n)) nums.push(n);
  }

  if (nums.length >= 2) return { plan: nums[0]!, fact: nums[1]! };

  if (nums.length === 1) return { plan: nums[0]!, fact: 0 };

  return null;
}

/** Колонки-месяцы + строки «План»/«Факт» под заголовками (широкая таблица Excel). */
function mergeWideFormatMonthlyIntoBuckets(
  dataRows: string[][],
  labels: string[],
  mapping: ColumnMapping,
  monthlyBuckets: Map<string, { plan: number; fact: number }>,
  warnings: string[],
): void {
  if (monthlyBuckets.size > 0) return;

  const catIdx = mapping.category ?? 0;

  const monthCols: { j: number; key: string }[] = [];

  for (let j = 0; j < labels.length; j++) {
    const lab = labels[j] ?? "";

    if (lab.startsWith("__col_")) continue;

    const key = parseFlexibleMonthKey(lab);

    if (key) monthCols.push({ j, key });
  }

  if (monthCols.length < 2) return;

  const isPlanLabel = (l: string) => {
    if (!l) return false;

    if (l === "план" || l === "plan") return true;

    return (
      l.startsWith("план ") &&
      !l.includes("накоп") &&
      !l.includes("проект") &&
      !l.includes("отчет") &&
      !l.includes("отчёт")
    );
  };

  const isFactLabel = (l: string) => {
    if (!l) return false;

    if (l === "факт" || l === "fact") return true;

    return l.startsWith("факт ") && !l.includes("накоп");
  };

  const planRows: string[][] = [];

  const factRows: string[][] = [];

  for (const row of dataRows) {
    const ext = [...row];

    while (ext.length < labels.length) ext.push("");

    const rawCat = cellAt(ext, catIdx);

    if (isAnalyticsLabel(rawCat)) continue;

    const l = normalizeForAlias(rawCat);

    if (!l) continue;

    if (isPlanLabel(l)) planRows.push(ext);

    if (isFactLabel(l)) factRows.push(ext);
  }

  if (planRows.length === 0 && factRows.length === 0) return;

  if (planRows.length > 1) {
    warnings.push(
      "В wide-формате найдено несколько строк «План» — суммированы по месяцам.",
    );
  }

  if (factRows.length > 1) {
    warnings.push(
      "В wide-формате найдено несколько строк «Факт» — суммированы по месяцам.",
    );
  }

  for (const { j, key } of monthCols.sort((a, b) => a.key.localeCompare(b.key))) {
    let plan = 0;

    let fact = 0;

    for (const pr of planRows) {
      plan += parseNumAt(pr, j) ?? 0;
    }

    for (const fr of factRows) {
      fact += parseNumAt(fr, j) ?? 0;
    }

    if (plan === 0 && fact === 0) continue;

    const b = monthlyBuckets.get(key) ?? { plan: 0, fact: 0 };

    b.plan += plan;

    b.fact += fact;

    monthlyBuckets.set(key, b);
  }
}


function completionFrom(planCum: number, factCum: number): number | null {
  if (!(planCum > 0) || !Number.isFinite(planCum)) return null;

  return (factCum / planCum) * 100;
}

function deriveSummaryFromRows(
  rows: SalesPlanExecutionRow[],
): SalesPlanExecutionSummary {
  const total = rows.find((r) => r.id === "total");

  const planCumulativeRub = total?.planCumulativeRub ?? 0;

  const factCumulativeRub = total?.factCumulativeRub ?? 0;

  return {
    planCumulativeRub,

    factCumulativeRub,

    completionPct: completionFrom(planCumulativeRub, factCumulativeRub),

    deviationRub: factCumulativeRub - planCumulativeRub,
  };
}

function computeSharePct(rows: SalesPlanExecutionRow[]): void {
  const base = rows.filter((r) => !r.isTotal);

  const sumPlan = base.reduce(
    (a, r) =>
      a + (Number.isFinite(r.planCumulativeRub) ? r.planCumulativeRub : 0),
    0,
  );

  for (const r of rows) {
    if (r.isTotal) {
      r.shareOfVolumePct = 100;

      continue;
    }

    if (sumPlan > 0 && Number.isFinite(r.planCumulativeRub)) {
      r.shareOfVolumePct =
        Math.round((r.planCumulativeRub / sumPlan) * 100 * 1000) / 1000;
    } else {
      r.shareOfVolumePct = 0;
    }
  }
}

type ColumnMapping = Partial<Record<SalesPlanColumnSlot, number>>;

function buildMergedLabels(
  grid: string[][],
  start: number,
  depth: number,
): string[] {
  const chunk = grid.slice(start, start + depth);

  const width = chunk.reduce((w, r) => Math.max(w, r.length), 0);

  const labels: string[] = [];

  for (let c = 0; c < width; c++) {
    const parts: string[] = [];

    for (let r = 0; r < depth; r++) {
      const t = preprocessCell(chunk[r]?.[c] ?? "");

      if (t) parts.push(t);
    }

    labels.push(parts.join(" ").trim() || `__col_${c}`);
  }

  return labels;
}

function aliasMatchScore(headerNorm: string, alias: string): number {
  const a = normalizeForAlias(alias);

  const h = headerNorm;

  if (!a || !h) return 0;

  if (h === a) return 200 + a.length;

  if (h.includes(a)) return 100 + a.length;

  if (a.includes(h) && h.length >= 4) return 50 + h.length;

  return 0;
}

function scoreColumnForSlot(
  headerLabel: string,
  slot: SalesPlanColumnSlot,
): number {
  const hn = normalizeForAlias(headerLabel);

  let best = 0;

  for (const alias of COLUMN_ALIASES[slot]) {
    best = Math.max(best, aliasMatchScore(hn, alias));
  }

  return best;
}

function assignColumns(labels: string[]): ColumnMapping {
  type Pair = { slot: keyof ColumnMapping; col: number; score: number };

  const pairs: Pair[] = [];

  const slots = Object.keys(COLUMN_ALIASES) as SalesPlanColumnSlot[];

  for (let j = 0; j < labels.length; j++) {
    const lab = labels[j] ?? "";

    for (const slot of slots) {
      const sc = scoreColumnForSlot(lab, slot);

      if (sc > 0) pairs.push({ slot, col: j, score: sc });
    }
  }

  pairs.sort((a, b) => b.score - a.score);

  const usedCol = new Set<number>();

  const usedSlot = new Set<string>();

  const mapping: ColumnMapping = {};

  for (const p of pairs) {
    if (usedCol.has(p.col) || usedSlot.has(p.slot)) continue;

    usedCol.add(p.col);

    usedSlot.add(p.slot);

    mapping[p.slot] = p.col;
  }

  return mapping;
}

function mappingQuality(m: ColumnMapping): number {
  let q = 0;

  if (m.category != null) q += 50;

  if (m.planAccumulated != null) q += 15;

  if (m.factAccumulated != null) q += 15;

  if (m.planProject != null) q += 8;

  if (m.planMonth != null) q += 8;

  if (m.factMonth != null) q += 6;

  if (m.percent != null) q += 4;

  if (m.deviation != null) q += 4;

  if (m.periodKey != null || m.monthPlan != null || m.monthFact != null) q += 6;

  return q;
}

function cellAt(row: string[], idx: number | undefined): string {
  if (idx == null || idx < 0) return "";

  return preprocessCell(row[idx] ?? "");
}

function parseNumAt(row: string[], idx: number | undefined): number | null {
  return parseExecutionCsvNumber(cellAt(row, idx));
}

function legacyKindValue(row: string[], labels: string[]): string {
  const kindCol = labels.findIndex((l) => {
    const n = normalizeForAlias(l);

    return (
      n === "kind" ||
      n === "тип" ||
      n === "type" ||
      n === "row type" ||
      n === "тип строки"
    );
  });

  if (kindCol >= 0) return cellAt(row, kindCol);

  return "";
}

function rowLooksMonthly(
  row: string[],

  mapping: ColumnMapping,

  labels: string[],

  categoryText: string,
): { periodKey: string; plan: number; fact: number } | null {
  const pkFromCol =
    mapping.periodKey != null
      ? parseFlexibleMonthKey(cellAt(row, mapping.periodKey))
      : null;

  const pk = pkFromCol ?? findMonthKeyInCells(row);

  if (!pk) return null;

  const catTrim = preprocessCell(categoryText);

  const id = resolveCategoryId(catTrim);

  if (catTrim && id && !["total"].includes(id)) return null;

  let plan =
    parseNumAt(row, mapping.monthPlan) ??
    parseNumAt(row, mapping.planMonth) ??
    null;

  let fact =
    parseNumAt(row, mapping.monthFact) ??
    parseNumAt(row, mapping.factMonth) ??
    null;

  const lk = legacyKindValue(row, labels).toLowerCase();

  if (lk.includes("month") || lk === "месяц" || lk === "помесячно") {
    if (plan == null && fact == null) {
      plan = 0;

      fact = 0;
    }
  }

  if (pk && (plan == null || fact == null)) {
    const inf = inferMonthPlanFactFromRow(row, mapping);

    if (inf) {
      if (plan == null) plan = inf.plan;

      if (fact == null) fact = inf.fact;
    }
  }

  if (plan == null && fact == null) return null;

  return { periodKey: pk, plan: plan ?? 0, fact: fact ?? 0 };
}

function parseGrid(text: string): string[][] {
  const delim = sniffCsvDelimiter(text);

  const p = Papa.parse<string[]>(stripBom(text), {
    header: false,

    skipEmptyLines: "greedy",

    delimiter: delim,
  });

  if (p.errors?.length) {
    /* Papa может писать в errors при кривых кавычках — строки всё равно используем */
  }

  return (p.data as string[][]).filter(
    (r) => Array.isArray(r) && r.some((c) => preprocessCell(String(c))),
  );
}

/** Все строки CSV (включая пустые) — для многосекционных выгрузок Excel/Верба. */
function parseGridAllRows(text: string): string[][] {
  const delim = sniffCsvDelimiter(text);

  const p = Papa.parse<string[]>(stripBom(text), {
    header: false,

    skipEmptyLines: false,

    delimiter: delim,
  });

  return (p.data as string[][]).filter((r) => Array.isArray(r));
}

/** Секции аналитики в «вербовском» CSV (заголовок блока во 2-й колонке строки «Наименование»). */
export type SalesPlanExecutionVerbaSectionKind = "quantity" | "area" | "revenue" | "price" | "other";

export type SalesPlanExecutionVerbaSection = {
  kind: SalesPlanExecutionVerbaSectionKind;
  /** Текст из колонки 1 строки-интро («Продажи по заключенным ДДУ, руб.» и т.д.). */
  title: string;
  introRow: number;
  headerRow: number;
  headerDepth: number;
  dataStartRow: number;
  dataEndRow: number;
};

function verbaSectionTitleToKind(title: string): SalesPlanExecutionVerbaSectionKind {
  const u = normalizeForAlias(title);

  if (u.includes("количество") && u.includes("штук")) return "quantity";

  if (u.includes("площад") && u.includes("кв")) return "area";

  if (
    (u.includes("продаж") && u.includes("дду") && u.includes("руб")) ||
    (u.includes("поступлен") && u.includes("эскро") && u.includes("руб"))
  )
    return "revenue";

  if (u.includes("стоимост") && u.includes("кв")) return "price";

  return "other";
}

function isVerbaSectionIntroRow(row: string[]): boolean {
  const c0 = normalizeForAlias(cellAt(row, 0));

  const c1 = preprocessCell(row[1] ?? "");

  return (c0.includes("наименование") || c0 === "") && c1.length >= 3;
}

function isPrimaryVerbaDduRevenueIntro(row: string[]): boolean {
  if (!isVerbaSectionIntroRow(row)) return false;

  const u = normalizeForAlias(row[1] ?? "");

  return (
    u.includes("продаж") &&
    u.includes("дду") &&
    u.includes("руб") &&
    !u.includes("без учета") &&
    !u.includes("без учёта") &&
    !u.includes("расторж")
  );
}

function isPlanOnReportingMonthHeaderCell(h: string): boolean {
  const u = normalizeForAlias(h);

  if (!u.includes("план")) return false;

  if (u.includes("накоп")) return false;

  if (!(u.includes("отчет") || u.includes("отчёт"))) return false;

  return u.includes("месяц");
}

function isFactOnReportingMonthHeaderCell(h: string): boolean {
  const u = normalizeForAlias(h);

  if (!u.includes("факт")) return false;

  if (u.includes("накоп")) return false;

  if (!u.includes("месяц")) return false;

  return u.includes("отчет") || u.includes("отчёт");
}

/** Пары колонок «план отчётного месяца» → «факт отчётного месяца» (слева направо, все подтаблицы в строке). */
function collectPlanFactReportingMonthColumnBlocks(labels: string[]): { planCol: number; factCol: number }[] {
  const out: { planCol: number; factCol: number }[] = [];

  let from = 0;

  for (;;) {
    let planCol = -1;

    for (let j = from; j < labels.length; j++) {
      if (isPlanOnReportingMonthHeaderCell(labels[j] ?? "")) {
        planCol = j;

        break;
      }
    }

    if (planCol < 0) break;

    let factCol = -1;

    for (let j = planCol + 1; j < labels.length; j++) {
      if (isFactOnReportingMonthHeaderCell(labels[j] ?? "")) {
        factCol = j;

        break;
      }
    }

    if (factCol < 0) break;

    out.push({ planCol, factCol });

    from = factCol + 1;
  }

  return out;
}

function verbaExtractReportMonthPeriodKey(grid: string[][]): string | null {
  for (let i = 0; i < Math.min(grid.length, 18); i++) {
    const row = grid[i] ?? [];

    for (let j = 0; j < Math.min(row.length, 6); j++) {
      const c = preprocessCell(row[j] ?? "");

      const low = normalizeForAlias(c);

      if (low.includes("отчетн") && low.includes("дата")) {
        const next = preprocessCell(row[j + 1] ?? "");

        const ymd = parseYmdLoose(next);

        if (ymd) return ymd.slice(0, 7);
      }

      const ymd2 = parseYmdLoose(c);

      if (ymd2 && /^\d{4}-\d{2}-\d{2}$/.test(ymd2)) return ymd2.slice(0, 7);
    }
  }

  return null;
}

function verbaFindPrimaryDduRevenueIntroRow(grid: string[][]): number | null {
  for (let i = 0; i < grid.length; i++) {
    if (isPrimaryVerbaDduRevenueIntro(grid[i] ?? [])) return i;
  }

  return null;
}

function verbaResolveHeaderDepthAfterIntro(grid: string[][], introRow: number): number | null {
  for (let depth = 1; depth <= 4; depth++) {
    if (introRow + 1 + depth > grid.length) break;

    const labels = buildMergedLabels(grid, introRow + 1, depth);

    if (collectPlanFactReportingMonthColumnBlocks(labels).length > 0) return depth;
  }

  return null;
}

function verbaFindSectionDataEndRow(grid: string[][], dataStart: number): number {
  for (let r = dataStart; r < grid.length; r++) {
    if (r <= dataStart) continue;

    const row = grid[r] ?? [];

    if (!row.some((c) => preprocessCell(String(c)))) return r;

    if (isVerbaSectionIntroRow(row)) return r;
  }

  return grid.length;
}

function verbaFindItogoRowInRange(
  grid: string[][],

  dataStart: number,

  dataEnd: number,

  categoryCol: number,
): number | null {
  for (let r = dataStart; r < dataEnd; r++) {
    const name = normalizeForAlias(cellAt(grid[r] ?? [], categoryCol));

    if (name === "итого" || name.startsWith("итого")) return r;
  }

  return null;
}

/**
 * Помесячный ряд «план/факт отчётного месяца» из секции «Продажи по заключенным ДДУ, руб.»
 * (сумма подблоков ДДУ и эскроу по строке ИТОГО). Не использует накопительные итоги и summary KPI.
 */
function tryBuildVerbaPrimaryRevenueMonthlyPlanFact(
  text: string,

  reportFallbackYmd: string,

  warnings: string[],
): SalesPlanExecutionMonthlyPoint[] | null {
  const grid = parseGridAllRows(text);

  if (grid.length < 8) return null;

  const intro = verbaFindPrimaryDduRevenueIntroRow(grid);

  if (intro == null) return null;

  const headerDepth = verbaResolveHeaderDepthAfterIntro(grid, intro);

  if (headerDepth == null) return null;

  const headerRow = intro + 1;

  const dataStart = intro + 1 + headerDepth;

  const dataEnd = verbaFindSectionDataEndRow(grid, dataStart);

  const labels = buildMergedLabels(grid, headerRow, headerDepth);

  const blocks = collectPlanFactReportingMonthColumnBlocks(labels);

  if (blocks.length === 0) return null;

  const itogoRow = verbaFindItogoRowInRange(grid, dataStart, dataEnd, 0);

  if (itogoRow == null) {
    warnings.push(
      "Выгрузка Верба: в секции «Продажи по заключенным ДДУ» не найдена строка «ИТОГО» для помесячного графика.",
    );

    return null;
  }

  const row = grid[itogoRow] ?? [];

  let planSum = 0;

  let factSum = 0;

  for (const { planCol, factCol } of blocks) {
    planSum += parseNumAt(row, planCol) ?? 0;

    factSum += parseNumAt(row, factCol) ?? 0;
  }

  const pkFile = verbaExtractReportMonthPeriodKey(grid);

  const fb = preprocessCell(reportFallbackYmd).slice(0, 10);

  const periodKey =
    pkFile ?? (/^\d{4}-\d{2}/.test(fb) ? fb.slice(0, 7) : null);

  if (!periodKey) {
    warnings.push(
      "Выгрузка Верба: не удалось определить месяц для оси графика (нет отчётной даты в файле и запасной YYYY-MM).",
    );

    return null;
  }

  if (!pkFile)
    warnings.push(
      "Выгрузка Верба: отчётная дата в файле не найдена — для оси X графика использована дата из контекста загрузки.",
    );

  warnings.push(
    "Помесячный «План vs факт» построен из секции «Продажи по заключенным ДДУ, руб.» (план/факт отчётного месяца по строке ИТОГО; при двух подтаблицах — сумма ДДУ и эскроу).",
  );

  return [{ periodKey, planRub: planSum, factRub: factSum }];
}

/** Распознать аналитические блоки Verba/Excel (для отладки и последующих расширений). */
export function detectVerbaSalesPlanSections(text: string): SalesPlanExecutionVerbaSection[] {
  const grid = parseGridAllRows(text);

  const out: SalesPlanExecutionVerbaSection[] = [];

  for (let i = 0; i < grid.length; i++) {
    if (!isVerbaSectionIntroRow(grid[i] ?? [])) continue;

    const title = preprocessCell(grid[i]?.[1] ?? "");

    const kind = verbaSectionTitleToKind(title);

    const headerDepth = verbaResolveHeaderDepthAfterIntro(grid, i);

    if (headerDepth == null) continue;

    const headerRow = i + 1;

    const dataStart = i + 1 + headerDepth;

    const dataEnd = verbaFindSectionDataEndRow(grid, dataStart);

    out.push({
      kind,

      title,

      introRow: i,

      headerRow,

      headerDepth,

      dataStartRow: dataStart,

      dataEndRow: dataEnd,
    });

    i = Math.max(i, dataEnd - 1);
  }

  return out;
}

function tryParseWithGrid(
  text: string,

  reportFallbackYmd: string,

  warnings: string[],
): SalesPlanExecutionDataset | null {
  const grid = parseGrid(text);

  if (grid.length < 2) return null;

  let best: {
    dataset: SalesPlanExecutionDataset;
    score: number;
    labels: string[];
    mapping: ColumnMapping;
  } | null = null;

  const maxStart = Math.min(grid.length - 1, 22);

  for (let start = 0; start < maxStart; start++) {
    for (let depth = 1; depth <= 4; depth++) {
      if (start + depth >= grid.length) break;

      const labels = buildMergedLabels(grid, start, depth);

      const mapping = assignColumns(labels);

      if (Object.keys(mapping).length === 0) continue;

      const dataStart = start + depth;

      const dataRows = grid.slice(dataStart);

      const dataset = buildDatasetFromMappedRows(
        dataRows,
        labels,
        mapping,
        reportFallbackYmd,
        warnings,
      );

      const q = mappingQuality(mapping);

      const rowScore =
        dataset.rows.filter((r) => !r.isTotal).length * 20 +
        (dataset.monthlyPlanFact?.length ?? 0);

      const score = q + rowScore;

      if (!best || score > best.score) {
        best = { dataset, score, labels, mapping };
      }
    }
  }

  if (!best) return null;

  dbg("CSV HEADERS", best.labels);

  dbg("COLUMN MAP", best.mapping);

  dbg("NORMALIZED DATA", {
    reportDateYmd: best.dataset.reportDateYmd,

    summary: best.dataset.summary,

    rows: best.dataset.rows,

    monthly: best.dataset.monthlyPlanFact,
  });

  return best.dataset;
}

function buildDatasetFromMappedRows(
  dataRows: string[][],

  labels: string[],

  mapping: ColumnMapping,

  reportFallbackYmd: string,

  warnings: string[],
): SalesPlanExecutionDataset {
  const summaryDraft: Partial<
    Record<SalesPlanExecutionRowId, Partial<SalesPlanExecutionRow>>
  > = {};

  const monthlyBuckets = new Map<string, { plan: number; fact: number }>();

  let firstReport: string | null = null;

  const dbgRows: Record<string, unknown>[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i] ?? [];

    const extRow = [...row];

    while (extRow.length < labels.length) extRow.push("");

    const cat =
      mapping.category != null
        ? cellAt(extRow, mapping.category)
        : (labels
            .map((_, j) => cellAt(extRow, j))
            .find((c) => isAnalyticsLabel(c)) ?? "");

    const monthly = rowLooksMonthly(extRow, mapping, labels, cat);

    if (monthly) {
      const b = monthlyBuckets.get(monthly.periodKey) ?? { plan: 0, fact: 0 };

      b.plan += monthly.plan;

      b.fact += monthly.fact;

      monthlyBuckets.set(monthly.periodKey, b);

      dbgRows.push({
        i,
        kind: "monthly",
        period: monthly.periodKey,
        plan: monthly.plan,
        fact: monthly.fact,
      });

      continue;
    }

    if (!isAnalyticsLabel(cat)) continue;

    const categoryId = resolveCategoryId(cat);

    if (!categoryId) {
      warnings.push(
        `Строка ${i + 1}: не удалось сопоставить категорию «${cat}»`,
      );

      continue;
    }

    const name = preprocessCell(cat) || DEFAULT_ROW_NAMES[categoryId];

    const planProjectRub = parseNumAt(extRow, mapping.planProject) ?? 0;

    const planReportMonthRub = parseNumAt(extRow, mapping.planMonth) ?? 0;

    let planCumulativeRub = parseNumAt(extRow, mapping.planAccumulated);

    let factCumulativeRub = parseNumAt(extRow, mapping.factAccumulated);

    const factMonthOnly = parseNumAt(extRow, mapping.factMonth);

    if (planCumulativeRub == null && planProjectRub > 0)
      planCumulativeRub = planProjectRub;

    if (planCumulativeRub == null) planCumulativeRub = 0;

    if (
      factCumulativeRub == null &&
      mapping.factAccumulated == null &&
      factMonthOnly != null
    )
      factCumulativeRub = factMonthOnly;

    if (factCumulativeRub == null) factCumulativeRub = 0;

    let deviationRub =
      parseNumAt(extRow, mapping.deviation) ??
      factCumulativeRub - planCumulativeRub;

    let completionPct =
      parseNumAt(extRow, mapping.percent) ??
      completionFrom(planCumulativeRub, factCumulativeRub);

    const dealsPlanCount = parseNumAt(extRow, mapping.dealsPlan);

    const dealsFactCount = parseNumAt(extRow, mapping.dealsFact);

    const rd =
      mapping.reportDate != null ? cellAt(extRow, mapping.reportDate) : "";

    const ymd = parseYmdLoose(rd);

    if (ymd && !firstReport) firstReport = ymd;

    summaryDraft[categoryId] = {
      id: categoryId,

      name,

      planProjectRub,

      planReportMonthRub,

      factReportMonthRub: factMonthOnly ?? undefined,

      planCumulativeRub,

      factCumulativeRub,

      deviationRub,

      completionPct,

      shareOfVolumePct: 0,

      deviationComment: null,

      isTotal: categoryId === "total",

      dealsPlanCount: dealsPlanCount ?? undefined,

      dealsFactCount: dealsFactCount ?? undefined,
    };

    dbgRows.push({
      i,

      categoryId,

      name,

      planProjectRub,

      planReportMonthRub,

      planCumulativeRub,

      factCumulativeRub,
    });
  }

  mergeWideFormatMonthlyIntoBuckets(
    dataRows,
    labels,
    mapping,
    monthlyBuckets,
    warnings,
  );

  dbg("PARSED ROWS", dbgRows);

  const rows: SalesPlanExecutionRow[] = [];

  for (const id of ORDERED_ROW_IDS) {
    const d = summaryDraft[id];

    if (!d || d.id == null) continue;

    rows.push({
      id,

      name: d.name ?? DEFAULT_ROW_NAMES[id],

      planProjectRub: d.planProjectRub ?? 0,

      planReportMonthRub: d.planReportMonthRub ?? 0,

      factReportMonthRub: d.factReportMonthRub ?? undefined,

      planCumulativeRub: d.planCumulativeRub ?? 0,

      factCumulativeRub: d.factCumulativeRub ?? 0,

      deviationRub:
        d.deviationRub ??
        (d.factCumulativeRub ?? 0) - (d.planCumulativeRub ?? 0),

      completionPct:
        d.completionPct != null && Number.isFinite(d.completionPct)
          ? d.completionPct
          : completionFrom(d.planCumulativeRub ?? 0, d.factCumulativeRub ?? 0),

      shareOfVolumePct: d.shareOfVolumePct ?? 0,

      deviationComment: d.deviationComment ?? null,

      isTotal: id === "total",

      dealsPlanCount: d.dealsPlanCount,

      dealsFactCount: d.dealsFactCount,
    });
  }

  if (!rows.some((r) => r.id === "total") && rows.length > 0) {
    const planCumulativeRub = rows
      .filter((r) => !r.isTotal)
      .reduce((a, r) => a + r.planCumulativeRub, 0);

    const factCumulativeRub = rows
      .filter((r) => !r.isTotal)
      .reduce((a, r) => a + r.factCumulativeRub, 0);

    rows.push({
      id: "total",

      name: DEFAULT_ROW_NAMES.total,

      planProjectRub: rows
        .filter((r) => !r.isTotal)
        .reduce((a, r) => a + r.planProjectRub, 0),

      planReportMonthRub: rows
        .filter((r) => !r.isTotal)
        .reduce((a, r) => a + r.planReportMonthRub, 0),

      factReportMonthRub: rows
        .filter((r) => !r.isTotal)
        .reduce((a, r) => a + (r.factReportMonthRub ?? 0), 0),

      planCumulativeRub,

      factCumulativeRub,

      deviationRub: factCumulativeRub - planCumulativeRub,

      completionPct: completionFrom(planCumulativeRub, factCumulativeRub),

      shareOfVolumePct: 100,

      deviationComment: null,

      isTotal: true,
    });

    warnings.push(
      "Строка «ИТОГО» в CSV не найдена — итог посчитан суммой по категориям.",
    );
  }

  computeSharePct(rows);

  const reportDateYmd = firstReport ?? reportFallbackYmd;

  const summary = deriveSummaryFromRows(rows);

  const monthlyPlanFact: SalesPlanExecutionMonthlyPoint[] = [
    ...monthlyBuckets.entries(),
  ]

    .sort(([a], [b]) => a.localeCompare(b))

    .map(([periodKey, v]) => ({
      periodKey,

      planRub: v.plan,

      factRub: v.fact,
    }));

  return {
    reportDateYmd,

    summary,

    rows,

    monthlyPlanFact: monthlyPlanFact.length ? monthlyPlanFact : null,
  };
}

/** Legacy: однострочный заголовок + kind/monthly (default.raw.csv). */

function tryParseLegacyHeaderMode(
  text: string,
  reportFallbackYmd: string,
  warnings: string[],
): SalesPlanExecutionDataset | null {
  const parsed = Papa.parse<Record<string, string>>(stripBom(text), {
    header: true,

    skipEmptyLines: "greedy",

    delimiter: sniffCsvDelimiter(text),

    transformHeader: (h) => normalizeHeaderKey(h),
  });

  const rawRows = (parsed.data ?? []).filter(
    (r) =>
      r &&
      typeof r === "object" &&
      Object.keys(r).some((k) =>
        preprocessCell(String((r as Record<string, string>)[k])),
      ),
  ) as SalesPlanExecutionCsvRow[];

  if (!rawRows.length) return null;

  const keys = Object.keys(rawRows[0] ?? {});

  const hasKind = keys.some((k) => normalizeHeaderKey(k) === "kind");

  const hasCategory = keys.some((k) => {
    const nk = normalizeHeaderKey(k);
    return (
      nk === "category_id" ||
      nk === "category_name" ||
      nk === "категория" ||
      nk === "category" ||
      nk === "наименование" ||
      nk === "название" ||
      nk === "сегмент" ||
      nk === "тип"
    );
  });

  if (!hasKind && !hasCategory) return null;

  const summaryDraft: Partial<
    Record<SalesPlanExecutionRowId, Partial<SalesPlanExecutionRow>>
  > = {};

  const monthlyBuckets = new Map<string, { plan: number; fact: number }>();

  let firstReport: string | null = null;

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i]!;

    const kind = pickCell(row, [...CSV_KIND_ALIASES]).toLowerCase();

    const catRaw = pickCell(row, [...COLUMN_ALIASES.category]);

    const periodRaw = pickCell(row, [
      ...COLUMN_ALIASES.periodKey,
      "yyyy-mm",
      "month",
    ]);

    const isMonthly =
      kind.includes("month") ||
      kind === "месяц" ||
      kind === "помесячно" ||
      (!catRaw.trim() && !!parseFlexibleMonthKey(periodRaw));

    if (isMonthly && parseFlexibleMonthKey(periodRaw)) {
      const pk = parseFlexibleMonthKey(periodRaw)!;

      const planM =
        parseExecutionCsvNumber(
          pickCell(row, [
            ...COLUMN_ALIASES.monthPlan,
            "план",
            "plan_rub",
            "план_руб",
          ]),
        ) ?? 0;

      const factM =
        parseExecutionCsvNumber(
          pickCell(row, [
            ...COLUMN_ALIASES.monthFact,
            "факт",
            "fact_rub",
            "факт_руб",
          ]),
        ) ?? 0;

      const b = monthlyBuckets.get(pk) ?? { plan: 0, fact: 0 };

      b.plan += planM;

      b.fact += factM;

      monthlyBuckets.set(pk, b);

      continue;
    }

    const categoryId = resolveCategoryId(catRaw);

    if (!categoryId) {
      if (catRaw.trim())
        warnings.push(`Строка ${i + 2}: неизвестная категория «${catRaw}»`);

      continue;
    }

    const name =
      pickCell(row, [
        "category_name",
        "name",
        "наименование",
        "название",
      ]).trim() || DEFAULT_ROW_NAMES[categoryId];

    const planProjectRub =
      parseExecutionCsvNumber(pickCell(row, [...COLUMN_ALIASES.planProject])) ??
      0;

    const planReportMonthRub =
      parseExecutionCsvNumber(pickCell(row, [...COLUMN_ALIASES.planMonth])) ??
      0;

    const planCumulativeRub =
      parseExecutionCsvNumber(
        pickCell(row, [...COLUMN_ALIASES.planAccumulated]),
      ) ?? 0;

    const factCumulativeRub =
      parseExecutionCsvNumber(
        pickCell(row, [...COLUMN_ALIASES.factAccumulated]),
      ) ?? 0;

    const factReportMonthRub =
      parseExecutionCsvNumber(pickCell(row, [...COLUMN_ALIASES.factMonth])) ??
      null;

    let deviationRub =
      parseExecutionCsvNumber(pickCell(row, [...COLUMN_ALIASES.deviation])) ??
      factCumulativeRub - planCumulativeRub;

    let completionPct =
      parseExecutionCsvNumber(pickCell(row, [...COLUMN_ALIASES.percent])) ??
      completionFrom(planCumulativeRub, factCumulativeRub);

    const sharePct = parseExecutionCsvNumber(
      pickCell(row, ["share_pct", "share_of_volume", "доля", "доля_процент"]),
    );

    const comment =
      pickCell(row, ["comment", "комментарий", "примечание"]).trim() || null;

    const dealsPlanCount = parseExecutionCsvNumber(
      pickCell(row, [...COLUMN_ALIASES.dealsPlan]),
    );

    const dealsFactCount = parseExecutionCsvNumber(
      pickCell(row, [...COLUMN_ALIASES.dealsFact]),
    );

    const rd = pickCell(row, [...COLUMN_ALIASES.reportDate]);

    const ymd = parseYmdLoose(rd);

    if (ymd && !firstReport) firstReport = ymd;

    summaryDraft[categoryId] = {
      id: categoryId,

      name,

      planProjectRub,

      planReportMonthRub,

      factReportMonthRub: factReportMonthRub ?? undefined,

      planCumulativeRub,

      factCumulativeRub,

      deviationRub,

      completionPct,

      shareOfVolumePct: sharePct ?? 0,

      deviationComment: comment,

      isTotal: categoryId === "total",

      dealsPlanCount: dealsPlanCount ?? undefined,

      dealsFactCount: dealsFactCount ?? undefined,
    };
  }

  const rows: SalesPlanExecutionRow[] = [];

  for (const id of ORDERED_ROW_IDS) {
    const d = summaryDraft[id];

    if (!d || d.id == null) continue;

    rows.push({
      id,

      name: d.name ?? DEFAULT_ROW_NAMES[id],

      planProjectRub: d.planProjectRub ?? 0,

      planReportMonthRub: d.planReportMonthRub ?? 0,

      factReportMonthRub: d.factReportMonthRub ?? undefined,

      planCumulativeRub: d.planCumulativeRub ?? 0,

      factCumulativeRub: d.factCumulativeRub ?? 0,

      deviationRub:
        d.deviationRub ??
        (d.factCumulativeRub ?? 0) - (d.planCumulativeRub ?? 0),

      completionPct:
        d.completionPct != null && Number.isFinite(d.completionPct)
          ? d.completionPct
          : completionFrom(d.planCumulativeRub ?? 0, d.factCumulativeRub ?? 0),

      shareOfVolumePct: d.shareOfVolumePct ?? 0,

      deviationComment: d.deviationComment ?? null,

      isTotal: id === "total",

      dealsPlanCount: d.dealsPlanCount,

      dealsFactCount: d.dealsFactCount,
    });
  }

  if (!rows.length) return null;

  if (!rows.some((r) => r.id === "total") && rows.length > 0) {
    const planCumulativeRub = rows
      .filter((r) => !r.isTotal)
      .reduce((a, r) => a + r.planCumulativeRub, 0);

    const factCumulativeRub = rows
      .filter((r) => !r.isTotal)
      .reduce((a, r) => a + r.factCumulativeRub, 0);

    rows.push({
      id: "total",

      name: DEFAULT_ROW_NAMES.total,

      planProjectRub: rows
        .filter((r) => !r.isTotal)
        .reduce((a, r) => a + r.planProjectRub, 0),

      planReportMonthRub: rows
        .filter((r) => !r.isTotal)
        .reduce((a, r) => a + r.planReportMonthRub, 0),

      factReportMonthRub: rows
        .filter((r) => !r.isTotal)
        .reduce((a, r) => a + (r.factReportMonthRub ?? 0), 0),

      planCumulativeRub,

      factCumulativeRub,

      deviationRub: factCumulativeRub - planCumulativeRub,

      completionPct: completionFrom(planCumulativeRub, factCumulativeRub),

      shareOfVolumePct: 100,

      deviationComment: null,

      isTotal: true,
    });

    warnings.push(
      "Строка «ИТОГО» в CSV не найдена — итог посчитан суммой по категориям.",
    );
  }

  computeSharePct(rows);

  const reportDateYmd = firstReport ?? reportFallbackYmd;

  const summary = deriveSummaryFromRows(rows);

  const monthlyPlanFact: SalesPlanExecutionMonthlyPoint[] = [
    ...monthlyBuckets.entries(),
  ]

    .sort(([a], [b]) => a.localeCompare(b))

    .map(([periodKey, v]) => ({
      periodKey,

      planRub: v.plan,

      factRub: v.fact,
    }));

  dbg("CSV HEADERS", keys);

  dbg("PARSED ROWS", rawRows);

  dbg("NORMALIZED DATA", { reportDateYmd, summary, rows, monthlyPlanFact });

  return {
    reportDateYmd,

    summary,

    rows,

    monthlyPlanFact: monthlyPlanFact.length ? monthlyPlanFact : null,
  };
}

const UNRECOGNIZED = "CSV структура не распознана";

/**

 * Разбор CSV «Исполнение плана продаж»: все строки данных, гибкие заголовки,

 * многострочный шапка Excel, UTF-8 / Windows-1251.

 */

export function parseSalesPlanExecutionCsv(
  text: string,
  reportFallbackYmd: string,
): SalesPlanExecutionCsvParseResult {
  const warnings: string[] = [];

  const stripped = stripBom(text);

  if (!preprocessCell(stripped)) {
    return { ok: false, error: UNRECOGNIZED, warnings };
  }

  const wideExec = transformSalesExecutionCsv(stripped);

  if (wideExec?.monthlyRub.length) {
    warnings.push(...wideExec.warnings);
    const lastPk = wideExec.monthlyRub[wideExec.monthlyRub.length - 1]!.periodKey;
    const ds = emptySalesPlanExecutionDataset(lastYmdOfPeriodKey(lastPk));
    ds.rows = [
      {
        id: "total",
        name: "Итого с расторжениями",
        planProjectRub: 0,
        planReportMonthRub: 0,
        factReportMonthRub: undefined,
        planCumulativeRub: 0,
        factCumulativeRub: 0,
        deviationRub: 0,
        completionPct: null,
        shareOfVolumePct: 100,
        deviationComment: null,
        isTotal: true,
      },
    ];
    ds.monthlyPlanFact = wideExec.monthlyRub;
    return { ok: true, dataset: ds, warnings };
  }

  const gridDataset = tryParseWithGrid(stripped, reportFallbackYmd, warnings);

  const legacy =
    gridDataset && gridDataset.rows.length > 0
      ? null
      : tryParseLegacyHeaderMode(stripped, reportFallbackYmd, warnings);

  let dataset: SalesPlanExecutionDataset | null =
    gridDataset && gridDataset.rows.length > 0 ? gridDataset : legacy && legacy.rows.length > 0 ? legacy : null;

  if (!dataset) {
    return { ok: false, error: UNRECOGNIZED, warnings };
  }

  const verbaMonthly = tryBuildVerbaPrimaryRevenueMonthlyPlanFact(
    stripped,
    reportFallbackYmd,
    warnings,
  );

  if (verbaMonthly != null && verbaMonthly.length > 0) {
    const cur = dataset.monthlyPlanFact?.length ?? 0;

    if (cur <= 1) dataset.monthlyPlanFact = verbaMonthly;
  }

  return { ok: true, dataset, warnings };
}
