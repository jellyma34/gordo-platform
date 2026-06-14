"use client";

import { useCallback, useMemo, useState } from "react";

import {
  buildSalesPlanReducedAreaApartmentByRoomType,
  type ApartmentRoomBreakdownRow,
  type SalesPlanReducedAreaApartmentByRoomType,
} from "@/lib/reducedArea/buildSalesPlanReducedAreaApartmentByRoomType";
import {
  buildSalesPlanReducedAreaByObjectType,
  salesPlanReducedAreaHasAnyData,
  type SalesPlanReducedAreaByObjectType,
} from "@/lib/reducedArea/buildSalesPlanReducedAreaByObjectType";
import {
  marketingReducedAreaCsvDocIsValid,
  type MarketingReducedAreaCsvStoredV1,
} from "@/lib/marketingReducedAreaCsv";
import { formatMarketingImportUpdatedLabel } from "@/lib/marketingImportUpdatedLabel";
import { marketingPaymentPlanProjectIdFromEnv } from "@/lib/marketingPaymentPlanStore";
import { REDUCED_AREA_CSV_MAX_BYTES } from "@/lib/planDataSource/reducedArea/parseReducedAreaCsv";
import type { ReducedAreaCsvParseDiagnostics } from "@/lib/planDataSource/reducedArea/types";
import { useMarketingImportDoc } from "@/lib/useMarketingImportDoc";

export type UseReducedAreaBlockArgs = {
  doc?: MarketingReducedAreaCsvStoredV1 | null;
  hydrated?: boolean;
  loading?: boolean;
  error?: string | null;
};

export type ReducedAreaBlockState = {
  doc: MarketingReducedAreaCsvStoredV1 | null;
  hydrated: boolean;
  busy: boolean;
  error: string | null;
  salesPlanByObjectType: SalesPlanReducedAreaByObjectType;
  apartmentByRoomType: SalesPlanReducedAreaApartmentByRoomType["byRoomType"];
  apartmentRoomBreakdown: readonly ApartmentRoomBreakdownRow[];
  hasAnyData: boolean;
  updatedLabel: string | null;
  uploadCsv: (file: File) => Promise<void>;
  clearCsv: () => Promise<void>;
  failedDiagnostics: ReducedAreaCsvParseDiagnostics | null;
  showSkeleton: boolean;
  showEmpty: boolean;
};

export function useReducedAreaBlock({
  doc: externalDoc,
  hydrated: externalHydrated,
  loading: externalLoading,
  error: externalError,
}: UseReducedAreaBlockArgs = {}): ReducedAreaBlockState {
  const projectId = useMemo(() => marketingPaymentPlanProjectIdFromEnv(), []);
  const useExternalDoc = externalDoc !== undefined;

  const internalImport = useMarketingImportDoc<MarketingReducedAreaCsvStoredV1>({
    projectId,
    datasetKey: "reducedAreaAnalytics",
    importKind: "reduced_area",
    validate: marketingReducedAreaCsvDocIsValid,
  });

  const doc = useExternalDoc ? externalDoc ?? null : internalImport.doc;
  const hydrated = useExternalDoc ? (externalHydrated ?? true) : internalImport.hydrated;
  const loading = useExternalDoc ? (externalLoading ?? false) : internalImport.loading;
  const error = useExternalDoc ? (externalError ?? null) : internalImport.error;

  const [failedDiagnostics, setFailedDiagnostics] = useState<ReducedAreaCsvParseDiagnostics | null>(null);
  const updatedLabel = formatMarketingImportUpdatedLabel(doc?.updatedAt, doc?.uploadedBy);

  const uploadCsv = useCallback(
    async (file: File) => {
      if (useExternalDoc) return;
      if (file.size > REDUCED_AREA_CSV_MAX_BYTES) {
        throw new Error("Размер файла не должен превышать 10 МБ.");
      }
      if (!file.name.toLowerCase().endsWith(".csv")) {
        throw new Error("Допустимы только файлы .csv");
      }
      setFailedDiagnostics(null);
      const result = await internalImport.uploadFile(file);
      if (!result.ok) {
        const diag = result.diagnostics as ReducedAreaCsvParseDiagnostics | undefined;
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

  const salesPlanByObjectType = useMemo(() => buildSalesPlanReducedAreaByObjectType({ doc }), [doc]);
  const apartmentRoom = useMemo(() => buildSalesPlanReducedAreaApartmentByRoomType({ doc }), [doc]);
  const hasAnyData = salesPlanReducedAreaHasAnyData(salesPlanByObjectType);
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
