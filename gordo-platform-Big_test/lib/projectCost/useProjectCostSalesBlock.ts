"use client";

import { useMemo } from "react";

import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import { filterNormalizedDealsForMarketingObject } from "@/components/marketing/SalesPlanSegmentStructure";
import { useMarketingDealsFeedOptional } from "@/components/marketing/marketingDealsFeedContext";
import {
  buildSalesPlanProjectValueByObjectType,
  salesPlanProjectValueHasAnyData,
  type SalesPlanProjectValueByObjectType,
} from "@/lib/projectCost/buildSalesPlanProjectValueByObjectType";
import {
  projectValueCommercialFactsFromDealsForKpi,
  projectValueFactsFromDealsForKpi,
  projectValueParkingFactsFromDealsForKpi,
  projectValueStorageFactsFromDealsForKpi,
} from "@/lib/projectValueFactsFromDeals";
import {
  marketingProjectValueCsvDocIsValid,
  type MarketingProjectValueCsvStoredV1,
} from "@/lib/marketingProjectValueCsv";
import { formatMarketingImportUpdatedLabel } from "@/lib/marketingImportUpdatedLabel";
import { marketingPaymentPlanProjectIdFromEnv } from "@/lib/marketingPaymentPlanStore";
import { useMarketingImportDoc } from "@/lib/useMarketingImportDoc";
import type { SalesPlanObjectTypeKey } from "@/lib/salesPlanByObjectType";

export type UseProjectCostSalesBlockArgs = {
  period?: MarketingPeriodGranularity;
  objectId?: string;
  currentPeriodKey?: string;
};

export type ProjectCostSalesBlockState = {
  doc: MarketingProjectValueCsvStoredV1 | null;
  hydrated: boolean;
  busy: boolean;
  error: string | null;
  salesPlanByObjectType: SalesPlanProjectValueByObjectType;
  hasAnyData: boolean;
  periodGran: "month" | "quarter";
  currentPeriodKey: string;
  dealRowsForFact: ReturnType<typeof filterNormalizedDealsForMarketingObject>;
  updatedLabel: string | null;
  showSkeleton: boolean;
  showEmpty: boolean;
};

function defaultDashboardPeriodKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Datasource «Общая стоимость проекта» (CSV project_value + факт сделок). */
export function useProjectCostSalesBlock({
  period = "month",
  objectId = "all",
  currentPeriodKey = defaultDashboardPeriodKey(),
}: UseProjectCostSalesBlockArgs = {}): ProjectCostSalesBlockState {
  const dealsFeed = useMarketingDealsFeedOptional();
  const projectId = useMemo(() => marketingPaymentPlanProjectIdFromEnv(), []);
  const periodGran: "month" | "quarter" = period === "quarter" ? "quarter" : "month";
  const resolvedPeriodKey = currentPeriodKey ?? defaultDashboardPeriodKey();

  const dealRowsForFact = useMemo(() => {
    const rows = dealsFeed?.rows ?? [];
    if (!rows.length) return [];
    return filterNormalizedDealsForMarketingObject(rows, objectId);
  }, [dealsFeed?.rows, objectId]);

  const { doc, hydrated, loading, error } = useMarketingImportDoc<MarketingProjectValueCsvStoredV1>({
    projectId,
    datasetKey: "projectValue",
    importKind: "project_value",
    validate: marketingProjectValueCsvDocIsValid,
  });

  const updatedLabel = formatMarketingImportUpdatedLabel(doc?.updatedAt, doc?.uploadedBy);

  const dealFactsBySegment = useMemo(() => {
    if (dealsFeed?.loading && dealRowsForFact.length === 0) {
      return {
        apartments: null,
        parking: null,
        storage: null,
        commercial: null,
      } as const;
    }
    if (!dealRowsForFact.length) return undefined;
    const opts = { period: periodGran, currentPeriodKey: resolvedPeriodKey };
    return {
      apartments: projectValueFactsFromDealsForKpi(dealRowsForFact, opts),
      parking: projectValueParkingFactsFromDealsForKpi(dealRowsForFact, opts),
      storage: projectValueStorageFactsFromDealsForKpi(dealRowsForFact, opts),
      commercial: projectValueCommercialFactsFromDealsForKpi(dealRowsForFact, opts),
    };
  }, [resolvedPeriodKey, dealRowsForFact, dealsFeed?.loading, periodGran]);

  const salesPlanByObjectType = useMemo(
    () =>
      buildSalesPlanProjectValueByObjectType({
        doc,
        dealRows: dealRowsForFact,
        periodGran,
        currentPeriodKey: resolvedPeriodKey,
        dealFactsBySegment,
      }),
    [resolvedPeriodKey, dealFactsBySegment, dealRowsForFact, doc, periodGran],
  );

  const hasAnyData = salesPlanProjectValueHasAnyData(salesPlanByObjectType);
  const busy = loading;
  const showSkeleton = !hydrated || busy;
  const showEmpty = hydrated && !busy && !hasAnyData;

  return {
    doc,
    hydrated,
    busy,
    error,
    salesPlanByObjectType,
    hasAnyData,
    periodGran,
    currentPeriodKey: resolvedPeriodKey,
    dealRowsForFact,
    updatedLabel,
    showSkeleton,
    showEmpty,
  };
}

export type { SalesPlanObjectTypeKey };
