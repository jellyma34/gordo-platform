import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
import type { EntityPlanPeriodKpiCardsData } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiCards";
import {
  dduRevenueCommercialFactsFromDealsForKpi,
  dduRevenueFactsFromDealsForKpi,
  dduRevenueParkingFactsFromDealsForKpi,
  dduRevenueStorageFactsFromDealsForKpi,
  type DduRevenueDealFacts,
} from "@/lib/dduRevenueFactsFromDeals";
import {
  dduRevenuePeriodKpiHasData,
  dduRevenueProjectVolumeRail,
  dduRevenueSliceToCardsData,
  mergeDduRevenueEntityKpiData,
  type DduRevenuePeriodKpiUiData,
} from "@/lib/dduRevenuePeriodKpi";
import type { MarketingDduRevenueCsvStoredV1 } from "@/lib/marketingDduRevenueCsv";
import {
  selectDduRevenueCommercialPlanSliceForKpi,
  selectDduRevenueParkingPlanSliceForKpi,
  selectDduRevenuePlanSliceForKpi,
  selectDduRevenueStoragePlanSliceForKpi,
  type DduRevenueKpiPlanSlice,
} from "@/lib/planDataSource/dduRevenue/dduRevenuePlanSlice";
import {
  SALES_PLAN_OBJECT_TYPE_REGISTRY,
  SALES_PLAN_OBJECT_TYPE_SEGMENT_ORDER,
  type SalesPlanObjectTypeDefinition,
  type SalesPlanObjectTypeKey,
} from "@/lib/salesPlanByObjectType";

export type SalesPlanDduRevenueObjectSlice = {
  objectType: SalesPlanObjectTypeKey;
  definition: SalesPlanObjectTypeDefinition;
  kpiData: DduRevenuePeriodKpiUiData;
  cardsData: EntityPlanPeriodKpiCardsData;
  projectVolumeCompactCurrency: ReturnType<typeof dduRevenueProjectVolumeRail>;
  hasData: boolean;
};

export type SalesPlanDduRevenueByObjectType = Record<SalesPlanObjectTypeKey, SalesPlanDduRevenueObjectSlice>;

function aggregateDduRevenueKpiData(parts: readonly DduRevenuePeriodKpiUiData[]): DduRevenuePeriodKpiUiData {
  let hasCsvPlan = false;
  let planMonth = 0;
  let planCumulative = 0;
  let planProject = 0;
  let factMonth = 0;
  let factCumulative = 0;

  for (const p of parts) {
    factMonth += p.factMonth;
    factCumulative += p.factCumulative;
    if (p.hasCsvPlan) {
      hasCsvPlan = true;
      planMonth += p.planMonth;
      planCumulative += p.planCumulative;
      planProject += p.planProject;
    }
  }

  if (hasCsvPlan) {
    return {
      hasCsvPlan: true,
      planMonth,
      planCumulative,
      planProject,
      factMonth,
      factCumulative,
    };
  }
  return { hasCsvPlan: false, factMonth, factCumulative };
}

function planSliceForSegment(
  doc: MarketingDduRevenueCsvStoredV1 | null,
  segment: Exclude<SalesPlanObjectTypeKey, "all">,
): DduRevenueKpiPlanSlice | null {
  if (!doc?.rows?.length) return null;
  switch (segment) {
    case "apartments":
      return selectDduRevenuePlanSliceForKpi(doc.rows, doc.apartmentsSummary ?? null);
    case "parking":
      return selectDduRevenueParkingPlanSliceForKpi(doc.rows, doc.parkingSummary ?? null);
    case "storage":
      return selectDduRevenueStoragePlanSliceForKpi(doc.rows, doc.storageSummary ?? null);
    case "commercial":
      return selectDduRevenueCommercialPlanSliceForKpi(doc.rows);
    default:
      return null;
  }
}

function dealFactsForSegment(
  dealRows: readonly NormalizedDealRow[],
  periodGran: "month" | "quarter",
  currentPeriodKey: string,
  segment: Exclude<SalesPlanObjectTypeKey, "all">,
): DduRevenueDealFacts | null {
  if (!dealRows.length) return null;
  const opts = { period: periodGran, currentPeriodKey };
  switch (segment) {
    case "apartments":
      return dduRevenueFactsFromDealsForKpi(dealRows, opts);
    case "parking":
      return dduRevenueParkingFactsFromDealsForKpi(dealRows, opts);
    case "storage":
      return dduRevenueStorageFactsFromDealsForKpi(dealRows, opts);
    case "commercial":
      return dduRevenueCommercialFactsFromDealsForKpi(dealRows, opts);
    default:
      return null;
  }
}

function buildSegmentSlice(
  objectType: Exclude<SalesPlanObjectTypeKey, "all">,
  doc: MarketingDduRevenueCsvStoredV1 | null,
  dealRows: readonly NormalizedDealRow[],
  periodGran: "month" | "quarter",
  currentPeriodKey: string,
  dealFactsOverride: DduRevenueDealFacts | null | undefined,
): SalesPlanDduRevenueObjectSlice {
  const definition = SALES_PLAN_OBJECT_TYPE_REGISTRY[objectType];
  const planSlice = planSliceForSegment(doc, objectType);
  const dealFacts =
    dealFactsOverride !== undefined
      ? dealFactsOverride
      : dealFactsForSegment(dealRows, periodGran, currentPeriodKey, objectType);
  const kpiData = mergeDduRevenueEntityKpiData(planSlice, dealFacts);
  return {
    objectType,
    definition,
    kpiData,
    cardsData: dduRevenueSliceToCardsData(kpiData),
    projectVolumeCompactCurrency: dduRevenueProjectVolumeRail(kpiData),
    hasData: dduRevenuePeriodKpiHasData(kpiData),
  };
}

function toViewModel(objectType: SalesPlanObjectTypeKey, kpiData: DduRevenuePeriodKpiUiData): SalesPlanDduRevenueObjectSlice {
  const definition = SALES_PLAN_OBJECT_TYPE_REGISTRY[objectType];
  return {
    objectType,
    definition,
    kpiData,
    cardsData: dduRevenueSliceToCardsData(kpiData),
    projectVolumeCompactCurrency: dduRevenueProjectVolumeRail(kpiData),
    hasData: dduRevenuePeriodKpiHasData(kpiData),
  };
}

export type BuildSalesPlanDduRevenueByObjectTypeArgs = {
  doc: MarketingDduRevenueCsvStoredV1 | null;
  dealRows: readonly NormalizedDealRow[];
  periodGran: "month" | "quarter";
  currentPeriodKey: string;
  dealFactsBySegment?: Partial<
    Record<Exclude<SalesPlanObjectTypeKey, "all">, DduRevenueDealFacts | null | undefined>
  >;
};

/** Универсальный datasource KPI ДДУ по типам объектов (план CSV + факт сделок). */
export function buildSalesPlanDduRevenueByObjectType({
  doc,
  dealRows,
  periodGran,
  currentPeriodKey,
  dealFactsBySegment,
}: BuildSalesPlanDduRevenueByObjectTypeArgs): SalesPlanDduRevenueByObjectType {
  const segmentSlices = SALES_PLAN_OBJECT_TYPE_SEGMENT_ORDER.map((segment) =>
    buildSegmentSlice(
      segment,
      doc,
      dealRows,
      periodGran,
      currentPeriodKey,
      dealFactsBySegment?.[segment],
    ),
  );

  const bySegment = Object.fromEntries(segmentSlices.map((s) => [s.objectType, s])) as Record<
    Exclude<SalesPlanObjectTypeKey, "all">,
    SalesPlanDduRevenueObjectSlice
  >;

  const allKpi = aggregateDduRevenueKpiData(segmentSlices.map((s) => s.kpiData));
  const allSlice = toViewModel("all", allKpi);

  return { ...bySegment, all: allSlice } as SalesPlanDduRevenueByObjectType;
}

export function salesPlanDduRevenueHasAnyData(byObjectType: SalesPlanDduRevenueByObjectType): boolean {
  return SALES_PLAN_OBJECT_TYPE_SEGMENT_ORDER.some((k) => byObjectType[k].hasData);
}
