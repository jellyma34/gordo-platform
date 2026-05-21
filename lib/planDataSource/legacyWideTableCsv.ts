import { compactCsvHeader } from "@/lib/csvHeaderNormalize";
import { compactNorm, normalizeApartmentPlanHeader } from "@/lib/planDataSource/apartmentPlanCsvColumns";
import {
  isApartmentRootSummaryRow,
  isCommercialRootSummaryRow,
  isParkingRootSummaryRow,
  isStorageRootSummaryRow,
} from "@/lib/planDataSource/entityRowMatchers";
import { isBiApartmentsSummaryRow } from "@/lib/planDataSource/apartmentPlanKpiEntity";
import { normalizeEntityLabel } from "@/lib/planDataSource/normalize";
import type { BiReportParseResult } from "@/lib/planDataSource/parseApartmentPlanBiReportCsv";
import { parseApartmentPlanBiReportFromGrid } from "@/lib/planDataSource/parseApartmentPlanBiReportCsv";

/** Русские заголовки Excel «Выполнение плана отчётного периода» (без колонки месяца). */
export const LEGACY_WIDE_COLUMN_ALIASES = {
  name: ["наименование"],
  totalVolume: ["план проекта"],
  planMonth: [
    "план на отчет. месяц",
    "план на отчет месяц",
    "план на отчёт. месяц",
    "план на отчётный месяц",
    "план на отчетный месяц",
    "план отчетного месяца",
    "план отчётного месяца",
  ],
  planCumulative: [
    "план накопит. итогом",
    "план накопит итогом",
    "план накопительно итогом",
    "план накопительно",
  ],
} as const;

export type ColumnarPlanHeaderMap = {
  segment: string;
  planProject: string;
  planMonth: string;
  planCumulative: string;
};

type HeaderRow = { index: number; original: string; norm: string; compact: string };

const PLAN_PROJECT_COMPACT = compactCsvHeader("план проекта");

function headerRows(metaFields: string[]): HeaderRow[] {
  return metaFields
    .map((h, index) => {
      const original = String(h ?? "").trim();
      const norm = normalizeApartmentPlanHeader(original);
      return { index, original, norm, compact: compactNorm(original) };
    })
    .filter((h) => h.original !== "");
}

function matchesAlias(header: HeaderRow, aliases: readonly string[]): boolean {
  for (const alias of aliases) {
    const an = normalizeApartmentPlanHeader(alias);
    const ac = compactNorm(alias);
    if (!an) continue;
    if (header.compact === ac) return true;
    if (header.norm === an) return true;
    if (header.norm.includes(an) || an.includes(header.norm)) return true;
    if (header.compact.includes(ac) || ac.includes(header.compact)) return true;
  }
  return false;
}

function isPlanMonthHeader(h: HeaderRow): boolean {
  const n = h.norm;
  const c = h.compact;
  if (!n.includes("план") || n.includes("накопит") || c.includes("накопит")) return false;
  if (c.includes("проект") && !c.includes("отчет") && !c.includes("месяц")) return false;
  return (
    n.includes("отчет") ||
    n.includes("отчёт") ||
    c.includes("отчет") ||
    c.includes("месяц")
  );
}

function isPlanCumulativeHeader(h: HeaderRow): boolean {
  return h.norm.includes("план") && (h.norm.includes("накопит") || h.compact.includes("накопит"));
}

function isPlanProjectHeader(h: HeaderRow): boolean {
  if (h.compact === PLAN_PROJECT_COMPACT || h.compact.startsWith("планпроект")) return true;
  return (
    h.norm.includes("план") &&
    (h.norm.includes("проект") || h.compact.includes("проект")) &&
    !h.norm.includes("накопит") &&
    !h.compact.includes("накопит")
  );
}

function isNameHeader(h: HeaderRow): boolean {
  return h.norm.includes("наименован") || h.compact === "наименование";
}

export type LegacyWideTableColumnScore = {
  hasName: boolean;
  hasPlanProject: boolean;
  hasPlanMonth: boolean;
  hasPlanCum: boolean;
  matched: number;
};

/** Сколько из 4 RU-колонок legacy-таблицы распознано (без требования ровно 4 заголовков в meta). */
export function scoreLegacyWideTableColumns(metaFields: string[]): LegacyWideTableColumnScore {
  const headers = headerRows(metaFields);
  const hasName = headers.some((h) => isNameHeader(h) || matchesAlias(h, LEGACY_WIDE_COLUMN_ALIASES.name));
  const hasPlanProject = headers.some(
    (h) => isPlanProjectHeader(h) || matchesAlias(h, LEGACY_WIDE_COLUMN_ALIASES.totalVolume),
  );
  const hasPlanMonth = headers.some(
    (h) => isPlanMonthHeader(h) || matchesAlias(h, LEGACY_WIDE_COLUMN_ALIASES.planMonth),
  );
  const hasPlanCum = headers.some(
    (h) => isPlanCumulativeHeader(h) || matchesAlias(h, LEGACY_WIDE_COLUMN_ALIASES.planCumulative),
  );
  const matched = [hasName, hasPlanProject, hasPlanMonth, hasPlanCum].filter(Boolean).length;
  return { hasName, hasPlanProject, hasPlanMonth, hasPlanCum, matched };
}

/**
 * Legacy / BI wide-table: «Наименование», «План проекта», «План на отчет. месяц», «План накопит. итогом».
 * Без колонки month — месяц берётся из дашборда / имени файла.
 */
export function detectLegacyWideTableCsv(metaFields: string[]): boolean {
  const { hasName, hasPlanCum, matched } = scoreLegacyWideTableColumns(metaFields);
  if (!hasName || !hasPlanCum) return false;
  return matched >= 3;
}

/** @deprecated Используйте {@link detectLegacyWideTableCsv} — то же семейство колонок. */
export function detectColumnarPlanCsv(metaFields: string[]): boolean {
  return detectLegacyWideTableCsv(metaFields);
}

/**
 * Явное сопоставление колонок columnar-таблицы (без fuzzy month / segment).
 */
export function resolveColumnarPlanHeaders(
  metaFields: string[],
): { map: ColumnarPlanHeaderMap } | { error: string } {
  const headers = headerRows(metaFields);
  if (!headers.length) {
    return { error: "Не удалось прочитать заголовок CSV." };
  }

  const used = new Set<number>();
  const pick = (pred: (h: HeaderRow) => boolean, aliases: readonly string[]): string | null => {
    for (const h of headers) {
      if (used.has(h.index)) continue;
      if (pred(h) || matchesAlias(h, aliases)) {
        used.add(h.index);
        return h.original;
      }
    }
    return null;
  };

  const segment = pick((h) => isNameHeader(h), LEGACY_WIDE_COLUMN_ALIASES.name);
  const planProject = pick((h) => isPlanProjectHeader(h), LEGACY_WIDE_COLUMN_ALIASES.totalVolume);
  const planMonth = pick((h) => isPlanMonthHeader(h), LEGACY_WIDE_COLUMN_ALIASES.planMonth);
  const planCumulative = pick((h) => isPlanCumulativeHeader(h), LEGACY_WIDE_COLUMN_ALIASES.planCumulative);

  if (!segment || !planProject || !planMonth || !planCumulative) {
    const found = headers.map((h) => h.original).join(" · ");
    return {
      error: `Не найдены колонки legacy-таблицы («Наименование», «План проекта», «План на отчётный месяц», «План накопит. итогом»). Заголовки: ${found}`,
    };
  }

  return { map: { segment, planProject, planMonth, planCumulative } };
}

/**
 * Legacy wide-table: только columnar headers + BI grid parser (без validateRequiredColumns wide-table).
 */
function collectLegacyRootRowLabels(
  metaFields: string[],
  rowsIn: Record<string, unknown>[],
  segmentKey: string,
): string[] {
  const roots: string[] = [];
  for (const rec of rowsIn) {
    const raw = rec[segmentKey];
    const rawLabel = raw != null ? String(raw).trim() : "";
    const segmentNorm = normalizeEntityLabel(rawLabel);
    if (!segmentNorm) continue;
    if (
      isApartmentRootSummaryRow(segmentNorm, rawLabel) ||
      isParkingRootSummaryRow(segmentNorm, rawLabel) ||
      isStorageRootSummaryRow(segmentNorm, rawLabel) ||
      isCommercialRootSummaryRow(segmentNorm, rawLabel)
    ) {
      roots.push(rawLabel || segmentNorm);
    }
  }
  return roots;
}

export function parseLegacyWideTableFromGrid(
  metaFields: string[],
  rowsIn: Record<string, unknown>[],
  monthKey: string,
): { ok: true; result: BiReportParseResult } | { ok: false; error: string } {
  console.log("LEGACY PARSER ENABLED");

  const headers = resolveColumnarPlanHeaders(metaFields);
  if ("error" in headers) {
    return { ok: false, error: headers.error };
  }

  const rootRowsPreview = collectLegacyRootRowLabels(
    metaFields,
    rowsIn,
    headers.map.segment,
  );
  console.log("ROOT ROWS", rootRowsPreview);

  const parsed = parseApartmentPlanBiReportFromGrid(metaFields, rowsIn, monthKey);
  if (!parsed.ok) {
    return parsed;
  }

  const apartmentRoot = parsed.result.apartmentsSummary;
  console.log("PLAN ROWS CREATED", parsed.result.rows.length);
  console.log("ROOT APARTMENTS ROW", apartmentRoot);

  const rootInRows = parsed.result.rows.find((r) => isBiApartmentsSummaryRow(r.segmentNorm, r.segmentNorm));
  if (!apartmentRoot && rootInRows) {
    console.log("ROOT APARTMENTS ROW (from rows)", {
      planMonth: rootInRows.planMonth,
      planCumulative: rootInRows.planCumulative,
      totalVolume: rootInRows.totalVolume,
    });
  }

  return parsed;
}

export function columnarPlanMappingForDiagnostics(map: ColumnarPlanHeaderMap): Record<string, string> {
  return {
    segment: map.segment,
    total_volume: map.planProject,
    plan_month: map.planMonth,
    plan_cumulative: map.planCumulative,
    month: "(из периода дашборда / имени файла)",
  };
}
