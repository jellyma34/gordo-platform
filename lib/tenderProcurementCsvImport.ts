import Papa from "papaparse";

import { readCsvFileTextSmart } from "@/lib/csvTextEncoding";
import { normalizeGprWorkCodeFromCsvRaw, ruDateCellToIsoOrNull } from "@/lib/gprReportCsv";
import {
  getGprStageFromTenderCode,
  inferPartIdFromStage,
  normalizeTenderCycleStatus,
  type Tender,
  type TenderProcurementStatus,
} from "@/lib/tenderData";

export const TENDER_PROCUREMENT_CSV_DELIMITER = ";";
export const TENDER_PROCUREMENT_HEADER_SCAN_LIMIT = 30;
export const TENDER_PROCUREMENT_HEADER_MIN_SCORE = 4;

export type TenderProcurementColumnKey =
  | "code"
  | "name"
  | "stage"
  | "planStart"
  | "factStart"
  | "planContractDate"
  | "factContractDate"
  | "costPlan"
  | "costFact"
  | "contractor"
  | "contract"
  | "status"
  | "comment";

export type TenderProcurementColumnMap = Record<TenderProcurementColumnKey, number>;

export type TenderProcurementRowSkip = {
  fileRow: number;
  reason: string;
};

export type TenderProcurementCsvImportAudit = {
  parsedRows: number;
  loaded: number;
  skipped: number;
  headerRowIndex: number;
  dataStartFileRow: number;
  headers: string[];
  columnMap: TenderProcurementColumnMap;
  resolvedColumns: Record<string, string>;
  skippedRows: TenderProcurementRowSkip[];
};

export type TenderProcurementCsvImportResult = {
  tenders: Tender[];
  audit: TenderProcurementCsvImportAudit;
};

const RESOLVED_COLUMN_LABELS: Record<TenderProcurementColumnKey, string> = {
  code: "Код работы",
  name: "Наименование",
  stage: "Этап ГПР",
  planStart: "Начало тендера (план)",
  factStart: "Начало тендера (факт)",
  planContractDate: "Дата договора (план)",
  factContractDate: "Дата договора (факт)",
  costPlan: "Стоимость план",
  costFact: "Стоимость факт",
  contractor: "Подрядчик",
  contract: "Договор",
  status: "Статус",
  comment: "Комментарий",
};

type ColumnRule = {
  key: TenderProcurementColumnKey;
  score: (header: string) => number;
};

function normalizeProcurementHeader(raw: string): string {
  return String(raw)
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function makeUniqueHeaderKeys(headerRaw: string[]): string[] {
  const seen = new Map<string, number>();
  return headerRaw.map((raw, index) => {
    const base =
      String(raw ?? "")
        .replace(/^\uFEFF/, "")
        .trim()
        .replace(/\s+/g, " ") || `column_${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}__${count + 1}`;
  });
}

function forwardFillHeaderRow(cells: string[]): string[] {
  let last = "";
  return cells.map((cell) => {
    const trimmed = cell.trim();
    if (trimmed) last = trimmed;
    return last;
  });
}

function subHeaderCellMergesWithTop(bottom: string): boolean {
  const value = bottom.trim().toLowerCase();
  if (!value) return false;
  if (value === "план" || value === "факт" || value.includes("откл")) return true;
  if (value === "гпр" || value.includes("отставан")) return true;
  return false;
}

/** Вторая строка шапки без ячейки под «№ тендера» / «№ статей» сдвигает подзаголовки. */
function alignProcurementSubHeaderRow(primary: unknown[], secondary: unknown[]): string[] {
  const primaryCells = primary.map((cell) => String(cell ?? "").trim());
  const aligned = secondary.map((cell) => String(cell ?? ""));
  while (aligned.length < primaryCells.length) {
    aligned.push("");
  }

  const normalizedPrimary = primaryCells.map((cell) => normalizeProcurementHeader(cell));
  const normalizedSub = aligned.map((cell) => normalizeProcurementHeader(cell));

  const markerCol = normalizedPrimary.findIndex(
    (cell) =>
      cell === "№ тендера" ||
      cell.startsWith("№ тендера") ||
      cell === "номер тендера" ||
      cell.startsWith("номер тендера"),
  );

  if (markerCol >= 0) {
    if (aligned[markerCol]?.trim() !== "") {
      aligned.splice(markerCol, 0, "");
      return aligned;
    }
    const firstSubIdx = aligned.findIndex((cell) => cell.trim() !== "");
    if (firstSubIdx === markerCol + 2) {
      aligned.splice(markerCol + 1, 0, "");
    }
    return aligned;
  }

  const subArticleCol = normalizedSub.findIndex(
    (cell) => cell.includes("статей") || /^№/.test(cell) || cell.includes("п/п"),
  );
  const primaryCodeCol = normalizedPrimary.findIndex((cell) => cell.includes("id код"));

  if (
    subArticleCol === 0 &&
    !primaryCells[0]?.trim() &&
    primaryCodeCol === 1 &&
    aligned[0]?.trim() !== ""
  ) {
    return aligned;
  }

  return aligned;
}

function mergeProcurementHeaderRows(primary: unknown[], secondary: unknown[]): string[] {
  const top = primary.map((cell) =>
    String(cell ?? "")
      .replace(/^\uFEFF/, "")
      .trim()
      .replace(/\s+/g, " "),
  );
  const bottomRaw = secondary.map((cell) =>
    String(cell ?? "")
      .replace(/^\uFEFF/, "")
      .trim()
      .replace(/\s+/g, " "),
  );
  const bottom = forwardFillHeaderRow(bottomRaw);
  const width = Math.max(top.length, bottom.length);
  const merged: string[] = [];

  for (let i = 0; i < width; i += 1) {
    const primaryCell = top[i] ?? "";
    const subCell = bottom[i] ?? "";
    const value =
      primaryCell && subCell && subHeaderCellMergesWithTop(subCell)
        ? `${primaryCell} ${subCell}`.trim().replace(/\s+/g, " ")
        : primaryCell || subCell || `column_${i + 1}`;
    merged.push(value);
  }

  return makeUniqueHeaderKeys(merged);
}

function emptyColumnMap(): TenderProcurementColumnMap {
  return {
    code: -1,
    name: -1,
    stage: -1,
    planStart: -1,
    factStart: -1,
    planContractDate: -1,
    factContractDate: -1,
    costPlan: -1,
    costFact: -1,
    contractor: -1,
    contract: -1,
    status: -1,
    comment: -1,
  };
}

function buildColumnRules(): ColumnRule[] {
  const includes = (h: string, ...parts: string[]) => parts.every((p) => h.includes(p));
  const excludes = (h: string, ...parts: string[]) => !parts.some((p) => h.includes(p));

  return [
    {
      key: "code",
      score: (h) => {
        if (includes(h, "id", "код")) return 100;
        if (h.includes("idкод")) return 100;
        if (h.startsWith("шифр") || h === "шифр") return 95;
        if (includes(h, "наименован", "работ") && excludes(h, "гпр", "этап")) return 72;
        if (h.includes("код") && !h.includes("п/п") && !h.includes("статей")) return 60;
        return 0;
      },
    },
    {
      key: "name",
      score: (h) => {
        if (includes(h, "этап", "работ") && excludes(h, "план", "факт", "откл")) return 92;
        if (h.includes("наименован") && excludes(h, "п/п")) return 80;
        if (h.includes("работ") && excludes(h, "план", "факт", "откл", "группа")) return 55;
        return 0;
      },
    },
    {
      key: "stage",
      score: (h) => {
        if (h === "гпр" || h.endsWith(" гпр")) return 70;
        if (includes(h, "этап", "гпр") && excludes(h, "работ")) return 65;
        if (h.includes("этап") && excludes(h, "работ", "план", "факт")) return 50;
        return 0;
      },
    },
    {
      key: "planStart",
      score: (h) => {
        if (includes(h, "начало", "план") || includes(h, "тендер", "план")) return 90;
        if (includes(h, "старт", "план")) return 75;
        return 0;
      },
    },
    {
      key: "factStart",
      score: (h) => {
        if (includes(h, "начало", "факт") || includes(h, "тендер", "факт")) return 90;
        if (includes(h, "старт", "факт")) return 75;
        if (h === "факт" || h.startsWith("факт__")) return 40;
        return 0;
      },
    },
    {
      key: "planContractDate",
      score: (h) => {
        if (includes(h, "договор", "план") && (h.includes("дата") || h.includes("заключ"))) return 95;
        if (includes(h, "заключ", "план")) return 85;
        if (includes(h, "договор", "план")) return 80;
        return 0;
      },
    },
    {
      key: "factContractDate",
      score: (h) => {
        if (includes(h, "договор", "факт") && (h.includes("дата") || h.includes("заключ"))) return 95;
        if (includes(h, "заключ", "факт")) return 85;
        if (includes(h, "договор", "факт")) return 80;
        if ((h === "факт__2" || h === "факт") && excludes(h, "тендер", "начало", "стоимость")) return 35;
        return 0;
      },
    },
    {
      key: "costPlan",
      score: (h) => {
        if (includes(h, "стоимость", "план") && excludes(h, "откл")) return 95;
        if (includes(h, "бюджет", "план")) return 85;
        if (h.includes("план") && (h.includes("руб") || h.includes("смет"))) return 70;
        return 0;
      },
    },
    {
      key: "costFact",
      score: (h) => {
        if (includes(h, "стоимость", "факт") && excludes(h, "откл")) return 95;
        if (includes(h, "бюджет", "факт")) return 85;
        if (h === "факт__3" || (h === "факт" && excludes(h, "тендер", "начало", "договор"))) return 35;
        return 0;
      },
    },
    {
      key: "contractor",
      score: (h) => {
        if (h.includes("контрагент") && !h.includes("откл")) return 95;
        if (h.includes("подряд") && !h.includes("откл")) return 90;
        return 0;
      },
    },
    {
      key: "contract",
      score: (h) => {
        if (h === "договор") return 90;
        if (h.includes("договор") && excludes(h, "дата", "заключ", "план", "факт", "откл")) return 75;
        return 0;
      },
    },
    {
      key: "status",
      score: (h) => {
        if (includes(h, "статус", "тендер")) return 96;
        if (includes(h, "статус", "закуп")) return 94;
        if (h === "статус" || h.startsWith("статус__")) return 93;
        if (includes(h, "стадия", "тендер")) return 90;
        if ((includes(h, "этап", "тендер") || includes(h, "этап", "закуп")) && excludes(h, "гпр", "работ")) {
          return 88;
        }
        if (h.includes("статус") && !h.includes("откл") && !h.includes("статей")) return 90;
        return 0;
      },
    },
    {
      key: "comment",
      score: (h) => (h.includes("коммент") ? 90 : 0),
    },
  ];
}

const COLUMN_RULES = buildColumnRules();

export function buildTenderProcurementColumnMap(headers: string[]): TenderProcurementColumnMap {
  const normalized = headers.map((h) => normalizeProcurementHeader(h));
  const map = emptyColumnMap();
  const used = new Set<number>();

  const rulesByKey = [...COLUMN_RULES].sort((a, b) => {
    const maxA = Math.max(...normalized.map((h) => a.score(h)), 0);
    const maxB = Math.max(...normalized.map((h) => b.score(h)), 0);
    return maxB - maxA;
  });

  for (const rule of rulesByKey) {
    let bestIndex = -1;
    let bestScore = 0;
    for (let i = 0; i < normalized.length; i += 1) {
      if (used.has(i)) continue;
      const score = rule.score(normalized[i]!);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    if (bestIndex >= 0 && bestScore > 0) {
      map[rule.key] = bestIndex;
      used.add(bestIndex);
    }
  }

  return refineTenderProcurementColumnMap(headers, map);
}

function refineTenderProcurementColumnMap(
  headers: string[],
  map: TenderProcurementColumnMap,
): TenderProcurementColumnMap {
  const normalized = headers.map((header) => normalizeProcurementHeader(header));
  const refined = { ...map };
  const used = new Set(Object.values(map).filter((index) => index >= 0));

  const findNextFact = (afterIndex: number, exclude: Set<number>): number => {
    for (let i = afterIndex + 1; i < normalized.length; i += 1) {
      if (exclude.has(i)) continue;
      const header = normalized[i]!;
      if (header === "факт" || header.startsWith("факт__")) return i;
    }
    return -1;
  };

  if (refined.planStart >= 0 && refined.factStart < 0) {
    const idx = findNextFact(refined.planStart, used);
    if (idx >= 0) {
      refined.factStart = idx;
      used.add(idx);
    }
  }

  if (refined.planContractDate >= 0 && refined.factContractDate < 0) {
    const idx = findNextFact(refined.planContractDate, used);
    if (idx >= 0) {
      refined.factContractDate = idx;
      used.add(idx);
    }
  }

  if (refined.costPlan >= 0 && refined.costFact < 0) {
    const idx = findNextFact(refined.costPlan, used);
    if (idx >= 0) {
      refined.costFact = idx;
      used.add(idx);
    }
  }

  if (refined.contractor < 0 || normalized[refined.contractor]?.includes("откл")) {
    const idx = normalized.findIndex(
      (header) => header.includes("контрагент") && !header.includes("откл"),
    );
    if (idx >= 0) refined.contractor = idx;
  }

  if (refined.contract < 0 || normalized[refined.contract]?.includes("откл")) {
    const idx = normalized.findIndex(
      (header) =>
        header === "договор" ||
        (header.includes("договор") &&
          !header.includes("откл") &&
          !header.includes("дата") &&
          !header.includes("заключ") &&
          !header.includes("план") &&
          !header.includes("факт")),
    );
    if (idx >= 0) refined.contract = idx;
  }

  if (refined.comment < 0 || normalized[refined.comment]?.includes("откл")) {
    const idx = normalized.findIndex(
      (header) => header.includes("коммент") && !header.includes("откл"),
    );
    if (idx >= 0) refined.comment = idx;
  }

  if (refined.status < 0 || normalized[refined.status]?.includes("откл")) {
    const idx = normalized.findIndex(
      (header) => header.includes("статус") && !header.includes("откл"),
    );
    if (idx >= 0) refined.status = idx;
  }

  return refined;
}

function scoreProcurementHeaders(headers: string[]): number {
  const map = buildTenderProcurementColumnMap(headers);
  let score = 0;
  if (map.code >= 0) score += 3;
  if (map.name >= 0) score += 3;
  if (map.costPlan >= 0) score += 2;
  if (map.costFact >= 0) score += 2;
  if (map.planStart >= 0) score += 1;
  if (map.planContractDate >= 0) score += 1;
  if (map.contractor >= 0) score += 1;
  if (map.status >= 0) score += 1;
  return score;
}

function rowLooksLikeSubHeader(row: unknown[]): boolean {
  const cells = row.map((c) => normalizeProcurementHeader(String(c ?? "")));
  let planFactCount = 0;
  for (const cell of cells) {
    if (cell === "план" || cell === "факт" || cell === "откл" || cell === "откл.") {
      planFactCount += 1;
    }
  }
  const hasArticleHeader = cells.some(
    (c) => (c.includes("№") && c.includes("статей")) || c === "№ статей" || c === "№ п/п",
  );
  return planFactCount >= 2 || hasArticleHeader;
}

function rowLooksLikePrimaryHeader(row: unknown[]): boolean {
  const cells = row.map((c) => normalizeProcurementHeader(String(c ?? "")));
  const joined = cells.join(" ");
  if (!joined.trim()) return false;

  const hasIdCode = joined.includes("id код") || joined.includes("idкод");
  const hasWorkName = joined.includes("этап") && joined.includes("работ");
  const hasCost = joined.includes("стоимость");
  const hasTenderDates =
    joined.includes("начало тендера") ||
    joined.includes("заключен") ||
    joined.includes("договор");
  const hasGprArticles =
    joined.includes("статей") && hasIdCode && (joined.includes("гпр") || hasWorkName);

  return hasIdCode || hasWorkName || hasCost || hasGprArticles || (hasTenderDates && hasWorkName);
}

type HeaderCandidate = {
  headerRowIndex: number;
  dataStartIndex: number;
  headers: string[];
  score: number;
};

function findFirstProcurementDataRowIndex(
  rawRows: unknown[][],
  startIndex: number,
  columnMap: TenderProcurementColumnMap,
): number {
  for (let i = startIndex; i < rawRows.length; i += 1) {
    const rawRow = rawRows[i];
    if (!Array.isArray(rawRow)) continue;
    const row = rawRow.map((cell) => String(cell ?? ""));
    if (isRowEmpty(row)) continue;
    if (rowLooksLikeRepeatedHeader(row, columnMap)) continue;

    const code = resolveProcurementCode(getCell(row, columnMap.code));
    const name = getCell(row, columnMap.name);
    if (code || name.trim()) return i;
  }
  return startIndex;
}

export function detectTenderProcurementHeader(rawRows: unknown[][]): HeaderCandidate | null {
  const limit = Math.min(TENDER_PROCUREMENT_HEADER_SCAN_LIMIT, rawRows.length - 1);
  let best: HeaderCandidate | null = null;

  for (let i = 0; i < limit; i += 1) {
    const primary = rawRows[i];
    if (!Array.isArray(primary) || !rowLooksLikePrimaryHeader(primary)) continue;

    const candidates: HeaderCandidate[] = [];
    const sub = rawRows[i + 1];

    if (Array.isArray(sub) && rowLooksLikeSubHeader(sub)) {
      const alignedSub = alignProcurementSubHeaderRow(primary, sub);
      const merged = mergeProcurementHeaderRows(primary, alignedSub);
      const score = scoreProcurementHeaders(merged);
      candidates.push({
        headerRowIndex: i,
        dataStartIndex: i + 2,
        headers: merged,
        score,
      });
    }

    const single = makeUniqueHeaderKeys(
      primary.map((cell) =>
        String(cell ?? "")
          .replace(/^\uFEFF/, "")
          .trim(),
      ),
    );
    candidates.push({
      headerRowIndex: i,
      dataStartIndex: i + 1,
      headers: single,
      score: scoreProcurementHeaders(single),
    });

    for (const candidate of candidates) {
      if (candidate.score < TENDER_PROCUREMENT_HEADER_MIN_SCORE) continue;
      if (!best || candidate.score > best.score) {
        best = candidate;
      }
    }
  }

  if (!best) return null;

  const columnMap = buildTenderProcurementColumnMap(best.headers);
  const dataStartIndex = findFirstProcurementDataRowIndex(
    rawRows,
    best.dataStartIndex,
    columnMap,
  );

  return { ...best, dataStartIndex };
}

function parseProcurementNumber(val: unknown): number | undefined {
  if (val == null) return undefined;
  const s = String(val).trim();
  if (!s || s === "—" || s === "-") return undefined;
  const normalized = s.replace(/\s/g, "").replace(/\u00a0/g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : undefined;
}

function parseProcurementDate(val: unknown): string | null {
  if (val == null) return null;
  const t = String(val).trim();
  if (!t || t === "—" || t === "-") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  return ruDateCellToIsoOrNull(t.replace(/\//g, "."));
}

function mapProcurementStatus(raw: string): TenderProcurementStatus | undefined {
  const t = raw.toLowerCase().replace(/\s+/g, " ");
  if (!t) return undefined;
  if (
    /в\s*процессе\s*подпис|на\s*согласован|на\s*рассмотрен|объявлен|ожида.*публика|сбор.*коммерческ|подготовк.*документ/i.test(
      t,
    )
  ) {
    return undefined;
  }
  if (/план|заплан|^planned$/i.test(t)) return "planned";
  if (/^в\s*работе$/i.test(t) || /^in_progress$/i.test(t) || /прогресс|progress/i.test(t)) {
    return "in_progress";
  }
  if (/заверш|^completed$/i.test(t)) return "completed";
  if (/задерж|^delayed$/i.test(t)) return "delayed";
  return undefined;
}

function resolveProcurementCode(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = normalizeGprWorkCodeFromCsvRaw(trimmed);
  if (normalized) return normalized;
  const digits = trimmed.replace(/[^\d.]/g, "").replace(/\.+$/, "");
  const parts = digits.split(".").filter(Boolean);
  if (parts.length >= 2) return parts.join(".");
  return null;
}

function getCell(row: string[], index: number): string {
  if (index < 0) return "";
  return String(row[index] ?? "").trim();
}

function rowToObject(headers: string[], row: unknown[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (let i = 0; i < headers.length; i += 1) {
    obj[headers[i]!] = String(row[i] ?? "").trim();
  }
  return obj;
}

function rowLooksLikeRepeatedHeader(row: string[], map: TenderProcurementColumnMap): boolean {
  const codeCell = getCell(row, map.code);
  const nameCell = getCell(row, map.name);
  const joined = row.join(" ").toLowerCase();
  if (/^№\s*(статей|п\/п)/i.test(codeCell) || /^№\s*(статей|п\/п)/i.test(nameCell)) {
    return true;
  }
  if (joined.includes("план") && joined.includes("факт") && joined.includes("откл")) {
    return true;
  }
  return false;
}

function isRowEmpty(row: string[]): boolean {
  return row.every((c) => !String(c ?? "").trim());
}

function buildResolvedColumns(
  headers: string[],
  map: TenderProcurementColumnMap,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const key of Object.keys(RESOLVED_COLUMN_LABELS) as TenderProcurementColumnKey[]) {
    const idx = map[key];
    resolved[RESOLVED_COLUMN_LABELS[key]] = idx >= 0 ? headers[idx]! : "(не найдено)";
  }
  return resolved;
}

export function logTenderProcurementParseDiagnostic(args: {
  headerRowIndex: number;
  headers: string[];
  previewRows: Record<string, string>[];
  resolvedColumns: Record<string, string>;
}): void {
  if (typeof console === "undefined") return;

  console.group("[Tenders] Импорт данных закупки — разбор CSV");
  console.log("Номер строки заголовков (1-based):", args.headerRowIndex + 1);
  console.log("Headers:");
  console.log(JSON.stringify(args.headers, null, 2));
  for (let i = 0; i < args.previewRows.length; i += 1) {
    console.log(`Row ${i + 1}:`);
    console.log(JSON.stringify(args.previewRows[i], null, 2));
  }
  console.log("Resolved columns:");
  for (const [label, header] of Object.entries(args.resolvedColumns)) {
    console.log(`${label} -> ${header}`);
  }
  console.groupEnd();
}

function logSkippedRow(fileRow: number, reason: string): void {
  if (typeof console !== "undefined") {
    console.warn(`Строка ${fileRow}: ${reason}`);
  }
}

function parseRawMatrix(csvText: string): unknown[][] {
  const parsed = Papa.parse<unknown[]>(csvText, {
    header: false,
    skipEmptyLines: false,
    delimiter: TENDER_PROCUREMENT_CSV_DELIMITER,
  });
  return parsed.data;
}

function rowToTender(
  row: string[],
  map: TenderProcurementColumnMap,
  index: number,
): { tender: Tender | null; reason: string | null } {
  const codeRaw = getCell(row, map.code);
  const nameRaw = getCell(row, map.name);
  const stageRaw = getCell(row, map.stage);

  const code = resolveProcurementCode(codeRaw);
  const name = nameRaw.trim();

  if (!code && !name) {
    if (map.code >= 0 && codeRaw && !code) {
      return { tender: null, reason: "некорректный код работы" };
    }
    if (map.name >= 0 && !nameRaw.trim() && map.code < 0) {
      return { tender: null, reason: "не найдено наименование" };
    }
    if (map.code >= 0 && !codeRaw && map.name >= 0 && !nameRaw.trim()) {
      return { tender: null, reason: "не найден код работы и наименование" };
    }
    if (map.code >= 0 && !codeRaw) {
      return { tender: null, reason: "не найден код работы" };
    }
    if (map.name >= 0 && !nameRaw.trim()) {
      return { tender: null, reason: "не найдено наименование" };
    }
    return { tender: null, reason: "не найден код работы и наименование" };
  }

  const stageFromColumn = stageRaw.trim();
  const stageFromCode = code ? getGprStageFromTenderCode(code) : null;
  const stageFromName = !code && name ? getGprStageFromTenderCode(name) : null;
  const resolvedStage = stageFromColumn || stageFromCode || stageFromName || "";

  if (!resolvedStage && !code && !name) {
    return { tender: null, reason: "не найден этап" };
  }

  const stage = resolvedStage || "2.05";
  const statusLabel = getCell(row, map.status) || undefined;
  const status = statusLabel ? mapProcurementStatus(statusLabel) : undefined;
  const cycleStatus = statusLabel ? normalizeTenderCycleStatus(statusLabel) : undefined;

  const tender: Tender = {
    id: `tender-proc-import-${index}`,
    partId: inferPartIdFromStage(resolvedStage),
    code: code || "",
    name: name || code || "",
    stage: resolvedStage,
    planStart: parseProcurementDate(getCell(row, map.planStart)),
    factStart: parseProcurementDate(getCell(row, map.factStart)) ?? undefined,
    planContractDate: parseProcurementDate(getCell(row, map.planContractDate)),
    factContractDate: parseProcurementDate(getCell(row, map.factContractDate)) ?? undefined,
    cost: parseProcurementNumber(getCell(row, map.costPlan)),
    factCost: parseProcurementNumber(getCell(row, map.costFact)),
    contractor: getCell(row, map.contractor) || undefined,
    status,
    statusLabel,
    cycleStatus: cycleStatus !== "other" ? cycleStatus : undefined,
    comment: getCell(row, map.comment) || undefined,
  };

  return { tender, reason: null };
}

export function parseTenderProcurementCsvText(csvText: string): TenderProcurementCsvImportResult {
  const rawRows = parseRawMatrix(csvText);
  const headerCandidate = detectTenderProcurementHeader(rawRows);

  if (!headerCandidate) {
    throw new Error(
      "Не удалось найти строку заголовков в файле данных закупки (проверьте формат CSV и консоль).",
    );
  }

  const { headerRowIndex, dataStartIndex, headers } = headerCandidate;
  const columnMap = buildTenderProcurementColumnMap(headers);
  const resolvedColumns = buildResolvedColumns(headers, columnMap);

  const previewRows: Record<string, string>[] = [];
  for (let i = dataStartIndex; i < rawRows.length && previewRows.length < 5; i += 1) {
    const row = rawRows[i];
    if (!Array.isArray(row) || isRowEmpty(row.map((c) => String(c ?? "")))) continue;
    previewRows.push(rowToObject(headers, row));
  }

  logTenderProcurementParseDiagnostic({
    headerRowIndex,
    headers,
    previewRows,
    resolvedColumns,
  });

  const tenders: Tender[] = [];
  const skippedRows: TenderProcurementRowSkip[] = [];
  let parsedRows = 0;

  for (let i = dataStartIndex; i < rawRows.length; i += 1) {
    const rawRow = rawRows[i];
    if (!Array.isArray(rawRow)) continue;

    const fileRow = i + 1;
    const row = rawRow.map((c) => String(c ?? ""));

    if (isRowEmpty(row)) {
      skippedRows.push({ fileRow, reason: "пустая строка" });
      logSkippedRow(fileRow, "пустая строка");
      continue;
    }

    if (rowLooksLikeRepeatedHeader(row, columnMap)) {
      skippedRows.push({ fileRow, reason: "строка заголовков или служебная" });
      logSkippedRow(fileRow, "строка заголовков или служебная");
      continue;
    }

    parsedRows += 1;
    const { tender, reason } = rowToTender(row, columnMap, tenders.length + 1);

    if (!tender || reason) {
      const skipReason = reason ?? "не удалось сопоставить";
      skippedRows.push({ fileRow, reason: skipReason });
      logSkippedRow(fileRow, skipReason);
      continue;
    }

    tenders.push(tender);
  }

  const audit: TenderProcurementCsvImportAudit = {
    parsedRows,
    loaded: tenders.length,
    skipped: skippedRows.length,
    headerRowIndex,
    dataStartFileRow: dataStartIndex + 1,
    headers,
    columnMap,
    resolvedColumns,
    skippedRows,
  };

  if (typeof console !== "undefined") {
    console.log(
      `[Tenders] Импорт данных закупки — разбор завершён: прочитано ${parsedRows}, загружено ${tenders.length}, пропущено ${skippedRows.length}`,
    );
  }

  return { tenders, audit };
}

export async function parseTenderProcurementCsvFile(
  file: File,
): Promise<TenderProcurementCsvImportResult> {
  const text = await readCsvFileTextSmart(file);
  return parseTenderProcurementCsvText(text);
}
