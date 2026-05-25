"use client";

import { hydrateMarketingDocFromPublicCsv } from "@/lib/analytics/hydrateMarketingDocFromPublicCsv";
import { investorsCsvDocIsValid, type MarketingInvestorsCsvStoredV1 } from "@/lib/marketingInvestorsCsv";
import {
  segmentExecutionCsvDocIsValid,
  type MarketingSegmentExecutionStoredV1,
} from "@/lib/marketingSegmentExecutionCsv";
import {
  unitsExecutionCsvDocIsValid,
  type MarketingUnitsExecutionStoredV1,
} from "@/lib/marketingUnitsExecutionCsv";
import {
  apartmentsCsvDocIsValid,
  type MarketingApartmentsCsvStoredV1,
} from "@/lib/marketingApartmentsCsv";
import { parkingCsvDocIsValid, type MarketingParkingCsvStoredV1 } from "@/lib/marketingParkingCsv";
import { storagesCsvDocIsValid, type MarketingStoragesCsvStoredV1 } from "@/lib/marketingStoragesCsv";
import {
  receiptsPlanFactCsvDocIsValid,
  type MarketingReceiptsPlanFactStoredV1,
} from "@/lib/marketingReceiptsPlanFactCsv";
import {
  marketingLeadsCsvDocIsValid,
  type MarketingLeadsCsvStoredV1,
} from "@/lib/marketingLeadsCsv";
import {
  revenueFactCsvDocIsValid,
  type MarketingRevenueFactCsvStoredV1,
} from "@/lib/marketingRevenueFactCsv";

export type SupplementalMarketingPublicDatasets = {
  investors: MarketingInvestorsCsvStoredV1 | null;
  segmentExecution: MarketingSegmentExecutionStoredV1 | null;
  unitsExecution: MarketingUnitsExecutionStoredV1 | null;
  apartments: MarketingApartmentsCsvStoredV1 | null;
  parking: MarketingParkingCsvStoredV1 | null;
  storages: MarketingStoragesCsvStoredV1 | null;
  receiptsPlanFact: MarketingReceiptsPlanFactStoredV1 | null;
  marketingLeads: MarketingLeadsCsvStoredV1 | null;
  revenueFact: MarketingRevenueFactCsvStoredV1 | null;
};

/** Параллельная загрузка supplemental datasets из `/data/analytics/*.csv`. */
export async function hydrateSupplementalMarketingFromPublic(
  projectId: string,
): Promise<SupplementalMarketingPublicDatasets> {
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
    hydrateMarketingDocFromPublicCsv("investors", investorsCsvDocIsValid, projectId),
    hydrateMarketingDocFromPublicCsv("segment_execution", segmentExecutionCsvDocIsValid, projectId),
    hydrateMarketingDocFromPublicCsv("units_execution", unitsExecutionCsvDocIsValid, projectId),
    hydrateMarketingDocFromPublicCsv("apartments", apartmentsCsvDocIsValid, projectId),
    hydrateMarketingDocFromPublicCsv("parking", parkingCsvDocIsValid, projectId),
    hydrateMarketingDocFromPublicCsv("storages", storagesCsvDocIsValid, projectId),
    hydrateMarketingDocFromPublicCsv("receipts_plan_fact", receiptsPlanFactCsvDocIsValid, projectId),
    hydrateMarketingDocFromPublicCsv("marketing_leads", marketingLeadsCsvDocIsValid, projectId),
    hydrateMarketingDocFromPublicCsv("revenue_fact", revenueFactCsvDocIsValid, projectId),
  ]);

  return {
    investors: investors.ok ? investors.doc : null,
    segmentExecution: segmentExecution.ok ? segmentExecution.doc : null,
    unitsExecution: unitsExecution.ok ? unitsExecution.doc : null,
    apartments: apartments.ok ? apartments.doc : null,
    parking: parking.ok ? parking.doc : null,
    storages: storages.ok ? storages.doc : null,
    receiptsPlanFact: receiptsPlanFact.ok ? receiptsPlanFact.doc : null,
    marketingLeads: marketingLeads.ok ? marketingLeads.doc : null,
    revenueFact: revenueFact.ok ? revenueFact.doc : null,
  };
}
