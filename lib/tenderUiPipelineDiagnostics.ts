/**
 * Временная трассировка UI-цепочки импорта тендеров (только console.log).
 * Префикс: [tender-import][pipeline]
 */
import type { Tender } from "@/lib/tenderData";
import type { TenderCsvImportAudit } from "@/lib/tenderCsvImport";
import type { TenderImportDiffStats } from "@/lib/tenderImportDiff";

const LOG = "[tender-import][pipeline]";

export type PipelineStageMeta = {
  file: string;
  fn: string;
  line: number;
};

function stageLabel(meta: PipelineStageMeta, step: string): string {
  return `${LOG} ${step} — ${meta.file}:${meta.line} ${meta.fn}()`;
}

export function logPipelineAfterParse(
  meta: PipelineStageMeta,
  args: {
    rowsIn: number;
    rowsOut: number;
    layout: string;
    firstRow: Record<string, unknown> | null;
    reason?: string;
  },
): void {
  if (typeof console === "undefined") return;
  console.info(stageLabel(meta, "parseTenderCsvText"), {
    rowsIn: args.rowsIn,
    rowsOut: args.rowsOut,
    layout: args.layout,
    firstRow: args.firstRow,
    reason: args.reason ?? (args.rowsOut < args.rowsIn ? "строки отфильтрованы парсером" : "ok"),
  });
}

/** 1. После normalizeTenderCsvRowsWithAudit() */
export function logPipelineAfterNormalize(
  meta: PipelineStageMeta,
  args: {
    rowsIn: number;
    loaded: number;
    invalid: number;
    firstRow: Tender | null;
    audit: Pick<TenderCsvImportAudit, "layout" | "parsedRows" | "skipped" | "columnMapDiagnostics">;
  },
): void {
  if (typeof console === "undefined") return;
  console.log(stageLabel(meta, "1.after normalizeTenderCsvRowsWithAudit"), {
    loaded: args.loaded,
    invalid: args.invalid,
    firstRow: args.firstRow
      ? { id: args.firstRow.id, code: args.firstRow.code, name: args.firstRow.name, partId: args.firstRow.partId }
      : null,
    rowsIn: args.rowsIn,
    parsedRows: args.audit.parsedRows,
    skipped: args.audit.skipped,
    layout: args.audit.layout,
    colMapError: args.audit.columnMapDiagnostics?.error ?? null,
    reason:
      args.loaded === 0
        ? args.audit.columnMapDiagnostics?.error
          ? "column_map_error — ранний выход normalize"
          : `все ${args.invalid} строк пропущены Normalizer`
        : "ok",
  });
}

/** 2. Перед diffTendersImportScoped() */
export function logPipelineBeforeDiff(
  meta: PipelineStageMeta,
  args: {
    registryIn: number;
    normalizedCount: number;
    firstCode: string | null;
    parsedRows: number;
  },
): void {
  if (typeof console === "undefined") return;
  console.log(stageLabel(meta, "2.before diffTendersImportScoped"), {
    normalizedCount: args.normalizedCount,
    firstCode: args.firstCode,
    registryIn: args.registryIn,
    parsedRows: args.parsedRows,
    reason: args.normalizedCount === 0 ? "normalized пуст — diff не вызовется (early return UI)" : "ok",
  });
}

/** 3. После diffTendersImportScoped() */
export function logPipelineAfterDiff(
  meta: PipelineStageMeta,
  args: {
    registryIn: number;
    resultCount: number;
    stats: TenderImportDiffStats;
    firstCode: string | null;
  },
): void {
  if (typeof console === "undefined") return;
  console.log(stageLabel(meta, "3.after diffTendersImportScoped"), {
    added: args.stats.added,
    updated: args.stats.updated,
    unchanged: args.stats.unchanged,
    removed: Math.max(0, args.registryIn - args.resultCount + args.stats.added),
    skippedInvalid: args.stats.skippedInvalid,
    total: args.stats.total,
    resultCount: args.resultCount,
    firstCode: args.firstCode,
    reason:
      args.resultCount === 0
        ? "result пуст после merge"
        : args.resultCount < args.stats.total
          ? "scoped merge уменьшил реестр"
          : "ok",
  });
}

/** 4. Перед saveTendersToLocalStorage / bulkImportTendersToDb */
export function logPipelineBeforeSave(
  meta: PipelineStageMeta,
  args: {
    mode: "localStorage" | "bulkImport" | "displayOnly";
    recordsToSave: number;
    firstRecord: Tender | null;
  },
): void {
  if (typeof console === "undefined") return;
  console.log(stageLabel(meta, "4.before save"), {
    mode: args.mode,
    recordsToSave: args.recordsToSave,
    firstRecord: args.firstRecord
      ? { id: args.firstRecord.id, code: args.firstRecord.code, name: args.firstRecord.name }
      : null,
    reason: args.recordsToSave === 0 ? "нечего сохранять" : "ok",
  });
}

/** 5. После сохранения */
export function logPipelineAfterSave(
  meta: PipelineStageMeta,
  args: {
    mode: "localStorage" | "bulkImport";
    savedCount: number;
    firstCode: string | null;
  },
): void {
  if (typeof console === "undefined") return;
  console.log(stageLabel(meta, "5.after save"), {
    savedCount: args.savedCount,
    firstCode: args.firstCode,
    reason: args.savedCount === 0 ? "сохранено 0 записей" : "ok",
  });
}

/** 6. После обновления React state */
export function logPipelineReactState(
  meta: PipelineStageMeta,
  args: {
    tableRows: number;
    registrySize: number;
    activePartId: number;
    importAuditLoaded: number | null;
    importStatsTotal: number | null;
  },
): void {
  if (typeof console === "undefined") return;
  console.log(stageLabel(meta, "6.after React state"), {
    tableRows: args.tableRows,
    registrySize: args.registrySize,
    activePartId: args.activePartId,
    importAuditLoaded: args.importAuditLoaded,
    importStatsTotal: args.importStatsTotal,
    reason:
      args.registrySize === 0 && (args.importAuditLoaded ?? 0) > 0
        ? "расхождение: audit.loaded>0, но items пуст"
        : args.importAuditLoaded === 0
          ? "UI «загружено 0» из importAudit.loaded (normalize)"
          : "ok",
  });
}

/** 7. Перед отображением таблицы */
export function logPipelineTableRender(
  meta: PipelineStageMeta,
  args: {
    renderRows: number;
    renderFirstCode: string | null;
    filteredFrom: number;
  },
): void {
  if (typeof console === "undefined") return;
  console.log(stageLabel(meta, "7.TendersTable render"), {
    renderRows: args.renderRows,
    renderFirstCode: args.renderFirstCode,
    filteredFrom: args.filteredFrom,
    reason: args.renderRows === 0 && args.filteredFrom > 0 ? "фильтры скрыли строки" : "ok",
  });
}

/** Сводка: первое место, где count стал 0 */
export function logPipelineFirstZeroLoss(
  stage: string,
  meta: PipelineStageMeta,
  detail: Record<string, unknown>,
): void {
  if (typeof console === "undefined") return;
  console.warn(`${LOG} FIRST_ZERO_LOSS`, {
    stage,
    file: meta.file,
    fn: meta.fn,
    line: meta.line,
    ...detail,
  });
}
