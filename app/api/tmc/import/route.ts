import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function safeProjectSegment(projectId: string): string {
  const s = String(projectId ?? "default").trim();
  const cleaned = s.replace(/[^a-zA-Z0-9\u0400-\u04FF_-]/g, "_").slice(0, 128);
  return cleaned.length > 0 ? cleaned : "default";
}

function filePath(projectId: string): string {
  const dir = path.join(process.cwd(), "data");
  return path.join(dir, `tmc-import-${safeProjectSegment(projectId)}.json`);
}

/** @deprecated FS snapshot — не SoT. Production использует FastAPI + PostgreSQL. */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId") ?? "verba-phase-1";
  console.warn("[api/tmc/import] deprecated filesystem snapshot GET — use GET /tmc?projectId=");
  try {
    const raw = await readFile(filePath(projectId), "utf-8");
    const parsed = JSON.parse(raw) as { items?: unknown; updatedAt?: string };
    if (!parsed || !Array.isArray(parsed.items)) {
      return NextResponse.json({ items: [], updatedAt: null, deprecated: true }, { status: 200 });
    }
    return NextResponse.json({
      items: parsed.items,
      updatedAt: parsed.updatedAt ?? null,
      deprecated: true,
    });
  } catch {
    return NextResponse.json({ items: [], updatedAt: null, deprecated: true }, { status: 200 });
  }
}

/** @deprecated FS snapshot — не SoT. */
export async function POST(req: NextRequest) {
  console.warn("[api/tmc/import] deprecated filesystem snapshot POST — use POST /tmc/bulk-import");
  try {
    const body = (await req.json()) as {
      projectId?: string;
      items?: unknown;
      updatedAt?: string;
    };
    const projectId = body.projectId ?? "verba-phase-1";
    const items = body.items;
    if (!Array.isArray(items)) {
      return NextResponse.json({ ok: false, error: "items must be an array" }, { status: 400 });
    }

    const dir = path.join(process.cwd(), "data");
    await mkdir(dir, { recursive: true });

    const payload = JSON.stringify(
      {
        projectId,
        items,
        updatedAt: body.updatedAt ?? new Date().toISOString(),
      },
      null,
      0,
    );

    await writeFile(filePath(projectId), payload, "utf-8");
    return NextResponse.json({ ok: true, deprecated: true });
  } catch (e) {
    console.error("[api/tmc/import] POST failed:", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
