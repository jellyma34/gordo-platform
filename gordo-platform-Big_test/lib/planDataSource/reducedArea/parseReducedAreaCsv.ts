import { matchApartmentPlanTypeKey } from "@/lib/apartmentPlanTypeKpi";
import { roomTypeNormalized } from "@/lib/roomTypeNormalized";
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
  resolveReducedAreaWideHeaders,
  reducedAreaColumnMappingForDiagnostics,
  reducedAreaCsvTypeLabel,
} from "@/lib/planDataSource/reducedArea/legacyReducedAreaWideTableCsv";
import type {
  ParseReducedAreaCsvOptions,
  ReducedAreaCsvParseResult,
  ReducedAreaEntitySummary,
  ReducedAreaNormalizedRow,
  ReducedAreaProjectColumnKind,
} from "@/lib/planDataSource/reducedArea/types";
import { normalizeEntityLabel } from "@/lib/planDataSource/normalize";
import { resolveBiReportMonthKey } from "@/lib/planDataSource/parseApartmentPlanBiReportCsv";
import { parseRuNumber } from "@/lib/parseRuNumber";
import { parseRuCsvToGrid, ruAreaWideTableHeaderMatcher } from "@/lib/planDataSource/ruPlanCsvParse";

export const REDUCED_AREA_CSV_MAX_BYTES = 10 * 1024 * 1024;

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

function isReducedAreaRoomTypeRow(segmentNorm: string, rawLabel: string): boolean {
  if (isGrandTotalRow(segmentNorm, rawLabel)) return false;
  if (isApartmentRootSummaryRow(segmentNorm, rawLabel)) return false;
  if (isNonApartmentPropertyRow(segmentNorm, rawLabel)) return false;
  return roomTypeNormalized(segmentNorm, rawLabel) != null || matchApartmentPlanTypeKey(segmentNorm, rawLabel) != null;
}

function isReducedAreaEntityDetailRow(segmentNorm: string, rawLabel: string): boolean {
  if (isGrandTotalRow(segmentNorm, rawLabel)) return false;
  return isParkingDetailSegment(segmentNorm, rawLabel) || isStorageDetailSegment(segmentNorm, rawLabel);
}

function parseReducedAreaGrid(
  metaFields: string[],
  rowsIn: Record<string, unknown>[],
  monthKey: string,
  projectColumnKind: ReducedAreaProjectColumnKind,
): ReducedAreaCsvParseResult {
  const picked = resolveReducedAreaWideHeaders(metaFields);
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
  const columnKind = picked.projectColumnKind ?? projectColumnKind;
  const warnings: string[] = [];
  const out: ReducedAreaNormalizedRow[] = [];
  let apartmentsSummary: ReducedAreaEntitySummary | null = null;
  let parkingSummary: ReducedAreaEntitySummary | null = null;
  let storageSummary: ReducedAreaEntitySummary | null = null;
  let importedRootRows = 0;

  for (let i = 0; i < rowsIn.length; i++) {
    const rec = rowsIn[i] ?? {};
    const rawLabel = rec[map.segment] != null ? String(rec[map.segment]).trim() : "";
    const segmentNorm = normalizeEntityLabel(rawLabel);
    if (!segmentNorm) continue;

    if (
      !isRootSummaryRow(segmentNorm, rawLabel) &&
      !isReducedAreaRoomTypeRow(segmentNorm, rawLabel) &&
      !isReducedAreaEntityDetailRow(segmentNorm, rawLabel)
    ) {
      continue;
    }

    const planProject = parseNum(rec[map.planProject]) ?? 0;
    const planMonth = parseNum(rec[map.planMonth]) ?? 0;
    const planCumulative = parseNum(rec[map.planCumulative]) ?? 0;
    const factMonth = map.factMonth ? parseNum(rec[map.factMonth]) ?? 0 : 0;
    const factCumulative = map.factCumulative ? parseNum(rec[map.factCumulative]) ?? 0 : 0;

    importedRootRows += 1;
    const row: ReducedAreaNormalizedRow = {
      segmentNorm,
      monthKey,
      planProject: Math.max(0, planProject),
      planMonth: Math.max(0, planMonth),
      planCumulative: Math.max(0, planCumulative),
      factMonth: Math.max(0, factMonth),
      factCumulative: Math.max(0, factCumulative),
    };
    out.push(row);

    if (isApartmentRootSummaryRow(segmentNorm, rawLabel)) {
      apartmentsSummary = {
        planMonth: row.planMonth,
        planCumulative: row.planCumulative,
        planProject: row.planProject,
        factMonth: row.factMonth,
        factCumulative: row.factCumulative,
        rawLabel: rawLabel || segmentNorm,
      };
    }
    if (isParkingRootSummaryRow(segmentNorm, rawLabel)) {
      parkingSummary = {
        planMonth: row.planMonth,
        planCumulative: row.planCumulative,
        planProject: row.planProject,
        factMonth: row.factMonth,
        factCumulative: row.factCumulative,
        rawLabel: rawLabel || segmentNorm,
      };
    }
    if (isStorageRootSummaryRow(segmentNorm, rawLabel)) {
      storageSummary = {
        planMonth: row.planMonth,
        planCumulative: row.planCumulative,
        planProject: row.planProject,
        factMonth: row.factMonth,
        factCumulative: row.factCumulative,
        rawLabel: rawLabel || segmentNorm,
      };
    }
  }

  if (!out.length) {
    return {
      ok: false,
      error:
        "Не удалось импортировать строки: нужны «Квартиры», «Парковки», «Кладовые», «Коммерческие помещения», «ИТОГО» и/или строки комнатности.",
      warnings,
      diagnostics: {
        rawHeaders: metaFields,
        columnMapping: reducedAreaColumnMappingForDiagnostics(map),
        delimiter: null,
        csvType: reducedAreaCsvTypeLabel(metaFields),
        monthKeyUsed: monthKey,
        importedRootRows: 0,
        projectColumnKind: columnKind,
      },
    };
  }

  if (apartmentsSummary) {
    const aptNorm = normalizeEntityLabel(apartmentsSummary.rawLabel);
    if (!out.some((r) => r.segmentNorm === aptNorm)) {
      out.unshift({
        segmentNorm: aptNorm,
        monthKey,
        planProject: apartmentsSummary.planProject,
        planMonth: apartmentsSummary.planMonth,
        planCumulative: apartmentsSummary.planCumulative,
        factMonth: apartmentsSummary.factMonth,
        factCumulative: apartmentsSummary.factCumulative,
      });
    }
  }

  return {
    ok: true,
    rows: out,
    warnings,
    apartmentsSummary,
    parkingSummary,
    storageSummary,
    projectColumnKind: columnKind,
    diagnostics: {
      rawHeaders: metaFields,
      columnMapping: reducedAreaColumnMappingForDiagnostics(map),
      delimiter: null,
      csvType: reducedAreaCsvTypeLabel(metaFields),
      monthKeyUsed: monthKey,
      importedRootRows,
      projectColumnKind: columnKind,
    },
  };
}

export function parseReducedAreaCsvAsync(
  text: string,
  options?: ParseReducedAreaCsvOptions,
): Promise<ReducedAreaCsvParseResult> {
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
    const grid = parseRuCsvToGrid(stripped, ruAreaWideTableHeaderMatcher);
    const rawHeaders = grid.rawHeaders;

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

    const csvType = reducedAreaCsvTypeLabel(rawHeaders);
    if (csvType === "unknown") {
      return Promise.resolve({
        ok: false,
        error:
          "Не распознан формат CSV. Ожидается таблица: «Наименование», «Приведенная площадь» / «Приведенная площадь объекта», план/факт на отчётный период.",
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

    const headerPick = resolveReducedAreaWideHeaders(rawHeaders);
    const projectColumnKind = "error" in headerPick ? "plan_project" : headerPick.projectColumnKind;

    const parsed = parseReducedAreaGrid(rawHeaders, grid.rows, monthKey, projectColumnKind);
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
