import Papa from "papaparse";

export type PaymentScheduleParseResult =
  | {
      ok: true;
      byPeriodKey: Record<string, number>;
      /** Первая колонка плана («План март 2026») и др. */
      columnPeriodKeys: string[];
      reportAsOf?: string;
    }
  | { ok: false; error: string };

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

export function parseMoneyRu(raw: unknown): number {
  const s = String(raw ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(/\u00a0/g, "")
    .replace(",", ".");
  if (!s) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function toPeriodKey(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}`;
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

function parseAbbrevOrYearCell(cell: string): string | null {
  const t = cell.trim();
  if (!t) return null;
  const abb = t.match(/^([а-яё]{3,5})\.(\d{2})\s*$/i);
  if (abb) {
    const pref = abb[1].toLowerCase().slice(0, 3);
    const mm = RU_ABBREV3[pref];
    if (!mm) return null;
    const yy = Number(abb[2]);
    if (!Number.isFinite(yy)) return null;
    return toPeriodKey(2000 + yy, mm);
  }
  if (/^\d{4}$/.test(t)) {
    return `${t}-01`;
  }
  return null;
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
 * Разбор CSV графика платежей: строка с «План <месяц> <год>», следующая строка с «апр.26» …
 * Суммы по месяцам — из строки «Итого», иначе суммирование строк сделок.
 */
export function parsePaymentScheduleCsv(text: string): PaymentScheduleParseResult {
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

  const ingestMonthCellsFromRow = (row: string[]) => {
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] ?? "").trim();
      const pk = parseAbbrevOrYearCell(cell);
      if (pk) colToPeriod.set(j, pk);
    }
  };

  const planRow = rows[planRowIdx]!;
  for (let j = planCol + 1; j < planRow.length; j++) {
    const cell = String(planRow[j] ?? "").trim();
    const pk = parseAbbrevOrYearCell(cell);
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
      const cell = String(row[j] ?? "").trim();
      if (parseAbbrevOrYearCell(cell)) hits++;
    }
    if (hits > 0) {
      ingestMonthCellsFromRow(row);
      abbrevRowIdx = i;
    }
  }

  const periodToCol = firstColIndexPerPeriodKey(colToPeriod);
  const columnPeriodKeys = [...periodToCol.keys()].sort((a, b) => a.localeCompare(b));

  if (columnPeriodKeys.length === 0) {
    return { ok: false, error: "Не удалось сопоставить колонки месяцев." };
  }

  let totalsRowIdx = -1;
  for (let i = planRowIdx; i < rows.length; i++) {
    const row = rows[i]!;
    const s1 = String(row[1] ?? "").trim().toLowerCase();
    if (s1.includes("итого")) totalsRowIdx = i;
  }

  const byPeriodKey: Record<string, number> = {};

  if (totalsRowIdx >= 0) {
    const trow = rows[totalsRowIdx]!;
    for (const [pk, col] of periodToCol) {
      byPeriodKey[pk] = parseMoneyRu(trow[col]);
    }
  } else {
    let dataStarted = false;
    for (let i = abbrevRowIdx >= 0 ? abbrevRowIdx + 1 : planRowIdx + 1; i < rows.length; i++) {
      const row = rows[i]!;
      const c0 = String(row[0] ?? "").trim();
      if (/итого/i.test(c0) || row.some((c) => /итого/i.test(String(c ?? "").trim()))) break;
      if (!dataStarted) {
        if (looksLikeDataRowFirstCell(c0)) dataStarted = true;
        else continue;
      }
      if (!looksLikeDataRowFirstCell(c0)) continue;
      for (const [pk, col] of periodToCol) {
        byPeriodKey[pk] = (byPeriodKey[pk] ?? 0) + parseMoneyRu(row[col]);
      }
    }
  }

  const reportAsOf = extractReportAsOf(rows);

  if (Object.keys(byPeriodKey).length === 0) {
    return { ok: false, error: "В файле нет числовых сумм в колонках плана платежей." };
  }

  return { ok: true, byPeriodKey, columnPeriodKeys, reportAsOf };
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

function normalizeVerbaHeaderCell(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Одна ячейка заголовка: «зайдет в феврале 2025», «зашло в ноябре 2025», «зашло январь 2026».
 */
export function matchVerbaMonthHeaderCell(cell: unknown): string | null {
  let s = normalizeVerbaHeaderCell(cell);
  if (!s) return null;
  s = s.replace(/^зз+ашло/i, "зашло");
  const lower = s.toLowerCase();
  const tryYear = (mw: string, yRaw: string): string | null => {
    let y = Number(yRaw);
    if (!Number.isFinite(y)) return null;
    if (y < 100) y += 2000;
    const m = resolveRuMonthWord(mw);
    if (!m) return null;
    return toPeriodKey(y, m);
  };
  const patterns: Array<{ re: RegExp; g: number; y: number }> = [
    { re: /зайдет\s+в\s+([а-яё]+)\s+(\d{4})/i, g: 1, y: 2 },
    { re: /зашло\s+в\s+([а-яё]+)\s+(\d{4})/i, g: 1, y: 2 },
    { re: /зашло\s+([а-яё]+)\s+(\d{4})/i, g: 1, y: 2 },
    /** «зайдет май 2026», «зайдет август 2026» (без предлога «в», год может быть на следующей строке в ячейке). */
    { re: /зайдет\s+([а-яё]+)\s+(\d{4})/i, g: 1, y: 2 },
    { re: /зайдет\s+в\s+([а-яё]+)\s+(\d{2})(?:\D|$)/i, g: 1, y: 2 },
    { re: /зашло\s+в\s+([а-яё]+)\s+(\d{2})(?:\D|$)/i, g: 1, y: 2 },
    { re: /зашло\s+([а-яё]+)\s+(\d{2})(?:\D|$)/i, g: 1, y: 2 },
  ];
  for (const { re, g, y } of patterns) {
    const m = lower.match(re);
    if (!m) continue;
    const pk = tryYear(m[g]!, m[y]!);
    if (pk) return pk;
  }
  return null;
}

function findVerbaHeaderRowIdx(rows: string[][]): number {
  let bestI = -1;
  let bestCnt = 0;
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    let cnt = 0;
    for (const cell of rows[i]!) {
      if (matchVerbaMonthHeaderCell(cell)) cnt++;
    }
    if (cnt > bestCnt) {
      bestCnt = cnt;
      bestI = i;
    }
  }
  return bestCnt >= 2 ? bestI : -1;
}

/** Строка итога «НАКОПИТЕЛЬНО НА ЭСКРОУ с паркингом», не субтоталы по квартирам/кладовым. */
function findVerbaGrandEscrowRowIdx(rows: string[][]): number {
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < rows.length; i++) {
    const joined = rows[i]!.map((c) => String(c ?? "")).join(" ").toLowerCase();
    if (!joined.includes("накопит") || !joined.includes("эскроу")) continue;
    let score = 0;
    if (joined.includes("паркинг")) score += 100;
    if (joined.includes("по квартирам")) score -= 50;
    if (joined.includes("кладов")) score -= 50;
    if (joined.includes("коммерц")) score -= 50;
    if (joined.includes("машиномест")) score -= 50;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/**
 * Выгрузка «факт поступлений» / эскроу: помесячные колонки в шапке, одна строка «НАКОПИТЕЛЬНО НА ЭСКРОУ…».
 * Берём только эту строку — без суммирования по сделкам и без субитогов (квартиры+кладовые+…).
 */
export function parseVerbaEscrowInflowScheduleCsv(text: string): PaymentScheduleParseResult {
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
    return { ok: false, error: "Файл слишком короткий — не найдена сводная строка эскроу." };
  }

  const headerIdx = findVerbaHeaderRowIdx(rows);
  if (headerIdx < 0) {
    return {
      ok: false,
      error: "Не найдены колонки месяцев вида «зашло в ноябре 2025» / «зашло январь 2026».",
    };
  }

  const hdr = rows[headerIdx]!;
  const colToPeriod = new Map<number, string>();
  const seenPeriodKey = new Set<string>();
  for (let j = 0; j < hdr.length; j++) {
    const pk = matchVerbaMonthHeaderCell(hdr[j]);
    if (!pk || seenPeriodKey.has(pk)) continue;
    seenPeriodKey.add(pk);
    colToPeriod.set(j, pk);
  }

  if (colToPeriod.size === 0) {
    return { ok: false, error: "Не удалось сопоставить колонки с месяцами (формат Верба/эскроу)." };
  }

  const totalsIdx = findVerbaGrandEscrowRowIdx(rows);
  if (totalsIdx < 0) {
    return {
      ok: false,
      error: "Не найдена строка «НАКОПИТЕЛЬНО НА ЭСКРОУ» (итог с паркингом).",
    };
  }

  const totalsRow = rows[totalsIdx]!;
  const periodToCol = firstColIndexPerPeriodKey(colToPeriod);
  const byPeriodKey: Record<string, number> = {};
  for (const [pk, col] of periodToCol) {
    byPeriodKey[pk] = parseMoneyRu(totalsRow[col]);
  }

  const columnPeriodKeys = [...periodToCol.keys()].sort((a, b) => a.localeCompare(b));
  const reportAsOf = extractReportAsOf(rows);

  const hasNumeric = Object.values(byPeriodKey).some((v) => Number.isFinite(v) && v !== 0);
  if (!hasNumeric) {
    return { ok: false, error: "В сводной строке эскроу нет числовых сумм по месяцам." };
  }

  return { ok: true, byPeriodKey, columnPeriodKeys, reportAsOf };
}

/** Сначала формат «План март 2026», иначе выгрузка эскроу с колонками «зашло…». */
export function parsePaymentScheduleCsvOrVerba(text: string): PaymentScheduleParseResult {
  const std = parsePaymentScheduleCsv(text);
  if (std.ok) return std;
  return parseVerbaEscrowInflowScheduleCsv(text);
}
