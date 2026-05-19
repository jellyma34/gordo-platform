import {
  MARKETING_SEGMENT_EXECUTION_CSV_STORAGE_KEY,
  parseSegmentExecutionCsv,
  type MarketingSegmentExecutionStoredV1,
  type SegmentExecutionChartsPayload,
} from "@/lib/marketingSegmentExecutionCsv";
import { readMarketingCsvFileAsText } from "@/src/shared/lib/csv/parseInvestorsCsv";

export type SegmentExecutionCsvUploadOk = {
  ok: true;
  charts: SegmentExecutionChartsPayload;
  meta: {
    fileName: string;
    uploadedAt: string;
    uploadedBy?: string;
    storageKey: string;
  };
  warnings: string[];
};

export type SegmentExecutionCsvUploadFail = {
  ok: false;
  error: string;
  warnings?: string[];
};

export type SegmentExecutionCsvUploadResult = SegmentExecutionCsvUploadOk | SegmentExecutionCsvUploadFail;

function chartsFromDoc(doc: MarketingSegmentExecutionStoredV1): SegmentExecutionChartsPayload {
  return {
    planFactRows: doc.planFactRows,
    completionRows: doc.completionRows,
    hasSegmentPlan: doc.hasSegmentPlan,
    planTotal: doc.planTotal,
    totalFact: doc.totalFact,
  };
}

/** Frontend → POST marketing/storage (kind=segment_execution) → server JSON + raw CSV. */
export async function uploadMarketingSegmentExecutionCsvFile(
  file: File,
  projectId: string,
  uploadedBy: string,
): Promise<SegmentExecutionCsvUploadResult> {
  const text = await readMarketingCsvFileAsText(file);
  const parsed = parseSegmentExecutionCsv(text);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, warnings: parsed.warnings };
  }

  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", "segment_execution");
  fd.append("uploadedBy", uploadedBy);

  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/marketing/storage`, {
    method: "POST",
    body: fd,
  });

  const j = (await res.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    doc?: MarketingSegmentExecutionStoredV1;
    warnings?: string[];
  } | null;

  if (!res.ok || !j?.ok || !j.doc) {
    return {
      ok: false,
      error: typeof j?.error === "string" ? j.error : "Не удалось сохранить CSV исполнения плана на сервере.",
      warnings: Array.isArray(j?.warnings) ? j.warnings : undefined,
    };
  }

  const saved = { ...j.doc, rawText: j.doc.rawText ?? text };
  return {
    ok: true,
    charts: chartsFromDoc(saved),
    meta: {
      fileName: saved.fileName,
      uploadedAt: saved.updatedAt,
      uploadedBy: saved.uploadedBy,
      storageKey: MARKETING_SEGMENT_EXECUTION_CSV_STORAGE_KEY,
    },
    warnings: Array.isArray(saved.warnings) ? saved.warnings : [],
  };
}

export async function deleteMarketingSegmentExecutionCsv(
  projectId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const dr = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/marketing/storage?kind=segment_execution`,
    { method: "DELETE" },
  );
  if (!dr.ok) {
    return { ok: false, error: "Не удалось сбросить CSV на сервере." };
  }
  return { ok: true };
}
