import type { ProjectPartKey } from "./gprUtils";

export type TMCItem = {
  id: string;
  name: string;
  gprStage: string;
  planCost: number;
  factCost: number | null;
  planDate: string;
  factDate: string | null;
  /** Часть проекта: жилой дом или автостоянка. */
  projectPart: ProjectPartKey;
};

const RESIDENTIAL_SEED: Omit<TMCItem, "projectPart">[] = [
  {
    id: "tmc-01",
    name: "Арматура А500С, 12 мм",
    gprStage: "Строительство зданий и сооружений",
    planCost: 4200000,
    factCost: 3980000,
    planDate: "2025-09-10",
    factDate: "2025-09-08",
  },
  {
    id: "tmc-02",
    name: "Цемент М500",
    gprStage: "Строительство зданий и сооружений",
    planCost: 2500000,
    factCost: 2710000,
    planDate: "2025-10-01",
    factDate: "2025-10-12",
  },
  {
    id: "tmc-03",
    name: "Кабель силовой ВВГнг 4x95",
    gprStage: "Устройство сетей",
    planCost: 3100000,
    factCost: 3550000,
    planDate: "2025-11-05",
    factDate: "2025-11-28",
  },
  {
    id: "tmc-04",
    name: "Трубы ПНД 315 мм",
    gprStage: "Устройство сетей",
    planCost: 2800000,
    factCost: null,
    planDate: "2025-11-20",
    factDate: null,
  },
  {
    id: "tmc-05",
    name: "Бордюрный камень",
    gprStage: "Благоустройство",
    planCost: 980000,
    factCost: 940000,
    planDate: "2026-04-12",
    factDate: "2026-04-10",
  },
  {
    id: "tmc-06",
    name: "Тротуарная плитка",
    gprStage: "Благоустройство",
    planCost: 1670000,
    factCost: 1695000,
    planDate: "2026-04-25",
    factDate: "2026-05-03",
  },
  {
    id: "tmc-07",
    name: "Щебень фракции 20-40",
    gprStage: "Подготовка территории",
    planCost: 1250000,
    factCost: 1210000,
    planDate: "2025-08-15",
    factDate: "2025-08-14",
  },
  {
    id: "tmc-08",
    name: "Песок карьерный",
    gprStage: "Подготовка территории",
    planCost: 890000,
    factCost: null,
    planDate: "2025-08-20",
    factDate: null,
  },
];

function withPart(rows: Omit<TMCItem, "projectPart">[], part: ProjectPartKey): TMCItem[] {
  return rows.map((r) => ({ ...r, projectPart: part }));
}

/** Позиции автостоянки — отдельные id; часть фактов отличается от жилого дома (график ГПР—ТМЦ визуально разный). */
const PARKING_SEED: Omit<TMCItem, "projectPart">[] = RESIDENTIAL_SEED.map((r) => ({
  ...r,
  id: `tmc-p-${r.id.replace("tmc-", "")}`,
})).map((row) => {
  if (row.id === "tmc-p-04") {
    return { ...row, factCost: 1_400_000, factDate: "2025-11-25" };
  }
  if (row.id === "tmc-p-08") {
    return { ...row, factCost: 600_000, factDate: "2025-08-18" };
  }
  return row;
});

/** Полный справочник ТМЦ по всем частям проекта. */
export const TMC_DATA: TMCItem[] = [
  ...withPart(RESIDENTIAL_SEED, "residential"),
  ...withPart(PARKING_SEED, "parking"),
];

/** Только ТМЦ выбранной части; без `projectPart` в данных считаем residential, для parking такие строки отбрасываем. */
export function filterTmcByProjectPart(
  items: TMCItem[],
  activeProjectPart: ProjectPartKey,
): TMCItem[] {
  return items.filter((item) => (item.projectPart ?? "residential") === activeProjectPart);
}

/** ТМЦ только выбранной части проекта (для графиков, таблиц, API-совместимой логики). */
export function getTmcData(projectPart: ProjectPartKey): TMCItem[] {
  return filterTmcByProjectPart(TMC_DATA, projectPart);
}

/** Разбор записи из localStorage; без `projectPart` → residential. */
export function normalizeTmcRowLoose(raw: unknown): TMCItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : null;
  const name = typeof o.name === "string" ? o.name : null;
  const gprStage = typeof o.gprStage === "string" ? o.gprStage : null;
  const planDate = typeof o.planDate === "string" ? o.planDate : null;
  if (!id || !name || !gprStage || !planDate) return null;
  const planCost = typeof o.planCost === "number" ? o.planCost : Number(o.planCost) || 0;
  const factCost =
    o.factCost === null || o.factCost === undefined
      ? null
      : typeof o.factCost === "number"
        ? o.factCost
        : Number(o.factCost) || 0;
  const factDate =
    o.factDate === null || o.factDate === undefined
      ? null
      : typeof o.factDate === "string"
        ? o.factDate
        : null;
  const projectPart: ProjectPartKey =
    o.projectPart === "parking" || o.projectPart === "residential" ? o.projectPart : "residential";
  return { id, name, gprStage, planCost, factCost, planDate, factDate, projectPart };
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
