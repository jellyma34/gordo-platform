import type { EntityPlanPeriodKpiCardsData } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiCards";
import {
  averagePricePeriodKpiHasData,
  averagePriceProjectVolumeRail,
  averagePriceSliceToCardsData,
  mergeAveragePriceEntityKpiData,
  type AveragePricePeriodKpiUiData,
} from "@/lib/averagePricePerSqmPeriodKpi";
import type { MarketingAveragePricePerSqmCsvStoredV1 } from "@/lib/marketingAveragePricePerSqmCsv";
import {
  selectAveragePriceCommercialPlanSliceForKpi,
  selectAveragePriceGrandTotalSliceForKpi,
  selectAveragePriceParkingPlanSliceForKpi,
  selectAveragePricePlanSliceForKpi,
  selectAveragePriceStoragePlanSliceForKpi,
  type AveragePriceKpiPlanSlice,
} from "@/lib/planDataSource/averagePricePerSqm/averagePricePlanSlice";
import type { AveragePriceProjectColumnKind } from "@/lib/planDataSource/averagePricePerSqm/types";
import {
  SALES_PLAN_OBJECT_TYPE_REGISTRY,
  SALES_PLAN_OBJECT_TYPE_SEGMENT_ORDER,
  type SalesPlanObjectTypeDefinition,
  type SalesPlanObjectTypeKey,
} from "@/lib/salesPlanByObjectType";

export type SalesPlanAveragePriceObjectSlice = {
  objectType: SalesPlanObjectTypeKey;
  definition: SalesPlanObjectTypeDefinition;
  kpiData: AveragePricePeriodKpiUiData;
  cardsData: EntityPlanPeriodKpiCardsData;
  projectVolumeCompactCurrency: ReturnType<typeof averagePriceProjectVolumeRail>;
  hasData: boolean;
};

export type SalesPlanAveragePriceByObjectType = Record<SalesPlanObjectTypeKey, SalesPlanAveragePriceObjectSlice>;

function planSliceForSegment(
  doc: MarketingAveragePricePerSqmCsvStoredV1 | null,
  segment: Exclude<SalesPlanObjectTypeKey, "all">,
): AveragePriceKpiPlanSlice | null {
  if (!doc?.rows?.length) return null;
  switch (segment) {
    case "apartments":
      return selectAveragePricePlanSliceForKpi(doc.rows, doc.apartmentsSummary ?? null);
    case "parking":
      return selectAveragePriceParkingPlanSliceForKpi(doc.rows, doc.parkingSummary ?? null);
    case "storage":
      return selectAveragePriceStoragePlanSliceForKpi(doc.rows, doc.storageSummary ?? null);
    case "commercial":
      return selectAveragePriceCommercialPlanSliceForKpi(doc.rows);
    default:
      return null;
  }
}

function buildSegmentSlice(
  objectType: Exclude<SalesPlanObjectTypeKey, "all">,
  doc: MarketingAveragePricePerSqmCsvStoredV1 | null,
  projectColumnKind: AveragePriceProjectColumnKind,
): SalesPlanAveragePriceObjectSlice {
  const definition = SALES_PLAN_OBJECT_TYPE_REGISTRY[objectType];
  const planSlice = planSliceForSegment(doc, objectType);
  const kpiData = mergeAveragePriceEntityKpiData(planSlice);
  return {
    objectType,
    definition,
    kpiData,
    cardsData: averagePriceSliceToCardsData(kpiData),
    projectVolumeCompactCurrency: averagePriceProjectVolumeRail(kpiData, projectColumnKind),
    hasData: averagePricePeriodKpiHasData(kpiData),
  };
}

function toViewModel(
  objectType: SalesPlanObjectTypeKey,
  kpiData: AveragePricePeriodKpiUiData,
  projectColumnKind: AveragePriceProjectColumnKind,
): SalesPlanAveragePriceObjectSlice {
  const definition = SALES_PLAN_OBJECT_TYPE_REGISTRY[objectType];
  return {
    objectType,
    definition,
    kpiData,
    cardsData: averagePriceSliceToCardsData(kpiData),
    projectVolumeCompactCurrency: averagePriceProjectVolumeRail(kpiData, projectColumnKind),
    hasData: averagePricePeriodKpiHasData(kpiData),
  };
}

export type BuildSalesPlanAveragePriceByObjectTypeArgs = {
  doc: MarketingAveragePricePerSqmCsvStoredV1 | null;
};

/** Datasource KPI средней стоимости ₽/м² по типам объектов (план/факт из CSV). */
export function buildSalesPlanAveragePriceByObjectType({
  doc,
}: BuildSalesPlanAveragePriceByObjectTypeArgs): SalesPlanAveragePriceByObjectType {
  const projectColumnKind = doc?.projectColumnKind ?? doc?.diagnostics?.projectColumnKind ?? "plan_project";

  const segmentSlices = SALES_PLAN_OBJECT_TYPE_SEGMENT_ORDER.map((segment) =>
    buildSegmentSlice(segment, doc, projectColumnKind),
  );

  const bySegment = Object.fromEntries(segmentSlices.map((s) => [s.objectType, s])) as Record<
    Exclude<SalesPlanObjectTypeKey, "all">,
    SalesPlanAveragePriceObjectSlice
  >;

  const grandTotal = doc?.rows?.length ? selectAveragePriceGrandTotalSliceForKpi(doc.rows) : null;
  const allKpi = mergeAveragePriceEntityKpiData(grandTotal);
  const allSlice = toViewModel("all", allKpi, projectColumnKind);

  return { ...bySegment, all: allSlice } as SalesPlanAveragePriceByObjectType;
}

export function salesPlanAveragePriceHasAnyData(byObjectType: SalesPlanAveragePriceByObjectType): boolean {
  return SALES_PLAN_OBJECT_TYPE_SEGMENT_ORDER.some((k) => byObjectType[k].hasData) || byObjectType.all.hasData;
}
