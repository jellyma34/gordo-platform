import { NextResponse } from "next/server";

import { getGprStorageMode } from "@/lib/gprStorageMode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function backendBase(): string {
  const raw =
    process.env.BACKEND_API_URL?.trim() ||
    process.env.API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "http://127.0.0.1:8000";
  return raw.replace(/\/$/, "");
}

/**
 * Proxy diagnostic: GET /api/admin/storage-status
 * Forwards to FastAPI /admin/storage-status (requires Bearer).
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) {
    return NextResponse.json(
      {
        database_connected: null,
        environment: process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV || "unknown",
        construction_storage: getGprStorageMode(),
        marketing_storage: "postgres",
        note: "Передайте Authorization: Bearer <token> для полного статуса БД",
      },
      { status: 200 },
    );
  }

  try {
    const res = await fetch(`${backendBase()}/admin/storage-status`, {
      headers: { Authorization: auth },
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({ error: "invalid json" }));
    return NextResponse.json(body, { status: res.status });
  } catch (e) {
    return NextResponse.json(
      {
        database_connected: false,
        error: e instanceof Error ? e.message : "proxy failed",
        construction_storage: getGprStorageMode(),
        marketing_storage: "postgres",
      },
      { status: 502 },
    );
  }
}
