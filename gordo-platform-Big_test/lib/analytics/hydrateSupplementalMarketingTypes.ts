import type { MarketingInvestorsCsvStoredV1 } from "@/lib/marketingInvestorsCsv";
import type { MarketingSegmentExecutionStoredV1 } from "@/lib/marketingSegmentExecutionCsv";
import type { MarketingUnitsExecutionStoredV1 } from "@/lib/marketingUnitsExecutionCsv";
import type { MarketingApartmentsCsvStoredV1 } from "@/lib/marketingApartmentsCsv";
import type { MarketingParkingCsvStoredV1 } from "@/lib/marketingParkingCsv";
import type { MarketingStoragesCsvStoredV1 } from "@/lib/marketingStoragesCsv";
import type { MarketingReceiptsPlanFactStoredV1 } from "@/lib/marketingReceiptsPlanFactCsv";
import type { MarketingLeadsCsvStoredV1 } from "@/lib/marketingLeadsCsv";
import type { MarketingRevenueFactCsvStoredV1 } from "@/lib/marketingRevenueFactCsv";

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
