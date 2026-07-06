/**
 * Разбор экспорта отчёта ГПР: разделитель `;` или `,` (если в строке нет `;`), BOM снимается до разбивки по строкам.
 * Колонки «ID Код», «Этап работ», даты план/факт и «№ статей» определяются по строкам заголовка.
 * Поле `name` — только «Этап работ», не «Описание работ».
 * Строки без дат не отбрасываются — поля дат остаются null.
 */

export type GprReportCsvRow = {
  /** Индекс строки в массиве после `split(/\r?\n/)` (0-based). */
  sourceRowIndex: number;
  /** Порядковый номер работы из колонки «№ статей» (если задан в CSV). */
  articleNumber: number | null;
  /** Последний объявленный в файле объект (заголовок секции без шифра в первой колонке). */
  objectType: string;
  rawCode: string;
  code: string;
  /** Наименование этапа («Этап работ»), не «Описание работ». */
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

/** Fallback при отсутствии подзаголовка дат (экспорт без «№ статей»). */
const LEGACY_DATE_COLUMN_MAP = {
  planStartIdx: 10,
  planEndIdx: 11,
  factStartIdx: 13,
  factEndIdx: 14,
  completionIdx: 17,
} as const;

type GprReportCsvColumnMap = {
  /** Колонка «№ статей»; null — нумерация только по шифру WBS. */
  articleIdx: number | null;
  codeIdx: number;
  stageIdx: number;
  planStartIdx: number;
  planEndIdx: number;
  factStartIdx: number;
  factEndIdx: number;
  completionIdx: number;
};

const DEFAULT_COLUMN_MAP: GprReportCsvColumnMap = {
  articleIdx: null,
  codeIdx: 0,
  stageIdx: 1,
  ...LEGACY_DATE_COLUMN_MAP,
};

function normalizeHeaderCell(cell: string): string {
  return cell.trim().toLowerCase().replace(/\s+/g, " ");
}

function detectColumnMapFromHeaderRow(cols: string[]): GprReportCsvColumnMap | null {
  const norm = cols.map(normalizeHeaderCell);
  const codeIdx = norm.findIndex((c) => c === "id код" || c.startsWith("id код"));
  const stageIdx = norm.findIndex((c) => c === "этап работ" || c.startsWith("этап работ"));
  if (codeIdx < 0 || stageIdx < 0) return null;
  const completionIdx = norm.findIndex(
    (c) => c.includes("прогресс выполнения") || c.startsWith("прогресс"),
  );
  return {
    articleIdx: null,
    codeIdx,
    stageIdx,
    planStartIdx: LEGACY_DATE_COLUMN_MAP.planStartIdx,
    planEndIdx: LEGACY_DATE_COLUMN_MAP.planEndIdx,
    factStartIdx: LEGACY_DATE_COLUMN_MAP.factStartIdx,
    factEndIdx: LEGACY_DATE_COLUMN_MAP.factEndIdx,
    completionIdx: completionIdx >= 0 ? completionIdx : LEGACY_DATE_COLUMN_MAP.completionIdx,
  };
}

function isPlanStartHeader(cell: string): boolean {
  const n = normalizeHeaderCell(cell);
  return n === "дата начала" || n.startsWith("дата начала");
}

function isPlanEndHeader(cell: string): boolean {
  const n = normalizeHeaderCell(cell);
  return n === "дата окончания" || n.startsWith("дата окончания");
}

function detectDateIndicesFromSubHeaderRow(cols: string[]): Pick<
  GprReportCsvColumnMap,
  "planStartIdx" | "planEndIdx" | "factStartIdx" | "factEndIdx"
> | null {
  const startIdxs: number[] = [];
  const endIdxs: number[] = [];
  for (let i = 0; i < cols.length; i++) {
    const cell = cols[i] ?? "";
    if (isPlanStartHeader(cell)) startIdxs.push(i);
    else if (isPlanEndHeader(cell)) endIdxs.push(i);
  }
  if (startIdxs.length < 2 || endIdxs.length < 2) return null;
  const planStartIdx = startIdxs[0]!;
  const planEndIdx = endIdxs.find((idx) => idx > planStartIdx);
  const factStartIdx = startIdxs.find((idx) => idx > (planEndIdx ?? planStartIdx));
  const factEndIdx = endIdxs.find((idx) => idx > (factStartIdx ?? planStartIdx));
  if (
    planEndIdx == null ||
    factStartIdx == null ||
    factEndIdx == null ||
    planEndIdx <= planStartIdx ||
    factEndIdx <= factStartIdx
  ) {
    return null;
  }
  return { planStartIdx, planEndIdx, factStartIdx, factEndIdx };
}

function isGprReportHeaderRow(cols: string[]): boolean {
  return detectColumnMapFromHeaderRow(cols) != null;
}

function isGprReportSubHeaderRow(cols: string[]): boolean {
  const joined = cols.map(normalizeHeaderCell).join(" ");
  return joined.includes("дата начала") && joined.includes("дата окончания");
}

/** Подстрока заголовков с «№ статей» — задаёт колонку порядкового номера работы. */
function detectArticleIdxFromSubHeaderRow(cols: string[]): number | null {
  for (let i = 0; i < cols.length; i++) {
    const cell = normalizeHeaderCell(cols[i] ?? "");
    if (
      cell === "№ статей" ||
      cell.startsWith("№ статей") ||
      cell === "№" ||
      cell.startsWith("№ п/п")
    ) {
      return i;
    }
  }
  return null;
}

function parseArticleNumberCell(cell: string | undefined): number | null {
  const raw = (cell ?? "").trim();
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

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

/**
 * Подпись объекта стройки из строки-секции (без шифра): только «Этап работ» / первая колонка,
 * без склейки описаний, дат и прочих полей CSV.
 */
function sectionObjectLabelFromCols(cols: string[], map: GprReportCsvColumnMap): string {
  const codeCell = (cols[map.codeIdx] ?? "").trim();
  if (codeCell && firstCellLooksLikeTaskCode(codeCell)) return "";

  const stageCell = (cols[map.stageIdx] ?? "").trim();
  if (stageCell && normalizeHeaderCell(stageCell) !== "этап работ") return stageCell;

  const firstNonEmpty = cols.find((c) => c.trim().length > 0);
  return firstNonEmpty?.trim() ?? "";
}

export type ParseGprReportCsvResult = {
  rows: GprReportCsvRow[];
  /** Число строк после `split(/\r?\n/)` (включая пустые). */
  csvPapaRowCount: number;
  /** Диагностика заполнения дат после разбора. */
  rowsWithPlanStart: number;
  rowsWithFactStart: number;
};

/**
 * Разбор: `;` или `,` (если в строке нет `;`), BOM, строки через `split(/\r?\n/)`.
 * Пропускаются только полностью пустые строки (после trim).
 * Строка без шифра в первой колонке задаёт объект (`currentObject`), задачи не создаёт.
 */
export function parseGprReportCsvWithStats(text: string): ParseGprReportCsvResult {
  const normalized = text.replace(/^\uFEFF/, "");
  const rows = normalized.split(/\r?\n/);

  const out: GprReportCsvRow[] = [];
  let currentObject = "";
  let columnMap: GprReportCsvColumnMap = { ...DEFAULT_COLUMN_MAP };

  for (let i = 0; i < rows.length; i++) {
    const line = rows[i]!;
    if (line.trim() === "") continue;

    const cols = splitCsvLineToCols(line);

    const detectedMap = detectColumnMapFromHeaderRow(cols);
    if (detectedMap) {
      columnMap = detectedMap;
      continue;
    }
    if (isGprReportSubHeaderRow(cols)) {
      const articleIdx = detectArticleIdxFromSubHeaderRow(cols);
      const dateIdxs = detectDateIndicesFromSubHeaderRow(cols);
      columnMap = {
        ...columnMap,
        articleIdx: articleIdx ?? columnMap.articleIdx,
        ...(dateIdxs ?? {}),
      };
      continue;
    }

    const codeCell = cols[columnMap.codeIdx] ?? cols[0] ?? "";
    const codeCellText = String(codeCell).trim();

    if (!codeCellText) {
      const title = sectionObjectLabelFromCols(cols, columnMap);
      if (title.length > 0) currentObject = title;
      continue;
    }

    if (!firstCellLooksLikeTaskCode(codeCellText)) {
      if (isGprReportHeaderRow(cols)) continue;
      const title = sectionObjectLabelFromCols(cols, columnMap);
      if (title.length > 0) currentObject = title;
      continue;
    }

    const rawCode = codeCell;
    const stageCell = cols[columnMap.stageIdx] ?? "";

    const rawTrimmed = normalizeCsvCodeRaw(String(rawCode));
    const code = ensureWorkCode(rawTrimmed, i);
    const rawClean = code;

    let name = String(stageCell).trim();
    if (normalizeHeaderCell(name) === "этап работ") continue;
    if (!name) name = code;

    const planStart = ruDateCellToIsoOrNull(cols[columnMap.planStartIdx]);
    const planEnd = ruDateCellToIsoOrNull(cols[columnMap.planEndIdx]);
    const factStart = ruDateCellToIsoOrNull(cols[columnMap.factStartIdx]);
    const factEnd = ruDateCellToIsoOrNull(cols[columnMap.factEndIdx]);
    const completion = parseCompletionCell(cols[columnMap.completionIdx]);

    const articleNumber =
      columnMap.articleIdx != null
        ? parseArticleNumberCell(cols[columnMap.articleIdx])
        : null;

    out.push({
      sourceRowIndex: i,
      articleNumber,
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

  const rowsWithPlanStart = out.filter((r) => r.planStart != null).length;
  const rowsWithFactStart = out.filter((r) => r.factStart != null).length;

  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    console.info("[gprReportCsv] parse stats", {
      taskRows: out.length,
      rowsWithPlanStart,
      rowsWithFactStart,
      columnMap: {
        articleIdx: columnMap.articleIdx,
        codeIdx: columnMap.codeIdx,
        planStartIdx: columnMap.planStartIdx,
        planEndIdx: columnMap.planEndIdx,
        factStartIdx: columnMap.factStartIdx,
        factEndIdx: columnMap.factEndIdx,
        completionIdx: columnMap.completionIdx,
      },
    });
  }

  return { rows: out, csvPapaRowCount: rows.length, rowsWithPlanStart, rowsWithFactStart };
}

export function parseGprReportCsv(text: string): GprReportCsvRow[] {
  return parseGprReportCsvWithStats(text).rows;
}
