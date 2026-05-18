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
  parseSalesUnitsExecutionCsv,
  parseStoredMarketingUnitsExecutionCsv,
} from "@/lib/marketingUnitsExecutionCsv";
import {
  marketingProjectInvestorsJsonPath,
  marketingProjectInvestorsRawCsvPath,
  marketingProjectMarketingDir,
  marketingProjectSegmentExecutionJsonPath,
  marketingProjectSegmentExecutionRawCsvPath,
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
  hasExecutionPlan: boolean;
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
    return parseStoredMarketingUnitsExecutionCsv(JSON.parse(raw) as unknown);
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

  return {
    hasPlan,
    hasFact,
    hasInvestors: inv != null,
    hasSegmentExecution: seg != null && seg.planFactRows.length > 0,
    hasUnitsExecution: u != null && u.segments.length > 0,
    hasExecutionPlan,
  };
}

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { projectId: raw } = await ctx.params;
  const safeProjectId = sanitizeMarketingPaymentPlanProjectId(raw ?? "default");
  const presence = await computePresence(safeProjectId);
  const [investors, segmentExecution, unitsExecution] = await Promise.all([
    readJsonInvestorsDoc(safeProjectId),
    readJsonSegmentExecutionDoc(safeProjectId),
    readJsonUnitsDoc(safeProjectId),
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

    if (kind === "units_execution" || kind === "units-execution" || kind === "units") {
      const text = await readMarketingCsvFileAsText(file as File);
      const parsed = parseSalesUnitsExecutionCsv(text);
      if (!parsed.ok) {
        return NextResponse.json({ ok: false, error: parsed.error, warnings: parsed.warnings ?? [] }, { status: 400 });
      }
      const doc = {
        v: 1 as const,
        updatedAt,
        uploadedBy,
        fileName,
        reportDateYmd: parsed.reportDateYmd,
        segments: parsed.segments,
        totals: parsed.totals,
        warnings: parsed.warnings,
      };
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

    return NextResponse.json(
      { ok: false, error: "Укажите kind=investors, kind=segment_execution или kind=units_execution." },
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
      kind !== "units"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "Ожидался query kind=investors, kind=segment_execution или kind=units_execution.",
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
