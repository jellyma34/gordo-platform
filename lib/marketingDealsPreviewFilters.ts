import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
import { filterNormalizedDealsForMarketingObject } from "@/components/marketing/SalesPlanSegmentStructure";

/** Фильтры предпросмотра в редакторе маркетинга: объект из селекта. */
export function filterNormalizedDealsForEditPreview(
  rows: NormalizedDealRow[],
  objectId: string,
): NormalizedDealRow[] {
  return filterNormalizedDealsForMarketingObject(rows, objectId);
}
