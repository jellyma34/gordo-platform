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

/** Устойчивое сравнение позиции ТМЦ для импорта (без ссылки на объект). */
export function tmcComparableFingerprint(t: TMCItem): string {
  return JSON.stringify({
    id: String(t.id ?? "").trim(),
    itemCode: String(t.itemCode ?? "").trim(),
    name: String(t.name ?? "").trim(),
    gprStage: String(t.gprStage ?? "").trim(),
    planCost: t.planCost ?? 0,
    factCost: t.factCost ?? null,
    planStart: t.planStart ?? null,
    planEnd: t.planEnd ?? null,
    factStart: t.factStart ?? null,
    factEnd: t.factEnd ?? null,
    projectPart: (t.projectPart ?? "residential") as ProjectPartKey,
  });
}

type PoolEntry = { t: TMCItem; used: boolean };

/**
 * Реестр после импорта полностью задаётся строками CSV (`newData`).
 * Сопоставление: сначала по `id`, иначе по нормализованному наименованию.
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
    const nk = normalizeNameKey(candidate.name);
    if (nk) {
      const hit = pool.find((p) => !p.used && normalizeNameKey(p.t.name) === nk);
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
      total: newData.length,
      added,
      updated,
      unchanged,
      skippedInvalid,
    },
  };
}
