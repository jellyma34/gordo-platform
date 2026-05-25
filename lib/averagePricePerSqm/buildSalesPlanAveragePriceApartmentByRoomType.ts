import {
  buildAveragePricePlanTypeKpiBreakdown,
  type AveragePricePlanTypeKpiSlice,
} from "@/lib/averagePricePerSqmPlanTypeKpi";
import { averagePricePlanTypeSliceToCardsData } from "@/lib/averagePricePerSqmPlanTypeKpiCards";
import {
  averagePricePeriodKpiHasData,
  averagePriceProjectVolumeRail,
  averagePriceSliceToCardsData,
  mergeAveragePriceEntityKpiData,
  type AveragePricePeriodKpiUiData,
} from "@/lib/averagePricePerSqmPeriodKpi";
import type { MarketingAveragePricePerSqmCsvStoredV1 } from "@/lib/marketingAveragePricePerSqmCsv";
import {
  selectAveragePricePlanSliceForKpi,
  type AveragePriceKpiPlanSlice,
} from "@/lib/planDataSource/averagePricePerSqm/averagePricePlanSlice";
import type { AveragePriceProjectColumnKind } from "@/lib/planDataSource/averagePricePerSqm/types";
import {
  APARTMENT_ROOM_TYPE_TAB_ORDER,
  apartmentRoomTypeConfig,
  ENABLED_APARTMENT_ROOM_TYPES,
  roomTypeToPlanTypeKey,
  type ApartmentRoomTypeFilterKey,
  type RoomTypeNormalized,
} from "@/lib/roomTypeNormalized";
import { SALES_PLAN_OBJECT_TYPE_REGISTRY } from "@/lib/salesPlanByObjectType";
import type { SalesPlanAveragePriceObjectSlice } from "@/lib/averagePricePerSqm/buildSalesPlanAveragePriceByObjectType";

export type ApartmentRoomBreakdownRow = {
  roomType: RoomTypeNormalized;
  label: string;
  shortLabel: string;
  factMonth: number;
  factCumulative: number;
  planMonth: number | null;
  planCumulative: number | null;
};

export type SalesPlanAveragePriceApartmentByRoomType = {
  byRoomType: Record<ApartmentRoomTypeFilterKey, SalesPlanAveragePriceObjectSlice>;
  breakdown: readonly ApartmentRoomBreakdownRow[];
};

function planTypeSliceToKpiData(
  slice: AveragePricePlanTypeKpiSlice,
  hasCsvPlan: boolean,
): AveragePricePeriodKpiUiData {
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
  kpiData: AveragePricePeriodKpiUiData,
  entityLabel: string,
  projectColumnKind: AveragePriceProjectColumnKind,
): SalesPlanAveragePriceObjectSlice {
  const definition = SALES_PLAN_OBJECT_TYPE_REGISTRY.apartments;
  return {
    objectType: "apartments",
    definition: { ...definition, label: entityLabel },
    kpiData,
    cardsData: averagePriceSliceToCardsData(kpiData),
    projectVolumeCompactCurrency: averagePriceProjectVolumeRail(kpiData, projectColumnKind),
    hasData: averagePricePeriodKpiHasData(kpiData),
  };
}

function buildAllApartmentsSlice(
  doc: MarketingAveragePricePerSqmCsvStoredV1 | null,
  projectColumnKind: AveragePriceProjectColumnKind,
): SalesPlanAveragePriceObjectSlice {
  const planSlice: AveragePriceKpiPlanSlice | null = doc?.rows?.length
    ? selectAveragePricePlanSliceForKpi(doc.rows, doc.apartmentsSummary ?? null)
    : null;
  const kpiData = mergeAveragePriceEntityKpiData(planSlice);
  return sliceFromKpiData(kpiData, SALES_PLAN_OBJECT_TYPE_REGISTRY.apartments.label, projectColumnKind);
}

export type BuildSalesPlanAveragePriceApartmentByRoomTypeArgs = {
  doc: MarketingAveragePricePerSqmCsvStoredV1 | null;
};

export function buildSalesPlanAveragePriceApartmentByRoomType({
  doc,
}: BuildSalesPlanAveragePriceApartmentByRoomTypeArgs): SalesPlanAveragePriceApartmentByRoomType {
  const projectColumnKind = doc?.projectColumnKind ?? doc?.diagnostics?.projectColumnKind ?? "plan_project";
  const hasCsvPlan = Boolean(doc?.rows?.length);
  const typeBreakdown = buildAveragePricePlanTypeKpiBreakdown({
    rows: doc?.rows,
    hasCsvPlan,
  });

  const byRoomType = {} as Record<ApartmentRoomTypeFilterKey, SalesPlanAveragePriceObjectSlice>;
  const breakdown: ApartmentRoomBreakdownRow[] = [];

  for (const cfg of ENABLED_APARTMENT_ROOM_TYPES) {
    const planKey = roomTypeToPlanTypeKey(cfg.id);
    const item = planKey ? typeBreakdown.items.find((i) => i.key === planKey) : undefined;
    const slice: AveragePricePlanTypeKpiSlice =
      item ??
      ({
        key: planKey ?? "apt-1",
        label: cfg.label,
        planMonth: 0,
        planCumulative: 0,
        planProject: 0,
        factMonth: 0,
        factCumulative: 0,
      } as AveragePricePlanTypeKpiSlice);
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

export function averagePriceApartmentRoomCardsData(
  slice: AveragePricePlanTypeKpiSlice | null,
  hasCsvPlan: boolean,
): ReturnType<typeof averagePricePlanTypeSliceToCardsData> | null {
  if (!slice) return null;
  return averagePricePlanTypeSliceToCardsData(slice, hasCsvPlan);
}
