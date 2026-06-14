import Papa from "papaparse";

import { meltPaymentScheduleInstallmentForecastRows } from "@/lib/paymentScheduleCsv";
import { parseRuNumber } from "@/lib/parseRuNumber";
import type {
  InstallmentForecastCsvParseDiagnostics,
  InstallmentForecastCsvParseResult,
  InstallmentForecastNormalizedRow,
} from "@/lib/planDataSource/installmentForecast/types";
import { normalizeForecastMonth } from "@/lib/normalizeForecastMonth";

export const INSTALLMENT_FORECAST_CSV_MAX_BYTES = 10 * 1024 * 1024;

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function normalizeHeaderCell(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\u00a0/g, " ")
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ");
}

function pickColumnIndex(headers: string[], patterns: RegExp[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]!;
    if (patterns.some((p) => p.test(h))) return i;
  }
  return -1;
}

function parsePaymentMonthCell(yearRaw: unknown, monthRaw: unknown): string | null {
  const yearDigits = String(yearRaw ?? "").replace(/[^\d]/g, "");
  const year = yearDigits.length === 4 ? Number(yearDigits) : Number(yearDigits.length === 2 ? `20${yearDigits}` : NaN);
  if (!Number.isFinite(year) || year < 1900 || year > 2100) return null;

  const monthText = String(monthRaw ?? "").trim();
  if (!monthText) return null;

  const combined = normalizeForecastMonth(`${year}-${monthText}`);
  if (combined) return combined;

  const monthOnly = normalizeForecastMonth(monthText);
  if (monthOnly) {
    const m = monthOnly.slice(5, 7);
    return `${year}-${m}`;
  }

  const monthNum = Number(monthText.replace(/[^\d]/g, ""));
  if (Number.isFinite(monthNum) && monthNum >= 1 && monthNum <= 12) {
    return `${year}-${String(monthNum).padStart(2, "0")}`;
  }

  return null;
}

function parseLongFormatInstallmentForecast(
  rows: Record<string, string>[],
  metaFields: string[],
): InstallmentForecastCsvParseResult {
  const headers = metaFields.map(normalizeHeaderCell);
  const monthCol = pickColumnIndex(headers, [
    /^paymentmonth$/,
    /^payment_month$/,
    /^месяц$/,
    /^month$/,
    /^период$/,
    /^period$/,
    /^месяц\s*платежа$/,
  ]);
  const yearCol = pickColumnIndex(headers, [/^год$/, /^year$/]);
  const amountCol = pickColumnIndex(headers, [
    /^amount$/,
    /^сумма$/,
    /^платеж$/,
    /^план$/,
    /^сумма\s*платежа$/,
  ]);
  const contractCol = pickColumnIndex(headers, [
    /^contractid$/,
    /^contract_id$/,
    /^дду$/,
    /^договор$/,
    /^номер\s*договора$/,
    /^номер\s*и\s*дата\s*договора$/,
  ]);
  const objectTypeCol = pickColumnIndex(headers, [/^objecttype$/, /^object_type$/, /^тип\s*объекта$/, /^тип$/]);
  const segmentCol = pickColumnIndex(headers, [/^segment$/, /^сегмент$/, /^категория$/]);

  if (monthCol < 0 && yearCol < 0) {
    return {
      ok: false,
      error:
        "Не найдена колонка месяца (paymentMonth / месяц / период) или пары «Год» + «месяц».",
      diagnostics: {
        rawHeaders: metaFields,
        format: "long",
        importedRows: 0,
        delimiter: ";",
      },
    };
  }
  if (amountCol < 0) {
    return {
      ok: false,
      error: "Не найдена колонка суммы (amount / сумма / платеж).",
      diagnostics: {
        rawHeaders: metaFields,
        format: "long",
        importedRows: 0,
        delimiter: ";",
      },
    };
  }

  const out: InstallmentForecastNormalizedRow[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const rec = rows[i] ?? {};
    const values = metaFields.map((k) => String(rec[k] ?? "").trim());
    const amount = parseRuNumber(values[amountCol]) ?? 0;
    if (amount <= 0) {
      skipped++;
      continue;
    }

    let paymentMonth: string | null = null;
    if (monthCol >= 0) {
      paymentMonth = normalizeForecastMonth(values[monthCol]!);
    }
    if (!paymentMonth && yearCol >= 0) {
      const monthGuessCol = pickColumnIndex(headers, [/^месяц$/, /^month$/]);
      if (monthGuessCol >= 0) {
        paymentMonth = parsePaymentMonthCell(values[yearCol], values[monthGuessCol]);
      }
    }

    if (!paymentMonth) {
      skipped++;
      continue;
    }

    out.push({
      paymentMonth,
      amount,
      contractId: contractCol >= 0 ? values[contractCol]! || `row-${i + 1}` : `row-${i + 1}`,
      objectType: objectTypeCol >= 0 ? values[objectTypeCol]! : "",
      segment: segmentCol >= 0 ? values[segmentCol]! : "",
    });
  }

  if (out.length === 0) {
    return {
      ok: false,
      error: "В файле нет строк с распознанным месяцем и суммой.",
      warnings: skipped > 0 ? [`Пропущено строк: ${skipped}.`] : undefined,
      diagnostics: {
        rawHeaders: metaFields,
        format: "long",
        importedRows: 0,
        delimiter: ";",
      },
    };
  }

  return {
    ok: true,
    rows: out,
    warnings:
      skipped > 0 ? [`Пропущено строк без месяца или суммы: ${skipped}.`, ...warnings] : warnings.length ? warnings : undefined,
    diagnostics: {
      rawHeaders: metaFields,
      format: "long",
      importedRows: out.length,
      delimiter: ";",
    },
  };
}

function detectLongFormatHeaders(metaFields: string[]): boolean {
  const headers = metaFields.map(normalizeHeaderCell);
  const hasAmount = headers.some((h) => /^amount$|^сумма$|^платеж$/.test(h));
  const hasMonth =
    headers.some((h) => /^paymentmonth$|^месяц$|^month$|^период$/.test(h)) ||
    (headers.includes("год") && headers.some((h) => /^месяц$|^month$/.test(h)));
  return hasAmount && hasMonth;
}

/**
 * CSV прогноза поступлений по рассрочке (long-формат или широкий график платежей ДДУ).
 */
export function parseInstallmentForecastCsv(text: string): InstallmentForecastCsvParseResult {
  const raw = stripBom(text);
  if (!raw.trim()) {
    return { ok: false, error: "Пустой файл." };
  }

  const parsed = Papa.parse<Record<string, string>>(raw, {
    header: true,
    skipEmptyLines: true,
    delimiter: "",
  });

  const metaFields = parsed.meta.fields ?? [];
  if (metaFields.length > 0 && detectLongFormatHeaders(metaFields)) {
    const longResult = parseLongFormatInstallmentForecast(parsed.data, metaFields);
    if (longResult.ok) return longResult;
    if (parsed.data.length > 0) return longResult;
  }

  const wide = meltPaymentScheduleInstallmentForecastRows(raw);
  if (wide.ok) {
    return {
      ok: true,
      rows: wide.rows,
      warnings: wide.warnings,
      diagnostics: {
        rawHeaders: metaFields,
        format: "wide",
        importedRows: wide.rows.length,
        delimiter: parsed.meta.delimiter ?? ";",
      },
    };
  }

  if (metaFields.length > 0) {
    const longFallback = parseLongFormatInstallmentForecast(parsed.data, metaFields);
    if (longFallback.ok) return longFallback;
    return {
      ok: false,
      error: longFallback.ok ? "" : `${wide.error} ${longFallback.error}`.trim(),
      diagnostics: longFallback.diagnostics,
    };
  }

  return { ok: false, error: wide.error };
}

export async function parseInstallmentForecastCsvAsync(text: string): Promise<InstallmentForecastCsvParseResult> {
  return parseInstallmentForecastCsv(text);
}
