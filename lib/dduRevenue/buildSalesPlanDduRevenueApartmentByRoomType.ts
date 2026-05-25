import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
import {
  buildDduRevenuePlanTypeKpiBreakdown,
  type DduRevenuePlanTypeKpiSlice,
} from "@/lib/dduRevenuePlanTypeKpi";
import { dduRevenuePlanTypeSliceToCardsData } from "@/lib/dduRevenuePlanTypeKpiCards";
import {
  dduRevenuePeriodKpiHasData,
  dduRevenueProjectVolumeRail,
  dduRevenueSliceToCardsData,
  mergeDduRevenueEntityKpiData,
  type DduRevenuePeriodKpiUiData,
} from "@/lib/dduRevenuePeriodKpi";
import type { MarketingDduRevenueCsvStoredV1 } from "@/lib/marketingDduRevenueCsv";
import { selectDduRevenuePlanSliceForKpi, type DduRevenueKpiPlanSlice } from "@/lib/planDataSource/dduRevenue/dduRevenuePlanSlice";
import {
  APARTMENT_ROOM_TYPE_TAB_ORDER,
  apartmentRoomTypeConfig,
  ENABLED_APARTMENT_ROOM_TYPES,
  roomTypeToPlanTypeKey,
  type ApartmentRoomTypeFilterKey,
  type RoomTypeNormalized,
} from "@/lib/roomTypeNormalized";
import { SALES_PLAN_OBJECT_TYPE_REGISTRY } from "@/lib/salesPlanByObjectType";
import type { SalesPlanDduRevenueObjectSlice } from "@/lib/dduRevenue/buildSalesPlanDduRevenueByObjectType";
import type { DduRevenueDealFacts } from "@/lib/dduRevenueFactsFromDeals";

export type ApartmentRoomBreakdownRow = {
  roomType: RoomTypeNormalized;
  label: string;
  shortLabel: string;
  factMonth: number;
  factCumulative: number;
  planMonth: number | null;
  planCumulative: number | null;
};

export type SalesPlanDduRevenueApartmentByRoomType = {
  byRoomType: Record<ApartmentRoomTypeFilterKey, SalesPlanDduRevenueObjectSlice>;
  breakdown: readonly ApartmentRoomBreakdownRow[];
};

function planTypeSliceToKpiData(
  slice: DduRevenuePlanTypeKpiSlice,
  hasCsvPlan: boolean,
): DduRevenuePeriodKpiUiData {
  if (hasCsvPlan) {
    return {
      hasCsvPlan: true,
      planMonth: slice.planMonth,
      planCumulative: slice.planCumulative,
      planProject: slice.planProject,
      factMonth: slice.factMonth,
      factCumulative: slice.factCumulative,
    };
  }
  return {
    hasCsvPlan: false,
    factMonth: slice.factMonth,
    factCumulative: slice.factCumulative,
  };
}

function sliceFromKpiData(
  kpiData: DduRevenuePeriodKpiUiData,
  entityLabel: string,
): SalesPlanDduRevenueObjectSlice {
  const definition = SALES_PLAN_OBJECT_TYPE_REGISTRY.apartments;
  return {
    objectType: "apartments",
    definition: { ...definition, label: entityLabel },
    kpiData,
    cardsData: dduRevenueSliceToCardsData(kpiData),
    projectVolumeCompactCurrency: dduRevenueProjectVolumeRail(kpiData),
    hasData: dduRevenuePeriodKpiHasData(kpiData),
  };
}

function buildAllApartmentsSlice(
  doc: MarketingDduRevenueCsvStoredV1 | null,
  dealFacts: DduRevenueDealFacts | null | undefined,
): SalesPlanDduRevenueObjectSlice {
  const planSlice: DduRevenueKpiPlanSlice | null = doc?.rows?.length
    ? selectDduRevenuePlanSliceForKpi(doc.rows, doc.apartmentsSummary ?? null)
    : null;
  const kpiData = mergeDduRevenueEntityKpiData(planSlice, dealFacts ?? null);
  return sliceFromKpiData(kpiData, SALES_PLAN_OBJECT_TYPE_REGISTRY.apartments.label);
}

export type BuildSalesPlanDduRevenueApartmentByRoomTypeArgs = {
  doc: MarketingDduRevenueCsvStoredV1 | null;
  dealRows: readonly NormalizedDealRow[];
  periodGran: "month" | "quarter";
  currentPeriodKey: string;
  apartmentDealFacts?: DduRevenueDealFacts | null;
};

/** Nested filter: objectType=apartments × roomType (CSV room rows + факт сделок по комнатности). */
export function buildSalesPlanDduRevenueApartmentByRoomType({
  doc,
  dealRows,
  periodGran,
  currentPeriodKey,
  apartmentDealFacts,
}: BuildSalesPlanDduRevenueApartmentByRoomTypeArgs): SalesPlanDduRevenueApartmentByRoomType {
  const hasCsvPlan = Boolean(doc?.rows?.length);
  const typeBreakdown = buildDduRevenuePlanTypeKpiBreakdown({
    rows: doc?.rows,
    hasCsvPlan,
    period: periodGran,
    currentPeriodKey,
    dealRows,
  });

  const byRoomType = {} as Record<ApartmentRoomTypeFilterKey, SalesPlanDduRevenueObjectSlice>;
  const breakdown: ApartmentRoomBreakdownRow[] = [];

  for (const cfg of ENABLED_APARTMENT_ROOM_TYPES) {
    const planKey = roomTypeToPlanTypeKey(cfg.id);
    const item = planKey
      ? typeBreakdown.items.find((i) => i.key === planKey)
      : undefined;
    const slice = item ?? {
      key: planKey ?? "apt-1",
      label: cfg.label,
      planMonth: 0,
      planCumulative: 0,
      planProject: 0,
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

/** KPI-карточки для одной комнатности (для tooltip breakdown). */
export function apartmentRoomTypeCardsData(
  breakdown: readonly ApartmentRoomBreakdownRow[],
  roomType: RoomTypeNormalized,
  hasCsvPlan: boolean,
): ReturnType<typeof dduRevenuePlanTypeSliceToCardsData> | null {
  const row = breakdown.find((r) => r.roomType === roomType);
  if (!row) return null;
  const slice: DduRevenuePlanTypeKpiSlice = {
    key: roomTypeToPlanTypeKey(roomType) ?? "apt-1",
    label: row.label,
    planMonth: row.planMonth ?? 0,
    planCumulative: row.planCumulative ?? 0,
    planProject: 0,
    factMonth: row.factMonth,
    factCumulative: row.factCumulative,
  };
  return dduRevenuePlanTypeSliceToCardsData(slice, hasCsvPlan);
}
