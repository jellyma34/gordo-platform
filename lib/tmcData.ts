import type { ProjectPartKey } from "./gprUtils";
import { getGprProjectId } from "@/lib/gprImportPersistence";

/** Тип строки в иерархии закупок ТМЦ. */
export type TmcRowKind = "section" | "group" | "position" | "other";

/**
 * Визуальная категория статуса (нормализация регистра/пробелов).
 * Исходная строка CSV хранится в `statusRaw`.
 */
export type TmcStatusCategory = "delivered" | "partial" | "plan" | "no_fact";

/** @deprecated совместимость со старыми модулями; предпочтительно `statusCategory`. */
export type TmcSupplyStatus = "план" | "поставлено" | "частично";

export function categorizeTmcStatus(raw: unknown): TmcStatusCategory {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!s) return "no_fact";
  if (s.includes("частич")) return "partial";
  if (s.includes("поставлен")) return "delivered";
  if (s === "plan" || s.includes("план")) return "plan";
  return "no_fact";
}

export function parseTmcSupplyStatus(raw: unknown): TmcSupplyStatus {
  const cat = categorizeTmcStatus(raw);
  if (cat === "partial") return "частично";
  if (cat === "delivered") return "поставлено";
  return "план";
}

export function tmcStatusCategoryLabel(cat: TmcStatusCategory): string {
  switch (cat) {
    case "delivered":
      return "Поставлено";
    case "partial":
      return "Поставлено частично";
    case "plan":
      return "План";
    default:
      return "Нет факта";
  }
}

/** WBS-код вида 2.05. / 2.05.02.2. */
export function isTmcWbsCode(code: string): boolean {
  const t = code.trim();
  if (!t || t === "-" || t === "?" || t === "_") return false;
  return /^\d+(\.\d+)*\.?$/.test(t);
}

export function normalizeTmcWbsCode(code: string): string {
  const t = code.trim();
  if (!t) return "";
  return t.endsWith(".") ? t.slice(0, -1) : t;
}

/**
 * Модель строки ТМЦ под новый CSV «ТМЦ_новое.csv».
 * Финансовых полей (цена / стоимость) в источнике нет — не вычисляются.
 */
export type TMCItem = {
  /** Стабильный внутренний id (csv row + context). */
  id: string;
  /** 1-based номер физической/логической строки CSV (для стабильности "-" / "?"). */
  sourceRowNumber: number;
  /** Сырое значение колонки «ID Код». */
  sourceCode: string;
  /** Код для отображения / сортировки (sourceCode; для групп — WBS). */
  itemCode: string;
  rowKind: TmcRowKind;
  /** Ближайший предшествующий WBS-код группы (явная иерархия по порядку CSV). */
  parentWbsCode: string | null;

  stage: string;
  /** @deprecated alias `stage` */
  gprStage: string;
  /** Наименование ТМЦ */
  name: string;

  gprStartDate: string | null;
  orderDeadlineDays: number | null;

  requestPlanDate: string | null;
  requestFactDate: string | null;
  requestDeviationDays: number | null;

  contractLeadTimeDays: number | null;
  contractPlanDate: string | null;
  contractFactDate: string | null;
  contractDeviationDays: number | null;

  deliveryPlanDate: string | null;
  deliveryFactDate: string | null;
  deliveryDeviationDays: number | null;

  /**
   * Вторая группа дат из CSV (заголовок источника: «Дата заключения договора»),
   * колонки после «Дата поставки» — сохраняется без переименования смысла.
   */
  contractDate2PlanDate: string | null;
  contractDate2FactDate: string | null;
  contractDate2DeviationDays: number | null;

  unit: string;
  plannedQuantity: number | null;
  actualQuantity: number | null;
  quantityDeviation: number | null;

  supplier: string;
  contract: string;
  /** Исходный статус из CSV. */
  statusRaw: string;
  statusCategory: TmcStatusCategory;
  /** @deprecated зеркало category → старый enum */
  status: TmcSupplyStatus;
  comment: string;

  projectPart: ProjectPartKey;

  /** Совместимость: объёмы = количества (null → 0). */
  volumePlan: number;
  volumeFact: number;
  /** Совместимость: даты поставки. */
  supplyPlanDate: string | null;
  supplyFactDate: string | null;

  /** Удалены из источника — всегда 0 / null, не рассчитывать. */
  pricePlan: number;
  priceFact: number;
  totalPlan: number;
  totalFact: number;
  planCost: number;
  factCost: number | null;
};

export function isTmcControlledPosition(item: TMCItem): boolean {
  return item.rowKind === "position";
}

export function tmcOrderedVolume(item: TMCItem): number {
  return Math.max(0, item.volumeFact);
}

/** @deprecated денежная модель удалена */
export function computeTmcTotalsFromVolumes(
  _volumePlan: number,
  _pricePlan: number,
  _volumeFact: number,
  _priceFact: number,
): { totalPlan: number; totalFact: number } {
  return { totalPlan: 0, totalFact: 0 };
}

/** @deprecated */
export type TmcSupplyPlanProcurementStatus = "notPurchased" | "partial" | "full";

export function deriveTmcSupplyPlanProcurementStatus(
  volumePlan: number,
  volumeOrdered: number,
): TmcSupplyPlanProcurementStatus {
  if (volumeOrdered <= 0) return "notPurchased";
  if (volumePlan > 0 && volumeOrdered < volumePlan) return "partial";
  return "full";
}

export function classifyTmcSupplyPlanProcurementStatus(
  item: TMCItem,
): TmcSupplyPlanProcurementStatus {
  if (item.statusCategory === "delivered") return "full";
  if (item.statusCategory === "partial") return "partial";
  if (item.contractFactDate || item.deliveryFactDate || (item.actualQuantity ?? 0) > 0) {
    return deriveTmcSupplyPlanProcurementStatus(item.volumePlan, tmcOrderedVolume(item));
  }
  return "notPurchased";
}

export function supplyPlanProcurementStatusToSupplyStatus(
  status: TmcSupplyPlanProcurementStatus,
): TmcSupplyStatus {
  if (status === "notPurchased") return "план";
  if (status === "partial") return "частично";
  return "поставлено";
}

export type SupplyPlanProcurementDiagnostics = {
  totalMaterials: number;
  fullyPurchased: number;
  partiallyPurchased: number;
  notPurchased: number;
  totalPlanCostRub: number;
  totalFactCostRub: number;
};

export function computeSupplyPlanProcurementDiagnostics(
  items: TMCItem[],
): SupplyPlanProcurementDiagnostics {
  let fullyPurchased = 0;
  let partiallyPurchased = 0;
  let notPurchased = 0;
  for (const item of items.filter(isTmcControlledPosition)) {
    const status = classifyTmcSupplyPlanProcurementStatus(item);
    if (status === "full") fullyPurchased += 1;
    else if (status === "partial") partiallyPurchased += 1;
    else notPurchased += 1;
  }
  return {
    totalMaterials: items.filter(isTmcControlledPosition).length,
    fullyPurchased,
    partiallyPurchased,
    notPurchased,
    totalPlanCostRub: 0,
    totalFactCostRub: 0,
  };
}

/** Синхронизация совместимых полей; деньги не вычисляются. */
export function syncTmcFinancials(item: TMCItem): TMCItem {
  const volumePlan = item.plannedQuantity ?? item.volumePlan ?? 0;
  const volumeFact = item.actualQuantity ?? item.volumeFact ?? 0;
  return {
    ...item,
    gprStage: item.stage || item.gprStage,
    stage: item.stage || item.gprStage,
    volumePlan: Number.isFinite(volumePlan) ? volumePlan : 0,
    volumeFact: Number.isFinite(volumeFact) ? volumeFact : 0,
    supplyPlanDate: item.deliveryPlanDate ?? item.supplyPlanDate,
    supplyFactDate: item.deliveryFactDate ?? item.supplyFactDate,
    deliveryPlanDate: item.deliveryPlanDate ?? item.supplyPlanDate,
    deliveryFactDate: item.deliveryFactDate ?? item.supplyFactDate,
    pricePlan: 0,
    priceFact: 0,
    totalPlan: 0,
    totalFact: 0,
    planCost: 0,
    factCost: null,
    status: item.status ?? parseTmcSupplyStatus(item.statusRaw || item.status),
    statusCategory: item.statusCategory ?? categorizeTmcStatus(item.statusRaw || item.status),
  };
}

export const TMC_GPR_STAGE_ROOT_CODE: Record<string, string> = {
  "Подготовка территории": "2.04",
  "Подготовка территории строительства": "2.04",
  "Строительство зданий и сооружений": "2.05",
  "Устройство сетей": "2.06",
  Благоустройство: "2.07",
};

export function tmcPlanReferenceDate(item: TMCItem): string | null {
  return (
    item.deliveryPlanDate?.trim() ||
    item.supplyPlanDate?.trim() ||
    item.contractPlanDate?.trim() ||
    null
  );
}

export function tmcFactReferenceDate(item: TMCItem): string | null {
  return (
    item.deliveryFactDate?.trim() ||
    item.supplyFactDate?.trim() ||
    item.contractFactDate?.trim() ||
    null
  );
}

export function suggestNextTmcItemCode(
  _items: TMCItem[],
  _part: ProjectPartKey,
  gprStage: string,
): string {
  const root = TMC_GPR_STAGE_ROOT_CODE[gprStage] ?? "2.05";
  return `${root}.99.1`;
}

function emptyCompatMoney() {
  return {
    pricePlan: 0,
    priceFact: 0,
    totalPlan: 0,
    totalFact: 0,
    planCost: 0,
    factCost: null as number | null,
  };
}

function seedPosition(
  partial: Omit<
    TMCItem,
    | "rowKind"
    | "sourceCode"
    | "sourceRowNumber"
    | "parentWbsCode"
    | "stage"
    | "statusRaw"
    | "statusCategory"
    | "gprStartDate"
    | "orderDeadlineDays"
    | "requestPlanDate"
    | "requestFactDate"
    | "requestDeviationDays"
    | "contractLeadTimeDays"
    | "contractDeviationDays"
    | "deliveryDeviationDays"
    | "contractDate2PlanDate"
    | "contractDate2FactDate"
    | "contractDate2DeviationDays"
    | "plannedQuantity"
    | "actualQuantity"
    | "quantityDeviation"
    | "comment"
    | "volumePlan"
    | "volumeFact"
    | "supplyPlanDate"
    | "supplyFactDate"
    | keyof ReturnType<typeof emptyCompatMoney>
  > & {
    gprStage: string;
    status: TmcSupplyStatus;
    supplyPlanDate: string | null;
    supplyFactDate: string | null;
    contractPlanDate: string | null;
    contractFactDate: string | null;
  },
): TMCItem {
  const statusCategory =
    partial.status === "поставлено"
      ? "delivered"
      : partial.status === "частично"
        ? "partial"
        : "plan";
  return syncTmcFinancials({
    ...partial,
    ...emptyCompatMoney(),
    sourceRowNumber: 0,
    sourceCode: partial.itemCode,
    rowKind: "position",
    parentWbsCode: null,
    stage: partial.gprStage,
    gprStage: partial.gprStage,
    statusRaw: partial.status,
    statusCategory,
    gprStartDate: null,
    orderDeadlineDays: null,
    requestPlanDate: null,
    requestFactDate: null,
    requestDeviationDays: null,
    contractLeadTimeDays: null,
    contractDeviationDays: null,
    deliveryPlanDate: partial.supplyPlanDate,
    deliveryFactDate: partial.supplyFactDate,
    deliveryDeviationDays: null,
    contractDate2PlanDate: null,
    contractDate2FactDate: null,
    contractDate2DeviationDays: null,
    plannedQuantity: null,
    actualQuantity: null,
    quantityDeviation: null,
    comment: "",
    volumePlan: 0,
    volumeFact: statusCategory === "delivered" || statusCategory === "partial" ? 1 : 0,
    unit: partial.unit || "",
    supplier: partial.supplier || "",
    contract: partial.contract || "",
  });
}

/** Пустой демо-набор: после перехода на новый CSV seed не содержит финансовых mock. */
export const TMC_DATA: TMCItem[] = [];

export function filterTmcByProjectPart(
  items: TMCItem[],
  activeProjectPart: ProjectPartKey,
): TMCItem[] {
  return items.filter((item) => (item.projectPart ?? "residential") === activeProjectPart);
}

export function getTmcData(projectPart: ProjectPartKey): TMCItem[] {
  return filterTmcByProjectPart(TMC_DATA, projectPart);
}

function coerceFiniteNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function coerceFiniteNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(String(v).replace(/\s/g, "").replace("\u00a0", "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function coerceIsoNullable(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function buildStableTmcId(parts: {
  projectPart: ProjectPartKey;
  sourceRowNumber: number;
  sourceCode: string;
  stage: string;
  name: string;
}): string {
  const code = parts.sourceCode.trim() || "nocode";
  const ctx = `${parts.stage}|${parts.name}`.slice(0, 80);
  return `tmc:${parts.projectPart}:r${parts.sourceRowNumber}:${code}:${ctx}`;
}

/** Разбор записи из localStorage / API; поддержка нового и частично старого снимка. */
export function normalizeTmcRowLoose(raw: unknown): TMCItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : null;
  const name = typeof o.name === "string" ? o.name : "";
  const stage =
    (typeof o.stage === "string" ? o.stage : null) ||
    (typeof o.gprStage === "string" ? o.gprStage : null) ||
    "";
  if (!id) return null;

  const itemCodeRaw = typeof o.itemCode === "string" ? o.itemCode.trim() : "";
  const sourceCode =
    typeof o.sourceCode === "string" ? o.sourceCode.trim() : itemCodeRaw;
  const sourceRowNumber =
    typeof o.sourceRowNumber === "number" && Number.isFinite(o.sourceRowNumber)
      ? o.sourceRowNumber
      : 0;

  const deliveryPlanDate =
    coerceIsoNullable(o.deliveryPlanDate) ??
    coerceIsoNullable(o.supplyPlanDate) ??
    coerceIsoNullable(o.planDate);
  const deliveryFactDate =
    coerceIsoNullable(o.deliveryFactDate) ??
    coerceIsoNullable(o.supplyFactDate) ??
    coerceIsoNullable(o.factDate);
  const contractPlanDate = coerceIsoNullable(o.contractPlanDate);
  const contractFactDate = coerceIsoNullable(o.contractFactDate);

  const plannedQuantity =
    coerceFiniteNumberOrNull(o.plannedQuantity) ??
    (Object.prototype.hasOwnProperty.call(o, "volumePlan")
      ? coerceFiniteNumberOrNull(o.volumePlan)
      : null);
  const actualQuantity =
    coerceFiniteNumberOrNull(o.actualQuantity) ??
    (Object.prototype.hasOwnProperty.call(o, "volumeFact")
      ? coerceFiniteNumberOrNull(o.volumeFact)
      : null);

  const statusRaw =
    typeof o.statusRaw === "string"
      ? o.statusRaw
      : typeof o.status === "string"
        ? o.status
        : "";
  const statusCategory =
    o.statusCategory === "delivered" ||
    o.statusCategory === "partial" ||
    o.statusCategory === "plan" ||
    o.statusCategory === "no_fact"
      ? o.statusCategory
      : categorizeTmcStatus(statusRaw);

  const rowKind: TmcRowKind =
    o.rowKind === "section" ||
    o.rowKind === "group" ||
    o.rowKind === "position" ||
    o.rowKind === "other"
      ? o.rowKind
      : name.trim()
        ? "position"
        : isTmcWbsCode(sourceCode || itemCodeRaw)
          ? "group"
          : "other";

  const projectPart: ProjectPartKey =
    o.projectPart === "parking" || o.projectPart === "residential"
      ? o.projectPart
      : "residential";

  const draft: TMCItem = {
    id,
    sourceRowNumber,
    sourceCode,
    itemCode: itemCodeRaw || sourceCode || id,
    rowKind,
    parentWbsCode: typeof o.parentWbsCode === "string" ? o.parentWbsCode : null,
    stage,
    gprStage: stage,
    name,
    gprStartDate: coerceIsoNullable(o.gprStartDate),
    orderDeadlineDays: coerceFiniteNumberOrNull(o.orderDeadlineDays),
    requestPlanDate: coerceIsoNullable(o.requestPlanDate),
    requestFactDate: coerceIsoNullable(o.requestFactDate),
    requestDeviationDays: coerceFiniteNumberOrNull(o.requestDeviationDays),
    contractLeadTimeDays: coerceFiniteNumberOrNull(o.contractLeadTimeDays),
    contractPlanDate,
    contractFactDate,
    contractDeviationDays: coerceFiniteNumberOrNull(o.contractDeviationDays),
    deliveryPlanDate,
    deliveryFactDate,
    deliveryDeviationDays: coerceFiniteNumberOrNull(o.deliveryDeviationDays),
    contractDate2PlanDate: coerceIsoNullable(o.contractDate2PlanDate),
    contractDate2FactDate: coerceIsoNullable(o.contractDate2FactDate),
    contractDate2DeviationDays: coerceFiniteNumberOrNull(o.contractDate2DeviationDays),
    unit: typeof o.unit === "string" ? o.unit.trim() : "",
    plannedQuantity,
    actualQuantity,
    quantityDeviation: coerceFiniteNumberOrNull(o.quantityDeviation),
    supplier: typeof o.supplier === "string" ? o.supplier.trim() : "",
    contract: typeof o.contract === "string" ? o.contract.trim() : "",
    statusRaw,
    statusCategory,
    status: parseTmcSupplyStatus(statusRaw || statusCategory),
    comment: typeof o.comment === "string" ? o.comment : "",
    projectPart,
    volumePlan: plannedQuantity ?? coerceFiniteNumber(o.volumePlan),
    volumeFact: actualQuantity ?? coerceFiniteNumber(o.volumeFact),
    supplyPlanDate: deliveryPlanDate,
    supplyFactDate: deliveryFactDate,
    ...emptyCompatMoney(),
  };

  return syncTmcFinancials(draft);
}

export function createEmptyTmcItem(
  projectPart: ProjectPartKey,
  overrides: Partial<TMCItem> = {},
): TMCItem {
  const stage = overrides.stage || overrides.gprStage || "";
  const name = overrides.name || "";
  const sourceCode = overrides.sourceCode ?? overrides.itemCode ?? "";
  const sourceRowNumber = overrides.sourceRowNumber ?? Date.now();
  const id =
    overrides.id ||
    buildStableTmcId({ projectPart, sourceRowNumber, sourceCode, stage, name });
  const base: TMCItem = {
    id,
    sourceRowNumber,
    sourceCode,
    itemCode: overrides.itemCode || sourceCode,
    rowKind: "position",
    parentWbsCode: null,
    stage,
    gprStage: stage,
    name,
    gprStartDate: null,
    orderDeadlineDays: null,
    requestPlanDate: null,
    requestFactDate: null,
    requestDeviationDays: null,
    contractLeadTimeDays: null,
    contractPlanDate: null,
    contractFactDate: null,
    contractDeviationDays: null,
    deliveryPlanDate: null,
    deliveryFactDate: null,
    deliveryDeviationDays: null,
    contractDate2PlanDate: null,
    contractDate2FactDate: null,
    contractDate2DeviationDays: null,
    unit: "",
    plannedQuantity: null,
    actualQuantity: null,
    quantityDeviation: null,
    supplier: "",
    contract: "",
    statusRaw: "",
    statusCategory: "no_fact",
    status: "план",
    comment: "",
    projectPart,
    volumePlan: 0,
    volumeFact: 0,
    supplyPlanDate: null,
    supplyFactDate: null,
    ...emptyCompatMoney(),
  };
  return syncTmcFinancials({ ...base, ...overrides, id, projectPart: overrides.projectPart ?? projectPart });
}

export { buildStableTmcId };

export function mergeTmcSnapshotWithSeed(stored: unknown): TMCItem[] {
  if (!Array.isArray(stored)) return [...TMC_DATA];
  const out: TMCItem[] = [];
  for (const row of stored) {
    const n = normalizeTmcRowLoose(row);
    if (n) out.push(n);
  }
  return out.length > 0 ? out : [...TMC_DATA];
}

export const LEGACY_TMC_STORAGE_KEY = "gordo_tmc_snapshot";

export function tmcStorageKey(projectId: string): string {
  return `tmc_${projectId}`;
}

export function readTmcSnapshotFromStorage(projectId: string = getGprProjectId()): unknown {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(tmcStorageKey(projectId));
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function writeTmcSnapshotToStorage(projectId: string, items: TMCItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(tmcStorageKey(projectId), JSON.stringify(items));
  } catch (e) {
    console.warn("[TMC] writeTmcSnapshotToStorage failed", e);
  }
}

export function loadTmcInitialItems(projectId: string): TMCItem[] {
  return mergeTmcSnapshotWithSeed(readTmcSnapshotFromStorage(projectId));
}
