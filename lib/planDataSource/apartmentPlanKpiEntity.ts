import { isApartmentRootSummaryRow } from "@/lib/planDataSource/entityRowMatchers";

/** Сущность KPI блока «Выполнение плана отчётного периода» (только квартиры). */
export const APARTMENT_KPI_ENTITY = "apartments" as const;
export type ApartmentPlanKpiEntityType = typeof APARTMENT_KPI_ENTITY;

export type BiApartmentsSummarySlice = {
  planMonth: number;
  planCumulative: number;
  planProject: number;
  rawLabel: string;
};

function normLabel(raw: string, segmentNorm: string): { raw: string; n: string; compact: string } {
  const rawL = String(raw ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\u00a0/g, " ")
    .trim();
  const n = segmentNorm.replace(/\s+/g, " ").trim().toLowerCase();
  const compact = rawL.replace(/\s+/g, "");
  return { raw: rawL, n, compact };
}

/** Строка «ИТОГО» / «Всего» по всем типам помещений — не для KPI квартир. */
export function isBiGrandTotalRow(segmentNorm: string, rawLabel: string): boolean {
  const { raw, n, compact } = normLabel(rawLabel, segmentNorm);
  if (!n && !compact) return false;
  if (n === "итого" || n === "всего" || compact === "итого" || compact === "всего") return true;
  if (raw === "итого" || raw.startsWith("итого ")) return true;
  return false;
}

/** Сводная строка «Квартиры» — источник накопительного плана и объёма для KPI квартир. */
export function isBiApartmentsSummaryRow(segmentNorm: string, rawLabel: string): boolean {
  return isApartmentRootSummaryRow(segmentNorm, rawLabel);
}

/** Парковки, кладовые, коммерция — не входят в KPI квартир. */
export function isNonApartmentPropertyRow(segmentNorm: string, rawLabel: string): boolean {
  if (isBiGrandTotalRow(segmentNorm, rawLabel) || isBiApartmentsSummaryRow(segmentNorm, rawLabel)) {
    return false;
  }
  const blob = `${segmentNorm} ${rawLabel}`.toLowerCase().replace(/ё/g, "е");
  return (
    blob.includes("парков") ||
    blob.includes("машиномест") ||
    blob.includes("мм ") ||
    blob.includes("кладов") ||
    blob.includes("коммерц") ||
    blob.includes("нежил") ||
    blob.includes("офис") ||
    blob.includes("ритейл") ||
    blob.includes("parking") ||
    blob.includes("storage") ||
    blob.includes("commercial")
  );
}

/** Детальные строки квартир (1-ком., 2-ком., …) — для плана месяца. */
export function isApartmentPlanKpiDetailSegment(segmentNorm: string, rawLabel: string): boolean {
  if (isBiGrandTotalRow(segmentNorm, rawLabel)) return false;
  if (isBiApartmentsSummaryRow(segmentNorm, rawLabel)) return false;
  if (isNonApartmentPropertyRow(segmentNorm, rawLabel)) return false;
  const blob = `${segmentNorm} ${rawLabel}`.toLowerCase().replace(/ё/g, "е");
  if (/[1-4]\s*[-–]?\s*ком/.test(blob)) return true;
  if (blob.includes("комнат")) return true;
  if (blob.includes("квартир") && !blob.includes("парков")) return true;
  if (blob.includes("студи")) return true;
  return blob.length >= 2;
}

/** @deprecated Используйте {@link isBiApartmentsSummaryRow} / {@link isBiGrandTotalRow}. */
export function isBiSummaryRowSegment(segmentNorm: string, rawLabel: string): boolean {
  return isBiApartmentsSummaryRow(segmentNorm, rawLabel) || isBiGrandTotalRow(segmentNorm, rawLabel);
}
