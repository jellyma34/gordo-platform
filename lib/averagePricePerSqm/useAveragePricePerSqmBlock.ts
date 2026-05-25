"use client";

import { useCallback, useMemo, useState } from "react";

import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import {
  buildSalesPlanAveragePriceApartmentByRoomType,
  type ApartmentRoomBreakdownRow,
  type SalesPlanAveragePriceApartmentByRoomType,
} from "@/lib/averagePricePerSqm/buildSalesPlanAveragePriceApartmentByRoomType";
import {
  buildSalesPlanAveragePriceByObjectType,
  salesPlanAveragePriceHasAnyData,
  type SalesPlanAveragePriceByObjectType,
} from "@/lib/averagePricePerSqm/buildSalesPlanAveragePriceByObjectType";
import {
  marketingAveragePricePerSqmCsvDocIsValid,
  type MarketingAveragePricePerSqmCsvStoredV1,
} from "@/lib/marketingAveragePricePerSqmCsv";
import { formatMarketingImportUpdatedLabel } from "@/lib/marketingImportUpdatedLabel";
import { marketingPaymentPlanProjectIdFromEnv } from "@/lib/marketingPaymentPlanStore";
import { AVERAGE_PRICE_PER_SQM_CSV_MAX_BYTES } from "@/lib/planDataSource/averagePricePerSqm/parseAveragePricePerSqmCsv";
import type { AveragePricePerSqmCsvParseDiagnostics } from "@/lib/planDataSource/averagePricePerSqm/types";
import { useMarketingImportDoc } from "@/lib/useMarketingImportDoc";

export type UseAveragePricePerSqmBlockArgs = {
  period?: MarketingPeriodGranularity;
  doc?: MarketingAveragePricePerSqmCsvStoredV1 | null;
  hydrated?: boolean;
  loading?: boolean;
  error?: string | null;
};

export type AveragePricePerSqmBlockState = {
  doc: MarketingAveragePricePerSqmCsvStoredV1 | null;
  hydrated: boolean;
  busy: boolean;
  error: string | null;
  salesPlanByObjectType: SalesPlanAveragePriceByObjectType;
  apartmentByRoomType: SalesPlanAveragePriceApartmentByRoomType["byRoomType"];
  apartmentRoomBreakdown: readonly ApartmentRoomBreakdownRow[];
  hasAnyData: boolean;
  updatedLabel: string | null;
  uploadCsv: (file: File) => Promise<void>;
  clearCsv: () => Promise<void>;
  failedDiagnostics: AveragePricePerSqmCsvParseDiagnostics | null;
  showSkeleton: boolean;
  showEmpty: boolean;
};

export function useAveragePricePerSqmBlock({
  doc: externalDoc,
  hydrated: externalHydrated,
  loading: externalLoading,
  error: externalError,
}: UseAveragePricePerSqmBlockArgs = {}): AveragePricePerSqmBlockState {
  const projectId = useMemo(() => marketingPaymentPlanProjectIdFromEnv(), []);
  const useExternalDoc = externalDoc !== undefined;

  const internalImport = useMarketingImportDoc<MarketingAveragePricePerSqmCsvStoredV1>({
    projectId,
    datasetKey: "averagePricePerSqm",
    importKind: "average_price_per_sqm",
    validate: marketingAveragePricePerSqmCsvDocIsValid,
  });

  const doc = useExternalDoc ? externalDoc ?? null : internalImport.doc;
  const hydrated = useExternalDoc ? (externalHydrated ?? true) : internalImport.hydrated;
  const loading = useExternalDoc ? (externalLoading ?? false) : internalImport.loading;
  const error = useExternalDoc ? (externalError ?? null) : internalImport.error;

  const [failedDiagnostics, setFailedDiagnostics] = useState<AveragePricePerSqmCsvParseDiagnostics | null>(null);
  const updatedLabel = formatMarketingImportUpdatedLabel(doc?.updatedAt, doc?.uploadedBy);

  const uploadCsv = useCallback(
    async (file: File) => {
      if (useExternalDoc) return;
      if (file.size > AVERAGE_PRICE_PER_SQM_CSV_MAX_BYTES) {
        throw new Error("Размер файла не должен превышать 10 МБ.");
      }
      if (!file.name.toLowerCase().endsWith(".csv")) {
        throw new Error("Допустимы только файлы .csv");
      }
      setFailedDiagnostics(null);
      const result = await internalImport.uploadFile(file);
      if (!result.ok) {
        const diag = result.diagnostics as AveragePricePerSqmCsvParseDiagnostics | undefined;
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

  const salesPlanByObjectType = useMemo(() => buildSalesPlanAveragePriceByObjectType({ doc }), [doc]);

  const apartmentRoom = useMemo(() => buildSalesPlanAveragePriceApartmentByRoomType({ doc }), [doc]);

  const hasAnyData = salesPlanAveragePriceHasAnyData(salesPlanByObjectType);
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
    updatedLabel,
    uploadCsv,
    clearCsv,
    failedDiagnostics,
    showSkeleton,
    showEmpty,
  };
}
