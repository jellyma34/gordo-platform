import type { ProjectPartKey } from "@/lib/gprUtils";
import type { TMCItem } from "@/lib/tmcData";

export type TmcImportDiffStats = {
  total: number;
  added: number;
  updated: number;
  unchanged: number;
  skippedInvalid: number;
};

function normalizeNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Устойчивое сравнение позиции ТМЦ для импорта. */
export function tmcComparableFingerprint(t: TMCItem): string {
  return JSON.stringify({
    id: String(t.id ?? "").trim(),
    sourceRowNumber: t.sourceRowNumber ?? 0,
    rowNo: t.rowNo ?? null,
    sourceCode: String(t.sourceCode ?? "").trim(),
    itemCode: String(t.itemCode ?? "").trim(),
    rowKind: t.rowKind,
    name: String(t.name ?? "").trim(),
    stage: String(t.stage ?? t.gprStage ?? "").trim(),
    unit: String(t.unit ?? "").trim(),
    plannedQuantity: t.plannedQuantity ?? null,
    actualQuantity: t.actualQuantity ?? null,
    quantityDeviation: t.quantityDeviation ?? null,
    supplier: String(t.supplier ?? "").trim(),
    contract: String(t.contract ?? "").trim(),
    statusRaw: String(t.statusRaw ?? "").trim(),
    statusCategory: t.statusCategory,
    gprStartDate: t.gprStartDate ?? null,
    orderDeadlineDays: t.orderDeadlineDays ?? null,
    requestPlanDate: t.requestPlanDate ?? null,
    requestFactDate: t.requestFactDate ?? null,
    requestDeviationDays: t.requestDeviationDays ?? null,
    contractLeadTimeDays: t.contractLeadTimeDays ?? null,
    contractPlanDate: t.contractPlanDate ?? null,
    contractFactDate: t.contractFactDate ?? null,
    contractDeviationDays: t.contractDeviationDays ?? null,
    deliveryPlanDate: t.deliveryPlanDate ?? t.supplyPlanDate ?? null,
    deliveryFactDate: t.deliveryFactDate ?? t.supplyFactDate ?? null,
    deliveryDeviationDays: t.deliveryDeviationDays ?? null,
    contractDate2PlanDate: t.contractDate2PlanDate ?? null,
    contractDate2FactDate: t.contractDate2FactDate ?? null,
    contractDate2DeviationDays: t.contractDate2DeviationDays ?? null,
    comment: String(t.comment ?? "").trim(),
    projectPart: (t.projectPart ?? "residential") as ProjectPartKey,
  });
}

type PoolEntry = { t: TMCItem; used: boolean };

/**
 * Реестр после импорта полностью задаётся строками CSV (`newData`).
 * Сопоставление: id → sourceRowNumber+part → код+имя → имя.
 */
export function diffTmcImport(
  oldData: TMCItem[],
  newData: TMCItem[],
  parsedCsvRowCount?: number,
): { result: TMCItem[]; stats: TmcImportDiffStats } {
  const pool: PoolEntry[] = oldData.map((t) => ({ t, used: false }));

  function takeMatch(candidate: TMCItem): TMCItem | null {
    const id = candidate.id?.trim();
    if (id) {
      const hit = pool.find((p) => !p.used && p.t.id === id);
      if (hit) {
        hit.used = true;
        return hit.t;
      }
    }
    if (candidate.sourceRowNumber > 0) {
      const hit = pool.find(
        (p) =>
          !p.used &&
          p.t.sourceRowNumber === candidate.sourceRowNumber &&
          p.t.projectPart === candidate.projectPart,
      );
      if (hit) {
        hit.used = true;
        return hit.t;
      }
    }
    const code = candidate.sourceCode?.trim() || candidate.itemCode?.trim();
    const nk = normalizeNameKey(candidate.name);
    if (code && code !== "-" && code !== "?" && nk) {
      const hit = pool.find(
        (p) =>
          !p.used &&
          (p.t.sourceCode?.trim() || p.t.itemCode?.trim()) === code &&
          normalizeNameKey(p.t.name) === nk &&
          p.t.projectPart === candidate.projectPart,
      );
      if (hit) {
        hit.used = true;
        return hit.t;
      }
    }
    if (nk) {
      const hit = pool.find(
        (p) =>
          !p.used &&
          normalizeNameKey(p.t.name) === nk &&
          p.t.projectPart === candidate.projectPart,
      );
      if (hit) {
        hit.used = true;
        return hit.t;
      }
    }
    return null;
  }

  let added = 0;
  let updated = 0;
  let unchanged = 0;

  const result: TMCItem[] = [];

  for (const item of newData) {
    const existing = takeMatch(item);
    if (!existing) {
      added++;
      result.push(item);
      continue;
    }
    if (tmcComparableFingerprint(existing) === tmcComparableFingerprint(item)) {
      unchanged++;
      result.push(existing);
    } else {
      updated++;
      result.push(item);
    }
  }

  const skippedInvalid =
    parsedCsvRowCount != null ? Math.max(0, parsedCsvRowCount - newData.length) : 0;

  return {
    result,
    stats: {
      total: result.length,
      added,
      updated,
      unchanged,
      skippedInvalid,
    },
  };
}
