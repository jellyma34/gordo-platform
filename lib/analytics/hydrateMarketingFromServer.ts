"use client";

import { loadAnalyticsRegistry } from "@/lib/analytics/loadAnalyticsRegistry";
import { hydrateMarketingDocFromPublicCsv } from "@/lib/analytics/hydrateMarketingDocFromPublicCsv";
import type { SupplementalMarketingPublicDatasets } from "@/lib/analytics/hydrateSupplementalMarketingTypes";
import { fetchMarketingStorage } from "@/lib/marketingCsvServerClient";
import type { MarketingImportDatasetKey, MarketingImportKind } from "@/lib/marketingImportKinds";
import { analyticsCsvRegistryEntry } from "@/lib/analytics/analyticsCsvRegistry";
import type { MarketingApartmentsCsvStoredV1 } from "@/lib/marketingApartmentsCsv";
import type { MarketingInvestorsCsvStoredV1 } from "@/lib/marketingInvestorsCsv";
import type { MarketingLeadsCsvStoredV1 } from "@/lib/marketingLeadsCsv";
import type { MarketingParkingCsvStoredV1 } from "@/lib/marketingParkingCsv";
import type { MarketingReceiptsPlanFactStoredV1 } from "@/lib/marketingReceiptsPlanFactCsv";
import type { MarketingRevenueFactCsvStoredV1 } from "@/lib/marketingRevenueFactCsv";
import type { MarketingSegmentExecutionStoredV1 } from "@/lib/marketingSegmentExecutionCsv";
import type { MarketingStoragesCsvStoredV1 } from "@/lib/marketingStoragesCsv";
import type { MarketingUnitsExecutionStoredV1 } from "@/lib/marketingUnitsExecutionCsv";
import {
  apartmentsCsvDocIsValid,
  investorsCsvDocIsValid,
  parkingCsvDocIsValid,
  revenueFactCsvDocIsValid,
  segmentExecutionCsvDocIsValid,
  storagesCsvDocIsValid,
  unitsExecutionCsvDocIsValid,
} from "@/lib/marketingCsvHydrateHelpers";
import { marketingLeadsCsvDocIsValid } from "@/lib/marketingLeadsCsv";
import { receiptsPlanFactCsvDocIsValid } from "@/lib/marketingReceiptsPlanFactCsv";

function asDocGuard<T>(isValid: (doc: T) => boolean): (doc: unknown) => doc is T {
  return (doc: unknown): doc is T => {
    if (!doc || typeof doc !== "object") return false;
    return isValid(doc as T);
  };
}

export type HydrateMarketingDocResult<T> =
  | { ok: true; doc: T; source: "server" | "public_csv" }
  | { ok: false; reason: "missing" | "invalid_doc" | "fetch_failed"; error?: string };

/**
 * Источник истины: GET `/api/projects/.../marketing/storage` (FS + `public/data/analytics/`).
 * Fallback: static CSV из git/deploy.
 */
export async function hydrateMarketingDocFromServer<T>(
  projectId: string,
  importKind: MarketingImportKind,
  datasetKey: MarketingImportDatasetKey,
  validate: (doc: unknown) => doc is T,
  cachedStorage?: Awaited<ReturnType<typeof fetchMarketingStorage>>,
): Promise<HydrateMarketingDocResult<T>> {
  try {
    const storage = cachedStorage ?? (await fetchMarketingStorage(projectId));
    if (!storage.ok || !storage.datasets) {
      const fallback = await hydrateMarketingDocFromPublicCsv(importKind, validate, projectId);
      if (fallback.ok) return { ok: true, doc: fallback.doc, source: "public_csv" };
      return { ok: false, reason: "fetch_failed", error: storage.error };
    }

    const raw = storage.datasets[datasetKey];
    if (raw != null && validate(raw)) {
      return { ok: true, doc: raw, source: "server" };
    }

    const fallback = await hydrateMarketingDocFromPublicCsv(importKind, validate, projectId);
    if (fallback.ok) return { ok: true, doc: fallback.doc, source: "public_csv" };
    return { ok: false, reason: raw == null ? "missing" : "invalid_doc" };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    const fallback = await hydrateMarketingDocFromPublicCsv(importKind, validate, projectId);
    if (fallback.ok) return { ok: true, doc: fallback.doc, source: "public_csv" };
    return { ok: false, reason: "fetch_failed", error: err };
  }
}

/** Загрузка supplemental datasets: сервер → static CSV. */
export async function hydrateSupplementalMarketingDatasets(
  projectId: string,
): Promise<SupplementalMarketingPublicDatasets> {
  await loadAnalyticsRegistry(projectId);
  const storage = await fetchMarketingStorage(projectId);

  const pick = async <T>(
    kind: MarketingImportKind,
    key: MarketingImportDatasetKey,
    validate: (doc: unknown) => doc is T,
  ): Promise<T | null> => {
    const r = await hydrateMarketingDocFromServer(projectId, kind, key, validate, storage);
    return r.ok ? r.doc : null;
  };

  const [
    investors,
    segmentExecution,
    unitsExecution,
    apartments,
    parking,
    storages,
    receiptsPlanFact,
    marketingLeads,
    revenueFact,
  ] = await Promise.all([
    pick(
      "investors",
      analyticsCsvRegistryEntry("investors").datasetKey,
      asDocGuard<MarketingInvestorsCsvStoredV1>(investorsCsvDocIsValid),
    ),
    pick(
      "segment_execution",
      analyticsCsvRegistryEntry("segment_execution").datasetKey,
      asDocGuard<MarketingSegmentExecutionStoredV1>(segmentExecutionCsvDocIsValid),
    ),
    pick(
      "units_execution",
      analyticsCsvRegistryEntry("units_execution").datasetKey,
      asDocGuard<MarketingUnitsExecutionStoredV1>(unitsExecutionCsvDocIsValid),
    ),
    pick(
      "apartments",
      analyticsCsvRegistryEntry("apartments").datasetKey,
      asDocGuard<MarketingApartmentsCsvStoredV1>(apartmentsCsvDocIsValid),
    ),
    pick(
      "parking",
      analyticsCsvRegistryEntry("parking").datasetKey,
      asDocGuard<MarketingParkingCsvStoredV1>(parkingCsvDocIsValid),
    ),
    pick(
      "storages",
      analyticsCsvRegistryEntry("storages").datasetKey,
      asDocGuard<MarketingStoragesCsvStoredV1>(storagesCsvDocIsValid),
    ),
    pick(
      "receipts_plan_fact",
      analyticsCsvRegistryEntry("receipts_plan_fact").datasetKey,
      asDocGuard<MarketingReceiptsPlanFactStoredV1>(receiptsPlanFactCsvDocIsValid),
    ),
    pick(
      "marketing_leads",
      analyticsCsvRegistryEntry("marketing_leads").datasetKey,
      asDocGuard<MarketingLeadsCsvStoredV1>(marketingLeadsCsvDocIsValid),
    ),
    pick(
      "revenue_fact",
      analyticsCsvRegistryEntry("revenue_fact").datasetKey,
      asDocGuard<MarketingRevenueFactCsvStoredV1>(revenueFactCsvDocIsValid),
    ),
  ]);

  return {
    investors,
    segmentExecution,
    unitsExecution,
    apartments,
    parking,
    storages,
    receiptsPlanFact,
    marketingLeads,
    revenueFact,
  };
}
