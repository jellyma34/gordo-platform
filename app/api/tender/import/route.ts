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
  return path.join(dir, `tender-import-${safeProjectSegment(projectId)}.json`);
}

/** GET — последний сохранённый снимок тендеров для проекта. */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId") ?? "default";
  try {
    const raw = await readFile(filePath(projectId), "utf-8");
    const parsed = JSON.parse(raw) as { tenders?: unknown; updatedAt?: string };
    if (!parsed || !Array.isArray(parsed.tenders)) {
      return NextResponse.json({ tenders: [], updatedAt: null }, { status: 200 });
    }
    return NextResponse.json({
      tenders: parsed.tenders,
      updatedAt: parsed.updatedAt ?? null,
    });
  } catch {
    return NextResponse.json({ tenders: [], updatedAt: null }, { status: 200 });
  }
}

/** POST — сохранить снимок (импорт CSV / сохранение реестра). */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      tenders?: unknown;
      updatedAt?: string;
    };
    const projectId = body.projectId ?? "default";
    const tenders = body.tenders;
    if (!Array.isArray(tenders)) {
      return NextResponse.json({ ok: false, error: "tenders must be an array" }, { status: 400 });
    }

    const dir = path.join(process.cwd(), "data");
    await mkdir(dir, { recursive: true });

    const payload = JSON.stringify(
      {
        projectId,
        tenders,
        updatedAt: body.updatedAt ?? new Date().toISOString(),
      },
      null,
      0,
    );

    await writeFile(filePath(projectId), payload, "utf-8");
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/tender/import] POST failed:", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
