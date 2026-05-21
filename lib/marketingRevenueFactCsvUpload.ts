import {
  buildMarketingRevenueFactDocFromParse,
  parseRevenueFactCsv,
  reconcileMarketingRevenueFactDoc,
  type MarketingRevenueFactCsvStoredV1,
} from "@/lib/marketingRevenueFactCsv";
import { readMarketingCsvFileAsText } from "@/src/shared/lib/csv/parseInvestorsCsv";

export type RevenueFactCsvUploadOk = {
  ok: true;
  doc: MarketingRevenueFactCsvStoredV1;
  warnings: string[];
  /** true — данные только в state браузера (сервер не сохранил). */
  localOnly?: boolean;
};

export type RevenueFactCsvUploadFail = {
  ok: false;
  error: string;
  warnings?: string[];
};

export type RevenueFactCsvUploadResult = RevenueFactCsvUploadOk | RevenueFactCsvUploadFail;

const SERVER_SAVE_WARN = "Файл применён локально; сохранение на сервер недоступно.";

/** POST marketing/storage (kind=revenue_fact); при ошибке сервера — doc в local state. */
export async function uploadMarketingRevenueFactCsvFile(
  file: File,
  projectId: string,
  uploadedBy: string,
): Promise<RevenueFactCsvUploadResult> {
  let text: string;
  try {
    text = await readMarketingCsvFileAsText(file);
  } catch (e) {
    console.error("[revenueFactCsv] read file failed", e);
    return { ok: false, error: "Не удалось прочитать CSV поступлений." };
  }

  let parsed: ReturnType<typeof parseRevenueFactCsv>;
  try {
    parsed = parseRevenueFactCsv(text);
  } catch (e) {
    console.error("[revenueFactCsv] parse failed", e);
    return { ok: false, error: "Ошибка разбора CSV поступлений." };
  }

  if (!parsed.ok) {
    return { ok: false, error: parsed.error, warnings: parsed.warnings };
  }

  const localDoc = buildMarketingRevenueFactDocFromParse(file, text, parsed, uploadedBy);

  try {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", "revenue_fact");
    fd.append("uploadedBy", uploadedBy);

    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/marketing/storage`, {
      method: "POST",
      body: fd,
    });

    const j = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      doc?: MarketingRevenueFactCsvStoredV1;
      warnings?: string[];
    } | null;

    if (res.ok && j?.ok && j.doc) {
      const saved = reconcileMarketingRevenueFactDoc({ ...j.doc, rawText: j.doc.rawText ?? text });
      return {
        ok: true,
        doc: saved,
        warnings: [...(Array.isArray(saved.warnings) ? saved.warnings : []), ...parsed.warnings],
      };
    }

    console.error("[revenueFactCsv] server save failed", res.status, j?.error);
    return {
      ok: true,
      doc: localDoc,
      localOnly: true,
      warnings: [...parsed.warnings, SERVER_SAVE_WARN],
    };
  } catch (e) {
    console.error("[revenueFactCsv] upload request failed", e);
    return {
      ok: true,
      doc: localDoc,
      localOnly: true,
      warnings: [...parsed.warnings, SERVER_SAVE_WARN],
    };
  }
}

export async function deleteMarketingRevenueFactCsv(
  projectId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const dr = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/marketing/storage?kind=revenue_fact`,
      { method: "DELETE" },
    );
    if (!dr.ok) {
      return { ok: false, error: "Не удалось сбросить CSV поступлений на сервере." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Не удалось сбросить CSV поступлений на сервере." };
  }
}
