import Papa from "papaparse";

import { readCsvFileTextSmart } from "@/lib/csvTextEncoding";
import { normalizeGprWorkCodeFromCsvRaw, ruDateCellToIsoOrNull } from "@/lib/gprReportCsv";
import {
  coerceTender,
  contractDeviationDays,
  getGprStageFromTenderCode,
  inferPartIdFromStage,
  type Tender,
  normalizeTenderCycleStatus,
  type TenderProcurementStatus,
} from "@/lib/tenderData";

export type TenderCsvSkipReason =
  | "empty_row"
  | "missing_code"
  | "missing_name"
  | "invalid_code"
  | "coerce_failed";

export type TenderCsvSkippedRow = {
  rowIndex: number;
  reason: TenderCsvSkipReason;
  codePreview: string;
  namePreview: string;
};

/** Схема «Закупка услуг (тендеры).csv»: 2 строки шапки, данные с 3-й. */
export type TenderCsvLayout = "procurement" | "flat";

export type TenderCsvImportAudit = {
  parsedRows: number;
  loaded: number;
  skipped: number;
  parseErrors: number;
  skippedRows: TenderCsvSkippedRow[];
  headers: string[];
  unmappedHeaders: string[];
  columnUsage: Record<string, "mapped" | "ignored">;
  layout: TenderCsvLayout;
};

export type TenderCsvNormalizeResult = {
  tenders: Tender[];
  audit: TenderCsvImportAudit;
};

/**
 * Закупочный реестр «Закупка услуг (тендеры).csv» — фиксированные колонки Excel (0-based).
 * B=код, C=наименование, F–M — сроки и стоимость (план/факт).
 */
export const TENDER_PROCUREMENT_COL_INDEX = {
  serial: 0,
  code: 1,
  name: 2,
  planStart: 5,
  factStart: 6,
  planContractDate: 8,
  factContractDate: 9,
  costPlan: 11,
  costFact: 12,
} as const;

export type TenderColumnMapKey =
  | "id"
  | "code"
  | "name"
  | "stage"
  | "planStart"
  | "factStart"
  | "planContractDate"
  | "factContractDate"
  | "cost"
  | "contractor"
  | "status"
  | "comment"
  | "partId";

export type TenderColumnMap = Record<TenderColumnMapKey, number>;

const EMPTY_COLUMN_MAP = (): TenderColumnMap => ({
  id: -1,
  code: -1,
  name: -1,
  stage: -1,
  planStart: -1,
  factStart: -1,
  planContractDate: -1,
  factContractDate: -1,
  cost: -1,
  contractor: -1,
  status: -1,
  comment: -1,
  partId: -1,
});

function normalizeHeaderCell(h: string): string {
  return String(h).replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, " ");
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function sniffCsvDelimiter(text: string): string {
  const lines = stripBom(text).split(/\r?\n/).slice(0, 48);
  let commas = 0;
  let semis = 0;
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    commas += (t.match(/,/g) ?? []).length;
    semis += (t.match(/;/g) ?? []).length;
  }
  return semis > commas ? ";" : ",";
}

function forwardFillHeaderRow(cells: string[]): string[] {
  let last = "";
  return cells.map((c) => {
    const t = c.trim();
    if (t) last = t;
    return last;
  });
}

function makeUniqueHeaderKeys(headerCells: string[]): string[] {
  const counts = new Map<string, number>();
  return headerCells.map((raw, i) => {
    const h = raw.replace(/^\uFEFF/, "").trim().replace(/\s+/g, " ") || `__col_${i}`;
    const n = (counts.get(h) ?? 0) + 1;
    counts.set(h, n);
    return n === 1 ? h : `${h}__dup_${i}`;
  });
}

function subHeaderCellMergesWithTop(bot: string): boolean {
  const s = bot.trim().toLowerCase();
  if (!s) return false;
  if (s === "план" || s === "факт" || s.includes("откл")) return true;
  if (s === "гпр" || s.includes("отставан")) return true;
  return false;
}

function mergeTwoHeaderRows(primary: unknown[], secondary: unknown[]): string[] {
  const a = primary.map((c) =>
    String(c ?? "")
      .replace(/^\uFEFF/, "")
      .trim()
      .replace(/\s+/g, " "),
  );
  const bRaw = secondary.map((c) =>
    String(c ?? "")
      .replace(/^\uFEFF/, "")
      .trim()
      .replace(/\s+/g, " "),
  );
  const b = forwardFillHeaderRow(bRaw);
  const len = Math.max(a.length, b.length);
  const out: string[] = [];
  for (let i = 0; i < len; i++) {
    const top = a[i] ?? "";
    const bot = b[i] ?? "";
    const merged =
      top && bot && subHeaderCellMergesWithTop(bot)
        ? `${top} ${bot}`.trim().replace(/\s+/g, " ")
        : top || bot || `__col_${i}`;
    out.push(merged);
  }
  return out;
}

function looksLikeTenderProcurementPrimaryHeader(row: unknown[]): boolean {
  const cells = row.map((c) => normalizeHeaderCell(String(c ?? "")));
  const c0 = cells[0] ?? "";
  const hasSerial = /п\/п|^№/.test(c0) || c0.includes("номер");
  const joined = cells.join(" ");
  const hasName = joined.includes("наименование");
  const hasTenderSheet =
    joined.includes("начало тендера") ||
    joined.includes("заключен") ||
    joined.includes("стоимость");
  return hasSerial && hasName && hasTenderSheet;
}

function looksLikeTenderProcurementSubHeader(sub: unknown[], primary: unknown[]): boolean {
  const subS = sub.map((c) => String(c ?? "").trim().toLowerCase());
  const primaryS = primary.map((c) => String(c ?? "").trim().toLowerCase()).join(" ");
  if (primaryS.includes("начало тендера") || primaryS.includes("заключен")) {
    let planFact = 0;
    let otkl = 0;
    for (const s of subS) {
      if (!s) continue;
      if (s === "план" || s === "факт" || s.startsWith("план") || s.startsWith("факт")) planFact += 1;
      if (s.includes("откл")) otkl += 1;
    }
    return planFact >= 2 || (planFact >= 1 && otkl >= 1);
  }
  return false;
}

function matrixToRowObjects(matrixRows: string[][], headerKeys: string[]): Record<string, string>[] {
  return matrixRows.map((cells) => {
    const obj: Record<string, string> = {};
    headerKeys.forEach((key, i) => {
      obj[key] = cells[i] == null ? "" : String(cells[i]).trim();
    });
    return obj;
  });
}

function cellByIndex(row: Record<string, unknown>, headers: string[], idx: number): string {
  if (idx < 0 || idx >= headers.length) return "";
  const key = headers[idx];
  if (!key || !(key in row)) return "";
  const v = row[key];
  if (v == null) return "";
  return String(v).trim();
}

/**
 * Карта закупочного CSV: позиции B,C,F–M фиксированы; хвост (контрагент, статус…) — по шапке.
 */
export function buildTenderProcurementColumnMap(mergedHeaders: string[]): TenderColumnMap {
  const map = EMPTY_COLUMN_MAP();
  const idx = TENDER_PROCUREMENT_COL_INDEX;
  map.id = idx.serial;
  map.code = idx.code;
  map.name = idx.name;
  map.planStart = idx.planStart;
  map.factStart = idx.factStart;
  map.planContractDate = idx.planContractDate;
  map.factContractDate = idx.factContractDate;
  map.cost = idx.costPlan;

  const norm = mergedHeaders.map((h) => normalizeHeaderCell(h));
  for (let i = idx.costFact + 1; i < norm.length; i++) {
    const h = norm[i]!;
    if (h.includes("контрагент") && map.contractor < 0) map.contractor = i;
    if (h.includes("статус") && map.status < 0) map.status = i;
    if (h.includes("комментар") && map.comment < 0) map.comment = i;
  }
  return map;
}

/** Плоский CSV (одна строка заголовков, «Шифр» / «Наименование»). */
const FLAT_COLUMN_DEFINITIONS: { key: TenderColumnMapKey; patterns: string[] }[] = [
  { key: "id", patterns: ["id", "№", "no", "номер строки", "п/п"] },
  { key: "code", patterns: ["шифр", "код гпр", "код работы", "код", "code"] },
  { key: "name", patterns: ["наименование работ", "наименование", "название", "name"] },
  { key: "stage", patterns: ["этап гпр", "этап", "stage"] },
  { key: "planStart", patterns: ["план начала", "план начала работ"] },
  { key: "factStart", patterns: ["факт начала"] },
  { key: "planContractDate", patterns: ["план даты договора", "план договора", "дата договора план"] },
  { key: "factContractDate", patterns: ["факт даты договора", "факт договора"] },
  { key: "cost", patterns: ["бюджет", "сумма", "стоимость", "cost"] },
  { key: "contractor", patterns: ["подрядчик", "контрагент", "исполнитель"] },
  { key: "status", patterns: ["статус"] },
  { key: "comment", patterns: ["комментарий", "примечание"] },
  { key: "partId", patterns: ["часть проекта", "объект"] },
];

export function buildTenderColumnMap(headers: string[]): TenderColumnMap {
  const norm = headers.map((h) => normalizeHeaderCell(String(h)));
  const used = new Set<number>();
  const map = EMPTY_COLUMN_MAP();

  for (const def of FLAT_COLUMN_DEFINITIONS) {
    const ordered = [...def.patterns].sort((a, b) => b.length - a.length);
    outer: for (const pattern of ordered) {
      for (let i = 0; i < norm.length; i++) {
        if (used.has(i)) continue;
        if (norm[i]!.includes(pattern)) {
          map[def.key] = i;
          used.add(i);
          break outer;
        }
      }
    }
  }
  return map;
}

export type TenderCsvParsed = {
  rows: Record<string, string>[];
  headers: string[];
  parseErrors: number;
  layout: TenderCsvLayout;
  /** Первая строка данных в файле (1-based), для отчёта об ошибках. */
  dataStartFileRow: number;
};

function parseTenderProcurementMatrix(
  matrix: string[][],
  parseErrors: number,
): TenderCsvParsed | null {
  if (matrix.length < 3) return null;
  const row0 = matrix[0]!;
  const row1 = matrix[1]!;
  if (!looksLikeTenderProcurementPrimaryHeader(row0)) return null;
  if (!looksLikeTenderProcurementSubHeader(row1, row0)) return null;

  const merged = mergeTwoHeaderRows(row0, row1);
  const headers = makeUniqueHeaderKeys(merged);
  const dataMatrix = matrix.slice(2);
  const rows = matrixToRowObjects(dataMatrix, headers);

  return {
    rows,
    headers,
    parseErrors,
    layout: "procurement",
    dataStartFileRow: 3,
  };
}

function parseTenderFlatMatrix(matrix: string[][], parseErrors: number): TenderCsvParsed | null {
  const headerIdx = matrix.findIndex((row) => {
    const joined = row.map((c) => normalizeHeaderCell(String(c ?? ""))).join(" ");
    return joined.includes("шифр") || joined.includes("наименование");
  });
  if (headerIdx < 0) return null;

  const headerRaw = matrix[headerIdx]!.map((c) =>
    String(c ?? "")
      .replace(/^\uFEFF/, "")
      .trim()
      .replace(/\s+/g, " "),
  );
  const headers = makeUniqueHeaderKeys(headerRaw);
  const dataMatrix = matrix.slice(headerIdx + 1);
  const rows = matrixToRowObjects(dataMatrix, headers);

  return {
    rows,
    headers,
    parseErrors,
    layout: "flat",
    dataStartFileRow: headerIdx + 2,
  };
}

/** CSV → строки; при двухуровневой шапке закупок данные с 3-й строки файла. */
export function parseTenderCsvText(csvText: string): TenderCsvParsed {
  const delimiter = sniffCsvDelimiter(csvText);
  const result = Papa.parse<string[]>(stripBom(csvText), {
    header: false,
    skipEmptyLines: true,
    delimiter,
  });
  const parseErrors = result.errors?.length ?? 0;
  if (parseErrors > 0) {
    console.warn("[tenders CSV]", result.errors?.slice(0, 5));
  }

  const matrix = (Array.isArray(result.data) ? result.data : []).filter(
    (row) => Array.isArray(row) && row.some((c) => String(c ?? "").trim() !== ""),
  ) as string[][];

  const procurement = parseTenderProcurementMatrix(matrix, parseErrors);
  if (procurement) return procurement;

  const flat = parseTenderFlatMatrix(matrix, parseErrors);
  if (flat) return flat;

  const legacy = Papa.parse<Record<string, string>>(stripBom(csvText), {
    header: true,
    skipEmptyLines: true,
    delimiter,
    transformHeader: (h: string) => h.replace(/^\uFEFF/, "").trim(),
  });
  const rows = (Array.isArray(legacy.data) ? legacy.data : []).filter(
    (row) => row && typeof row === "object" && Object.keys(row).length > 0,
  );
  const headers = legacy.meta.fields?.map((h) => h.replace(/^\uFEFF/, "").trim()) ?? [];

  return {
    rows,
    headers,
    parseErrors,
    layout: "flat",
    dataStartFileRow: 2,
  };
}

export async function parseTenderCsvFile(file: File): Promise<TenderCsvParsed> {
  const text = await readCsvFileTextSmart(file);
  return parseTenderCsvText(text);
}

function getMappedCell(
  row: Record<string, unknown>,
  headers: string[],
  colMap: TenderColumnMap,
  key: TenderColumnMapKey,
): string {
  const idx = colMap[key];
  if (idx === undefined || idx < 0) return "";
  return cellByIndex(row, headers, idx);
}

function parseBudget(raw: string): number | undefined {
  const s = raw.replace(/\s/g, "").replace(/\u00a0/g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

function parseDateToIso(raw: string): string | null {
  const t = raw.trim();
  if (!t || t === "—" || t === "-") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  return ruDateCellToIsoOrNull(t.replace(/\//g, "."));
}

function mapStatus(s: string): TenderProcurementStatus | undefined {
  const t = s.toLowerCase();
  if (!t) return undefined;
  if (/план|заплан|^planned$/i.test(t)) return "planned";
  if (/работ|прогресс|progress|в процес|^in_progress$/i.test(t)) return "in_progress";
  if (/заверш|^completed$/i.test(t)) return "completed";
  if (/задерж|^delayed$/i.test(t)) return "delayed";
  return undefined;
}

function parsePartIdFromCell(raw: string, stage: string): number {
  const t = raw.trim().toLowerCase();
  if (!t) return inferPartIdFromStage(stage);
  if (t === "2" || /стоянк|паркинг|parking/.test(t)) return 2;
  if (t === "1" || /жил|дом|residential/.test(t)) return 1;
  return inferPartIdFromStage(stage);
}

function newIdFallback(index: number): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tender-import-${Date.now()}-${index}`;
}

function resolveCode(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = normalizeGprWorkCodeFromCsvRaw(trimmed);
  if (normalized) return normalized;
  const digits = trimmed.replace(/[^\d.]/g, "").replace(/\.+$/, "");
  const parts = digits.split(".").filter(Boolean);
  if (parts.length >= 2) return parts.join(".");
  return null;
}

function rowLooksEmpty(row: Record<string, unknown>): boolean {
  return Object.values(row).every((v) => v == null || String(v).trim() === "");
}

function buildColumnUsage(headers: string[], colMap: TenderColumnMap): Record<string, "mapped" | "ignored"> {
  const usage: Record<string, "mapped" | "ignored"> = {};
  const mappedIndices = new Set(
    Object.values(colMap).filter((i): i is number => typeof i === "number" && i >= 0),
  );
  headers.forEach((h, i) => {
    usage[h] = mappedIndices.has(i) ? "mapped" : "ignored";
  });
  return usage;
}

function unmappedHeaders(headers: string[], colMap: TenderColumnMap): string[] {
  const mappedIndices = new Set(
    Object.values(colMap).filter((i): i is number => typeof i === "number" && i >= 0),
  );
  return headers.filter((_, i) => !mappedIndices.has(i));
}

type RowExtract = {
  idRaw: string;
  code: string;
  name: string;
  stage: string;
  planStart: string | null;
  factStart: string | undefined;
  planContractDate: string | null;
  factContractDate: string | undefined;
  cost: number | undefined;
  factCost: number | undefined;
  contractor: string | undefined;
  comment: string | undefined;
  statusRaw: string;
  partId: number;
};

function extractTenderRowProcurement(
  row: Record<string, unknown>,
  headers: string[],
  colMap: TenderColumnMap,
): RowExtract | null {
  const codeRaw = cellByIndex(row, headers, TENDER_PROCUREMENT_COL_INDEX.code);
  const code = resolveCode(codeRaw);
  if (!code) return null;

  const name = cellByIndex(row, headers, TENDER_PROCUREMENT_COL_INDEX.name);
  if (!name.trim()) return null;

  const stage = (getGprStageFromTenderCode(code) || "2.05").trim();
  const idRaw = cellByIndex(row, headers, TENDER_PROCUREMENT_COL_INDEX.serial);

  const idx = TENDER_PROCUREMENT_COL_INDEX;
  const planStart = parseDateToIso(cellByIndex(row, headers, idx.planStart));
  const factStart = parseDateToIso(cellByIndex(row, headers, idx.factStart)) ?? undefined;
  const planContractDate = parseDateToIso(cellByIndex(row, headers, idx.planContractDate));
  const factContractDate =
    parseDateToIso(cellByIndex(row, headers, idx.factContractDate)) ?? undefined;

  const costPlanRaw = cellByIndex(row, headers, idx.costPlan);
  const costFactRaw = cellByIndex(row, headers, idx.costFact);
  const cost = costPlanRaw ? parseBudget(costPlanRaw) : undefined;
  const factCost = costFactRaw ? parseBudget(costFactRaw) : undefined;
  const contractor = getMappedCell(row, headers, colMap, "contractor") || undefined;
  const comment = getMappedCell(row, headers, colMap, "comment") || undefined;
  const statusRaw = getMappedCell(row, headers, colMap, "status");
  const partRaw = getMappedCell(row, headers, colMap, "partId");

  return {
    idRaw,
    code,
    name: name.trim(),
    stage,
    planStart,
    factStart,
    planContractDate,
    factContractDate,
    cost,
    factCost,
    contractor,
    comment,
    statusRaw,
    partId: parsePartIdFromCell(partRaw, stage),
  };
}

function extractTenderRowFlat(
  row: Record<string, unknown>,
  headers: string[],
  colMap: TenderColumnMap,
): RowExtract | null {
  const codeRaw = getMappedCell(row, headers, colMap, "code");
  const code = resolveCode(codeRaw);
  if (!code) return null;

  const name = getMappedCell(row, headers, colMap, "name");
  if (!name.trim()) return null;

  const stageRaw = getMappedCell(row, headers, colMap, "stage");
  const stage = (stageRaw.trim() || getGprStageFromTenderCode(code) || "2.05").trim();
  const idRaw = getMappedCell(row, headers, colMap, "id");

  const planStart = parseDateToIso(getMappedCell(row, headers, colMap, "planStart"));
  const factStart = parseDateToIso(getMappedCell(row, headers, colMap, "factStart")) ?? undefined;
  const planContractDate = parseDateToIso(getMappedCell(row, headers, colMap, "planContractDate"));
  const factContractDate =
    parseDateToIso(getMappedCell(row, headers, colMap, "factContractDate")) ?? undefined;
  const costRaw = getMappedCell(row, headers, colMap, "cost");
  const cost = costRaw ? parseBudget(costRaw) : undefined;
  const contractor = getMappedCell(row, headers, colMap, "contractor") || undefined;
  const comment = getMappedCell(row, headers, colMap, "comment") || undefined;
  const statusRaw = getMappedCell(row, headers, colMap, "status");
  const partRaw = getMappedCell(row, headers, colMap, "partId");

  return {
    idRaw,
    code,
    name: name.trim(),
    stage,
    planStart,
    factStart,
    planContractDate,
    factContractDate,
    cost,
    factCost: undefined,
    contractor,
    comment,
    statusRaw,
    partId: parsePartIdFromCell(partRaw, stage),
  };
}

export function normalizeTenderCsvRowsWithAudit(
  rows: Record<string, unknown>[],
  headers: string[] = [],
  options?: { layout?: TenderCsvLayout; dataStartFileRow?: number },
): TenderCsvNormalizeResult {
  const layout = options?.layout ?? "flat";
  const dataStartFileRow = options?.dataStartFileRow ?? 2;
  const resolvedHeaders =
    headers.length > 0
      ? headers
      : rows.length > 0
        ? Object.keys(rows[0] as Record<string, unknown>)
        : [];

  const colMap =
    layout === "procurement"
      ? buildTenderProcurementColumnMap(resolvedHeaders)
      : buildTenderColumnMap(resolvedHeaders);
  const columnUsage = buildColumnUsage(resolvedHeaders, colMap);

  const out: Tender[] = [];
  const skippedRows: TenderCsvSkippedRow[] = [];
  let i = 0;

  const extract =
    layout === "procurement"
      ? extractTenderRowProcurement
      : extractTenderRowFlat;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const raw = rows[rowIndex] as Record<string, unknown>;
    const fileRow = dataStartFileRow + rowIndex;

    if (rowLooksEmpty(raw)) {
      skippedRows.push({
        rowIndex: fileRow,
        reason: "empty_row",
        codePreview: "",
        namePreview: "",
      });
      continue;
    }

    const codePreview =
      layout === "procurement"
        ? cellByIndex(raw, resolvedHeaders, TENDER_PROCUREMENT_COL_INDEX.code)
        : getMappedCell(raw, resolvedHeaders, colMap, "code");
    const namePreview =
      layout === "procurement"
        ? cellByIndex(raw, resolvedHeaders, TENDER_PROCUREMENT_COL_INDEX.name)
        : getMappedCell(raw, resolvedHeaders, colMap, "name");

    const extracted = extract(raw, resolvedHeaders, colMap);
    if (!extracted) {
      skippedRows.push({
        rowIndex: fileRow,
        reason: !codePreview.trim() ? "missing_code" : !namePreview.trim() ? "missing_name" : "invalid_code",
        codePreview: codePreview.slice(0, 40),
        namePreview: namePreview.slice(0, 60),
      });
      continue;
    }

    const id = extracted.idRaw || newIdFallback(i);
    i += 1;

    const plain: Record<string, unknown> = {
      id,
      code: extracted.code,
      name: extracted.name,
      stage: extracted.stage,
      partId: extracted.partId,
      planStart: extracted.planStart,
      factStart: extracted.factStart ?? null,
      planContractDate: extracted.planContractDate,
      factContractDate: extracted.factContractDate ?? null,
      cost: extracted.cost,
      factCost: extracted.factCost,
      contractor: extracted.contractor,
      comment: extracted.comment,
      status: mapStatus(extracted.statusRaw),
      statusLabel: extracted.statusRaw.trim() || undefined,
      cycleStatus: normalizeTenderCycleStatus(extracted.statusRaw),
    };

    const t = coerceTender(plain);
    if (!t) {
      skippedRows.push({
        rowIndex: fileRow,
        reason: "coerce_failed",
        codePreview: extracted.code,
        namePreview: extracted.name.slice(0, 60),
      });
      continue;
    }
    out.push(t);
  }

  return {
    tenders: out,
    audit: {
      parsedRows: rows.length,
      loaded: out.length,
      skipped: skippedRows.length,
      parseErrors: 0,
      skippedRows,
      headers: resolvedHeaders,
      unmappedHeaders: unmappedHeaders(resolvedHeaders, colMap),
      columnUsage,
      layout,
    },
  };
}

export function normalizeTenderCsvRows(rows: Record<string, unknown>[]): Tender[] {
  return normalizeTenderCsvRowsWithAudit(rows).tenders;
}

function excelColumnLetter(zeroBasedIndex: number): string {
  let n = zeroBasedIndex + 1;
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

function procurementRawCellsByColumn(
  row: Record<string, unknown>,
  headers: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  const keys: (keyof typeof TENDER_PROCUREMENT_COL_INDEX)[] = [
    "serial",
    "code",
    "name",
    "planStart",
    "factStart",
    "planContractDate",
    "factContractDate",
    "costPlan",
    "costFact",
  ];
  for (const key of keys) {
    const idx = TENDER_PROCUREMENT_COL_INDEX[key];
    const letter = excelColumnLetter(idx);
    out[`${letter} (${key})`] = cellByIndex(row, headers, idx);
  }
  return out;
}

/** Диагностика цепочки импорта для одной строки (консоль браузера / CLI). */
export function diagnoseTenderImportFirstRow(
  parsed: TenderCsvParsed,
  tender: Tender | null,
): {
  layout: TenderCsvLayout;
  rawRow: Record<string, string>;
  rawCellsByExcelColumn: Record<string, string>;
  mappedDto: Record<string, unknown> | null;
  savedEntity: Tender | null;
  apiNote: string;
  uiModel: {
    planStart: string | null;
    factStart: string | null;
    planContractDate: string | null;
    factContractDate: string | null;
    deviationDays: number | null;
    cost: number | undefined;
  } | null;
} {
  const rawRow = parsed.rows[0] ?? {};
  const colMap =
    parsed.layout === "procurement"
      ? buildTenderProcurementColumnMap(parsed.headers)
      : buildTenderColumnMap(parsed.headers);
  const extracted =
    parsed.layout === "procurement"
      ? extractTenderRowProcurement(rawRow, parsed.headers, colMap)
      : extractTenderRowFlat(rawRow, parsed.headers, colMap);

  const mappedDto = extracted
    ? {
        id: extracted.idRaw || "(auto)",
        code: extracted.code,
        name: extracted.name,
        stage: extracted.stage,
        partId: extracted.partId,
        planStart: extracted.planStart,
        factStart: extracted.factStart ?? null,
        planContractDate: extracted.planContractDate,
        factContractDate: extracted.factContractDate ?? null,
        cost: extracted.cost ?? null,
        contractor: extracted.contractor ?? null,
        status: mapStatus(extracted.statusRaw) ?? null,
        comment: extracted.comment ?? null,
      }
    : null;

  return {
    layout: parsed.layout,
    rawRow,
    rawCellsByExcelColumn:
      parsed.layout === "procurement"
        ? procurementRawCellsByColumn(rawRow, parsed.headers)
        : { ...rawRow },
    mappedDto,
    savedEntity: tender,
    apiNote:
      "Реестр тендеров в edit mode: localStorage (tenders_{projectId}), REST API списка нет.",
    uiModel: tender
      ? {
          planStart: tender.planStart,
          factStart: tender.factStart ?? null,
          planContractDate: tender.planContractDate,
          factContractDate: tender.factContractDate ?? null,
          deviationDays: contractDeviationDays(tender),
          cost: tender.cost,
        }
      : null,
  };
}

export async function importTenderCsvFile(
  file: File,
): Promise<TenderCsvNormalizeResult & { parseErrors: number }> {
  const parsed = await parseTenderCsvFile(file);
  const result = normalizeTenderCsvRowsWithAudit(parsed.rows, parsed.headers, {
    layout: parsed.layout,
    dataStartFileRow: parsed.dataStartFileRow,
  });
  result.audit.parseErrors = parsed.parseErrors;

  if (typeof console !== "undefined" && parsed.rows.length > 0) {
    const firstTender = result.tenders[0] ?? null;
    console.info(
      "[tender-import] диагностика первой строки данных",
      diagnoseTenderImportFirstRow(parsed, firstTender),
    );
  }

  return { ...result, parseErrors: parsed.parseErrors };
}
