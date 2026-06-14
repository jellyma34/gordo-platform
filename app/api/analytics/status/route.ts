import { NextResponse } from "next/server";

import { ANALYTICS_CSV_KINDS, analyticsCsvRegistryEntry } from "@/lib/analytics/analyticsCsvRegistry";
import { getAnalyticsCsvFetchPath } from "@/lib/analytics/analyticsCsvPath";
import { analyticsCsvExists, resolveAnalyticsCsvPublicDir } from "@/lib/server/analyticsCsvStorage";

export const runtime = "nodejs";

/** Диагностика production: какие CSV доступны на сервере / static. */
export async function GET() {
  const dir = resolveAnalyticsCsvPublicDir();
  const files = await Promise.all(
    ANALYTICS_CSV_KINDS.map(async (kind) => {
      const entry = analyticsCsvRegistryEntry(kind);
      return {
        kind,
        fileName: entry.fileName,
        publicUrl: entry.publicUrl,
        fetchPath: getAnalyticsCsvFetchPath(entry.publicUrl),
        exists: await analyticsCsvExists(kind),
      };
    }),
  );
  return NextResponse.json(
    {
      ok: true,
      publicDir: dir,
      files,
      missing: files.filter((f) => !f.exists).map((f) => f.fileName),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
