import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
import type { EntityPlanPeriodKpiCardsData } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiCards";
import type { MarketingProjectValueCsvStoredV1 } from "@/lib/marketingProjectValueCsv";
import {
  mergeProjectValueEntityKpiData,
  projectValuePeriodKpiHasData,
  projectValueProjectVolumeRail,
  projectValueSliceToCardsData,
  type ProjectValuePeriodKpiUiData,
} from "@/lib/projectValuePeriodKpi";
import {
  projectValueCommercialFactsFromDealsForKpi,
  projectValueFactsFromDealsForKpi,
  projectValueParkingFactsFromDealsForKpi,
  projectValueStorageFactsFromDealsForKpi,
  type ProjectValueDealFacts,
} from "@/lib/projectValueFactsFromDeals";
import {
  selectProjectValueCommercialPlanSliceForKpi,
  selectProjectValueParkingPlanSliceForKpi,
  selectProjectValuePlanSliceForKpi,
  selectProjectValueStoragePlanSliceForKpi,
  type ProjectValueKpiPlanSlice,
} from "@/lib/planDataSource/projectValue/projectValuePlanSlice";
import {
  SALES_PLAN_OBJECT_TYPE_REGISTRY,
  SALES_PLAN_OBJECT_TYPE_SEGMENT_ORDER,
  type SalesPlanObjectTypeDefinition,
  type SalesPlanObjectTypeKey,
} from "@/lib/salesPlanByObjectType";

export type SalesPlanProjectValueObjectSlice = {
  objectType: SalesPlanObjectTypeKey;
  definition: SalesPlanObjectTypeDefinition;
  kpiData: ProjectValuePeriodKpiUiData;
  cardsData: EntityPlanPeriodKpiCardsData;
  projectVolumeCompactCurrency: ReturnType<typeof projectValueProjectVolumeRail>;
  hasData: boolean;
};

export type SalesPlanProjectValueByObjectType = Record<SalesPlanObjectTypeKey, SalesPlanProjectValueObjectSlice>;

function aggregateProjectValueKpiData(parts: readonly ProjectValuePeriodKpiUiData[]): ProjectValuePeriodKpiUiData {
  let hasCsvPlan = false;
  let factMonth = 0;
  let factCumulative = 0;
  let charter = 0;
  let currentPlan = 0;
  let priceIncrease = 0;
  let reportMarkup = 0;
  let projectCost = 0;
  let planMonth = 0;
  let planCumulative = 0;
  let csvFormat: ProjectValuePeriodKpiUiData["csvFormat"] = "legacy";

  for (const p of parts) {
    factMonth += p.factMonth;
    factCumulative += p.factCumulative;
    if (p.hasCsvPlan) {
      hasCsvPlan = true;
      if (p.csvFormat === "project_value") {
        csvFormat = "project_value";
        charter += p.charter;
        currentPlan += p.currentPlan;
        priceIncrease += p.priceIncrease;
        reportMarkup += p.reportMarkup;
        projectCost += p.projectCost;
      } else {
        planMonth += p.planMonth;
        planCumulative += p.planCumulative;
        projectCost += p.projectCost;
      }
    }
  }

  if (hasCsvPlan) {
    if (csvFormat === "project_value") {
      return {
        hasCsvPlan: true,
        csvFormat: "project_value",
        charter,
        currentPlan,
        priceIncrease,
        reportMarkup,
        projectCost: charter || projectCost,
        planMonth: charter,
        planCumulative: 0,
        factMonth: currentPlan,
        factCumulative: priceIncrease,
      };
    }
    return {
      hasCsvPlan: true,
      csvFormat: "legacy",
      charter: 0,
      currentPlan: 0,
      priceIncrease: 0,
      reportMarkup: 0,
      projectCost,
      planMonth,
      planCumulative,
      factMonth,
      factCumulative,
    };
  }
  return { hasCsvPlan: false, factMonth, factCumulative };
}

function planSliceForSegment(
  doc: MarketingProjectValueCsvStoredV1 | null,
  segment: Exclude<SalesPlanObjectTypeKey, "all">,
): ProjectValueKpiPlanSlice | null {
  if (!doc?.rows?.length) return null;
  switch (segment) {
    case "apartments":
      return selectProjectValuePlanSliceForKpi(doc.rows, doc.apartmentsSummary ?? null);
    case "parking":
      return selectProjectValueParkingPlanSliceForKpi(doc.rows, doc.parkingSummary ?? null);
    case "storage":
      return selectProjectValueStoragePlanSliceForKpi(doc.rows, doc.storageSummary ?? null);
    case "commercial":
      return selectProjectValueCommercialPlanSliceForKpi(doc.rows, doc.commercialSummary ?? null);
    default:
      return null;
  }
}

function dealFactsForSegment(
  dealRows: readonly NormalizedDealRow[],
  periodGran: "month" | "quarter",
  currentPeriodKey: string,
  segment: Exclude<SalesPlanObjectTypeKey, "all">,
): ProjectValueDealFacts | null {
  if (!dealRows.length) return null;
  const opts = { period: periodGran, currentPeriodKey };
  switch (segment) {
    case "apartments":
      return projectValueFactsFromDealsForKpi(dealRows, opts);
    case "parking":
      return projectValueParkingFactsFromDealsForKpi(dealRows, opts);
    case "storage":
      return projectValueStorageFactsFromDealsForKpi(dealRows, opts);
    case "commercial":
      return projectValueCommercialFactsFromDealsForKpi(dealRows, opts);
    default:
      return null;
  }
}

function buildSegmentSlice(
  objectType: Exclude<SalesPlanObjectTypeKey, "all">,
  doc: MarketingProjectValueCsvStoredV1 | null,
  dealRows: readonly NormalizedDealRow[],
  periodGran: "month" | "quarter",
  currentPeriodKey: string,
  dealFactsOverride: ProjectValueDealFacts | null | undefined,
): SalesPlanProjectValueObjectSlice {
  const definition = SALES_PLAN_OBJECT_TYPE_REGISTRY[objectType];
  const planSlice = planSliceForSegment(doc, objectType);
  const dealFacts =
    dealFactsOverride !== undefined
      ? dealFactsOverride
      : dealFactsForSegment(dealRows, periodGran, currentPeriodKey, objectType);
  const kpiData = mergeProjectValueEntityKpiData(planSlice, dealFacts);
  return {
    objectType,
    definition,
    kpiData,
    cardsData: projectValueSliceToCardsData(kpiData),
    projectVolumeCompactCurrency: projectValueProjectVolumeRail(kpiData),
    hasData: projectValuePeriodKpiHasData(kpiData),
  };
}

function toViewModel(
  objectType: SalesPlanObjectTypeKey,
  kpiData: ProjectValuePeriodKpiUiData,
): SalesPlanProjectValueObjectSlice {
  const definition = SALES_PLAN_OBJECT_TYPE_REGISTRY[objectType];
  return {
    objectType,
    definition,
    kpiData,
    cardsData: projectValueSliceToCardsData(kpiData),
    projectVolumeCompactCurrency: projectValueProjectVolumeRail(kpiData),
    hasData: projectValuePeriodKpiHasData(kpiData),
  };
}

export type BuildSalesPlanProjectValueByObjectTypeArgs = {
  doc: MarketingProjectValueCsvStoredV1 | null;
  dealRows: readonly NormalizedDealRow[];
  periodGran: "month" | "quarter";
  currentPeriodKey: string;
  dealFactsBySegment?: Partial<
    Record<Exclude<SalesPlanObjectTypeKey, "all">, ProjectValueDealFacts | null | undefined>
  >;
};

/** Datasource KPI «Общая стоимость проекта» по типам объектов. */
export function buildSalesPlanProjectValueByObjectType({
  doc,
  dealRows,
  periodGran,
  currentPeriodKey,
  dealFactsBySegment,
}: BuildSalesPlanProjectValueByObjectTypeArgs): SalesPlanProjectValueByObjectType {
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
    SalesPlanProjectValueObjectSlice
  >;

  const allKpi = aggregateProjectValueKpiData(segmentSlices.map((s) => s.kpiData));
  const allSlice = toViewModel("all", allKpi);

  return { ...bySegment, all: allSlice } as SalesPlanProjectValueByObjectType;
}

export function salesPlanProjectValueHasAnyData(byObjectType: SalesPlanProjectValueByObjectType): boolean {
  return SALES_PLAN_OBJECT_TYPE_SEGMENT_ORDER.some((k) => byObjectType[k].hasData);
}
