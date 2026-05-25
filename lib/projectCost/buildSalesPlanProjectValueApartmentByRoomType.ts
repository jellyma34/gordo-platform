import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
import {
  buildProjectValuePlanTypeKpiBreakdown,
  type ProjectValuePlanTypeKpiSlice,
} from "@/lib/projectValuePlanTypeKpi";
import type { MarketingProjectValueCsvStoredV1 } from "@/lib/marketingProjectValueCsv";
import {
  mergeProjectValueEntityKpiData,
  projectValuePeriodKpiHasData,
  projectValueProjectVolumeRail,
  projectValueSliceToCardsData,
  type ProjectValuePeriodKpiUiData,
} from "@/lib/projectValuePeriodKpi";
import { selectProjectValuePlanSliceForKpi, type ProjectValueKpiPlanSlice } from "@/lib/planDataSource/projectValue/projectValuePlanSlice";
import type { ProjectValueDealFacts } from "@/lib/projectValueFactsFromDeals";
import {
  APARTMENT_ROOM_TYPE_TAB_ORDER,
  apartmentRoomTypeConfig,
  ENABLED_APARTMENT_ROOM_TYPES,
  roomTypeToPlanTypeKey,
  type ApartmentRoomTypeFilterKey,
  type RoomTypeNormalized,
} from "@/lib/roomTypeNormalized";
import { SALES_PLAN_OBJECT_TYPE_REGISTRY } from "@/lib/salesPlanByObjectType";
import type { SalesPlanProjectValueObjectSlice } from "@/lib/projectCost/buildSalesPlanProjectValueByObjectType";

export type ApartmentRoomBreakdownRow = {
  roomType: RoomTypeNormalized;
  label: string;
  shortLabel: string;
  factMonth: number;
  factCumulative: number;
  planMonth: number | null;
  planCumulative: number | null;
};

export type SalesPlanProjectValueApartmentByRoomType = {
  byRoomType: Record<ApartmentRoomTypeFilterKey, SalesPlanProjectValueObjectSlice>;
  breakdown: readonly ApartmentRoomBreakdownRow[];
};

function planTypeSliceToKpiData(
  slice: ProjectValuePlanTypeKpiSlice,
  hasCsvPlan: boolean,
): ProjectValuePeriodKpiUiData {
  if (hasCsvPlan) {
    return { hasCsvPlan: true, csvFormat: slice.csvFormat, ...slice };
  }
  return { hasCsvPlan: false, factMonth: slice.factMonth, factCumulative: slice.factCumulative };
}

function sliceFromKpiData(kpiData: ProjectValuePeriodKpiUiData, entityLabel: string): SalesPlanProjectValueObjectSlice {
  const definition = SALES_PLAN_OBJECT_TYPE_REGISTRY.apartments;
  return {
    objectType: "apartments",
    definition: { ...definition, label: entityLabel },
    kpiData,
    cardsData: projectValueSliceToCardsData(kpiData),
    projectVolumeCompactCurrency: projectValueProjectVolumeRail(kpiData),
    hasData: projectValuePeriodKpiHasData(kpiData),
  };
}

function buildAllApartmentsSlice(
  doc: MarketingProjectValueCsvStoredV1 | null,
  dealFacts: ProjectValueDealFacts | null | undefined,
): SalesPlanProjectValueObjectSlice {
  const planSlice: ProjectValueKpiPlanSlice | null = doc?.rows?.length
    ? selectProjectValuePlanSliceForKpi(doc.rows, doc.apartmentsSummary ?? null)
    : null;
  const kpiData = mergeProjectValueEntityKpiData(planSlice, dealFacts ?? null);
  return sliceFromKpiData(kpiData, SALES_PLAN_OBJECT_TYPE_REGISTRY.apartments.label);
}

export type BuildSalesPlanProjectValueApartmentByRoomTypeArgs = {
  doc: MarketingProjectValueCsvStoredV1 | null;
  dealRows: readonly NormalizedDealRow[];
  periodGran: "month" | "quarter";
  currentPeriodKey: string;
  apartmentDealFacts?: ProjectValueDealFacts | null;
};

export function buildSalesPlanProjectValueApartmentByRoomType({
  doc,
  dealRows,
  periodGran,
  currentPeriodKey,
  apartmentDealFacts,
}: BuildSalesPlanProjectValueApartmentByRoomTypeArgs): SalesPlanProjectValueApartmentByRoomType {
  const hasCsvPlan = Boolean(doc?.rows?.length);
  const typeBreakdown = buildProjectValuePlanTypeKpiBreakdown({
    rows: doc?.rows,
    hasCsvPlan,
    period: periodGran,
    currentPeriodKey,
    dealRows,
  });

  const byRoomType = {} as Record<ApartmentRoomTypeFilterKey, SalesPlanProjectValueObjectSlice>;
  const breakdown: ApartmentRoomBreakdownRow[] = [];

  for (const cfg of ENABLED_APARTMENT_ROOM_TYPES) {
    const planKey = roomTypeToPlanTypeKey(cfg.id);
    const item = planKey ? typeBreakdown.items.find((i) => i.key === planKey) : undefined;
    const slice = item ?? {
      key: planKey ?? "apt-1",
      label: cfg.label,
      csvFormat: "legacy" as const,
      charter: 0,
      currentPlan: 0,
      priceIncrease: 0,
      reportMarkup: 0,
      projectCost: 0,
      planMonth: 0,
      planCumulative: 0,
      factMonth: 0,
      factCumulative: 0,
    };
    const kpiData = planTypeSliceToKpiData(slice, hasCsvPlan);
    byRoomType[cfg.id] = sliceFromKpiData(kpiData, cfg.label);

    breakdown.push({
      roomType: cfg.id,
      label: cfg.label,
      shortLabel: cfg.shortTabLabel,
      factMonth: slice.factMonth,
      factCumulative: slice.factCumulative,
      planMonth: hasCsvPlan ? slice.planMonth : null,
      planCumulative: hasCsvPlan ? slice.planCumulative : null,
    });
  }

  byRoomType.all = {
    ...buildAllApartmentsSlice(doc, apartmentDealFacts),
    definition: { ...SALES_PLAN_OBJECT_TYPE_REGISTRY.apartments, label: "Все квартиры" },
  };

  for (const key of APARTMENT_ROOM_TYPE_TAB_ORDER) {
    if (!byRoomType[key]) {
      const label =
        key === "all"
          ? "Все квартиры"
          : (apartmentRoomTypeConfig(key as RoomTypeNormalized)?.label ?? key);
      byRoomType[key] = sliceFromKpiData({ hasCsvPlan: false, factMonth: 0, factCumulative: 0 }, label);
    }
  }

  return { byRoomType, breakdown };
}
