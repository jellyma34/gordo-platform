import { gprCodeToNumericSegments, type ProjectPartKey } from "./gprUtils";
import { getGprProjectId } from "@/lib/gprImportPersistence";

/** Статус поставки по регламенту PDF / прайса. */
export type TmcSupplyStatus = "план" | "поставлено" | "частично";

export function parseTmcSupplyStatus(raw: unknown): TmcSupplyStatus {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!s) return "план";
  if (s.includes("поставлен") || s === "delivered") return "поставлено";
  if (s.includes("частич") || s === "partial") return "частично";
  if (s === "plan" || s.includes("план")) return "план";
  return "план";
}

export function computeTmcTotalsFromVolumes(
  volumePlan: number,
  pricePlan: number,
  volumeFact: number,
  priceFact: number,
): { totalPlan: number; totalFact: number } {
  return {
    totalPlan: volumePlan * pricePlan,
    totalFact: volumeFact * priceFact,
  };
}

export type TMCItem = {
  id: string;
  /** Иерархический код позиции (как шифр ГПР). */
  itemCode: string;
  name: string;
  gprStage: string;
  /** Единица измерения (кг, м³, шт). */
  unit: string;
  volumePlan: number;
  volumeFact: number;
  /** Цена за единицу, план / факт (руб.). */
  pricePlan: number;
  priceFact: number;
  /** Стоимость = объём × цена (руб.). */
  totalPlan: number;
  totalFact: number;
  /** Поставщик. */
  supplier: string;
  /** Номер / реквизиты договора (строка). */
  contract: string;
  /** Статус поставки по документам. */
  status: TmcSupplyStatus;
  planCost: number;
  factCost: number | null;
  /** Дата поставки по плану. */
  supplyPlanDate: string | null;
  /** Дата поставки по факту. */
  supplyFactDate: string | null;
  /** Дата договора по плану. */
  contractPlanDate: string | null;
  /** Дата договора по факту. */
  contractFactDate: string | null;
  /** Часть проекта: жилой дом или автостоянка. */
  projectPart: ProjectPartKey;
};

/**
 * Синхронизация сумм: при объём×цена > 0 берём произведение, иначе — сохранённые total* или legacy planCost/factCost.
 */
export function syncTmcFinancials(item: TMCItem): TMCItem {
  const mulPlan = item.volumePlan * item.pricePlan;
  const mulFact = item.volumeFact * item.priceFact;
  let totalPlan = mulPlan > 0 ? mulPlan : item.totalPlan > 0 ? item.totalPlan : item.planCost > 0 ? item.planCost : 0;
  let totalFact = mulFact > 0 ? mulFact : item.totalFact > 0 ? item.totalFact : item.factCost != null ? item.factCost : 0;
  const factCost = totalFact > 0 ? totalFact : null;
  return {
    ...item,
    totalPlan,
    totalFact,
    planCost: totalPlan,
    factCost,
  };
}

/** Корневой шифр этапа по подписи из справочника ТМЦ. */
export const TMC_GPR_STAGE_ROOT_CODE: Record<string, string> = {
  "Подготовка территории": "2.04",
  "Строительство зданий и сооружений": "2.05",
  "Устройство сетей": "2.06",
  "Благоустройство": "2.07",
};

export function tmcPlanReferenceDate(item: TMCItem): string | null {
  return item.supplyPlanDate?.trim() || item.contractPlanDate?.trim() || null;
}

export function tmcFactReferenceDate(item: TMCItem): string | null {
  return item.contractFactDate?.trim() || item.supplyFactDate?.trim() || null;
}

export function suggestNextTmcItemCode(items: TMCItem[], part: ProjectPartKey, gprStage: string): string {
  const root = TMC_GPR_STAGE_ROOT_CODE[gprStage] ?? "2.05";
  const rootSegs = gprCodeToNumericSegments(root);
  const siblings = items.filter(
    (x) => x.projectPart === part && x.gprStage === gprStage && x.itemCode.startsWith(`${root}.`),
  );
  let maxThird = 0;
  for (const s of siblings) {
    const segs = gprCodeToNumericSegments(s.itemCode);
    if (
      segs.length >= 3 &&
      segs[0] === rootSegs[0] &&
      segs[1] === rootSegs[1] &&
      segs[2] !== undefined
    ) {
      maxThird = Math.max(maxThird, segs[2]);
    }
  }
  const idx = maxThird + 1;
  return `${root}.${String(idx).padStart(2, "0")}.1`;
}

const RESIDENTIAL_SEED: Omit<TMCItem, "projectPart">[] = [
  {
    id: "tmc-01",
    itemCode: "2.05.01.1",
    name: "Арматура А500С, 12 мм",
    gprStage: "Строительство зданий и сооружений",
    ...seedVolumePricing(4_200_000, 3_980_000),
    planCost: 4_200_000,
    factCost: 3_980_000,
    supplyPlanDate: "2025-09-10",
    contractPlanDate: null,
    supplyFactDate: null,
    contractFactDate: "2025-09-08",
  },
  {
    id: "tmc-02",
    itemCode: "2.05.02.1",
    name: "Цемент М500",
    gprStage: "Строительство зданий и сооружений",
    ...seedVolumePricing(2_500_000, 2_710_000),
    planCost: 2_500_000,
    factCost: 2_710_000,
    supplyPlanDate: "2025-10-01",
    contractPlanDate: null,
    supplyFactDate: null,
    contractFactDate: "2025-10-12",
  },
  {
    id: "tmc-03",
    itemCode: "2.06.01.1",
    name: "Кабель силовой ВВГнг 4x95",
    gprStage: "Устройство сетей",
    ...seedVolumePricing(3_100_000, 3_550_000),
    planCost: 3_100_000,
    factCost: 3_550_000,
    supplyPlanDate: "2025-11-05",
    contractPlanDate: null,
    supplyFactDate: null,
    contractFactDate: "2025-11-28",
  },
  {
    id: "tmc-04",
    itemCode: "2.06.02.1",
    name: "Трубы ПНД 315 мм",
    gprStage: "Устройство сетей",
    ...seedVolumePricing(2_800_000, null),
    planCost: 2_800_000,
    factCost: null,
    supplyPlanDate: "2025-11-20",
    contractPlanDate: null,
    supplyFactDate: null,
    contractFactDate: null,
  },
  {
    id: "tmc-05",
    itemCode: "2.07.01.1",
    name: "Бордюрный камень",
    gprStage: "Благоустройство",
    ...seedVolumePricing(980_000, 940_000),
    planCost: 980_000,
    factCost: 940_000,
    supplyPlanDate: "2026-04-12",
    contractPlanDate: null,
    supplyFactDate: null,
    contractFactDate: "2026-04-10",
  },
  {
    id: "tmc-06",
    itemCode: "2.07.02.1",
    name: "Тротуарная плитка",
    gprStage: "Благоустройство",
    ...seedVolumePricing(1_670_000, 1_695_000),
    planCost: 1_670_000,
    factCost: 1_695_000,
    supplyPlanDate: "2026-04-25",
    contractPlanDate: null,
    supplyFactDate: null,
    contractFactDate: "2026-05-03",
  },
  {
    id: "tmc-07",
    itemCode: "2.04.01.1",
    name: "Щебень фракции 20-40",
    gprStage: "Подготовка территории",
    ...seedVolumePricing(1_250_000, 1_210_000),
    planCost: 1_250_000,
    factCost: 1_210_000,
    supplyPlanDate: "2025-08-15",
    contractPlanDate: null,
    supplyFactDate: null,
    contractFactDate: "2025-08-14",
  },
  {
    id: "tmc-08",
    itemCode: "2.04.02.1",
    name: "Песок карьерный",
    gprStage: "Подготовка территории",
    ...seedVolumePricing(890_000, null),
    planCost: 890_000,
    factCost: null,
    supplyPlanDate: "2025-08-20",
    contractPlanDate: null,
    supplyFactDate: null,
    contractFactDate: null,
  },
];

function withPart(rows: Omit<TMCItem, "projectPart">[], part: ProjectPartKey): TMCItem[] {
  return rows.map((r) => ({ ...r, projectPart: part }));
}

const PARKING_SEED: Omit<TMCItem, "projectPart">[] = RESIDENTIAL_SEED.map((r) => ({
  ...r,
  id: `tmc-p-${r.id.replace("tmc-", "")}`,
})).map((row) => {
  if (row.id === "tmc-p-04") {
    const fc = 1_400_000;
    return {
      ...row,
      ...seedVolumePricing(row.planCost, fc),
      factCost: fc,
      contractFactDate: "2025-11-25",
      planCost: row.planCost,
    };
  }
  if (row.id === "tmc-p-08") {
    const fc = 600_000;
    return {
      ...row,
      ...seedVolumePricing(row.planCost, fc),
      factCost: fc,
      contractFactDate: "2025-08-18",
      planCost: row.planCost,
    };
  }
  return row;
});

export const TMC_DATA: TMCItem[] = [
  ...withPart(RESIDENTIAL_SEED, "residential"),
  ...withPart(PARKING_SEED, "parking"),
];

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

function coerceIsoNullable(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Демо и импорт без дробления: 1 × цена = сумма строки. */
function seedVolumePricing(planCost: number, factCost: number | null) {
  const volumePlan = 1;
  const pricePlan = planCost;
  const volumeFact = factCost != null && factCost > 0 ? 1 : 0;
  const priceFact = factCost ?? 0;
  const totalPlan = volumePlan * pricePlan;
  const totalFact = volumeFact * priceFact;
  return {
    unit: "шт",
    volumePlan,
    volumeFact,
    pricePlan,
    priceFact,
    totalPlan,
    totalFact,
    supplier: "",
    contract: "",
    status: (factCost != null && factCost > 0 ? "поставлено" : "план") as TmcSupplyStatus,
  };
}

/** Разбор записи из localStorage; поддержка старых полей planDate / factDate. */
export function normalizeTmcRowLoose(raw: unknown): TMCItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : null;
  const name = typeof o.name === "string" ? o.name : null;
  const gprStage = typeof o.gprStage === "string" ? o.gprStage : null;
  const itemCodeRaw = typeof o.itemCode === "string" ? o.itemCode.trim() : "";
  const legacyPlan = typeof o.planDate === "string" ? o.planDate.trim() : null;
  const legacyFact = o.factDate === null || o.factDate === undefined ? null : coerceIsoNullable(o.factDate);

  const supplyPlanDate =
    coerceIsoNullable(o.supplyPlanDate) ??
    coerceIsoNullable(o.planStart) ??
    (legacyPlan && /^\d{4}-\d{2}-\d{2}$/.test(legacyPlan) ? legacyPlan : null);
  const contractPlanDate =
    coerceIsoNullable(o.contractPlanDate) ?? coerceIsoNullable(o.planEnd);
  const supplyFactDate =
    coerceIsoNullable(o.supplyFactDate) ?? coerceIsoNullable(o.factStart);
  const contractFactDate =
    coerceIsoNullable(o.contractFactDate) ?? coerceIsoNullable(o.factEnd) ?? legacyFact;

  if (!id || !name || !gprStage) return null;

  const itemCode =
    itemCodeRaw ||
    (id.startsWith("tmc-p-")
      ? `2.05.99.${id.replace("tmc-p-", "")}`
      : `2.05.99.${id.replace("tmc-", "")}`);

  let planCost = typeof o.planCost === "number" ? o.planCost : Number(o.planCost) || 0;
  let factCost =
    o.factCost === null || o.factCost === undefined
      ? null
      : typeof o.factCost === "number"
        ? o.factCost
        : Number(o.factCost) || 0;

  const projectPart: ProjectPartKey =
    o.projectPart === "parking" || o.projectPart === "residential" ? o.projectPart : "residential";

  const unit = typeof o.unit === "string" ? o.unit.trim() : "";
  let volumePlan = coerceFiniteNumber(o.volumePlan);
  let volumeFact = coerceFiniteNumber(o.volumeFact);
  let pricePlan = coerceFiniteNumber(o.pricePlan);
  let priceFact = coerceFiniteNumber(o.priceFact);
  let totalPlan = coerceFiniteNumber(o.totalPlan);
  let totalFact = coerceFiniteNumber(o.totalFact);

  const supplier = typeof o.supplier === "string" ? o.supplier.trim() : "";
  const contract = typeof o.contract === "string" ? o.contract.trim() : "";
  const status = parseTmcSupplyStatus(o.status);

  const legacySnapshot = !Object.prototype.hasOwnProperty.call(o, "volumePlan");
  if (legacySnapshot && planCost > 0 && volumePlan === 0 && pricePlan === 0) {
    volumePlan = 1;
    pricePlan = planCost;
  }
  if (legacySnapshot && factCost != null && factCost > 0 && volumeFact === 0 && priceFact === 0) {
    volumeFact = 1;
    priceFact = factCost;
  }

  const draft: TMCItem = {
    id,
    itemCode,
    name,
    gprStage,
    unit,
    volumePlan,
    volumeFact,
    pricePlan,
    priceFact,
    totalPlan,
    totalFact,
    supplier,
    contract,
    status,
    planCost,
    factCost,
    supplyPlanDate,
    contractPlanDate,
    supplyFactDate,
    contractFactDate,
    projectPart,
  };

  return syncTmcFinancials(draft);
}

export function mergeTmcSnapshotWithSeed(stored: unknown): TMCItem[] {
  const map = new Map(TMC_DATA.map((x) => [x.id, { ...x }]));
  if (!Array.isArray(stored)) return [...map.values()];
  for (const row of stored) {
    const n = normalizeTmcRowLoose(row);
    if (n) map.set(n.id, n);
  }
  return [...map.values()];
}

/** Старый ключ localStorage (слияние с seed). */
export const LEGACY_TMC_STORAGE_KEY = "gordo_tmc_snapshot";

export function tmcStorageKey(projectId: string): string {
  return `tmc_${projectId}`;
}

export function readTmcSnapshotFromStorage(projectId: string = getGprProjectId()): unknown {
  if (typeof window === "undefined") return undefined;
  try {
    const primary = window.localStorage.getItem(tmcStorageKey(projectId));
    if (primary) return JSON.parse(primary) as unknown;
    const legacy = window.localStorage.getItem(LEGACY_TMC_STORAGE_KEY);
    if (legacy) return JSON.parse(legacy) as unknown;
    return undefined;
  } catch {
    return undefined;
  }
}

export function writeTmcSnapshotToStorage(projectId: string, items: TMCItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(tmcStorageKey(projectId), JSON.stringify(items));
  } catch {
    /* quota */
  }
}

/**
 * Загрузка реестра ТМЦ: приоритет полного снимка `tmc_${projectId}`, иначе legacy + seed.
 */
export function loadTmcInitialItems(projectId: string): TMCItem[] {
  if (typeof window === "undefined") {
    return TMC_DATA.map((x) => ({ ...x }));
  }
  try {
    const rawNew = window.localStorage.getItem(tmcStorageKey(projectId));
    if (rawNew) {
      const parsed = JSON.parse(rawNew) as unknown;
      if (Array.isArray(parsed)) {
        const rows = parsed.map(normalizeTmcRowLoose).filter((x): x is TMCItem => x !== null);
        if (rows.length > 0) return rows;
      }
    }
    const rawLegacy = window.localStorage.getItem(LEGACY_TMC_STORAGE_KEY);
    const legacyParsed = rawLegacy ? (JSON.parse(rawLegacy) as unknown) : undefined;
    return mergeTmcSnapshotWithSeed(legacyParsed);
  } catch {
    return mergeTmcSnapshotWithSeed(undefined);
  }
}
