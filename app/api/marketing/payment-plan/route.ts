import { mkdir, readFile, unlink, writeFile } from "fs/promises";

import {
  decodePaymentScheduleCsvBuffer,
  parsePaymentScheduleCsvOrVerba,
} from "@/lib/paymentScheduleCsv";
import {
  MARKETING_PAYMENT_PLAN_DIR,
  marketingPaymentPlanJsonPath,
  marketingPaymentPlanRawCsvPath,
  sanitizeMarketingPaymentPlanProjectId,
  type MarketingPaymentPlanFileV1,
  type MarketingPaymentPlanMeta,
} from "@/lib/marketingPaymentPlanStore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

async function readPlanDoc(projectId: string): Promise<MarketingPaymentPlanFileV1 | null> {
  try {
    const raw = await readFile(marketingPaymentPlanJsonPath(projectId), "utf-8");
    const p = JSON.parse(raw) as MarketingPaymentPlanFileV1;
    if (p?.v !== 1 || !p.byPeriodKey || typeof p.byPeriodKey !== "object" || !p.meta) return null;
    return p;
  } catch {
    return null;
  }
}

async function writePlan(
  projectId: string,
  byPeriodKey: Record<string, number>,
  meta: MarketingPaymentPlanMeta,
  rawCsvText: string | null,
): Promise<MarketingPaymentPlanFileV1> {
  const safeId = sanitizeMarketingPaymentPlanProjectId(projectId);
  await mkdir(MARKETING_PAYMENT_PLAN_DIR, { recursive: true });

  const updatedAt = new Date().toISOString();
  const doc: MarketingPaymentPlanFileV1 = {
    v: 1,
    projectId: safeId,
    updatedAt,
    byPeriodKey,
    meta: {
      fileName: meta.fileName,
      uploadedAt: meta.uploadedAt || updatedAt,
      uploadedBy: meta.uploadedBy || "—",
    },
  };
  await writeFile(marketingPaymentPlanJsonPath(safeId), JSON.stringify(doc, null, 0), "utf-8");
  if (rawCsvText != null) {
    await writeFile(marketingPaymentPlanRawCsvPath(safeId), rawCsvText, "utf-8");
  }
  return doc;
}

async function deletePlanFiles(projectId: string): Promise<void> {
  const safeId = sanitizeMarketingPaymentPlanProjectId(projectId);
  try {
    await unlink(marketingPaymentPlanJsonPath(safeId));
  } catch {
    /* ignore */
  }
  try {
    await unlink(marketingPaymentPlanRawCsvPath(safeId));
  } catch {
    /* ignore */
  }
}

/** Текущий график платежей по проекту (общий для всех пользователей инстанса). */
export async function GET(req: NextRequest) {
  const projectId = sanitizeMarketingPaymentPlanProjectId(req.nextUrl.searchParams.get("projectId") ?? "default");
  const doc = await readPlanDoc(projectId);
  return NextResponse.json(
    {
      ok: true,
      projectId,
      plan: doc,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

type MigrateJsonBody = {
  projectId?: string;
  migrateFromBrowser?: boolean;
  byPeriodKey?: Record<string, number>;
  meta?: Partial<MarketingPaymentPlanMeta>;
};

export async function POST(req: NextRequest) {
  try {
    const ct = req.headers.get("content-type") ?? "";

    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const projectId = sanitizeMarketingPaymentPlanProjectId(String(form.get("projectId") ?? "default"));
      const uploadedBy = String(form.get("uploadedBy") ?? "").trim() || "—";

      if (!(file instanceof Blob)) {
        return NextResponse.json({ ok: false, error: "Нужно поле file" }, { status: 400 });
      }

      const buf = await file.arrayBuffer();
      const text = decodePaymentScheduleCsvBuffer(buf);
      const res = parsePaymentScheduleCsvOrVerba(text);
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
      }

      const fileName = (file as File).name?.trim() || "schedule.csv";
      const uploadedAt = new Date().toISOString();
      const doc = await writePlan(
        projectId,
        res.byPeriodKey,
        { fileName, uploadedAt, uploadedBy },
        text,
      );

      return NextResponse.json({
        ok: true,
        plan: doc,
      });
    }

    if (ct.includes("application/json")) {
      const body = (await req.json().catch(() => null)) as MigrateJsonBody | null;
      if (!body || body.migrateFromBrowser !== true) {
        return NextResponse.json({ ok: false, error: "Ожидался migrateFromBrowser: true" }, { status: 400 });
      }
      const projectId = sanitizeMarketingPaymentPlanProjectId(String(body.projectId ?? "default"));
      const keys = body.byPeriodKey;
      if (!keys || typeof keys !== "object" || Object.keys(keys).length === 0) {
        return NextResponse.json({ ok: false, error: "Пустой byPeriodKey" }, { status: 400 });
      }
      const m = body.meta ?? {};
      const uploadedAt = typeof m.uploadedAt === "string" ? m.uploadedAt : new Date().toISOString();
      const doc = await writePlan(
        projectId,
        keys as Record<string, number>,
        {
          fileName: typeof m.fileName === "string" ? m.fileName : "browser-import.csv",
          uploadedAt,
          uploadedBy: typeof m.uploadedBy === "string" ? m.uploadedBy : "Импорт из браузера",
        },
        `— Migrated from browser storage (${uploadedAt})\n`,
      );
      return NextResponse.json({ ok: true, plan: doc });
    }

    return NextResponse.json({ ok: false, error: "Ожидался multipart/form-data или JSON" }, { status: 415 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const projectId = sanitizeMarketingPaymentPlanProjectId(req.nextUrl.searchParams.get("projectId") ?? "default");
    await deletePlanFiles(projectId);
    return NextResponse.json({ ok: true, projectId }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
