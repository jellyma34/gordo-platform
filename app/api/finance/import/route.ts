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
  return path.join(dir, `finance-budget-import-${safeProjectSegment(projectId)}.json`);
}

/** GET — последний сохранённый снимок бюджета для проекта. */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId") ?? "default";
  try {
    const raw = await readFile(filePath(projectId), "utf-8");
    const parsed = JSON.parse(raw) as {
      lines?: unknown;
      items?: unknown;
      updatedAt?: string;
      importMeta?: unknown;
    };
    const lines = Array.isArray(parsed?.lines)
      ? parsed.lines
      : Array.isArray(parsed?.items)
        ? parsed.items
        : [];
    return NextResponse.json({
      lines,
      updatedAt: parsed?.updatedAt ?? null,
      importMeta: parsed?.importMeta ?? null,
    });
  } catch {
    return NextResponse.json({ lines: [], updatedAt: null, importMeta: null }, { status: 200 });
  }
}

/** POST — сохранить снимок бюджета (импорт CSV / сохранение). */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      lines?: unknown;
      items?: unknown;
      updatedAt?: string;
      importMeta?: unknown;
    };
    const projectId = body.projectId ?? "default";
    const lines = Array.isArray(body.lines) ? body.lines : body.items;
    if (!Array.isArray(lines)) {
      return NextResponse.json({ ok: false, error: "lines must be an array" }, { status: 400 });
    }

    const dir = path.join(process.cwd(), "data");
    await mkdir(dir, { recursive: true });

    const payload = JSON.stringify(
      {
        projectId,
        lines,
        updatedAt: body.updatedAt ?? new Date().toISOString(),
        importMeta: body.importMeta ?? null,
      },
      null,
      0,
    );

    await writeFile(filePath(projectId), payload, "utf-8");
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/finance/import] POST failed:", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
