"use client";

import { useCallback, useMemo, useState } from "react";

import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import { filterNormalizedDealsForMarketingObject } from "@/components/marketing/SalesPlanSegmentStructure";
import { useMarketingDealsFeedOptional } from "@/components/marketing/marketingDealsFeedContext";
import {
  buildSalesPlanDduRevenueApartmentByRoomType,
  type ApartmentRoomBreakdownRow,
  type SalesPlanDduRevenueApartmentByRoomType,
} from "@/lib/dduRevenue/buildSalesPlanDduRevenueApartmentByRoomType";
import {
  buildSalesPlanDduRevenueByObjectType,
  salesPlanDduRevenueHasAnyData,
  type SalesPlanDduRevenueByObjectType,
} from "@/lib/dduRevenue/buildSalesPlanDduRevenueByObjectType";
import {
  dduRevenueCommercialFactsFromDealsForKpi,
  dduRevenueFactsFromDealsForKpi,
  dduRevenueParkingFactsFromDealsForKpi,
  dduRevenueStorageFactsFromDealsForKpi,
} from "@/lib/dduRevenueFactsFromDeals";
import {
  clearMarketingDduRevenueCsvLocalStorage,
  marketingDduRevenueCsvDocIsValid,
  readMarketingDduRevenueCsvFromLocalStorage,
  type MarketingDduRevenueCsvStoredV1,
} from "@/lib/marketingDduRevenueCsv";
import { formatMarketingImportUpdatedLabel } from "@/lib/marketingImportUpdatedLabel";
import { marketingPaymentPlanProjectIdFromEnv } from "@/lib/marketingPaymentPlanStore";
import {
  DDU_REVENUE_CSV_MAX_BYTES,
} from "@/lib/planDataSource/dduRevenue/parseDduRevenueCsv";
import type { DduRevenueCsvParseDiagnostics } from "@/lib/planDataSource/dduRevenue/types";
import type { SalesPlanObjectTypeKey } from "@/lib/salesPlanByObjectType";
import { useMarketingImportDoc } from "@/lib/useMarketingImportDoc";

export type UseDduRevenueSalesBlockArgs = {
  period?: MarketingPeriodGranularity;
  objectId?: string;
  currentPeriodKey?: string;
  doc?: MarketingDduRevenueCsvStoredV1 | null;
  hydrated?: boolean;
  loading?: boolean;
  error?: string | null;
};

export type DduRevenueSalesBlockState = {
  doc: MarketingDduRevenueCsvStoredV1 | null;
  hydrated: boolean;
  busy: boolean;
  error: string | null;
  salesPlanByObjectType: SalesPlanDduRevenueByObjectType;
  apartmentByRoomType: SalesPlanDduRevenueApartmentByRoomType["byRoomType"];
  apartmentRoomBreakdown: readonly ApartmentRoomBreakdownRow[];
  hasAnyData: boolean;
  periodGran: "month" | "quarter";
  dealRowsForFact: ReturnType<typeof filterNormalizedDealsForMarketingObject>;
  updatedLabel: string | null;
  uploadCsv: (file: File) => Promise<void>;
  clearCsv: () => Promise<void>;
  failedDiagnostics: DduRevenueCsvParseDiagnostics | null;
  showSkeleton: boolean;
  showEmpty: boolean;
};

function defaultDashboardPeriodKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function useDduRevenueSalesBlock({
  period = "month",
  objectId = "all",
  currentPeriodKey = defaultDashboardPeriodKey(),
  doc: externalDoc,
  hydrated: externalHydrated,
  loading: externalLoading,
  error: externalError,
}: UseDduRevenueSalesBlockArgs = {}): DduRevenueSalesBlockState {
  const dealsFeed = useMarketingDealsFeedOptional();
  const projectId = useMemo(() => marketingPaymentPlanProjectIdFromEnv(), []);
  const periodGran: "month" | "quarter" = period === "quarter" ? "quarter" : "month";

  const dealRowsForFact = useMemo(() => {
    const rows = dealsFeed?.rows ?? [];
    if (!rows.length) return [];
    return filterNormalizedDealsForMarketingObject(rows, objectId);
  }, [dealsFeed?.rows, objectId]);

  const useExternalDoc = externalDoc !== undefined;

  const internalImport = useMarketingImportDoc<MarketingDduRevenueCsvStoredV1>({
    projectId,
    datasetKey: "dduRevenue",
    importKind: "ddu_revenue",
    validate: marketingDduRevenueCsvDocIsValid,
    readLocalForMigration: readMarketingDduRevenueCsvFromLocalStorage,
    clearLocal: clearMarketingDduRevenueCsvLocalStorage,
  });

  const doc = useExternalDoc ? externalDoc ?? null : internalImport.doc;
  const hydrated = useExternalDoc ? (externalHydrated ?? true) : internalImport.hydrated;
  const loading = useExternalDoc ? (externalLoading ?? false) : internalImport.loading;
  const error = useExternalDoc ? (externalError ?? null) : internalImport.error;

  const [failedDiagnostics, setFailedDiagnostics] = useState<DduRevenueCsvParseDiagnostics | null>(null);
  const updatedLabel = formatMarketingImportUpdatedLabel(doc?.updatedAt, doc?.uploadedBy);

  const uploadCsv = useCallback(
    async (file: File) => {
      if (useExternalDoc) return;
      if (file.size > DDU_REVENUE_CSV_MAX_BYTES) {
        throw new Error("Размер файла не должен превышать 10 МБ.");
      }
      if (!file.name.toLowerCase().endsWith(".csv")) {
        throw new Error("Допустимы только файлы .csv");
      }
      setFailedDiagnostics(null);
      const result = await internalImport.uploadFile(file);
      if (!result.ok) {
        const diag = result.diagnostics as DduRevenueCsvParseDiagnostics | undefined;
        if (diag) setFailedDiagnostics(diag);
        throw new Error(result.error ?? "Не удалось загрузить CSV");
      }
    },
    [internalImport, useExternalDoc],
  );

  const clearCsv = useCallback(async () => {
    if (useExternalDoc) return;
    setFailedDiagnostics(null);
    await internalImport.clearImport();
  }, [internalImport, useExternalDoc]);

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
    const opts = { period: periodGran, currentPeriodKey };
    return {
      apartments: dduRevenueFactsFromDealsForKpi(dealRowsForFact, opts),
      parking: dduRevenueParkingFactsFromDealsForKpi(dealRowsForFact, opts),
      storage: dduRevenueStorageFactsFromDealsForKpi(dealRowsForFact, opts),
      commercial: dduRevenueCommercialFactsFromDealsForKpi(dealRowsForFact, opts),
    };
  }, [currentPeriodKey, dealRowsForFact, dealsFeed?.loading, periodGran]);

  const salesPlanByObjectType = useMemo(
    () =>
      buildSalesPlanDduRevenueByObjectType({
        doc,
        dealRows: dealRowsForFact,
        periodGran,
        currentPeriodKey,
        dealFactsBySegment,
      }),
    [currentPeriodKey, dealFactsBySegment, dealRowsForFact, doc, periodGran],
  );

  const apartmentRoom = useMemo(
    () =>
      buildSalesPlanDduRevenueApartmentByRoomType({
        doc,
        dealRows: dealRowsForFact,
        periodGran,
        currentPeriodKey,
        apartmentDealFacts: dealFactsBySegment?.apartments,
      }),
    [currentPeriodKey, dealFactsBySegment?.apartments, dealRowsForFact, doc, periodGran],
  );

  const hasAnyData = salesPlanDduRevenueHasAnyData(salesPlanByObjectType);
  const busy = loading;
  const showSkeleton = !hydrated || busy;
  const showEmpty = hydrated && !busy && !hasAnyData;

  return {
    doc,
    hydrated,
    busy,
    error,
    salesPlanByObjectType,
    apartmentByRoomType: apartmentRoom.byRoomType,
    apartmentRoomBreakdown: apartmentRoom.breakdown,
    hasAnyData,
    periodGran,
    dealRowsForFact,
    updatedLabel,
    uploadCsv,
    clearCsv,
    failedDiagnostics,
    showSkeleton,
    showEmpty,
  };
}

/** @deprecated Используйте {@link useDduRevenueSalesBlock}. */
export function useDduRevenueApartmentSalesBlock(args: UseDduRevenueSalesBlockArgs = {}) {
  const block = useDduRevenueSalesBlock(args);
  const apartments = block.salesPlanByObjectType.apartments;
  return {
    doc: block.doc,
    hydrated: block.hydrated,
    busy: block.busy,
    error: block.error,
    cardsData: apartments.cardsData,
    projectVolumeCompactCurrency: apartments.projectVolumeCompactCurrency,
    hasAnyData: apartments.hasData,
    kpiData: apartments.kpiData,
    periodGran: block.periodGran,
    dealRowsForFact: block.dealRowsForFact,
    updatedLabel: block.updatedLabel,
    uploadCsv: block.uploadCsv,
    clearCsv: block.clearCsv,
    failedDiagnostics: block.failedDiagnostics,
    showSkeleton: block.showSkeleton,
    showEmpty: block.showEmpty && !apartments.hasData,
  };
}

export type { SalesPlanObjectTypeKey };
