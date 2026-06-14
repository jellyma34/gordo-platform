import {
  buildTotalAreaPlanTypeKpiBreakdown,
  type TotalAreaPlanTypeKpiSlice,
} from "@/lib/totalAreaPlanTypeKpi";
import {
  mergeTotalAreaEntityKpiData,
  totalAreaPeriodKpiHasData,
  totalAreaProjectVolumeRail,
  totalAreaSliceToCardsData,
  type TotalAreaPeriodKpiUiData,
} from "@/lib/totalAreaPeriodKpi";
import type { MarketingTotalAreaCsvStoredV1 } from "@/lib/marketingTotalAreaCsv";
import {
  selectTotalAreaPlanSliceForKpi,
  type TotalAreaKpiPlanSlice,
} from "@/lib/planDataSource/totalArea/totalAreaPlanSlice";
import type { TotalAreaProjectColumnKind } from "@/lib/planDataSource/totalArea/types";
import {
  APARTMENT_ROOM_TYPE_TAB_ORDER,
  apartmentRoomTypeConfig,
  ENABLED_APARTMENT_ROOM_TYPES,
  roomTypeToPlanTypeKey,
  type ApartmentRoomTypeFilterKey,
  type RoomTypeNormalized,
} from "@/lib/roomTypeNormalized";
import { SALES_PLAN_OBJECT_TYPE_REGISTRY } from "@/lib/salesPlanByObjectType";
import type { SalesPlanTotalAreaObjectSlice } from "@/lib/totalArea/buildSalesPlanTotalAreaByObjectType";

export type ApartmentRoomBreakdownRow = {
  roomType: RoomTypeNormalized;
  label: string;
  shortLabel: string;
  factMonth: number;
  factCumulative: number;
  planMonth: number | null;
  planCumulative: number | null;
};

export type SalesPlanTotalAreaApartmentByRoomType = {
  byRoomType: Record<ApartmentRoomTypeFilterKey, SalesPlanTotalAreaObjectSlice>;
  breakdown: readonly ApartmentRoomBreakdownRow[];
};

function planTypeSliceToKpiData(
  slice: TotalAreaPlanTypeKpiSlice,
  hasCsvPlan: boolean,
): TotalAreaPeriodKpiUiData {
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
  kpiData: TotalAreaPeriodKpiUiData,
  entityLabel: string,
  projectColumnKind: TotalAreaProjectColumnKind,
): SalesPlanTotalAreaObjectSlice {
  const definition = SALES_PLAN_OBJECT_TYPE_REGISTRY.apartments;
  return {
    objectType: "apartments",
    definition: { ...definition, label: entityLabel },
    kpiData,
    cardsData: totalAreaSliceToCardsData(kpiData),
    projectVolumeCompactCurrency: totalAreaProjectVolumeRail(kpiData, projectColumnKind),
    hasData: totalAreaPeriodKpiHasData(kpiData),
  };
}

function buildAllApartmentsSlice(
  doc: MarketingTotalAreaCsvStoredV1 | null,
  projectColumnKind: TotalAreaProjectColumnKind,
): SalesPlanTotalAreaObjectSlice {
  const planSlice: TotalAreaKpiPlanSlice | null = doc?.rows?.length
    ? selectTotalAreaPlanSliceForKpi(doc.rows, doc.apartmentsSummary ?? null)
    : null;
  const kpiData = mergeTotalAreaEntityKpiData(planSlice);
  return sliceFromKpiData(kpiData, SALES_PLAN_OBJECT_TYPE_REGISTRY.apartments.label, projectColumnKind);
}

export type BuildSalesPlanTotalAreaApartmentByRoomTypeArgs = {
  doc: MarketingTotalAreaCsvStoredV1 | null;
};

export function buildSalesPlanTotalAreaApartmentByRoomType({
  doc,
}: BuildSalesPlanTotalAreaApartmentByRoomTypeArgs): SalesPlanTotalAreaApartmentByRoomType {
  const projectColumnKind = doc?.projectColumnKind ?? doc?.diagnostics?.projectColumnKind ?? "plan_project";
  const hasCsvPlan = Boolean(doc?.rows?.length);
  const typeBreakdown = buildTotalAreaPlanTypeKpiBreakdown({
    rows: doc?.rows,
    hasCsvPlan,
  });

  const byRoomType = {} as Record<ApartmentRoomTypeFilterKey, SalesPlanTotalAreaObjectSlice>;
  const breakdown: ApartmentRoomBreakdownRow[] = [];

  for (const cfg of ENABLED_APARTMENT_ROOM_TYPES) {
    const planKey = roomTypeToPlanTypeKey(cfg.id);
    const item = planKey ? typeBreakdown.items.find((i) => i.key === planKey) : undefined;
    const slice: TotalAreaPlanTypeKpiSlice =
      item ??
      ({
        key: planKey ?? "apt-1",
        label: cfg.label,
        planMonth: 0,
        planCumulative: 0,
        planProject: 0,
        factMonth: 0,
        factCumulative: 0,
      } as TotalAreaPlanTypeKpiSlice);
    const kpiData = planTypeSliceToKpiData(slice, hasCsvPlan);
    byRoomType[cfg.id] = sliceFromKpiData(kpiData, cfg.label, projectColumnKind);

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
    ...buildAllApartmentsSlice(doc, projectColumnKind),
    definition: { ...SALES_PLAN_OBJECT_TYPE_REGISTRY.apartments, label: "Все квартиры" },
  };

  for (const tabKey of APARTMENT_ROOM_TYPE_TAB_ORDER) {
    if (tabKey === "all" || byRoomType[tabKey]) continue;
    byRoomType[tabKey] = sliceFromKpiData(
      { hasCsvPlan: false, factMonth: 0, factCumulative: 0 },
      apartmentRoomTypeConfig(tabKey)?.label ?? tabKey,
      projectColumnKind,
    );
  }

  return { byRoomType, breakdown };
}
