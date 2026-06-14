import { extractNormalizedDeals, type DealExportRow, type NormalizedDealRow } from "@/components/marketing/DealsSection";
import { dealsRawRowsFromJson } from "@/lib/marketingDealsInputShape";

export type DealsUploadValidateResult =
  | { ok: true; rawCount: number; normalizedRows: NormalizedDealRow[] }
  | { ok: false; errors: string[]; rawCount: number };

/** Проверка JSON перед загрузкой: форма входа и успешность нормализации. */
export function validateMarketingDealsUploadJson(json: unknown): DealsUploadValidateResult {
  const errors: string[] = [];

  const rawRows = dealsRawRowsFromJson(json);
  const rawCount = rawRows.length;
  if (rawCount === 0) {
    errors.push(
      "Нет данных: ожидался массив сделок, объект вида { data: [...] } или объект с полями-массивами сделок.",
    );
  }

  const normalizedRows = extractNormalizedDeals(rawRows as DealExportRow[]);

  if (rawCount > 0 && normalizedRows.length === 0) {
    errors.push("Ни одна строка не прошла разбор даты или суммы сделки — проверьте поля как в экспорте CRM.");
  }

  if (errors.length > 0) {
    return { ok: false, errors, rawCount };
  }

  return { ok: true, rawCount, normalizedRows };
}
