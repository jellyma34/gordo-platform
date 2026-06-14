import { parseAveragePricePerSqmCsvAsync } from "@/lib/planDataSource/averagePricePerSqm/parseAveragePricePerSqmCsv";
import { parseTotalAreaCsvAsync } from "@/lib/planDataSource/totalArea/parseTotalAreaCsv";
import { parseReducedAreaCsvAsync } from "@/lib/planDataSource/reducedArea/parseReducedAreaCsv";
import { parseApartmentPlanCsvAsync } from "@/lib/planDataSource/parseApartmentPlanCsv";
import { parseDduRevenueCsvAsync } from "@/lib/planDataSource/dduRevenue/parseDduRevenueCsv";
import { parseInstallmentAreaCsvAsync } from "@/lib/planDataSource/installmentArea/parseInstallmentAreaCsv";
import { parseProjectValueCsvAsync } from "@/lib/planDataSource/projectValue/parseProjectValueCsv";
import { parseInstallmentForecastCsv } from "@/lib/parseInstallmentForecastCsv";

export function defaultMarketingParseContext() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return {
    dashboardPeriodKey: `${y}-${m}`,
    reportAsOfYmd: `${y}-${m}-${day}`,
    period: "month" as const,
  };
}

export async function parseInstallmentForecastImport(text: string, fileName: string) {
  return parseInstallmentForecastCsv(text);
}

export async function parseInstallmentAreaImport(text: string, fileName: string) {
  const ctx = defaultMarketingParseContext();
  return parseInstallmentAreaCsvAsync(text, {
    ...ctx,
    fileName,
  });
}

export async function parseDduRevenueImport(text: string, fileName: string) {
  const ctx = defaultMarketingParseContext();
  return parseDduRevenueCsvAsync(text, {
    ...ctx,
    fileName,
  });
}

export async function parseProjectValueImport(text: string, fileName: string) {
  const ctx = defaultMarketingParseContext();
  return parseProjectValueCsvAsync(text, {
    ...ctx,
    fileName,
  });
}

export async function parseApartmentPlanImport(text: string, fileName: string) {
  const ctx = defaultMarketingParseContext();
  return parseApartmentPlanCsvAsync(text, {
    ...ctx,
    fileName,
  });
}

export async function parseAveragePricePerSqmImport(text: string, fileName: string) {
  const ctx = defaultMarketingParseContext();
  return parseAveragePricePerSqmCsvAsync(text, {
    ...ctx,
    fileName,
  });
}

export async function parseTotalAreaImport(text: string, fileName: string) {
  const ctx = defaultMarketingParseContext();
  return parseTotalAreaCsvAsync(text, {
    ...ctx,
    fileName,
  });
}

export async function parseReducedAreaImport(text: string, fileName: string) {
  const ctx = defaultMarketingParseContext();
  return parseReducedAreaCsvAsync(text, {
    ...ctx,
    fileName,
  });
}
