import { NextRequest, NextResponse } from "next/server";

import { deleteImport } from "@/lib/server/marketingStorage";
import { normalizeMarketingImportKind } from "@/lib/marketingImportKinds";
import { sanitizeMarketingPaymentPlanProjectId } from "@/lib/marketingPaymentPlanStore";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ key: string }> };

/** DELETE /api/marketing/import/:key?projectId=… */
export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const { key } = await ctx.params;
  const kind = normalizeMarketingImportKind(key);
  if (!kind) {
    return NextResponse.json({ ok: false, error: `Неизвестный ключ импорта: ${key}` }, { status: 400 });
  }
  const projectId = sanitizeMarketingPaymentPlanProjectId(
    req.nextUrl.searchParams.get("projectId") ?? "default",
  );
  await deleteImport(projectId, kind);
  return NextResponse.json({ ok: true, projectId, kind });
}
