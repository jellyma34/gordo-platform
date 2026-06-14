"use client";

import { useCallback, useMemo } from "react";

import {
  marketingApartmentPlanCsvDocIsValid,
  type MarketingApartmentPlanCsvStoredV1,
} from "@/lib/marketingApartmentPlanCsv";
import { formatMarketingImportUpdatedLabel } from "@/lib/marketingImportUpdatedLabel";
import { marketingPaymentPlanProjectIdFromEnv } from "@/lib/marketingPaymentPlanStore";
import { useMarketingImportDoc } from "@/lib/useMarketingImportDoc";

export type UseInventoryDepletionPlanBlockArgs = {
  doc?: MarketingApartmentPlanCsvStoredV1 | null;
  hydrated?: boolean;
  loading?: boolean;
  error?: string | null;
};

export type InventoryDepletionPlanBlockState = {
  doc: MarketingApartmentPlanCsvStoredV1 | null;
  hydrated: boolean;
  busy: boolean;
  error: string | null;
  hasCsv: boolean;
  updatedLabel: string | null;
  uploadCsv: (file: File) => Promise<void>;
  clearCsv: () => Promise<void>;
};

/** План KPI квартир (`apartment_plan.csv`) для блока «Выбытие объектов». */
export function useInventoryDepletionPlanBlock({
  doc: externalDoc,
  hydrated: externalHydrated,
  loading: externalLoading,
  error: externalError,
}: UseInventoryDepletionPlanBlockArgs = {}): InventoryDepletionPlanBlockState {
  const projectId = useMemo(() => marketingPaymentPlanProjectIdFromEnv(), []);
  const useExternalDoc = externalDoc !== undefined;

  const internalImport = useMarketingImportDoc<MarketingApartmentPlanCsvStoredV1>({
    projectId,
    datasetKey: "apartmentPlan",
    importKind: "apartment_plan",
    validate: marketingApartmentPlanCsvDocIsValid,
  });

  const doc = useExternalDoc ? externalDoc ?? null : internalImport.doc;
  const hydrated = useExternalDoc ? (externalHydrated ?? true) : internalImport.hydrated;
  const loading = useExternalDoc ? (externalLoading ?? false) : internalImport.loading;
  const error = useExternalDoc ? (externalError ?? null) : internalImport.error;
  const busy = loading || internalImport.loading;

  const uploadCsv = useCallback(
    async (file: File) => {
      if (useExternalDoc) return;
      const result = await internalImport.uploadFile(file);
      if (result && "ok" in result && result.ok === false) {
        throw new Error(result.error ?? "Не удалось загрузить CSV");
      }
    },
    [internalImport, useExternalDoc],
  );

  const clearCsv = useCallback(async () => {
    if (useExternalDoc) return;
    await internalImport.clearImport();
  }, [internalImport, useExternalDoc]);

  return {
    doc,
    hydrated,
    busy,
    error,
    hasCsv: Boolean(doc?.rows?.length),
    updatedLabel: formatMarketingImportUpdatedLabel(doc?.updatedAt, doc?.uploadedBy),
    uploadCsv,
    clearCsv,
  };
}
