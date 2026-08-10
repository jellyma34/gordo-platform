import Papa from "papaparse";

import { readCsvFileTextSmart } from "@/lib/csvTextEncoding";
import { ruDateCellToIsoOrNull } from "@/lib/gprReportCsv";
import type { ProjectPartKey } from "@/lib/gprUtils";
import {
  createEmptyTmcItem,
  syncTmcFinancials,
  TMC_GPR_STAGE_ROOT_CODE,
  supplyPlanProcurementStatusToSupplyStatus,
  deriveTmcSupplyPlanProcurementStatus,
  type TMCItem,
  type TmcSupplyStatus,
} from "@/lib/tmcData";

/** Максимум строк для автопоиска заголовка плана снабжения. */
export const SUPPLY_PLAN_CSV_HEADER_SCAN_LIMIT = 20;

/** Минимум совпадений характерных колонок, чтобы считать строку заголовком. */
export const SUPPLY_PLAN_CSV_HEADER_MIN_SIGNATURES = 3;

/**
 * @deprecated Заголовок определяется автоматически; константа сохранена для совместимости API.
 */
export const SUPPLY_PLAN_CSV_HEADER_ROW_INDEX = 2;

export const SUPPLY_PLAN_CSV_DELIMITER = ";";

export type SupplyPlanColumnKey =
  | "itemCode"
  | "workGroup"
  | "gprStartDate"
  | "gprEndDate"
  | "name"
  | "volumePlan"
  | "volumeOrdered"
  | "unit"
  | "pricePlan"
  | "costPlan"
  | "priceFact"
  | "costFact"
  | "priceDeviation"
  | "planFactDeviation";

export type SupplyPlanColumnMap = Record<SupplyPlanColumnKey, number>;

export type SupplyPlanCsvParsed = {
  rows: Record<string, string>[];
  headers: string[];
};

export type SupplyPlanCsvImportAudit = {
  parsedRows: number;
  loaded: number;
  skipped: number;
  headers: string[];
  columnMap: SupplyPlanColumnMap;
};

const SUPPLY_PLAN_COLUMN_DEFINITIONS: { key: SupplyPlanColumnKey; patterns: string[] }[] = [
  { key: "itemCode", patterns: ["id код", "idкод"] },
  { key: "workGroup", patterns: ["группа работ"] },
  { key: "gprStartDate", patterns: ["дата начала по гпр"] },
  { key: "gprEndDate", patterns: ["дата окончания по гпр"] },
  { key: "name", patterns: ["номенклатура"] },
  { key: "volumePlan", patterns: ["объем (план)", "объём (план)"] },
  { key: "volumeOrdered", patterns: ["объем (заказан)", "объём (заказан)"] },
  { key: "unit", patterns: ["ед. изм.", "ед изм", "единица измерения"] },
  { key: "pricePlan", patterns: ["плановая цена по смете за ед", "плановая цена по смете"] },
  {
    key: "costPlan",
    patterns: ["плановая стоимость всего по смете", "плановая стоимость всего"],
  },
  {
    key: "priceFact",
    patterns: ["факт последняя цена за ед. снабжение", "факт последняя цена за ед снабжение"],
  },
  { key: "costFact", patterns: ["факт стоимость снабжение"] },
  { key: "priceDeviation", patterns: ["отклонение цены за ед"] },
  { key: "planFactDeviation", patterns: ["отклонение п-ф", "отклонение п ф"] },
];

function normalizeSupplyPlanHeader(h: string): string {
  return String(h)
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseSupplyPlanNumber(val: unknown): number | null {
  if (val == null) return null;
  const s = String(val).trim();
  if (!s) return null;
  const normalized = s.replace(/\s/g, "").replace(/\u00a0/g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

function parseSupplyPlanNumberOrZero(val: unknown): number {
  return parseSupplyPlanNumber(val) ?? 0;
}

function parseSupplyPlanDate(val: unknown): string | null {
  if (val == null || val === "") return null;
  const t = String(val).trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const fromRu = ruDateCellToIsoOrNull(t.replace(/\//g, "."));
  if (fromRu) return fromRu;
  const m = t.replace(/\//g, ".").match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  }
  return null;
}

function makeUniqueHeaderKeys(headerRaw: string[]): string[] {
  const seen = new Map<string, number>();
  return headerRaw.map((raw, index) => {
    const base = String(raw ?? "")
      .replace(/^\uFEFF/, "")
      .trim()
      .replace(/\s+/g, " ") || `column_${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}__${count + 1}`;
  });
}

export function buildSupplyPlanColumnMap(headers: string[]): SupplyPlanColumnMap {
  const normalized = headers.map((h) => normalizeSupplyPlanHeader(h));
  const map = Object.fromEntries(
    SUPPLY_PLAN_COLUMN_DEFINITIONS.map(({ key }) => [key, -1]),
  ) as SupplyPlanColumnMap;

  for (const { key, patterns } of SUPPLY_PLAN_COLUMN_DEFINITIONS) {
    const sorted = [...patterns].sort((a, b) => b.length - a.length);
    for (const pattern of sorted) {
      const idx = normalized.findIndex((h) => h.includes(pattern));
      if (idx >= 0) {
        map[key] = idx;
        break;
      }
    }
  }

  return map;
}

function countSupplyPlanHeaderSignatures(row: unknown[]): number {
  const cells = row.map((c) => normalizeSupplyPlanHeader(String(c ?? "")));
  let matched = 0;

  const hasWorkGroup = cells.some((h) => h.includes("группа работ"));
  const hasNomenclature = cells.some((h) => h.includes("номенклатур"));
  const hasUnit = cells.some(
    (h) =>
      h === "ед" ||
      h === "ед." ||
      h.startsWith("ед.") ||
      h.includes("ед. изм") ||
      h.includes("ед изм") ||
      h.includes("единица измерения"),
  );
  const hasPricePlan = cells.some((h) => h.includes("плановая цена"));
  const hasPriceFact = cells.some((h) => h.includes("факт последняя цена"));
  const hasCostPlan = cells.some((h) => h.includes("плановая стоимость"));
  const hasCostFact = cells.some((h) => h.includes("факт стоимость"));

  if (hasWorkGroup) matched += 1;
  if (hasNomenclature) matched += 1;
  if (hasUnit) matched += 1;
  if (hasPricePlan) matched += 1;
  if (hasPriceFact) matched += 1;
  if (hasCostPlan) matched += 1;
  if (hasCostFact) matched += 1;

  return matched;
}

/** Автопоиск строки заголовков в первых N непустых строках CSV. */
export function detectSupplyPlanHeaderRowIndex(rawRows: unknown[][]): number {
  const limit = Math.min(SUPPLY_PLAN_CSV_HEADER_SCAN_LIMIT, rawRows.length);
  for (let i = 0; i < limit; i += 1) {
    const row = rawRows[i];
    if (!Array.isArray(row) || !row.some((c) => String(c ?? "").trim() !== "")) continue;
    if (countSupplyPlanHeaderSignatures(row) >= SUPPLY_PLAN_CSV_HEADER_MIN_SIGNATURES) {
      return i;
    }
  }
  return -1;
}

function inferGprStageFromItemCode(code: string, workGroup: string): string {
  const group = workGroup.trim();
  if (group) return group;

  const t = code.trim();
  if (!t) return "Строительство зданий и сооружений";

  const rootMatch = t.match(/^(\d+\.\d+)/);
  const root = rootMatch?.[1] ?? "";
  for (const [label, rootCode] of Object.entries(TMC_GPR_STAGE_ROOT_CODE)) {
    if (rootCode === root || t.startsWith(`${rootCode}.`)) return label;
  }
  return "Строительство зданий и сооружений";
}

function deriveSupplyStatus(volumePlan: number, volumeOrdered: number): TmcSupplyStatus {
  return supplyPlanProcurementStatusToSupplyStatus(
    deriveTmcSupplyPlanProcurementStatus(volumePlan, volumeOrdered),
  );
}

function supplyPlanItemId(itemCode: string, index: number, name = ""): string {
  const code = (itemCode.trim() || "nocode").replace(/\s+/g, "");
  const nameKey = name.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40);
  return `tmc-sp:i${index}:${code}:${nameKey}`;
}

function getCell(row: Record<string, string>, headers: string[], colMap: SupplyPlanColumnMap, key: SupplyPlanColumnKey): string {
  const idx = colMap[key];
  if (idx < 0 || idx >= headers.length) return "";
  const header = headers[idx];
  if (!header) return "";
  return String(row[header] ?? "").trim();
}

/**
 * Парсер CSV «материалы из плана снабжения по ГПР»:
 * - автопоиск строки заголовков в первых 20 непустых строках;
 * - разделитель `;`;
 * - кодировка подбирается при чтении файла (UTF-8 / CP1251).
 */
export function parseSupplyPlanCsvText(csvText: string): SupplyPlanCsvParsed {
  const result = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: false,
    delimiter: SUPPLY_PLAN_CSV_DELIMITER,
  });

  if (result.errors?.length) {
    console.warn("[supply plan CSV]", result.errors.slice(0, 5));
  }

  const rawRows = (Array.isArray(result.data) ? result.data : []).filter(
    (row) => Array.isArray(row) && row.some((c) => String(c ?? "").trim() !== ""),
  );

  if (rawRows.length === 0) {
    throw new Error("Файл плана снабжения пуст или не содержит данных.");
  }

  const headerRowIndex = detectSupplyPlanHeaderRowIndex(rawRows);
  if (headerRowIndex < 0) {
    throw new Error(
      "Не найдена строка заголовков плана снабжения (ожидаются характерные колонки: «Группа работ», «Номенклатура», «Ед.», «Плановая цена», «Факт последняя цена», «Плановая стоимость», «Факт стоимость»).",
    );
  }

  const headerCandidate = rawRows[headerRowIndex]!;
  const headerRaw = headerCandidate.map((h) =>
    String(h ?? "")
      .replace(/^\uFEFF/, "")
      .trim()
      .replace(/\s+/g, " "),
  );
  const headers = makeUniqueHeaderKeys(headerRaw);
  const dataRows = rawRows.slice(headerRowIndex + 1);

  const objects: Record<string, string>[] = dataRows.map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      const v = row[i];
      obj[h] = v == null ? "" : String(v).trim();
    });
    return obj;
  });

  if (typeof console !== "undefined") {
    console.log("[supply plan CSV] header row index:", headerRowIndex);
    console.log("[supply plan CSV] rows:", objects.length);
    console.log("[supply plan CSV] columns:", headers);
  }

  return { rows: objects, headers };
}

export async function parseSupplyPlanCsvFile(file: File): Promise<SupplyPlanCsvParsed> {
  const text = await readCsvFileTextSmart(file);
  return parseSupplyPlanCsvText(text);
}

/** Преобразование строк плана снабжения в позиции ТМЦ (отдельный сценарий импорта). */
export function normalizeSupplyPlanCsvRows(
  rows: Record<string, string>[],
  headers: string[],
  defaultProjectPart: ProjectPartKey = "residential",
): { items: TMCItem[]; audit: SupplyPlanCsvImportAudit } {
  const colMap = buildSupplyPlanColumnMap(headers);

  if (colMap.name < 0) {
    throw new Error("В файле плана снабжения не найдена колонка «Номенклатура».");
  }

  const items: TMCItem[] = [];
  let skipped = 0;
  let idx = 0;

  for (const row of rows) {
    const name = getCell(row, headers, colMap, "name").trim();
    if (!name) {
      skipped += 1;
      continue;
    }

    idx += 1;
    const itemCode = getCell(row, headers, colMap, "itemCode");
    const workGroup = getCell(row, headers, colMap, "workGroup");
    const gprStartDate = parseSupplyPlanDate(getCell(row, headers, colMap, "gprStartDate"));
    const gprEndDate = parseSupplyPlanDate(getCell(row, headers, colMap, "gprEndDate"));
    const unit = getCell(row, headers, colMap, "unit") || "шт";

    const volumePlan = parseSupplyPlanNumberOrZero(getCell(row, headers, colMap, "volumePlan"));
    const volumeFact = parseSupplyPlanNumberOrZero(getCell(row, headers, colMap, "volumeOrdered"));
    const pricePlan = parseSupplyPlanNumberOrZero(getCell(row, headers, colMap, "pricePlan"));
    const priceFact = parseSupplyPlanNumberOrZero(getCell(row, headers, colMap, "priceFact"));

    let planCost = parseSupplyPlanNumber(getCell(row, headers, colMap, "costPlan"));
    let factCost = parseSupplyPlanNumber(getCell(row, headers, colMap, "costFact"));

    if (planCost == null && volumePlan > 0 && pricePlan > 0) {
      planCost = volumePlan * pricePlan;
    }
    if (planCost == null) planCost = 0;

    if (factCost == null && volumeFact > 0 && priceFact > 0) {
      factCost = volumeFact * priceFact;
    }

    const gprStage = inferGprStageFromItemCode(itemCode, workGroup);
    const status = deriveSupplyStatus(volumePlan, volumeFact);
    const code = itemCode.trim() || `2.05.99.${String(idx).padStart(3, "0")}`;

    const draft = createEmptyTmcItem(defaultProjectPart, {
      id: supplyPlanItemId(itemCode, idx, name),
      sourceRowNumber: idx + 1,
      sourceCode: code,
      itemCode: code,
      rowKind: "position",
      name,
      stage: gprStage,
      gprStage,
      unit,
      plannedQuantity: volumePlan,
      actualQuantity: volumeFact,
      volumePlan,
      volumeFact,
      status,
      statusRaw: status,
      statusCategory:
        status === "поставлено" ? "delivered" : status === "частично" ? "partial" : "plan",
      deliveryPlanDate: gprEndDate,
      supplyPlanDate: gprEndDate,
      gprStartDate: gprStartDate,
      contractPlanDate: gprStartDate,
    });

    items.push(syncTmcFinancials(draft));
  }

  return {
    items,
    audit: {
      parsedRows: rows.length,
      loaded: items.length,
      skipped,
      headers,
      columnMap: colMap,
    },
  };
}
