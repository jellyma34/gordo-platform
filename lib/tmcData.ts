import { gprCodeToNumericSegments, type ProjectPartKey } from "./gprUtils";
import { getGprProjectId } from "@/lib/gprImportPersistence";

export type TMCItem = {
  id: string;
  /** Иерархический код позиции (как шифр ГПР). */
  itemCode: string;
  name: string;
  gprStage: string;
  planCost: number;
  factCost: number | null;
  planStart: string | null;
  planEnd: string | null;
  factStart: string | null;
  factEnd: string | null;
  /** Часть проекта: жилой дом или автостоянка. */
  projectPart: ProjectPartKey;
};

/** Корневой шифр этапа по подписи из справочника ТМЦ. */
export const TMC_GPR_STAGE_ROOT_CODE: Record<string, string> = {
  "Подготовка территории": "2.04",
  "Строительство зданий и сооружений": "2.05",
  "Устройство сетей": "2.06",
  "Благоустройство": "2.07",
};

export function tmcPlanReferenceDate(item: TMCItem): string | null {
  return item.planStart?.trim() || item.planEnd?.trim() || null;
}

export function tmcFactReferenceDate(item: TMCItem): string | null {
  return item.factEnd?.trim() || item.factStart?.trim() || null;
}

export function tmcLifecycleLabel(item: TMCItem): string {
  const hasPlan = Boolean(tmcPlanReferenceDate(item));
  const hasFact = Boolean(tmcFactReferenceDate(item));
  if (!hasPlan) return "Не запланировано";
  if (!hasFact) return "Не начато";
  if (item.factCost != null && item.planCost > 0 && item.factCost >= item.planCost) return "Завершено";
  return "В работе";
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
    planCost: 4_200_000,
    factCost: 3_980_000,
    planStart: "2025-09-10",
    planEnd: null,
    factStart: null,
    factEnd: "2025-09-08",
  },
  {
    id: "tmc-02",
    itemCode: "2.05.02.1",
    name: "Цемент М500",
    gprStage: "Строительство зданий и сооружений",
    planCost: 2_500_000,
    factCost: 2_710_000,
    planStart: "2025-10-01",
    planEnd: null,
    factStart: null,
    factEnd: "2025-10-12",
  },
  {
    id: "tmc-03",
    itemCode: "2.06.01.1",
    name: "Кабель силовой ВВГнг 4x95",
    gprStage: "Устройство сетей",
    planCost: 3_100_000,
    factCost: 3_550_000,
    planStart: "2025-11-05",
    planEnd: null,
    factStart: null,
    factEnd: "2025-11-28",
  },
  {
    id: "tmc-04",
    itemCode: "2.06.02.1",
    name: "Трубы ПНД 315 мм",
    gprStage: "Устройство сетей",
    planCost: 2_800_000,
    factCost: null,
    planStart: "2025-11-20",
    planEnd: null,
    factStart: null,
    factEnd: null,
  },
  {
    id: "tmc-05",
    itemCode: "2.07.01.1",
    name: "Бордюрный камень",
    gprStage: "Благоустройство",
    planCost: 980_000,
    factCost: 940_000,
    planStart: "2026-04-12",
    planEnd: null,
    factStart: null,
    factEnd: "2026-04-10",
  },
  {
    id: "tmc-06",
    itemCode: "2.07.02.1",
    name: "Тротуарная плитка",
    gprStage: "Благоустройство",
    planCost: 1_670_000,
    factCost: 1_695_000,
    planStart: "2026-04-25",
    planEnd: null,
    factStart: null,
    factEnd: "2026-05-03",
  },
  {
    id: "tmc-07",
    itemCode: "2.04.01.1",
    name: "Щебень фракции 20-40",
    gprStage: "Подготовка территории",
    planCost: 1_250_000,
    factCost: 1_210_000,
    planStart: "2025-08-15",
    planEnd: null,
    factStart: null,
    factEnd: "2025-08-14",
  },
  {
    id: "tmc-08",
    itemCode: "2.04.02.1",
    name: "Песок карьерный",
    gprStage: "Подготовка территории",
    planCost: 890_000,
    factCost: null,
    planStart: "2025-08-20",
    planEnd: null,
    factStart: null,
    factEnd: null,
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
    return { ...row, factCost: 1_400_000, factEnd: "2025-11-25" };
  }
  if (row.id === "tmc-p-08") {
    return { ...row, factCost: 600_000, factEnd: "2025-08-18" };
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

function coerceIsoNullable(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
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

  const planStart = coerceIsoNullable(o.planStart) ?? (legacyPlan && /^\d{4}-\d{2}-\d{2}$/.test(legacyPlan) ? legacyPlan : null);
  const planEnd = coerceIsoNullable(o.planEnd);
  const factStart = coerceIsoNullable(o.factStart);
  const factEnd = coerceIsoNullable(o.factEnd) ?? legacyFact;

  if (!id || !name || !gprStage) return null;

  const itemCode =
    itemCodeRaw ||
    (id.startsWith("tmc-p-")
      ? `2.05.99.${id.replace("tmc-p-", "")}`
      : `2.05.99.${id.replace("tmc-", "")}`);

  const planCost = typeof o.planCost === "number" ? o.planCost : Number(o.planCost) || 0;
  const factCost =
    o.factCost === null || o.factCost === undefined
      ? null
      : typeof o.factCost === "number"
        ? o.factCost
        : Number(o.factCost) || 0;

  const projectPart: ProjectPartKey =
    o.projectPart === "parking" || o.projectPart === "residential" ? o.projectPart : "residential";

  return {
    id,
    itemCode,
    name,
    gprStage,
    planCost,
    factCost,
    planStart,
    planEnd,
    factStart,
    factEnd,
    projectPart,
  };
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
