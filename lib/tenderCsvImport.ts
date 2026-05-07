import Papa from "papaparse";

import { readCsvFileTextSmart } from "@/lib/csvTextEncoding";
import { ruDateCellToIsoOrNull } from "@/lib/gprReportCsv";
import {
  coerceTender,
  getGprStageFromTenderCode,
  inferPartIdFromStage,
  type Tender,
  type TenderProcurementStatus,
} from "@/lib/tenderData";

/** CSV как текст → строки с заголовком (UTF-8 / Windows-1251 задаются до парсинга). */
export function parseTenderCsvText(csvText: string): Record<string, string>[] {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.replace(/^\uFEFF/, "").trim(),
  });
  if (result.errors?.length) {
    console.warn("[tenders CSV]", result.errors.slice(0, 5));
  }
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows.filter((row) => row && typeof row === "object" && Object.keys(row).length > 0);
}

export async function parseTenderCsvFile(file: File): Promise<Record<string, string>[]> {
  const text = await readCsvFileTextSmart(file);
  return parseTenderCsvText(text);
}

function pickCell(row: Record<string, unknown>, aliases: string[]): string {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const al = alias.toLowerCase();
    for (const k of keys) {
      const nk = k.replace(/^\uFEFF/, "").trim().toLowerCase();
      if (nk === al) {
        const v = row[k];
        if (v == null) continue;
        const s = String(v).trim();
        if (s !== "") return s;
      }
    }
  }
  return "";
}

function parseBudget(raw: string): number | undefined {
  const s = raw.replace(/\s/g, "").replace(/\u00a0/g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

/** ISO ГГГГ-ММ-ДД или ДД.MM.ГГГГ */
function parseDateToIso(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  return ruDateCellToIsoOrNull(t);
}

function mapStatus(s: string): TenderProcurementStatus | undefined {
  const t = s.toLowerCase();
  if (!t) return undefined;
  if (/план|заплан|^planned$/i.test(t)) return "planned";
  if (/работ|прогресс|progress|в процес|^in_progress$/i.test(t)) return "in_progress";
  if (/заверш|^completed$/i.test(t)) return "completed";
  if (/задерж|^delayed$/i.test(t)) return "delayed";
  return undefined;
}

function newIdFallback(index: number): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tender-import-${Date.now()}-${index}`;
}

/**
 * Полная замена реестра из CSV (без merge со старыми строками на стороне вызывающего — см. `setItems`).
 * Колонки подбираются по нескольким синонимам (рус / англ).
 */
export function normalizeTenderCsvRows(rows: Record<string, unknown>[]): Tender[] {
  const out: Tender[] = [];
  let i = 0;
  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    const code = pickCell(row, ["Шифр", "Код", "code", "Шифр ГПР", "ID Код"]);
    const name = pickCell(row, ["Название", "Наименование", "name", "Наименование работ"]);
    if (!code || !name) continue;

    const idRaw = pickCell(row, ["ID", "id", "№", "No"]);
    const stageGuess =
      pickCell(row, ["Этап", "stage", "Этап ГПР"]) ||
      getGprStageFromTenderCode(code) ||
      "2.05";
    const stage = stageGuess.trim();

    const planStart = parseDateToIso(
      pickCell(row, ["План начала работ", "План начала", "planStart", "Дата начала работ"]),
    );
    const factStart =
      parseDateToIso(pickCell(row, ["Факт начала", "factStart"])) ?? undefined;

    const planContractDate = parseDateToIso(
      pickCell(row, [
        "План даты договора",
        "План договора",
        "Дата договора план",
        "planContractDate",
        "Дата договора",
      ]),
    );

    let factContractDate =
      parseDateToIso(
        pickCell(row, ["Факт даты договора", "Факт договора", "factContractDate", "Дата договора факт"]),
      ) ?? undefined;
    if (!factContractDate) {
      factContractDate =
        parseDateToIso(pickCell(row, ["Дата окончания", "dateEnd", "Факт окончания"])) ?? undefined;
    }

    const costRaw = pickCell(row, ["Бюджет", "Сумма", "cost", "Стоимость"]);
    const cost = costRaw ? parseBudget(costRaw) : undefined;

    const contractor =
      pickCell(row, ["Подрядчик", "contractor", "Исполнитель", "Заказчик"]) || undefined;
    const comment =
      pickCell(row, ["Комментарий", "comment", "Примечание"]) || undefined;
    const statusRaw = pickCell(row, ["Статус", "status"]);

    const id = idRaw || newIdFallback(i);
    i += 1;

    const partId = inferPartIdFromStage(stage);

    const plain: Record<string, unknown> = {
      id,
      code,
      name,
      stage,
      partId,
      planStart,
      factStart: factStart ?? null,
      planContractDate,
      factContractDate: factContractDate ?? null,
      cost,
      contractor,
      comment,
      status: mapStatus(statusRaw),
    };

    const t = coerceTender(plain);
    if (t) out.push(t);
  }
  return out;
}
