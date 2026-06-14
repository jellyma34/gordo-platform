import type { Tender } from "@/lib/tenderData";

export type TenderImportDiffStats = {
  /** Строк в файле после нормализации (итоговый реестр из CSV). */
  total: number;
  added: number;
  updated: number;
  unchanged: number;
  /** Строк CSV без обязательных полей / не прошедших нормализацию (оценка: строк в парсере − принято). */
  skippedInvalid: number;
};

function normalizeNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Устойчивое сравнение содержимого тендера (без ссылки на объект). */
export function tenderComparableFingerprint(t: Tender): string {
  return JSON.stringify({
    id: t.id,
    partId: t.partId,
    code: String(t.code ?? "").trim(),
    name: String(t.name ?? "").trim(),
    stage: String(t.stage ?? "").trim(),
    planStart: t.planStart ?? null,
    factStart: t.factStart ?? null,
    planContractDate: t.planContractDate ?? null,
    factContractDate: t.factContractDate ?? null,
    cost: t.cost ?? null,
    contractor: t.contractor ?? null,
    status: t.status ?? null,
    statusLabel: t.statusLabel ?? null,
    cycleStatus: t.cycleStatus ?? null,
    comment: t.comment ?? null,
  });
}

type PoolEntry = { t: Tender; used: boolean };

/**
 * Сопоставление строк импорта с текущим реестром:
 * 1) по `id`, если в новой строке есть id и он есть среди неиспользованных старых;
 * 2) иначе по нормализованному наименованию.
 *
 * Итог — только строки из `newData` (импорт полностью задаёт состав реестра).
 * Совпадение без изменений сохраняет ссылку на старый объект.
 */
export function diffTendersImport(
  oldData: Tender[],
  newData: Tender[],
  parsedCsvRowCount?: number,
): { result: Tender[]; stats: TenderImportDiffStats } {
  const pool: PoolEntry[] = oldData.map((t) => ({ t, used: false }));

  function takeMatch(candidate: Tender): Tender | null {
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

  const result: Tender[] = [];

  for (const item of newData) {
    const existing = takeMatch(item);
    if (!existing) {
      added++;
      result.push(item);
      continue;
    }
    if (tenderComparableFingerprint(existing) === tenderComparableFingerprint(item)) {
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

/**
 * Импорт с сохранением другой части проекта: если все строки CSV относятся к одному `partId`,
 * заменяется только эта часть; остальные тендеры в реестре не удаляются.
 */
export function diffTendersImportScoped(
  oldData: Tender[],
  newData: Tender[],
  parsedCsvRowCount?: number,
): { result: Tender[]; stats: TenderImportDiffStats } {
  const partIds = new Set(newData.map((t) => t.partId));
  if (partIds.size === 1 && newData.length > 0) {
    const partId = [...partIds][0]!;
    const rest = oldData.filter((t) => t.partId !== partId);
    const scopedOld = oldData.filter((t) => t.partId === partId);
    const { result: scopedResult, stats } = diffTendersImport(scopedOld, newData, parsedCsvRowCount);
    return { result: [...rest, ...scopedResult], stats };
  }
  return diffTendersImport(oldData, newData, parsedCsvRowCount);
}
