import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
import { filterNormalizedDealsForMarketingObject } from "@/components/marketing/SalesPlanSegmentStructure";

/** Фильтры предпросмотра в редакторе маркетинга: объект из мок-селекта + грубый тип сделки. */
export function filterNormalizedDealsForEditPreview(
  rows: NormalizedDealRow[],
  objectId: string,
  dealTypeId: string,
): NormalizedDealRow[] {
  let r = filterNormalizedDealsForMarketingObject(rows, objectId);
  if (!dealTypeId || dealTypeId === "all") return r;
  if (dealTypeId === "tradein") {
    return r.filter((x) => /trade\s*-?\s*in|трейд|обмен/i.test(x.dealKindLabel));
  }
  if (dealTypeId === "primary") {
    return r.filter((x) => !/trade\s*-?\s*in|трейд|обмен/i.test(x.dealKindLabel));
  }
  return r;
}
