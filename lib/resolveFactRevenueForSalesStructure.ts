import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
import type { FactRevenueBySegment } from "@/lib/getFactRevenueBySegment";
import { getFactRevenueBySegment } from "@/lib/getFactRevenueBySegment";
import {
  reconcileMarketingRevenueFactDoc,
  revenueFactCsvDocIsValid,
  type MarketingRevenueFactCsvStoredV1,
} from "@/lib/marketingRevenueFactCsv";

/**
 * Факт поступлений для карточек «Структура продаж»:
 * при загруженном CSV — агрегат из файла, иначе JSON сделок.
 */
export function resolveFactRevenueBySegmentForStructure(
  dealsRows: readonly NormalizedDealRow[],
  revenueFactCsv: MarketingRevenueFactCsvStoredV1 | null | undefined,
): FactRevenueBySegment {
  if (revenueFactCsvDocIsValid(revenueFactCsv)) {
    return reconcileMarketingRevenueFactDoc(revenueFactCsv!).summary.bySegment;
  }
  return getFactRevenueBySegment(dealsRows);
}
