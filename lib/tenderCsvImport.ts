import Papa from "papaparse";

import {
  buildLayoutSelectionTrace,
  logTenderCsvLayoutSelectionTrace,
  type LayoutSelectionTrace,
} from "@/lib/tenderCsvLayoutTrace";

import {
  diagnoseNormalizeRow,
  incrementRejectReason,
  logNormalizeRejectedSummary,
  logNormalizeRowTrace,
} from "@/lib/tenderCsvNormalizeTrace";

import {
  clearTenderCsvCodeTraceExtractRow,
  disableTenderCsvFirstRowCodeTrace,
  enableTenderCsvFirstRowCodeTrace,
  logCodeTraceColumnMap,
  logCodeTraceExtractProcurement,
  logCodeTraceNormalizeSkip,
  logCodeTraceNormalizeSuccess,
  setTenderCsvCodeTraceExtractRow,
  shouldTraceExtractTenderRowProcurement,
} from "@/lib/tenderCsvCodeTrace";

import { readCsvFileTextSmart } from "@/lib/csvTextEncoding";
import { normalizeGprWorkCodeFromCsvRaw, ruDateCellToIsoOrNull } from "@/lib/gprReportCsv";
import {
  coerceTender,
  contractDeviationDays,
  getGprStageFromTenderCode,
  inferPartIdFromStage,
  type Tender,
  normalizeTenderCycleStatus,
  type TenderProcurementStatus,
} from "@/lib/tenderData";

export type TenderCsvSkipReason =
  | "empty_row"
  | "missing_code"
  | "missing_name"
  | "invalid_code"
  | "coerce_failed";

export type TenderCsvSkippedRow = {
  rowIndex: number;
  reason: TenderCsvSkipReason;
  codePreview: string;
  namePreview: string;
};

/** Схема «Закупка услуг (тендеры).csv»: 2 строки шапки, данные с 3-й. */
export type TenderCsvLayout = "procurement" | "flat";

export type TenderColumnMapDiagnostics = {
  layout: TenderCsvLayout;
  indices: Record<TenderColumnMapKey, number>;
  headersByField: Record<TenderColumnMapKey, string>;
  missingRequired: { field: TenderColumnMapKey; label: string }[];
  matchedRequiredCount: number;
  requiredCount: number;
  optionalMatchedCount: number;
  error: string | null;
};

export type TenderCsvImportAudit = {
  parsedRows: number;
  loaded: number;
  skipped: number;
  parseErrors: number;
  skippedRows: TenderCsvSkippedRow[];
  headers: string[];
  unmappedHeaders: string[];
  columnUsage: Record<string, "mapped" | "ignored">;
  layout: TenderCsvLayout;
  columnMapDiagnostics: TenderColumnMapDiagnostics;
};

export type TenderCsvNormalizeResult = {
  tenders: Tender[];
  audit: TenderCsvImportAudit;
};

export type TenderColumnMapKey =
  | "id"
  | "code"
  | "name"
  | "stage"
  | "planStart"
  | "factStart"
  | "planContractDate"
  | "factContractDate"
  | "cost"
  | "factCost"
  | "contractor"
  | "status"
  | "comment"
  | "partId";

type HeaderPattern = {
  all?: string[];
  any?: string[];
  notAny?: string[];
  exact?: string[];
};

type TenderFieldDefinition = {
  key: TenderColumnMapKey;
  label: string;
  layouts: TenderCsvLayout[];
  requiredIn: TenderCsvLayout[];
  patterns: HeaderPattern[];
};

/** Единые правила сопоставления бизнес-полей по заголовкам CSV (без фиксированных индексов). */
const TENDER_FIELD_DEFINITIONS: TenderFieldDefinition[] = [
  {
    key: "id",
    label: "№ статей / № тендера",
    layouts: ["procurement", "flat"],
    requiredIn: [],
    patterns: [
      { any: ["№ статей", "номер статей", "статей"] },
      { any: ["№ тендера", "номер тендера"] },
      { any: ["№ п/п", "п/п"], notAny: ["тендер"] },
      { any: ["id", "номер строки", "no", "№"] },
    ],
  },
  {
    key: "code",
    label: "ID Код / шифр ГПР",
    layouts: ["procurement", "flat"],
    requiredIn: [],
    patterns: [
      { exact: ["id код"] },
      {
        any: ["id код", "шифр", "код гпр", "код работы"],
        notAny: ["наименование", "стоимость", "контрагент", "комментар"],
      },
      { any: ["наименование работ"] },
      { any: ["шифр", "код", "code"], notAny: ["наименование", "стоимость"] },
    ],
  },
  {
    key: "name",
    label: "Этап работ / наименование",
    layouts: ["procurement", "flat"],
    requiredIn: [],
    patterns: [
      { exact: ["этап работ"] },
      { any: ["этап работ гпр", "этап работ"] },
      {
        any: ["наименование работ", "наименование", "название", "name"],
        notAny: ["код", "шифр", "стоимость"],
      },
    ],
  },
  {
    key: "stage",
    label: "ГПР / этап ГПР",
    layouts: ["procurement", "flat"],
    requiredIn: ["procurement"],
    patterns: [
      { exact: ["гпр"], notAny: ["этап работ", "шифр", "наименование"] },
      { any: ["этап гпр", "stage"] },
    ],
  },
  {
    key: "planStart",
    label: "план начала (Начало тендера)",
    layouts: ["procurement", "flat"],
    requiredIn: ["procurement"],
    patterns: [
      { all: ["начало тендера", "план"] },
      { any: ["план начала", "план начала работ"] },
    ],
  },
  {
    key: "factStart",
    label: "факт начала (Начало тендера)",
    layouts: ["procurement", "flat"],
    requiredIn: ["procurement"],
    patterns: [{ all: ["начало тендера", "факт"] }, { any: ["факт начала"] }],
  },
  {
    key: "planContractDate",
    label: "план договора (Дата заключения договора)",
    layouts: ["procurement", "flat"],
    requiredIn: ["procurement"],
    patterns: [
      { all: ["дата заключения договора", "план"] },
      { all: ["план"], any: ["договор", "заключен"], notAny: ["начало тендера", "стоимость"] },
      { any: ["план даты договора", "план договора", "дата договора план"] },
    ],
  },
  {
    key: "factContractDate",
    label: "факт договора (Дата заключения договора)",
    layouts: ["procurement", "flat"],
    requiredIn: ["procurement"],
    patterns: [
      { all: ["дата заключения договора", "факт"] },
      { all: ["факт"], any: ["договор", "заключен"], notAny: ["начало тендера", "стоимость"] },
      { any: ["факт даты договора", "факт договора"] },
    ],
  },
  {
    key: "cost",
    label: "плановая стоимость (Стоимость руб.)",
    layouts: ["procurement", "flat"],
    requiredIn: ["procurement"],
    patterns: [
      { all: ["стоимость", "план"] },
      { any: ["стоимость (руб.)", "стоимость"], notAny: ["факт", "откл"] },
      { any: ["бюджет", "сумма", "cost"], notAny: ["факт"] },
    ],
  },
  {
    key: "factCost",
    label: "фактическая стоимость (Стоимость руб.)",
    layouts: ["procurement"],
    requiredIn: ["procurement"],
    patterns: [
      { all: ["стоимость", "факт"] },
      { all: ["стоимость (руб.)", "факт"] },
      { any: ["факт стоимость", "стоимость факт"] },
    ],
  },
  {
    key: "contractor",
    label: "Контрагент / подрядчик",
    layouts: ["procurement", "flat"],
    requiredIn: ["procurement"],
    patterns: [{ any: ["подрядчик", "контрагент", "исполнитель"] }],
  },
  {
    key: "status",
    label: "Статус",
    layouts: ["procurement", "flat"],
    requiredIn: ["procurement"],
    patterns: [{ any: ["статус"], notAny: ["комментар"] }],
  },
  {
    key: "comment",
    label: "Комментарий к отклонениям",
    layouts: ["procurement", "flat"],
    requiredIn: [],
    patterns: [
      { any: ["комментарий к отклонениям", "комментарий", "примечание"] },
    ],
  },
  {
    key: "partId",
    label: "часть проекта",
    layouts: ["procurement", "flat"],
    requiredIn: [],
    patterns: [{ any: ["часть проекта", "объект"] }],
  },
];

export type TenderColumnMap = Record<TenderColumnMapKey, number>;

const EMPTY_COLUMN_MAP = (): TenderColumnMap => ({
  id: -1,
  code: -1,
  name: -1,
  stage: -1,
  planStart: -1,
  factStart: -1,
  planContractDate: -1,
  factContractDate: -1,
  cost: -1,
  factCost: -1,
  contractor: -1,
  status: -1,
  comment: -1,
  partId: -1,
});

function normalizeHeaderCell(h: string): string {
  return String(h).replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, " ");
}

function headerMatchesPattern(cell: string, pattern: HeaderPattern): boolean {
  for (const p of pattern.notAny ?? []) {
    if (cell.includes(p)) return false;
  }
  for (const p of pattern.exact ?? []) {
    if (cell !== p) return false;
  }
  for (const p of pattern.all ?? []) {
    if (!cell.includes(p)) return false;
  }
  if ((pattern.any ?? []).length > 0) {
    let matched = false;
    for (const p of pattern.any!) {
      if (cell === p || cell.startsWith(p) || cell.includes(p)) {
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }
  return true;
}

export type TenderColumnMapBuildTraceRow = {
  field: TenderColumnMapKey;
  matchedHeader: string;
  index: number;
  isRequired: boolean;
  isMatched: boolean;
  isSkipped: boolean;
  skipReason: string;
  /** Строка в tenderCsvImport.ts, где поле получает index или исключается. */
  sourceLine: number;
};

function describeHeaderPattern(pattern: HeaderPattern): string {
  const parts: string[] = [];
  if (pattern.exact?.length) parts.push(`exact:${pattern.exact.join("|")}`);
  if (pattern.any?.length) parts.push(`any:${pattern.any.join("|")}`);
  if (pattern.all?.length) parts.push(`all:${pattern.all.join("+")}`);
  if (pattern.notAny?.length) parts.push(`not:${pattern.notAny.join("|")}`);
  return parts.join("; ") || "(пустой паттерн)";
}

function traceFindColumnByPatterns(
  headers: string[],
  patterns: HeaderPattern[],
  used: Set<number>,
  usedBy: Map<number, TenderColumnMapKey>,
): {
  index: number;
  matchedHeader: string;
  skipReason: string;
  occupiedBy?: TenderColumnMapKey;
} {
  const norm = headers.map((h) => normalizeHeaderCell(h));
  let occupiedCandidate: {
    index: number;
    header: string;
    by: TenderColumnMapKey;
    pattern: string;
  } | null = null;

  for (const pattern of patterns) {
    const patternLabel = describeHeaderPattern(pattern);
    for (let i = 0; i < norm.length; i++) {
      if (!headerMatchesPattern(norm[i]!, pattern)) continue;
      const header = headers[i] ?? "";
      if (used.has(i)) {
        if (!occupiedCandidate) {
          occupiedCandidate = {
            index: i,
            header,
            by: usedBy.get(i) ?? "id",
            pattern: patternLabel,
          };
        }
        continue;
      }
      return { index: i, matchedHeader: header, skipReason: "" };
    }
  }

  if (occupiedCandidate) {
    return {
      index: -1,
      matchedHeader: occupiedCandidate.header,
      skipReason:
        `колонка ${occupiedCandidate.index} «${occupiedCandidate.header}» совпадает с паттерном (${occupiedCandidate.pattern}), ` +
        `но уже занята полем «${occupiedCandidate.by}» (used.add на строке ~381)`,
      occupiedBy: occupiedCandidate.by,
    };
  }

  return {
    index: -1,
    matchedHeader: "",
    skipReason:
      "ни один свободный заголовок не совпал с паттернами поля (findColumnByPatterns → -1, строка ~308)",
  };
}

/**
 * Трассировка buildTenderProcurementColumnMap / buildTenderColumnMapWithDiagnostics.
 * Только диагностика — логика сопоставления не меняется.
 */
export function traceBuildTenderProcurementColumnMap(
  headers: string[],
): TenderColumnMapBuildTraceRow[] {
  return traceBuildTenderColumnMap(headers, "procurement");
}

export function traceBuildTenderColumnMap(
  headers: string[],
  layout: TenderCsvLayout,
): TenderColumnMapBuildTraceRow[] {
  const traceRows: TenderColumnMapBuildTraceRow[] = [];
  const colMap = EMPTY_COLUMN_MAP();
  const used = new Set<number>();
  const usedBy = new Map<number, TenderColumnMapKey>();

  for (const def of TENDER_FIELD_DEFINITIONS) {
    if (!def.layouts.includes(layout)) {
      traceRows.push({
        field: def.key,
        matchedHeader: "",
        index: -1,
        isRequired: def.requiredIn.includes(layout),
        isMatched: false,
        isSkipped: true,
        skipReason: `поле не входит в layout «${layout}» (строка ~372: def.layouts.includes)`,
        sourceLine: 372,
      });
      continue;
    }

    const patterns = resolveFieldPatterns(def, headers, colMap, layout);
    const match = traceFindColumnByPatterns(headers, patterns, used, usedBy);
    const idx = match.index;
    colMap[def.key] = idx;
    const assignLine = 376;

    traceRows.push({
      field: def.key,
      matchedHeader: match.matchedHeader,
      index: idx,
      isRequired: def.requiredIn.includes(layout),
      isMatched: idx >= 0,
      isSkipped: idx < 0,
      skipReason:
        idx >= 0
          ? `сопоставлено через findColumnByPatterns (строка ~${assignLine})`
          : match.skipReason,
      sourceLine: assignLine,
    });

    if (idx >= 0) {
      used.add(idx);
      usedBy.set(idx, def.key);
    }
  }

  if (layout === "procurement") {
    const factAfterPlan: { plan: TenderColumnMapKey; fact: TenderColumnMapKey }[] = [
      { plan: "planStart", fact: "factStart" },
      { plan: "planContractDate", fact: "factContractDate" },
      { plan: "cost", fact: "factCost" },
    ];
    for (const { plan, fact } of factAfterPlan) {
      if (colMap[fact] >= 0) continue;
      const planIdx = colMap[plan];
      const factIdx = findProcurementFactAfterPlan(headers, planIdx, used);
      const existing = traceRows.find((r) => r.field === fact);
      if (!existing) continue;
      if (factIdx < 0) {
        if (existing.index < 0) {
          existing.skipReason =
            planIdx < 0
              ? `${existing.skipReason}; factAfterPlan: plan «${plan}» не сопоставлен (строка ~394)`
              : `${existing.skipReason}; factAfterPlan: «факт» после plan не найден (строка ~394)`;
        }
        continue;
      }
      colMap[fact] = factIdx;
      existing.index = factIdx;
      existing.matchedHeader = headers[factIdx] ?? "";
      existing.isMatched = true;
      existing.isSkipped = false;
      existing.skipReason = `сопоставлено factAfterPlan (строка ~396)`;
      existing.sourceLine = 396;
      used.add(factIdx);
      usedBy.set(factIdx, fact);
    }
  }

  return traceRows;
}

export function logBuildTenderProcurementColumnMapTrace(headers: string[]): void {
  if (typeof console === "undefined") return;
  const trace = traceBuildTenderProcurementColumnMap(headers);
  const matched = trace.filter((r) => r.isMatched);
  const skipped = trace.filter((r) => r.isSkipped);

  console.info("[tender-import][colmap-trace] buildTenderProcurementColumnMap — все поля после detectColumnMap:");
  console.table(
    trace.map((r) => ({
      field: r.field,
      matchedHeader: r.matchedHeader,
      index: r.index,
      isRequired: r.isRequired,
      isMatched: r.isMatched,
      isSkipped: r.isSkipped,
      skipReason: r.skipReason,
      sourceLine: r.sourceLine,
    })),
  );

  console.info("[tender-import][colmap-trace] итоговый ColumnMap (только isMatched):", {
    fields: matched.map((r) => ({ field: r.field, index: r.index, matchedHeader: r.matchedHeader })),
  });

  const codeRow = trace.find((r) => r.field === "code");
  if (codeRow?.isSkipped) {
    console.warn("[tender-import][colmap-trace] поле code исключено:", {
      field: codeRow.field,
      index: codeRow.index,
      matchedHeader: codeRow.matchedHeader,
      skipReason: codeRow.skipReason,
      sourceLine: codeRow.sourceLine,
      firstLoss:
        codeRow.skipReason.includes("уже занята")
          ? "колонка «ID Код» захвачена полем id раньше (порядок TENDER_FIELD_DEFINITIONS: id → code)"
          : codeRow.skipReason,
    });
  }

  console.info("[tender-import][colmap-trace] пропущенные поля:", {
    count: skipped.length,
    fields: skipped.map((r) => r.field),
  });
}

function findColumnByPatterns(
  headers: string[],
  patterns: HeaderPattern[],
  used: Set<number>,
): number {
  const norm = headers.map((h) => normalizeHeaderCell(h));
  for (const pattern of patterns) {
    for (let i = 0; i < norm.length; i++) {
      if (used.has(i)) continue;
      if (headerMatchesPattern(norm[i]!, pattern)) return i;
    }
  }
  return -1;
}

function isProcurementFactSubHeader(cell: string): boolean {
  if (cell === "факт") return true;
  if (cell.startsWith("факт__dup")) return true;
  if (cell.includes("факт") && cell.includes("начало тендера")) return true;
  if (cell.includes("факт") && cell.includes("договор")) return true;
  if (cell.includes("факт") && cell.includes("стоимость")) return true;
  return false;
}

/** Колонка «Факт» в двухуровневой шапке — сразу после соответствующей «План»-колонки. */
function findProcurementFactAfterPlan(
  headers: string[],
  planIndex: number,
  used: Set<number>,
): number {
  if (planIndex < 0) return -1;
  const norm = headers.map((h) => normalizeHeaderCell(h));
  for (let i = planIndex + 1; i < norm.length; i++) {
    if (used.has(i)) continue;
    if (isProcurementFactSubHeader(norm[i]!)) return i;
  }
  return -1;
}

/** Procurement: id только по № статей / № тендера / п/п — без any:["id"], чтобы не занимать «ID Код». */
const PROCUREMENT_ID_HEADER_PATTERNS: HeaderPattern[] = [
  { any: ["№ статей", "номер статей", "статей"] },
  { any: ["№ тендера", "номер тендера"] },
  { any: ["№ п/п", "п/п"], notAny: ["тендер"] },
];

function resolveFieldPatterns(
  def: TenderFieldDefinition,
  headers: string[],
  colMap: TenderColumnMap,
  layout: TenderCsvLayout,
): HeaderPattern[] {
  if (def.key === "id" && layout === "procurement") {
    return PROCUREMENT_ID_HEADER_PATTERNS;
  }

  if (def.key !== "name") return def.patterns;

  const idIdx = colMap.id;
  const idHeader = idIdx >= 0 ? normalizeHeaderCell(headers[idIdx] ?? "") : "";
  const hasTenderNumberColumn =
    idHeader.includes("тендера") ||
    headers.some((h) => {
      const n = normalizeHeaderCell(h);
      return n.includes("№ тендера") || n.includes("номер тендера");
    });

  if (!hasTenderNumberColumn) return def.patterns;

  return [
    {
      any: ["наименование", "название", "описание"],
      notAny: ["код", "шифр", "стоимость", "работ"],
    },
    { any: ["этап работ гпр", "этап работ"] },
  ];
}

/** Построить ColumnMap и диагностику сопоставления по заголовкам (единая точка для Parser). */
export function buildTenderColumnMapWithDiagnostics(
  headers: string[],
  layout: TenderCsvLayout,
): { colMap: TenderColumnMap; diagnostics: TenderColumnMapDiagnostics } {
  const colMap = EMPTY_COLUMN_MAP();
  const used = new Set<number>();
  const indices = { ...colMap };
  const headersByField = {} as Record<TenderColumnMapKey, string>;
  for (const def of TENDER_FIELD_DEFINITIONS) {
    if (!def.layouts.includes(layout)) continue;

    const patterns = resolveFieldPatterns(def, headers, colMap, layout);
    const idx = findColumnByPatterns(headers, patterns, used);
    colMap[def.key] = idx;
    indices[def.key] = idx;
    headersByField[def.key] = idx >= 0 ? (headers[idx] ?? "") : "";

    if (idx >= 0) {
      used.add(idx);
    }
  }

  if (layout === "procurement") {
    const factAfterPlan: { plan: TenderColumnMapKey; fact: TenderColumnMapKey }[] = [
      { plan: "planStart", fact: "factStart" },
      { plan: "planContractDate", fact: "factContractDate" },
      { plan: "cost", fact: "factCost" },
    ];
    for (const { plan, fact } of factAfterPlan) {
      if (colMap[fact] >= 0) continue;
      const planIdx = colMap[plan];
      const factIdx = findProcurementFactAfterPlan(headers, planIdx, used);
      if (factIdx < 0) continue;
      colMap[fact] = factIdx;
      indices[fact] = factIdx;
      headersByField[fact] = headers[factIdx] ?? "";
      used.add(factIdx);
    }
  }

  const requiredDefs = TENDER_FIELD_DEFINITIONS.filter(
    (d) => d.layouts.includes(layout) && d.requiredIn.includes(layout),
  );
  const missingRequired = requiredDefs
    .filter((d) => colMap[d.key] < 0)
    .map((d) => ({ field: d.key, label: d.label }));
  const matchedRequiredCount = requiredDefs.filter((d) => colMap[d.key] >= 0).length;
  const optionalMatchedCount = TENDER_FIELD_DEFINITIONS.filter(
    (d) => d.layouts.includes(layout) && d.requiredIn.length === 0 && colMap[d.key] >= 0,
  ).length;

  const error =
    missingRequired.length > 0
      ? `Не найдены обязательные колонки CSV: ${missingRequired.map((m) => `«${m.label}»`).join(", ")}`
      : null;

  return {
    colMap,
    diagnostics: {
      layout,
      indices,
      headersByField,
      missingRequired,
      matchedRequiredCount,
      requiredCount: requiredDefs.length,
      optionalMatchedCount,
      error,
    },
  };
}

/** Диагностика сопоставления колонок закупочного CSV (первая строка данных). */
export function diagnoseTenderProcurementColumns(
  headers: string[],
  firstRow?: Record<string, unknown>,
): Array<{
  field: string;
  expectedIndex: number;
  header: string;
  firstValue: string;
}> {
  const { diagnostics } = buildTenderColumnMapWithDiagnostics(headers, "procurement");
  const labelByKey: Partial<Record<TenderColumnMapKey, string>> = {
    id: "№ статей / № тендера",
    code: "ID Код / шифр ГПР",
    name: "Этап работ / наименование",
    stage: "этап ГПР",
    planStart: "план начала тендера",
    factStart: "факт начала тендера",
    planContractDate: "план договора",
    factContractDate: "факт договора",
    cost: "стоимость план",
    factCost: "стоимость факт",
    contractor: "подрядчик",
    status: "статус",
  };
  const order: TenderColumnMapKey[] = [
    "id",
    "code",
    "name",
    "stage",
    "planStart",
    "factStart",
    "planContractDate",
    "factContractDate",
    "cost",
    "factCost",
    "contractor",
    "status",
  ];
  return order
    .filter((key) => diagnostics.indices[key] >= 0 || TENDER_FIELD_DEFINITIONS.some((d) => d.key === key && d.requiredIn.includes("procurement")))
    .map((key) => {
      const index = diagnostics.indices[key];
      return {
        field: labelByKey[key] ?? key,
        expectedIndex: index,
        header: headers[index] ?? "—",
        firstValue:
          firstRow && index >= 0 ? cellByIndex(firstRow, headers, index).slice(0, 80) : "",
      };
    });
}

function logTenderColumnMapDiagnostics(
  diagnostics: TenderColumnMapDiagnostics,
  headers?: string[],
): void {
  if (typeof console === "undefined") return;
  if (diagnostics.layout === "procurement" && headers && headers.length > 0) {
    logBuildTenderProcurementColumnMapTrace(headers);
  }
  const table = formatTenderColumnMapTable(diagnostics);
  console.info("[tender-import] сопоставление колонок", {
    layout: diagnostics.layout,
    matchedRequired: `${diagnostics.matchedRequiredCount}/${diagnostics.requiredCount}`,
    optionalMatched: diagnostics.optionalMatchedCount,
    missingRequired: diagnostics.missingRequired.map((m) => m.label),
  });
  console.table(table);
  if (diagnostics.error) {
    console.error("[tender-import]", diagnostics.error);
  }
}

/** Диагностическая таблица: поле модели → индекс → заголовок CSV. */
export function formatTenderColumnMapTable(
  diagnostics: TenderColumnMapDiagnostics,
): Array<{ field: string; index: number; csvHeader: string }> {
  return (Object.keys(diagnostics.indices) as TenderColumnMapKey[])
    .filter((key) => diagnostics.indices[key] >= 0)
    .map((key) => ({
      field: key,
      index: diagnostics.indices[key],
      csvHeader: diagnostics.headersByField[key],
    }));
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function sniffCsvDelimiter(text: string): string {
  const lines = stripBom(text).split(/\r?\n/).slice(0, 48);
  let commas = 0;
  let semis = 0;
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    commas += (t.match(/,/g) ?? []).length;
    semis += (t.match(/;/g) ?? []).length;
  }
  return semis > commas ? ";" : ",";
}

function forwardFillHeaderRow(cells: string[]): string[] {
  let last = "";
  return cells.map((c) => {
    const t = c.trim();
    if (t) last = t;
    return last;
  });
}

function makeUniqueHeaderKeys(headerCells: string[]): string[] {
  const counts = new Map<string, number>();
  return headerCells.map((raw, i) => {
    const h = raw.replace(/^\uFEFF/, "").trim().replace(/\s+/g, " ") || `__col_${i}`;
    const n = (counts.get(h) ?? 0) + 1;
    counts.set(h, n);
    return n === 1 ? h : `${h}__dup_${i}`;
  });
}

function subHeaderCellMergesWithTop(bot: string): boolean {
  const s = bot.trim().toLowerCase();
  if (!s) return false;
  if (s === "план" || s === "факт" || s.includes("откл")) return true;
  if (s === "гпр" || s.includes("отставан")) return true;
  return false;
}

/** Вторая строка шапки без ячейки под «№ тендера» сдвигает подзаголовки — выравниваем перед merge. */
function alignProcurementSubHeaderRow(primary: unknown[], secondary: unknown[]): string[] {
  const primaryCells = primary.map((c) => String(c ?? "").trim());
  const tenderCol = primaryCells.findIndex((c) => {
    const n = normalizeHeaderCell(c);
    return (
      n === "№ тендера" ||
      n.startsWith("№ тендера") ||
      n === "номер тендера" ||
      n.startsWith("номер тендера")
    );
  });
  if (tenderCol < 0) {
    return secondary.map((c) => String(c ?? ""));
  }

  const aligned = secondary.map((c) => String(c ?? ""));
  while (aligned.length < primaryCells.length) {
    aligned.push("");
  }

  if (aligned[tenderCol]?.trim() !== "") {
    aligned.splice(tenderCol, 0, "");
    return aligned;
  }

  const firstSubIdx = aligned.findIndex((c) => c.trim() !== "");
  if (firstSubIdx === tenderCol + 2) {
    aligned.splice(tenderCol + 1, 0, "");
  }

  return aligned;
}

function mergeTwoHeaderRows(primary: unknown[], secondary: unknown[]): string[] {
  const a = primary.map((c) =>
    String(c ?? "")
      .replace(/^\uFEFF/, "")
      .trim()
      .replace(/\s+/g, " "),
  );
  const bRaw = secondary.map((c) =>
    String(c ?? "")
      .replace(/^\uFEFF/, "")
      .trim()
      .replace(/\s+/g, " "),
  );
  const b = forwardFillHeaderRow(bRaw);
  const len = Math.max(a.length, b.length);
  const out: string[] = [];
  for (let i = 0; i < len; i++) {
    const top = a[i] ?? "";
    const bot = b[i] ?? "";
    const merged =
      top && bot && subHeaderCellMergesWithTop(bot)
        ? `${top} ${bot}`.trim().replace(/\s+/g, " ")
        : top || bot || `__col_${i}`;
    out.push(merged);
  }
  return out;
}

function countProcurementSubHeaderPlanFactOtkl(sub: unknown[]): {
  planFact: number;
  otkl: number;
  structuralGroups: number;
} {
  const subS = sub.map((c) => String(c ?? "").trim().toLowerCase());
  let planFact = 0;
  let otkl = 0;
  for (const s of subS) {
    if (!s) continue;
    if (s === "план" || s === "факт" || s.startsWith("план") || s.startsWith("факт")) planFact += 1;
    if (s.includes("откл")) otkl += 1;
  }

  const cells = sub.map((c) => String(c ?? "").trim());
  let idx = 0;
  while (idx < cells.length && !cells[idx]) idx += 1;
  let structuralGroups = 0;
  while (idx < cells.length) {
    const filled = cells.slice(idx, idx + 3).filter(Boolean).length;
    if (filled >= 2) structuralGroups += 1;
    idx += 3;
  }

  return { planFact, otkl, structuralGroups };
}

function hasGprCodeInSampleDataRow(
  row: unknown[] | undefined,
  primary?: unknown[],
  sub?: unknown[],
): boolean {
  if (!row) return false;
  let articleCol = 0;
  let codeCol = 1;
  if (primary && sub) {
    const cols = resolveProcurementArticleAndCodeColumns(primary, sub);
    articleCol = cols.articleCol;
    codeCol = cols.codeCol;
  }
  return findGprCodeInProcurementDataRow(row, articleCol, codeCol) != null;
}

function looksLikeTenderProcurementPrimaryHeader(
  row: unknown[],
  sampleDataRow?: unknown[],
  subHeaderRow?: unknown[],
): boolean {
  const cells = row.map((c) => normalizeHeaderCell(String(c ?? "")));
  const c0 = cells[0] ?? "";
  const hasSerial = /п\/п|^№/.test(c0) || c0.includes("номер") || c0.includes("статей");
  const joined = cells.join(" ");
  const hasName =
    joined.includes("наименование") ||
    joined.includes("этап работ") ||
    joined.includes("id код");
  const hasTenderSheet =
    joined.includes("начало тендера") ||
    joined.includes("заключен") ||
    joined.includes("стоимость") ||
    joined.includes("договор") ||
    joined.includes("тендер");
  const gprArticles =
    joined.includes("статей") &&
    joined.includes("id код") &&
    (joined.includes("этап работ") || joined.includes("гпр") || joined.includes("отставание"));
  if (gprArticles && hasSerial) return true;
  if (hasGprCodeInSampleDataRow(sampleDataRow, row, subHeaderRow) && row.length >= 8) return true;
  return hasSerial && hasName && hasTenderSheet;
}

/** Строка primary header GPR/Excel: одновременно ID Код, Этап работ, ГПР. */
function rowHasExcelProcurementPrimaryMarkers(row: unknown[]): boolean {
  const joined = row.map((c) => normalizeHeaderCell(String(c ?? ""))).join(" ").toLowerCase();
  return joined.includes("id код") && joined.includes("этап работ") && joined.includes("гпр");
}

/** Sub header: План, Факт и Откл. в одной строке. */
function rowHasPlanFactOtklMarkers(row: unknown[]): boolean {
  const joined = row.map((c) => normalizeHeaderCell(String(c ?? ""))).join(" ").toLowerCase();
  return joined.includes("план") && joined.includes("факт") && joined.includes("откл");
}

function rowQualifiesAsProcurementPrimary(row: unknown[]): boolean {
  if (rowHasExcelProcurementPrimaryMarkers(row)) return true;
  return looksLikeTenderProcurementPrimaryHeader(row, undefined);
}

function rowQualifiesAsProcurementSub(sub: unknown[], primary: unknown[]): boolean {
  if (!rowHasPlanFactOtklMarkers(sub)) return false;
  return looksLikeTenderProcurementSubHeader(sub, primary);
}

/** Индексы колонок «№ статьи» и «ID Код» по primary/sub header (без фиксированных индексов). */
function resolveProcurementArticleAndCodeColumns(
  primary: unknown[],
  sub: unknown[],
): { articleCol: number; codeCol: number } {
  const pNorm = primary.map((c) => normalizeHeaderCell(String(c ?? "")).toLowerCase());
  const sNorm = sub.map((c) => normalizeHeaderCell(String(c ?? "")).toLowerCase());

  let articleCol = -1;
  for (let i = 0; i < pNorm.length; i++) {
    const c = pNorm[i]!;
    if (/^№|п\/п/.test(c) || c.includes("статей") || c.includes("номер")) {
      articleCol = i;
      break;
    }
  }
  if (articleCol < 0) {
    for (let i = 0; i < sNorm.length; i++) {
      const c = sNorm[i]!;
      if (/^№/.test(c) || c.includes("статей")) {
        articleCol = i;
        break;
      }
    }
  }

  let codeCol = pNorm.findIndex((c) => c.includes("id код"));
  if (codeCol < 0) {
    codeCol = pNorm.findIndex(
      (c) => c.includes("наименование") || c.includes("шифр") || (c.includes("этап") && c.includes("работ")),
    );
  }
  if (codeCol < 0) {
    codeCol = pNorm.findIndex((c) => c.includes("тендера") && !c.includes("начало"));
  }
  if (codeCol < 0 && articleCol >= 0) codeCol = articleCol + 1;
  if (codeCol < 0) codeCol = 1;

  return { articleCol, codeCol };
}

/** Код статьи ГПР в данных (не сводный этап вроде «2.04.»). */
function looksLikeRealGprArticleCode(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  const resolved = resolveCode(trimmed);
  if (!resolved) return false;
  const parts = resolved.split(".").filter(Boolean);
  return parts.length >= 3;
}

/** Ищет код ГПР в строке данных: сначала в колонке по шапке, затем по всей строке. */
function findGprCodeInProcurementDataRow(
  row: unknown[],
  articleCol: number,
  codeCol: number,
): string | null {
  const tryCell = (col: number): string | null => {
    if (col < 0 || col >= row.length) return null;
    const raw = String(row[col] ?? "").trim();
    if (!raw) return null;
    if (looksLikeRealGprArticleCode(raw)) return raw;
    if (/^\d+\.\d+(\.\d+)*/.test(raw) && raw.split(".").filter(Boolean).length >= 3) return raw;
    return null;
  };

  const atMapped = tryCell(codeCol);
  if (atMapped) return atMapped;

  for (let i = 0; i < row.length; i++) {
    if (i === articleCol) continue;
    const found = tryCell(i);
    if (found) return found;
  }
  return null;
}

type ProcurementTableAnchor = {
  primaryIdx: number;
  subIdx: number;
  dataStartIdx: number;
};

/**
 * Ищет начало GPR-таблицы в матрице (в т.ч. Excel-экспорт с преамбулой).
 * Без фиксированных индексов строк.
 */
function findProcurementTableAnchor(matrix: string[][]): ProcurementTableAnchor | null {
  if (matrix.length < 2) return null;

  for (let primaryIdx = 0; primaryIdx < matrix.length - 1; primaryIdx++) {
    const primary = matrix[primaryIdx]!;
    if (!rowQualifiesAsProcurementPrimary(primary)) continue;

    const subIdx = primaryIdx + 1;
    const sub = matrix[subIdx]!;
    if (!rowQualifiesAsProcurementSub(sub, primary)) continue;

    const dataStartIdx = firstProcurementDataRowIndex(matrix, subIdx + 1, primary, sub);
    if (dataStartIdx >= matrix.length) continue;

    const sampleDataRow = matrix[dataStartIdx];
    if (!looksLikeTenderProcurementPrimaryHeader(primary, sampleDataRow, sub)) continue;

    return { primaryIdx, subIdx, dataStartIdx };
  }
  return null;
}

function getProcurementLayoutContext(matrix: string[][]): {
  row0: string[];
  row1: string[];
  dataStartIdx: number;
  anchor: ProcurementTableAnchor | null;
} {
  const anchor = findProcurementTableAnchor(matrix);
  if (anchor) {
    return {
      row0: matrix[anchor.primaryIdx] ?? [],
      row1: matrix[anchor.subIdx] ?? [],
      dataStartIdx: anchor.dataStartIdx,
      anchor,
    };
  }
  const row0 = matrix[0] ?? [];
  const row1 = matrix[1] ?? [];
  const dataStartIdx = firstProcurementDataRowIndex(matrix, 2, row0, row1);
  return { row0, row1, dataStartIdx, anchor: null };
}

function looksLikeTenderProcurementSubHeader(sub: unknown[], primary: unknown[]): boolean {
  const { planFact, otkl, structuralGroups } = countProcurementSubHeaderPlanFactOtkl(sub);
  if (planFact >= 2 || (planFact >= 1 && otkl >= 1)) return true;
  if (structuralGroups >= 2) return true;

  const primaryS = primary.map((c) => String(c ?? "").trim().toLowerCase()).join(" ");
  const primaryHintsProcurement =
    primaryS.includes("начало тендера") ||
    primaryS.includes("заключен") ||
    primaryS.includes("стоимость") ||
    primaryS.includes("договор") ||
    (primaryS.includes("статей") && primaryS.includes("id код"));
  return primaryHintsProcurement && planFact >= 1;
}

function matrixToRowObjects(matrixRows: string[][], headerKeys: string[]): Record<string, string>[] {
  return matrixRows.map((cells) => {
    const obj: Record<string, string> = {};
    headerKeys.forEach((key, i) => {
      obj[key] = cells[i] == null ? "" : String(cells[i]).trim();
    });
    return obj;
  });
}

function coerceCellText(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

/**
 * Чтение ячейки по индексу ColumnMap.
 * Строка данных может быть объектом {заголовок: значение} или массивом ячеек CSV —
 * ColumnMap строится по merged headers, индексы относятся к позиции в строке матрицы.
 */
function cellByIndex(row: Record<string, unknown>, headers: string[], idx: number): string {
  if (idx < 0) return "";

  if (Array.isArray(row)) {
    return idx < row.length ? coerceCellText(row[idx]) : "";
  }

  const key = headers[idx];
  if (key !== undefined && Object.prototype.hasOwnProperty.call(row, key)) {
    return coerceCellText(row[key]);
  }

  const numKey = String(idx);
  if (Object.prototype.hasOwnProperty.call(row, numKey)) {
    return coerceCellText(row[numKey]);
  }

  return "";
}

/**
 * Единая карта колонок по заголовкам CSV (без фиксированных индексов).
 */
export function buildTenderColumnMap(
  headers: string[],
  layout: TenderCsvLayout = "flat",
): TenderColumnMap {
  return buildTenderColumnMapWithDiagnostics(headers, layout).colMap;
}

/** @deprecated Используйте buildTenderColumnMap(headers, "procurement"). */
export function buildTenderProcurementColumnMap(mergedHeaders: string[]): TenderColumnMap {
  return buildTenderColumnMap(mergedHeaders, "procurement");
}

export type TenderCsvParsed = {
  rows: Record<string, string>[];
  headers: string[];
  parseErrors: number;
  layout: TenderCsvLayout;
  /** Первая строка данных в файле (1-based), для отчёта об ошибках. */
  dataStartFileRow: number;
};

function parseTenderProcurementMatrix(
  matrix: string[][],
  parseErrors: number,
): TenderCsvParsed | null {
  const anchor = findProcurementTableAnchor(matrix);
  if (!anchor) return null;

  const row0 = matrix[anchor.primaryIdx]!;
  const row1 = matrix[anchor.subIdx]!;
  const dataStartIdx = anchor.dataStartIdx;

  const alignedSub = alignProcurementSubHeaderRow(row0, row1);
  const merged = mergeTwoHeaderRows(row0, alignedSub);
  const headers = makeUniqueHeaderKeys(merged);
  const dataMatrix = matrix
    .slice(dataStartIdx)
    .filter((row) => isProcurementDataRow(row, row0, row1));
  const rows = matrixToRowObjects(dataMatrix, headers);

  return {
    rows,
    headers,
    parseErrors,
    layout: "procurement",
    dataStartFileRow: dataStartIdx + 1,
  };
}

function parseTenderFlatMatrix(matrix: string[][], parseErrors: number): TenderCsvParsed | null {
  const headerIdx = matrix.findIndex((row) => {
    const joined = row.map((c) => normalizeHeaderCell(String(c ?? ""))).join(" ");
    return joined.includes("шифр") || joined.includes("наименование") || joined.includes("id код") || joined.includes("этап работ");
  });
  if (headerIdx < 0) return null;

  const headerRaw = matrix[headerIdx]!.map((c) =>
    String(c ?? "")
      .replace(/^\uFEFF/, "")
      .trim()
      .replace(/\s+/g, " "),
  );
  const headers = makeUniqueHeaderKeys(headerRaw);
  const dataMatrix = matrix.slice(headerIdx + 1);
  const rows = matrixToRowObjects(dataMatrix, headers);

  return {
    rows,
    headers,
    parseErrors,
    layout: "flat",
    dataStartFileRow: headerIdx + 2,
  };
}

function extractTenderCsvMatrix(csvText: string): {
  matrix: string[][];
  /** Матрица до удаления полностью пустых строк (для procurement: пустая строка между шапкой и данными). */
  rawMatrix: string[][];
  parseErrors: number;
  parseErrorDetails: Papa.ParseError[];
} {
  const delimiter = sniffCsvDelimiter(csvText);
  const result = Papa.parse<string[]>(stripBom(csvText), {
    header: false,
    skipEmptyLines: true,
    delimiter,
  });
  const parseErrors = result.errors?.length ?? 0;
  const rawMatrix = (Array.isArray(result.data) ? result.data : []).filter((row) =>
    Array.isArray(row),
  ) as string[][];
  const matrix = rawMatrix.filter((row) =>
    row.some((c) => String(c ?? "").trim() !== ""),
  ) as string[][];
  return { matrix, rawMatrix, parseErrors, parseErrorDetails: result.errors ?? [] };
}

export type TenderCsvLayoutDiagnostic = {
  detectedHeaders: string[];
  detectedLayout: TenderCsvLayout;
  reason: string;
  expectedProcurementBecause: string[];
  missingProcurementSignals: string[];
  signals: {
    primary: {
      hasSerial: boolean;
      hasName: boolean;
      hasTenderSheet: boolean;
      gprArticles: boolean;
      structuralDataRow: boolean;
      passed: boolean;
    };
    subHeader: {
      planFact: number;
      otkl: number;
      structuralGroups: number;
      passed: boolean;
    };
    flatHeaderRowIndex: number | null;
    procurementPathAvailable: boolean;
  };
};

function buildPrimaryHeaderSignalReport(
  row0: unknown[],
  sampleDataRow?: unknown[],
  subHeaderRow?: unknown[],
) {
  const cells = row0.map((c) => normalizeHeaderCell(String(c ?? "")));
  const c0 = cells[0] ?? "";
  const joined = cells.join(" ");
  const hasSerial = /п\/п|^№/.test(c0) || c0.includes("номер") || c0.includes("статей");
  const hasName =
    joined.includes("наименование") ||
    joined.includes("этап работ") ||
    joined.includes("id код");
  const hasTenderSheet =
    joined.includes("начало тендера") ||
    joined.includes("заключен") ||
    joined.includes("стоимость") ||
    joined.includes("договор") ||
    joined.includes("тендер");
  const gprArticles =
    joined.includes("статей") &&
    joined.includes("id код") &&
    (joined.includes("этап работ") || joined.includes("гпр") || joined.includes("отставание"));
  const structuralDataRow =
    hasGprCodeInSampleDataRow(sampleDataRow, row0, subHeaderRow) && row0.length >= 8;
  const passed = looksLikeTenderProcurementPrimaryHeader(row0, sampleDataRow, subHeaderRow);
  return { hasSerial, hasName, hasTenderSheet, gprArticles, structuralDataRow, passed };
}

/** Только диагностика: почему parseTenderProcurementMatrix вернул null. */
function describeProcurementMatrixSkipReason(matrix: string[][]): string {
  if (matrix.length < 2) {
    return "parseTenderProcurementMatrix: matrix.length < 2";
  }
  for (let primaryIdx = 0; primaryIdx < matrix.length - 1; primaryIdx++) {
    const primary = matrix[primaryIdx]!;
    if (!rowQualifiesAsProcurementPrimary(primary)) continue;
    const subIdx = primaryIdx + 1;
    const sub = matrix[subIdx]!;
    if (!rowQualifiesAsProcurementSub(sub, primary)) {
      return `parseTenderProcurementMatrix: sub header после строки ${primaryIdx + 1} не прошёл План/Факт/Откл.`;
    }
    const dataStartIdx = firstProcurementDataRowIndex(matrix, subIdx + 1, primary, sub);
    if (dataStartIdx >= matrix.length) {
      return "parseTenderProcurementMatrix: нет строк данных после sub header";
    }
    const sampleDataRow = matrix[dataStartIdx];
    if (!looksLikeTenderProcurementPrimaryHeader(primary, sampleDataRow, sub)) {
      return `parseTenderProcurementMatrix: primary строка ${primaryIdx + 1} не прошла проверку с данными`;
    }
  }
  return "parseTenderProcurementMatrix: не найдена GPR-таблица (ID Код + Этап работ + ГПР / legacy primary)";
}

function emitTenderCsvLayoutSelectionTrace(
  matrix: string[][],
  parsePath: LayoutSelectionTrace["parsePath"],
  detectedLayout: TenderCsvLayout,
  selectionReason: string,
  procurementMatrixNullReason?: string | null,
): void {
  const ctx = getProcurementLayoutContext(matrix);
  const row0 = ctx.row0;
  const row1 = ctx.row1;
  const dataStartIdx = ctx.dataStartIdx;
  const sampleDataRow = dataStartIdx < matrix.length ? matrix[dataStartIdx] : undefined;
  const primary = buildPrimaryHeaderSignalReport(row0, sampleDataRow, row1);
  const { planFact, otkl, structuralGroups } = countProcurementSubHeaderPlanFactOtkl(row1);
  const subPassed = rowQualifiesAsProcurementSub(row1, row0);
  const procurementPathAvailable =
    ctx.anchor != null && primary.passed && subPassed && dataStartIdx < matrix.length;
  const flatHeaderIdx = matrix.findIndex((row) => {
    const joined = row.map((c) => normalizeHeaderCell(String(c ?? ""))).join(" ");
    return (
      joined.includes("шифр") ||
      joined.includes("наименование") ||
      joined.includes("id код") ||
      joined.includes("этап работ")
    );
  });

  const trace = buildLayoutSelectionTrace({
    matrixRowCount: matrix.length,
    row0,
    row1,
    row2: sampleDataRow,
    primary,
    subHeader: { planFact, otkl, structuralGroups, passed: subPassed },
    flatHeaderRowIndex: flatHeaderIdx >= 0 ? flatHeaderIdx : null,
    procurementPathAvailable,
    detectedLayout,
    selectionReason,
    parsePath,
    procurementMatrixNullReason: procurementMatrixNullReason ?? null,
  });
  logTenderCsvLayoutSelectionTrace(trace);
}

/** Диагностика выбора layout до/после parse (признаки procurement vs flat). */
export function diagnoseTenderCsvLayoutSelection(csvText: string): TenderCsvLayoutDiagnostic {
  const { rawMatrix } = extractTenderCsvMatrix(csvText);
  const matrix = rawMatrix;
  const ctx = getProcurementLayoutContext(matrix);
  const row0 = ctx.row0;
  const row1 = ctx.row1;
  const dataStartIdx = ctx.dataStartIdx;
  const sampleDataRow = dataStartIdx < matrix.length ? matrix[dataStartIdx] : undefined;
  const primary = buildPrimaryHeaderSignalReport(row0, sampleDataRow, row1);
  const { planFact, otkl, structuralGroups } = countProcurementSubHeaderPlanFactOtkl(row1);
  const subPassed = rowQualifiesAsProcurementSub(row1, row0);
  const procurementPathAvailable =
    ctx.anchor != null && primary.passed && subPassed && dataStartIdx < matrix.length;

  const flatHeaderIdx = matrix.findIndex((row) => {
    const joined = row.map((c) => normalizeHeaderCell(String(c ?? ""))).join(" ");
    return (
      joined.includes("шифр") ||
      joined.includes("наименование") ||
      joined.includes("id код") ||
      joined.includes("этап работ")
    );
  });

  const expectedProcurementBecause: string[] = [];
  const missingProcurementSignals: string[] = [];
  let detectedLayout: TenderCsvLayout = "flat";
  let reason: string;

  if (procurementPathAvailable) {
    detectedLayout = "procurement";
    reason =
      "Двухуровневая шапка закупок: первая строка — названия колонок, вторая — План/Факт/Откл.";
    if (primary.gprArticles) {
      expectedProcurementBecause.push("GPR-статьи: «№ статей» + «ID Код» + этап/ГПР");
    }
    if (primary.structuralDataRow) {
      expectedProcurementBecause.push(
        "Структурный признак: во 2-й строке данных колонка B — код ГПР (N.N.N)",
      );
    }
    if (primary.hasTenderSheet) {
      expectedProcurementBecause.push("Колонки тендера: начало / договор / стоимость");
    }
    if (subPassed) {
      expectedProcurementBecause.push(
        `Подзаголовок: план/факт=${planFact}, откл.=${otkl}, структурных групп=${structuralGroups}`,
      );
    }
  } else {
    if (matrix.length < 3) {
      missingProcurementSignals.push("Меньше 3 непустых строк (нет подзаголовка и данных)");
    }
    if (!primary.passed) {
      if (!primary.hasSerial) {
        missingProcurementSignals.push("Первая строка: нет № / п/п / статей");
      }
      if (!primary.hasName) {
        missingProcurementSignals.push("Первая строка: нет наименование / этап работ / id код");
      }
      if (!primary.hasTenderSheet && !primary.gprArticles && !primary.structuralDataRow) {
        missingProcurementSignals.push(
          "Первая строка: нет блока тендера / договора / стоимости / GPR-статей / GPR-кода в данных",
        );
      }
    }
    if (!subPassed && matrix.length >= 3) {
      missingProcurementSignals.push(
        `Вторая строка: план/факт=${planFact} (нужно ≥2 или ≥1+откл), откл.=${otkl}, структурных групп=${structuralGroups} (нужно ≥2)`,
      );
    }
    if (flatHeaderIdx >= 0) {
      reason = `Выбран flat: строка ${flatHeaderIdx + 1} похожа на одноуровневый заголовок; procurement-признаки не прошли`;
    } else {
      reason =
        "Выбран flat: fallback Papa header=true — procurement и flat-matrix не сработали";
    }
    if (primary.gprArticles || planFact >= 1 || structuralGroups >= 1) {
      expectedProcurementBecause.push("Файл похож на GPR/тендерную матрицу с двухуровневой шапкой");
      if (!primary.passed) {
        expectedProcurementBecause.push("…но первая строка не прошла порог primary header");
      }
      if (!subPassed) {
        expectedProcurementBecause.push("…и вторая строка не распознана как подзаголовок План/Факт");
      }
    }
  }

  let detectedHeaders: string[];
  if (procurementPathAvailable && ctx.anchor) {
    const alignedSub = alignProcurementSubHeaderRow(matrix[ctx.anchor.primaryIdx]!, matrix[ctx.anchor.subIdx]!);
    detectedHeaders = makeUniqueHeaderKeys(
      mergeTwoHeaderRows(matrix[ctx.anchor.primaryIdx]!, alignedSub),
    );
  } else if (flatHeaderIdx >= 0) {
    detectedHeaders = makeUniqueHeaderKeys(
      matrix[flatHeaderIdx]!.map((c) =>
        String(c ?? "")
          .replace(/^\uFEFF/, "")
          .trim()
          .replace(/\s+/g, " "),
      ),
    );
  } else {
    detectedHeaders = row0.map((c) => String(c ?? "").trim()).filter(Boolean);
  }

  const diag: TenderCsvLayoutDiagnostic = {
    detectedHeaders,
    detectedLayout,
    reason,
    expectedProcurementBecause,
    missingProcurementSignals,
    signals: {
      primary,
      subHeader: { planFact, otkl, structuralGroups, passed: subPassed },
      flatHeaderRowIndex: flatHeaderIdx >= 0 ? flatHeaderIdx : null,
      procurementPathAvailable,
    },
  };

  emitTenderCsvLayoutSelectionTrace(
    matrix,
    "diagnose_only",
    detectedLayout,
    reason,
    procurementPathAvailable ? null : describeProcurementMatrixSkipReason(matrix),
  );

  return diag;
}

export function logTenderCsvLayoutDiagnostics(diag: TenderCsvLayoutDiagnostic): void {
  if (typeof console === "undefined") return;
  console.info("[tender-import] Detected headers:", diag.detectedHeaders);
  console.info("[tender-import] Detected layout:", diag.detectedLayout);
  console.info("[tender-import] Reason:", diag.reason);
  if (diag.expectedProcurementBecause.length > 0) {
    console.info(
      "[tender-import] Expected procurement because:",
      diag.expectedProcurementBecause.join("; "),
    );
  }
  if (diag.missingProcurementSignals.length > 0) {
    console.info(
      "[tender-import] Missing procurement signals:",
      diag.missingProcurementSignals.join("; "),
    );
  }
}

/**
 * Если Parser вернул flat, но матрица подходит под procurement — пересобрать parsed с layout=procurement.
 * Не меняет Parser/Normalizer, только исправляет выбранный layout.
 */
export function resolveTenderCsvImportParsed(
  csvText: string,
  parsed: TenderCsvParsed,
): TenderCsvParsed {
  if (parsed.layout === "procurement") return parsed;
  const { rawMatrix, parseErrors } = extractTenderCsvMatrix(csvText);
  const procurement = parseTenderProcurementMatrix(rawMatrix, parseErrors);
  return procurement ?? parsed;
}

/** CSV → строки; при двухуровневой шапке закупок данные после sub header (с пропуском пустых строк). */
export function parseTenderCsvText(csvText: string): TenderCsvParsed {
  const delimiter = sniffCsvDelimiter(csvText);
  const { matrix, rawMatrix, parseErrors, parseErrorDetails } = extractTenderCsvMatrix(csvText);
  if (parseErrors > 0) {
    console.warn("[tenders CSV]", parseErrorDetails.slice(0, 5));
  }

  const procurementSkipReason = describeProcurementMatrixSkipReason(rawMatrix);
  const procurement = parseTenderProcurementMatrix(rawMatrix, parseErrors);
  if (procurement) {
    emitTenderCsvLayoutSelectionTrace(
      rawMatrix,
      "procurement_matrix",
      "procurement",
      "parseTenderProcurementMatrix: двухуровневая шапка, данные с 3-й строки",
      null,
    );
    return procurement;
  }

  const flat = parseTenderFlatMatrix(matrix, parseErrors);
  if (flat) {
    emitTenderCsvLayoutSelectionTrace(
      rawMatrix,
      "flat_matrix",
      "flat",
      `parseTenderFlatMatrix: одноуровневый заголовок (строка ${flat.dataStartFileRow - 1})`,
      procurementSkipReason,
    );
    return flat;
  }

  const legacy = Papa.parse<Record<string, string>>(stripBom(csvText), {
    header: true,
    skipEmptyLines: true,
    delimiter,
    transformHeader: (h: string) => h.replace(/^\uFEFF/, "").trim(),
  });
  const rows = (Array.isArray(legacy.data) ? legacy.data : []).filter(
    (row) => row && typeof row === "object" && Object.keys(row).length > 0,
  );
  const headers = legacy.meta.fields?.map((h) => h.replace(/^\uFEFF/, "").trim()) ?? [];

  emitTenderCsvLayoutSelectionTrace(
    rawMatrix,
    "legacy_header",
    "flat",
    "fallback Papa.parse header=true — procurement и flat-matrix не сработали",
    procurementSkipReason,
  );

  return {
    rows,
    headers,
    parseErrors,
    layout: "flat",
    dataStartFileRow: 2,
  };
}

export async function parseTenderCsvFile(file: File): Promise<TenderCsvParsed> {
  const text = await readCsvFileTextSmart(file);
  return parseTenderCsvText(text);
}

function getMappedCell(
  row: Record<string, unknown>,
  headers: string[],
  colMap: TenderColumnMap,
  key: TenderColumnMapKey,
): string {
  const idx = colMap[key];
  if (idx === undefined || idx < 0) return "";
  return cellByIndex(row, headers, idx);
}

function parseBudget(raw: string): number | undefined {
  const s = raw.replace(/\s/g, "").replace(/\u00a0/g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

function parseDateToIso(raw: string): string | null {
  const t = raw.trim();
  if (!t || t === "—" || t === "-") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  return ruDateCellToIsoOrNull(t.replace(/\//g, "."));
}

function mapStatus(s: string): TenderProcurementStatus | undefined {
  const t = s.toLowerCase();
  if (!t) return undefined;
  if (/план|заплан|^planned$/i.test(t)) return "planned";
  if (/работ|прогресс|progress|в процес|^in_progress$/i.test(t)) return "in_progress";
  if (/заверш|^completed$/i.test(t)) return "completed";
  if (/задерж|^delayed$/i.test(t)) return "delayed";
  return undefined;
}

function parsePartIdFromCell(raw: string, stage: string): number {
  const t = raw.trim().toLowerCase();
  if (!t) return inferPartIdFromStage(stage);
  if (t === "2" || /стоянк|паркинг|parking/.test(t)) return 2;
  if (t === "1" || /жил|дом|residential/.test(t)) return 1;
  return inferPartIdFromStage(stage);
}

function newIdFallback(index: number): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tender-import-${Date.now()}-${index}`;
}

function resolveCode(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = normalizeGprWorkCodeFromCsvRaw(trimmed);
  if (normalized) return normalized;
  const digits = trimmed.replace(/[^\d.]/g, "").replace(/\.+$/, "");
  const parts = digits.split(".").filter(Boolean);
  if (parts.length >= 2) return parts.join(".");
  return null;
}

function rowLooksEmpty(row: Record<string, unknown>): boolean {
  return Object.values(row).every((v) => v == null || String(v).trim() === "");
}

/** Строка матрицы CSV без ни одной непустой ячейки (только ;;; или пробелы). */
function isMatrixRowAllEmpty(row: unknown[]): boolean {
  return row.every((c) => c == null || String(c).trim() === "");
}

/** Строка с данными статьи ГПР (не сводная/разделитель). */
function isProcurementDataRow(row: unknown[], primary: unknown[], sub: unknown[]): boolean {
  if (isMatrixRowAllEmpty(row)) return false;
  const { articleCol, codeCol } = resolveProcurementArticleAndCodeColumns(primary, sub);
  const article = String(row[articleCol] ?? "").trim();
  if (!article) return false;
  return findGprCodeInProcurementDataRow(row, articleCol, codeCol) != null;
}

/** Первая строка данных после sub header: пустые → сводные без №/ID Код → первая с кодом ГПР. */
function firstProcurementDataRowIndex(
  matrix: string[][],
  afterSubHeaderIndex: number,
  primary: unknown[],
  sub: unknown[],
): number {
  let idx = afterSubHeaderIndex;
  while (idx < matrix.length) {
    const row = matrix[idx]!;
    if (isProcurementDataRow(row, primary, sub)) return idx;
    idx += 1;
  }
  return idx;
}

function buildColumnUsage(headers: string[], colMap: TenderColumnMap): Record<string, "mapped" | "ignored"> {
  const usage: Record<string, "mapped" | "ignored"> = {};
  const mappedIndices = new Set(
    Object.values(colMap).filter((i): i is number => typeof i === "number" && i >= 0),
  );
  headers.forEach((h, i) => {
    usage[h] = mappedIndices.has(i) ? "mapped" : "ignored";
  });
  return usage;
}

function unmappedHeaders(headers: string[], colMap: TenderColumnMap): string[] {
  const mappedIndices = new Set(
    Object.values(colMap).filter((i): i is number => typeof i === "number" && i >= 0),
  );
  return headers.filter((_, i) => !mappedIndices.has(i));
}

type RowExtract = {
  idRaw: string;
  code: string;
  name: string;
  stage: string;
  planStart: string | null;
  factStart: string | undefined;
  planContractDate: string | null;
  factContractDate: string | undefined;
  cost: number | undefined;
  factCost: number | undefined;
  contractor: string | undefined;
  comment: string | undefined;
  statusRaw: string;
  partId: number;
};

function extractTenderRowProcurement(
  row: Record<string, unknown>,
  headers: string[],
  colMap: TenderColumnMap,
): RowExtract | null {
  const codeIdx = colMap.code;
  const codeRaw = getMappedCell(row, headers, colMap, "code");
  const trimmedCode = codeRaw.trim();
  const code = resolveCode(codeRaw);

  if (shouldTraceExtractTenderRowProcurement()) {
    const headerKey = codeIdx >= 0 ? (headers[codeIdx] ?? "") : "";
    const rowByHeaderKey =
      headerKey && Object.prototype.hasOwnProperty.call(row, headerKey)
        ? String(row[headerKey] ?? "")
        : "";
    logCodeTraceExtractProcurement({
      rowIndex: 0,
      rawCode: codeRaw,
      trimmedCode,
      codeColumnIndex: codeIdx,
      rowAtColumnIndex: cellByIndex(row, headers, codeIdx),
      rowByHeaderKey,
      resolvedCode: code,
    });
  }

  if (!code) return null;

  const name = getMappedCell(row, headers, colMap, "name");
  if (!name.trim()) return null;

  const stage = (getGprStageFromTenderCode(code) || "2.05").trim();
  const idRaw = getMappedCell(row, headers, colMap, "id");
  const planStart = parseDateToIso(getMappedCell(row, headers, colMap, "planStart"));
  const factStart = parseDateToIso(getMappedCell(row, headers, colMap, "factStart")) ?? undefined;
  const planContractDate = parseDateToIso(getMappedCell(row, headers, colMap, "planContractDate"));
  const factContractDate =
    parseDateToIso(getMappedCell(row, headers, colMap, "factContractDate")) ?? undefined;

  const costPlanRaw = getMappedCell(row, headers, colMap, "cost");
  const costFactRaw = getMappedCell(row, headers, colMap, "factCost");
  const cost = costPlanRaw ? parseBudget(costPlanRaw) : undefined;
  const factCost = costFactRaw ? parseBudget(costFactRaw) : undefined;
  const contractor = getMappedCell(row, headers, colMap, "contractor") || undefined;
  const comment = getMappedCell(row, headers, colMap, "comment") || undefined;
  const statusRaw = getMappedCell(row, headers, colMap, "status");
  const partRaw = getMappedCell(row, headers, colMap, "partId");

  return {
    idRaw,
    code,
    name: name.trim(),
    stage,
    planStart,
    factStart,
    planContractDate,
    factContractDate,
    cost,
    factCost,
    contractor,
    comment,
    statusRaw,
    partId: parsePartIdFromCell(partRaw, stage),
  };
}

function extractTenderRowFlat(
  row: Record<string, unknown>,
  headers: string[],
  colMap: TenderColumnMap,
): RowExtract | null {
  const codeRaw = getMappedCell(row, headers, colMap, "code");
  const code = resolveCode(codeRaw);
  if (!code) return null;

  const name = getMappedCell(row, headers, colMap, "name");
  if (!name.trim()) return null;

  const stageRaw = getMappedCell(row, headers, colMap, "stage");
  const stage = (stageRaw.trim() || getGprStageFromTenderCode(code) || "2.05").trim();
  const idRaw = getMappedCell(row, headers, colMap, "id");

  const planStart = parseDateToIso(getMappedCell(row, headers, colMap, "planStart"));
  const factStart = parseDateToIso(getMappedCell(row, headers, colMap, "factStart")) ?? undefined;
  const planContractDate = parseDateToIso(getMappedCell(row, headers, colMap, "planContractDate"));
  const factContractDate =
    parseDateToIso(getMappedCell(row, headers, colMap, "factContractDate")) ?? undefined;
  const costRaw = getMappedCell(row, headers, colMap, "cost");
  const cost = costRaw ? parseBudget(costRaw) : undefined;
  const contractor = getMappedCell(row, headers, colMap, "contractor") || undefined;
  const comment = getMappedCell(row, headers, colMap, "comment") || undefined;
  const statusRaw = getMappedCell(row, headers, colMap, "status");
  const partRaw = getMappedCell(row, headers, colMap, "partId");

  return {
    idRaw,
    code,
    name: name.trim(),
    stage,
    planStart,
    factStart,
    planContractDate,
    factContractDate,
    cost,
    factCost: undefined,
    contractor,
    comment,
    statusRaw,
    partId: parsePartIdFromCell(partRaw, stage),
  };
}

export function normalizeTenderCsvRowsWithAudit(
  rows: Record<string, unknown>[],
  headers: string[] = [],
  options?: {
    layout?: TenderCsvLayout;
    dataStartFileRow?: number;
    traceFirstRowCode?: boolean;
    traceNormalizeDiagnostics?: boolean;
  },
): TenderCsvNormalizeResult {
  const layout = options?.layout ?? "flat";
  const dataStartFileRow = options?.dataStartFileRow ?? 2;
  const traceFirstRowCode = options?.traceFirstRowCode ?? false;
  const traceNormalize =
    options?.traceNormalizeDiagnostics ?? traceFirstRowCode;
  if (traceFirstRowCode) enableTenderCsvFirstRowCodeTrace();
  const resolvedHeaders =
    headers.length > 0
      ? headers
      : rows.length > 0
        ? Object.keys(rows[0] as Record<string, unknown>)
        : [];

  const { colMap, diagnostics } = buildTenderColumnMapWithDiagnostics(resolvedHeaders, layout);
  logTenderColumnMapDiagnostics(diagnostics, resolvedHeaders);

  if (traceFirstRowCode && rows.length > 0) {
    const codeIdx = colMap.code;
    const csvHeader = codeIdx >= 0 ? (resolvedHeaders[codeIdx] ?? "") : "";
    const firstRow = rows[0] as Record<string, unknown>;
    const cellAtIndex = cellByIndex(firstRow, resolvedHeaders, codeIdx);
    const cellByHeaderKey =
      csvHeader && Object.prototype.hasOwnProperty.call(firstRow, csvHeader)
        ? String(firstRow[csvHeader] ?? "")
        : "";
    logCodeTraceColumnMap({
      codeIndex: codeIdx,
      csvHeader,
      cellAtIndex,
      cellByHeaderKey,
      firstRowKeys: Object.keys(firstRow),
    });
  }

  const columnUsage = buildColumnUsage(resolvedHeaders, colMap);
  const baseAudit: Omit<TenderCsvImportAudit, "loaded" | "skipped" | "skippedRows"> = {
    parsedRows: rows.length,
    parseErrors: 0,
    headers: resolvedHeaders,
    unmappedHeaders: unmappedHeaders(resolvedHeaders, colMap),
    columnUsage,
    layout,
    columnMapDiagnostics: diagnostics,
  };

  if (diagnostics.error) {
    if (traceNormalize) {
      const rejectedByReason: Record<string, number> = { column_map_error: rows.length };
      const extractForTrace =
        layout === "procurement" ? extractTenderRowProcurement : extractTenderRowFlat;
      for (let ri = 0; ri < Math.min(5, rows.length); ri++) {
        const rowTrace = diagnoseNormalizeRow(
          ri,
          dataStartFileRow + ri,
          rows[ri] as Record<string, unknown>,
          resolvedHeaders,
          colMap,
          layout,
          diagnostics.error,
          extractForTrace,
          newIdFallback,
          0,
        );
        logNormalizeRowTrace(rowTrace);
      }
      logNormalizeRejectedSummary(rejectedByReason, {
        layout,
        rowsIn: rows.length,
        loaded: 0,
        skipped: rows.length,
        columnMapError: diagnostics.error,
        headersCount: resolvedHeaders.length,
        codeColumnIndex: colMap.code,
      });
    }
    if (traceFirstRowCode && rows.length > 0) {
      const codePreview = getMappedCell(rows[0] as Record<string, unknown>, resolvedHeaders, colMap, "code");
      logCodeTraceNormalizeSkip({
        rowIndex: 0,
        fileRow: dataStartFileRow,
        extractedCode: null,
        codePreview,
        invalidReason: `column_map_error: ${diagnostics.error}`,
      });
      disableTenderCsvFirstRowCodeTrace();
    }
    return {
      tenders: [],
      audit: {
        ...baseAudit,
        loaded: 0,
        skipped: rows.length,
        skippedRows: [],
      },
    };
  }

  const out: Tender[] = [];
  const skippedRows: TenderCsvSkippedRow[] = [];
  let i = 0;
  const rejectedByReason: Record<string, number> = {};

  const extract =
    layout === "procurement" ? extractTenderRowProcurement : extractTenderRowFlat;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const raw = rows[rowIndex] as Record<string, unknown>;
    const fileRow = dataStartFileRow + rowIndex;

    if (traceNormalize && rowIndex < 5) {
      const rowTrace = diagnoseNormalizeRow(
        rowIndex,
        fileRow,
        raw,
        resolvedHeaders,
        colMap,
        layout,
        null,
        extract,
        newIdFallback,
        i,
      );
      logNormalizeRowTrace(rowTrace);
    }

    if (rowLooksEmpty(raw)) {
      if (traceFirstRowCode && rowIndex === 0) {
        logCodeTraceNormalizeSkip({
          rowIndex: 0,
          fileRow,
          extractedCode: null,
          codePreview: "",
          invalidReason: "empty_row",
        });
      }
      skippedRows.push({
        rowIndex: fileRow,
        reason: "empty_row",
        codePreview: "",
        namePreview: "",
      });
      incrementRejectReason(rejectedByReason, "empty_row");
      continue;
    }

    const codePreview = getMappedCell(raw, resolvedHeaders, colMap, "code");
    const namePreview = getMappedCell(raw, resolvedHeaders, colMap, "name");

    setTenderCsvCodeTraceExtractRow(rowIndex);
    const extracted = extract(raw, resolvedHeaders, colMap);
    clearTenderCsvCodeTraceExtractRow();

    if (!extracted) {
      const invalidReason = !codePreview.trim()
        ? "missing_code"
        : !namePreview.trim()
          ? "missing_name"
          : "invalid_code";
      if (traceFirstRowCode && rowIndex === 0) {
        logCodeTraceNormalizeSkip({
          rowIndex: 0,
          fileRow,
          extractedCode: null,
          codePreview,
          invalidReason,
        });
      }
      skippedRows.push({
        rowIndex: fileRow,
        reason: invalidReason,
        codePreview: codePreview.slice(0, 40),
        namePreview: namePreview.slice(0, 60),
      });
      incrementRejectReason(rejectedByReason, invalidReason);
      continue;
    }

    if (traceFirstRowCode && rowIndex === 0) {
      logCodeTraceNormalizeSuccess({
        rowIndex: 0,
        fileRow,
        extractedCode: extracted.code,
      });
    }

    const id = extracted.idRaw || newIdFallback(i);
    i += 1;

    const plain: Record<string, unknown> = {
      id,
      code: extracted.code,
      name: extracted.name,
      stage: extracted.stage,
      partId: extracted.partId,
      planStart: extracted.planStart,
      factStart: extracted.factStart ?? null,
      planContractDate: extracted.planContractDate,
      factContractDate: extracted.factContractDate ?? null,
      cost: extracted.cost,
      factCost: extracted.factCost,
      contractor: extracted.contractor,
      comment: extracted.comment,
      status: mapStatus(extracted.statusRaw),
      statusLabel: extracted.statusRaw.trim() || undefined,
      cycleStatus: normalizeTenderCycleStatus(extracted.statusRaw),
    };

    const t = coerceTender(plain);
    if (!t) {
      skippedRows.push({
        rowIndex: fileRow,
        reason: "coerce_failed",
        codePreview: extracted.code,
        namePreview: extracted.name.slice(0, 60),
      });
      incrementRejectReason(rejectedByReason, "coerce_failed");
      continue;
    }
    out.push(t);
  }

  if (traceNormalize) {
    logNormalizeRejectedSummary(rejectedByReason, {
      layout,
      rowsIn: rows.length,
      loaded: out.length,
      skipped: skippedRows.length,
      columnMapError: diagnostics.error,
      headersCount: resolvedHeaders.length,
      codeColumnIndex: colMap.code,
    });
  }

  if (traceFirstRowCode) disableTenderCsvFirstRowCodeTrace();

  return {
    tenders: out,
    audit: {
      ...baseAudit,
      loaded: out.length,
      skipped: skippedRows.length,
      skippedRows,
    },
  };
}

export function normalizeTenderCsvRows(rows: Record<string, unknown>[]): Tender[] {
  return normalizeTenderCsvRowsWithAudit(rows).tenders;
}

function excelColumnLetter(zeroBasedIndex: number): string {
  let n = zeroBasedIndex + 1;
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

function procurementRawCellsByColumn(
  row: Record<string, unknown>,
  headers: string[],
  colMap: TenderColumnMap,
): Record<string, string> {
  const out: Record<string, string> = {};
  const keys: TenderColumnMapKey[] = [
    "id",
    "code",
    "name",
    "stage",
    "planStart",
    "factStart",
    "planContractDate",
    "factContractDate",
    "cost",
    "factCost",
    "contractor",
    "status",
  ];
  for (const key of keys) {
    const colIdx = colMap[key];
    if (colIdx < 0) continue;
    const letter = excelColumnLetter(colIdx);
    out[`${letter} (${key})`] = cellByIndex(row, headers, colIdx);
  }
  return out;
}

export type TenderRowCodeReadTrace = {
  fileRow: number;
  rowIsArray: boolean;
  rowPreview: string;
  codeIndex: number;
  codeHeader: string;
  rawByIndex: string;
  rawByHeaderKey: string;
  afterTrim: string;
  afterResolveCode: string | null;
  recordCode: string | null;
  skipReason: TenderCsvSkipReason | null;
};

/**
 * Диагностика чтения code для первых N строк: CSV row → getMappedCell → resolveCode.
 * Не меняет ColumnMap и Parser.
 */
export function traceTenderRowCodeReadDiagnostics(
  parsed: TenderCsvParsed,
  maxRows = 5,
): TenderRowCodeReadTrace[] {
  const { colMap } = buildTenderColumnMapWithDiagnostics(parsed.headers, parsed.layout);
  const codeIdx = colMap.code;
  const codeHeader = parsed.headers[codeIdx] ?? "";
  const extract =
    parsed.layout === "procurement" ? extractTenderRowProcurement : extractTenderRowFlat;
  const traces: TenderRowCodeReadTrace[] = [];

  for (let i = 0; i < Math.min(maxRows, parsed.rows.length); i++) {
    const row = parsed.rows[i] as Record<string, unknown>;
    const rawByIndex = Array.isArray(row)
      ? coerceCellText(row[codeIdx])
      : coerceCellText((row as Record<string, unknown>)[String(codeIdx)]);
    const rawByHeaderKey =
      codeHeader && !Array.isArray(row) && Object.prototype.hasOwnProperty.call(row, codeHeader)
        ? coerceCellText(row[codeHeader])
        : "";
    const mapped = getMappedCell(row, parsed.headers, colMap, "code");
    const resolved = resolveCode(mapped);
    const extracted = extract(row, parsed.headers, colMap);
    const fileRow = parsed.dataStartFileRow + i;

    let skipReason: TenderCsvSkipReason | null = null;
    if (!extracted) {
      const namePreview = getMappedCell(row, parsed.headers, colMap, "name");
      skipReason = !mapped.trim()
        ? "missing_code"
        : !namePreview.trim()
          ? "missing_name"
          : "invalid_code";
    }

    const rowPreview = Array.isArray(row)
      ? `[${row.slice(0, 8).join(";")}${row.length > 8 ? ";…" : ""}]`
      : Object.entries(row)
          .slice(0, 6)
          .map(([k, v]) => `${k}=${v}`)
          .join("; ");

    traces.push({
      fileRow,
      rowIsArray: Array.isArray(row),
      rowPreview,
      codeIndex: codeIdx,
      codeHeader,
      rawByIndex,
      rawByHeaderKey,
      afterTrim: mapped,
      afterResolveCode: resolved,
      recordCode: extracted?.code ?? null,
      skipReason,
    });
  }

  return traces;
}

/** Диагностика цепочки импорта для одной строки (консоль браузера / CLI). */
export function diagnoseTenderImportFirstRow(
  parsed: TenderCsvParsed,
  tender: Tender | null,
): {
  layout: TenderCsvLayout;
  rawRow: Record<string, string>;
  rawCellsByExcelColumn: Record<string, string>;
  mappedDto: Record<string, unknown> | null;
  savedEntity: Tender | null;
  apiNote: string;
  uiModel: {
    planStart: string | null;
    factStart: string | null;
    planContractDate: string | null;
    factContractDate: string | null;
    deviationDays: number | null;
    cost: number | undefined;
  } | null;
} {
  const rawRow = parsed.rows[0] ?? {};
  const { colMap } = buildTenderColumnMapWithDiagnostics(parsed.headers, parsed.layout);
  const extracted =
    parsed.layout === "procurement"
      ? extractTenderRowProcurement(rawRow, parsed.headers, colMap)
      : extractTenderRowFlat(rawRow, parsed.headers, colMap);

  const mappedDto = extracted
    ? {
        id: extracted.idRaw || "(auto)",
        code: extracted.code,
        name: extracted.name,
        stage: extracted.stage,
        partId: extracted.partId,
        planStart: extracted.planStart,
        factStart: extracted.factStart ?? null,
        planContractDate: extracted.planContractDate,
        factContractDate: extracted.factContractDate ?? null,
        cost: extracted.cost ?? null,
        contractor: extracted.contractor ?? null,
        status: mapStatus(extracted.statusRaw) ?? null,
        comment: extracted.comment ?? null,
      }
    : null;

  return {
    layout: parsed.layout,
    rawRow,
    rawCellsByExcelColumn:
      parsed.layout === "procurement"
        ? procurementRawCellsByColumn(rawRow, parsed.headers, colMap)
        : { ...rawRow },
    mappedDto,
    savedEntity: tender,
    apiNote:
      "Реестр тендеров в edit mode: localStorage (tenders_{projectId}), REST API списка нет.",
    uiModel: tender
      ? {
          planStart: tender.planStart,
          factStart: tender.factStart ?? null,
          planContractDate: tender.planContractDate,
          factContractDate: tender.factContractDate ?? null,
          deviationDays: contractDeviationDays(tender),
          cost: tender.cost,
        }
      : null,
  };
}

export async function importTenderCsvFile(
  file: File,
): Promise<TenderCsvNormalizeResult & { parseErrors: number }> {
  const parsed = await parseTenderCsvFile(file);
  const result = normalizeTenderCsvRowsWithAudit(parsed.rows, parsed.headers, {
    layout: parsed.layout,
    dataStartFileRow: parsed.dataStartFileRow,
  });
  result.audit.parseErrors = parsed.parseErrors;

  if (typeof console !== "undefined" && parsed.rows.length > 0 && result.tenders.length > 0) {
    const firstTender = result.tenders[0] ?? null;
    console.info(
      "[tender-import] диагностика первой строки данных",
      diagnoseTenderImportFirstRow(parsed, firstTender),
    );
  }

  return { ...result, parseErrors: parsed.parseErrors };
}
