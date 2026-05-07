import Papa from "papaparse";

/** Сообщение UI, если в CSV нет колонок «зайдет …» с месяцем и годом. */
export const PAYMENT_CSV_FACT_MAPPING_REQUIRED_RU =
  "Не удалось определить помесячные поступления: в файле нужны колонки с заголовком, содержащим «зайдет», месяц и год.";

/** Нет распознанной нижней строки «итого/всего» — факт по «зайдет» не извлекается. */
export const PAYMENT_CSV_FACT_TOTAL_ROW_REQUIRED_RU =
  "Не найдена нижняя строка итогов (итого/всего) с помесячными суммами по колонкам «зайдет» — проверьте выгрузку из Excel.";

/** Отладка факта: по каждой колонке «зайдет …» — ячейка в нижней строке итогов (значение в графике по месяцу — левая колонка периода при дублях). */
export type MarketingPaymentZaydetColumnDebugRow = {
  rawHeader: string;
  /** Канонический период YYYY-MM. */
  parsedMonth: string;
  /** Число из ячейки «зайдет» в нижней строке итогов (или 0, если строка не найдена). */
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
};

export type MarketingPaymentCsvParseResult = MarketingPaymentCsvParseOk | { ok: false; error: string };

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

  const s0 = String(raw).trim();
  if (!s0) return 0;

  const cleaned = s0
    .replace(/\s/g, "")
    .replace(/\u00a0/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return 0;

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
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

/** Индекс последней в файле строки итогов (снизу вверх). scanAfterIdx — обычно индекс строки шапки. */
function findLastZaydetGrandTotalRowIdx(rows: string[][], scanAfterIdx: number): number {
  for (let i = rows.length - 1; i > scanAfterIdx; i--) {
    const row = rows[i]!;
    if (!row.some((c) => String(c ?? "").trim() !== "")) continue;
    if (isVerbaRepeatedTableHeaderRow(row)) continue;
    if (isPaymentCsvGrandTotalRow(row)) return i;
  }
  return -1;
}

/** Итоговые / служебные строки (по первым ячейкам): не суммировать — иначе удвоение с детальными строками. */
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
 * Разбор CSV графика платежей: строка-якорь «План <месяц> <год>», обычно строка с «мар.26», «апр.26», …
 * Помесячный план = **сумма по всем строкам сделок** только в колонках календаря (не ДДУ, не долг, не «Итого»).
 */
export function parsePaymentScheduleCsv(text: string): MarketingPaymentCsvParseResult {
  const parsed = Papa.parse<string[]>(text, {
    delimiter: ";",
    quoteChar: '"',
    header: false,
    skipEmptyLines: false,
  });
  if (parsed.errors?.length) {
    console.warn("[payment schedule CSV]", parsed.errors.slice(0, 3));
  }

  const rawRows = (Array.isArray(parsed.data) ? parsed.data : []) as string[][];
  const rows = rawRows.filter((row) => Array.isArray(row) && row.some((c) => String(c ?? "").trim() !== ""));

  if (rows.length < 3) {
    return { ok: false, error: "Файл слишком короткий — ожидался отчёт с графиком платежей." };
  }

  let planRowIdx = -1;
  let planCol = -1;
  let firstMonth: { y: number; m: number } | null = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] ?? "").trim();
      const hit = matchPlanMonthCell(cell);
      if (hit) {
        planRowIdx = i;
        planCol = j;
        firstMonth = hit.colPeriod;
        break;
      }
    }
    if (planRowIdx >= 0) break;
  }

  if (planRowIdx < 0 || planCol < 0 || !firstMonth) {
    return {
      ok: false,
      error: "Не найдена строка заголовка с колонкой вида «План март 2026».",
    };
  }

  const colToPeriod = new Map<number, string>();
  colToPeriod.set(planCol, toPeriodKey(firstMonth.y, firstMonth.m));

  /** Индекс колонки → период YYYY-MM и сырой заголовок (только «зайдет …»). */
  const zaydetByCol = new Map<number, { periodKey: string; rawHeader: string }>();
  const factPeriodToColSets = new Map<string, Set<number>>();

  const ingestMonthCellsFromRow = (row: string[]) => {
    for (let j = 0; j < row.length; j++) {
      const pk = cellToSchedulePeriodKey(String(row[j] ?? ""));
      if (pk) colToPeriod.set(j, pk);
    }
  };

  const noteZaydetHeaderCell = (j: number, rawCell: string) => {
    const meta = parseZaydetColumnMetaStrict(rawCell);
    if (!meta) return;
    const rawHeader = String(rawCell ?? "").trim();
    if (!zaydetByCol.has(j)) {
      zaydetByCol.set(j, { periodKey: meta.periodKey, rawHeader });
    }
    let s = factPeriodToColSets.get(meta.periodKey);
    if (!s) {
      s = new Set<number>();
      factPeriodToColSets.set(meta.periodKey, s);
    }
    s.add(j);
  };

  const planRow = rows[planRowIdx]!;
  for (let j = 0; j < planRow.length; j++) {
    noteZaydetHeaderCell(j, String(planRow[j] ?? ""));
  }
  for (let j = planCol + 1; j < planRow.length; j++) {
    const pk = cellToSchedulePeriodKey(String(planRow[j] ?? ""));
    if (pk) colToPeriod.set(j, pk);
  }

  let abbrevRowIdx = -1;
  for (let i = planRowIdx + 1; i < Math.min(planRowIdx + 30, rows.length); i++) {
    const row = rows[i]!;
    const c0 = String(row[0] ?? "").trim();
    const s1 = String(row[1] ?? "").trim().toLowerCase();
    if (looksLikeDataRowFirstCell(c0)) break;
    if (s1.includes("итого")) break;
    let hits = 0;
    for (let j = 0; j < row.length; j++) {
      if (cellToSchedulePeriodKey(String(row[j] ?? ""))) hits++;
    }
    if (hits > 0) {
      ingestMonthCellsFromRow(row);
      for (let j = 0; j < row.length; j++) {
        noteZaydetHeaderCell(j, String(row[j] ?? ""));
      }
      abbrevRowIdx = i;
    }
  }

  const periodToCol = firstColIndexPerPeriodKey(colToPeriod);
  const columnPeriodKeysPlan = [...periodToCol.keys()].sort((a, b) => a.localeCompare(b));

  if (columnPeriodKeysPlan.length === 0) {
    return { ok: false, error: "Не удалось сопоставить колонки месяцев." };
  }

  const columnPeriodKeysFact = [...factPeriodToColSets.keys()].sort((a, b) => a.localeCompare(b));

  const byPeriodKey: Record<string, number> = {};
  const factAcc: Record<string, number> = {};
  const factZaydetCellCount: Record<string, number> = {};
  for (const pk of factPeriodToColSets.keys()) {
    factAcc[pk] = 0;
    factZaydetCellCount[pk] = 0;
  }

  const zaydetColToPeriod = new Map<number, string>();
  for (const [j, info] of zaydetByCol) zaydetColToPeriod.set(j, info.periodKey);
  const zaydetFirstColByPeriod = firstColIndexPerPeriodKey(zaydetColToPeriod);
  const factTotalRowIdx = findLastZaydetGrandTotalRowIdx(rows, planRowIdx);
  if (factTotalRowIdx >= 0) {
    const totalRow = rows[factTotalRowIdx]!;
    for (const pk of factPeriodToColSets.keys()) {
      const col = zaydetFirstColByPeriod.get(pk);
      if (col === undefined) continue;
      factAcc[pk] = parseMoneyRu(totalRow[col]);
      factZaydetCellCount[pk] = 1;
    }
  }

  /** Только строки сделок для плана; строки «Итого»/субитоги в сумму плана не входят. */
  let dataStarted = false;
  const dataStartRow = abbrevRowIdx >= 0 ? abbrevRowIdx + 1 : planRowIdx + 1;
  for (let i = dataStartRow; i < rows.length; i++) {
    const row = rows[i]!;
    const c0 = String(row[0] ?? "").trim();
    const c0Lower = c0.toLowerCase();
    const c1 = String(row[1] ?? "").trim().toLowerCase();

    if (/^итого\b|^всего\b|^в\s+том\s+числе/i.test(c0Lower)) continue;
    if (c1 === "итого" || /^итого\b/i.test(c1)) continue;
    if (isPaymentCsvSummaryLikeRow(row)) continue;

    if (!dataStarted) {
      if (looksLikeDataRowFirstCell(c0)) dataStarted = true;
      else continue;
    }
    if (!looksLikeDataRowFirstCell(c0)) continue;

    for (const [pk, col] of periodToCol) {
      byPeriodKey[pk] = (byPeriodKey[pk] ?? 0) + parseMoneyRu(row[col]);
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

  if (Object.keys(byPeriodKey).length === 0) {
    return { ok: false, error: "В файле нет числовых сумм в колонках плана платежей." };
  }

  let factByPeriodKey: Record<string, number> | null = null;
  let factUnavailableReason: string | null = null;
  if (factPeriodToColSets.size === 0) {
    factUnavailableReason = PAYMENT_CSV_FACT_MAPPING_REQUIRED_RU;
  } else if (factTotalRowIdx < 0) {
    factUnavailableReason = PAYMENT_CSV_FACT_TOTAL_ROW_REQUIRED_RU;
  } else {
    factByPeriodKey = factAcc;
  }

  const zaydetMonthVerify = buildZaydetMonthVerifyRows(factByPeriodKey, zaydetColumnDebug, factZaydetCellCount);

  return {
    ok: true,
    planByPeriodKey: byPeriodKey,
    factByPeriodKey,
    factUnavailableReason,
    columnPeriodKeysPlan,
    columnPeriodKeysFact,
    zaydetColumnDebug,
    zaydetMonthVerify,
    reportAsOf,
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

/** @returns Канонический periodKey или null — только колонки «зайдет …». */
export function matchZaydetMonthPeriodKey(cell: unknown): string | null {
  return parseZaydetColumnMetaStrict(cell)?.periodKey ?? null;
}

/** @deprecated Используйте {@link parseVerbaScheduleHeaderCell}. */
export function matchVerbaMonthHeaderCell(cell: unknown): string | null {
  return matchZaydetMonthPeriodKey(cell);
}

function findVerbaCashflowHeaderRowIdx(rows: string[][]): number {
  let bestI = -1;
  let bestCnt = 0;
  for (let i = 0; i < Math.min(30, rows.length); i++) {
    let cnt = 0;
    for (const cell of rows[i]!) {
      if (parseZaydetColumnMetaStrict(cell)) cnt++;
    }
    if (cnt > bestCnt) {
      bestCnt = cnt;
      bestI = i;
    }
  }
  return bestCnt >= 1 ? bestI : -1;
}

/**
 * Выгрузка Верба: колонки, где нормализованный заголовок содержит «зайдет», месяц/год — по нормализации и includes.
 * Факт по месяцу — ячейка в **последней строке итогов** (итого/всего), как в Excel; при нескольких колонках на один месяц в графике — левая колонка периода.
 */
function parseVerbaMonthlyInflowFromDealRowsCsv(text: string): MarketingPaymentCsvParseResult {
  const parsed = Papa.parse<string[]>(text, {
    delimiter: ";",
    quoteChar: '"',
    header: false,
    skipEmptyLines: false,
  });
  if (parsed.errors?.length) {
    console.warn("[verba payment CSV]", parsed.errors.slice(0, 3));
  }

  const rawRows = (Array.isArray(parsed.data) ? parsed.data : []) as string[][];
  const rows = rawRows.filter((row) => Array.isArray(row) && row.some((c) => String(c ?? "").trim() !== ""));

  if (rows.length < 3) {
    return { ok: false, error: "Файл слишком короткий для выгрузки с колонками «зайдет …»." };
  }

  const headerIdx = findVerbaCashflowHeaderRowIdx(rows);
  if (headerIdx < 0) {
    return {
      ok: false,
      error: "Не найдена строка шапки с колонками «зайдет» (месяц и год в заголовке).",
    };
  }

  const hdr = rows[headerIdx]!;
  const periodToCols = new Map<string, number[]>();
  const zaydetCols: { j: number; rawHeader: string; periodKey: string }[] = [];

  for (let j = 0; j < hdr.length; j++) {
    const rawCell = hdr[j];
    const meta = parseZaydetColumnMetaStrict(rawCell);
    if (!meta) continue;
    const rawHeader = String(rawCell ?? "").trim();
    zaydetCols.push({ j, rawHeader, periodKey: meta.periodKey });
    const arr = periodToCols.get(meta.periodKey) ?? [];
    arr.push(j);
    periodToCols.set(meta.periodKey, arr);
  }

  if (periodToCols.size === 0) {
    return {
      ok: false,
      error: "Нет колонок факта: в заголовке должны быть «зайдет», распознаваемый месяц и год.",
    };
  }

  const factAcc: Record<string, number> = {};
  const factZaydetCellCount: Record<string, number> = {};
  for (const pk of periodToCols.keys()) {
    factAcc[pk] = 0;
    factZaydetCellCount[pk] = 0;
  }

  const zaydetColToPeriod = new Map<number, string>();
  for (const c of zaydetCols) zaydetColToPeriod.set(c.j, c.periodKey);
  const zaydetFirstColByPeriod = firstColIndexPerPeriodKey(zaydetColToPeriod);

  const factTotalRowIdx = findLastZaydetGrandTotalRowIdx(rows, headerIdx);
  if (factTotalRowIdx >= 0) {
    const totalRow = rows[factTotalRowIdx]!;
    for (const pk of periodToCols.keys()) {
      const col = zaydetFirstColByPeriod.get(pk);
      if (col === undefined) continue;
      factAcc[pk] = parseMoneyRu(totalRow[col]);
      factZaydetCellCount[pk] = 1;
    }
  }

  const zaydetColumnDebug: MarketingPaymentZaydetColumnDebugRow[] = zaydetCols.map(({ j, rawHeader, periodKey }) => ({
    rawHeader,
    parsedMonth: periodKey,
    parsedSum: factTotalRowIdx >= 0 ? parseMoneyRu(rows[factTotalRowIdx]![j]) : 0,
  }));

  const columnPeriodKeysFact = [...periodToCols.keys()].sort((a, b) => a.localeCompare(b));
  const reportAsOf = extractReportAsOf(rows);

  let factByPeriodKey: Record<string, number> | null = null;
  let factUnavailableReason: string | null = null;
  if (factTotalRowIdx < 0) {
    factUnavailableReason = PAYMENT_CSV_FACT_TOTAL_ROW_REQUIRED_RU;
  } else {
    factByPeriodKey = factAcc;
  }

  const zaydetMonthVerify = buildZaydetMonthVerifyRows(factByPeriodKey, zaydetColumnDebug, factZaydetCellCount);

  return {
    ok: true,
    planByPeriodKey: {},
    factByPeriodKey,
    factUnavailableReason,
    columnPeriodKeysPlan: [],
    columnPeriodKeysFact,
    zaydetColumnDebug,
    zaydetMonthVerify,
    reportAsOf,
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
