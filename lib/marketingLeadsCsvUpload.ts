import {
  MARKETING_LEADS_CSV_STORAGE_KEY,
  marketingLeadsDocToChartBundle,
  parseMarketingLeadsCsv,
  type MarketingLeadsCsvChartBundle,
  type MarketingLeadsCsvStoredV1,
} from "@/lib/marketingLeadsCsv";
import { readMarketingCsvFileAsText } from "@/src/shared/lib/csv/parseInvestorsCsv";

export type MarketingLeadsCsvUploadOk = {
  ok: true;
  charts: MarketingLeadsCsvChartBundle;
  meta: {
    fileName: string;
    uploadedAt: string;
    uploadedBy?: string;
    storageKey: string;
  };
  warnings: string[];
};

export type MarketingLeadsCsvUploadFail = {
  ok: false;
  error: string;
  warnings?: string[];
};

export type MarketingLeadsCsvUploadResult = MarketingLeadsCsvUploadOk | MarketingLeadsCsvUploadFail;

export async function uploadMarketingLeadsCsvFile(
  file: File,
  projectId: string,
  uploadedBy: string,
): Promise<MarketingLeadsCsvUploadResult> {
  const text = await readMarketingCsvFileAsText(file);
  const parsed = parseMarketingLeadsCsv(text);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, warnings: parsed.warnings };
  }

  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", "marketing_leads");
  fd.append("uploadedBy", uploadedBy);

  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/marketing/storage`, {
    method: "POST",
    body: fd,
  });

  const j = (await res.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    doc?: MarketingLeadsCsvStoredV1;
    warnings?: string[];
  } | null;

  if (!res.ok || !j?.ok || !j.doc) {
    return {
      ok: false,
      error: typeof j?.error === "string" ? j.error : "Не удалось сохранить CSV на сервере.",
      warnings: Array.isArray(j?.warnings) ? j.warnings : undefined,
    };
  }

  const saved = { ...j.doc, rawText: j.doc.rawText ?? text };
  return {
    ok: true,
    charts: marketingLeadsDocToChartBundle(saved),
    meta: {
      fileName: saved.fileName,
      uploadedAt: saved.updatedAt,
      uploadedBy: saved.uploadedBy,
      storageKey: MARKETING_LEADS_CSV_STORAGE_KEY,
    },
    warnings: Array.isArray(saved.warnings) ? saved.warnings : parsed.warnings,
  };
}

export async function deleteMarketingLeadsCsv(
  projectId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/marketing/storage?kind=marketing_leads`,
    { method: "DELETE" },
  );
  const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!res.ok || !j?.ok) {
    return { ok: false, error: typeof j?.error === "string" ? j.error : "Не удалось удалить CSV." };
  }
  return { ok: true };
}
