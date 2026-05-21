import type { MarketingApartmentsCsvStoredV1 } from "@/lib/marketingApartmentsCsv";
import { apartmentsCsvHasData } from "@/lib/marketingApartmentsCsv";
import type { MarketingInvestorsCsvStoredV1 } from "@/lib/marketingInvestorsCsv";
import type { MarketingParkingCsvStoredV1 } from "@/lib/marketingParkingCsv";
import { parkingCsvHasData } from "@/lib/marketingParkingCsv";
import type { MarketingSegmentExecutionStoredV1 } from "@/lib/marketingSegmentExecutionCsv";
import type { MarketingStoragesCsvStoredV1 } from "@/lib/marketingStoragesCsv";
import { storagesCsvHasData } from "@/lib/marketingStoragesCsv";
import type { MarketingUnitsExecutionStoredV1 } from "@/lib/marketingUnitsExecutionCsv";
import type { MarketingRevenueFactCsvStoredV1 } from "@/lib/marketingRevenueFactCsv";
import { revenueFactCsvDocIsValid as revenueFactDocIsValid } from "@/lib/marketingRevenueFactCsv";

export function investorsCsvDocIsValid(doc: MarketingInvestorsCsvStoredV1): boolean {
  return (doc.planFactChartRows?.length ?? 0) > 0 || (doc.completionChartRows?.length ?? 0) > 0;
}

export function segmentExecutionCsvDocIsValid(doc: MarketingSegmentExecutionStoredV1): boolean {
  return doc.planFactRows.length > 0;
}

export function unitsExecutionCsvDocIsValid(doc: MarketingUnitsExecutionStoredV1): boolean {
  return Array.isArray(doc.segments) && doc.segments.length > 0;
}

export function apartmentsCsvDocIsValid(doc: MarketingApartmentsCsvStoredV1): boolean {
  return apartmentsCsvHasData(doc);
}

export function parkingCsvDocIsValid(doc: MarketingParkingCsvStoredV1): boolean {
  return parkingCsvHasData(doc);
}

export function storagesCsvDocIsValid(doc: MarketingStoragesCsvStoredV1): boolean {
  return storagesCsvHasData(doc);
}

export function revenueFactCsvDocIsValid(doc: MarketingRevenueFactCsvStoredV1): boolean {
  return revenueFactDocIsValid(doc);
}
