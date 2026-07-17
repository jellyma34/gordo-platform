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
  return path.join(dir, `finance-budget-execution-import-${safeProjectSegment(projectId)}.json`);
}

/** GET — DEPRECATED: не используется фронтом как источник истины.
 * Источник истины — PostgreSQL через FastAPI `/finance/execution-imports`.
 * Роут оставлен только для ручной миграции старых файловых снимков.
 */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId") ?? "default";
  try {
    const raw = await readFile(filePath(projectId), "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ kpi: null }, { status: 200 });
  }
}

/** POST — сохранить распарсенный снимок исполнения бюджета. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const projectId =
      typeof body.projectId === "string" && body.projectId.trim()
        ? body.projectId.trim()
        : "default";

    const dir = path.join(process.cwd(), "data");
    await mkdir(dir, { recursive: true });

    const payload = {
      ...body,
      projectId,
      updatedAt:
        typeof body.updatedAt === "string" ? body.updatedAt : new Date().toISOString(),
    };

    await writeFile(filePath(projectId), JSON.stringify(payload), "utf-8");
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/finance/execution/import] POST failed:", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
