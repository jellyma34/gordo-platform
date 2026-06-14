import { mkdir, readFile, unlink, writeFile } from "fs/promises";

import { NextRequest, NextResponse } from "next/server";

import {
  marketingPaymentPlanJsonPath,
  normalizeMarketingPaymentPlanDoc,
  sanitizeMarketingPaymentPlanProjectId,
} from "@/lib/marketingPaymentPlanStore";
import { parseMarketingInvestorsCsv, parseStoredMarketingInvestorsCsv } from "@/lib/marketingInvestorsCsv";
import {
  parseSegmentExecutionCsv,
  parseStoredMarketingSegmentExecutionCsv,
} from "@/lib/marketingSegmentExecutionCsv";
import {
  parseReceiptsPlanFactCsv,
  parseStoredMarketingReceiptsPlanFactCsv,
} from "@/lib/marketingReceiptsPlanFactCsv";
import {
  parseMarketingLeadsCsv,
  parseStoredMarketingLeadsCsv,
  reconcileMarketingLeadsDoc,
} from "@/lib/marketingLeadsCsv";
import { parseRevenueFactCsv } from "@/lib/parseRevenueFactCsv";
import {
  parseStoredMarketingRevenueFactCsv,
  reconcileMarketingRevenueFactDoc,
  revenueFactCsvDocIsValid,
} from "@/lib/marketingRevenueFactCsv";
import {
  parseApartmentsCsv,
  parseStoredMarketingApartmentsCsv,
} from "@/lib/marketingApartmentsCsv";
import {
  parseParkingCsv,
  parseStoredMarketingParkingCsv,
} from "@/lib/marketingParkingCsv";
import {
  parseStoragesCsv,
  parseStoredMarketingStoragesCsv,
} from "@/lib/marketingStoragesCsv";
import {
  buildMarketingUnitsExecutionStoredDoc,
  parseSalesUnitsExecutionCsv,
  parseStoredMarketingUnitsExecutionCsv,
  reconcileUnitsExecutionDoc,
  unitsExecutionDocHasApartments,
} from "@/lib/marketingUnitsExecutionCsv";
import {
  marketingProjectApartmentsJsonPath,
  marketingProjectApartmentsRawCsvPath,
  marketingProjectParkingJsonPath,
  marketingProjectParkingRawCsvPath,
  marketingProjectStoragesJsonPath,
  marketingProjectStoragesRawCsvPath,
  marketingProjectInvestorsJsonPath,
  marketingProjectInvestorsRawCsvPath,
  marketingProjectMarketingDir,
  marketingProjectSegmentExecutionJsonPath,
  marketingProjectSegmentExecutionRawCsvPath,
  marketingProjectReceiptsPlanFactJsonPath,
  marketingProjectReceiptsPlanFactRawCsvPath,
  marketingProjectLeadsCsvJsonPath,
  marketingProjectLeadsCsvRawPath,
  marketingProjectRevenueFactJsonPath,
  marketingProjectRevenueFactRawCsvPath,
  marketingProjectUnitsExecutionJsonPath,
  marketingProjectUnitsExecutionRawCsvPath,
  marketingProjectInstallmentForecastJsonPath,
  marketingProjectInstallmentForecastRawCsvPath,
  marketingProjectInstallmentAreaJsonPath,
  marketingProjectInstallmentAreaRawCsvPath,
  marketingProjectDduRevenueJsonPath,
  marketingProjectDduRevenueRawCsvPath,
  marketingProjectProjectValueJsonPath,
  marketingProjectProjectValueRawCsvPath,
  marketingProjectApartmentPlanJsonPath,
  marketingProjectApartmentPlanRawCsvPath,
  marketingProjectAveragePricePerSqmJsonPath,
  marketingProjectAveragePricePerSqmRawCsvPath,
  marketingProjectTotalAreaJsonPath,
  marketingProjectTotalAreaRawCsvPath,
  marketingProjectReducedAreaJsonPath,
  marketingProjectReducedAreaRawCsvPath,
} from "@/lib/marketingProjectMarketingStoragePaths";
import {
  marketingSalesPlanExecutionJsonPath,
  normalizeMarketingSalesPlanExecutionDoc,
  sanitizeMarketingSalesPlanExecutionProjectId,
} from "@/lib/marketingSalesPlanExecutionStore";
import { readInvestorsCsvFileAsText, readMarketingCsvFileAsText } from "@/src/shared/lib/csv/parseInvestorsCsv";
import { normalizeMarketingImportKind } from "@/lib/marketingImportKinds";
import { analyticsCsvRegistryEntry } from "@/lib/analytics/analyticsCsvRegistry";
import { persistAnalyticsCsv, deleteAnalyticsCsv } from "@/lib/server/analyticsCsvStorage";
import { loadMarketingDatasetDoc } from "@/lib/server/loadMarketingDataset";
import { saveImport, deleteImport as deleteMarketingImportFile } from "@/lib/server/marketingStorage";
import type { MarketingImportKind } from "@/lib/marketingImportKinds";
import {
  parseApartmentPlanImport,
  parseAveragePricePerSqmImport,
  parseTotalAreaImport,
  parseReducedAreaImport,
  parseDduRevenueImport,
  parseInstallmentAreaImport,
  parseInstallmentForecastImport,
  parseProjectValueImport,
} from "@/lib/server/marketingImportParse";
import { marketingInstallmentForecastCsvDocIsValid } from "@/lib/marketingInstallmentForecastCsv";
import { marketingInstallmentAreaCsvDocIsValid } from "@/lib/marketingInstallmentAreaCsv";
import { marketingDduRevenueCsvDocIsValid } from "@/lib/marketingDduRevenueCsv";
import { marketingProjectValueCsvDocIsValid } from "@/lib/marketingProjectValueCsv";
import { marketingApartmentPlanCsvDocIsValid } from "@/lib/marketingApartmentPlanCsv";
import { marketingAveragePricePerSqmCsvDocIsValid } from "@/lib/marketingAveragePricePerSqmCsv";
import { marketingTotalAreaCsvDocIsValid } from "@/lib/marketingTotalAreaCsv";
import { marketingReducedAreaCsvDocIsValid } from "@/lib/marketingReducedAreaCsv";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ projectId: string }> };

async function persistPublicAnalyticsCsv(
  kind: MarketingImportKind,
  text: string,
  updatedAt: string,
  uploadedBy: string,
  fileName: string,
): Promise<void> {
  const entry = analyticsCsvRegistryEntry(kind);
  await persistAnalyticsCsv(kind, text, {
    uploadedAt: updatedAt,
    uploadedBy,
    sourceFile: fileName || entry.fileName,
  });
}

type MarketingStoragePresence = {
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
  hasMarketingLeads: boolean;
  hasRevenueFact: boolean;
  hasInstallmentForecast: boolean;
  hasInstallmentArea: boolean;
  hasDduRevenue: boolean;
  hasProjectValue: boolean;
  hasApartmentPlan: boolean;
  hasAveragePricePerSqm: boolean;
  hasTotalArea: boolean;
  hasReducedArea: boolean;
};

async function readJsonInvestorsDoc(
  projectId: string,
): Promise<ReturnType<typeof parseStoredMarketingInvestorsCsv>> {
  const raw = await loadMarketingDatasetDoc("investors", projectId);
  return raw ? parseStoredMarketingInvestorsCsv(raw) : null;
}

async function readJsonUnitsDoc(
  projectId: string,
): Promise<ReturnType<typeof parseStoredMarketingUnitsExecutionCsv>> {
  try {
    const loaded = await loadMarketingDatasetDoc("units_execution", projectId);
    const doc = parseStoredMarketingUnitsExecutionCsv(loaded);
    if (!doc) return null;

    let csvText = doc.rawText?.trim() ?? "";
    if (!csvText) {
      try {
        csvText = (await readFile(marketingProjectUnitsExecutionRawCsvPath(projectId), "utf-8")).trim();
      } catch {
        csvText = "";
      }
    }

    const reconciled = reconcileUnitsExecutionDoc(doc, csvText || null);
    const repaired =
      !unitsExecutionDocHasApartments(doc) && unitsExecutionDocHasApartments(reconciled);
    if (repaired || reconciled.segments.length > doc.segments.length) {
      try {
        await writeFile(
          marketingProjectUnitsExecutionJsonPath(projectId),
          JSON.stringify(reconciled, null, 0),
          "utf-8",
        );
      } catch {
        /* ignore persist errors */
      }
    }
    return reconciled;
  } catch {
    return null;
  }
}

async function readJsonApartmentsDoc(
  projectId: string,
): Promise<ReturnType<typeof parseStoredMarketingApartmentsCsv>> {
  const raw = await loadMarketingDatasetDoc("apartments", projectId);
  return raw ? parseStoredMarketingApartmentsCsv(raw) : null;
}

async function readJsonParkingDoc(
  projectId: string,
): Promise<ReturnType<typeof parseStoredMarketingParkingCsv>> {
  const raw = await loadMarketingDatasetDoc("parking", projectId);
  return raw ? parseStoredMarketingParkingCsv(raw) : null;
}

async function readJsonStoragesDoc(
  projectId: string,
): Promise<ReturnType<typeof parseStoredMarketingStoragesCsv>> {
  const raw = await loadMarketingDatasetDoc("storages", projectId);
  return raw ? parseStoredMarketingStoragesCsv(raw) : null;
}

async function readJsonReceiptsPlanFactDoc(
  projectId: string,
): Promise<ReturnType<typeof parseStoredMarketingReceiptsPlanFactCsv>> {
  const raw = await loadMarketingDatasetDoc("receipts_plan_fact", projectId);
  return raw ? parseStoredMarketingReceiptsPlanFactCsv(raw) : null;
}

async function readJsonRevenueFactDoc(
  projectId: string,
): Promise<ReturnType<typeof parseStoredMarketingRevenueFactCsv>> {
  const loaded = await loadMarketingDatasetDoc("revenue_fact", projectId);
  const doc = loaded ? parseStoredMarketingRevenueFactCsv(loaded) : null;
  if (!doc) return null;
  let csvText = doc.rawText?.trim() ?? "";
  if (!csvText) {
    try {
      csvText = (await readFile(marketingProjectRevenueFactRawCsvPath(projectId), "utf-8")).trim();
    } catch {
      csvText = "";
    }
  }
  return reconcileMarketingRevenueFactDoc({ ...doc, rawText: csvText || doc.rawText });
}

async function readJsonMarketingLeadsDoc(
  projectId: string,
): Promise<ReturnType<typeof parseStoredMarketingLeadsCsv>> {
  const loaded = await loadMarketingDatasetDoc("marketing_leads", projectId);
  const doc = loaded ? parseStoredMarketingLeadsCsv(loaded) : null;
  if (!doc) return null;
  let csvText = doc.rawText?.trim() ?? "";
  if (!csvText) {
    try {
      csvText = (await readFile(marketingProjectLeadsCsvRawPath(projectId), "utf-8")).trim();
    } catch {
      csvText = "";
    }
  }
  return reconcileMarketingLeadsDoc({ ...doc, rawText: csvText || doc.rawText });
}

async function readJsonSegmentExecutionDoc(
  projectId: string,
): Promise<ReturnType<typeof parseStoredMarketingSegmentExecutionCsv>> {
  const raw = await loadMarketingDatasetDoc("segment_execution", projectId);
  return raw ? parseStoredMarketingSegmentExecutionCsv(raw) : null;
}

async function readJsonInstallmentForecastDoc(projectId: string) {
  const doc = await loadMarketingDatasetDoc("installment_forecast", projectId);
  return marketingInstallmentForecastCsvDocIsValid(doc) ? doc : null;
}

async function readJsonInstallmentAreaDoc(projectId: string) {
  const doc = await loadMarketingDatasetDoc("installment_area", projectId);
  return marketingInstallmentAreaCsvDocIsValid(doc) ? doc : null;
}

async function readJsonDduRevenueDoc(projectId: string) {
  const doc = await loadMarketingDatasetDoc("ddu_revenue", projectId);
  return marketingDduRevenueCsvDocIsValid(doc) ? doc : null;
}

async function readJsonProjectValueDoc(projectId: string) {
  const doc = await loadMarketingDatasetDoc("project_value", projectId);
  return marketingProjectValueCsvDocIsValid(doc) ? doc : null;
}

async function readJsonAveragePricePerSqmDoc(projectId: string) {
  const doc = await loadMarketingDatasetDoc("average_price_per_sqm", projectId);
  return marketingAveragePricePerSqmCsvDocIsValid(doc) ? doc : null;
}

async function readJsonTotalAreaDoc(projectId: string) {
  const doc = await loadMarketingDatasetDoc("total_area", projectId);
  return marketingTotalAreaCsvDocIsValid(doc) ? doc : null;
}

async function readJsonReducedAreaDoc(projectId: string) {
  const doc = await loadMarketingDatasetDoc("reduced_area", projectId);
  return marketingReducedAreaCsvDocIsValid(doc) ? doc : null;
}

async function readJsonApartmentPlanDoc(projectId: string) {
  const doc = await loadMarketingDatasetDoc("apartment_plan", projectId);
  return marketingApartmentPlanCsvDocIsValid(doc) ? doc : null;
}

async function computePresence(safeProjectId: string): Promise<MarketingStoragePresence> {
  let hasPlan = false;
  let hasFact = false;
  try {
    const raw = await readFile(marketingPaymentPlanJsonPath(safeProjectId), "utf-8");
    const plan = normalizeMarketingPaymentPlanDoc(JSON.parse(raw) as unknown);
    if (plan && plan.v === 2) {
      hasPlan = Object.keys(plan.planByPeriodKey ?? {}).length > 0;
      const f = plan.factByPeriodKey;
      hasFact = f != null && typeof f === "object" && Object.keys(f).length > 0;
    }
  } catch {
    /* empty */
  }

  let hasExecutionPlan = false;
  try {
    const raw = await readFile(marketingSalesPlanExecutionJsonPath(safeProjectId), "utf-8");
    const doc = normalizeMarketingSalesPlanExecutionDoc(JSON.parse(raw) as unknown);
    if (doc?.dataset?.rows?.length) {
      hasExecutionPlan = true;
    } else if ((doc?.dataset?.planFactCsvMonthly?.length ?? 0) > 0) {
      hasExecutionPlan = true;
    } else if (doc?.meta?.fileName) {
      hasExecutionPlan = true;
    }
  } catch {
    /* empty */
  }

  const inv = await readJsonInvestorsDoc(safeProjectId);
  const seg = await readJsonSegmentExecutionDoc(safeProjectId);
  const u = await readJsonUnitsDoc(safeProjectId);
  const apt = await readJsonApartmentsDoc(safeProjectId);
  const parking = await readJsonParkingDoc(safeProjectId);
  const storages = await readJsonStoragesDoc(safeProjectId);
  const receipts = await readJsonReceiptsPlanFactDoc(safeProjectId);
  const marketingLeads = await readJsonMarketingLeadsDoc(safeProjectId);
  const revenueFact = await readJsonRevenueFactDoc(safeProjectId);
  const installmentForecast = await readJsonInstallmentForecastDoc(safeProjectId);
  const installmentArea = await readJsonInstallmentAreaDoc(safeProjectId);
  const dduRevenue = await readJsonDduRevenueDoc(safeProjectId);
  const projectValue = await readJsonProjectValueDoc(safeProjectId);
  const apartmentPlan = await readJsonApartmentPlanDoc(safeProjectId);
  const averagePricePerSqm = await readJsonAveragePricePerSqmDoc(safeProjectId);
  const totalArea = await readJsonTotalAreaDoc(safeProjectId);
  const reducedArea = await readJsonReducedAreaDoc(safeProjectId);

  return {
    hasPlan,
    hasFact,
    hasInvestors: inv != null,
    hasSegmentExecution: seg != null && seg.planFactRows.length > 0,
    hasUnitsExecution: u != null && u.segments.length > 0,
    hasApartments: apt != null && (apt.rows.length > 0 || apt.headers.length > 0),
    hasParking: parking != null && (parking.rows.length > 0 || parking.headers.length > 0),
    hasStorages: storages != null && (storages.rows.length > 0 || storages.headers.length > 0),
    hasExecutionPlan,
    hasReceiptsPlanFact: receipts != null && receipts.monthly.length > 0,
    hasMarketingLeads: marketingLeads != null,
    hasRevenueFact: revenueFactCsvDocIsValid(revenueFact),
    hasInstallmentForecast: installmentForecast != null && installmentForecast.rows.length > 0,
    hasInstallmentArea: installmentArea != null && installmentArea.rows.length > 0,
    hasDduRevenue: dduRevenue != null && dduRevenue.rows.length > 0,
    hasProjectValue: projectValue != null && projectValue.rows.length > 0,
    hasApartmentPlan: apartmentPlan != null && apartmentPlan.rows.length > 0,
    hasAveragePricePerSqm: averagePricePerSqm != null && averagePricePerSqm.rows.length > 0,
    hasTotalArea: totalArea != null && totalArea.rows.length > 0,
    hasReducedArea: reducedArea != null && reducedArea.rows.length > 0,
  };
}

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { projectId: raw } = await ctx.params;
  const safeProjectId = sanitizeMarketingPaymentPlanProjectId(raw ?? "default");
  const presence = await computePresence(safeProjectId);
  const [investors, segmentExecution, unitsExecution, apartments, parking, storages, receiptsPlanFact, marketingLeads, revenueFact, installmentForecast, installmentArea, dduRevenue, projectValue, apartmentPlan, averagePricePerSqm, totalArea, reducedAreaAnalytics] =
    await Promise.all([
    readJsonInvestorsDoc(safeProjectId),
    readJsonSegmentExecutionDoc(safeProjectId),
    readJsonUnitsDoc(safeProjectId),
    readJsonApartmentsDoc(safeProjectId),
    readJsonParkingDoc(safeProjectId),
    readJsonStoragesDoc(safeProjectId),
    readJsonReceiptsPlanFactDoc(safeProjectId),
    readJsonMarketingLeadsDoc(safeProjectId),
    readJsonRevenueFactDoc(safeProjectId),
    readJsonInstallmentForecastDoc(safeProjectId),
    readJsonInstallmentAreaDoc(safeProjectId),
    readJsonDduRevenueDoc(safeProjectId),
    readJsonProjectValueDoc(safeProjectId),
    readJsonApartmentPlanDoc(safeProjectId),
    readJsonAveragePricePerSqmDoc(safeProjectId),
    readJsonTotalAreaDoc(safeProjectId),
    readJsonReducedAreaDoc(safeProjectId),
  ]);
  return NextResponse.json(
    {
      ok: true,
      projectId: safeProjectId,
      presence,
      datasets: {
        investors,
        segmentExecution,
        unitsExecution,
        apartments,
        parking,
        storages,
        receiptsPlanFact,
        marketingLeads,
        revenueFact,
        installmentForecast,
        installmentArea,
        dduRevenue,
        projectValue,
        apartmentPlan,
        averagePricePerSqm,
        totalArea,
        reducedAreaAnalytics,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  try {
    const { projectId: raw } = await ctx.params;
    const safeProjectId = sanitizeMarketingPaymentPlanProjectId(raw ?? "default");
    const ct = req.headers.get("content-type") ?? "";

    if (ct.includes("application/json")) {
      const body = (await req.json()) as {
        kind?: string;
        migrateFromBrowser?: boolean;
        doc?: unknown;
        uploadedBy?: string;
      };
      const kindNorm = normalizeMarketingImportKind(body.kind ?? "");
      if (!body.migrateFromBrowser || !kindNorm || body.doc == null) {
        return NextResponse.json(
          { ok: false, error: "Ожидается JSON { kind, migrateFromBrowser: true, doc }." },
          { status: 400 },
        );
      }
      const valid =
        (kindNorm === "installment_forecast" && marketingInstallmentForecastCsvDocIsValid(body.doc)) ||
        (kindNorm === "installment_area" && marketingInstallmentAreaCsvDocIsValid(body.doc)) ||
        (kindNorm === "ddu_revenue" && marketingDduRevenueCsvDocIsValid(body.doc)) ||
        (kindNorm === "project_value" && marketingProjectValueCsvDocIsValid(body.doc)) ||
        (kindNorm === "apartment_plan" && marketingApartmentPlanCsvDocIsValid(body.doc)) ||
        (kindNorm === "average_price_per_sqm" && marketingAveragePricePerSqmCsvDocIsValid(body.doc)) ||
        (kindNorm === "total_area" && marketingTotalAreaCsvDocIsValid(body.doc)) ||
        (kindNorm === "reduced_area" && marketingReducedAreaCsvDocIsValid(body.doc));
      if (!valid) {
        return NextResponse.json({ ok: false, error: "Некорректный документ для миграции." }, { status: 400 });
      }
      const doc = {
        ...(body.doc as Record<string, unknown>),
        uploadedBy: body.uploadedBy?.trim() || "—",
        updatedAt: new Date().toISOString(),
      };
      await saveImport(safeProjectId, kindNorm, doc);
      const presence = await computePresence(safeProjectId);
      return NextResponse.json({ ok: true, projectId: safeProjectId, kind: kindNorm, doc, presence });
    }

    if (!ct.includes("multipart/form-data")) {
      return NextResponse.json({ ok: false, error: "Ожидается multipart/form-data." }, { status: 415 });
    }
    const form = await req.formData();
    const kind = String(form.get("kind") ?? "")
      .toLowerCase()
      .trim();
    const file = form.get("file");
    const uploadedBy = String(form.get("uploadedBy") ?? "").trim() || "—";

    if (!(file instanceof Blob)) {
      return NextResponse.json({ ok: false, error: "Нужно поле file" }, { status: 400 });
    }

    const fileName = (file as File).name?.trim() || "upload.csv";
    const updatedAt = new Date().toISOString();

    await mkdir(marketingProjectMarketingDir(safeProjectId), { recursive: true });

    if (kind === "investors") {
      const text = await readInvestorsCsvFileAsText(file as File);
      const parsed = parseMarketingInvestorsCsv(text);
      if (!parsed.ok) {
        return NextResponse.json({ ok: false, error: parsed.error, warnings: parsed.warnings ?? [] }, { status: 400 });
      }
      const doc = {
        v: 1 as const,
        updatedAt,
        uploadedBy,
        fileName,
        rawText: text,
        planFactChartRows: parsed.planFactChartRows,
        completionChartRows: parsed.completionChartRows,
        warnings: parsed.warnings,
      };
      await writeFile(marketingProjectInvestorsJsonPath(safeProjectId), JSON.stringify(doc, null, 0), "utf-8");
      await writeFile(marketingProjectInvestorsRawCsvPath(safeProjectId), text, "utf-8");
      await persistPublicAnalyticsCsv("investors", text, updatedAt, uploadedBy, fileName);
      const presence = await computePresence(safeProjectId);
      return NextResponse.json({
        ok: true,
        projectId: safeProjectId,
        kind: "investors",
        doc,
        presence,
      });
    }

    if (
      kind === "segment_execution" ||
      kind === "segment-execution" ||
      kind === "execution_segments"
    ) {
      const text = await readMarketingCsvFileAsText(file as File);
      const parsed = parseSegmentExecutionCsv(text);
      if (!parsed.ok) {
        return NextResponse.json({ ok: false, error: parsed.error, warnings: parsed.warnings ?? [] }, { status: 400 });
      }
      const doc = {
        v: 1 as const,
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
      };
      await writeFile(marketingProjectSegmentExecutionJsonPath(safeProjectId), JSON.stringify(doc, null, 0), "utf-8");
      await writeFile(marketingProjectSegmentExecutionRawCsvPath(safeProjectId), text, "utf-8");
      await persistPublicAnalyticsCsv("segment_execution", text, updatedAt, uploadedBy, fileName);
      const presence = await computePresence(safeProjectId);
      return NextResponse.json({
        ok: true,
        projectId: safeProjectId,
        kind: "segment_execution",
        doc,
        presence,
      });
    }

    if (
      kind === "marketing_leads" ||
      kind === "marketing-leads" ||
      kind === "leads_csv" ||
      kind === "лиды"
    ) {
      const text = await readMarketingCsvFileAsText(file as File);
      const parsed = parseMarketingLeadsCsv(text);
      if (!parsed.ok) {
        return NextResponse.json({ ok: false, error: parsed.error, warnings: parsed.warnings ?? [] }, { status: 400 });
      }
      const doc = {
        v: 1 as const,
        updatedAt,
        uploadedBy,
        fileName,
        rawText: text,
        adSpend: parsed.tables.adSpend,
        leads: parsed.tables.leads,
        costPerLead: parsed.tables.costPerLead,
        warnings: parsed.warnings,
      };
      await writeFile(marketingProjectLeadsCsvJsonPath(safeProjectId), JSON.stringify(doc, null, 0), "utf-8");
      await writeFile(marketingProjectLeadsCsvRawPath(safeProjectId), text, "utf-8");
      await persistPublicAnalyticsCsv("marketing_leads", text, updatedAt, uploadedBy, fileName);
      const presence = await computePresence(safeProjectId);
      return NextResponse.json({
        ok: true,
        projectId: safeProjectId,
        kind: "marketing_leads",
        doc,
        presence,
        warnings: parsed.warnings,
      });
    }

    if (
      kind === "receipts_plan_fact" ||
      kind === "receipts-plan-fact" ||
      kind === "plan_vs_fact" ||
      kind === "поступления_план_факт"
    ) {
      const text = await readMarketingCsvFileAsText(file as File);
      const parsed = parseReceiptsPlanFactCsv(text);
      if (!parsed.ok) {
        return NextResponse.json({ ok: false, error: parsed.error, warnings: parsed.warnings ?? [] }, { status: 400 });
      }
      const doc = {
        v: 1 as const,
        updatedAt,
        uploadedBy,
        fileName,
        rawText: text,
        monthly: parsed.monthly,
        warnings: parsed.warnings,
      };
      await writeFile(marketingProjectReceiptsPlanFactJsonPath(safeProjectId), JSON.stringify(doc, null, 0), "utf-8");
      await writeFile(marketingProjectReceiptsPlanFactRawCsvPath(safeProjectId), text, "utf-8");
      await persistPublicAnalyticsCsv("receipts_plan_fact", text, updatedAt, uploadedBy, fileName);
      const presence = await computePresence(safeProjectId);
      return NextResponse.json({
        ok: true,
        projectId: safeProjectId,
        kind: "receipts_plan_fact",
        doc,
        presence,
        warnings: parsed.warnings,
      });
    }

    if (kind === "units_execution" || kind === "units-execution" || kind === "units") {
      const text = await readMarketingCsvFileAsText(file as File);
      const parsed = parseSalesUnitsExecutionCsv(text);
      if (!parsed.ok) {
        return NextResponse.json({ ok: false, error: parsed.error, warnings: parsed.warnings ?? [] }, { status: 400 });
      }
      const existing = await readJsonUnitsDoc(safeProjectId);
      const doc = buildMarketingUnitsExecutionStoredDoc({
        updatedAt,
        uploadedBy,
        fileName,
        rawText: text,
        parsed,
        existing,
      });
      await writeFile(marketingProjectUnitsExecutionJsonPath(safeProjectId), JSON.stringify(doc, null, 0), "utf-8");
      await writeFile(marketingProjectUnitsExecutionRawCsvPath(safeProjectId), text, "utf-8");
      await persistPublicAnalyticsCsv("units_execution", text, updatedAt, uploadedBy, fileName);
      const presence = await computePresence(safeProjectId);
      return NextResponse.json({
        ok: true,
        projectId: safeProjectId,
        kind: "units_execution",
        doc,
        presence,
      });
    }

    if (kind === "apartments" || kind === "apartments_csv") {
      const text = await readMarketingCsvFileAsText(file as File);
      const parsed = parseApartmentsCsv(text, fileName);
      if (!parsed.ok) {
        return NextResponse.json({ ok: false, error: parsed.error, warnings: parsed.warnings ?? [] }, { status: 400 });
      }
      const doc = {
        v: 1 as const,
        updatedAt,
        uploadedBy,
        fileName: parsed.filename,
        rawText: text,
        headers: parsed.headers,
        rows: parsed.rows,
        warnings: parsed.warnings,
      };
      await writeFile(marketingProjectApartmentsJsonPath(safeProjectId), JSON.stringify(doc, null, 0), "utf-8");
      await writeFile(marketingProjectApartmentsRawCsvPath(safeProjectId), text, "utf-8");
      await persistPublicAnalyticsCsv("apartments", text, updatedAt, uploadedBy, fileName);
      const presence = await computePresence(safeProjectId);
      return NextResponse.json({
        ok: true,
        projectId: safeProjectId,
        kind: "apartments",
        doc,
        presence,
      });
    }

    if (kind === "parking" || kind === "parking_csv") {
      const text = await readMarketingCsvFileAsText(file as File);
      const parsed = parseParkingCsv(text, fileName);
      if (!parsed.ok) {
        return NextResponse.json({ ok: false, error: parsed.error, warnings: parsed.warnings ?? [] }, { status: 400 });
      }
      const doc = {
        v: 1 as const,
        updatedAt,
        uploadedBy,
        fileName: parsed.filename,
        rawText: text,
        headers: parsed.headers,
        rows: parsed.rows,
        warnings: parsed.warnings,
      };
      await writeFile(marketingProjectParkingJsonPath(safeProjectId), JSON.stringify(doc, null, 0), "utf-8");
      await writeFile(marketingProjectParkingRawCsvPath(safeProjectId), text, "utf-8");
      await persistPublicAnalyticsCsv("parking", text, updatedAt, uploadedBy, fileName);
      const presence = await computePresence(safeProjectId);
      return NextResponse.json({
        ok: true,
        projectId: safeProjectId,
        kind: "parking",
        doc,
        presence,
      });
    }

    if (
      kind === "revenue_fact" ||
      kind === "revenue-fact" ||
      kind === "sales_structure_revenue" ||
      kind === "structure_revenue_fact"
    ) {
      const text = await readMarketingCsvFileAsText(file as File);
      const parsed = parseRevenueFactCsv(text);
      if (!parsed.ok) {
        return NextResponse.json({ ok: false, error: parsed.error, warnings: parsed.warnings ?? [] }, { status: 400 });
      }
      const doc = {
        v: 1 as const,
        updatedAt,
        uploadedBy,
        fileName,
        rawText: text,
        rows: parsed.rows,
        summary: parsed.summary,
        warnings: parsed.warnings,
      };
      await writeFile(marketingProjectRevenueFactJsonPath(safeProjectId), JSON.stringify(doc, null, 0), "utf-8");
      await writeFile(marketingProjectRevenueFactRawCsvPath(safeProjectId), text, "utf-8");
      await persistPublicAnalyticsCsv("revenue_fact", text, updatedAt, uploadedBy, fileName);
      const presence = await computePresence(safeProjectId);
      return NextResponse.json({
        ok: true,
        projectId: safeProjectId,
        kind: "revenue_fact",
        doc,
        presence,
        warnings: parsed.warnings,
      });
    }

    if (kind === "storages" || kind === "storages_csv" || kind === "storage" || kind === "storage_csv") {
      const text = await readMarketingCsvFileAsText(file as File);
      const parsed = parseStoragesCsv(text, fileName);
      if (!parsed.ok) {
        return NextResponse.json({ ok: false, error: parsed.error, warnings: parsed.warnings ?? [] }, { status: 400 });
      }
      const doc = {
        v: 1 as const,
        updatedAt,
        uploadedBy,
        fileName: parsed.filename,
        rawText: text,
        headers: parsed.headers,
        rows: parsed.rows,
        warnings: parsed.warnings,
      };
      await writeFile(marketingProjectStoragesJsonPath(safeProjectId), JSON.stringify(doc, null, 0), "utf-8");
      await writeFile(marketingProjectStoragesRawCsvPath(safeProjectId), text, "utf-8");
      await persistPublicAnalyticsCsv("storages", text, updatedAt, uploadedBy, fileName);
      const presence = await computePresence(safeProjectId);
      return NextResponse.json({
        ok: true,
        projectId: safeProjectId,
        kind: "storages",
        doc,
        presence,
      });
    }

    if (kind === "installment_forecast" || kind === "installment-forecast" || kind === "installment_forecast_csv") {
      const text = await readMarketingCsvFileAsText(file as File);
      const parsed = await parseInstallmentForecastImport(text, fileName);
      if (!parsed.ok) {
        return NextResponse.json(
          { ok: false, error: parsed.error, diagnostics: parsed.diagnostics, warnings: parsed.warnings ?? [] },
          { status: 400 },
        );
      }
      const doc = {
        v: 1 as const,
        updatedAt,
        uploadedBy,
        fileName,
        rows: parsed.rows,
        warnings: parsed.warnings,
        diagnostics: parsed.diagnostics,
      };
      await saveImport(safeProjectId, "installment_forecast", doc, text);
      const presence = await computePresence(safeProjectId);
      return NextResponse.json({ ok: true, projectId: safeProjectId, kind: "installment_forecast", doc, presence });
    }

    if (kind === "installment_area" || kind === "installment-area" || kind === "project_area_csv") {
      const text = await readMarketingCsvFileAsText(file as File);
      const parsed = await parseInstallmentAreaImport(text, fileName);
      if (!parsed.ok) {
        return NextResponse.json(
          { ok: false, error: parsed.error, diagnostics: parsed.diagnostics, warnings: parsed.warnings ?? [] },
          { status: 400 },
        );
      }
      const doc = {
        v: 1 as const,
        updatedAt,
        uploadedBy,
        fileName,
        rows: parsed.rows,
        warnings: parsed.warnings,
        diagnostics: parsed.diagnostics,
        apartmentsSummary: parsed.apartmentsSummary,
        parkingSummary: parsed.parkingSummary ?? null,
        storageSummary: parsed.storageSummary ?? null,
      };
      await saveImport(safeProjectId, "installment_area", doc, text);
      const presence = await computePresence(safeProjectId);
      return NextResponse.json({ ok: true, projectId: safeProjectId, kind: "installment_area", doc, presence });
    }

    if (kind === "ddu_revenue" || kind === "ddu-revenue" || kind === "sales_plan_csv") {
      const text = await readMarketingCsvFileAsText(file as File);
      const parsed = await parseDduRevenueImport(text, fileName);
      if (!parsed.ok) {
        return NextResponse.json(
          { ok: false, error: parsed.error, diagnostics: parsed.diagnostics, warnings: parsed.warnings ?? [] },
          { status: 400 },
        );
      }
      const doc = {
        v: 1 as const,
        updatedAt,
        uploadedBy,
        fileName,
        rows: parsed.rows,
        warnings: parsed.warnings,
        diagnostics: parsed.diagnostics,
        apartmentsSummary: parsed.apartmentsSummary,
        parkingSummary: parsed.parkingSummary ?? null,
        storageSummary: parsed.storageSummary ?? null,
      };
      await saveImport(safeProjectId, "ddu_revenue", doc, text);
      const presence = await computePresence(safeProjectId);
      return NextResponse.json({ ok: true, projectId: safeProjectId, kind: "ddu_revenue", doc, presence });
    }

    if (kind === "project_value" || kind === "project-value" || kind === "project_value_csv") {
      const text = await readMarketingCsvFileAsText(file as File);
      const parsed = await parseProjectValueImport(text, fileName);
      if (!parsed.ok) {
        return NextResponse.json(
          { ok: false, error: parsed.error, diagnostics: parsed.diagnostics, warnings: parsed.warnings ?? [] },
          { status: 400 },
        );
      }
      const doc = {
        v: 1 as const,
        updatedAt,
        uploadedBy,
        fileName,
        rows: parsed.rows,
        warnings: parsed.warnings,
        diagnostics: parsed.diagnostics,
        apartmentsSummary: parsed.apartmentsSummary,
        parkingSummary: parsed.parkingSummary ?? null,
        storageSummary: parsed.storageSummary ?? null,
      };
      await saveImport(safeProjectId, "project_value", doc, text);
      const presence = await computePresence(safeProjectId);
      return NextResponse.json({ ok: true, projectId: safeProjectId, kind: "project_value", doc, presence });
    }

    if (kind === "total_area" || kind === "total-area" || kind === "total_area_csv" || kind === "общая_площадь") {
      const text = await readMarketingCsvFileAsText(file as File);
      const parsed = await parseTotalAreaImport(text, fileName);
      if (!parsed.ok) {
        return NextResponse.json(
          { ok: false, error: parsed.error, diagnostics: parsed.diagnostics, warnings: parsed.warnings ?? [] },
          { status: 400 },
        );
      }
      const doc = {
        v: 1 as const,
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
      };
      await saveImport(safeProjectId, "total_area", doc, text);
      const presence = await computePresence(safeProjectId);
      return NextResponse.json({ ok: true, projectId: safeProjectId, kind: "total_area", doc, presence });
    }

    if (
      kind === "reduced_area" ||
      kind === "reduced-area" ||
      kind === "reduced_area_csv" ||
      kind === "reduced_area_analytics" ||
      kind === "приведенная_площадь" ||
      kind === "приведенная-площадь"
    ) {
      const text = await readMarketingCsvFileAsText(file as File);
      const parsed = await parseReducedAreaImport(text, fileName);
      if (!parsed.ok) {
        return NextResponse.json(
          { ok: false, error: parsed.error, diagnostics: parsed.diagnostics, warnings: parsed.warnings ?? [] },
          { status: 400 },
        );
      }
      const doc = {
        v: 1 as const,
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
      };
      await saveImport(safeProjectId, "reduced_area", doc, text);
      const presence = await computePresence(safeProjectId);
      return NextResponse.json({ ok: true, projectId: safeProjectId, kind: "reduced_area", doc, presence });
    }

    if (
      kind === "average_price_per_sqm" ||
      kind === "average-price-per-sqm" ||
      kind === "avg_price_per_sqm" ||
      kind === "average_price_csv"
    ) {
      const text = await readMarketingCsvFileAsText(file as File);
      const parsed = await parseAveragePricePerSqmImport(text, fileName);
      if (!parsed.ok) {
        return NextResponse.json(
          { ok: false, error: parsed.error, diagnostics: parsed.diagnostics, warnings: parsed.warnings ?? [] },
          { status: 400 },
        );
      }
      const doc = {
        v: 1 as const,
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
      };
      await saveImport(safeProjectId, "average_price_per_sqm", doc, text);
      const presence = await computePresence(safeProjectId);
      return NextResponse.json({ ok: true, projectId: safeProjectId, kind: "average_price_per_sqm", doc, presence });
    }

    if (kind === "apartment_plan" || kind === "apartment-plan" || kind === "apartment_plan_csv") {
      const text = await readMarketingCsvFileAsText(file as File);
      const parsed = await parseApartmentPlanImport(text, fileName);
      if (!parsed.ok) {
        return NextResponse.json(
          { ok: false, error: parsed.error, diagnostics: parsed.diagnostics, warnings: parsed.warnings ?? [] },
          { status: 400 },
        );
      }
      const doc = {
        v: 1 as const,
        updatedAt,
        uploadedBy,
        fileName,
        rows: parsed.rows,
        warnings: parsed.warnings,
        diagnostics: parsed.diagnostics,
        biReportMeta: parsed.biReportMeta,
      };
      await saveImport(safeProjectId, "apartment_plan", doc, text);
      const presence = await computePresence(safeProjectId);
      return NextResponse.json({ ok: true, projectId: safeProjectId, kind: "apartment_plan", doc, presence });
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          "Укажите kind: investors, segment_execution, receipts_plan_fact, marketing_leads, revenue_fact, units_execution, apartments, parking, storages, installment_forecast, installment_area, ddu_revenue, project_value, apartment_plan, average_price_per_sqm, total_area, reduced_area.",
      },
      { status: 400 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  try {
    const { projectId: raw } = await ctx.params;
    const safeProjectId = sanitizeMarketingSalesPlanExecutionProjectId(raw ?? "default");
    const kind = (req.nextUrl.searchParams.get("kind") ?? "").toLowerCase().trim();

    if (
      kind !== "investors" &&
      kind !== "segment_execution" &&
      kind !== "segment-execution" &&
      kind !== "execution_segments" &&
      kind !== "units_execution" &&
      kind !== "units-execution" &&
      kind !== "units" &&
      kind !== "apartments" &&
      kind !== "apartments_csv" &&
      kind !== "parking" &&
      kind !== "parking_csv" &&
      kind !== "storages" &&
      kind !== "storages_csv" &&
      kind !== "storage" &&
      kind !== "storage_csv" &&
      kind !== "receipts_plan_fact" &&
      kind !== "receipts-plan-fact" &&
      kind !== "plan_vs_fact" &&
      kind !== "marketing_leads" &&
      kind !== "marketing-leads" &&
      kind !== "leads_csv" &&
      kind !== "лиды" &&
      kind !== "revenue_fact" &&
      kind !== "revenue-fact" &&
      kind !== "sales_structure_revenue" &&
      kind !== "structure_revenue_fact" &&
      kind !== "installment_forecast" &&
      kind !== "installment-forecast" &&
      kind !== "installment_forecast_csv" &&
      kind !== "installment_area" &&
      kind !== "installment-area" &&
      kind !== "project_area_csv" &&
      kind !== "ddu_revenue" &&
      kind !== "ddu-revenue" &&
      kind !== "sales_plan_csv" &&
      kind !== "project_value" &&
      kind !== "project-value" &&
      kind !== "project_value_csv" &&
      kind !== "apartment_plan" &&
      kind !== "apartment-plan" &&
      kind !== "apartment_plan_csv" &&
      kind !== "average_price_per_sqm" &&
      kind !== "average-price-per-sqm" &&
      kind !== "avg_price_per_sqm" &&
      kind !== "average_price_csv" &&
      kind !== "total_area" &&
      kind !== "total-area" &&
      kind !== "total_area_csv" &&
      kind !== "общая_площадь" &&
      kind !== "reduced_area" &&
      kind !== "reduced-area" &&
      kind !== "reduced_area_csv" &&
      kind !== "reduced_area_analytics" &&
      kind !== "приведенная_площадь" &&
      kind !== "приведенная-площадь"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Ожидался query kind (investors, segment_execution, installment_forecast, ddu_revenue, project_value, apartment_plan, …).",
        },
        { status: 400 },
      );
    }

    const kindNorm = normalizeMarketingImportKind(kind);
    if (
      kindNorm === "installment_forecast" ||
      kindNorm === "installment_area" ||
      kindNorm === "ddu_revenue" ||
      kindNorm === "project_value" ||
      kindNorm === "apartment_plan" ||
      kindNorm === "average_price_per_sqm" ||
      kindNorm === "total_area" ||
      kindNorm === "reduced_area"
    ) {
      await deleteMarketingImportFile(safeProjectId, kindNorm);
      const presence = await computePresence(safeProjectId);
      return NextResponse.json({ ok: true, projectId: safeProjectId, kind: kindNorm, presence });
    }

    if (kind === "investors") {
      for (const p of [
        marketingProjectInvestorsJsonPath(safeProjectId),
        marketingProjectInvestorsRawCsvPath(safeProjectId),
      ]) {
        try {
          await unlink(p);
        } catch {
          /* ignore */
        }
      }
    } else if (kind === "segment_execution" || kind === "segment-execution" || kind === "execution_segments") {
      for (const p of [
        marketingProjectSegmentExecutionJsonPath(safeProjectId),
        marketingProjectSegmentExecutionRawCsvPath(safeProjectId),
      ]) {
        try {
          await unlink(p);
        } catch {
          /* ignore */
        }
      }
    } else if (kind === "receipts_plan_fact" || kind === "receipts-plan-fact" || kind === "plan_vs_fact") {
      for (const p of [
        marketingProjectReceiptsPlanFactJsonPath(safeProjectId),
        marketingProjectReceiptsPlanFactRawCsvPath(safeProjectId),
      ]) {
        try {
          await unlink(p);
        } catch {
          /* ignore */
        }
      }
    } else if (
      kind === "marketing_leads" ||
      kind === "marketing-leads" ||
      kind === "leads_csv" ||
      kind === "лиды"
    ) {
      for (const p of [
        marketingProjectLeadsCsvJsonPath(safeProjectId),
        marketingProjectLeadsCsvRawPath(safeProjectId),
      ]) {
        try {
          await unlink(p);
        } catch {
          /* ignore */
        }
      }
    } else if (kind === "apartments" || kind === "apartments_csv") {
      for (const p of [
        marketingProjectApartmentsJsonPath(safeProjectId),
        marketingProjectApartmentsRawCsvPath(safeProjectId),
      ]) {
        try {
          await unlink(p);
        } catch {
          /* ignore */
        }
      }
    } else if (kind === "parking" || kind === "parking_csv") {
      for (const p of [
        marketingProjectParkingJsonPath(safeProjectId),
        marketingProjectParkingRawCsvPath(safeProjectId),
      ]) {
        try {
          await unlink(p);
        } catch {
          /* ignore */
        }
      }
    } else if (
      kind === "storages" ||
      kind === "storages_csv" ||
      kind === "storage" ||
      kind === "storage_csv"
    ) {
      for (const p of [
        marketingProjectStoragesJsonPath(safeProjectId),
        marketingProjectStoragesRawCsvPath(safeProjectId),
      ]) {
        try {
          await unlink(p);
        } catch {
          /* ignore */
        }
      }
    } else if (
      kind === "revenue_fact" ||
      kind === "revenue-fact" ||
      kind === "sales_structure_revenue" ||
      kind === "structure_revenue_fact"
    ) {
      for (const p of [
        marketingProjectRevenueFactJsonPath(safeProjectId),
        marketingProjectRevenueFactRawCsvPath(safeProjectId),
      ]) {
        try {
          await unlink(p);
        } catch {
          /* ignore */
        }
      }
    } else {
      for (const p of [
        marketingProjectUnitsExecutionJsonPath(safeProjectId),
        marketingProjectUnitsExecutionRawCsvPath(safeProjectId),
      ]) {
        try {
          await unlink(p);
        } catch {
          /* ignore */
        }
      }
    }

    const deleteKind = normalizeMarketingImportKind(kind);
    if (deleteKind) {
      await deleteAnalyticsCsv(deleteKind);
    }

    const presence = await computePresence(safeProjectId);
    return NextResponse.json(
      { ok: true, projectId: safeProjectId, kind, presence },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
