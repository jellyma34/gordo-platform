import Papa from "papaparse";

import { parseRuNumber } from "@/src/shared/lib/csv/parseInvestorsCsv";

/** Сообщение UI, если не удалось автоматически найти помесячные колонки факта. */
export const PAYMENT_CSV_FACT_MAPPING_REQUIRED_RU =
  "Не удалось выделить колонки месяцев по шаблонам дат (например «апрель 2026», «май 2026», «июн.26») в верхней части таблицы.";

/** Нет нижней строки итогов с суммами по помесячным колонкам факта. */
export const PAYMENT_CSV_FACT_TOTAL_ROW_REQUIRED_RU =
  "Не найдена нижняя строка итогов (итого/всего) с помесячными суммами по колонкам факта — проверьте выгрузку из Excel.";

/** Отладка факта: по каждой распознанной колонке притока — ячейка в нижней строке итогов. */
export type MarketingPaymentZaydetColumnDebugRow = {
  rawHeader: string;
  /** Канонический период YYYY-MM. */
  parsedMonth: string;
  /** Число из ячейки в нижней строке итогов (или 0, если строка не найдена). */
  parsedSum: number;
};

/** Сверка помесячно: число учтённых ячеек и сумма по столбцам «зайдет» за месяц. */
export type MarketingPaymentZaydetMonthVerifyRow = {
  month: string;
  rawCsvSum: number;
  displayedValue: number;
  /** Для факта из нижней строки итогов: 1 на месяц (или 0, если месяц не импортирован). */
  parsedCellCount: number;
};

export type MarketingPaymentCsvParseOk = {
  ok: true;
  /** Помесячный план оплаты по графику (колонки «План <месяц> <год>» / «мар.26» и т.п.). */
  planByPeriodKey: Record<string, number>;
  /**
   * Помесячный **приток** по колонкам «зайдет» (месяц + год): значения **нижней строки итогов** в CSV,
   * как в Excel (помесячные суммы уже агрегированы в таблице). Детальные строки сделок не суммируются.
   */
  factByPeriodKey: Record<string, number> | null;
  factUnavailableReason: string | null;
  columnPeriodKeysPlan: string[];
  columnPeriodKeysFact: string[];
  /** Сводка по каждой колонке «зайдет» для сверки с CSV и графиком (режим редактирования). */
  zaydetColumnDebug: MarketingPaymentZaydetColumnDebugRow[];
  zaydetMonthVerify: MarketingPaymentZaydetMonthVerifyRow[];
  reportAsOf?: string;
  /** Сводка предупреждений плана и факта при разборе одного CSV. */
  warnings?: string[];
};

export type MarketingPaymentCsvParseResult = MarketingPaymentCsvParseOk | { ok: false; error: string };

/** Только платёжный календарь (колонки «План …» / «мар.26»); без «зайдет» и без факта. */
export type MarketingPaymentPlanOnlyCsvParseOk = {
  ok: true;
  planByPeriodKey: Record<string, number>;
  columnPeriodKeysPlan: string[];
  reportAsOf?: string;
  /** Нестрогие замечания (файл разобран, но были эвристики). */
  warnings?: string[];
};
export type MarketingPaymentPlanOnlyCsvParseResult = MarketingPaymentPlanOnlyCsvParseOk | { ok: false; error: string };

/** Только помесячный приток по колонкам факта (нижняя строка итогов); без сумм по «План …». */
export type MarketingPaymentFactOnlyCsvParseOk = {
  ok: true;
  factByPeriodKey: Record<string, number> | null;
  factUnavailableReason: string | null;
  columnPeriodKeysFact: string[];
  zaydetColumnDebug: MarketingPaymentZaydetColumnDebugRow[];
  zaydetMonthVerify: MarketingPaymentZaydetMonthVerifyRow[];
  reportAsOf?: string;
  /** Предупреждения: частичный разбор, эвристика итогов и т.п. */
  warnings?: string[];
};
export type MarketingPaymentFactOnlyCsvParseResult = MarketingPaymentFactOnlyCsvParseOk | { ok: false; error: string };

const RU_MONTH_WORD: Record<string, number> = {
  январь: 1,
  февраль: 2,
  март: 3,
  апрель: 4,
  май: 5,
  июнь: 6,
  июль: 7,
  август: 8,
  сентябрь: 9,
  октябрь: 10,
  ноябрь: 11,
  декабрь: 12,
  янв: 1,
  фев: 2,
  мар: 3,
  апр: 4,
  июн: 6,
  июл: 7,
  авг: 8,
  сен: 9,
  окт: 10,
  ноя: 11,
  дек: 12,
};

/** Три буквы перед точкой: «апр.26» → апр */
const RU_ABBREV3: Record<string, number> = {
  янв: 1,
  фев: 2,
  мар: 3,
  апр: 4,
  май: 5,
  июн: 6,
  июл: 7,
  авг: 8,
  сен: 9,
  окт: 10,
  ноя: 11,
  дек: 12,
};

/**
 * Деньги из ячейки CSV: без умножений на 1000 / 1e6, только разбор строки.
 * Пробелы и неразрывные пробелы убираются; десятичный разделитель — запятая или точка (одна запятая → точка);
 * всё, кроме цифр, одной точки и знака минус, отбрасывается.
 */
export function parseMoneyRu(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;

  return parseRuNumber(raw);
}

function buildZaydetMonthVerifyRows(
  factByPeriodKey: Record<string, number> | null,
  zaydetColumnDebug: MarketingPaymentZaydetColumnDebugRow[],
  parsedCellCountByMonth: Record<string, number> | undefined,
): MarketingPaymentZaydetMonthVerifyRow[] {
  const rawByMonth = new Map<string, number>();
  for (const r of zaydetColumnDebug) {
    rawByMonth.set(r.parsedMonth, (rawByMonth.get(r.parsedMonth) ?? 0) + r.parsedSum);
  }
  const months = new Set<string>();
  for (const k of rawByMonth.keys()) months.add(k);
  if (factByPeriodKey) {
    for (const k of Object.keys(factByPeriodKey)) {
      if (/^\d{4}-\d{2}$/.test(k)) months.add(k);
    }
  }
  return [...months]
    .sort((a, b) => a.localeCompare(b))
    .map((month) => {
      const rawCsvSum =
        factByPeriodKey != null && Object.prototype.hasOwnProperty.call(factByPeriodKey, month)
          ? Number(factByPeriodKey[month])
          : (rawByMonth.get(month) ?? 0);
      const displayedValue =
        factByPeriodKey != null && Object.prototype.hasOwnProperty.call(factByPeriodKey, month)
          ? Number(factByPeriodKey[month])
          : 0;
      const parsedCellCount =
        parsedCellCountByMonth != null && Object.prototype.hasOwnProperty.call(parsedCellCountByMonth, month)
          ? Number(parsedCellCountByMonth[month])
          : 0;
      return { month, rawCsvSum, displayedValue, parsedCellCount };
    });
}

/** Только начало строки: итоги в дальних колонках («всего к оплате» и т.п.) не отсекают строку сделки целиком. */
function rowLeadingCellsProbe(row: string[], maxCells = 8): string {
  const n = Math.min(maxCells, row.length);
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    parts.push(String(row[i] ?? "").trim().toLowerCase());
  }
  return parts.join(" ");
}

/** Текст строки целиком (для поиска нижней строки итогов — подпись часто в середине строки Export). */
function rowJoinedForTotalDetection(row: string[]): string {
  return row.map((c) => String(c ?? "").trim().toLowerCase()).join(" ");
}

/** Промежуточные итоги: не использовать как финальную строку помесячных total внизу листа. */
function isPaymentCsvIntermediateSummaryRow(row: string[]): boolean {
  const s = rowJoinedForTotalDetection(row);
  return /промежуточн|подытог|в\s+том\s+числе|субтотал/i.test(s);
}

/**
 * Финальная строка итогов внизу отчёта (не промежуточный итог).
 * В т.ч. строка вида «НАКОПИТЕЛЬНО НА ЭСКРОУ …» — подпись может быть не в первых ячейках.
 */
function isPaymentCsvGrandTotalRow(row: string[]): boolean {
  if (isPaymentCsvIntermediateSummaryRow(row)) return false;
  const s = rowJoinedForTotalDetection(row);
  if (!s.trim()) return false;
  if (/\bитого\b|\bвсего\b|накопител|суммарн|subtotal/i.test(s)) return true;
  const c0 = String(row[0] ?? "").trim().toLowerCase();
  if (/^итого\b|^всего\b/i.test(c0)) return true;
  const c1 = String(row[1] ?? "").trim().toLowerCase();
  if (c1 === "итого" || /^итого\b/i.test(c1)) return true;
  return false;
}

function timelineNonZeroStats(row: string[], periodToCol: Map<string, number>): { hits: number; sumAbs: number } {
  let hits = 0;
  let sumAbs = 0;
  for (const col of periodToCol.values()) {
    const v = Math.abs(parseMoneyRu(row[col] ?? ""));
    if (v > 1e-12) {
      hits++;
      sumAbs += v;
    }
  }
  return { hits, sumAbs };
}

/**
 * Геометрия: нижняя строка итогов — снизу вверх.
 * 1) Строка с подписью итого/всего и числами в колонках таймлайна.
 * 2) Иначе нижняя строка с «широким» заполнением числовых колонок месяцев.
 * 3) Иначе последняя строка с любым минимальным набором чисел в колонках месяцев.
 */
function findFactBottomTotalsRowIdx(
  rows: string[][],
  bodyStartRow: number,
  periodToCol: Map<string, number>,
): { idx: number; warnings: string[] } {
  const w: string[] = [];
  const k = periodToCol.size;
  if (k === 0) return { idx: -1, warnings: w };
  const minWeak = Math.max(1, Math.min(2, k));
  const minStrong = k <= 5 ? k : Math.max(4, Math.ceil(k * 0.45));

  for (let i = rows.length - 1; i >= bodyStartRow; i--) {
    const row = rows[i]!;
    if (!row.some((c) => String(c ?? "").trim() !== "")) continue;
    if (isVerbaRepeatedTableHeaderRow(row)) continue;
    if (isPaymentCsvIntermediateSummaryRow(row)) continue;
    const { hits, sumAbs } = timelineNonZeroStats(row, periodToCol);
    if (hits < 1 || sumAbs <= 0) continue;
    if (isPaymentCsvGrandTotalRow(row)) {
      w.push("Итоги: строка с подписью итого/всего внизу листа.");
      return { idx: i, warnings: w };
    }
  }

  for (let i = rows.length - 1; i >= bodyStartRow; i--) {
    const row = rows[i]!;
    if (!row.some((c) => String(c ?? "").trim() !== "")) continue;
    if (isVerbaRepeatedTableHeaderRow(row)) continue;
    if (isPaymentCsvIntermediateSummaryRow(row)) continue;
    const { hits, sumAbs } = timelineNonZeroStats(row, periodToCol);
    if (hits >= minStrong && sumAbs > 0) {
      w.push(
        "Итоги: нижняя строка с наибольшим заполнением колонок месяцев (без явной подписи «итого»/«всего»).",
      );
      return { idx: i, warnings: w };
    }
  }

  for (let i = rows.length - 1; i >= bodyStartRow; i--) {
    const row = rows[i]!;
    if (!row.some((c) => String(c ?? "").trim() !== "")) continue;
    if (isVerbaRepeatedTableHeaderRow(row)) continue;
    if (isPaymentCsvIntermediateSummaryRow(row)) continue;
    const { hits, sumAbs } = timelineNonZeroStats(row, periodToCol);
    if (hits >= minWeak && sumAbs > 0) {
      w.push(
        "Итоги: последняя по файлу строка с числами в колонках месяцев — проверьте, что это строка итогов.",
      );
      return { idx: i, warnings: w };
    }
  }

  return { idx: -1, warnings: w };
}

function isPaymentCsvSummaryLikeRow(row: string[]): boolean {
  const head = rowLeadingCellsProbe(row, 8);
  if (/\bнакопит/i.test(head)) return true;
  if (/\bитого\b|\bвсего\b|промежуточн|подытог|субтотал|subtotal|суммарн|в\s+том\s+числе/i.test(head)) {
    return true;
  }
  const c0 = String(row[0] ?? "").trim().toLowerCase();
  if (/^итого\b|^всего\b/i.test(c0)) return true;
  const c1 = String(row[1] ?? "").trim().toLowerCase();
  if (c1 === "итого" || /^итого\b/i.test(c1)) return true;
  return false;
}

/** Повтор шапки таблицы Верба (не строки с суммами). */
function isVerbaRepeatedTableHeaderRow(row: string[]): boolean {
  const c0 = String(row[0] ?? "").trim().toLowerCase();
  const c1 = String(row[1] ?? "").trim().toLowerCase();
  if (/^вид\s+договора/i.test(c0)) return true;
  if (/^номер\s+и\s+дата\s+договора/i.test(c1)) return true;
  if (/идентификационн/i.test(c0)) return true;
  return false;
}

function toPeriodKey(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Нормализация шапки для извлечения периода (без использования «сырого» текста как ключа). */
function normalizeHeaderForPeriodParse(raw: unknown): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\n/g, " ")
    .replace(/\r/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Стволы месяцев для fuzzy includes (длинные раньше коротких). Значение — календарный месяц 1…12. */
const FUZZY_MONTH_STEM_TO_M: { stem: string; m: number }[] = [
  { stem: "сентябр", m: 9 },
  { stem: "октябр", m: 10 },
  { stem: "ноябр", m: 11 },
  { stem: "декабр", m: 12 },
  { stem: "феврал", m: 2 },
  { stem: "январ", m: 1 },
  { stem: "август", m: 8 },
  { stem: "апрел", m: 4 },
  { stem: "мае", m: 5 },
  { stem: "июль", m: 7 },
  { stem: "март", m: 3 },
  { stem: "май", m: 5 },
  { stem: "июн", m: 6 },
  { stem: "июл", m: 7 },
];

function extractMonthYearFromNormalizedScheduleHeader(h: string): { month: number; year: number } | null {
  let month: number | null = null;
  for (const { stem, m } of FUZZY_MONTH_STEM_TO_M) {
    if (h.includes(stem)) {
      month = m;
      break;
    }
  }
  if (month == null) return null;

  let year: number | null = null;
  const fourAll = [...h.matchAll(/\b((?:19|20)\d{2})\b/g)];
  if (fourAll.length > 0) {
    year = Number(fourAll[fourAll.length - 1]![1]);
  } else {
    const twoAll = [...h.matchAll(/(?:^|\D)(\d{2})(?:\D|$)/g)];
    for (let i = twoAll.length - 1; i >= 0; i--) {
      const v = Number(twoAll[i]![1]);
      if (Number.isFinite(v) && v >= 0 && v <= 99) {
        year = 2000 + v;
        break;
      }
    }
  }
  if (year == null || !Number.isFinite(year)) return null;
  return { month, year };
}

export type VerbaHeaderParsedMeta = {
  month: number;
  year: number;
  type: "fact" | "plan";
  /** Канонический ключ периода YYYY-MM. */
  periodKey: string;
};

/**
 * Строго колонки с подстрокой «зайдет» в заголовке (после нормализации). Месяц/год — только из текста шапки.
 */
export function parseZaydetColumnMetaStrict(raw: unknown): VerbaHeaderParsedMeta | null {
  const rawHeader = String(raw ?? "").trim();
  if (!rawHeader) return null;
  const h = normalizeHeaderForPeriodParse(raw);
  if (!h || !h.includes("зайдет")) return null;
  const my = extractMonthYearFromNormalizedScheduleHeader(h);
  if (!my) return null;
  const periodKey = toPeriodKey(my.year, my.month);
  return { month: my.month, year: my.year, type: "fact", periodKey };
}

/** Служебные / неграфиковые колонки: ДДУ, долг, накопления, покупатели и т.п. — не использовать для помесячного плана. */
function isExcludedServiceColumnHeader(cell: string): boolean {
  const t = String(cell ?? "")
    .replace(/\r|\n/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!t) return false;
  if (/^[а-яё]{3,5}\.\d{2}$/i.test(t.replace(/\s/g, ""))) return false;
  if (/^план\s+[а-яё]+\s+\d{4}$/i.test(t)) return false;

  const bad =
    /задолжен|долг\s+на|остаток|сумма\s+по\s+дду|сумма\s+дду|^сумма\s+дду|оплата\s+до|регистрац|покупател|заказчик|^фио$|наименование\s+док|документ\s+регистр|накопител|на\s+эскроу|к\s+оплате$|^оплачено$|первонач|^цена\s|стоимост|договор(?!$)/i.test(
      t,
    );
  if (bad) return true;
  if (/^итого$|^всего$|^сумма$/i.test(t)) return true;
  if (/^\d{4}$/.test(t)) return true;
  return false;
}

/**
 * Только колонки графика платёжного календаря:
 * - «мар.26», «апр.26», …
 * - «План март 2026» (то же, что якорная колонка в первой строке)
 * Не использовать: голые годы, задолженность, сумма ДДУ и т.д.
 */
function cellToSchedulePeriodKey(cell: string): string | null {
  const raw = String(cell ?? "").trim();
  if (!raw || isExcludedServiceColumnHeader(raw)) return null;

  const compact = raw.replace(/\s/g, "");
  const abb = compact.match(/^([а-яё]{3,5})\.(\d{2})$/i);
  if (abb) {
    const pref = abb[1]!.toLowerCase().slice(0, 3);
    const mm = RU_ABBREV3[pref];
    if (!mm) return null;
    const yy = Number(abb[2]);
    if (!Number.isFinite(yy)) return null;
    return toPeriodKey(2000 + yy, mm);
  }

  const planHit = matchPlanMonthCell(raw);
  if (planHit) return toPeriodKey(planHit.colPeriod.y, planHit.colPeriod.m);

  return null;
}

/** Одна колонка на periodKey: при дублях в `colToPeriod` берём самую левую, без двойного суммирования. */
function firstColIndexPerPeriodKey(colToPeriod: Map<number, string>): Map<string, number> {
  const byPk = new Map<string, number>();
  const entries = [...colToPeriod.entries()].sort((a, b) => a[0] - b[0]);
  for (const [j, pk] of entries) {
    if (!byPk.has(pk)) byPk.set(pk, j);
  }
  return byPk;
}

function matchPlanMonthCell(cell: string): { colPeriod: { y: number; m: number } } | null {
  const m = cell.match(/план\s+([а-яё]+)\s+(\d{4})/i);
  if (!m) return null;
  const word = m[1].toLowerCase();
  const year = Number(m[2]);
  if (!Number.isFinite(year)) return null;
  const month = RU_MONTH_WORD[word];
  if (!month) return null;
  return { colPeriod: { y: year, m: month } };
}

function looksLikeDataRowFirstCell(cell: string): boolean {
  const t = cell.trim();
  return /^\d+-\d+(-\d+)?$/i.test(t);
}

/** Разбор строк CSV с автоподбором разделителя (; или ,) по первой непустой строке. */
function parseSpreadsheetRows(text: string): string[][] {
  const lines = text.split(/\r?\n/);
  const first = (lines.find((l) => l.trim().length > 0) ?? "").trim();
  const semi = (first.match(/;/g) ?? []).length;
  const comma = (first.match(/,/g) ?? []).length;
  const delimiter = semi >= comma ? ";" : ",";
  const parsed = Papa.parse<string[]>(text, {
    delimiter,
    quoteChar: '"',
    header: false,
    skipEmptyLines: false,
  });
  if (parsed.errors?.length) {
    console.warn("[payment csv]", parsed.errors.slice(0, 2));
  }
  const rawRows = (Array.isArray(parsed.data) ? parsed.data : []) as string[][];
  return rawRows.filter((row) => Array.isArray(row) && row.some((c) => String(c ?? "").trim() !== ""));
}

/**
 * Колонка **таймлайна** на листе: только месяц + год (или «мар.26» и т.п.).
 * Семантика «факт», «оплачено», «эскроу», «зайдет» не требуется — это геометрия горизонтальной шкалы.
 */
function classifyFactSpreadsheetTimelineCell(raw: string): { periodKey: string } | null {
  const rawHeader = String(raw ?? "").trim();
  if (!rawHeader) return null;
  if (isExcludedServiceColumnHeader(rawHeader)) return null;

  const abbrevPk = cellToSchedulePeriodKey(rawHeader);
  if (abbrevPk) return { periodKey: abbrevPk };

  const h = normalizeHeaderForPeriodParse(rawHeader);
  if (!h) return null;
  const my = extractMonthYearFromNormalizedScheduleHeader(h);
  if (!my) return null;
  return { periodKey: toPeriodKey(my.year, my.month) };
}

/**
 * Помесячная колонка **плана** (календарь): «План …», «мар.26», «зайдет …» в файле графика.
 * Колонки, распознанные только как факт (без «зайдет»/«зашло»), в план не входят.
 */
function classifyPlanScheduleHeaderCell(raw: string): { periodKey: string } | null {
  const rawHeader = String(raw ?? "").trim();
  if (!rawHeader) return null;
  const h = normalizeHeaderForPeriodParse(rawHeader);

  const z = parseZaydetColumnMetaStrict(rawHeader);
  if (z) return { periodKey: z.periodKey };

  const planHit = matchPlanMonthCell(rawHeader);
  if (planHit) return { periodKey: toPeriodKey(planHit.colPeriod.y, planHit.colPeriod.m) };

  const abbrevPk = cellToSchedulePeriodKey(rawHeader);
  if (abbrevPk) return { periodKey: abbrevPk };

  if (/\bплан\b/.test(h)) {
    const my = extractMonthYearFromNormalizedScheduleHeader(h);
    if (my) return { periodKey: toPeriodKey(my.year, my.month) };
  }
  return null;
}

/** Сколько строк вниз от якоря склеивать при чтении шапки (Excel: «зайдет» / «май 2026» в двух строках). */
const HEADER_VERTICAL_MERGE_SPAN = 10;

/** Поиск строки-якоря шапки только в верхней части листа (метаданные / пустые строки выше таблицы). */
const HEADER_ANCHOR_SCAN_MAX_ROW = 60;

/**
 * Склеивает текст шапки по вертикали в одном столбце (merge / многострочные заголовки).
 */
function mergedVerticalHeaderText(rows: string[][], startRow: number, colJ: number, spanRows: number): string {
  const parts: string[] = [];
  const end = Math.min(rows.length, startRow + Math.max(1, spanRows));
  for (let i = startRow; i < end; i++) {
    const t = String(rows[i]?.[colJ] ?? "").trim();
    if (t) parts.push(t);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function countMergedHeaderHits(
  rows: string[][],
  startRow: number,
  classify: (raw: string) => { periodKey: string } | null,
  spanRows = HEADER_VERTICAL_MERGE_SPAN,
): number {
  const row = rows[startRow];
  if (!row) return 0;
  let n = 0;
  for (let j = 0; j < row.length; j++) {
    const text = mergedVerticalHeaderText(rows, startRow, j, spanRows);
    if (text && classify(text)) n++;
  }
  return n;
}

/** Лучшая строка-якорь шапки: максимум распознанных колонок после вертикального склеивания. */
function findBestHeaderRowIndex(
  rows: string[][],
  classify: (raw: string) => { periodKey: string } | null,
): { idx: number; score: number } {
  let bestI = -1;
  let bestS = -1;
  const limit = Math.min(rows.length, HEADER_ANCHOR_SCAN_MAX_ROW);
  for (let i = 0; i < limit; i++) {
    const s = countMergedHeaderHits(rows, i, classify, HEADER_VERTICAL_MERGE_SPAN);
    if (s > bestS) {
      bestS = s;
      bestI = i;
    }
  }
  return { idx: bestI, score: bestS };
}

/** Собирает колонку j → период, склеивая до `mergeDepth` строк начиная с `bandStart`. */
function buildMergedColToPeriodFromVertical(
  rows: string[][],
  bandStart: number,
  mergeDepth: number,
  classify: (raw: string) => { periodKey: string } | null,
): Map<number, string> {
  const colTo = new Map<number, string>();
  const scanEnd = Math.min(rows.length, bandStart + mergeDepth);
  const maxJ = maxColsInRowRange(rows, bandStart, scanEnd);
  for (let j = 0; j < maxJ; j++) {
    const text = mergedVerticalHeaderText(rows, bandStart, j, mergeDepth);
    if (!text) continue;
    const hit = classify(text);
    if (hit) colTo.set(j, hit.periodKey);
  }
  return colTo;
}

/** Fallback: шапка только в первых ~10 строках (метаданные выше, таблица сразу с колонками). */
function buildMergedColToPeriodFromTopRows(
  rows: string[][],
  topRows: number,
  classify: (raw: string) => { periodKey: string } | null,
): Map<number, string> {
  const depth = Math.min(Math.max(5, topRows), rows.length, HEADER_VERTICAL_MERGE_SPAN);
  return buildMergedColToPeriodFromVertical(rows, 0, depth, classify);
}

/** Расширение полосы шапки вниз: учитывает склеенные подзаголовки. */
function extendHeaderBandEnd(
  rows: string[][],
  bestIdx: number,
  bestScore: number,
  classify: (raw: string) => { periodKey: string } | null,
): number {
  let end = bestIdx + 1;
  const threshold = Math.max(2, Math.ceil(Math.max(bestScore, 3) * 0.2));
  const limit = Math.min(rows.length, bestIdx + 55);
  for (let i = bestIdx + 1; i < limit; i++) {
    const row = rows[i]!;
    const c0 = String(row[0] ?? "").trim();
    if (looksLikeDataRowFirstCell(c0)) break;
    const s1 = String(row[1] ?? "").trim().toLowerCase();
    if (s1.includes("итого") && countMergedHeaderHits(rows, i, classify, 6) === 0) break;

    const hs = countMergedHeaderHits(rows, i, classify, 6);
    if (hs >= threshold || (bestScore <= 3 && hs >= 1)) {
      end = i + 1;
    }
  }
  return end;
}

function maxColsInRowRange(rows: string[][], from: number, toExclusive: number): number {
  let m = 0;
  for (let i = from; i < toExclusive; i++) {
    m = Math.max(m, rows[i]!.length);
  }
  return m;
}

function findFirstDataRowIndex(rows: string[][], minRow: number, periodToCol: Map<string, number>): number {
  for (let i = minRow; i < rows.length; i++) {
    const row = rows[i]!;
    const c0 = String(row[0] ?? "").trim();
    if (looksLikeDataRowFirstCell(c0)) return i;
    if (isPaymentCsvSummaryLikeRow(row)) continue;
    let sum = 0;
    for (const col of periodToCol.values()) {
      sum += Math.abs(parseMoneyRu(row[col] ?? ""));
    }
    if (sum > 0 && c0.length > 0 && !isPaymentCsvGrandTotalRow(row)) return i;
  }
  return minRow;
}

function extractReportAsOf(rows: string[][]): string | undefined {
  for (const row of rows) {
    const joined = row.map((c) => String(c ?? "").toLowerCase()).join(";");
    if (!joined.includes("отчетн") && !joined.includes("отчётн")) continue;
    for (const cell of row) {
      const m = String(cell ?? "").match(/(\d{2})\.(\d{2})\.(\d{4})/);
      if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    }
  }
  return undefined;
}

/**
 * Декодирование файла выгрузки графика платежей (обычно Windows-1251 в 1С / Excel).
 */
export function decodePaymentScheduleCsvBuffer(buffer: ArrayBuffer): string {
  const cp1251 = new TextDecoder("windows-1251").decode(buffer);
  if (
    (/план\s*продаж/i.test(cp1251) && /\bгод\b/i.test(cp1251) && /\bмесяц\b/i.test(cp1251)) ||
    /план\s+[а-яё]+\s+\d{4}/i.test(cp1251) ||
    /рассрочка/i.test(cp1251) ||
    /дду/i.test(cp1251) ||
    /накопител/i.test(cp1251) ||
    /зашло\s+в/i.test(cp1251) ||
    /зайдет\s+в/i.test(cp1251)
  ) {
    return cp1251;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}

/**
 * Декодирование CSV отчёта о фактических поступлениях (часто Windows-1251).
 */
export function decodePaymentFactInflowCsvBuffer(buffer: ArrayBuffer): string {
  const cp1251 = new TextDecoder("windows-1251").decode(buffer);
  if (
    /зайдет|зашло\s+в|поступлен|отчетн|отчётн|факт|оплачено|эскроу|поступил/i.test(cp1251) ||
    /план\s+[а-яё]+\s+\d{4}/i.test(cp1251) ||
    /рассрочка/i.test(cp1251) ||
    /дду/i.test(cp1251) ||
    (/(?:19|20)\d{2}/.test(cp1251) &&
      /январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентяб|октяб|нояб|декаб/i.test(cp1251))
  ) {
    return cp1251;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}

function rowLooksLikeNumericPlanRow(row: string[], periodToCol: Map<string, number>): boolean {
  let nz = 0;
  for (const col of periodToCol.values()) {
    if (parseMoneyRu(row[col] ?? "") !== 0) nz++;
  }
  return nz >= 2;
}

/** Заголовок колонки long-format CSV плана поступлений (Год;месяц;План продаж). */
function normalizePlanCsvHeaderCell(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\u00a0/g, " ")
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ");
}

type RevenuePlanLongCsvColumns = {
  headerRow: number;
  yearCol: number;
  monthCol: number;
  planCol: number;
};

/** Поиск шапки «Год;месяц;План продаж» в первых строках файла. */
function detectRevenuePlanLongCsvColumns(rows: string[][]): RevenuePlanLongCsvColumns | null {
  const scan = Math.min(rows.length, 10);
  for (let i = 0; i < scan; i++) {
    const row = rows[i]!;
    if (!row.some((c) => String(c ?? "").trim())) continue;
    const norms = row.map(normalizePlanCsvHeaderCell);
    const yearCol = norms.findIndex((h) => h === "год");
    const monthCol = norms.findIndex((h) => h === "месяц");
    const planCol = norms.findIndex((h) => /^план\s*продаж/.test(h));
    if (yearCol >= 0 && monthCol >= 0 && planCol >= 0) {
      return { headerRow: i, yearCol, monthCol, planCol };
    }
  }
  return null;
}

function parsePlanCsvYearCell(raw: unknown): number | null {
  const s = String(raw ?? "")
    .trim()
    .replace(/\u00a0/g, " ")
    .replace(/\s/g, "");
  if (!s) return null;
  const digits = s.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n < 1900 || n > 2100) return null;
  return Math.round(n);
}

function parsePlanCsvMonthCell(raw: unknown): number | null {
  const w = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\./g, "")
    .replace(/\u00a0/g, " ");
  if (!w) return null;
  const direct = resolveRuMonthWord(w);
  if (direct) return direct;
  for (const { stem, m } of FUZZY_MONTH_STEM_TO_M) {
    if (w.startsWith(stem)) return m;
  }
  const num = Number(w.replace(/[^\d]/g, ""));
  if (Number.isFinite(num) && num >= 1 && num <= 12) return Math.round(num);
  return null;
}

/**
 * Помесячный план поступлений: long CSV «Год;месяц;План продаж» (cp1251, ₽ с пробелами и запятой).
 * Ключи периода — `YYYY-MM`; подписи на графике — {@link periodKeyToRuChartLabel} в buildCashflowSeries.
 */
function parseRevenuePlanLongCsvFromRows(
  rows: string[][],
  cols: RevenuePlanLongCsvColumns,
): MarketingPaymentPlanOnlyCsvParseResult {
  const warnings: string[] = [];
  const byPeriodKey: Record<string, number> = {};
  let skippedRows = 0;

  for (let i = cols.headerRow + 1; i < rows.length; i++) {
    const row = rows[i]!;
    const yearRaw = row[cols.yearCol];
    const monthRaw = row[cols.monthCol];
    const planRaw = row[cols.planCol];
    const hasAny =
      String(yearRaw ?? "").trim() || String(monthRaw ?? "").trim() || String(planRaw ?? "").trim();
    if (!hasAny) continue;

    const year = parsePlanCsvYearCell(yearRaw);
    const month = parsePlanCsvMonthCell(monthRaw);
    if (year == null || month == null) {
      skippedRows++;
      continue;
    }

    const amount = parseMoneyRu(planRaw);
    const pk = toPeriodKey(year, month);
    if (Object.prototype.hasOwnProperty.call(byPeriodKey, pk)) {
      warnings.push(`Дубликат периода ${pk}: суммы объединены.`);
    }
    byPeriodKey[pk] = (byPeriodKey[pk] ?? 0) + amount;
  }

  const columnPeriodKeysPlan = Object.keys(byPeriodKey).sort((a, b) => a.localeCompare(b));
  if (columnPeriodKeysPlan.length === 0) {
    return {
      ok: false,
      error:
        skippedRows > 0
          ? "Не удалось распознать строки: проверьте колонки «Год», «месяц» и суммы в «План продаж»."
          : "В файле нет данных плана поступлений (ожидаются колонки Год;месяц;План продаж).",
    };
  }
  if (skippedRows > 0) {
    warnings.push(`Пропущено строк без корректных «Год»/«месяц»: ${skippedRows}.`);
  }

  return {
    ok: true,
    planByPeriodKey: byPeriodKey,
    columnPeriodKeysPlan,
    warnings: warnings.length ? warnings : undefined,
  };
}

/** @deprecated Широкий график платежей; для загрузки плана используйте long CSV через {@link parsePlanCsv}. */
function parsePlanFromRows(rows: string[][]): MarketingPaymentPlanOnlyCsvParseResult {
  if (rows.length < 3) {
    return { ok: false, error: "Файл слишком короткий — ожидался график платежей с помесячными колонками." };
  }
  const warnings: string[] = [];
  const { idx: hi, score: hs } = findBestHeaderRowIndex(rows, classifyPlanScheduleHeaderCell);
  let colToPeriod = new Map<number, string>();
  let anchor = hi;
  let bandEnd = 0;
  let mergeDepth = HEADER_VERTICAL_MERGE_SPAN;

  if (hi >= 0 && hs >= 1) {
    bandEnd = extendHeaderBandEnd(rows, hi, hs, classifyPlanScheduleHeaderCell);
    mergeDepth = Math.max(HEADER_VERTICAL_MERGE_SPAN, bandEnd - hi + 6);
    colToPeriod = buildMergedColToPeriodFromVertical(rows, hi, mergeDepth, classifyPlanScheduleHeaderCell);
  }
  if (colToPeriod.size === 0) {
    const top = buildMergedColToPeriodFromTopRows(rows, 12, classifyPlanScheduleHeaderCell);
    if (top.size > 0) {
      colToPeriod = top;
      anchor = 0;
      bandEnd = Math.min(12, rows.length);
      mergeDepth = HEADER_VERTICAL_MERGE_SPAN;
      warnings.push("Шапка плана собрана из первых строк листа (многострочные заголовки / merge).");
    }
  }

  if (anchor < 0 || colToPeriod.size === 0) {
    return {
      ok: false,
      error:
        "Не удалось автоматически найти шапку таблицы с помесячным планом (ищутся колонки вида «План май 2026», «мар.26», «зайдет июнь 2026»).",
    };
  }

  const periodToCol = firstColIndexPerPeriodKey(colToPeriod);
  const columnPeriodKeysPlan = [...periodToCol.keys()].sort((a, b) => a.localeCompare(b));

  if (columnPeriodKeysPlan.length === 0) {
    return { ok: false, error: "Не удалось сопоставить колонки месяцев плана по содержимому заголовков." };
  }

  const dataFirst = findFirstDataRowIndex(rows, Math.max(bandEnd, anchor + 1), periodToCol);
  const byPeriodKey: Record<string, number> = {};
  let dataStarted = false;

  for (let i = dataFirst; i < rows.length; i++) {
    const row = rows[i]!;
    const c0 = String(row[0] ?? "").trim();
    const c0Lower = c0.toLowerCase();
    const c1 = String(row[1] ?? "").trim().toLowerCase();

    if (/^итого\b|^всего\b|^в\s+том\s+числе/i.test(c0Lower)) continue;
    if (c1 === "итого" || /^итого\b/i.test(c1)) continue;
    if (isPaymentCsvSummaryLikeRow(row)) continue;

    const likeData =
      looksLikeDataRowFirstCell(c0) ||
      (rowLooksLikeNumericPlanRow(row, periodToCol) && !isPaymentCsvGrandTotalRow(row));

    if (!dataStarted) {
      if (likeData) dataStarted = true;
      else continue;
    }
    if (!likeData) continue;

    for (const [pk, col] of periodToCol) {
      byPeriodKey[pk] = (byPeriodKey[pk] ?? 0) + parseMoneyRu(row[col]);
    }
  }

  const reportAsOf = extractReportAsOf(rows);

  if (Object.keys(byPeriodKey).length === 0) {
    return { ok: false, error: "В файле нет числовых сумм в распознанных колонках плана платежей." };
  }

  return {
    ok: true,
    planByPeriodKey: byPeriodKey,
    columnPeriodKeysPlan,
    reportAsOf,
    warnings: warnings.length ? warnings : undefined,
  };
}

function parseFactFromRows(rows: string[][]): MarketingPaymentFactOnlyCsvParseResult {
  if (rows.length < 2) {
    return { ok: false, error: "Пустой или слишком короткий CSV." };
  }
  const warnings: string[] = [];
  let hi = -1;
  let hs = 0;
  let colToPeriod = new Map<number, string>();
  let bandEnd = 0;
  let mergeDepth = HEADER_VERTICAL_MERGE_SPAN;

  ({ idx: hi, score: hs } = findBestHeaderRowIndex(rows, classifyFactSpreadsheetTimelineCell));

  if (hi >= 0 && hs >= 1) {
    bandEnd = extendHeaderBandEnd(rows, hi, Math.max(hs, 1), classifyFactSpreadsheetTimelineCell);
    mergeDepth = Math.max(HEADER_VERTICAL_MERGE_SPAN, bandEnd - hi + 6);
    colToPeriod = buildMergedColToPeriodFromVertical(rows, hi, mergeDepth, classifyFactSpreadsheetTimelineCell);
  }

  if (colToPeriod.size === 0) {
    const top = buildMergedColToPeriodFromTopRows(rows, 12, classifyFactSpreadsheetTimelineCell);
    if (top.size > 0) {
      colToPeriod = top;
      hi = 0;
      bandEnd = Math.min(12, rows.length);
      mergeDepth = HEADER_VERTICAL_MERGE_SPAN;
      warnings.push(
        "Шапка факта собрана из первых строк листа (разнесённые по строкам подписи, merge).",
      );
    }
  }

  if (colToPeriod.size === 0) {
    return {
      ok: true,
      factByPeriodKey: null,
      factUnavailableReason: PAYMENT_CSV_FACT_MAPPING_REQUIRED_RU,
      columnPeriodKeysFact: [],
      zaydetColumnDebug: [],
      zaydetMonthVerify: [],
      reportAsOf: extractReportAsOf(rows),
      warnings: [
        "Не удалось найти горизонтальную шкалу месяцев (апрель 2026, май 2026, мар.26 и т.п.). Файл сохранён без помесячного факта.",
        ...warnings,
      ],
    };
  }

  const periodToCol = firstColIndexPerPeriodKey(colToPeriod);
  const columnPeriodKeysFact = [...periodToCol.keys()].sort((a, b) => a.localeCompare(b));

  const zaydetByCol = new Map<number, { periodKey: string; rawHeader: string }>();
  const factPeriodToColSets = new Map<string, Set<number>>();
  for (const [j, pk] of colToPeriod.entries()) {
    const rawHeader = mergedVerticalHeaderText(rows, hi, j, mergeDepth);
    zaydetByCol.set(j, { periodKey: pk, rawHeader: rawHeader || pk });
    let s = factPeriodToColSets.get(pk);
    if (!s) {
      s = new Set<number>();
      factPeriodToColSets.set(pk, s);
    }
    s.add(j);
  }

  const factAcc: Record<string, number> = {};
  const factZaydetCellCount: Record<string, number> = {};
  for (const pk of factPeriodToColSets.keys()) {
    factAcc[pk] = 0;
    factZaydetCellCount[pk] = 0;
  }

  const zaydetColToPeriod = new Map<number, string>();
  for (const [j, info] of zaydetByCol) zaydetColToPeriod.set(j, info.periodKey);
  const zaydetFirstColByPeriod = firstColIndexPerPeriodKey(zaydetColToPeriod);

  const bodyStartRow = Math.max(bandEnd, hi + 1);
  const totalsPick =
    bodyStartRow < rows.length
      ? findFactBottomTotalsRowIdx(rows, bodyStartRow, periodToCol)
      : { idx: -1 as number, warnings: [] as string[] };
  const factTotalRowIdx = totalsPick.idx;
  warnings.push(...totalsPick.warnings);

  if (factTotalRowIdx >= 0) {
    const totalRow = rows[factTotalRowIdx]!;
    for (const pk of factPeriodToColSets.keys()) {
      const col = zaydetFirstColByPeriod.get(pk);
      if (col === undefined) continue;
      factAcc[pk] = parseMoneyRu(totalRow[col]);
      factZaydetCellCount[pk] = 1;
    }
  }

  const zaydetColumnDebug: MarketingPaymentZaydetColumnDebugRow[] = [...zaydetByCol.keys()]
    .sort((a, b) => a - b)
    .map((j) => {
      const info = zaydetByCol.get(j)!;
      const parsedSum =
        factTotalRowIdx >= 0 ? parseMoneyRu(rows[factTotalRowIdx]![j]) : 0;
      return { rawHeader: info.rawHeader, parsedMonth: info.periodKey, parsedSum };
    });

  const reportAsOf = extractReportAsOf(rows);

  let factByPeriodKey: Record<string, number> | null = null;
  let factUnavailableReason: string | null = null;
  if (factPeriodToColSets.size === 0) {
    factUnavailableReason = PAYMENT_CSV_FACT_MAPPING_REQUIRED_RU;
  } else if (factTotalRowIdx < 0) {
    factUnavailableReason = PAYMENT_CSV_FACT_TOTAL_ROW_REQUIRED_RU;
    warnings.push("Нижняя строка итогов не найдена; помесячный факт не извлечён.");
  } else {
    factByPeriodKey = factAcc;
  }

  const zaydetMonthVerify = buildZaydetMonthVerifyRows(factByPeriodKey, zaydetColumnDebug, factZaydetCellCount);

  return {
    ok: true,
    factByPeriodKey,
    factUnavailableReason,
    columnPeriodKeysFact,
    zaydetColumnDebug,
    zaydetMonthVerify,
    reportAsOf,
    warnings: warnings.length ? warnings : undefined,
  };
}

/**
 * План поступлений для «Динамика поступлений»: CSV «Год;месяц;План продаж» (разделитель «;», cp1251).
 */
export function parsePlanCsv(text: string): MarketingPaymentPlanOnlyCsvParseResult {
  const rows = parseSpreadsheetRows(text);
  const cols = detectRevenuePlanLongCsvColumns(rows);
  if (!cols) {
    return {
      ok: false,
      error:
        "Ожидается CSV с колонками «Год», «месяц», «План продаж» (помесячный план поступлений, разделитель «;»).",
    };
  }
  return parseRevenuePlanLongCsvFromRows(rows, cols);
}

/** Совместимость с API: то же, что {@link parsePlanCsv}. */
export const parsePaymentPlanScheduleCsv = parsePlanCsv;

/**
 * Факт из CSV: **геометрия листа** — горизонтальная шкала по шаблонам «месяц + год» / «мар.26»;
 * значения — из **нижней** строки с числами в этих колонках (итоги). Семантика «факт», «оплачено», «зайдет» не обязательна.
 */
export function parseFactCsv(text: string): MarketingPaymentFactOnlyCsvParseResult {
  return parseFactFromRows(parseSpreadsheetRows(text));
}

/** Совместимость с API: то же, что {@link parseFactCsv}. */
export const parsePaymentFactInflowCsv = parseFactCsv;

/**
 * Совмещённый разбор одного CSV (легаси): план и факт извлекаются **независимыми** классификаторами
 * {@link parsePlanFromRows} и {@link parseFactFromRows} по одному набору строк.
 */
export function parsePaymentScheduleCsv(text: string): MarketingPaymentCsvParseResult {
  const rows = parseSpreadsheetRows(text);
  if (rows.length < 3) {
    return { ok: false, error: "Файл слишком короткий — ожидался отчёт с графиком платежей." };
  }
  const planR = parsePlanFromRows(rows);
  if (!planR.ok) {
    return { ok: false, error: planR.error };
  }
  const factR = parseFactFromRows(rows);
  const warn: string[] = [];
  if (planR.warnings) warn.push(...planR.warnings.map((w: string) => `[План] ${w}`));
  if (factR.ok && factR.warnings) warn.push(...factR.warnings.map((w: string) => `[Факт] ${w}`));

  if (!factR.ok) {
    return {
      ok: true,
      planByPeriodKey: planR.planByPeriodKey,
      factByPeriodKey: null,
      factUnavailableReason: factR.error,
      columnPeriodKeysPlan: planR.columnPeriodKeysPlan,
      columnPeriodKeysFact: [],
      zaydetColumnDebug: [],
      zaydetMonthVerify: [],
      reportAsOf: planR.reportAsOf ?? extractReportAsOf(rows),
      warnings: warn.length ? warn : undefined,
    };
  }
  return {
    ok: true,
    planByPeriodKey: planR.planByPeriodKey,
    factByPeriodKey: factR.factByPeriodKey,
    factUnavailableReason: factR.factUnavailableReason,
    columnPeriodKeysPlan: planR.columnPeriodKeysPlan,
    columnPeriodKeysFact: factR.columnPeriodKeysFact,
    zaydetColumnDebug: factR.zaydetColumnDebug ?? [],
    zaydetMonthVerify: factR.zaydetMonthVerify ?? [],
    reportAsOf: factR.reportAsOf ?? planR.reportAsOf ?? extractReportAsOf(rows),
    warnings: warn.length ? warn : undefined,
  };
}

/** Падеж «в ноябре», «в феврале» и т.д. для заголовков выгрузок вида «зашло в ноябре 2025». */
const RU_MONTH_IN_PREPOSITIONAL: Record<string, number> = {
  январе: 1,
  феврале: 2,
  марте: 3,
  апреле: 4,
  мае: 5,
  июне: 6,
  июле: 7,
  августе: 8,
  сентябре: 9,
  октябре: 10,
  ноябре: 11,
  декабре: 12,
};

/** Именительный/винительный («зайдет в апрель 2026», «зайдет май 2026»). */
const RU_MONTH_NOM_ACC: Record<string, number> = {
  январь: 1,
  февраль: 2,
  март: 3,
  апрель: 4,
  май: 5,
  июнь: 6,
  июль: 7,
  август: 8,
  сентябрь: 9,
  октябрь: 10,
  ноябрь: 11,
  декабрь: 12,
};

function resolveRuMonthWord(word: string): number | null {
  const w = word.toLowerCase().replace(/ё/g, "е").trim();
  if (RU_MONTH_WORD[w]) return RU_MONTH_WORD[w];
  if (RU_MONTH_IN_PREPOSITIONAL[w]) return RU_MONTH_IN_PREPOSITIONAL[w];
  if (RU_MONTH_NOM_ACC[w]) return RU_MONTH_NOM_ACC[w];
  const stem = w.slice(0, 3);
  return RU_ABBREV3[stem] ?? null;
}

/**
 * Из одной ячейки шапки: для факта графика допускается только «зайдет …»;
 * тип «план» — вспомогательно (заголовок содержит «план», но не «зайдет»).
 */
export function parseVerbaScheduleHeaderCell(raw: unknown): VerbaHeaderParsedMeta | null {
  const z = parseZaydetColumnMetaStrict(raw);
  if (z) return z;
  let h = normalizeHeaderForPeriodParse(raw);
  if (!h || h.includes("зайдет")) return null;
  if (!h.includes("план")) return null;
  const my = extractMonthYearFromNormalizedScheduleHeader(h);
  if (!my) return null;
  return { month: my.month, year: my.year, type: "plan", periodKey: toPeriodKey(my.year, my.month) };
}

/** @returns Канонический periodKey или null — колонки притока по заголовку (в т.ч. «факт», «оплачено», «зайдет»). */
export function matchZaydetMonthPeriodKey(cell: unknown): string | null {
  const s = String(cell ?? "").trim();
  if (!s) return null;
  return parseZaydetColumnMetaStrict(s)?.periodKey ?? classifyFactSpreadsheetTimelineCell(s)?.periodKey ?? null;
}

/** @deprecated Используйте {@link parseVerbaScheduleHeaderCell}. */
export function matchVerbaMonthHeaderCell(cell: unknown): string | null {
  return matchZaydetMonthPeriodKey(cell);
}

/**
 * Легаси: только факт из выгрузки (то же автодетект, что {@link parseFactCsv}).
 */
function parseVerbaMonthlyInflowFromDealRowsCsv(text: string): MarketingPaymentCsvParseResult {
  const r = parseFactCsv(text);
  if (!r.ok) return { ok: false, error: r.error };
  return {
    ok: true,
    planByPeriodKey: {},
    factByPeriodKey: r.factByPeriodKey,
    factUnavailableReason: r.factUnavailableReason,
    columnPeriodKeysPlan: [],
    columnPeriodKeysFact: r.columnPeriodKeysFact,
    zaydetColumnDebug: r.zaydetColumnDebug ?? [],
    zaydetMonthVerify: r.zaydetMonthVerify ?? [],
    reportAsOf: r.reportAsOf,
    warnings: r.warnings,
  };
}

/**
 * Сначала график платежей с колонкой «План …», иначе выгрузка Верба с колонками «зайдет …».
 */
export function parseMarketingPaymentCsvStrict(text: string): MarketingPaymentCsvParseResult {
  const std = parsePaymentScheduleCsv(text);
  if (std.ok) return std;

  const verba = parseVerbaMonthlyInflowFromDealRowsCsv(text);
  if (verba.ok) return verba;

  return {
    ok: false,
    error: [!std.ok ? std.error : "", !verba.ok ? verba.error : ""].filter(Boolean).join(" "),
  };
}

/** @deprecated Используйте {@link parseMarketingPaymentCsvStrict}. */
export function parsePaymentScheduleCsvOrVerba(text: string): MarketingPaymentCsvParseResult {
  return parseMarketingPaymentCsvStrict(text);
}
