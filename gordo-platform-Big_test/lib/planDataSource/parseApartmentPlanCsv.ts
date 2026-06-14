import {
  columnMappingForDiagnostics,
  resolveApartmentPlanHeaders,
} from "@/lib/planDataSource/apartmentPlanCsvColumns";
import {
  detectApartmentPlanCsvType,
  diagnosticsColumnMappingForType,
} from "@/lib/planDataSource/apartmentPlanCsvPipeline";
import { detectLegacyWideTableCsv } from "@/lib/planDataSource/legacyWideTableCsv";
import {
  isApartmentPlanKpiDetailSegment,
  isBiApartmentsSummaryRow,
  isBiGrandTotalRow,
  isNonApartmentPropertyRow,
  type BiApartmentsSummarySlice,
} from "@/lib/planDataSource/apartmentPlanKpiEntity";
import { parseLegacyWideTableFromGrid } from "@/lib/planDataSource/legacyWideTableCsv";
import { parseRuPlanCsvToGrid } from "@/lib/planDataSource/ruPlanCsvParse";
import {
  parseApartmentPlanBiReportFromGrid,
  resolveBiReportMonthKey,
} from "@/lib/planDataSource/parseApartmentPlanBiReportCsv";
import { normalizeEntityLabel, normalizeMatchKey } from "@/lib/planDataSource/normalize";
import type {
  ApartmentPlanCsvNormalizedRow,
  ApartmentPlanCsvParseDiagnostics,
  ApartmentPlanCsvParseResult,
  ParseApartmentPlanCsvOptions,
} from "@/lib/planDataSource/types";

export const APARTMENT_PLAN_CSV_MAX_BYTES = 10 * 1024 * 1024;

const PREVIEW_ROW_LIMIT = 8;

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function preprocessCell(raw: string | undefined | null): string {
  return stripBom(String(raw ?? ""))
    .replace(/\u00a0/g, " ")
    .trim();
}

function parseNumberCell(raw: string | undefined): number | null {
  const s = preprocessCell(raw).replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const RU_MONTH_ALIASES: Record<string, string> = {
  янв: "01",
  январь: "01",
  фев: "02",
  февраль: "02",
  мар: "03",
  март: "03",
  апр: "04",
  апрель: "04",
  май: "05",
  мая: "05",
  июн: "06",
  июнь: "06",
  июл: "07",
  июль: "07",
  авг: "08",
  август: "08",
  сен: "09",
  сентябрь: "09",
  окт: "10",
  октябрь: "10",
  ноя: "11",
  ноябрь: "11",
  дек: "12",
  декабрь: "12",
};

/** month column → YYYY-MM */
export function parseMonthKeyCell(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const t = preprocessCell(raw);
  if (!t) return null;
  const compact = t.replace(/\s/g, "");

  const ruWord = t
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[\s.]+/g, " ")
    .trim();

  const ruM = /^([a-zа-яё]+)\s*['']?(\d{4})$/iu.exec(ruWord);
  if (ruM) {
    const mk = RU_MONTH_ALIASES[ruM[1]!.toLowerCase().replace(/\.$/, "")];
    if (mk) return `${ruM[2]}-${mk}`;
  }

  let m = /^(\d{4})-(\d{1,2})(-\d{1,2})?$/.exec(compact);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}`;
  m = /^(\d{1,2})[./-](\d{4})$/.exec(compact);
  if (m) return `${m[2]}-${m[1]!.padStart(2, "0")}`;
  const n = normalizeMatchKey(t).replace(/\s/g, "");
  m = /^(\d{4})-(\d{1,2})$/.exec(n);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}`;
  return null;
}

function buildPreviewRows(
  rowsIn: Record<string, unknown>[],
  metaFields: string[],
  limit: number,
): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (let i = 0; i < Math.min(limit, rowsIn.length); i++) {
    const rec = rowsIn[i] ?? {};
    const row: Record<string, string> = {};
    for (const k of metaFields) {
      const v = rec[k];
      row[k] = v == null ? "" : String(v).trim();
    }
    const hasVal = Object.values(row).some((c) => c !== "");
    if (hasVal) out.push(row);
  }
  return out;
}

function emptyDiagnostics(
  rawHeaders: string[],
  delimiter: string | null,
  previewRows: Record<string, string>[],
  csvType?: ApartmentPlanCsvParseDiagnostics["csvType"],
): ApartmentPlanCsvParseDiagnostics {
  return {
    rawHeaders,
    columnMapping: null,
    previewRows,
    delimiter,
    csvType,
    factSource: "system_json",
  };
}

function parseColumnarPlan(
  metaFields: string[],
  rowsIn: Record<string, unknown>[],
  monthKey: string,
  csvType: "legacy_wide_table" | "bi_report",
): ApartmentPlanCsvParseResult {
  const parsed =
    csvType === "legacy_wide_table"
      ? parseLegacyWideTableFromGrid(metaFields, rowsIn, monthKey)
      : parseApartmentPlanBiReportFromGrid(metaFields, rowsIn, monthKey);

  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      warnings: [],
      diagnostics: emptyDiagnostics(metaFields, null, [], csvType),
    };
  }

  const r = parsed.result;
  return {
    ok: true,
    rows: r.rows,
    warnings: r.warnings,
    biReportMeta: {
      monthKey,
      apartmentsSummary: r.apartmentsSummary,
      projectSummary: r.projectSummary,
      summaryPlanProject: r.summaryPlanProject,
    },
    diagnostics: {
      rawHeaders: metaFields,
      columnMapping: r.columnMapping,
      previewRows: [],
      delimiter: null,
      csvType,
      importedSegmentRows: r.importedSegmentRows,
      ignoredSummaryRows: r.ignoredSummaryRows,
      monthKeyUsed: monthKey,
      factSource: "system_json",
    },
  };
}

function parseNormalizedWideTable(
  metaFields: string[],
  rowsIn: Record<string, unknown>[],
  previewRows: Record<string, string>[],
  delimiter: string | null,
  effectiveMonthKey?: string | null,
): ApartmentPlanCsvParseResult {
  const resolved = resolveApartmentPlanHeaders(metaFields);
  if ("error" in resolved) {
    return {
      ok: false,
      error: resolved.error,
      warnings: [],
      diagnostics: {
        rawHeaders: metaFields,
        columnMapping: null,
        previewRows,
        delimiter,
        csvType: "wide_table",
        factSource: "system_json",
      },
    };
  }

  const { map } = resolved;
  const columnMapping = columnMappingForDiagnostics(map);

  if (!rowsIn.length) {
    return {
      ok: false,
      error: "Нет ни одной строки данных после заголовка.",
      warnings: [],
      diagnostics: {
        rawHeaders: metaFields,
        columnMapping,
        previewRows,
        delimiter,
        csvType: "wide_table",
        factSource: "system_json",
      },
    };
  }

  const warnings: string[] = [];
  const rows: ApartmentPlanCsvNormalizedRow[] = [];
  let apartmentsSummaryWide: BiApartmentsSummarySlice | null = null;
  let projectSummaryWide: BiApartmentsSummarySlice | null = null;

  for (let i = 0; i < rowsIn.length; i++) {
    const rec = rowsIn[i] ?? {};
    const segRaw = rec[map.segment];
    const monthRaw = rec[map.month];
    const pmRaw = rec[map.planMonth];
    const pcRaw = rec[map.planCumulative];
    const tvRaw = rec[map.totalVolume];
    const atRaw = map.apartmentType ? rec[map.apartmentType] : undefined;

    const rawSeg = segRaw != null ? String(segRaw).trim() : "";
    const segmentNorm = normalizeEntityLabel(rawSeg);
    if (!segmentNorm) {
      warnings.push(`Строка ${i + 2}: пропущена (пустой segment).`);
      continue;
    }

    const planMonthN = parseNumberCell(pmRaw != null ? String(pmRaw) : "");
    const planCumulativeN = parseNumberCell(pcRaw != null ? String(pcRaw) : "");
    const totalVolumeN = parseNumberCell(tvRaw != null ? String(tvRaw) : "");

    if (isBiGrandTotalRow(segmentNorm, rawSeg)) {
      if (planMonthN != null && planCumulativeN != null && totalVolumeN != null) {
        projectSummaryWide = {
          planMonth: Math.max(0, planMonthN),
          planCumulative: Math.max(0, planCumulativeN),
          planProject: Math.max(0, totalVolumeN),
          rawLabel: rawSeg.trim() || segmentNorm,
        };
      } else {
        warnings.push(`Строка ${i + 2} (ИТОГО): пропущена (нет чисел в плане).`);
      }
      continue;
    }

    let monthKey = parseMonthKeyCell(monthRaw != null ? String(monthRaw) : "");
    if (!monthKey && effectiveMonthKey) {
      monthKey = effectiveMonthKey;
    }
    if (!monthKey) {
      warnings.push(`Строка ${i + 2}: пропущена (некорректный month: "${monthRaw}").`);
      continue;
    }

    if (planMonthN == null || planCumulativeN == null || totalVolumeN == null) {
      warnings.push(`Строка ${i + 2}: пропущена (ожидаются числа в plan_month / plan_cumulative / total_volume).`);
      continue;
    }

    if (isBiApartmentsSummaryRow(segmentNorm, rawSeg)) {
      apartmentsSummaryWide = {
        planMonth: Math.max(0, planMonthN),
        planCumulative: Math.max(0, planCumulativeN),
        planProject: Math.max(0, totalVolumeN),
        rawLabel: rawSeg.trim() || segmentNorm,
      };
      rows.push({
        segmentNorm: normalizeEntityLabel(apartmentsSummaryWide.rawLabel),
        apartmentTypeNorm: null,
        monthKey,
        planMonth: apartmentsSummaryWide.planMonth,
        planCumulative: apartmentsSummaryWide.planCumulative,
        totalVolume: apartmentsSummaryWide.planProject,
      });
      continue;
    }

    if (isNonApartmentPropertyRow(segmentNorm, rawSeg)) {
      warnings.push(`Строка ${i + 2} («${rawSeg}»): пропущена (не квартиры).`);
      continue;
    }

    if (!isApartmentPlanKpiDetailSegment(segmentNorm, rawSeg)) {
      warnings.push(`Строка ${i + 2} («${rawSeg}»): пропущена (не сегмент квартир для KPI).`);
      continue;
    }

    rows.push({
      segmentNorm,
      apartmentTypeNorm: atRaw != null && String(atRaw).trim() ? normalizeMatchKey(atRaw) : null,
      monthKey,
      planMonth: Math.max(0, planMonthN),
      planCumulative: Math.max(0, planCumulativeN),
      totalVolume: Math.max(0, totalVolumeN),
    });
  }

  if (!rows.length) {
    return {
      ok: false,
      error:
        "Не удалось импортировать ни одной строки: проверьте сегмент, месяц (формат YYYY-MM или 01.2024) и числовые поля.",
      warnings,
      diagnostics: {
        rawHeaders: metaFields,
        columnMapping,
        previewRows,
        delimiter,
        csvType: "wide_table",
        factSource: "system_json",
      },
    };
  }

  const firstMonthKey = rows[0]?.monthKey ?? "";
  return {
    ok: true,
    rows,
    warnings,
    ...((apartmentsSummaryWide || projectSummaryWide) && firstMonthKey
      ? {
          biReportMeta: {
            monthKey: firstMonthKey,
            apartmentsSummary: apartmentsSummaryWide,
            projectSummary: projectSummaryWide,
            summaryPlanProject: apartmentsSummaryWide?.planProject ?? projectSummaryWide?.planProject ?? null,
          },
        }
      : {}),
    diagnostics: {
      rawHeaders: metaFields,
      columnMapping,
      previewRows,
      delimiter,
      csvType: "wide_table",
      factSource: "system_json",
    },
  };
}

/**
 * Асинхронный разбор CSV плана (только план; факт — из API).
 * Порядок: detectCsvType → switch (legacy / bi / wide). Wide-table validate НЕ вызывается для legacy.
 */
export function parseApartmentPlanCsvAsync(
  text: string,
  options?: ParseApartmentPlanCsvOptions,
): Promise<ApartmentPlanCsvParseResult> {
  const stripped = stripBom(text).trim();
  if (!stripped) {
    return Promise.resolve({
      ok: false,
      error: "Файл пустой или не содержит данных.",
      warnings: [],
      diagnostics: emptyDiagnostics([], null, []),
    });
  }

  try {
    const grid = parseRuPlanCsvToGrid(stripped);
    const warnings: string[] = [];
    const rawHeaders = grid.rawHeaders;
    const normalizedHeaders = grid.normalizedHeaders;
    const delimiter = grid.delimiter;
    const rowsIn = grid.rows;

    console.log("RAW HEADERS", rawHeaders);
    console.log("NORMALIZED HEADERS", normalizedHeaders);

    if (!rawHeaders.length) {
      return Promise.resolve({
        ok: false,
        error: "Не удалось прочитать заголовок CSV.",
        warnings,
        diagnostics: emptyDiagnostics([], delimiter, []),
      });
    }

    const previewRows = buildPreviewRows(rowsIn, rawHeaders, PREVIEW_ROW_LIMIT);
    const csvType = detectApartmentPlanCsvType(rawHeaders);
    console.log("CSV TYPE", csvType);

    switch (csvType) {
      case "fact_revenue_csv":
        return Promise.resolve({
          ok: false,
          error:
            "Это CSV факта поступлений (Наименование + Факт поступлений). Загрузите его в «Структура продаж» → «Подгрузить CSV», а не в план KPI квартир.",
          warnings,
          diagnostics: {
            rawHeaders,
            columnMapping: null,
            previewRows,
            delimiter,
            csvType: "fact_revenue_csv",
            factSource: "system_json",
          },
        });

      case "legacy_wide_table":
      case "bi_report": {
        if (!options) {
          return Promise.resolve({
            ok: false,
            error:
              "Обнаружена таблица плана (колонки «Наименование», «План проекта», …). Задайте контекст: период дашборда, дата отчёта или месяц в имени файла.",
            warnings,
            diagnostics: {
              rawHeaders,
              columnMapping: diagnosticsColumnMappingForType(csvType, rawHeaders),
              previewRows,
              delimiter,
              csvType,
              factSource: "system_json",
            },
          });
        }
        const monthKey = resolveBiReportMonthKey(options);
        if (!monthKey) {
          return Promise.resolve({
            ok: false,
            error:
              "Таблица плана: не удалось определить месяц (YYYY-MM). Укажите месяц на дашборде, корректную дату отчёта или имя файла с месяцем/годом.",
            warnings,
            diagnostics: {
              rawHeaders,
              columnMapping: diagnosticsColumnMappingForType(csvType, rawHeaders),
              previewRows,
              delimiter,
              csvType,
              factSource: "system_json",
            },
          });
        }

        const columnarResult = parseColumnarPlan(rawHeaders, rowsIn, monthKey, csvType);
        if (!columnarResult.ok) {
          return Promise.resolve({
            ...columnarResult,
            warnings,
            diagnostics: {
              ...columnarResult.diagnostics,
              rawHeaders,
              previewRows,
              delimiter,
              csvType,
            },
          });
        }

        return Promise.resolve({
          ...columnarResult,
          diagnostics: {
            ...columnarResult.diagnostics,
            rawHeaders,
            previewRows,
            delimiter,
          },
        });
      }

      case "wide_table": {
        if (detectLegacyWideTableCsv(rawHeaders)) {
          if (!options) {
            return Promise.resolve({
              ok: false,
              error:
                "Обнаружена legacy-таблица плана (колонки «Наименование», «План проекта», …). Задайте контекст: период дашборда, дата отчёта или месяц в имени файла.",
              warnings,
              diagnostics: {
                rawHeaders,
                columnMapping: diagnosticsColumnMappingForType("legacy_wide_table", rawHeaders),
                previewRows,
                delimiter,
                csvType: "legacy_wide_table",
                factSource: "system_json",
              },
            });
          }
          const legacyMonthKey = resolveBiReportMonthKey(options);
          if (!legacyMonthKey) {
            return Promise.resolve({
              ok: false,
              error:
                "Таблица плана: не удалось определить месяц (YYYY-MM). Укажите месяц на дашборде, корректную дату отчёта или имя файла с месяцем/годом.",
              warnings,
              diagnostics: {
                rawHeaders,
                columnMapping: diagnosticsColumnMappingForType("legacy_wide_table", rawHeaders),
                previewRows,
                delimiter,
                csvType: "legacy_wide_table",
                factSource: "system_json",
              },
            });
          }
          const legacyResult = parseColumnarPlan(rawHeaders, rowsIn, legacyMonthKey, "legacy_wide_table");
          return Promise.resolve({
            ...legacyResult,
            warnings: [...warnings, ...legacyResult.warnings],
            diagnostics: {
              ...legacyResult.diagnostics,
              rawHeaders,
              previewRows,
              delimiter,
              csvType: "legacy_wide_table",
            },
          });
        }
        const wideMonthKey = options ? resolveBiReportMonthKey(options) : null;
        return Promise.resolve(
          parseNormalizedWideTable(rawHeaders, rowsIn, previewRows, delimiter, wideMonthKey),
        );
      }

      default:
        return Promise.resolve({
          ok: false,
          error:
            "Не удалось распознать формат CSV плана. Ожидается legacy-таблица (Наименование, План проекта, …) или нормализованная таблица с колонкой месяца.",
          warnings,
          diagnostics: {
            rawHeaders,
            columnMapping: null,
            previewRows,
            delimiter,
            factSource: "system_json",
          },
        });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ошибка разбора CSV.";
    return Promise.resolve({
      ok: false,
      error: msg,
      warnings: [],
      diagnostics: emptyDiagnostics([], null, []),
    });
  }
}
