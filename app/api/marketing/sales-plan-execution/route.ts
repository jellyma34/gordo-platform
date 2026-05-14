import { mkdir, readFile, unlink, writeFile } from "fs/promises";

import { NextRequest, NextResponse } from "next/server";

import { emptySalesPlanExecutionDataset } from "@/lib/marketingSalesPlanExecutionTable";
import {
  MARKETING_SALES_PLAN_EXECUTION_DIR,
  marketingSalesPlanExecutionJsonPath,
  marketingSalesPlanExecutionRawCsvPath,
  marketingSalesPlanExecutionProjectIdFromEnv,
  normalizeMarketingSalesPlanExecutionDoc,
  sanitizeMarketingSalesPlanExecutionProjectId,
  type MarketingSalesPlanExecutionDocV1,
  type MarketingSalesPlanExecutionMeta,
} from "@/lib/marketingSalesPlanExecutionStore";
import {
  decodeSalesPlanExecutionCsvBytes,
  parseSalesPlanExecutionCsv,
} from "@/lib/salesPlanExecutionCsv";

export const runtime = "nodejs";

async function readDoc(
  projectId: string,
): Promise<MarketingSalesPlanExecutionDocV1 | null> {
  try {
    const raw = await readFile(
      marketingSalesPlanExecutionJsonPath(projectId),
      "utf-8",
    );
    const p = JSON.parse(raw) as unknown;
    return normalizeMarketingSalesPlanExecutionDoc(p);
  } catch {
    return null;
  }
}

async function readCsvFallback(projectId: string, reportFallbackYmd: string) {
  try {
    const buf = await readFile(marketingSalesPlanExecutionRawCsvPath(projectId));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const text = decodeSalesPlanExecutionCsvBytes(ab);
    const parsed = parseSalesPlanExecutionCsv(text, reportFallbackYmd);
    if (!parsed.ok) {
      return {
        ok: false as const,
        error: parsed.error,
        warnings: parsed.warnings ?? [],
      };
    }
    return {
      ok: true as const,
      dataset: parsed.dataset,
      warnings: parsed.warnings,
    };
  } catch {
    return null;
  }
}

async function persistDoc(
  projectId: string,
  doc: MarketingSalesPlanExecutionDocV1,
  rawCsv: string | null,
): Promise<void> {
  const safe = sanitizeMarketingSalesPlanExecutionProjectId(projectId);
  await mkdir(MARKETING_SALES_PLAN_EXECUTION_DIR, { recursive: true });
  await writeFile(
    marketingSalesPlanExecutionJsonPath(safe),
    JSON.stringify(doc, null, 0),
    "utf-8",
  );
  if (rawCsv === null) {
    try {
      await unlink(marketingSalesPlanExecutionRawCsvPath(safe));
    } catch {
      /* ignore */
    }
  } else {
    await writeFile(
      marketingSalesPlanExecutionRawCsvPath(safe),
      rawCsv,
      "utf-8",
    );
  }
}

/** Исполнение плана продаж: JSON-кэш и/или сырой CSV (Верба и др.). */
export async function GET(req: NextRequest) {
  const projectId = sanitizeMarketingSalesPlanExecutionProjectId(
    req.nextUrl.searchParams.get("projectId") ??
      marketingSalesPlanExecutionProjectIdFromEnv(),
  );
  const reportFallbackYmd =
    req.nextUrl.searchParams.get("reportAsOf")?.trim() ||
    new Date().toISOString().slice(0, 10);

  const doc = await readDoc(projectId);
  if (doc) {
    return NextResponse.json(
      {
        ok: true,
        projectId,
        source: "json" as const,
        dataset: doc.dataset,
        meta: doc.meta,
        warnings: doc.parseWarnings ?? [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const csvRes = await readCsvFallback(projectId, reportFallbackYmd);
  if (csvRes?.ok) {
    return NextResponse.json(
      {
        ok: true,
        projectId,
        source: "csv" as const,
        dataset: csvRes.dataset,
        meta: null,
        warnings: csvRes.warnings,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  if (csvRes && !csvRes.ok) {
    return NextResponse.json(
      {
        ok: false,
        projectId,
        error: csvRes.error,
        warnings: csvRes.warnings,
        dataset: emptySalesPlanExecutionDataset(reportFallbackYmd),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      projectId,
      source: "empty" as const,
      dataset: emptySalesPlanExecutionDataset(reportFallbackYmd),
      meta: null,
      warnings: [] as string[],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: NextRequest) {
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (!ct.includes("multipart/form-data")) {
      return NextResponse.json(
        { ok: false, error: "Ожидается multipart/form-data с полем file." },
        { status: 400 },
      );
    }
    const form = await req.formData();
    const file = form.get("file");
    const projectId = sanitizeMarketingSalesPlanExecutionProjectId(
      String(form.get("projectId") ?? "default"),
    );
    const uploadedBy = String(form.get("uploadedBy") ?? "").trim() || "—";
    const reportFallbackYmd =
      String(form.get("reportAsOf") ?? "").trim() ||
      new Date().toISOString().slice(0, 10);

    if (!(file instanceof Blob)) {
      return NextResponse.json(
        { ok: false, error: "Нужно поле file" },
        { status: 400 },
      );
    }

    const buf = await file.arrayBuffer();
    const text = decodeSalesPlanExecutionCsvBytes(buf);
    const parsed = parseSalesPlanExecutionCsv(text, reportFallbackYmd);
    if (!parsed.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: parsed.error,
          warnings: parsed.warnings ?? [],
          dataset: emptySalesPlanExecutionDataset(reportFallbackYmd),
          meta: null,
        },
        { status: 200 },
      );
    }

    const uploadedAt = new Date().toISOString();
    const fileName = (file as File).name?.trim() || "sales-plan-execution.csv";
    const meta: MarketingSalesPlanExecutionMeta = {
      fileName,
      uploadedAt,
      uploadedBy,
    };

    const doc: MarketingSalesPlanExecutionDocV1 = {
      v: 1,
      projectId,
      updatedAt: uploadedAt,
      meta,
      dataset: parsed.dataset,
      parseWarnings: parsed.warnings.length ? parsed.warnings : undefined,
    };

    await persistDoc(projectId, doc, text);
    return NextResponse.json({
      ok: true,
      dataset: doc.dataset,
      meta: doc.meta,
      warnings: parsed.warnings,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const projectId = sanitizeMarketingSalesPlanExecutionProjectId(
    req.nextUrl.searchParams.get("projectId") ??
      marketingSalesPlanExecutionProjectIdFromEnv(),
  );
  const reportFallbackYmd = new Date().toISOString().slice(0, 10);
  for (const p of [
    marketingSalesPlanExecutionJsonPath(projectId),
    marketingSalesPlanExecutionRawCsvPath(projectId),
  ]) {
    try {
      await unlink(p);
    } catch {
      /* ignore */
    }
  }
  return NextResponse.json({
    ok: true,
    projectId,
    dataset: emptySalesPlanExecutionDataset(reportFallbackYmd),
  });
}
