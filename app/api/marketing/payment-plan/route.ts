import { mkdir, readFile, unlink, writeFile } from "fs/promises";

import {
  decodePaymentScheduleCsvBuffer,
  parseMarketingPaymentCsvStrict,
} from "@/lib/paymentScheduleCsv";
import {
  MARKETING_PAYMENT_PLAN_DIR,
  marketingPaymentPlanJsonPath,
  marketingPaymentPlanRawCsvPath,
  normalizeMarketingPaymentPlanDoc,
  sanitizeMarketingPaymentPlanProjectId,
  type MarketingPaymentPlanFileV2,
  type MarketingPaymentPlanMeta,
} from "@/lib/marketingPaymentPlanStore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

async function readPlanDoc(projectId: string): Promise<MarketingPaymentPlanFileV2 | null> {
  try {
    const raw = await readFile(marketingPaymentPlanJsonPath(projectId), "utf-8");
    const p = JSON.parse(raw) as unknown;
    return normalizeMarketingPaymentPlanDoc(p);
  } catch {
    return null;
  }
}

async function writePlan(
  projectId: string,
  fields: {
    planByPeriodKey: Record<string, number>;
    factByPeriodKey: Record<string, number> | null;
    factUnavailableReason: string | null;
    columnPeriodKeysPlan: string[];
    columnPeriodKeysFact: string[];
    zaydetColumnDebug: MarketingPaymentPlanFileV2["zaydetColumnDebug"];
    zaydetMonthVerify: MarketingPaymentPlanFileV2["zaydetMonthVerify"];
    meta: MarketingPaymentPlanMeta;
  },
  rawCsvText: string | null,
): Promise<MarketingPaymentPlanFileV2> {
  const safeId = sanitizeMarketingPaymentPlanProjectId(projectId);
  await mkdir(MARKETING_PAYMENT_PLAN_DIR, { recursive: true });

  const updatedAt = new Date().toISOString();
  const doc: MarketingPaymentPlanFileV2 = {
    v: 2,
    projectId: safeId,
    updatedAt,
    planByPeriodKey: fields.planByPeriodKey,
    factByPeriodKey: fields.factByPeriodKey,
    factUnavailableReason: fields.factUnavailableReason,
    columnPeriodKeysPlan: fields.columnPeriodKeysPlan,
    columnPeriodKeysFact: fields.columnPeriodKeysFact,
    zaydetColumnDebug: fields.zaydetColumnDebug ?? [],
    zaydetMonthVerify: fields.zaydetMonthVerify ?? [],
    meta: {
      fileName: fields.meta.fileName,
      uploadedAt: fields.meta.uploadedAt || updatedAt,
      uploadedBy: fields.meta.uploadedBy || "—",
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
      const res = parseMarketingPaymentCsvStrict(text);
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
      }

      const fileName = (file as File).name?.trim() || "schedule.csv";
      const uploadedAt = new Date().toISOString();
      const doc = await writePlan(
        projectId,
        {
          planByPeriodKey: res.planByPeriodKey,
          factByPeriodKey: res.factByPeriodKey,
          factUnavailableReason: res.factUnavailableReason,
          columnPeriodKeysPlan: res.columnPeriodKeysPlan,
          columnPeriodKeysFact: res.columnPeriodKeysFact,
          zaydetColumnDebug: res.zaydetColumnDebug,
          zaydetMonthVerify: res.zaydetMonthVerify,
          meta: { fileName, uploadedAt, uploadedBy },
        },
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
      const planKeys = Object.keys(keys)
        .filter((k) => /^\d{4}-\d{2}$/.test(k))
        .sort((a, b) => a.localeCompare(b));
      const doc = await writePlan(
        projectId,
        {
          planByPeriodKey: keys as Record<string, number>,
          factByPeriodKey: null,
          factUnavailableReason:
            "Импорт из браузера: нет колонок факта. Загрузите CSV заново для помесячных поступлений.",
          columnPeriodKeysPlan: planKeys,
          columnPeriodKeysFact: [],
          zaydetColumnDebug: [],
          zaydetMonthVerify: [],
          meta: {
            fileName: typeof m.fileName === "string" ? m.fileName : "browser-import.csv",
            uploadedAt,
            uploadedBy: typeof m.uploadedBy === "string" ? m.uploadedBy : "Импорт из браузера",
          },
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
