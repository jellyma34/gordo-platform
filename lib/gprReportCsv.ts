/**
 * Разбор экспорта отчёта ГПР: разделитель `;` или `,` (если в строке нет `;`), BOM снимается до разбивки по строкам.
 * Колонка 0 — шифр, колонка 1 — наименование; даты/прогресс — по фиксированным индексам при наличии ячеек.
 * Строки без дат не отбрасываются — поля дат остаются null.
 */

export type GprReportCsvRow = {
  /** Индекс строки в массиве после `split(/\r?\n/)` (0-based). */
  sourceRowIndex: number;
  /** Последний объявленный в файле объект (заголовок секции без шифра в первой колонке). */
  objectType: string;
  rawCode: string;
  code: string;
  name: string;
  planStart: string | null;
  planEnd: string | null;
  factStart: string | null;
  factEnd: string | null;
  completion: number;
};

const RU_DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/;

/** DD.MM.YYYY → ISO date или null при пустой ячейке / sentinel Excel. */
export function ruDateCellToIsoOrNull(cell: string | undefined): string | null {
  const raw = cell?.trim();
  if (!raw) return null;
  const m = raw.match(RU_DATE_RE);
  if (!m) return null;
  const dd = m[1]!;
  const mm = m[2]!;
  const yyyy = m[3]!;
  if (yyyy === "1900") return null;
  if (dd === "00" || mm === "00") return null;
  if (raw.includes("00.01.1900")) return null;
  const d = Number(dd);
  const mo = Number(mm);
  const y = Number(yyyy);
  if (!Number.isFinite(d) || !Number.isFinite(mo) || !Number.isFinite(y)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function parseCompletionCell(raw: string | undefined): number {
  if (raw == null) return 0;
  const s = raw.trim().replace(/\s+/g, "").replace(",", ".");
  if (!s) return 0;
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  if (n < 0 || n > 100) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * Нормализация шифра после чтения из CSV (часто «2.06.01.» с точкой в конце).
 */
export function normalizeGprWorkCodeFromCsvRaw(rawInput: unknown): string | null {
  const s = String(rawInput ?? "").trim().replace(/\.+$/, "");
  const parts = s.split(".").filter(Boolean);
  if (parts.length < 2) return null;
  return parts.join(".");
}

function extractCodeDigitsFallback(raw: string): string | null {
  const digitsOnly = raw.replace(/[^\d.]/g, "").replace(/\.+$/, "");
  const parts = digitsOnly.split(".").filter(Boolean);
  if (parts.length < 2) return null;
  return parts.join(".");
}

function ensureWorkCode(rawTrimmed: string, rowIndex: number): string {
  const normalized = normalizeGprWorkCodeFromCsvRaw(rawTrimmed);
  if (normalized) return normalized;
  const digits = extractCodeDigitsFallback(rawTrimmed);
  if (digits) return digits;
  return `9.99.${rowIndex + 1}`;
}

/** Типичная разметка экспорта ГПР: план/факт начиная с 10-й колонки; короткие строки допускаются — недостающие ячейки = undefined. */
const PLAN_START_IDX = 10;

/** Обёртки Excel: пробелы и завершающая точка у шифра в первой колонке (как в ТЗ импорта). */
function normalizeCsvCodeRaw(raw: string): string {
  return raw.replace(/\s+/g, "").replace(/\.$/, "");
}

/** Убрать окружающие кавычки у ячейки CSV. */
function stripCsvCellQuotes(cell: string): string {
  let s = cell.trim();
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    s = s.slice(1, -1);
  }
  return s.trim();
}

function splitCsvLineToCols(line: string): string[] {
  const delimiter = line.includes(";") ? ";" : ",";
  return line.split(delimiter).map((c) => stripCsvCellQuotes(c));
}

/**
 * Строка задачи: первая колонка похожа на шифр (`2.05.01`), не дата ДД.ММ.ГГГГ.
 * Строки вроде «Жилой дом» сюда не попадают — это заголовки секций (`currentObject`).
 */
function firstCellLooksLikeTaskCode(cell: string): boolean {
  const rawTrim = stripCsvCellQuotes(cell);
  if (!rawTrim || RU_DATE_RE.test(rawTrim)) return false;
  const t = normalizeCsvCodeRaw(rawTrim);
  if (!t) return false;
  return /^\d+\.\d+/.test(t);
}

/** Текст названия секции из строки без шифра в первой колонке. */
function sectionTitleFromCols(cols: string[]): string {
  return cols.filter((c) => c.length > 0).join(" ").trim();
}

export type ParseGprReportCsvResult = {
  rows: GprReportCsvRow[];
  /** Число строк после `split(/\r?\n/)` (включая пустые). */
  csvPapaRowCount: number;
};

/**
 * Разбор: `;` или `,` (если в строке нет `;`), BOM, строки через `split(/\r?\n/)`.
 * Пропускаются только полностью пустые строки (после trim).
 * Строка без шифра в первой колонке задаёт объект (`currentObject`), задачи не создаёт.
 */
export function parseGprReportCsvWithStats(text: string): ParseGprReportCsvResult {
  const normalized = text.replace(/^\uFEFF/, "");
  const rows = normalized.split(/\r?\n/);

  console.log("TOTAL ROWS:", rows.length);

  const out: GprReportCsvRow[] = [];
  let currentObject = "";

  for (let i = 0; i < rows.length; i++) {
    const line = rows[i]!;
    if (line.trim() === "") continue;

    const cols = splitCsvLineToCols(line);
    console.log("CSV ROW:", cols);

    const firstCell = cols[0];
    if (!firstCell || !String(firstCell).trim()) continue;

    if (!firstCellLooksLikeTaskCode(firstCell)) {
      const title = sectionTitleFromCols(cols);
      if (title.length > 0) {
        currentObject = title;
      }
      continue;
    }

    const rawCode = cols[0] ?? "";
    const nameCell = cols[1] ?? "";

    const rawTrimmed = normalizeCsvCodeRaw(String(rawCode));
    const code = ensureWorkCode(rawTrimmed, i);
    const rawClean = code;

    let name = String(nameCell).trim();
    if (!name) name = code;

    const planStart = ruDateCellToIsoOrNull(cols[PLAN_START_IDX]);
    const planEnd = ruDateCellToIsoOrNull(cols[PLAN_START_IDX + 1]);
    const factStart = ruDateCellToIsoOrNull(cols[PLAN_START_IDX + 3]);
    const factEnd = ruDateCellToIsoOrNull(cols[PLAN_START_IDX + 4]);
    const completion = parseCompletionCell(cols[PLAN_START_IDX + 6]);

    out.push({
      sourceRowIndex: i,
      objectType: currentObject,
      rawCode: rawClean,
      code,
      name,
      planStart,
      planEnd,
      factStart,
      factEnd,
      completion,
    });
  }

  console.log("PARSED TASKS:", out.length);

  return { rows: out, csvPapaRowCount: rows.length };
}

export function parseGprReportCsv(text: string): GprReportCsvRow[] {
  return parseGprReportCsvWithStats(text).rows;
}
