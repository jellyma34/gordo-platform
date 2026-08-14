import { NextRequest, NextResponse } from "next/server";

import { listImports } from "@/lib/server/marketingStorage";
import { denyUnlessSectionAccess } from "@/lib/server/requireSectionAccess";
import { sanitizeMarketingPaymentPlanProjectId } from "@/lib/marketingPaymentPlanStore";

export const runtime = "nodejs";

/** GET /api/marketing/imports?projectId=… — метаданные всех импортов проекта. */
export async function GET(req: NextRequest) {
  const denied = await denyUnlessSectionAccess(req, "marketing");
  if (denied) return denied;
  const projectId = sanitizeMarketingPaymentPlanProjectId(
    req.nextUrl.searchParams.get("projectId") ?? "default",
  );
  const imports = await listImports(projectId);
  return NextResponse.json({ ok: true, projectId, imports }, { headers: { "Cache-Control": "no-store" } });
}
