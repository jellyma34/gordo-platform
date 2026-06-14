import { parseMarketingInvestorsCsv } from "@/lib/marketingInvestorsCsv";
import { parseSegmentExecutionCsv } from "@/lib/marketingSegmentExecutionCsv";
import { parseReceiptsPlanFactCsv } from "@/lib/marketingReceiptsPlanFactCsv";
import { parseMarketingLeadsCsv } from "@/lib/marketingLeadsCsv";
import { parseRevenueFactCsv } from "@/lib/parseRevenueFactCsv";
import { parseApartmentsCsv } from "@/lib/marketingApartmentsCsv";
import { parseParkingCsv } from "@/lib/marketingParkingCsv";
import { parseStoragesCsv } from "@/lib/marketingStoragesCsv";
import {
  buildMarketingUnitsExecutionStoredDoc,
  parseSalesUnitsExecutionCsv,
  type MarketingUnitsExecutionStoredV1,
} from "@/lib/marketingUnitsExecutionCsv";
import type { MarketingImportKind } from "@/lib/marketingImportKinds";
import {
  parseApartmentPlanImport,
  parseAveragePricePerSqmImport,
  parseDduRevenueImport,
  parseInstallmentAreaImport,
  parseInstallmentForecastImport,
  parseProjectValueImport,
  parseReducedAreaImport,
  parseTotalAreaImport,
} from "@/lib/server/marketingImportParse";
import { loadImport } from "@/lib/server/marketingStorage";

export type BuildMarketingDocMeta = {
  updatedAt: string;
  uploadedBy: string;
  fileName: string;
};

export type BuildMarketingDocResult =
  | { ok: true; doc: Record<string, unknown> }
  | { ok: false; error: string };

export async function buildMarketingDocFromCsv(
  kind: MarketingImportKind,
  text: string,
  meta: BuildMarketingDocMeta,
  projectId: string,
): Promise<BuildMarketingDocResult> {
  const { updatedAt, uploadedBy, fileName } = meta;

  switch (kind) {
    case "investors": {
      const parsed = parseMarketingInvestorsCsv(text);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return {
        ok: true,
        doc: {
          v: 1,
          updatedAt,
          uploadedBy,
          fileName,
          rawText: text,
          planFactChartRows: parsed.planFactChartRows,
          completionChartRows: parsed.completionChartRows,
          warnings: parsed.warnings,
        },
      };
    }
    case "segment_execution": {
      const parsed = parseSegmentExecutionCsv(text);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return {
        ok: true,
        doc: {
          v: 1,
          updatedAt,
          uploadedBy,
          fileName,
          rawText: text,
          planFactRows: parsed.planFactRows,
          completionRows: parsed.completionRows,
          monthlyByPeriodKey: parsed.monthlyByPeriodKey,
          hasSegmentPlan: parsed.hasSegmentPlan,
          planTotal: parsed.planTotal,
          totalFact: parsed.totalFact,
          warnings: parsed.warnings,
        },
      };
    }
    case "marketing_leads": {
      const parsed = parseMarketingLeadsCsv(text);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return {
        ok: true,
        doc: {
          v: 1,
          updatedAt,
          uploadedBy,
          fileName,
          rawText: text,
          adSpend: parsed.tables.adSpend,
          leads: parsed.tables.leads,
          costPerLead: parsed.tables.costPerLead,
          warnings: parsed.warnings,
        },
      };
    }
    case "receipts_plan_fact": {
      const parsed = parseReceiptsPlanFactCsv(text);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return {
        ok: true,
        doc: {
          v: 1,
          updatedAt,
          uploadedBy,
          fileName,
          rawText: text,
          monthly: parsed.monthly,
          warnings: parsed.warnings,
        },
      };
    }
    case "units_execution": {
      const parsed = parseSalesUnitsExecutionCsv(text);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      const existing = (await loadImport(projectId, "units_execution")) as MarketingUnitsExecutionStoredV1 | null;
      const doc = buildMarketingUnitsExecutionStoredDoc({
        updatedAt,
        uploadedBy,
        fileName,
        rawText: text,
        parsed,
        existing,
      });
      return { ok: true, doc: doc as Record<string, unknown> };
    }
    case "apartments": {
      const parsed = parseApartmentsCsv(text, fileName);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return {
        ok: true,
        doc: {
          v: 1,
          updatedAt,
          uploadedBy,
          fileName: parsed.filename,
          rawText: text,
          headers: parsed.headers,
          rows: parsed.rows,
          warnings: parsed.warnings,
        },
      };
    }
    case "parking": {
      const parsed = parseParkingCsv(text, fileName);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return {
        ok: true,
        doc: {
          v: 1,
          updatedAt,
          uploadedBy,
          fileName: parsed.filename,
          rawText: text,
          headers: parsed.headers,
          rows: parsed.rows,
          warnings: parsed.warnings,
        },
      };
    }
    case "revenue_fact": {
      const parsed = parseRevenueFactCsv(text);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return {
        ok: true,
        doc: {
          v: 1,
          updatedAt,
          uploadedBy,
          fileName,
          rawText: text,
          rows: parsed.rows,
          summary: parsed.summary,
          warnings: parsed.warnings,
        },
      };
    }
    case "storages": {
      const parsed = parseStoragesCsv(text, fileName);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return {
        ok: true,
        doc: {
          v: 1,
          updatedAt,
          uploadedBy,
          fileName: parsed.filename,
          rawText: text,
          headers: parsed.headers,
          rows: parsed.rows,
          warnings: parsed.warnings,
        },
      };
    }
    case "installment_forecast": {
      const parsed = await parseInstallmentForecastImport(text, fileName);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return {
        ok: true,
        doc: {
          v: 1,
          updatedAt,
          uploadedBy,
          fileName,
          rows: parsed.rows,
          warnings: parsed.warnings,
          diagnostics: parsed.diagnostics,
        },
      };
    }
    case "installment_area": {
      const parsed = await parseInstallmentAreaImport(text, fileName);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return {
        ok: true,
        doc: {
          v: 1,
          updatedAt,
          uploadedBy,
          fileName,
          rows: parsed.rows,
          warnings: parsed.warnings,
          diagnostics: parsed.diagnostics,
          apartmentsSummary: parsed.apartmentsSummary,
          parkingSummary: parsed.parkingSummary ?? null,
          storageSummary: parsed.storageSummary ?? null,
        },
      };
    }
    case "ddu_revenue": {
      const parsed = await parseDduRevenueImport(text, fileName);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return {
        ok: true,
        doc: {
          v: 1,
          updatedAt,
          uploadedBy,
          fileName,
          rows: parsed.rows,
          warnings: parsed.warnings,
          diagnostics: parsed.diagnostics,
          apartmentsSummary: parsed.apartmentsSummary,
          parkingSummary: parsed.parkingSummary ?? null,
          storageSummary: parsed.storageSummary ?? null,
        },
      };
    }
    case "project_value": {
      const parsed = await parseProjectValueImport(text, fileName);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return {
        ok: true,
        doc: {
          v: 1,
          updatedAt,
          uploadedBy,
          fileName,
          rows: parsed.rows,
          warnings: parsed.warnings,
          diagnostics: parsed.diagnostics,
          apartmentsSummary: parsed.apartmentsSummary,
          parkingSummary: parsed.parkingSummary ?? null,
          storageSummary: parsed.storageSummary ?? null,
        },
      };
    }
    case "total_area": {
      const parsed = await parseTotalAreaImport(text, fileName);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return {
        ok: true,
        doc: {
          v: 1,
          updatedAt,
          uploadedBy,
          fileName,
          rows: parsed.rows,
          warnings: parsed.warnings,
          diagnostics: parsed.diagnostics,
          apartmentsSummary: parsed.apartmentsSummary,
          parkingSummary: parsed.parkingSummary ?? null,
          storageSummary: parsed.storageSummary ?? null,
          projectColumnKind: parsed.projectColumnKind,
        },
      };
    }
    case "reduced_area": {
      const parsed = await parseReducedAreaImport(text, fileName);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return {
        ok: true,
        doc: {
          v: 1,
          updatedAt,
          uploadedBy,
          fileName,
          rows: parsed.rows,
          warnings: parsed.warnings,
          diagnostics: parsed.diagnostics,
          apartmentsSummary: parsed.apartmentsSummary,
          parkingSummary: parsed.parkingSummary ?? null,
          storageSummary: parsed.storageSummary ?? null,
          projectColumnKind: parsed.projectColumnKind,
        },
      };
    }
    case "average_price_per_sqm": {
      const parsed = await parseAveragePricePerSqmImport(text, fileName);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return {
        ok: true,
        doc: {
          v: 1,
          updatedAt,
          uploadedBy,
          fileName,
          rows: parsed.rows,
          warnings: parsed.warnings,
          diagnostics: parsed.diagnostics,
          apartmentsSummary: parsed.apartmentsSummary,
          parkingSummary: parsed.parkingSummary ?? null,
          storageSummary: parsed.storageSummary ?? null,
          projectColumnKind: parsed.projectColumnKind,
        },
      };
    }
    case "apartment_plan": {
      const parsed = await parseApartmentPlanImport(text, fileName);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return {
        ok: true,
        doc: {
          v: 1,
          updatedAt,
          uploadedBy,
          fileName,
          rows: parsed.rows,
          warnings: parsed.warnings,
          diagnostics: parsed.diagnostics,
          biReportMeta: parsed.biReportMeta,
        },
      };
    }
    default:
      return { ok: false, error: `Неподдерживаемый kind: ${kind}` };
  }
}
