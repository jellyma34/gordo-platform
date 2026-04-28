import { compareGprCodesByNumericPath, daysBetween } from "@/lib/gprUtils";
import { getGprProjectId } from "@/lib/gprImportPersistence";

/**
 * Реестр тендеров (таблица из PDF закупок услуг).
 * Коды и наименования работ синхронизированы со справочником GPR (`gprData.ts`);
 * суммы и даты по позициям 2.05.05.1 и 2.05.06.1 — как в исходной таблице тендеров проекта.
 */
export type TenderProcurementStatus = "planned" | "in_progress" | "completed" | "delayed";

export type Tender = {
  id: string;
  /** Часть проекта: 1 — жилой дом, 2 — автостоянка (как у ГПР/ТМЦ). */
  partId: number;
  code: string;
  name: string;
  /** Этап ГПР (корневой код): 2.04, 2.05, 2.06, 2.07 */
  stage: string;
  /** План: начало работ (может отсутствовать). */
  planStart: string | null;
  factStart?: string | null;
  /** План: дата договора (может отсутствовать). */
  planContractDate: string | null;
  factContractDate?: string | null;
  cost?: number;
  contractor?: string;
  status?: TenderProcurementStatus;
  comment?: string;
};

export type TenderTraffic = "green" | "yellow" | "red" | "gray";

/** Подписи этапов для аналитики «стоимость по этапам». */
export const TENDER_STAGE_CHART_LABEL: Record<string, string> = {
  "2.04": "2.04 — подготовка",
  "2.05": "2.05 — здание",
  "2.06": "2.06 — сети",
  "2.07": "2.07 — благоустройство",
};

export function inferPartIdFromStage(stage: string): number {
  if (stage.startsWith("2.06") || stage.startsWith("2.07")) return 2;
  return 1;
}

/** Отклонение по договору: факт − план (дней). Положительное — просрочка заключения. */
export function contractDeviationDays(t: Tender): number | null {
  const pc = t.planContractDate?.trim();
  const fc = t.factContractDate?.trim();
  if (!pc || !fc) return null;
  const d = daysBetween(pc, fc);
  return Number.isFinite(d) ? d : null;
}

/** Жизненный цикл закупки по датам (не путать со «светофором» договора). */
export function tenderLifecycleLabel(t: Tender): string {
  const hasPlan = Boolean(t.planStart?.trim() || t.planContractDate?.trim());
  const hasFact = Boolean(t.factStart?.trim() || t.factContractDate?.trim());
  if (!hasPlan) return "Не запланировано";
  if (!hasFact) return "Не начато";
  if (t.status === "completed") return "Завершено";
  return "В работе";
}

/** Синоним ТЗ: отклонение даты договора (факт − план), дни. */
export function getTenderDeviation(t: Tender): number | null {
  return contractDeviationDays(t);
}

/**
 * Корневой этап ГПР из кода работы (тендер или задача ГПР): «2.05.05.1» → «2.05».
 * Только разбор строки кода, без справочников.
 */
export function getGprStageFromTenderCode(code: string): string | null {
  const parts = code.split(".").filter((p) => p.length > 0);
  if (parts.length < 2) return null;
  return `${parts[0]}.${parts[1]}`;
}

/**
 * Доля тендеров этапа с подписанным договором (по коду работы → корень 2.xx).
 * @param stageCode — корневой код этапа ГПР, напр. «2.05»
 */
export function getTenderReadiness(stageCode: string, tenders: Tender[]): number | null {
  const stageTenders = tenders.filter((t) => getGprStageFromTenderCode(t.code) === stageCode);
  if (stageTenders.length === 0) return null;
  const completed = stageTenders.filter((t) => t.factContractDate);
  return Math.round((completed.length / stageTenders.length) * 100);
}

export type GprRiskFromTendersResult = {
  delayed: number;
  risk: number;
  total: number;
};

/** Отставание: >14 дн.; риск: 1…14 дн. (есть факт договора). Без факта договора не учитываются. */
export function getGprRiskFromTenders(tenders: Tender[], stage: string): GprRiskFromTendersResult {
  const stageTenders = tenders.filter((t) => getGprStageFromTenderCode(t.code) === stage);
  let delayed = 0;
  let risk = 0;
  for (const t of stageTenders) {
    const d = contractDeviationDays(t);
    if (d === null) continue;
    if (d > 14) delayed += 1;
    else if (d > 0) risk += 1;
  }
  return { delayed, risk, total: stageTenders.length };
}

export type TenderStageInsight = {
  stage: string;
  delayed: number;
  risk: number;
  examples: string[];
  maxPositiveDeviation: number | null;
};

function tenderDeviationExampleLine(t: Tender, d: number): string {
  const n = Math.abs(d);
  let unit = "дней";
  if (n % 10 === 1 && n % 100 !== 11) unit = "день";
  else if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) unit = "дня";
  return `${t.name} — +${d} ${unit}`;
}

/** Данные для tooltip и оверлея ГПР по этапу (все тендеры с тем же корневым кодом, что из `t.code`). */
export function buildTenderStageInsight(tenders: Tender[], stage: string): TenderStageInsight {
  const stageTenders = tenders.filter((t) => getGprStageFromTenderCode(t.code) === stage);
  const positive = stageTenders
    .map((t) => ({ t, d: contractDeviationDays(t) }))
    .filter((x): x is { t: Tender; d: number } => x.d !== null && x.d > 0);

  let delayed = 0;
  let risk = 0;
  let maxPos = 0;
  for (const { d } of positive) {
    if (d > maxPos) maxPos = d;
    if (d > 14) delayed += 1;
    else risk += 1;
  }

  const examples = [...positive]
    .sort((a, b) => b.d - a.d)
    .slice(0, 6)
    .map(({ t, d }) => tenderDeviationExampleLine(t, d));

  return {
    stage,
    delayed,
    risk,
    examples,
    maxPositiveDeviation: positive.length ? maxPos : null,
  };
}

/** Есть ли по этапу тендеры с положительным отклонением договора (риск или отставание). */
export function tenderStageHasContractRisk(tenders: Tender[], stage: string): boolean {
  const { delayed, risk } = buildTenderStageInsight(tenders, stage);
  return delayed > 0 || risk > 0;
}

/** Сортировка кодов этапов / шифров ГПР по числовым сегментам (родитель раньше потомка). */
export function compareGprStageCodes(a: string, b: string): number {
  return compareGprCodesByNumericPath(a, b);
}

/**
 * Подсветка по договору: в срок (≤0), риск (1…14 дн.), отставание (>14), нет факта — серый.
 */
export function tenderTrafficFromContract(t: Tender): TenderTraffic {
  const d = contractDeviationDays(t);
  if (d === null) return "gray";
  if (d <= 0) return "green";
  if (d <= 14) return "yellow";
  return "red";
}

export function tenderTrafficLabel(traffic: TenderTraffic): string {
  if (traffic === "green") return "В срок";
  if (traffic === "yellow") return "Риск";
  if (traffic === "red") return "Отставание";
  return "Нет договора";
}

/** @deprecated Используйте {@link tendersStorageKey} */
export const LEGACY_TENDER_STORAGE_KEY = "gordo_tenders_snapshot";

export function tendersStorageKey(projectId: string): string {
  return `tenders_${projectId}`;
}

export const TENDER_DATA: Tender[] = [
  {
    id: "tender-205051",
    partId: 1,
    code: "2.05.05.1",
    name: "Облицовка стен фасада кирпичом",
    stage: "2.05",
    planStart: "2026-04-02",
    planContractDate: "2026-06-01",
    cost: 23_513_403,
    status: "planned",
    comment: "Тендер в плане",
  },
  {
    id: "tender-205061",
    partId: 1,
    code: "2.05.06.1",
    name: "Устройство кирпичных перегородок и вент. шахт",
    stage: "2.05",
    planStart: "2026-03-02",
    factStart: "2026-03-05",
    planContractDate: "2026-04-01",
    factContractDate: "2026-04-10",
    cost: 15_467_400,
    contractor: "ООО «СтройКирпич»",
    status: "in_progress",
    comment: "Заключение договора с отклонением от плана",
  },
  {
    id: "tender-205011",
    partId: 1,
    code: "2.05.01.1",
    name: "Устройство котлована",
    stage: "2.05",
    planStart: "2025-09-18",
    factStart: "2025-09-19",
    planContractDate: "2025-10-25",
    factContractDate: "2025-10-22",
    cost: 8_920_000,
    contractor: "ООО «ГеоСтрой»",
    status: "completed",
  },
  {
    id: "tender-205012",
    partId: 1,
    code: "2.05.01.2",
    name: "Отсыпка и уплотнение основания фундамента",
    stage: "2.05",
    planStart: "2025-10-05",
    factStart: "2025-10-04",
    planContractDate: "2025-10-20",
    factContractDate: "2025-10-19",
    cost: 3_180_000,
    status: "completed",
  },
  {
    id: "tender-205022",
    partId: 1,
    code: "2.05.02.2",
    name: "Устройство фундамента",
    stage: "2.05",
    planStart: "2025-10-22",
    factStart: "2025-10-22",
    planContractDate: "2025-11-12",
    factContractDate: "2025-11-20",
    cost: 44_800_000,
    contractor: "ООО «МонолитИнвест»",
    status: "completed",
    comment: "Договор подписан с небольшой задержкой",
  },
  {
    id: "tender-205042",
    partId: 1,
    code: "2.05.04.2",
    name: "Монолитные конструкции",
    stage: "2.05",
    planStart: "2026-03-01",
    planContractDate: "2026-05-01",
    cost: 118_500_000,
    status: "in_progress",
    comment: "Ожидается подписание",
  },
  {
    id: "tender-20502",
    partId: 1,
    code: "2.05.02",
    name: "Железобетонные конструкции ниже 0.000",
    stage: "2.05",
    planStart: "2025-10-01",
    planContractDate: "2026-01-15",
    factContractDate: "2026-02-22",
    cost: 96_200_000,
    status: "delayed",
    comment: "Сдвиг из-за согласования КЖ",
  },
  {
    id: "tender-20401",
    partId: 1,
    code: "2.04.01",
    name: "Снос зданий и сооружений, вырубка деревьев",
    stage: "2.04",
    planStart: "2025-07-02",
    factStart: "2025-07-02",
    planContractDate: "2025-07-10",
    factContractDate: "2025-07-08",
    cost: 18_200_000,
    status: "completed",
  },
  {
    id: "tender-20403",
    partId: 1,
    code: "2.04.03",
    name: "Вынос сетей",
    stage: "2.04",
    planStart: "2025-08-01",
    planContractDate: "2025-09-15",
    cost: 11_750_000,
    status: "planned",
  },
  {
    id: "tender-20404",
    partId: 1,
    code: "2.04.04",
    name: "Устройство площадки строительства",
    stage: "2.04",
    planStart: "2025-07-01",
    factStart: "2025-07-01",
    planContractDate: "2025-10-25",
    factContractDate: "2025-10-30",
    cost: 7_950_000,
    status: "completed",
  },
  {
    id: "tender-20601",
    partId: 2,
    code: "2.06.01",
    name: "Тепловые сети",
    stage: "2.06",
    planStart: "2025-09-05",
    factStart: "2025-09-05",
    planContractDate: "2025-12-01",
    factContractDate: "2025-12-01",
    cost: 66_800_000,
    contractor: "ООО «ТеплоСеть»",
    status: "completed",
  },
  {
    id: "tender-20602",
    partId: 2,
    code: "2.06.02",
    name: "Водоснабжение и канализация",
    stage: "2.06",
    planStart: "2026-05-01",
    planContractDate: "2026-06-01",
    cost: 41_200_000,
    status: "planned",
  },
  {
    id: "tender-20701",
    partId: 2,
    code: "2.07.01",
    name: "Планировка территории",
    stage: "2.07",
    planStart: "2027-05-01",
    planContractDate: "2027-05-20",
    cost: 14_600_000,
    status: "planned",
  },
  {
    id: "tender-20705",
    partId: 2,
    code: "2.07.05",
    name: "Озеленение",
    stage: "2.07",
    planStart: "2027-05-01",
    planContractDate: "2027-06-10",
    cost: 9_400_000,
    status: "planned",
  },
  {
    id: "tender-20505",
    partId: 1,
    code: "2.05.05",
    name: "Фасад",
    stage: "2.05",
    planStart: "2026-02-01",
    planContractDate: "2026-05-15",
    factContractDate: "2026-05-10",
    cost: 8_900_000,
    status: "completed",
    comment: "Рамочный договор на этап фасадных работ",
  },
];

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function coerceIsoOrNull(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Нормализация сохранённого объекта / импорта в `Tender`. */
export function coerceTender(row: Record<string, unknown>): Tender | null {
  const id = row.id;
  const code = row.code;
  const name = row.name;
  if (typeof id !== "string" || typeof code !== "string" || typeof name !== "string") {
    return null;
  }
  const planStart = coerceIsoOrNull(row.planStart);
  const planContractDate = coerceIsoOrNull(row.planContractDate);
  const stageRaw = typeof row.stage === "string" ? row.stage.trim() : "";
  const stage = stageRaw || getGprStageFromTenderCode(code) || "";
  if (!stage) return null;
  const partId = typeof row.partId === "number" && Number.isFinite(row.partId) ? row.partId : inferPartIdFromStage(stage);
  const factStartRaw = row.factStart;
  const factContractRaw = row.factContractDate;
  const factStart =
    factStartRaw === null || factStartRaw === undefined || factStartRaw === ""
      ? undefined
      : coerceIsoOrNull(factStartRaw) ?? undefined;
  const factContractDate =
    factContractRaw === null || factContractRaw === undefined || factContractRaw === ""
      ? undefined
      : coerceIsoOrNull(factContractRaw) ?? undefined;
  const cost = typeof row.cost === "number" && Number.isFinite(row.cost) ? row.cost : undefined;
  const contractor = typeof row.contractor === "string" ? row.contractor : undefined;
  const comment = typeof row.comment === "string" ? row.comment : undefined;
  const st = row.status;
  const status =
    st === "planned" || st === "in_progress" || st === "completed" || st === "delayed" ? st : undefined;
  return {
    id,
    partId,
    code,
    name,
    stage,
    planStart,
    factStart,
    planContractDate,
    factContractDate,
    cost,
    contractor,
    status,
    comment,
  };
}

/** Объединяет снимок из localStorage с эталоном: невалидный снимок → seed. */
export function mergeTenderSnapshotWithSeed(snapshot: unknown): Tender[] {
  if (!Array.isArray(snapshot)) return TENDER_DATA.map((t) => ({ ...t }));
  const parsed = snapshot.map((x) => (isRecord(x) ? coerceTender(x) : null)).filter((x): x is Tender => x !== null);
  return parsed.length > 0 ? parsed : TENDER_DATA.map((t) => ({ ...t }));
}

export function readTenderSnapshotFromStorage(projectId: string = getGprProjectId()): unknown {
  if (typeof window === "undefined") return undefined;
  try {
    const primary = window.localStorage.getItem(tendersStorageKey(projectId));
    if (primary) return JSON.parse(primary) as unknown;
    const legacy = window.localStorage.getItem(LEGACY_TENDER_STORAGE_KEY);
    if (legacy) return JSON.parse(legacy) as unknown;
    return undefined;
  } catch {
    return undefined;
  }
}

export function writeTenderSnapshotToStorage(projectId: string, snapshot: Tender[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(tendersStorageKey(projectId), JSON.stringify(snapshot));
  } catch {
    /* ignore quota */
  }
}

