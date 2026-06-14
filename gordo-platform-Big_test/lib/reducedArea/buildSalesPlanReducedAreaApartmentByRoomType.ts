import {
  buildReducedAreaPlanTypeKpiBreakdown,
  type ReducedAreaPlanTypeKpiSlice,
} from "@/lib/reducedAreaPlanTypeKpi";
import {
  mergeReducedAreaEntityKpiData,
  reducedAreaPeriodKpiHasData,
  reducedAreaProjectVolumeRail,
  reducedAreaSliceToCardsData,
  type ReducedAreaPeriodKpiUiData,
} from "@/lib/reducedAreaPeriodKpi";
import type { MarketingReducedAreaCsvStoredV1 } from "@/lib/marketingReducedAreaCsv";
import {
  selectReducedAreaPlanSliceForKpi,
  type ReducedAreaKpiPlanSlice,
} from "@/lib/planDataSource/reducedArea/reducedAreaPlanSlice";
import type { ReducedAreaProjectColumnKind } from "@/lib/planDataSource/reducedArea/types";
import {
  APARTMENT_ROOM_TYPE_TAB_ORDER,
  apartmentRoomTypeConfig,
  ENABLED_APARTMENT_ROOM_TYPES,
  roomTypeToPlanTypeKey,
  type ApartmentRoomTypeFilterKey,
  type RoomTypeNormalized,
} from "@/lib/roomTypeNormalized";
import { SALES_PLAN_OBJECT_TYPE_REGISTRY } from "@/lib/salesPlanByObjectType";
import type { SalesPlanReducedAreaObjectSlice } from "@/lib/reducedArea/buildSalesPlanReducedAreaByObjectType";

export type ApartmentRoomBreakdownRow = {
  roomType: RoomTypeNormalized;
  label: string;
  shortLabel: string;
  factMonth: number;
  factCumulative: number;
  planMonth: number | null;
  planCumulative: number | null;
};

export type SalesPlanReducedAreaApartmentByRoomType = {
  byRoomType: Record<ApartmentRoomTypeFilterKey, SalesPlanReducedAreaObjectSlice>;
  breakdown: readonly ApartmentRoomBreakdownRow[];
};

function planTypeSliceToKpiData(
  slice: ReducedAreaPlanTypeKpiSlice,
  hasCsvPlan: boolean,
): ReducedAreaPeriodKpiUiData {
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
  kpiData: ReducedAreaPeriodKpiUiData,
  entityLabel: string,
  projectColumnKind: ReducedAreaProjectColumnKind,
): SalesPlanReducedAreaObjectSlice {
  const definition = SALES_PLAN_OBJECT_TYPE_REGISTRY.apartments;
  return {
    objectType: "apartments",
    definition: { ...definition, label: entityLabel },
    kpiData,
    cardsData: reducedAreaSliceToCardsData(kpiData),
    projectVolumeCompactCurrency: reducedAreaProjectVolumeRail(kpiData, projectColumnKind),
    hasData: reducedAreaPeriodKpiHasData(kpiData),
  };
}

function buildAllApartmentsSlice(
  doc: MarketingReducedAreaCsvStoredV1 | null,
  projectColumnKind: ReducedAreaProjectColumnKind,
): SalesPlanReducedAreaObjectSlice {
  const planSlice: ReducedAreaKpiPlanSlice | null = doc?.rows?.length
    ? selectReducedAreaPlanSliceForKpi(doc.rows, doc.apartmentsSummary ?? null)
    : null;
  const kpiData = mergeReducedAreaEntityKpiData(planSlice);
  return sliceFromKpiData(kpiData, SALES_PLAN_OBJECT_TYPE_REGISTRY.apartments.label, projectColumnKind);
}

export type BuildSalesPlanReducedAreaApartmentByRoomTypeArgs = {
  doc: MarketingReducedAreaCsvStoredV1 | null;
};

export function buildSalesPlanReducedAreaApartmentByRoomType({
  doc,
}: BuildSalesPlanReducedAreaApartmentByRoomTypeArgs): SalesPlanReducedAreaApartmentByRoomType {
  const projectColumnKind = doc?.projectColumnKind ?? doc?.diagnostics?.projectColumnKind ?? "plan_project";
  const hasCsvPlan = Boolean(doc?.rows?.length);
  const typeBreakdown = buildReducedAreaPlanTypeKpiBreakdown({
    rows: doc?.rows,
    hasCsvPlan,
  });

  const byRoomType = {} as Record<ApartmentRoomTypeFilterKey, SalesPlanReducedAreaObjectSlice>;
  const breakdown: ApartmentRoomBreakdownRow[] = [];

  for (const cfg of ENABLED_APARTMENT_ROOM_TYPES) {
    const planKey = roomTypeToPlanTypeKey(cfg.id);
    const item = planKey ? typeBreakdown.items.find((i) => i.key === planKey) : undefined;
    const slice: ReducedAreaPlanTypeKpiSlice =
      item ??
      ({
        key: planKey ?? "apt-1",
        label: cfg.label,
        planMonth: 0,
        planCumulative: 0,
        planProject: 0,
        factMonth: 0,
        factCumulative: 0,
      } as ReducedAreaPlanTypeKpiSlice);
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
