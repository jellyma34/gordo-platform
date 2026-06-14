"use client";

import { useCallback, useMemo, useState } from "react";

import {
  buildSalesPlanTotalAreaApartmentByRoomType,
  type ApartmentRoomBreakdownRow,
  type SalesPlanTotalAreaApartmentByRoomType,
} from "@/lib/totalArea/buildSalesPlanTotalAreaApartmentByRoomType";
import {
  buildSalesPlanTotalAreaByObjectType,
  salesPlanTotalAreaHasAnyData,
  type SalesPlanTotalAreaByObjectType,
} from "@/lib/totalArea/buildSalesPlanTotalAreaByObjectType";
import {
  marketingTotalAreaCsvDocIsValid,
  type MarketingTotalAreaCsvStoredV1,
} from "@/lib/marketingTotalAreaCsv";
import { formatMarketingImportUpdatedLabel } from "@/lib/marketingImportUpdatedLabel";
import { marketingPaymentPlanProjectIdFromEnv } from "@/lib/marketingPaymentPlanStore";
import { TOTAL_AREA_CSV_MAX_BYTES } from "@/lib/planDataSource/totalArea/parseTotalAreaCsv";
import type { TotalAreaCsvParseDiagnostics } from "@/lib/planDataSource/totalArea/types";
import { useMarketingImportDoc } from "@/lib/useMarketingImportDoc";

export type UseTotalAreaBlockArgs = {
  doc?: MarketingTotalAreaCsvStoredV1 | null;
  hydrated?: boolean;
  loading?: boolean;
  error?: string | null;
};

export type TotalAreaBlockState = {
  doc: MarketingTotalAreaCsvStoredV1 | null;
  hydrated: boolean;
  busy: boolean;
  error: string | null;
  salesPlanByObjectType: SalesPlanTotalAreaByObjectType;
  apartmentByRoomType: SalesPlanTotalAreaApartmentByRoomType["byRoomType"];
  apartmentRoomBreakdown: readonly ApartmentRoomBreakdownRow[];
  hasAnyData: boolean;
  updatedLabel: string | null;
  uploadCsv: (file: File) => Promise<void>;
  clearCsv: () => Promise<void>;
  failedDiagnostics: TotalAreaCsvParseDiagnostics | null;
  showSkeleton: boolean;
  showEmpty: boolean;
};

export function useTotalAreaBlock({
  doc: externalDoc,
  hydrated: externalHydrated,
  loading: externalLoading,
  error: externalError,
}: UseTotalAreaBlockArgs = {}): TotalAreaBlockState {
  const projectId = useMemo(() => marketingPaymentPlanProjectIdFromEnv(), []);
  const useExternalDoc = externalDoc !== undefined;

  const internalImport = useMarketingImportDoc<MarketingTotalAreaCsvStoredV1>({
    projectId,
    datasetKey: "totalArea",
    importKind: "total_area",
    validate: marketingTotalAreaCsvDocIsValid,
  });

  const doc = useExternalDoc ? externalDoc ?? null : internalImport.doc;
  const hydrated = useExternalDoc ? (externalHydrated ?? true) : internalImport.hydrated;
  const loading = useExternalDoc ? (externalLoading ?? false) : internalImport.loading;
  const error = useExternalDoc ? (externalError ?? null) : internalImport.error;

  const [failedDiagnostics, setFailedDiagnostics] = useState<TotalAreaCsvParseDiagnostics | null>(null);
  const updatedLabel = formatMarketingImportUpdatedLabel(doc?.updatedAt, doc?.uploadedBy);

  const uploadCsv = useCallback(
    async (file: File) => {
      if (useExternalDoc) return;
      if (file.size > TOTAL_AREA_CSV_MAX_BYTES) {
        throw new Error("Размер файла не должен превышать 10 МБ.");
      }
      if (!file.name.toLowerCase().endsWith(".csv")) {
        throw new Error("Допустимы только файлы .csv");
      }
      setFailedDiagnostics(null);
      const result = await internalImport.uploadFile(file);
      if (!result.ok) {
        const diag = result.diagnostics as TotalAreaCsvParseDiagnostics | undefined;
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

  const salesPlanByObjectType = useMemo(() => buildSalesPlanTotalAreaByObjectType({ doc }), [doc]);
  const apartmentRoom = useMemo(() => buildSalesPlanTotalAreaApartmentByRoomType({ doc }), [doc]);
  const hasAnyData = salesPlanTotalAreaHasAnyData(salesPlanByObjectType);
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
