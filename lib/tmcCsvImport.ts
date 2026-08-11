import Papa from "papaparse";

import { readCsvFileTextSmart } from "@/lib/csvTextEncoding";
import { ruDateCellToIsoOrNull } from "@/lib/gprReportCsv";
import type { ProjectPartKey } from "@/lib/gprUtils";
import {
  buildStableTmcId,
  categorizeTmcStatus,
  isTmcWbsCode,
  parseTmcSupplyStatus,
  syncTmcFinancials,
  type TMCItem,
  type TmcRowKind,
} from "@/lib/tmcData";

/** Число из ячейки Excel (пробелы, запятая как десятичный разделитель). Пустое → 0. */
export function cleanNumber(val: unknown): number {
  const n = parseImportNumber(val);
  return n ?? 0;
}

/** Число для импорта; пустая ячейка → null (не 0). Сохраняет 0 и отрицательные. */
export function parseImportNumber(val: unknown): number | null {
  if (val == null) return null;
  const s = String(val).trim();
  if (!s) return null;
  const normalized = s
    .replace(/\u00a0/g, "")
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/[^\d.eE+-]/g, "");
  if (!normalized || normalized === "-" || normalized === "+" || normalized === ".") return null;
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

export function normalizeHeaderCell(h: string): string {
  return String(h).replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function findColumnIndex(headers: string[], includesList: string[]): number {
  const normalized = headers.map((x) => normalizeHeaderCell(String(x)));
  return normalized.findIndex((h) =>
    includesList.every((part) => h.includes(String(part).toLowerCase())),
  );
}

export function findColumnByIncludes(headersNorm: string[], possibleNames: string[]): number {
  const sorted = [...possibleNames].sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    const idx = headersNorm.findIndex((h) => h.includes(name));
    if (idx >= 0) return idx;
  }
  return -1;
}

export function normalizeImportedDate(val: unknown): string | null {
  if (val == null || val === "") return null;
  const t = String(val).trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const dotted = t.replace(/\//g, ".");
  const fromRu = ruDateCellToIsoOrNull(dotted);
  if (fromRu) return fromRu;
  const m = dotted.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    const d = m[1]!.padStart(2, "0");
    const mo = m[2]!.padStart(2, "0");
    const y = m[3]!;
    return `${y}-${mo}-${d}`;
  }
  return null;
}

export const normalizeDate = normalizeImportedDate;

/** @deprecated старый triplet layout больше не используется. */
export const TMC_METRIC_TRIPLET_STEP = 3;
export const TMC_METRIC_TRIPLET_BLOCKS = 0;
export type TmcMetricLayout = "procurement_v2" | "legacy";

export type TmcCsvColumnKey =
  | "rowNo"
  | "itemCode"
  | "stage"
  | "name"
  | "gprStart"
  | "orderDeadlineDays"
  | "requestPlan"
  | "requestFact"
  | "requestDeviation"
  | "contractLeadTimeDays"
  | "contractPlan"
  | "contractFact"
  | "contractDeviation"
  | "deliveryPlan"
  | "deliveryFact"
  | "deliveryDeviation"
  | "contractDate2Plan"
  | "contractDate2Fact"
  | "contractDate2Deviation"
  | "unit"
  | "volumePlan"
  | "volumeFact"
  | "volumeDeviation"
  | "supplier"
  | "contract"
  | "status"
  | "comment";

export type TmcColumnMap = Record<TmcCsvColumnKey, number>;

/** Алиас для старых вызовов. */
export type TmcColumnMapKey = TmcCsvColumnKey;

export function describeTmcColumnMap(
  headers: string[],
  colMap: TmcColumnMap,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const key of Object.keys(colMap) as TmcCsvColumnKey[]) {
    const idx = colMap[key];
    out[key] = idx >= 0 && idx < headers.length ? `${idx}:${headers[idx]}` : -1;
  }
  return out;
}

function cell(row: unknown[], idx: number): string {
  if (idx < 0 || idx >= row.length) return "";
  return String(row[idx] ?? "").trim();
}

function detectDelimiter(sample: string): ";" | "," {
  const lines = sample.split(/\r?\n/).slice(0, 12);
  let semi = 0;
  let comma = 0;
  for (const line of lines) {
    semi += (line.match(/;/g) ?? []).length;
    comma += (line.match(/,/g) ?? []).length;
  }
  return semi >= comma ? ";" : ",";
}

function extractReportDate(matrix: string[][]): string | null {
  for (let r = 0; r < Math.min(12, matrix.length); r++) {
    const row = matrix[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const v = normalizeHeaderCell(row[c] ?? "");
      if (v.includes("отчетная дата") || v.includes("отчётная дата")) {
        for (let k = c + 1; k < Math.min(c + 4, row.length); k++) {
          const iso = normalizeImportedDate(row[k]);
          if (iso) return iso;
        }
      }
      const isoInline = normalizeImportedDate(row[c]);
      if (
        isoInline &&
        (v.includes("30.06") || normalizeHeaderCell(row[c - 1] ?? "").includes("отчетная"))
      ) {
        return isoInline;
      }
    }
  }
  // fallback: any cell near top looking like report date label neighbour
  for (let r = 0; r < Math.min(8, matrix.length); r++) {
    const row = matrix[r] ?? [];
    for (let c = 0; c < row.length - 1; c++) {
      if (normalizeHeaderCell(row[c] ?? "").includes("отчетн")) {
        const iso = normalizeImportedDate(row[c + 1]);
        if (iso) return iso;
      }
    }
  }
  return null;
}

function scoreHeaderRow(cols: string[]): number {
  const joined = cols.map(normalizeHeaderCell).join(" | ");
  let score = 0;
  const signatures = [
    "id код",
    "этап работ",
    "наименование тмц",
    "дата начала по гпр",
    "дата подачи заявки",
    "дата заключения договора",
    "дата поставки",
    "объем поставки",
    "объём поставки",
    "поставщик",
    "статус",
  ];
  for (const s of signatures) {
    if (joined.includes(s)) score += 1;
  }
  return score;
}

function findHeaderRowIndex(matrix: string[][]): number {
  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < Math.min(25, matrix.length); i++) {
    const score = scoreHeaderRow(matrix[i] ?? []);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  if (bestIdx < 0 || bestScore < 4) {
    throw new Error(
      "Не найден заголовок нового формата ТМЦ (ожидаются колонки «ID Код», «Наименование ТМЦ», даты заявки/договора/поставки).",
    );
  }
  return bestIdx;
}

function isSubHeaderRow(cols: string[]): boolean {
  const norms = cols.map(normalizeHeaderCell);
  const hits = norms.filter((h) =>
    h === "план" || h === "факт" || h.startsWith("откл") || h.includes("кол-во дней"),
  ).length;
  return hits >= 3;
}

function buildMergedHeaders(main: string[], sub: string[] | null): string[] {
  const len = Math.max(main.length, sub?.length ?? 0);
  const out: string[] = [];
  let lastGroup = "";
  for (let i = 0; i < len; i++) {
    const m = String(main[i] ?? "").trim();
    const s = String(sub?.[i] ?? "").trim();
    if (m) lastGroup = m;
    if (m && s) out.push(`${m} / ${s}`);
    else if (m) out.push(m);
    else if (s && lastGroup) out.push(`${lastGroup} / ${s}`);
    else if (s) out.push(s);
    else out.push("");
  }
  return out;
}

function findTripletStart(headersNorm: string[], groupIncludes: string[]): number {
  for (let i = 0; i < headersNorm.length; i++) {
    const h = headersNorm[i] ?? "";
    if (!groupIncludes.every((p) => h.includes(p))) continue;
    // Prefer the «План» column of the group
    if (h.includes("план") || i + 1 < headersNorm.length) return i;
  }
  return -1;
}

/**
 * Карта колонок нового CSV. Вторая группа «Дата заключения договора» (после поставки)
 * сохраняется отдельно как contractDate2*.
 */
export function buildTmcColumnMap(headers: string[]): TmcColumnMap {
  const n = headers.map((h) => normalizeHeaderCell(h));
  const idx = (...parts: string[]) => findColumnByIncludes(n, parts.map((p) => p.toLowerCase()));

  const empty = (): TmcColumnMap => ({
    rowNo: -1,
    itemCode: -1,
    stage: -1,
    name: -1,
    gprStart: -1,
    orderDeadlineDays: -1,
    requestPlan: -1,
    requestFact: -1,
    requestDeviation: -1,
    contractLeadTimeDays: -1,
    contractPlan: -1,
    contractFact: -1,
    contractDeviation: -1,
    deliveryPlan: -1,
    deliveryFact: -1,
    deliveryDeviation: -1,
    contractDate2Plan: -1,
    contractDate2Fact: -1,
    contractDate2Deviation: -1,
    unit: -1,
    volumePlan: -1,
    volumeFact: -1,
    volumeDeviation: -1,
    supplier: -1,
    contract: -1,
    status: -1,
    comment: -1,
  });

  const map = empty();
  map.rowNo = idx("№ п/п", "no п/п");
  map.itemCode = idx("id код");
  map.stage = idx("этап работ");
  map.name = idx("наименование тмц");
  map.gprStart = idx("дата начала по гпр");
  map.orderDeadlineDays = idx("срок подачи заказа");
  map.contractLeadTimeDays = idx("за сколько должен быть заключен договор");
  map.unit = idx("ед. изм", "ед изм");
  map.supplier = idx("поставщик");
  map.contract = n.findIndex((h) => h === "договор" || h.startsWith("договор "));
  map.status = idx("статус");
  map.comment = idx("комментарий");

  // Request triplet
  const req = findTripletStart(n, ["дата подачи заявки"]);
  if (req >= 0) {
    map.requestPlan = req;
    map.requestFact = req + 1;
    map.requestDeviation = req + 2;
  }

  // Contract triplets: first after request, second after delivery
  const contractHits: number[] = [];
  for (let i = 0; i < n.length; i++) {
    const h = n[i] ?? "";
    if (h.includes("дата заключения договора") && (h.includes("план") || !h.includes("факт"))) {
      // group start: header cell itself or «… / План»
      if (h.includes("план") || h === "дата заключения договора") {
        contractHits.push(i);
      }
    }
  }
  // Also detect by bare group title then plan in same/next cells
  if (contractHits.length === 0) {
    for (let i = 0; i < n.length; i++) {
      if ((n[i] ?? "").includes("дата заключения договора")) contractHits.push(i);
    }
  }
  if (contractHits[0] != null) {
    const c0 = contractHits[0];
    map.contractPlan = c0;
    map.contractFact = c0 + 1;
    map.contractDeviation = c0 + 2;
  }
  if (contractHits[1] != null) {
    const c1 = contractHits[1];
    map.contractDate2Plan = c1;
    map.contractDate2Fact = c1 + 1;
    map.contractDate2Deviation = c1 + 2;
  }

  const del = findTripletStart(n, ["дата поставки"]);
  if (del >= 0) {
    map.deliveryPlan = del;
    map.deliveryFact = del + 1;
    map.deliveryDeviation = del + 2;
  }

  const vol = findTripletStart(n, ["объем поставки"]);
  const vol2 = vol < 0 ? findTripletStart(n, ["объём поставки"]) : vol;
  if (vol2 >= 0) {
    map.volumePlan = vol2;
    map.volumeFact = vol2 + 1;
    map.volumeDeviation = vol2 + 2;
  }

  // Fallback positional map for known 28-col layout of ТМЦ_новое.csv
  if (map.itemCode < 0 && headers.length >= 26) {
    map.rowNo = 0;
    map.itemCode = 1;
    map.stage = 2;
    map.name = 3;
    map.gprStart = 4;
    map.orderDeadlineDays = 5;
    map.requestPlan = 6;
    map.requestFact = 7;
    map.requestDeviation = 8;
    map.contractLeadTimeDays = 9;
    map.contractPlan = 10;
    map.contractFact = 11;
    map.contractDeviation = 12;
    map.deliveryPlan = 13;
    map.deliveryFact = 14;
    map.deliveryDeviation = 15;
    map.contractDate2Plan = 16;
    map.contractDate2Fact = 17;
    map.contractDate2Deviation = 18;
    map.unit = 19;
    map.volumePlan = 20;
    map.volumeFact = 21;
    map.volumeDeviation = 22;
    map.supplier = 23;
    map.contract = 24;
    map.status = 25;
    map.comment = 26;
  }

  if (map.itemCode < 0 || map.stage < 0) {
    throw new Error("Новый формат ТМЦ: не удалось сопоставить колонки «ID Код» / «Этап работ».");
  }

  // Reject old financial CSV
  const joined = n.join(" | ");
  if (
    (joined.includes("цена закупки") || joined.includes("стоимость")) &&
    !joined.includes("дата подачи заявки") &&
    !joined.includes("срок подачи заказа")
  ) {
    throw new Error(
      "Обнаружен старый формат CSV ТМЦ (цена/стоимость). Импортируйте файл нового формата «ТМЦ_новое.csv».",
    );
  }

  return map;
}

/** @deprecated */
export function detectTripletMetricLayout(_headers: string[]): TmcMetricLayout {
  return "procurement_v2";
}

function detectSectionPart(stage: string): ProjectPartKey | null {
  const s = stage.trim().toLowerCase();
  if (!s) return null;
  if (s.includes("автостоян") || s.includes("паркинг") || s.includes("parking")) return "parking";
  if (s === "жилой дом" || s.includes("жилой дом")) return "residential";
  return null;
}

function classifyRowKind(sourceCode: string, stage: string, name: string): TmcRowKind {
  const section = detectSectionPart(stage);
  if (section && !name.trim() && !isTmcWbsCode(sourceCode)) return "section";
  if (name.trim()) return "position";
  if (isTmcWbsCode(sourceCode)) return "group";
  if (stage.trim() && !sourceCode.trim() && !name.trim()) {
    return section ? "section" : "other";
  }
  return "other";
}

function rowToRecord(headers: string[], cols: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < headers.length; i++) {
    const key = headers[i]?.trim() || `col_${i}`;
    out[key] = cols[i] ?? "";
  }
  return out;
}

export type TmcCsvParseMeta = {
  reportDate: string | null;
  delimiter: ";" | ",";
  headerRowIndex: number;
  subHeaderRowIndex: number | null;
  rawRowCount: number;
  dataRowCount: number;
  skippedEmptyRows: number;
  errorRows: number;
  positionCount: number;
  groupCount: number;
};

export type TmcCsvParsed = {
  rows: Record<string, unknown>[];
  headers: string[];
  matrix: string[][];
  meta: TmcCsvParseMeta;
};

export function parseTmcCsvText(text: string): TmcCsvParsed {
  const cleaned = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(cleaned);
  const parsed = Papa.parse<string[]>(cleaned, {
    delimiter,
    header: false,
    skipEmptyLines: false,
    quoteChar: '"',
    escapeChar: '"',
  });

  if (parsed.errors?.length) {
    const fatal = parsed.errors.filter((e) => e.type === "Quotes" || e.type === "FieldMismatch");
    if (fatal.length > 8) {
      console.warn("[tmc CSV] Papa parse warnings:", fatal.slice(0, 5));
    }
  }

  const matrix = (parsed.data ?? []).map((row) =>
    (Array.isArray(row) ? row : []).map((c) => String(c ?? "")),
  );

  const reportDate = extractReportDate(matrix);
  const headerRowIndex = findHeaderRowIndex(matrix);
  const maybeSub = matrix[headerRowIndex + 1] ?? null;
  const subHeaderRowIndex =
    maybeSub && isSubHeaderRow(maybeSub) ? headerRowIndex + 1 : null;
  const headers = buildMergedHeaders(
    matrix[headerRowIndex] ?? [],
    subHeaderRowIndex != null ? matrix[subHeaderRowIndex]! : null,
  );

  const dataStart = (subHeaderRowIndex ?? headerRowIndex) + 1;
  const rows: Record<string, unknown>[] = [];
  let skippedEmptyRows = 0;
  let errorRows = 0;

  for (let i = dataStart; i < matrix.length; i++) {
    const cols = matrix[i] ?? [];
    const nonempty = cols.some((c) => String(c ?? "").trim() !== "");
    if (!nonempty) {
      skippedEmptyRows += 1;
      continue;
    }
    try {
      const rec = rowToRecord(headers, cols);
      rec.__sourceRowNumber = i + 1; // 1-based file line (Papa logical row)
      rec.__sourceCols = cols;
      rows.push(rec);
    } catch {
      errorRows += 1;
    }
  }

  return {
    rows,
    headers,
    matrix,
    meta: {
      reportDate,
      delimiter,
      headerRowIndex,
      subHeaderRowIndex,
      rawRowCount: matrix.length,
      dataRowCount: rows.length,
      skippedEmptyRows,
      errorRows,
      positionCount: 0,
      groupCount: 0,
    },
  };
}

export async function parseTmcCsvFile(file: File): Promise<TmcCsvParsed> {
  const text = await readCsvFileTextSmart(file);
  return parseTmcCsvText(text);
}

function isRowEffectivelyEmpty(cols: string[], map: TmcColumnMap): boolean {
  const code = cell(cols, map.itemCode);
  const stage = cell(cols, map.stage);
  const name = cell(cols, map.name);
  return !code && !stage && !name;
}

export type TmcNormalizeResult = {
  items: TMCItem[];
  reportDate: string | null;
  importedRows: number;
  positionCount: number;
  groupCount: number;
  errorRows: number;
  skippedEmptyRows: number;
};

/**
 * Нормализация строк нового CSV → TMCItem[].
 * Сохраняет группы, позиции с ID "-" / "?", секционные маркеры частей проекта.
 */
export function normalizeTmcCsvRows(
  rows: Record<string, unknown>[],
  headers?: string[],
  options?: { reportDate?: string | null; defaultProjectPart?: ProjectPartKey },
): TMCItem[] {
  return normalizeTmcCsvRowsWithMeta(rows, headers, options).items;
}

export function normalizeTmcCsvRowsWithMeta(
  rows: Record<string, unknown>[],
  headers?: string[],
  options?: { reportDate?: string | null; defaultProjectPart?: ProjectPartKey },
): TmcNormalizeResult {
  if (!headers?.length) {
    console.warn("[tmc CSV] normalizeTmcCsvRows: не переданы заголовки столбцов");
  }
  const hdrs = headers ?? [];
  const map = buildTmcColumnMap(hdrs);

  let projectPart: ProjectPartKey = options?.defaultProjectPart ?? "residential";
  let parentWbsCode: string | null = null;
  const items: TMCItem[] = [];
  let errorRows = 0;
  let skippedEmptyRows = 0;
  let positionCount = 0;
  let groupCount = 0;

  for (const row of rows) {
    try {
      const cols = Array.isArray(row.__sourceCols)
        ? (row.__sourceCols as string[])
        : hdrs.map((h) => String(row[h] ?? ""));

      if (isRowEffectivelyEmpty(cols, map)) {
        skippedEmptyRows += 1;
        continue;
      }

      const sourceRowNumber =
        typeof row.__sourceRowNumber === "number"
          ? row.__sourceRowNumber
          : items.length + 1;

      const sourceCode = cell(cols, map.itemCode);
      const stage = cell(cols, map.stage);
      const name = cell(cols, map.name);
      const rowNoParsed = parseImportNumber(cell(cols, map.rowNo));
      const rowNo =
        rowNoParsed != null && rowNoParsed > 0 ? Math.trunc(rowNoParsed) : null;

      const sectionPart = detectSectionPart(stage);
      const rowKind = classifyRowKind(sourceCode, stage, name);

      if (rowKind === "section" && sectionPart) {
        projectPart = sectionPart;
        parentWbsCode = null;
      }

      if (rowKind === "group" && isTmcWbsCode(sourceCode)) {
        parentWbsCode = sourceCode.trim();
        groupCount += 1;
      }

      if (rowKind === "position") positionCount += 1;

      // Явная иерархия для позиции с WBS-кодом: родитель = код без последнего сегмента.
      // Для "-" / "?" — ближайшая предшествующая группа по порядку CSV (не startsWith по имени).
      let rowParent: string | null = rowKind === "group" ? null : parentWbsCode;
      if (rowKind === "position" && isTmcWbsCode(sourceCode)) {
        const segs = sourceCode.trim().replace(/\.$/, "").split(".").filter(Boolean);
        if (segs.length > 1) {
          rowParent = `${segs.slice(0, -1).join(".")}.`;
        }
      }

      const statusRaw = cell(cols, map.status);
      const statusCategory = categorizeTmcStatus(statusRaw);
      const plannedQuantity = parseImportNumber(cell(cols, map.volumePlan));
      const actualQuantity = parseImportNumber(cell(cols, map.volumeFact));

      const deliveryPlanDate = normalizeImportedDate(cell(cols, map.deliveryPlan));
      const deliveryFactDate = normalizeImportedDate(cell(cols, map.deliveryFact));
      const contractPlanDate = normalizeImportedDate(cell(cols, map.contractPlan));
      const contractFactDate = normalizeImportedDate(cell(cols, map.contractFact));

      const id = buildStableTmcId({
        projectPart,
        sourceRowNumber,
        sourceCode,
        stage,
        name,
      });

      const item = syncTmcFinancials({
        id,
        sourceRowNumber,
        rowNo,
        sourceCode,
        itemCode: sourceCode,
        rowKind,
        parentWbsCode: rowParent,
        stage,
        gprStage: stage,
        name,
        gprStartDate: normalizeImportedDate(cell(cols, map.gprStart)),
        orderDeadlineDays: parseImportNumber(cell(cols, map.orderDeadlineDays)),
        requestPlanDate: normalizeImportedDate(cell(cols, map.requestPlan)),
        requestFactDate: normalizeImportedDate(cell(cols, map.requestFact)),
        requestDeviationDays: parseImportNumber(cell(cols, map.requestDeviation)),
        contractLeadTimeDays: parseImportNumber(cell(cols, map.contractLeadTimeDays)),
        contractPlanDate,
        contractFactDate,
        contractDeviationDays: parseImportNumber(cell(cols, map.contractDeviation)),
        deliveryPlanDate,
        deliveryFactDate,
        deliveryDeviationDays: parseImportNumber(cell(cols, map.deliveryDeviation)),
        contractDate2PlanDate: normalizeImportedDate(cell(cols, map.contractDate2Plan)),
        contractDate2FactDate: normalizeImportedDate(cell(cols, map.contractDate2Fact)),
        contractDate2DeviationDays: parseImportNumber(cell(cols, map.contractDate2Deviation)),
        unit: cell(cols, map.unit),
        plannedQuantity,
        actualQuantity,
        quantityDeviation: parseImportNumber(cell(cols, map.volumeDeviation)),
        supplier: cell(cols, map.supplier),
        contract: cell(cols, map.contract),
        statusRaw,
        statusCategory,
        status: parseTmcSupplyStatus(statusRaw),
        comment: cell(cols, map.comment),
        projectPart,
        volumePlan: plannedQuantity ?? 0,
        volumeFact: actualQuantity ?? 0,
        supplyPlanDate: deliveryPlanDate,
        supplyFactDate: deliveryFactDate,
        pricePlan: 0,
        priceFact: 0,
        totalPlan: 0,
        totalFact: 0,
        planCost: 0,
        factCost: null,
      });

      items.push(item);
    } catch (e) {
      errorRows += 1;
      console.warn("[tmc CSV] row normalize error", e);
    }
  }

  return {
    items,
    reportDate: options?.reportDate ?? null,
    importedRows: items.length,
    positionCount,
    groupCount,
    errorRows,
    skippedEmptyRows,
  };
}

/** Полный пайплайн: text → items + meta. */
export function importTmcProcurementCsvText(text: string): TmcNormalizeResult & {
  headers: string[];
  meta: TmcCsvParseMeta;
} {
  const parsed = parseTmcCsvText(text);
  const normalized = normalizeTmcCsvRowsWithMeta(parsed.rows, parsed.headers, {
    reportDate: parsed.meta.reportDate,
  });
  return {
    ...normalized,
    reportDate: parsed.meta.reportDate,
    headers: parsed.headers,
    meta: {
      ...parsed.meta,
      positionCount: normalized.positionCount,
      groupCount: normalized.groupCount,
      errorRows: parsed.meta.errorRows + normalized.errorRows,
      skippedEmptyRows: parsed.meta.skippedEmptyRows + normalized.skippedEmptyRows,
    },
  };
}

export async function importTmcProcurementCsvFile(file: File) {
  const text = await readCsvFileTextSmart(file);
  return importTmcProcurementCsvText(text);
}

/** Проверка «валидности» для diff: группы и позиции сохраняются. */
export function isValidTmcRow(item: TMCItem): boolean {
  if (item.rowKind === "section") return true;
  if (item.rowKind === "group") return Boolean(item.itemCode || item.stage);
  if (item.rowKind === "position") return Boolean(item.name.trim());
  return Boolean(item.stage || item.name || item.itemCode);
}
