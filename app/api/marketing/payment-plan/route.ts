import { mkdir, readFile, unlink, writeFile } from "fs/promises";

import {
  PAYMENT_CSV_FACT_MAPPING_REQUIRED_RU,
  decodePaymentFactInflowCsvBuffer,
  decodePaymentScheduleCsvBuffer,
  parseFactCsv,
  parsePlanCsv,
} from "@/lib/paymentScheduleCsv";
import {
  MARKETING_PAYMENT_PLAN_DIR,
  marketingPaymentPlanJsonPath,
  marketingPaymentPlanRawCsvPath,
  marketingPaymentPlanRawFactCsvPath,
  marketingPaymentPlanRawPlanCsvPath,
  normalizeMarketingPaymentPlanDoc,
  sanitizeMarketingPaymentPlanProjectId,
  type MarketingPaymentPlanFileV2,
  type MarketingPaymentPlanMeta,
} from "@/lib/marketingPaymentPlanStore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function emptyDoc(safeId: string, updatedAt: string): MarketingPaymentPlanFileV2 {
  return {
    v: 2,
    projectId: safeId,
    updatedAt,
    planByPeriodKey: {},
    factByPeriodKey: null,
    factUnavailableReason: PAYMENT_CSV_FACT_MAPPING_REQUIRED_RU,
    columnPeriodKeysPlan: [],
    columnPeriodKeysFact: [],
    zaydetColumnDebug: [],
    zaydetMonthVerify: [],
    meta: { fileName: "—", uploadedAt: updatedAt, uploadedBy: "—" },
    planMeta: null,
    factMeta: null,
  };
}

function primaryMeta(doc: MarketingPaymentPlanFileV2): MarketingPaymentPlanMeta {
  return doc.planMeta ?? doc.factMeta ?? doc.meta;
}

async function readPlanDoc(projectId: string): Promise<MarketingPaymentPlanFileV2 | null> {
  try {
    const raw = await readFile(marketingPaymentPlanJsonPath(projectId), "utf-8");
    const p = JSON.parse(raw) as unknown;
    return normalizeMarketingPaymentPlanDoc(p);
  } catch {
    return null;
  }
}

async function persistDoc(
  projectId: string,
  doc: MarketingPaymentPlanFileV2,
  raw: { plan?: string | null; fact?: string | null },
): Promise<MarketingPaymentPlanFileV2> {
  const safeId = sanitizeMarketingPaymentPlanProjectId(projectId);
  await mkdir(MARKETING_PAYMENT_PLAN_DIR, { recursive: true });
  const out: MarketingPaymentPlanFileV2 = {
    ...doc,
    projectId: safeId,
    meta: primaryMeta(doc),
  };
  await writeFile(marketingPaymentPlanJsonPath(safeId), JSON.stringify(out, null, 0), "utf-8");

  if (raw.plan !== undefined) {
    if (raw.plan === null) {
      try {
        await unlink(marketingPaymentPlanRawPlanCsvPath(safeId));
      } catch {
        /* ignore */
      }
    } else {
      await writeFile(marketingPaymentPlanRawPlanCsvPath(safeId), raw.plan, "utf-8");
    }
  }
  if (raw.fact !== undefined) {
    if (raw.fact === null) {
      try {
        await unlink(marketingPaymentPlanRawFactCsvPath(safeId));
      } catch {
        /* ignore */
      }
    } else {
      await writeFile(marketingPaymentPlanRawFactCsvPath(safeId), raw.fact, "utf-8");
    }
  }
  return out;
}

async function deleteAllPlanFiles(safeId: string): Promise<void> {
  for (const p of [
    marketingPaymentPlanJsonPath(safeId),
    marketingPaymentPlanRawCsvPath(safeId),
    marketingPaymentPlanRawPlanCsvPath(safeId),
    marketingPaymentPlanRawFactCsvPath(safeId),
  ]) {
    try {
      await unlink(p);
    } catch {
      /* ignore */
    }
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
  factByPeriodKey?: Record<string, number> | null;
  meta?: Partial<MarketingPaymentPlanMeta>;
  factMeta?: Partial<MarketingPaymentPlanMeta> | null;
};

export async function POST(req: NextRequest) {
  try {
    const ct = req.headers.get("content-type") ?? "";

    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const kindRaw = String(form.get("kind") ?? form.get("uploadKind") ?? "").toLowerCase();
      const projectId = sanitizeMarketingPaymentPlanProjectId(String(form.get("projectId") ?? "default"));
      const uploadedBy = String(form.get("uploadedBy") ?? "").trim() || "—";

      if (!(file instanceof Blob)) {
        return NextResponse.json({ ok: false, error: "Нужно поле file" }, { status: 400 });
      }
      if (kindRaw !== "plan" && kindRaw !== "fact") {
        return NextResponse.json(
          { ok: false, error: "Укажите kind=plan или kind=fact (отдельные CSV для плана и факта)." },
          { status: 400 },
        );
      }

      const buf = await file.arrayBuffer();
      const fileName = (file as File).name?.trim() || (kindRaw === "plan" ? "plan.csv" : "fact.csv");
      const uploadedAt = new Date().toISOString();
      const fileMeta: MarketingPaymentPlanMeta = { fileName, uploadedAt, uploadedBy };

      const prev = (await readPlanDoc(projectId)) ?? emptyDoc(projectId, uploadedAt);
      const safeId = sanitizeMarketingPaymentPlanProjectId(projectId);
      const updatedAt = uploadedAt;

      if (kindRaw === "plan") {
        const text = decodePaymentScheduleCsvBuffer(buf);
        const res = parsePlanCsv(text);
        if (!res.ok) {
          return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
        }
        const doc: MarketingPaymentPlanFileV2 = {
          ...prev,
          v: 2,
          projectId: safeId,
          updatedAt,
          planByPeriodKey: res.planByPeriodKey,
          columnPeriodKeysPlan: res.columnPeriodKeysPlan,
          planMeta: fileMeta,
        };
        const saved = await persistDoc(projectId, doc, { plan: text });
        return NextResponse.json({
          ok: true,
          plan: saved,
          ...(res.warnings?.length ? { warnings: res.warnings } : {}),
        });
      }

      const text = decodePaymentFactInflowCsvBuffer(buf);
      const res = parseFactCsv(text);
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
      }
      const doc: MarketingPaymentPlanFileV2 = {
        ...prev,
        v: 2,
        projectId: safeId,
        updatedAt,
        factByPeriodKey: res.factByPeriodKey,
        factUnavailableReason: res.factUnavailableReason,
        columnPeriodKeysFact: res.columnPeriodKeysFact,
        zaydetColumnDebug: res.zaydetColumnDebug,
        zaydetMonthVerify: res.zaydetMonthVerify,
        factMeta: fileMeta,
      };
      const saved = await persistDoc(projectId, doc, { fact: text });
      return NextResponse.json({
        ok: true,
        plan: saved,
        ...(res.warnings?.length ? { warnings: res.warnings } : {}),
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
      const planMeta: MarketingPaymentPlanMeta = {
        fileName: typeof m.fileName === "string" ? m.fileName : "browser-import.csv",
        uploadedAt,
        uploadedBy: typeof m.uploadedBy === "string" ? m.uploadedBy : "Импорт из браузера",
      };
      const factKeysRaw = body.factByPeriodKey;
      const factKeys =
        factKeysRaw && typeof factKeysRaw === "object" && !Array.isArray(factKeysRaw)
          ? (factKeysRaw as Record<string, number>)
          : null;
      const factKeysSorted = factKeys
        ? Object.keys(factKeys)
            .filter((k) => /^\d{4}-\d{2}$/.test(k))
            .sort((a, b) => a.localeCompare(b))
        : [];
      const fm = body.factMeta;
      const factMeta: MarketingPaymentPlanMeta | null =
        factKeys && factKeysSorted.length > 0
          ? {
              fileName: typeof fm?.fileName === "string" ? fm.fileName : "browser-fact-import.csv",
              uploadedAt: typeof fm?.uploadedAt === "string" ? fm.uploadedAt : uploadedAt,
              uploadedBy: typeof fm?.uploadedBy === "string" ? fm.uploadedBy : "Импорт из браузера",
            }
          : null;
      const prev = await readPlanDoc(projectId);
      const base = prev ?? emptyDoc(projectId, uploadedAt);
      const doc: MarketingPaymentPlanFileV2 = {
        ...base,
        updatedAt: uploadedAt,
        planByPeriodKey: keys as Record<string, number>,
        columnPeriodKeysPlan: planKeys,
        planMeta,
        factByPeriodKey: factKeys && factKeysSorted.length > 0 ? factKeys : base.factByPeriodKey,
        factUnavailableReason:
          factKeys && factKeysSorted.length > 0
            ? null
            : base.factByPeriodKey != null && Object.keys(base.factByPeriodKey).length > 0
              ? base.factUnavailableReason
              : "Импорт из браузера: только план. Загрузите отдельный CSV факта поступлений.",
        columnPeriodKeysFact:
          factKeys && factKeysSorted.length > 0 ? factKeysSorted : (base.columnPeriodKeysFact ?? []),
        zaydetColumnDebug: base.zaydetColumnDebug ?? [],
        zaydetMonthVerify: base.zaydetMonthVerify ?? [],
        factMeta: factMeta ?? base.factMeta ?? null,
        meta: planMeta ?? factMeta ?? base.factMeta ?? base.meta,
      };
      const saved = await persistDoc(projectId, doc, {
        plan: `— Migrated from browser storage (${uploadedAt})\n`,
      });
      return NextResponse.json({ ok: true, plan: saved });
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
    const scope = (req.nextUrl.searchParams.get("scope") ?? "all").toLowerCase();
    const safeId = sanitizeMarketingPaymentPlanProjectId(projectId);

    if (scope === "all") {
      await deleteAllPlanFiles(safeId);
      return NextResponse.json({ ok: true, projectId, scope: "all" }, { headers: { "Cache-Control": "no-store" } });
    }

    const doc = await readPlanDoc(projectId);
    if (!doc) {
      return NextResponse.json({ ok: true, projectId, scope, plan: null }, { headers: { "Cache-Control": "no-store" } });
    }

    const updatedAt = new Date().toISOString();

    if (scope === "plan") {
      const next: MarketingPaymentPlanFileV2 = {
        ...doc,
        updatedAt,
        planByPeriodKey: {},
        columnPeriodKeysPlan: [],
        planMeta: null,
        meta: doc.factMeta ?? doc.meta,
      };
      const saved = await persistDoc(projectId, next, { plan: null });
      return NextResponse.json({ ok: true, projectId, scope: "plan", plan: saved }, { headers: { "Cache-Control": "no-store" } });
    }

    if (scope === "fact") {
      const next: MarketingPaymentPlanFileV2 = {
        ...doc,
        updatedAt,
        factByPeriodKey: null,
        factUnavailableReason: PAYMENT_CSV_FACT_MAPPING_REQUIRED_RU,
        columnPeriodKeysFact: [],
        zaydetColumnDebug: [],
        zaydetMonthVerify: [],
        factMeta: null,
        meta: doc.planMeta ?? doc.meta,
      };
      const saved = await persistDoc(projectId, next, { fact: null });
      return NextResponse.json({ ok: true, projectId, scope: "fact", plan: saved }, { headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({ ok: false, error: "Неизвестный scope (ожидалось all, plan или fact)." }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
