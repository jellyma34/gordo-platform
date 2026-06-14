import type { EntityPlanPeriodKpiCardsData } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiCards";
import type { MarketingReducedAreaCsvStoredV1 } from "@/lib/marketingReducedAreaCsv";
import {
  mergeReducedAreaEntityKpiData,
  reducedAreaPeriodKpiHasData,
  reducedAreaProjectVolumeRail,
  reducedAreaSliceToCardsData,
  type ReducedAreaPeriodKpiUiData,
} from "@/lib/reducedAreaPeriodKpi";
import {
  selectReducedAreaCommercialPlanSliceForKpi,
  selectReducedAreaGrandTotalSliceForKpi,
  selectReducedAreaParkingPlanSliceForKpi,
  selectReducedAreaPlanSliceForKpi,
  selectReducedAreaStoragePlanSliceForKpi,
  type ReducedAreaKpiPlanSlice,
} from "@/lib/planDataSource/reducedArea/reducedAreaPlanSlice";
import type { ReducedAreaProjectColumnKind } from "@/lib/planDataSource/reducedArea/types";
import {
  SALES_PLAN_OBJECT_TYPE_REGISTRY,
  SALES_PLAN_OBJECT_TYPE_SEGMENT_ORDER,
  type SalesPlanObjectTypeDefinition,
  type SalesPlanObjectTypeKey,
} from "@/lib/salesPlanByObjectType";

export type SalesPlanReducedAreaObjectSlice = {
  objectType: SalesPlanObjectTypeKey;
  definition: SalesPlanObjectTypeDefinition;
  kpiData: ReducedAreaPeriodKpiUiData;
  cardsData: EntityPlanPeriodKpiCardsData;
  projectVolumeCompactCurrency: ReturnType<typeof reducedAreaProjectVolumeRail>;
  hasData: boolean;
};

export type SalesPlanReducedAreaByObjectType = Record<SalesPlanObjectTypeKey, SalesPlanReducedAreaObjectSlice>;

function planSliceForSegment(
  doc: MarketingReducedAreaCsvStoredV1 | null,
  segment: Exclude<SalesPlanObjectTypeKey, "all">,
): ReducedAreaKpiPlanSlice | null {
  if (!doc?.rows?.length) return null;
  switch (segment) {
    case "apartments":
      return selectReducedAreaPlanSliceForKpi(doc.rows, doc.apartmentsSummary ?? null);
    case "parking":
      return selectReducedAreaParkingPlanSliceForKpi(doc.rows, doc.parkingSummary ?? null);
    case "storage":
      return selectReducedAreaStoragePlanSliceForKpi(doc.rows, doc.storageSummary ?? null);
    case "commercial":
      return selectReducedAreaCommercialPlanSliceForKpi(doc.rows);
    default:
      return null;
  }
}

function buildSegmentSlice(
  objectType: Exclude<SalesPlanObjectTypeKey, "all">,
  doc: MarketingReducedAreaCsvStoredV1 | null,
  projectColumnKind: ReducedAreaProjectColumnKind,
): SalesPlanReducedAreaObjectSlice {
  const definition = SALES_PLAN_OBJECT_TYPE_REGISTRY[objectType];
  const planSlice = planSliceForSegment(doc, objectType);
  const kpiData = mergeReducedAreaEntityKpiData(planSlice);
  return {
    objectType,
    definition,
    kpiData,
    cardsData: reducedAreaSliceToCardsData(kpiData),
    projectVolumeCompactCurrency: reducedAreaProjectVolumeRail(kpiData, projectColumnKind),
    hasData: reducedAreaPeriodKpiHasData(kpiData),
  };
}

function toViewModel(
  objectType: SalesPlanObjectTypeKey,
  kpiData: ReducedAreaPeriodKpiUiData,
  projectColumnKind: ReducedAreaProjectColumnKind,
): SalesPlanReducedAreaObjectSlice {
  const definition = SALES_PLAN_OBJECT_TYPE_REGISTRY[objectType];
  return {
    objectType,
    definition,
    kpiData,
    cardsData: reducedAreaSliceToCardsData(kpiData),
    projectVolumeCompactCurrency: reducedAreaProjectVolumeRail(kpiData, projectColumnKind),
    hasData: reducedAreaPeriodKpiHasData(kpiData),
  };
}

export type BuildSalesPlanReducedAreaByObjectTypeArgs = {
  doc: MarketingReducedAreaCsvStoredV1 | null;
};

/** Datasource KPI приведенной площади, кв.м по типам объектов (план/факт из CSV). */
export function buildSalesPlanReducedAreaByObjectType({
  doc,
}: BuildSalesPlanReducedAreaByObjectTypeArgs): SalesPlanReducedAreaByObjectType {
  const projectColumnKind = doc?.projectColumnKind ?? doc?.diagnostics?.projectColumnKind ?? "plan_project";

  const segmentSlices = SALES_PLAN_OBJECT_TYPE_SEGMENT_ORDER.map((segment) =>
    buildSegmentSlice(segment, doc, projectColumnKind),
  );

  const bySegment = Object.fromEntries(segmentSlices.map((s) => [s.objectType, s])) as Record<
    Exclude<SalesPlanObjectTypeKey, "all">,
    SalesPlanReducedAreaObjectSlice
  >;

  const grandTotal = doc?.rows?.length ? selectReducedAreaGrandTotalSliceForKpi(doc.rows) : null;
  const allKpi = mergeReducedAreaEntityKpiData(grandTotal);
  const allSlice = toViewModel("all", allKpi, projectColumnKind);

  return { ...bySegment, all: allSlice } as SalesPlanReducedAreaByObjectType;
}

export function salesPlanReducedAreaHasAnyData(byObjectType: SalesPlanReducedAreaByObjectType): boolean {
  return SALES_PLAN_OBJECT_TYPE_SEGMENT_ORDER.some((k) => byObjectType[k].hasData) || byObjectType.all.hasData;
}
