import {
  getGprStageFromTenderCode,
  inferPartIdFromStage,
  type Tender,
} from "@/lib/tenderData";
import {
  parseTenderProcurementCsvText,
  type TenderProcurementCsvImportResult,
} from "@/lib/tenderProcurementCsvImport";

export type TenderProcurementSyncStats = {
  parsedRows: number;
  loadedRows: number;
  skippedRows: number;
  matched: number;
  updated: number;
  created: number;
  skipped: number;
  matchFailed: number;
  errors: string[];
};

function normalizeCodeKey(code: string): string {
  return code.trim().toLowerCase();
}

function normalizeNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeStageKey(stage: string): string {
  return stage.trim().toLowerCase();
}

function tenderProcurementFingerprint(t: Tender): string {
  return JSON.stringify({
    code: String(t.code ?? "").trim(),
    name: String(t.name ?? "").trim(),
    stage: String(t.stage ?? "").trim(),
    planStart: t.planStart ?? null,
    factStart: t.factStart ?? null,
    planContractDate: t.planContractDate ?? null,
    factContractDate: t.factContractDate ?? null,
    cost: t.cost ?? null,
    factCost: t.factCost ?? null,
    contractor: t.contractor ?? null,
    status: t.status ?? null,
    statusLabel: t.statusLabel ?? null,
    cycleStatus: t.cycleStatus ?? null,
    comment: t.comment ?? null,
  });
}

/** Сопоставление: 1) код работы → 2) наименование → 3) этап ГПР. */
export function findTenderProcurementMatchIndex(scope: Tender[], incoming: Tender): number {
  const code = incoming.code?.trim();
  if (code) {
    const codeKey = normalizeCodeKey(code);
    const byCode = scope.findIndex((t) => normalizeCodeKey(t.code) === codeKey);
    if (byCode >= 0) return byCode;
  }

  const name = incoming.name?.trim();
  if (name) {
    const nameKey = normalizeNameKey(name);
    const byName = scope.findIndex((t) => normalizeNameKey(t.name) === nameKey);
    if (byName >= 0) return byName;
  }

  if (!code) {
    const stage = (incoming.stage?.trim() || getGprStageFromTenderCode(incoming.code) || "").trim();
    if (stage) {
      const stageKey = normalizeStageKey(stage);
      const candidates = scope
        .map((t, index) => ({ index, t }))
        .filter(
          ({ t }) =>
            normalizeStageKey(t.stage || getGprStageFromTenderCode(t.code) || "") === stageKey,
        );
      if (candidates.length === 1) return candidates[0]!.index;
    }
  }

  return -1;
}

function mergeText(incoming: string | null | undefined, existing: string | null | undefined): string | undefined {
  const next = incoming?.trim();
  if (next) return next;
  return existing?.trim() || undefined;
}

function mergeNullableDate(
  incoming: string | null | undefined,
  existing: string | null | undefined,
): string | null {
  const next = incoming?.trim();
  if (next) return next;
  return existing?.trim() || null;
}

function mergeNumber(incoming: number | undefined, existing: number | undefined): number | undefined {
  if (incoming != null && Number.isFinite(incoming)) return incoming;
  return existing;
}

/** Обновляет поля закупки; сохраняет id и непереданные реквизиты. */
export function applyTenderProcurementRowToTender(existing: Tender, incoming: Tender): Tender {
  return {
    ...existing,
    code: incoming.code?.trim() || existing.code,
    name: incoming.name?.trim() || existing.name,
    stage: incoming.stage?.trim() || existing.stage,
    planStart: mergeNullableDate(incoming.planStart, existing.planStart),
    factStart: mergeText(incoming.factStart, existing.factStart),
    planContractDate: mergeNullableDate(incoming.planContractDate, existing.planContractDate),
    factContractDate: mergeText(incoming.factContractDate, existing.factContractDate),
    cost: mergeNumber(incoming.cost, existing.cost),
    factCost: mergeNumber(incoming.factCost, existing.factCost),
    contractor: mergeText(incoming.contractor, existing.contractor),
    status: incoming.status ?? existing.status,
    statusLabel: mergeText(incoming.statusLabel, existing.statusLabel),
    cycleStatus: incoming.cycleStatus ?? existing.cycleStatus,
    comment: mergeText(incoming.comment, existing.comment),
  };
}

function newTenderId(index: number): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tender-proc-${Date.now()}-${index}`;
}

function createTenderFromProcurementRow(
  incoming: Tender,
  activePartId: number,
  index: number,
): Tender {
  const stage = incoming.stage?.trim() || getGprStageFromTenderCode(incoming.code) || "2.05";
  return {
    ...incoming,
    id: incoming.id?.trim() || newTenderId(index),
    partId: incoming.partId || activePartId || inferPartIdFromStage(stage),
    stage,
  };
}

export function logTenderProcurementSyncDiagnostic(stats: TenderProcurementSyncStats): void {
  if (typeof console === "undefined") return;

  console.group("[Tenders] Импорт данных закупки — диагностика");
  console.table({
    "Строк прочитано": stats.parsedRows,
    "Загружено из CSV": stats.loadedRows,
    "Пропущено при разборе": stats.skippedRows,
    "Найдено совпадений": stats.matched,
    "Обновлено записей": stats.updated,
    "Создано новых": stats.created,
    Пропущено: stats.skipped + stats.matchFailed,
    "Ошибки сопоставления": stats.matchFailed,
  });
  if (stats.errors.length > 0) {
    console.table(stats.errors.map((message, index) => ({ "#": index + 1, message })));
  }
  console.groupEnd();
}

/**
 * UPSERT данных закупки в реестр тендеров активной части проекта.
 * Существующие тендеры других частей и несопоставленные записи не удаляются.
 */
export function syncTenderProcurementData(
  tenders: Tender[],
  incomingRows: Tender[],
  activePartId: number,
  audit?: Pick<
    TenderProcurementCsvImportResult["audit"],
    "parsedRows" | "loaded" | "skipped" | "skippedRows"
  >,
): { tenders: Tender[]; stats: TenderProcurementSyncStats } {
  const otherParts = tenders.filter((t) => t.partId !== activePartId);
  const scope = tenders.filter((t) => t.partId === activePartId).map((t) => ({ ...t }));

  let matched = 0;
  let updated = 0;
  let created = 0;
  let matchFailed = 0;
  const errors: string[] = [];
  let createIndex = 0;

  for (const row of incomingRows) {
    const matchIndex = findTenderProcurementMatchIndex(scope, row);
    if (matchIndex >= 0) {
      matched += 1;
      const before = scope[matchIndex]!;
      const merged = applyTenderProcurementRowToTender(before, row);
      if (tenderProcurementFingerprint(merged) !== tenderProcurementFingerprint(before)) {
        updated += 1;
      }
      scope[matchIndex] = merged;
      continue;
    }

    if (!row.code?.trim() && !row.name?.trim()) {
      matchFailed += 1;
      errors.push("Строка без кода работы и наименования — пропущена");
      continue;
    }

    createIndex += 1;
    scope.push(createTenderFromProcurementRow(row, activePartId, createIndex));
    created += 1;
  }

  if (audit?.skippedRows?.length) {
    for (const skip of audit.skippedRows) {
      errors.push(`Строка ${skip.fileRow}: ${skip.reason}`);
    }
  }

  const stats: TenderProcurementSyncStats = {
    parsedRows: audit?.parsedRows ?? incomingRows.length,
    loadedRows: incomingRows.length,
    skippedRows: audit?.skipped ?? 0,
    matched,
    updated,
    created,
    skipped: (audit?.skipped ?? 0) + matchFailed,
    matchFailed,
    errors,
  };

  logTenderProcurementSyncDiagnostic(stats);

  return {
    tenders: [...otherParts, ...scope],
    stats,
  };
}

export function syncTenderProcurementFromCsvText(
  tenders: Tender[],
  csvText: string,
  activePartId: number,
): { tenders: Tender[]; stats: TenderProcurementSyncStats } {
  const { tenders: incoming, audit } = parseTenderProcurementCsvText(csvText);
  return syncTenderProcurementData(tenders, incoming, activePartId, audit);
}
