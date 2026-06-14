import { mkdir, readFile, unlink, writeFile } from "fs/promises";

import type { MarketingImportKind } from "@/lib/marketingImportKinds";
import {
  marketingProjectApartmentPlanJsonPath,
  marketingProjectApartmentPlanRawCsvPath,
  marketingProjectAveragePricePerSqmJsonPath,
  marketingProjectAveragePricePerSqmRawCsvPath,
  marketingProjectTotalAreaJsonPath,
  marketingProjectTotalAreaRawCsvPath,
  marketingProjectReducedAreaJsonPath,
  marketingProjectReducedAreaRawCsvPath,
  marketingProjectApartmentsJsonPath,
  marketingProjectApartmentsRawCsvPath,
  marketingProjectDduRevenueJsonPath,
  marketingProjectDduRevenueRawCsvPath,
  marketingProjectInstallmentAreaJsonPath,
  marketingProjectInstallmentAreaRawCsvPath,
  marketingProjectInstallmentForecastJsonPath,
  marketingProjectInstallmentForecastRawCsvPath,
  marketingProjectInvestorsJsonPath,
  marketingProjectInvestorsRawCsvPath,
  marketingProjectLeadsCsvJsonPath,
  marketingProjectLeadsCsvRawPath,
  marketingProjectMarketingDir,
  marketingProjectParkingJsonPath,
  marketingProjectParkingRawCsvPath,
  marketingProjectProjectValueJsonPath,
  marketingProjectProjectValueRawCsvPath,
  marketingProjectReceiptsPlanFactJsonPath,
  marketingProjectReceiptsPlanFactRawCsvPath,
  marketingProjectRevenueFactJsonPath,
  marketingProjectRevenueFactRawCsvPath,
  marketingProjectSegmentExecutionJsonPath,
  marketingProjectSegmentExecutionRawCsvPath,
  marketingProjectStoragesJsonPath,
  marketingProjectStoragesRawCsvPath,
  marketingProjectUnitsExecutionJsonPath,
  marketingProjectUnitsExecutionRawCsvPath,
} from "@/lib/marketingProjectMarketingStoragePaths";
import { analyticsCsvRegistryEntry } from "@/lib/analytics/analyticsCsvRegistry";
import { sanitizeMarketingPaymentPlanProjectId } from "@/lib/marketingPaymentPlanStore";
import { deleteAnalyticsCsv, persistAnalyticsCsv } from "@/lib/server/analyticsCsvStorage";

export type MarketingImportMeta = {
  kind: MarketingImportKind;
  updatedAt: string | null;
  uploadedBy: string | null;
  fileName: string | null;
  hasData: boolean;
};

type ImportPaths = { jsonPath: string; rawCsvPath: string };

const IMPORT_PATHS: Record<MarketingImportKind, (projectId: string) => ImportPaths> = {
  investors: (id) => ({
    jsonPath: marketingProjectInvestorsJsonPath(id),
    rawCsvPath: marketingProjectInvestorsRawCsvPath(id),
  }),
  segment_execution: (id) => ({
    jsonPath: marketingProjectSegmentExecutionJsonPath(id),
    rawCsvPath: marketingProjectSegmentExecutionRawCsvPath(id),
  }),
  units_execution: (id) => ({
    jsonPath: marketingProjectUnitsExecutionJsonPath(id),
    rawCsvPath: marketingProjectUnitsExecutionRawCsvPath(id),
  }),
  apartments: (id) => ({
    jsonPath: marketingProjectApartmentsJsonPath(id),
    rawCsvPath: marketingProjectApartmentsRawCsvPath(id),
  }),
  parking: (id) => ({
    jsonPath: marketingProjectParkingJsonPath(id),
    rawCsvPath: marketingProjectParkingRawCsvPath(id),
  }),
  storages: (id) => ({
    jsonPath: marketingProjectStoragesJsonPath(id),
    rawCsvPath: marketingProjectStoragesRawCsvPath(id),
  }),
  receipts_plan_fact: (id) => ({
    jsonPath: marketingProjectReceiptsPlanFactJsonPath(id),
    rawCsvPath: marketingProjectReceiptsPlanFactRawCsvPath(id),
  }),
  marketing_leads: (id) => ({
    jsonPath: marketingProjectLeadsCsvJsonPath(id),
    rawCsvPath: marketingProjectLeadsCsvRawPath(id),
  }),
  revenue_fact: (id) => ({
    jsonPath: marketingProjectRevenueFactJsonPath(id),
    rawCsvPath: marketingProjectRevenueFactRawCsvPath(id),
  }),
  installment_forecast: (id) => ({
    jsonPath: marketingProjectInstallmentForecastJsonPath(id),
    rawCsvPath: marketingProjectInstallmentForecastRawCsvPath(id),
  }),
  installment_area: (id) => ({
    jsonPath: marketingProjectInstallmentAreaJsonPath(id),
    rawCsvPath: marketingProjectInstallmentAreaRawCsvPath(id),
  }),
  ddu_revenue: (id) => ({
    jsonPath: marketingProjectDduRevenueJsonPath(id),
    rawCsvPath: marketingProjectDduRevenueRawCsvPath(id),
  }),
  project_value: (id) => ({
    jsonPath: marketingProjectProjectValueJsonPath(id),
    rawCsvPath: marketingProjectProjectValueRawCsvPath(id),
  }),
  apartment_plan: (id) => ({
    jsonPath: marketingProjectApartmentPlanJsonPath(id),
    rawCsvPath: marketingProjectApartmentPlanRawCsvPath(id),
  }),
  average_price_per_sqm: (id) => ({
    jsonPath: marketingProjectAveragePricePerSqmJsonPath(id),
    rawCsvPath: marketingProjectAveragePricePerSqmRawCsvPath(id),
  }),
  total_area: (id) => ({
    jsonPath: marketingProjectTotalAreaJsonPath(id),
    rawCsvPath: marketingProjectTotalAreaRawCsvPath(id),
  }),
  reduced_area: (id) => ({
    jsonPath: marketingProjectReducedAreaJsonPath(id),
    rawCsvPath: marketingProjectReducedAreaRawCsvPath(id),
  }),
};

function safeProjectId(projectId: string): string {
  return sanitizeMarketingPaymentPlanProjectId(projectId ?? "default");
}

export async function ensureMarketingProjectDir(projectId: string): Promise<string> {
  const id = safeProjectId(projectId);
  const dir = marketingProjectMarketingDir(id);
  await mkdir(dir, { recursive: true });
  return id;
}

export async function saveImport(
  projectId: string,
  kind: MarketingImportKind,
  doc: unknown,
  rawCsvText?: string | null,
): Promise<void> {
  const id = await ensureMarketingProjectDir(projectId);
  const paths = IMPORT_PATHS[kind](id);
  await writeFile(paths.jsonPath, JSON.stringify(doc, null, 0), "utf-8");
  if (rawCsvText != null && rawCsvText.length > 0) {
    await writeFile(paths.rawCsvPath, rawCsvText, "utf-8");
    const d = doc as Record<string, unknown>;
    const entry = analyticsCsvRegistryEntry(kind);
    await persistAnalyticsCsv(kind, rawCsvText, {
      uploadedAt: typeof d.updatedAt === "string" ? d.updatedAt : new Date().toISOString(),
      uploadedBy: typeof d.uploadedBy === "string" ? d.uploadedBy : "—",
      sourceFile: typeof d.fileName === "string" ? d.fileName : entry.fileName,
    });
  }
}

export async function loadImport<T = unknown>(projectId: string, kind: MarketingImportKind): Promise<T | null> {
  const id = safeProjectId(projectId);
  const paths = IMPORT_PATHS[kind](id);
  try {
    const raw = await readFile(paths.jsonPath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function deleteImport(projectId: string, kind: MarketingImportKind): Promise<void> {
  const id = safeProjectId(projectId);
  const paths = IMPORT_PATHS[kind](id);
  for (const p of [paths.jsonPath, paths.rawCsvPath]) {
    try {
      await unlink(p);
    } catch {
      /* ignore */
    }
  }
  await deleteAnalyticsCsv(kind);
}

function metaFromDoc(kind: MarketingImportKind, doc: unknown): MarketingImportMeta {
  if (!doc || typeof doc !== "object") {
    return { kind, updatedAt: null, uploadedBy: null, fileName: null, hasData: false };
  }
  const d = doc as Record<string, unknown>;
  const updatedAt = typeof d.updatedAt === "string" ? d.updatedAt : null;
  const uploadedBy = typeof d.uploadedBy === "string" ? d.uploadedBy : null;
  const fileName = typeof d.fileName === "string" ? d.fileName : null;
  const rows = Array.isArray(d.rows) ? d.rows.length : 0;
  const monthly = Array.isArray(d.monthly) ? d.monthly.length : 0;
  const segments = Array.isArray(d.segments) ? d.segments.length : 0;
  const hasData = rows > 0 || monthly > 0 || segments > 0 || Boolean(fileName);
  return { kind, updatedAt, uploadedBy, fileName, hasData };
}

export async function listImports(projectId: string): Promise<MarketingImportMeta[]> {
  const id = safeProjectId(projectId);
  const kinds = Object.keys(IMPORT_PATHS) as MarketingImportKind[];
  const out: MarketingImportMeta[] = [];
  for (const kind of kinds) {
    const doc = await loadImport(id, kind);
    out.push(metaFromDoc(kind, doc));
  }
  return out;
}

export function importPathsForKind(projectId: string, kind: MarketingImportKind): ImportPaths {
  return IMPORT_PATHS[kind](safeProjectId(projectId));
}
