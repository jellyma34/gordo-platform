import {
  MARKETING_RECEIPTS_PLAN_FACT_CSV_STORAGE_KEY,
  parseReceiptsPlanFactCsv,
  receiptsPlanFactDocToChartRows,
  type MarketingReceiptsPlanFactStoredV1,
} from "@/lib/marketingReceiptsPlanFactCsv";
import type { PlanVsFactMonthlyRubPoint } from "@/lib/planExecutionPlanVsFactChart";
import { readMarketingCsvFileAsText } from "@/src/shared/lib/csv/parseInvestorsCsv";

export type ReceiptsPlanFactCsvUploadOk = {
  ok: true;
  monthly: PlanVsFactMonthlyRubPoint[];
  meta: {
    fileName: string;
    uploadedAt: string;
    uploadedBy?: string;
    storageKey: string;
  };
  warnings: string[];
};

export type ReceiptsPlanFactCsvUploadFail = {
  ok: false;
  error: string;
  warnings?: string[];
};

export type ReceiptsPlanFactCsvUploadResult = ReceiptsPlanFactCsvUploadOk | ReceiptsPlanFactCsvUploadFail;

export async function uploadMarketingReceiptsPlanFactCsvFile(
  file: File,
  projectId: string,
  uploadedBy: string,
): Promise<ReceiptsPlanFactCsvUploadResult> {
  const text = await readMarketingCsvFileAsText(file);
  const parsed = parseReceiptsPlanFactCsv(text);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, warnings: parsed.warnings };
  }

  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", "receipts_plan_fact");
  fd.append("uploadedBy", uploadedBy);

  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/marketing/storage`, {
    method: "POST",
    body: fd,
  });

  const j = (await res.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    doc?: MarketingReceiptsPlanFactStoredV1;
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
    monthly: receiptsPlanFactDocToChartRows(saved),
    meta: {
      fileName: saved.fileName,
      uploadedAt: saved.updatedAt,
      uploadedBy: saved.uploadedBy,
      storageKey: MARKETING_RECEIPTS_PLAN_FACT_CSV_STORAGE_KEY,
    },
    warnings: Array.isArray(saved.warnings) ? saved.warnings : parsed.warnings,
  };
}

export async function deleteMarketingReceiptsPlanFactCsv(
  projectId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const dr = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/marketing/storage?kind=receipts_plan_fact`,
    { method: "DELETE" },
  );
  if (!dr.ok) {
    return { ok: false, error: "Не удалось сбросить CSV на сервере." };
  }
  return { ok: true };
}
