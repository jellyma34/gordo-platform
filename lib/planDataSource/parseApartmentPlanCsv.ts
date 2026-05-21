import Papa from "papaparse";

import {
  columnMappingForDiagnostics,
  resolveApartmentPlanHeaders,
} from "@/lib/planDataSource/apartmentPlanCsvColumns";
import {
  isBiApartmentsSummaryRow,
  isBiGrandTotalRow,
} from "@/lib/planDataSource/apartmentPlanKpiEntity";
import {
  detectApartmentPlanBiReportCsv,
  parseApartmentPlanBiReportFromGrid,
  resolveBiReportMonthKey,
} from "@/lib/planDataSource/parseApartmentPlanBiReportCsv";
import { normalizeMatchKey } from "@/lib/planDataSource/normalize";
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
): ApartmentPlanCsvParseDiagnostics {
  return {
    rawHeaders,
    columnMapping: null,
    previewRows,
    delimiter,
    factSource: "system_json",
  };
}

/**
 * Асинхронный разбор CSV плана (только план; факт — из API).
 * Сначала определяется BI-отчёт (показатели в колонках); иначе — «сырая» таблица с колонкой месяца.
 * Для BI задайте {@link ParseApartmentPlanCsvOptions} (период дашборда, asOf, имя файла).
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

  return new Promise((resolve) => {
    Papa.parse<Record<string, unknown>>(stripped, {
      header: true,
      skipEmptyLines: "greedy",
      delimitersToGuess: [";", ",", "\t", "|"],
      transformHeader: (h) => preprocessCell(h),
      complete: (results) => {
        const warnings: string[] = [];
        const metaFields = results.meta.fields ?? [];
        const delimiter =
          results.meta.delimiter && results.meta.delimiter.length ? results.meta.delimiter : null;

        if (!metaFields.length) {
          resolve({
            ok: false,
            error: "Не удалось прочитать заголовок CSV.",
            warnings,
            diagnostics: emptyDiagnostics([], delimiter, []),
          });
          return;
        }

        const rawHeaders = [...metaFields];
        const rowsIn = results.data ?? [];
        const previewRows = buildPreviewRows(rowsIn, metaFields, PREVIEW_ROW_LIMIT);

        if (detectApartmentPlanBiReportCsv(metaFields)) {
          if (!options) {
            resolve({
              ok: false,
              error:
                "Обнаружен BI-отчёт (показатели плана в колонках). Задайте контекст: период дашборда, дата отчёта или месяц в имени файла.",
              warnings,
              diagnostics: {
                rawHeaders,
                columnMapping: null,
                previewRows,
                delimiter,
                csvType: "bi_report",
                factSource: "system_json",
              },
            });
            return;
          }
          const monthKey = resolveBiReportMonthKey(options);
          if (!monthKey) {
            resolve({
              ok: false,
              error:
                "BI-отчёт: не удалось определить месяц (YYYY-MM). Укажите месяц на дашборде, корректную дату отчёта или имя файла с месяцем/годом.",
              warnings,
              diagnostics: {
                rawHeaders,
                columnMapping: null,
                previewRows,
                delimiter,
                csvType: "bi_report",
                factSource: "system_json",
              },
            });
            return;
          }

          const bi = parseApartmentPlanBiReportFromGrid(metaFields, rowsIn, monthKey);
          if (!bi.ok) {
            resolve({
              ok: false,
              error: bi.error,
              warnings,
              diagnostics: {
                rawHeaders,
                columnMapping: null,
                previewRows,
                delimiter,
                csvType: "bi_report",
                monthKeyUsed: monthKey,
                importedSegmentRows: 0,
                ignoredSummaryRows: 0,
                factSource: "system_json",
              },
            });
            return;
          }

          const r = bi.result;
          resolve({
            ok: true,
            rows: r.rows,
            warnings: r.warnings,
            biReportMeta: {
              monthKey,
              apartmentsSummary: r.apartmentsSummary,
              summaryPlanProject: r.summaryPlanProject,
            },
            diagnostics: {
              rawHeaders,
              columnMapping: r.columnMapping,
              previewRows,
              delimiter,
              csvType: "bi_report",
              importedSegmentRows: r.importedSegmentRows,
              ignoredSummaryRows: r.ignoredSummaryRows,
              monthKeyUsed: monthKey,
              factSource: "system_json",
            },
          });
          return;
        }

        const resolved = resolveApartmentPlanHeaders(metaFields);

        if ("error" in resolved) {
          resolve({
            ok: false,
            error: resolved.error,
            warnings,
            diagnostics: {
              rawHeaders,
              columnMapping: null,
              previewRows,
              delimiter,
              csvType: "wide_table",
              factSource: "system_json",
            },
          });
          return;
        }

        const { map } = resolved;
        const columnMapping = columnMappingForDiagnostics(map);

        if (!rowsIn.length) {
          resolve({
            ok: false,
            error: "Нет ни одной строки данных после заголовка.",
            warnings,
            diagnostics: {
              rawHeaders,
              columnMapping,
              previewRows,
              delimiter,
              csvType: "wide_table",
              factSource: "system_json",
            },
          });
          return;
        }

        const rows: ApartmentPlanCsvNormalizedRow[] = [];

        for (let i = 0; i < rowsIn.length; i++) {
          const rec = rowsIn[i] ?? {};
          const segRaw = rec[map.segment];
          const monthRaw = rec[map.month];
          const pmRaw = rec[map.planMonth];
          const pcRaw = rec[map.planCumulative];
          const tvRaw = rec[map.totalVolume];
          const atRaw = map.apartmentType ? rec[map.apartmentType] : undefined;

          const segmentNorm = normalizeMatchKey(segRaw);
          if (!segmentNorm) {
            warnings.push(`Строка ${i + 2}: пропущена (пустой segment).`);
            continue;
          }

          const rawSeg = segRaw != null ? String(segRaw) : "";
          if (isBiGrandTotalRow(segmentNorm, rawSeg) || isBiApartmentsSummaryRow(segmentNorm, rawSeg)) {
            warnings.push(
              `Строка ${i + 2}: пропущена (свод «Квартиры» или ИТОГО — не строка сегмента).`,
            );
            continue;
          }

          const monthKey = parseMonthKeyCell(monthRaw != null ? String(monthRaw) : "");
          if (!monthKey) {
            warnings.push(`Строка ${i + 2}: пропущена (некорректный month: "${monthRaw}").`);
            continue;
          }

          const planMonthN = parseNumberCell(pmRaw != null ? String(pmRaw) : "");
          const planCumulativeN = parseNumberCell(pcRaw != null ? String(pcRaw) : "");
          const totalVolumeN = parseNumberCell(tvRaw != null ? String(tvRaw) : "");

          if (planMonthN == null || planCumulativeN == null || totalVolumeN == null) {
            warnings.push(`Строка ${i + 2}: пропущена (ожидаются числа в plan_month / plan_cumulative / total_volume).`);
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
          resolve({
            ok: false,
            error:
              "Не удалось импортировать ни одной строки: проверьте сегмент, месяц (формат YYYY-MM или 01.2024) и числовые поля.",
            warnings,
            diagnostics: {
              rawHeaders,
              columnMapping,
              previewRows,
              delimiter,
              csvType: "wide_table",
              factSource: "system_json",
            },
          });
          return;
        }

        resolve({
          ok: true,
          rows,
          warnings,
          diagnostics: {
            rawHeaders,
            columnMapping,
            previewRows,
            delimiter,
            csvType: "wide_table",
            factSource: "system_json",
          },
        });
      },
      error: (err: Error) => {
        resolve({
          ok: false,
          error: err.message || "Ошибка разбора CSV.",
          warnings: [],
          diagnostics: emptyDiagnostics([], null, []),
        });
      },
    });
  });
}
