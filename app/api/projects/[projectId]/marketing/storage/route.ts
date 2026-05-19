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
import { parseMarketingLeadsCsv, parseStoredMarketingLeadsCsv } from "@/lib/marketingLeadsCsv";
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
  marketingProjectUnitsExecutionJsonPath,
  marketingProjectUnitsExecutionRawCsvPath,
} from "@/lib/marketingProjectMarketingStoragePaths";
import {
  marketingSalesPlanExecutionJsonPath,
  normalizeMarketingSalesPlanExecutionDoc,
  sanitizeMarketingSalesPlanExecutionProjectId,
} from "@/lib/marketingSalesPlanExecutionStore";
import { readInvestorsCsvFileAsText, readMarketingCsvFileAsText } from "@/src/shared/lib/csv/parseInvestorsCsv";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ projectId: string }> };

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
};

async function readJsonInvestorsDoc(
  projectId: string,
): Promise<ReturnType<typeof parseStoredMarketingInvestorsCsv>> {
  try {
    const raw = await readFile(marketingProjectInvestorsJsonPath(projectId), "utf-8");
    return parseStoredMarketingInvestorsCsv(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

async function readJsonUnitsDoc(
  projectId: string,
): Promise<ReturnType<typeof parseStoredMarketingUnitsExecutionCsv>> {
  try {
    const raw = await readFile(marketingProjectUnitsExecutionJsonPath(projectId), "utf-8");
    const doc = parseStoredMarketingUnitsExecutionCsv(JSON.parse(raw) as unknown);
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
  try {
    const raw = await readFile(marketingProjectApartmentsJsonPath(projectId), "utf-8");
    return parseStoredMarketingApartmentsCsv(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

async function readJsonParkingDoc(
  projectId: string,
): Promise<ReturnType<typeof parseStoredMarketingParkingCsv>> {
  try {
    const raw = await readFile(marketingProjectParkingJsonPath(projectId), "utf-8");
    return parseStoredMarketingParkingCsv(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

async function readJsonStoragesDoc(
  projectId: string,
): Promise<ReturnType<typeof parseStoredMarketingStoragesCsv>> {
  try {
    const raw = await readFile(marketingProjectStoragesJsonPath(projectId), "utf-8");
    return parseStoredMarketingStoragesCsv(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

async function readJsonReceiptsPlanFactDoc(
  projectId: string,
): Promise<ReturnType<typeof parseStoredMarketingReceiptsPlanFactCsv>> {
  try {
    const raw = await readFile(marketingProjectReceiptsPlanFactJsonPath(projectId), "utf-8");
    return parseStoredMarketingReceiptsPlanFactCsv(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

async function readJsonMarketingLeadsDoc(
  projectId: string,
): Promise<ReturnType<typeof parseStoredMarketingLeadsCsv>> {
  try {
    const raw = await readFile(marketingProjectLeadsCsvJsonPath(projectId), "utf-8");
    return parseStoredMarketingLeadsCsv(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

async function readJsonSegmentExecutionDoc(
  projectId: string,
): Promise<ReturnType<typeof parseStoredMarketingSegmentExecutionCsv>> {
  try {
    const raw = await readFile(marketingProjectSegmentExecutionJsonPath(projectId), "utf-8");
    return parseStoredMarketingSegmentExecutionCsv(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
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
  };
}

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { projectId: raw } = await ctx.params;
  const safeProjectId = sanitizeMarketingPaymentPlanProjectId(raw ?? "default");
  const presence = await computePresence(safeProjectId);
  const [investors, segmentExecution, unitsExecution, apartments, parking, storages, receiptsPlanFact, marketingLeads] =
    await Promise.all([
    readJsonInvestorsDoc(safeProjectId),
    readJsonSegmentExecutionDoc(safeProjectId),
    readJsonUnitsDoc(safeProjectId),
    readJsonApartmentsDoc(safeProjectId),
    readJsonParkingDoc(safeProjectId),
    readJsonStoragesDoc(safeProjectId),
    readJsonReceiptsPlanFactDoc(safeProjectId),
    readJsonMarketingLeadsDoc(safeProjectId),
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
        hasSegmentPlan: parsed.hasSegmentPlan,
        planTotal: parsed.planTotal,
        totalFact: parsed.totalFact,
        warnings: parsed.warnings,
      };
      await writeFile(marketingProjectSegmentExecutionJsonPath(safeProjectId), JSON.stringify(doc, null, 0), "utf-8");
      await writeFile(marketingProjectSegmentExecutionRawCsvPath(safeProjectId), text, "utf-8");
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
        deals: parsed.tables.deals,
        warnings: parsed.warnings,
      };
      await writeFile(marketingProjectLeadsCsvJsonPath(safeProjectId), JSON.stringify(doc, null, 0), "utf-8");
      await writeFile(marketingProjectLeadsCsvRawPath(safeProjectId), text, "utf-8");
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
      const presence = await computePresence(safeProjectId);
      return NextResponse.json({
        ok: true,
        projectId: safeProjectId,
        kind: "parking",
        doc,
        presence,
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
      const presence = await computePresence(safeProjectId);
      return NextResponse.json({
        ok: true,
        projectId: safeProjectId,
        kind: "storages",
        doc,
        presence,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          "Укажите kind=investors, kind=segment_execution, kind=receipts_plan_fact, kind=marketing_leads, kind=units_execution, kind=apartments, kind=parking или kind=storages.",
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
      kind !== "лиды"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Ожидался query kind=investors, kind=segment_execution, kind=receipts_plan_fact, kind=marketing_leads, kind=units_execution, kind=apartments, kind=parking или kind=storages.",
        },
        { status: 400 },
      );
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
