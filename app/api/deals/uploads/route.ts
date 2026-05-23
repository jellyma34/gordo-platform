import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";

import { dedupeDealExportRows } from "@/lib/marketingDealsDedupe";
import { dealsRawRowsFromJson } from "@/lib/marketingDealsInputShape";
import {
  MARKETING_DEALS_CURRENT_FILE,
  MARKETING_DEALS_SNAPS_DIR,
  MARKETING_DEALS_VERSION_HISTORY_MAX,
  MARKETING_DEALS_VERSIONS_FILE,
  type MarketingDealVersionMeta,
  type MarketingDealsCurrentFileBody,
  type MarketingDealsVersionsFileBody,
} from "@/lib/marketingDealsPersistencePaths";
import { NextRequest, NextResponse } from "next/server";

async function readJsonSafe<T>(pathStr: string): Promise<T | null> {
  try {
    const raw = await readFile(pathStr, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function readCurrentPayload(): Promise<unknown | null> {
  const cur = await readJsonSafe<MarketingDealsCurrentFileBody>(MARKETING_DEALS_CURRENT_FILE);
  return cur?.payload ?? null;
}

async function readVersionsDoc(): Promise<MarketingDealsVersionsFileBody> {
  const v = await readJsonSafe<MarketingDealsVersionsFileBody>(MARKETING_DEALS_VERSIONS_FILE);
  if (v && Array.isArray(v.entries)) return v;
  return { entries: [] };
}

function newVersionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function persistSnapshot(meta: MarketingDealVersionMeta, body: MarketingDealsCurrentFileBody) {
  await mkdir(MARKETING_DEALS_SNAPS_DIR, { recursive: true });
  await writeFile(path.join(MARKETING_DEALS_SNAPS_DIR, `${meta.id}.json`), JSON.stringify(body, null, 0), "utf-8");
}

async function pruneOldSnapshots(entries: MarketingDealVersionMeta[]): Promise<MarketingDealVersionMeta[]> {
  if (entries.length <= MARKETING_DEALS_VERSION_HISTORY_MAX) return entries;
  const drop = entries.slice(0, entries.length - MARKETING_DEALS_VERSION_HISTORY_MAX);
  const keep = entries.slice(entries.length - MARKETING_DEALS_VERSION_HISTORY_MAX);
  for (const e of drop) {
    try {
      await unlink(path.join(MARKETING_DEALS_SNAPS_DIR, `${e.id}.json`));
    } catch {
      /* ignore */
    }
  }
  return keep;
}

function mergeDealPayload(existing: unknown, incoming: unknown, mode: "replace" | "append"): unknown {
  if (mode === "replace") return incoming;
  const a = dealsRawRowsFromJson(existing ?? []);
  const b = dealsRawRowsFromJson(incoming ?? []);
  return dedupeDealExportRows([...a, ...b]);
}

export const runtime = "nodejs";

/** Список загрузок + метаданные текущего локального набора */
export async function GET() {
  const doc = await readVersionsDoc();
  const current = await readJsonSafe<MarketingDealsCurrentFileBody>(MARKETING_DEALS_CURRENT_FILE);
  return NextResponse.json(
    {
      versions: [...doc.entries].reverse(),
      currentUpdatedAt: current?.updatedAt ?? null,
      hasLocalDataset: Boolean(current?.payload != null),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

type UploadBody = {
  payload: unknown;
  mode?: "replace" | "append";
};

/** Сохранить выгрузку (replace | append к текущей локальной) */
export async function POST(req: NextRequest) {
  try {
    const bodyUnknown: unknown = await req.json().catch(() => null);
    if (bodyUnknown == null || typeof bodyUnknown !== "object") {
      return NextResponse.json({ ok: false, error: "Некорректное тело запроса" }, { status: 400 });
    }
    const body = bodyUnknown as UploadBody;
    const mode = body.mode === "append" ? "append" : "replace";
    if (body.payload === undefined) {
      return NextResponse.json({ ok: false, error: "Поле payload обязательно" }, { status: 400 });
    }

    const rawIncoming = dealsRawRowsFromJson(body.payload);
    if (!Array.isArray(rawIncoming)) {
      return NextResponse.json({ ok: false, error: "Ожидался объект с массивом сделок или { data: [...] }" }, { status: 400 });
    }

    await mkdir(path.dirname(MARKETING_DEALS_CURRENT_FILE), { recursive: true });

    const prevPayload = await readCurrentPayload();
    const mergedPayload = mergeDealPayload(mode === "append" ? prevPayload ?? [] : [], body.payload, mode);

    const rows = dealsRawRowsFromJson(mergedPayload);

    const id = newVersionId();
    const savedAt = new Date().toISOString();
    const meta: MarketingDealVersionMeta = { id, savedAt, mode, rowCount: rows.length };

    const nextDoc: MarketingDealsCurrentFileBody = { updatedAt: savedAt, payload: mergedPayload };
    await persistSnapshot(meta, nextDoc);

    let vdoc = await readVersionsDoc();
    vdoc.entries.push(meta);
    vdoc.entries = await pruneOldSnapshots(vdoc.entries);
    await writeFile(MARKETING_DEALS_VERSIONS_FILE, JSON.stringify(vdoc, null, 2), "utf-8");

    await writeFile(MARKETING_DEALS_CURRENT_FILE, JSON.stringify(nextDoc, null, 0), "utf-8");

    return NextResponse.json({ ok: true, versionId: id, updatedAt: savedAt, rowCount: rows.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

type RollbackBody = { versionId: string };

/** Восстановить снимок по id версии из history */
export async function PUT(req: NextRequest) {
  try {
    const bodyUnknown: unknown = await req.json().catch(() => null);
    if (bodyUnknown == null || typeof bodyUnknown !== "object" || !("versionId" in bodyUnknown)) {
      return NextResponse.json({ ok: false, error: "Нужно { versionId: string }" }, { status: 400 });
    }
    const { versionId } = bodyUnknown as RollbackBody;
    if (!versionId || typeof versionId !== "string") {
      return NextResponse.json({ ok: false, error: "Некорректный versionId" }, { status: 400 });
    }

    const snapPath = path.join(MARKETING_DEALS_SNAPS_DIR, `${versionId}.json`);
    const snap = await readJsonSafe<MarketingDealsCurrentFileBody>(snapPath);
    if (!snap?.payload) {
      return NextResponse.json({ ok: false, error: "Версия не найдена" }, { status: 404 });
    }

    snap.updatedAt = new Date().toISOString();

    const restoredRows = dealsRawRowsFromJson(snap.payload);

    await writeFile(MARKETING_DEALS_CURRENT_FILE, JSON.stringify(snap, null, 0), "utf-8");

    let vdoc = await readVersionsDoc();
    const rbMeta: MarketingDealVersionMeta = {
      id: newVersionId(),
      savedAt: snap.updatedAt,
      mode: "replace",
      rowCount: restoredRows.length,
    };
    vdoc.entries.push(rbMeta);
    vdoc.entries = await pruneOldSnapshots(vdoc.entries);
    await writeFile(MARKETING_DEALS_VERSIONS_FILE, JSON.stringify(vdoc, null, 2), "utf-8");

    await persistSnapshot(rbMeta, snap);

    return NextResponse.json({ ok: true, updatedAt: snap.updatedAt, rowCount: restoredRows.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
