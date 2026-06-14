import Papa from "papaparse";

import type { PlanFactCsvMonthlyRow } from "@/lib/marketingSalesPlanExecutionTable";
import {
  parseSalesExecutionMoneyCell,
  periodKeyFromYearMonthWithNumericMonth,
} from "@/lib/transformSalesExecutionCsv";

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function preprocessCell(raw: string | undefined | null): string {
  return stripBom(String(raw ?? ""))
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeaderKey(raw: string): string {
  return preprocessCell(raw)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/_/g, " ");
}

function findColIndex(headers: string[], matcher: (h: string) => boolean): number | null {
  for (let i = 0; i < headers.length; i++) {
    const h = normalizeHeaderKey(headers[i] ?? "");
    if (matcher(h)) return i;
  }
  return null;
}

/** `поступления_план_факт.csv`: Год;месяц;План поступлений;Факт поступлений */
export function detectReceiptsPlanFactCsvHeader(headers: string[]): boolean {
  const keys = headers.map(normalizeHeaderKey);
  const joined = keys.join("|");
  if (!joined.includes("год") || !joined.includes("месяц")) return false;
  if (joined.includes("змп")) return false;

  const hasPlan = keys.some((h) => h.includes("план") && h.includes("поступлен") && !h.includes("факт"));
  const hasFact = keys.some((h) => h.includes("факт") && h.includes("поступлен"));
  return hasPlan && hasFact;
}

function resolveReceiptsPlanFactColumns(headers: string[]): {
  year: number;
  month: number;
  plan: number;
  fact: number;
} | null {
  if (!detectReceiptsPlanFactCsvHeader(headers)) return null;

  const y = findColIndex(headers, (h) => h === "год" || h.startsWith("год"));
  const mo = findColIndex(headers, (h) => h === "месяц" || h.startsWith("месяц"));
  const plan = findColIndex(
    headers,
    (h) => h.includes("план") && h.includes("поступлен") && !h.includes("факт"),
  );
  const fact = findColIndex(headers, (h) => h.includes("факт") && h.includes("поступлен"));

  if (y == null || mo == null || plan == null || fact == null) return null;
  return { year: y, month: mo, plan, fact };
}

/** Рубли в CSV: «30» (млн), «3,4» (млн) или «30 000 000» / «30 000 000,00» (₽). */
function parseReceiptsPlanFactAmountCell(raw: string | undefined | null): number {
  const n = parseSalesExecutionMoneyCell(raw);
  if (!Number.isFinite(n)) return 0;
  if (n >= 1_000_000) return n;
  return n * 1_000_000;
}

function detectCsvDelimiter(firstDataLine: string): string {
  const semi = (firstDataLine.match(/;/g) ?? []).length;
  const comma = (firstDataLine.match(/,/g) ?? []).length;
  return semi >= comma ? ";" : ",";
}

function isFooterOrTechnicalRow(firstCell: string): boolean {
  const t = normalizeHeaderKey(firstCell);
  if (!t) return false;
  return t.startsWith("итого") || t.startsWith("всего") || t.includes("примечан") || t.includes("технич");
}

export type ParseReceiptsPlanFactCsvOk = {
  ok: true;
  monthly: PlanFactCsvMonthlyRow[];
  warnings: string[];
};

export type ParseReceiptsPlanFactCsvFail = {
  ok: false;
  error: string;
  warnings: string[];
};

export type ParseReceiptsPlanFactCsvResult = ParseReceiptsPlanFactCsvOk | ParseReceiptsPlanFactCsvFail;

/**
 * Парсер `поступления_план_факт.csv` для графика «План vs факт».
 * План — «План поступлений», факт — «Факт поступлений» (млн ₽ в файле).
 */
export function parseReceiptsPlanFactCsv(text: string): ParseReceiptsPlanFactCsvResult {
  const warnings: string[] = [];
  const stripped = stripBom(text);
  if (!preprocessCell(stripped)) {
    return { ok: false, error: "Пустой CSV.", warnings };
  }

  const firstLine = stripped.split(/\r?\n/).find((ln) => preprocessCell(ln)) ?? "";
  const delimiter = detectCsvDelimiter(firstLine);

  const parsed = Papa.parse<string[]>(stripped, {
    header: false,
    skipEmptyLines: "greedy",
    delimiter,
  });
  const rows = (parsed.data as string[][]).filter((r) => Array.isArray(r) && r.some((c) => preprocessCell(String(c))));
  if (rows.length < 2) {
    return {
      ok: false,
      error: "Ожидается CSV с заголовком: Год;месяц;План поступлений;Факт поступлений.",
      warnings,
    };
  }

  let headerIdx = -1;
  let col: ReturnType<typeof resolveReceiptsPlanFactColumns> = null;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const hdr = (rows[i] ?? []).map((c) => preprocessCell(c));
    const c = resolveReceiptsPlanFactColumns(hdr);
    if (c) {
      headerIdx = i;
      col = c;
      break;
    }
  }
  if (headerIdx < 0 || !col) {
    return {
      ok: false,
      error: "Не найдены колонки «Год», «месяц», «План поступлений», «Факт поступлений».",
      warnings,
    };
  }

  const monthly: PlanFactCsvMonthlyRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const rawLine = row.map((c) => preprocessCell(c)).join("");
    if (!rawLine.replace(/;/g, "").trim()) continue;

    const yearStr = preprocessCell(row[col.year] ?? "");
    const monthStr = preprocessCell(row[col.month] ?? "");
    const firstCell = preprocessCell(row[0] ?? "");
    if (isFooterOrTechnicalRow(firstCell)) continue;
    if (!yearStr && !monthStr) continue;

    const pk = periodKeyFromYearMonthWithNumericMonth(yearStr, monthStr);
    if (!pk) {
      if (yearStr || monthStr) {
        warnings.push(`Строка ${i + 1}: пропуск — не распознан месяц «${monthStr}» / год «${yearStr}».`);
      }
      continue;
    }

    monthly.push({
      periodKey: pk,
      planRub: parseReceiptsPlanFactAmountCell(row[col.plan]),
      factRub: parseReceiptsPlanFactAmountCell(row[col.fact]),
    });
  }

  if (monthly.length === 0) {
    return { ok: false, error: "В CSV нет распознанных строк с планом/фактом.", warnings };
  }

  const byPk = new Map<string, PlanFactCsvMonthlyRow>();
  for (const m of monthly) {
    const prev = byPk.get(m.periodKey);
    if (prev) {
      byPk.set(m.periodKey, {
        periodKey: m.periodKey,
        planRub: prev.planRub + m.planRub,
        factRub: prev.factRub + m.factRub,
      });
    } else {
      byPk.set(m.periodKey, m);
    }
  }

  const sorted = [...byPk.values()].sort((a, b) => a.periodKey.localeCompare(b.periodKey));
  warnings.push(
    "Файл поступления_план_факт.csv: план — «План поступлений», факт — «Факт поступлений» (млн ₽ или ₽).",
  );
  return { ok: true, monthly: sorted, warnings };
}
