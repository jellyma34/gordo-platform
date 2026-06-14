import type { EntityPlanPeriodKpiCardsData } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiCards";
import type { MarketingTotalAreaCsvStoredV1 } from "@/lib/marketingTotalAreaCsv";
import {
  mergeTotalAreaEntityKpiData,
  totalAreaPeriodKpiHasData,
  totalAreaProjectVolumeRail,
  totalAreaSliceToCardsData,
  type TotalAreaPeriodKpiUiData,
} from "@/lib/totalAreaPeriodKpi";
import {
  selectTotalAreaCommercialPlanSliceForKpi,
  selectTotalAreaGrandTotalSliceForKpi,
  selectTotalAreaParkingPlanSliceForKpi,
  selectTotalAreaPlanSliceForKpi,
  selectTotalAreaStoragePlanSliceForKpi,
  type TotalAreaKpiPlanSlice,
} from "@/lib/planDataSource/totalArea/totalAreaPlanSlice";
import type { TotalAreaProjectColumnKind } from "@/lib/planDataSource/totalArea/types";
import {
  SALES_PLAN_OBJECT_TYPE_REGISTRY,
  SALES_PLAN_OBJECT_TYPE_SEGMENT_ORDER,
  type SalesPlanObjectTypeDefinition,
  type SalesPlanObjectTypeKey,
} from "@/lib/salesPlanByObjectType";

export type SalesPlanTotalAreaObjectSlice = {
  objectType: SalesPlanObjectTypeKey;
  definition: SalesPlanObjectTypeDefinition;
  kpiData: TotalAreaPeriodKpiUiData;
  cardsData: EntityPlanPeriodKpiCardsData;
  projectVolumeCompactCurrency: ReturnType<typeof totalAreaProjectVolumeRail>;
  hasData: boolean;
};

export type SalesPlanTotalAreaByObjectType = Record<SalesPlanObjectTypeKey, SalesPlanTotalAreaObjectSlice>;

function planSliceForSegment(
  doc: MarketingTotalAreaCsvStoredV1 | null,
  segment: Exclude<SalesPlanObjectTypeKey, "all">,
): TotalAreaKpiPlanSlice | null {
  if (!doc?.rows?.length) return null;
  switch (segment) {
    case "apartments":
      return selectTotalAreaPlanSliceForKpi(doc.rows, doc.apartmentsSummary ?? null);
    case "parking":
      return selectTotalAreaParkingPlanSliceForKpi(doc.rows, doc.parkingSummary ?? null);
    case "storage":
      return selectTotalAreaStoragePlanSliceForKpi(doc.rows, doc.storageSummary ?? null);
    case "commercial":
      return selectTotalAreaCommercialPlanSliceForKpi(doc.rows);
    default:
      return null;
  }
}

function buildSegmentSlice(
  objectType: Exclude<SalesPlanObjectTypeKey, "all">,
  doc: MarketingTotalAreaCsvStoredV1 | null,
  projectColumnKind: TotalAreaProjectColumnKind,
): SalesPlanTotalAreaObjectSlice {
  const definition = SALES_PLAN_OBJECT_TYPE_REGISTRY[objectType];
  const planSlice = planSliceForSegment(doc, objectType);
  const kpiData = mergeTotalAreaEntityKpiData(planSlice);
  return {
    objectType,
    definition,
    kpiData,
    cardsData: totalAreaSliceToCardsData(kpiData),
    projectVolumeCompactCurrency: totalAreaProjectVolumeRail(kpiData, projectColumnKind),
    hasData: totalAreaPeriodKpiHasData(kpiData),
  };
}

function toViewModel(
  objectType: SalesPlanObjectTypeKey,
  kpiData: TotalAreaPeriodKpiUiData,
  projectColumnKind: TotalAreaProjectColumnKind,
): SalesPlanTotalAreaObjectSlice {
  const definition = SALES_PLAN_OBJECT_TYPE_REGISTRY[objectType];
  return {
    objectType,
    definition,
    kpiData,
    cardsData: totalAreaSliceToCardsData(kpiData),
    projectVolumeCompactCurrency: totalAreaProjectVolumeRail(kpiData, projectColumnKind),
    hasData: totalAreaPeriodKpiHasData(kpiData),
  };
}

export type BuildSalesPlanTotalAreaByObjectTypeArgs = {
  doc: MarketingTotalAreaCsvStoredV1 | null;
};

/** Datasource KPI общей площади, кв.м по типам объектов (план/факт из CSV). */
export function buildSalesPlanTotalAreaByObjectType({
  doc,
}: BuildSalesPlanTotalAreaByObjectTypeArgs): SalesPlanTotalAreaByObjectType {
  const projectColumnKind = doc?.projectColumnKind ?? doc?.diagnostics?.projectColumnKind ?? "plan_project";

  const segmentSlices = SALES_PLAN_OBJECT_TYPE_SEGMENT_ORDER.map((segment) =>
    buildSegmentSlice(segment, doc, projectColumnKind),
  );

  const bySegment = Object.fromEntries(segmentSlices.map((s) => [s.objectType, s])) as Record<
    Exclude<SalesPlanObjectTypeKey, "all">,
    SalesPlanTotalAreaObjectSlice
  >;

  const grandTotal = doc?.rows?.length ? selectTotalAreaGrandTotalSliceForKpi(doc.rows) : null;
  const allKpi = mergeTotalAreaEntityKpiData(grandTotal);
  const allSlice = toViewModel("all", allKpi, projectColumnKind);

  return { ...bySegment, all: allSlice } as SalesPlanTotalAreaByObjectType;
}

export function salesPlanTotalAreaHasAnyData(byObjectType: SalesPlanTotalAreaByObjectType): boolean {
  return SALES_PLAN_OBJECT_TYPE_SEGMENT_ORDER.some((k) => byObjectType[k].hasData) || byObjectType.all.hasData;
}
