/**
 * Однократный перенос CSV-снимков из localStorage на сервер (после перехода на API-only).
 */
import {
  clearMarketingPaymentPlanLocalStorage,
  clearMarketingSalesPlanExecutionLocalStorage,
  readMarketingPaymentPlanFromLocalStorage,
  readMarketingSalesPlanExecutionFromLocalStorage,
} from "@/lib/marketingCsvBrowserStorage";
import type { MarketingPaymentPlanFileV2 } from "@/lib/marketingPaymentPlanStore";
import { readMarketingInvestorsCsvFromLocalStorage } from "@/lib/marketingInvestorsCsv";
import { readMarketingSegmentExecutionCsvFromLocalStorage } from "@/lib/marketingSegmentExecutionCsv";
import { readMarketingUnitsExecutionCsvFromLocalStorage } from "@/lib/marketingUnitsExecutionCsv";
import { readMarketingApartmentsCsvFromLocalStorage } from "@/lib/marketingApartmentsCsv";
import { readMarketingParkingCsvFromLocalStorage } from "@/lib/marketingParkingCsv";
import { readMarketingStoragesCsvFromLocalStorage } from "@/lib/marketingStoragesCsv";
import { clearMarketingInvestorsCsvLocalStorage } from "@/lib/marketingInvestorsCsv";
import { clearMarketingSegmentExecutionCsvLocalStorage } from "@/lib/marketingSegmentExecutionCsv";
import { clearMarketingUnitsExecutionCsvLocalStorage } from "@/lib/marketingUnitsExecutionCsv";
import { clearMarketingApartmentsCsvLocalStorage } from "@/lib/marketingApartmentsCsv";
import { clearMarketingParkingCsvLocalStorage } from "@/lib/marketingParkingCsv";
import { clearMarketingStoragesCsvLocalStorage } from "@/lib/marketingStoragesCsv";

async function postCsvBlob(
  projectId: string,
  kind: string,
  fileName: string,
  rawText: string,
  uploadedBy: string,
): Promise<boolean> {
  const file = new File([rawText], fileName, { type: "text/csv;charset=utf-8" });
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", kind);
  fd.append("uploadedBy", uploadedBy);
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/marketing/storage`, {
    method: "POST",
    body: fd,
  });
  const j = (await res.json().catch(() => null)) as { ok?: boolean } | null;
  return Boolean(res.ok && j?.ok);
}

async function migratePaymentPlanFromLocal(
  projectId: string,
  uploadedBy: string,
): Promise<MarketingPaymentPlanFileV2 | null> {
  const local = readMarketingPaymentPlanFromLocalStorage(projectId);
  if (!local?.v || local.v !== 2) return null;
  const planKeys = local.planByPeriodKey ?? {};
  const factKeys = local.factByPeriodKey;
  if (Object.keys(planKeys).length === 0 && (!factKeys || Object.keys(factKeys).length === 0)) {
    return null;
  }
  const res = await fetch("/api/marketing/payment-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      migrateFromBrowser: true,
      byPeriodKey: planKeys,
      factByPeriodKey: factKeys,
      meta: local.planMeta ?? local.meta,
      factMeta: local.factMeta,
    }),
  });
  const j = (await res.json().catch(() => null)) as { ok?: boolean; plan?: MarketingPaymentPlanFileV2 } | null;
  if (!res.ok || !j?.ok || j.plan?.v !== 2) return null;
  clearMarketingPaymentPlanLocalStorage(projectId);
  return j.plan;
}

async function migrateSalesPlanExecutionFromLocal(
  projectId: string,
  uploadedBy: string,
  reportAsOf: string,
): Promise<boolean> {
  const local = readMarketingSalesPlanExecutionFromLocalStorage(projectId);
  if (!local?.dataset) return false;
  const res = await fetch("/api/marketing/sales-plan-execution", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      migrateFromBrowser: true,
      dataset: local.dataset,
      meta: local.meta,
      parseWarnings: local.parseWarnings,
    }),
  });
  const j = (await res.json().catch(() => null)) as { ok?: boolean } | null;
  if (!res.ok || !j?.ok) return false;
  clearMarketingSalesPlanExecutionLocalStorage(projectId);
  return true;
}

export type MarketingCsvServerPresence = {
  hasPlan: boolean;
  hasFact: boolean;
  hasInvestors: boolean;
  hasSegmentExecution: boolean;
  hasUnitsExecution: boolean;
  hasApartments: boolean;
  hasParking: boolean;
  hasStorages: boolean;
  hasExecutionPlan: boolean;
  hasReceiptsPlanFact: boolean;
  hasMarketingLeads?: boolean;
};

/** Сбрасывает все marketing CSV ключи в localStorage для проекта. */
export function clearAllMarketingCsvLocalStorage(projectId: string): void {
  clearMarketingPaymentPlanLocalStorage(projectId);
  clearMarketingSalesPlanExecutionLocalStorage(projectId);
  clearMarketingInvestorsCsvLocalStorage(projectId);
  clearMarketingSegmentExecutionCsvLocalStorage(projectId);
  clearMarketingUnitsExecutionCsvLocalStorage(projectId);
  clearMarketingApartmentsCsvLocalStorage(projectId);
  clearMarketingParkingCsvLocalStorage(projectId);
  clearMarketingStoragesCsvLocalStorage(projectId);
}

/**
 * Если на сервере пусто, а в localStorage есть снимок — загружает на сервер и очищает LS.
 */
export async function migrateMarketingCsvFromLocalStorageIfNeeded(opts: {
  projectId: string;
  uploadedBy: string;
  reportAsOf: string;
  presence: MarketingCsvServerPresence;
}): Promise<{ paymentPlan: MarketingPaymentPlanFileV2 | null }> {
  const { projectId, uploadedBy, reportAsOf, presence } = opts;
  let paymentPlan: MarketingPaymentPlanFileV2 | null = null;

  if (!presence.hasPlan && !presence.hasFact) {
    paymentPlan = await migratePaymentPlanFromLocal(projectId, uploadedBy);
  }

  if (!presence.hasExecutionPlan) {
    await migrateSalesPlanExecutionFromLocal(projectId, uploadedBy, reportAsOf);
  }

  if (!presence.hasInvestors) {
    const doc = readMarketingInvestorsCsvFromLocalStorage(projectId);
    if (doc?.rawText?.trim()) {
      const ok = await postCsvBlob(projectId, "investors", doc.fileName || "investors.csv", doc.rawText, uploadedBy);
      if (ok) clearMarketingInvestorsCsvLocalStorage(projectId);
    }
  }

  if (!presence.hasSegmentExecution) {
    const doc = readMarketingSegmentExecutionCsvFromLocalStorage(projectId);
    if (doc?.rawText?.trim()) {
      const ok = await postCsvBlob(
        projectId,
        "segment_execution",
        doc.fileName || "segment-execution.csv",
        doc.rawText,
        uploadedBy,
      );
      if (ok) clearMarketingSegmentExecutionCsvLocalStorage(projectId);
    }
  }

  if (!presence.hasUnitsExecution) {
    const doc = readMarketingUnitsExecutionCsvFromLocalStorage(projectId);
    if (doc?.rawText?.trim()) {
      const ok = await postCsvBlob(
        projectId,
        "units_execution",
        doc.fileName || "units-execution.csv",
        doc.rawText,
        uploadedBy,
      );
      if (ok) clearMarketingUnitsExecutionCsvLocalStorage(projectId);
    }
  }

  if (!presence.hasApartments) {
    const doc = readMarketingApartmentsCsvFromLocalStorage(projectId);
    if (doc?.rawText?.trim()) {
      const ok = await postCsvBlob(projectId, "apartments", doc.fileName || "apartments.csv", doc.rawText, uploadedBy);
      if (ok) clearMarketingApartmentsCsvLocalStorage(projectId);
    }
  }

  if (!presence.hasParking) {
    const doc = readMarketingParkingCsvFromLocalStorage(projectId);
    if (doc?.rawText?.trim()) {
      const ok = await postCsvBlob(projectId, "parking", doc.fileName || "parking.csv", doc.rawText, uploadedBy);
      if (ok) clearMarketingParkingCsvLocalStorage(projectId);
    }
  }

  if (!presence.hasStorages) {
    const doc = readMarketingStoragesCsvFromLocalStorage(projectId);
    if (doc?.rawText?.trim()) {
      const ok = await postCsvBlob(projectId, "storages", doc.fileName || "storages.csv", doc.rawText, uploadedBy);
      if (ok) clearMarketingStoragesCsvLocalStorage(projectId);
    }
  }

  return { paymentPlan };
}
