import { matchApartmentPlanTypeKey } from "@/lib/apartmentPlanTypeKpi";
import { isParkingDetailSegment } from "@/lib/parkingPlanAnalytics";
import { isStorageDetailSegment } from "@/lib/storagePlanAnalytics";
import { isNonApartmentPropertyRow } from "@/lib/planDataSource/apartmentPlanKpiEntity";
import {
  isApartmentRootSummaryRow,
  isCommercialRootSummaryRow,
  isParkingRootSummaryRow,
  isStorageRootSummaryRow,
} from "@/lib/planDataSource/entityRowMatchers";
import {
  legacyProjectValueColumnMappingForDiagnostics,
  projectValueCsvTypeLabel,
  resolveLegacyProjectValueWideHeaders,
} from "@/lib/planDataSource/projectValue/legacyProjectValueWideTableCsv";
import {
  detectProjectValueCsv,
  projectValueCsvColumnMappingForDiagnostics,
  resolveProjectValueCsvHeaders,
  ruProjectValueCsvHeaderMatcher,
} from "@/lib/planDataSource/projectValue/projectValueCsv";
import {
  makeLegacyProjectValueRow,
  makeProjectValueCsvRow,
  projectValueSummaryFromRow,
} from "@/lib/planDataSource/projectValue/rowHelpers";
import type {
  ParseProjectValueCsvOptions,
  ProjectValueCsvParseResult,
  ProjectValueEntitySummary,
  ProjectValueNormalizedRow,
} from "@/lib/planDataSource/projectValue/types";
import { normalizeEntityLabel } from "@/lib/planDataSource/normalize";
import { resolveBiReportMonthKey } from "@/lib/planDataSource/parseApartmentPlanBiReportCsv";
import { parseRuNumber } from "@/lib/parseRuNumber";
import { parseRuCsvToGrid, ruAreaWideTableHeaderMatcher } from "@/lib/planDataSource/ruPlanCsvParse";

export const PROJECT_VALUE_CSV_MAX_BYTES = 10 * 1024 * 1024;

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

const parseNum = parseRuNumber;

function isGrandTotalRow(segmentNorm: string, rawLabel: string): boolean {
  const n = segmentNorm.toLowerCase();
  const raw = rawLabel.toLowerCase();
  return n === "итого" || n === "всего" || raw === "итого" || raw.startsWith("итого ");
}

function isRootSummaryRow(segmentNorm: string, rawLabel: string): boolean {
  return (
    isApartmentRootSummaryRow(segmentNorm, rawLabel) ||
    isParkingRootSummaryRow(segmentNorm, rawLabel) ||
    isStorageRootSummaryRow(segmentNorm, rawLabel) ||
    isCommercialRootSummaryRow(segmentNorm, rawLabel) ||
    isGrandTotalRow(segmentNorm, rawLabel)
  );
}

function isProjectValueRoomTypeRow(segmentNorm: string, rawLabel: string): boolean {
  if (isGrandTotalRow(segmentNorm, rawLabel)) return false;
  if (isApartmentRootSummaryRow(segmentNorm, rawLabel)) return false;
  if (isNonApartmentPropertyRow(segmentNorm, rawLabel)) return false;
  return matchApartmentPlanTypeKey(segmentNorm, rawLabel) != null;
}

function isProjectValueEntityDetailRow(segmentNorm: string, rawLabel: string): boolean {
  if (isGrandTotalRow(segmentNorm, rawLabel)) return false;
  return isParkingDetailSegment(segmentNorm, rawLabel) || isStorageDetailSegment(segmentNorm, rawLabel);
}

function parseProjectValueCsvGrid(
  metaFields: string[],
  rowsIn: Record<string, unknown>[],
  monthKey: string,
): ProjectValueCsvParseResult {
  const picked = resolveProjectValueCsvHeaders(metaFields);
  if ("error" in picked) {
    return {
      ok: false,
      error: picked.error,
      warnings: [],
      diagnostics: {
        rawHeaders: metaFields,
        columnMapping: null,
        delimiter: null,
        csvType: "unknown",
        importedRootRows: 0,
      },
    };
  }

  const { map } = picked;
  const warnings: string[] = [];
  const out: ProjectValueNormalizedRow[] = [];
  let apartmentsSummary: ProjectValueEntitySummary | null = null;
  let parkingSummary: ProjectValueEntitySummary | null = null;
  let storageSummary: ProjectValueEntitySummary | null = null;
  let commercialSummary: ProjectValueEntitySummary | null = null;
  let importedRootRows = 0;

  for (let i = 0; i < rowsIn.length; i++) {
    const rec = rowsIn[i] ?? {};
    const rawLabel = rec[map.segment] != null ? String(rec[map.segment]).trim() : "";
    const segmentNorm = normalizeEntityLabel(rawLabel);
    if (!segmentNorm) continue;

    if (
      !isRootSummaryRow(segmentNorm, rawLabel) &&
      !isProjectValueRoomTypeRow(segmentNorm, rawLabel) &&
      !isProjectValueEntityDetailRow(segmentNorm, rawLabel)
    ) {
      continue;
    }

    const charter = parseNum(rec[map.charter]) ?? 0;
    const currentPlan = parseNum(rec[map.currentPlan]) ?? 0;
    const priceIncrease = map.priceIncrease ? parseNum(rec[map.priceIncrease]) ?? 0 : 0;
    const reportMarkup = map.reportMarkup ? parseNum(rec[map.reportMarkup]) ?? 0 : 0;

    importedRootRows += 1;
    const row = makeProjectValueCsvRow({
      segmentNorm,
      monthKey,
      charter,
      currentPlan,
      priceIncrease,
      reportMarkup,
    });
    out.push(row);

    const summary = projectValueSummaryFromRow(row, rawLabel || segmentNorm);
    if (isApartmentRootSummaryRow(segmentNorm, rawLabel)) apartmentsSummary = summary;
    if (isParkingRootSummaryRow(segmentNorm, rawLabel)) parkingSummary = summary;
    if (isStorageRootSummaryRow(segmentNorm, rawLabel)) storageSummary = summary;
    if (isCommercialRootSummaryRow(segmentNorm, rawLabel)) commercialSummary = summary;
  }

  if (!out.length) {
    return {
      ok: false,
      error:
        "Не удалось импортировать строки: нужны «Квартиры», «Парковки», «Кладовые», «Коммерческие помещения», «ИТОГО» и/или строки комнатности.",
      warnings,
      diagnostics: {
        rawHeaders: metaFields,
        columnMapping: projectValueCsvColumnMappingForDiagnostics(map),
        delimiter: null,
        csvType: "project_value_csv",
        monthKeyUsed: monthKey,
        importedRootRows: 0,
      },
    };
  }

  if (apartmentsSummary) {
    const aptNorm = normalizeEntityLabel(apartmentsSummary.rawLabel);
    if (!out.some((r) => r.segmentNorm === aptNorm)) {
      out.unshift(
        makeProjectValueCsvRow({
          segmentNorm: aptNorm,
          monthKey,
          charter: apartmentsSummary.charter,
          currentPlan: apartmentsSummary.currentPlan,
          priceIncrease: apartmentsSummary.priceIncrease,
          reportMarkup: apartmentsSummary.reportMarkup,
        }),
      );
    }
  }

  return {
    ok: true,
    rows: out,
    warnings,
    apartmentsSummary,
    parkingSummary,
    storageSummary,
    commercialSummary,
    diagnostics: {
      rawHeaders: metaFields,
      columnMapping: projectValueCsvColumnMappingForDiagnostics(map),
      delimiter: null,
      csvType: "project_value_csv",
      monthKeyUsed: monthKey,
      importedRootRows,
    },
  };
}

function parseLegacyProjectValueGrid(
  metaFields: string[],
  rowsIn: Record<string, unknown>[],
  monthKey: string,
): ProjectValueCsvParseResult {
  const picked = resolveLegacyProjectValueWideHeaders(metaFields);
  if ("error" in picked) {
    return {
      ok: false,
      error: picked.error,
      warnings: [],
      diagnostics: {
        rawHeaders: metaFields,
        columnMapping: null,
        delimiter: null,
        csvType: "unknown",
        importedRootRows: 0,
      },
    };
  }

  const { map } = picked;
  const warnings: string[] = [];
  const out: ProjectValueNormalizedRow[] = [];
  let apartmentsSummary: ProjectValueEntitySummary | null = null;
  let parkingSummary: ProjectValueEntitySummary | null = null;
  let storageSummary: ProjectValueEntitySummary | null = null;
  let commercialSummary: ProjectValueEntitySummary | null = null;
  let importedRootRows = 0;

  for (let i = 0; i < rowsIn.length; i++) {
    const rec = rowsIn[i] ?? {};
    const rawLabel = rec[map.segment] != null ? String(rec[map.segment]).trim() : "";
    const segmentNorm = normalizeEntityLabel(rawLabel);
    if (!segmentNorm) continue;

    if (
      !isRootSummaryRow(segmentNorm, rawLabel) &&
      !isProjectValueRoomTypeRow(segmentNorm, rawLabel) &&
      !isProjectValueEntityDetailRow(segmentNorm, rawLabel)
    ) {
      continue;
    }

    const projectCost = parseNum(rec[map.projectCost]) ?? 0;
    const planMonth = parseNum(rec[map.planMonth]) ?? 0;
    const planCumulative = parseNum(rec[map.planCumulative]) ?? 0;
    const factMonth = map.factMonth ? parseNum(rec[map.factMonth]) ?? 0 : 0;
    const factCumulative = map.factCumulative ? parseNum(rec[map.factCumulative]) ?? 0 : 0;

    importedRootRows += 1;
    const row = makeLegacyProjectValueRow({
      segmentNorm,
      monthKey,
      projectCost,
      planMonth,
      planCumulative,
      factMonth,
      factCumulative,
    });
    out.push(row);

    const summary = projectValueSummaryFromRow(row, rawLabel || segmentNorm);
    if (isApartmentRootSummaryRow(segmentNorm, rawLabel)) apartmentsSummary = summary;
    if (isParkingRootSummaryRow(segmentNorm, rawLabel)) parkingSummary = summary;
    if (isStorageRootSummaryRow(segmentNorm, rawLabel)) storageSummary = summary;
    if (isCommercialRootSummaryRow(segmentNorm, rawLabel)) commercialSummary = summary;
  }

  if (!out.length) {
    return {
      ok: false,
      error:
        "Не удалось импортировать строки стоимости проекта: нужны root-строки (Квартиры, Парковки, Кладовые, Коммерческие помещения, ИТОГО) и строки комнатности.",
      warnings,
      diagnostics: {
        rawHeaders: metaFields,
        columnMapping: legacyProjectValueColumnMappingForDiagnostics(map),
        delimiter: null,
        csvType: projectValueCsvTypeLabel(metaFields),
        monthKeyUsed: monthKey,
        importedRootRows: 0,
      },
    };
  }

  if (apartmentsSummary) {
    const aptNorm = normalizeEntityLabel(apartmentsSummary.rawLabel);
    if (!out.some((r) => r.segmentNorm === aptNorm)) {
      out.unshift(
        makeLegacyProjectValueRow({
          segmentNorm: aptNorm,
          monthKey,
          projectCost: apartmentsSummary.projectCost,
          planMonth: apartmentsSummary.planMonth,
          planCumulative: apartmentsSummary.planCumulative,
          factMonth: apartmentsSummary.factMonth,
          factCumulative: apartmentsSummary.factCumulative,
        }),
      );
    }
  }

  return {
    ok: true,
    rows: out,
    warnings,
    apartmentsSummary,
    parkingSummary,
    storageSummary,
    commercialSummary,
    diagnostics: {
      rawHeaders: metaFields,
      columnMapping: legacyProjectValueColumnMappingForDiagnostics(map),
      delimiter: null,
      csvType: projectValueCsvTypeLabel(metaFields),
      monthKeyUsed: monthKey,
      importedRootRows,
    },
  };
}

export function parseProjectValueCsvAsync(
  text: string,
  options?: ParseProjectValueCsvOptions,
): Promise<ProjectValueCsvParseResult> {
  const stripped = stripBom(text).trim();
  if (!stripped) {
    return Promise.resolve({
      ok: false,
      error: "Файл пустой или не содержит данных.",
      warnings: [],
      diagnostics: {
        rawHeaders: [],
        columnMapping: null,
        delimiter: null,
        csvType: "unknown",
        importedRootRows: 0,
      },
    });
  }

  try {
    let grid = parseRuCsvToGrid(stripped, ruProjectValueCsvHeaderMatcher);
    let rawHeaders = grid.rawHeaders;
    const isProjectValueFormat = detectProjectValueCsv(rawHeaders);

    if (!isProjectValueFormat) {
      grid = parseRuCsvToGrid(stripped, ruAreaWideTableHeaderMatcher);
      rawHeaders = grid.rawHeaders;
    }

    if (!rawHeaders.length) {
      return Promise.resolve({
        ok: false,
        error: "Не удалось прочитать заголовок CSV.",
        warnings: [],
        diagnostics: {
          rawHeaders: [],
          columnMapping: null,
          delimiter: grid.delimiter,
          csvType: "unknown",
          importedRootRows: 0,
        },
      });
    }

    const csvType = isProjectValueFormat ? "project_value_csv" : projectValueCsvTypeLabel(rawHeaders);
    if (csvType === "unknown") {
      return Promise.resolve({
        ok: false,
        error:
          "Не распознан формат CSV стоимости проекта. Ожидается «Устав» и «Текущ. план продаж» или legacy-таблица с «Стоимость проекта».",
        warnings: [],
        diagnostics: {
          rawHeaders,
          columnMapping: null,
          delimiter: grid.delimiter,
          csvType: "unknown",
          importedRootRows: 0,
        },
      });
    }

    if (!options) {
      return Promise.resolve({
        ok: false,
        error:
          "Задайте контекст отчёта: период дашборда, дату asOf или месяц в имени файла (для привязки строк CSV).",
        warnings: [],
        diagnostics: {
          rawHeaders,
          columnMapping: null,
          delimiter: grid.delimiter,
          csvType,
          importedRootRows: 0,
        },
      });
    }

    const monthKey = resolveBiReportMonthKey(options);
    if (!monthKey) {
      return Promise.resolve({
        ok: false,
        error:
          "Не удалось определить месяц отчёта (YYYY-MM). Укажите месяц на дашборде, дату отчёта или имя файла.",
        warnings: [],
        diagnostics: {
          rawHeaders,
          columnMapping: null,
          delimiter: grid.delimiter,
          csvType,
          importedRootRows: 0,
        },
      });
    }

    const parsed = isProjectValueFormat
      ? parseProjectValueCsvGrid(rawHeaders, grid.rows, monthKey)
      : parseLegacyProjectValueGrid(rawHeaders, grid.rows, monthKey);
    if (!parsed.ok) {
      return Promise.resolve({
        ...parsed,
        diagnostics: { ...parsed.diagnostics, delimiter: grid.delimiter },
      });
    }

    return Promise.resolve({
      ...parsed,
      diagnostics: { ...parsed.diagnostics, delimiter: grid.delimiter },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка разбора CSV.";
    return Promise.resolve({
      ok: false,
      error: msg,
      warnings: [],
      diagnostics: {
        rawHeaders: [],
        columnMapping: null,
        delimiter: null,
        csvType: "unknown",
        importedRootRows: 0,
      },
    });
  }
}
