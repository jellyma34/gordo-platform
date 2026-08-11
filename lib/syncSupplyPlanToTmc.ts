import type { ProjectPartKey } from "@/lib/gprUtils";
import {
  buildSupplyPlanColumnMap,
  type SupplyPlanColumnKey,
  type SupplyPlanColumnMap,
  type SupplyPlanCsvParsed,
} from "@/lib/supplyPlanCsvImport";
import {
  createEmptyTmcItem,
  syncTmcFinancials,
  computeSupplyPlanProcurementDiagnostics,
  supplyPlanProcurementStatusToSupplyStatus,
  deriveTmcSupplyPlanProcurementStatus,
  type SupplyPlanProcurementDiagnostics,
  type TMCItem,
} from "@/lib/tmcData";

/** Строка материала из CSV плана снабжения (после разбора). */
export type SupplyPlanMaterialRow = {
  itemCode: string;
  workGroup: string;
  name: string;
  gprStartDate: string | null;
  gprEndDate: string | null;
  unit: string;
  volumePlan: number;
  volumeOrdered: number;
  pricePlan: number;
  priceFact: number;
  costPlan: number;
  costFact: number | null;
  priceDeviation: number | null;
  planFactDeviation: number | null;
};

export type SupplyPlanSyncStats = {
  parsedRows: number;
  materialRows: number;
  /** @deprecated Используйте `updated`. */
  updatedItems: number;
  /** @deprecated */
  aggregatedStages: number;
  /** @deprecated */
  unmatchedStageRows: number;
  /** @deprecated */
  skippedEmptyGroup: number;
  updated: number;
  created: number;
  stageMatchFailed: number;
  procurementDiagnostics: SupplyPlanProcurementDiagnostics;
};

function normalizeStageKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeNameKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeItemCodeKey(value: string): string {
  return value.trim().toLowerCase();
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
  const m = t.replace(/\//g, ".").match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  }
  return null;
}

function getCell(
  row: Record<string, string>,
  headers: string[],
  colMap: SupplyPlanColumnMap,
  key: SupplyPlanColumnKey,
): string {
  const idx = colMap[key];
  if (idx < 0 || idx >= headers.length) return "";
  const header = headers[idx];
  if (!header) return "";
  return String(row[header] ?? "").trim();
}

function newTmcId(index: number): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tmc-sp-${Date.now()}-${index}`;
}

function supplyPlanStableId(row: SupplyPlanMaterialRow, projectPart: ProjectPartKey, index: number): string {
  const code = (row.itemCode || "nocode").replace(/\s+/g, "");
  const nameKey = (row.name || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40);
  return `tmc-sp:${projectPart}:i${index}:${code}:${nameKey}`;
}

/** Извлекает типизированные строки из результата парсера (без создания TMCItem). */
export function extractSupplyPlanMaterialRows(parsed: SupplyPlanCsvParsed): SupplyPlanMaterialRow[] {
  const { rows, headers } = parsed;
  const colMap = buildSupplyPlanColumnMap(headers);
  const materialRows: SupplyPlanMaterialRow[] = [];

  for (const row of rows) {
    const workGroup = getCell(row, headers, colMap, "workGroup");
    const name = getCell(row, headers, colMap, "name");
    const itemCode = getCell(row, headers, colMap, "itemCode");
    if (!workGroup.trim() && !name.trim() && !itemCode.trim()) continue;

    const volumePlan = parseSupplyPlanNumberOrZero(getCell(row, headers, colMap, "volumePlan"));
    const volumeOrdered = parseSupplyPlanNumberOrZero(getCell(row, headers, colMap, "volumeOrdered"));
    let pricePlan = parseSupplyPlanNumberOrZero(getCell(row, headers, colMap, "pricePlan"));
    let priceFact = parseSupplyPlanNumberOrZero(getCell(row, headers, colMap, "priceFact"));

    let costPlan = parseSupplyPlanNumber(getCell(row, headers, colMap, "costPlan"));
    let factCost = parseSupplyPlanNumber(getCell(row, headers, colMap, "costFact"));

    if (costPlan == null && volumePlan > 0 && pricePlan > 0) {
      costPlan = volumePlan * pricePlan;
    }
    if (costPlan == null) costPlan = 0;

    if (factCost == null && volumeOrdered > 0 && priceFact > 0) {
      factCost = volumeOrdered * priceFact;
    }

    let priceDeviation = parseSupplyPlanNumber(getCell(row, headers, colMap, "priceDeviation"));
    let planFactDeviation = parseSupplyPlanNumber(getCell(row, headers, colMap, "planFactDeviation"));

    if (priceDeviation == null && pricePlan > 0) {
      priceDeviation = priceFact - pricePlan;
    }
    if (planFactDeviation == null) {
      planFactDeviation = (factCost ?? 0) - costPlan;
    }

    if (volumePlan > 0 && costPlan > 0 && pricePlan === 0) {
      pricePlan = costPlan / volumePlan;
    }
    if (volumeOrdered > 0 && factCost != null && factCost > 0 && priceFact === 0) {
      priceFact = factCost / volumeOrdered;
    }

    materialRows.push({
      itemCode: itemCode.trim(),
      workGroup: workGroup.trim(),
      name: name.trim(),
      gprStartDate: parseSupplyPlanDate(getCell(row, headers, colMap, "gprStartDate")),
      gprEndDate: parseSupplyPlanDate(getCell(row, headers, colMap, "gprEndDate")),
      unit: getCell(row, headers, colMap, "unit") || "шт",
      volumePlan,
      volumeOrdered,
      pricePlan,
      priceFact,
      costPlan,
      costFact: factCost != null && factCost > 0 ? factCost : null,
      priceDeviation,
      planFactDeviation,
    });
  }

  return materialRows;
}

function findTmcMatchIndex(scope: TMCItem[], row: SupplyPlanMaterialRow): number {
  const stageKey = normalizeStageKey(row.workGroup);
  if (!stageKey) return -1;

  if (row.itemCode) {
    const codeKey = normalizeItemCodeKey(row.itemCode);
    const byCode = scope.findIndex(
      (item) =>
        normalizeStageKey(item.gprStage) === stageKey &&
        normalizeItemCodeKey(item.itemCode) === codeKey,
    );
    if (byCode >= 0) return byCode;
  }

  if (row.name) {
    const nameKey = normalizeNameKey(row.name);
    return scope.findIndex(
      (item) =>
        normalizeStageKey(item.gprStage) === stageKey && normalizeNameKey(item.name) === nameKey,
    );
  }

  return -1;
}

function applySupplyPlanRowToTmcItem(item: TMCItem, row: SupplyPlanMaterialRow): TMCItem {
  const procurementStatus = deriveTmcSupplyPlanProcurementStatus(row.volumePlan, row.volumeOrdered);
  const status = supplyPlanProcurementStatusToSupplyStatus(procurementStatus);

  return syncTmcFinancials({
    ...item,
    itemCode: row.itemCode || item.itemCode,
    sourceCode: row.itemCode || item.sourceCode,
    name: row.name || item.name,
    stage: row.workGroup || item.stage || item.gprStage,
    gprStage: row.workGroup || item.gprStage,
    unit: row.unit || item.unit,
    plannedQuantity: row.volumePlan,
    actualQuantity: row.volumeOrdered,
    volumePlan: row.volumePlan,
    volumeFact: row.volumeOrdered,
    status,
    statusRaw: status,
    statusCategory:
      status === "поставлено" ? "delivered" : status === "частично" ? "partial" : "plan",
    deliveryPlanDate: row.gprEndDate ?? item.deliveryPlanDate ?? item.supplyPlanDate,
    supplyPlanDate: row.gprEndDate ?? item.supplyPlanDate,
    gprStartDate: row.gprStartDate ?? item.gprStartDate,
    contractPlanDate: row.gprStartDate ?? item.contractPlanDate,
  });
}

function createTmcItemFromSupplyPlanRow(
  row: SupplyPlanMaterialRow,
  projectPart: ProjectPartKey,
  index: number,
): TMCItem {
  const itemCode = row.itemCode || `2.05.99.${String(index).padStart(3, "0")}`;
  const procurementStatus = deriveTmcSupplyPlanProcurementStatus(row.volumePlan, row.volumeOrdered);
  const status = supplyPlanProcurementStatusToSupplyStatus(procurementStatus);

  return createEmptyTmcItem(projectPart, {
    id: supplyPlanStableId(row, projectPart, index),
    sourceRowNumber: index + 1,
    rowNo: null,
    sourceCode: itemCode,
    itemCode,
    rowKind: "position",
    name: row.name || `Материал ${itemCode}`,
    stage: row.workGroup,
    gprStage: row.workGroup,
    unit: row.unit || "шт",
    plannedQuantity: row.volumePlan,
    actualQuantity: row.volumeOrdered,
    volumePlan: row.volumePlan,
    volumeFact: row.volumeOrdered,
    status,
    statusRaw: status,
    statusCategory:
      status === "поставлено" ? "delivered" : status === "частично" ? "partial" : "plan",
    deliveryPlanDate: row.gprEndDate,
    supplyPlanDate: row.gprEndDate,
    gprStartDate: row.gprStartDate,
    contractPlanDate: row.gprStartDate,
  });
}

function buildSyncStats(
  parsed: SupplyPlanCsvParsed,
  materialRows: SupplyPlanMaterialRow[],
  updated: number,
  created: number,
  stageMatchFailed: number,
  scope: TMCItem[],
): SupplyPlanSyncStats {
  const procurementDiagnostics = computeSupplyPlanProcurementDiagnostics(scope);
  return {
    parsedRows: parsed.rows.length,
    materialRows: materialRows.length,
    updated,
    created,
    stageMatchFailed,
    procurementDiagnostics,
    updatedItems: updated,
    aggregatedStages: 0,
    unmatchedStageRows: stageMatchFailed,
    skippedEmptyGroup: stageMatchFailed,
  };
}

/**
 * UPSERT: для каждой строки плана снабжения обновить существующую позицию ТМЦ
 * (этап ГПР + код или этап ГПР + наименование) либо создать новую.
 */
export function syncSupplyPlanToTmc(
  tmcItems: TMCItem[],
  parsed: SupplyPlanCsvParsed,
  projectPart?: ProjectPartKey,
): { items: TMCItem[]; stats: SupplyPlanSyncStats } {
  const otherParts =
    projectPart != null ? tmcItems.filter((item) => item.projectPart !== projectPart) : [];
  const scope =
    projectPart != null
      ? tmcItems.filter((item) => item.projectPart === projectPart).map((item) => ({ ...item }))
      : tmcItems.map((item) => ({ ...item }));

  const materialRows = extractSupplyPlanMaterialRows(parsed);
  const part = projectPart ?? "residential";

  let updated = 0;
  let created = 0;
  let stageMatchFailed = 0;
  let createIndex = 0;

  for (const row of materialRows) {
    if (!row.workGroup.trim()) {
      stageMatchFailed += 1;
      continue;
    }

    const matchIndex = findTmcMatchIndex(scope, row);
    if (matchIndex >= 0) {
      scope[matchIndex] = applySupplyPlanRowToTmcItem(scope[matchIndex]!, row);
      updated += 1;
      continue;
    }

    createIndex += 1;
    scope.push(createTmcItemFromSupplyPlanRow(row, part, createIndex));
    created += 1;
  }

  return {
    items: projectPart != null ? [...otherParts, ...scope] : scope,
    stats: buildSyncStats(parsed, materialRows, updated, created, stageMatchFailed, scope),
  };
}

/** Алиас для сценария merge (то же поведение, отдельное имя для UI/сервисов). */
export const mergeSupplyPlanWithTmc = syncSupplyPlanToTmc;
