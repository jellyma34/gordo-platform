import {
  columnMappingForDiagnostics,
  resolveApartmentPlanHeaders,
} from "@/lib/planDataSource/apartmentPlanCsvColumns";
import {
  columnarPlanMappingForDiagnostics,
  detectLegacyWideTableCsv,
  resolveColumnarPlanHeaders,
  scoreLegacyWideTableColumns,
} from "@/lib/planDataSource/legacyWideTableCsv";
import { detectApartmentPlanBiReportCsv } from "@/lib/planDataSource/parseApartmentPlanBiReportCsv";
import { normalizeCsvHeader } from "@/lib/csvHeaderNormalize";
import { detectRevenueFactCsvHeader } from "@/lib/parseRevenueFactCsv";
import type { ApartmentPlanCsvParseDiagnostics } from "@/lib/planDataSource/types";

export type ApartmentPlanCsvKind =
  | "fact_revenue_csv"
  | "legacy_wide_table"
  | "bi_report"
  | "wide_table"
  | "unknown";

/** Legacy / BI wide-table: в строках нет колонки month, месяц задаётся при импорте. */
export function isRuColumnarPlanCsvType(
  csvType?: ApartmentPlanCsvParseDiagnostics["csvType"] | ApartmentPlanCsvKind,
): boolean {
  return csvType === "legacy_wide_table" || csvType === "bi_report";
}

function normalizeHeaderField(raw: unknown): string {
  return normalizeCsvHeader(raw);
}

/** Есть отдельная колонка «месяц» / period (не «План на отчётный месяц»). */
function hasStandaloneMonthColumn(metaFields: string[]): boolean {
  const norms = metaFields
    .map((h) => String(h ?? "").trim())
    .filter(Boolean)
    .map((h) =>
      h
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/[\u00a0]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    );

  return norms.some((n) => {
    if (n.includes("план") || n.includes("накопит") || n.includes("проект") || n.includes("наименован")) {
      return false;
    }
    if (n === "месяц" || n === "month" || n === "period" || n.includes("month_key")) return true;
    if (n.includes("месяц") && !n.includes("отчет") && !n.includes("отчёт")) return true;
    return false;
  });
}

/**
 * Тип CSV до любой валидации wide-table / BI.
 * Legacy (RU columnar) — первым, чтобы не вызывать resolveApartmentPlanHeaders.
 */
export function detectApartmentPlanCsvType(metaFields: readonly unknown[]): ApartmentPlanCsvKind {
  const fields = metaFields.map(normalizeHeaderField).filter(Boolean);
  if (fields.length && detectRevenueFactCsvHeader(fields)) {
    return "fact_revenue_csv";
  }

  const legacyScore = scoreLegacyWideTableColumns(fields);
  const standaloneMonth = hasStandaloneMonthColumn(fields);

  /** RU columnar («Наименование», «План проекта», …) — всегда legacy, не wide_table с month в строках. */
  if (legacyScore.matched >= 3 && legacyScore.hasName) {
    return "legacy_wide_table";
  }

  if (detectApartmentPlanBiReportCsv(fields) && !standaloneMonth) {
    return "bi_report";
  }

  if (standaloneMonth) {
    const resolved = resolveApartmentPlanHeaders(fields);
    if (!("error" in resolved)) return "wide_table";
  }

  return "unknown";
}

export function planSourceLabelForCsvType(
  csvType: ApartmentPlanCsvParseDiagnostics["csvType"] | undefined,
  hasRows: boolean,
): string {
  if (!hasRows) return "NOT LOADED";
  if (csvType === "fact_revenue_csv") return "NOT KPI PLAN (use revenue fact upload)";
  if (csvType === "legacy_wide_table") return "CSV LEGACY";
  if (csvType === "bi_report") return "CSV BI";
  if (csvType === "wide_table") return "CSV WIDE";
  return "CSV";
}

export function csvTypeLabelRu(csvType: ApartmentPlanCsvParseDiagnostics["csvType"] | undefined): string {
  if (csvType === "fact_revenue_csv") return "Факт поступлений (не план KPI)";
  if (csvType === "legacy_wide_table") return "Legacy wide-table (RU)";
  if (csvType === "bi_report") return "BI Report";
  if (csvType === "wide_table") return "Широкая таблица (нормализованная)";
  return "Не распознан";
}

/** Маппинг колонок для диагностики по типу CSV. */
export function diagnosticsColumnMappingForType(
  csvType: ApartmentPlanCsvKind,
  metaFields: string[],
): Record<string, string> | null {
  if (csvType === "legacy_wide_table" || csvType === "bi_report") {
    const picked = resolveColumnarPlanHeaders(metaFields);
    if ("error" in picked) return null;
    return columnarPlanMappingForDiagnostics(picked.map);
  }
  if (csvType === "wide_table") {
    const resolved = resolveApartmentPlanHeaders(metaFields);
    if ("error" in resolved) return null;
    return columnMappingForDiagnostics(resolved.map);
  }
  return null;
}
