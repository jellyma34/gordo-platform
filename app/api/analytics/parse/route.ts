import { NextRequest, NextResponse } from "next/server";

import { normalizeMarketingImportKind, type MarketingImportKind } from "@/lib/marketingImportKinds";
import { buildMarketingDocFromCsv } from "@/lib/server/buildMarketingDocFromCsv";
import { sanitizeMarketingPaymentPlanProjectId } from "@/lib/marketingPaymentPlanStore";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      kind?: string;
      text?: string;
      fileName?: string;
      projectId?: string;
    };

    const kindNorm = normalizeMarketingImportKind(body.kind ?? "");
    const text = String(body.text ?? "").trim();
    if (!kindNorm || !text) {
      return NextResponse.json(
        { ok: false, error: "Ожидается { kind, text }." },
        { status: 400 },
      );
    }

    const projectId = sanitizeMarketingPaymentPlanProjectId(body.projectId ?? "default");
    const fileName = String(body.fileName ?? "").trim() || `${kindNorm}.csv`;
    const updatedAt = new Date().toISOString();

    const built = await buildMarketingDocFromCsv(
      kindNorm as MarketingImportKind,
      text,
      { updatedAt, uploadedBy: "public-csv", fileName },
      projectId,
    );

    if (!built.ok) {
      console.warn("[analytics/parse] failed:", kindNorm, built.error);
      return NextResponse.json({ ok: false, error: built.error }, { status: 400 });
    }

    return NextResponse.json(
      { ok: true, kind: kindNorm, doc: built.doc },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[analytics/parse] error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
