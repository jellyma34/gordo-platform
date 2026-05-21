import {
  isApartmentRootSummaryRow,
  isCommercialRootSummaryRow,
  isParkingRootSummaryRow,
  isStorageRootSummaryRow,
} from "@/lib/planDataSource/entityRowMatchers";
import {
  detectLegacyAreaWideTableCsv,
  installmentAreaCsvTypeLabel,
  legacyAreaColumnMappingForDiagnostics,
  resolveLegacyAreaWideHeaders,
} from "@/lib/planDataSource/installmentArea/legacyAreaWideTableCsv";
import { parseRuNumber } from "@/lib/parseRuNumber";
import type {
  InstallmentAreaApartmentsSummary,
  InstallmentAreaCsvNormalizedRow,
  InstallmentAreaCsvParseResult,
  ParseInstallmentAreaCsvOptions,
} from "@/lib/planDataSource/installmentArea/types";
import { normalizeEntityLabel } from "@/lib/planDataSource/normalize";
import { resolveBiReportMonthKey } from "@/lib/planDataSource/parseApartmentPlanBiReportCsv";
import { parseRuCsvToGrid, ruAreaWideTableHeaderMatcher } from "@/lib/planDataSource/ruPlanCsvParse";

export const INSTALLMENT_AREA_CSV_MAX_BYTES = 10 * 1024 * 1024;

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

function parseLegacyAreaGrid(
  metaFields: string[],
  rowsIn: Record<string, unknown>[],
  monthKey: string,
): InstallmentAreaCsvParseResult {
  const picked = resolveLegacyAreaWideHeaders(metaFields);
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
  const out: InstallmentAreaCsvNormalizedRow[] = [];
  let apartmentsSummary: InstallmentAreaApartmentsSummary | null = null;
  let importedRootRows = 0;

  for (let i = 0; i < rowsIn.length; i++) {
    const rec = rowsIn[i] ?? {};
    const rawLabel = rec[map.segment] != null ? String(rec[map.segment]).trim() : "";
    const segmentNorm = normalizeEntityLabel(rawLabel);
    if (!segmentNorm) continue;

    if (!isRootSummaryRow(segmentNorm, rawLabel)) continue;

    const projectArea = parseNum(rec[map.projectArea]) ?? 0;
    const planMonthArea = parseNum(rec[map.planMonth]) ?? 0;
    const planCumulativeArea = parseNum(rec[map.planCumulative]) ?? 0;
    const factMonthArea = map.factMonth ? parseNum(rec[map.factMonth]) ?? 0 : 0;
    const factCumulativeArea = map.factCumulative ? parseNum(rec[map.factCumulative]) ?? 0 : 0;

    importedRootRows += 1;
    const row: InstallmentAreaCsvNormalizedRow = {
      segmentNorm,
      monthKey,
      projectArea: Math.max(0, projectArea),
      planMonthArea: Math.max(0, planMonthArea),
      planCumulativeArea: Math.max(0, planCumulativeArea),
      factMonthArea: Math.max(0, factMonthArea),
      factCumulativeArea: Math.max(0, factCumulativeArea),
    };
    out.push(row);

    if (isApartmentRootSummaryRow(segmentNorm, rawLabel)) {
      apartmentsSummary = {
        planMonthArea: row.planMonthArea,
        planCumulativeArea: row.planCumulativeArea,
        projectArea: row.projectArea,
        factMonthArea: row.factMonthArea,
        factCumulativeArea: row.factCumulativeArea,
        rawLabel: rawLabel || segmentNorm,
      };
    }
  }

  if (!out.length) {
    return {
      ok: false,
      error:
        "Не удалось импортировать строки площади: нужны root-строки (Квартиры, Парковки, Кладовые, Коммерческие помещения, ИТОГО).",
      warnings,
      diagnostics: {
        rawHeaders: metaFields,
        columnMapping: legacyAreaColumnMappingForDiagnostics(map),
        delimiter: null,
        csvType: installmentAreaCsvTypeLabel(metaFields),
        monthKeyUsed: monthKey,
        importedRootRows: 0,
      },
    };
  }

  if (apartmentsSummary) {
    const aptNorm = normalizeEntityLabel(apartmentsSummary.rawLabel);
    if (!out.some((r) => r.segmentNorm === aptNorm)) {
      out.unshift({
        segmentNorm: aptNorm,
        monthKey,
        projectArea: apartmentsSummary.projectArea,
        planMonthArea: apartmentsSummary.planMonthArea,
        planCumulativeArea: apartmentsSummary.planCumulativeArea,
        factMonthArea: apartmentsSummary.factMonthArea,
        factCumulativeArea: apartmentsSummary.factCumulativeArea,
      });
    }
  }

  return {
    ok: true,
    rows: out,
    warnings,
    apartmentsSummary,
    diagnostics: {
      rawHeaders: metaFields,
      columnMapping: legacyAreaColumnMappingForDiagnostics(map),
      delimiter: null,
      csvType: installmentAreaCsvTypeLabel(metaFields),
      monthKeyUsed: monthKey,
      importedRootRows,
    },
  };
}

export function parseInstallmentAreaCsvAsync(
  text: string,
  options?: ParseInstallmentAreaCsvOptions,
): Promise<InstallmentAreaCsvParseResult> {
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

    const csvType = installmentAreaCsvTypeLabel(rawHeaders);
    if (csvType === "unknown") {
      return Promise.resolve({
        ok: false,
        error:
          "Не распознан формат CSV площади. Ожидается legacy-таблица: «Наименование», «Площадь проекта», «Площадь на отчётный месяц», «Площадь накопит. итогом».",
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

    const parsed = parseLegacyAreaGrid(rawHeaders, grid.rows, monthKey);
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
