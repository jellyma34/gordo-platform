import { readFile } from "fs/promises";

import { MARKETING_DEALS_CURRENT_FILE, type MarketingDealsCurrentFileBody } from "@/lib/marketingDealsPersistencePaths";
import { NextResponse } from "next/server";

const DEALS_UPSTREAM_URL =
  "https://api.macroserver.ru/estate/export/trankeysdata/777.trziyFNny0gbHXdHERqltKEh6qFkLNGthVnmyfMq7nHSrF75uyadoziu6JlNRjdEFuRZz6kVqxlhO3Hhi4p8MTc3NjI0NjgyMnxjYTQxNA/getData.json?houses=8628781";

async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const local = await readJsonSafe<MarketingDealsCurrentFileBody>(MARKETING_DEALS_CURRENT_FILE);
    if (local?.payload != null) {
      return NextResponse.json(local.payload, { headers: { "Cache-Control": "no-store" } });
    }

    const upstream = await fetch(DEALS_UPSTREAM_URL, { cache: "no-store" });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream responded with ${upstream.status}` },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }
    const json: unknown = await upstream.json();
    return NextResponse.json(json, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

export const runtime = "nodejs";
