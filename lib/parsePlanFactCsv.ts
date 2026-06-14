import Papa from "papaparse";

import {
  emptySalesPlanExecutionDataset,
  type PlanFactCsvMonthlyRow,
  type SalesPlanExecutionDataset,
} from "@/lib/marketingSalesPlanExecutionTable";
import {
  lastYmdOfPeriodKey,
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

/** Заголовок plan_fact.csv: Год;месяц;План продаж ЗМП;…;Сумма поступлений факт;… */
export function detectPlanFactCsvHeader(headers: string[]): boolean {
  const joined = headers.map(normalizeHeaderKey).join("|");
  return (
    joined.includes("год") &&
    joined.includes("месяц") &&
    joined.includes("змп") &&
    joined.includes("поступлен") &&
    joined.includes("факт") &&
    !joined.includes("квартир")
  );
}

function resolvePlanFactColumns(headers: string[]): {
  year: number;
  month: number;
  planZmp: number;
  factInflow: number;
} | null {
  if (!detectPlanFactCsvHeader(headers)) return null;

  const y = findColIndex(headers, (h) => h === "год" || h.startsWith("год"));
  const mo = findColIndex(headers, (h) => h === "месяц" || h.startsWith("месяц"));
  const planZmp = findColIndex(headers, (h) => h.includes("план") && h.includes("змп"));
  const factInflow = findColIndex(
    headers,
    (h) =>
      h.includes("сумма") &&
      h.includes("поступлен") &&
      h.includes("факт") &&
      !h.includes("расторж") &&
      !h.includes("учетом"),
  );

  if (y == null || mo == null || planZmp == null || factInflow == null) return null;
  return { year: y, month: mo, planZmp, factInflow };
}

function isFooterOrTechnicalRow(firstCell: string, yearStr: string, monthStr: string): boolean {
  const t = normalizeHeaderKey(firstCell);
  if (!t) return false;
  if (t.startsWith("итого") || t.startsWith("всего") || t.includes("примечан")) return true;
  if (t.includes("технич") || t.includes("справоч")) return true;
  return false;
}

/**
 * Единый CSV `plan_fact.csv`: план («План продаж ЗМП») и факт («Сумма поступлений факт»), ₽ по месяцам.
 * Возвращает `null`, если формат не распознан.
 */
export function tryParsePlanFactCsvExecution(
  text: string,
  _reportFallbackYmd: string,
): { dataset: SalesPlanExecutionDataset; warnings: string[] } | null {
  const stripped = stripBom(text);
  if (!preprocessCell(stripped)) return null;

  const parsed = Papa.parse<string[]>(stripped, {
    header: false,
    skipEmptyLines: "greedy",
    delimiter: ";",
  });
  const rows = (parsed.data as string[][]).filter((r) => Array.isArray(r) && r.some((c) => preprocessCell(String(c))));
  if (rows.length < 2) return null;

  let headerIdx = -1;
  let col: { year: number; month: number; planZmp: number; factInflow: number } | null = null;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const hdr = (rows[i] ?? []).map((c) => preprocessCell(c));
    const c = resolvePlanFactColumns(hdr);
    if (c) {
      headerIdx = i;
      col = c;
      break;
    }
  }
  if (headerIdx < 0 || !col) return null;

  const monthly: PlanFactCsvMonthlyRow[] = [];
  const warnings: string[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const rawLine = row.map((c) => preprocessCell(c)).join("");
    if (!rawLine.replace(/;/g, "").trim()) continue;

    const yearStr = preprocessCell(row[col.year] ?? "");
    const monthStr = preprocessCell(row[col.month] ?? "");
    const firstCell = preprocessCell(row[0] ?? "");

    if (isFooterOrTechnicalRow(firstCell, yearStr, monthStr)) continue;
    if (!yearStr && !monthStr) continue;

    const pk = periodKeyFromYearMonthWithNumericMonth(yearStr, monthStr);
    if (!pk) {
      if (yearStr || monthStr) {
        warnings.push(`Строка ${i + 1}: пропуск — не распознан месяц «${monthStr}» / год «${yearStr}».`);
      }
      continue;
    }

    const planRub = parseSalesExecutionMoneyCell(row[col.planZmp]);
    const factRub = parseSalesExecutionMoneyCell(row[col.factInflow]);
    const planSafe = Number.isFinite(planRub) ? planRub : 0;
    const factSafe = Number.isFinite(factRub) ? factRub : 0;

    monthly.push({ periodKey: pk, planRub: planSafe, factRub: factSafe });
  }

  if (monthly.length === 0) return null;

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
  const lastPk = sorted[sorted.length - 1]!.periodKey;
  const ds = emptySalesPlanExecutionDataset(lastYmdOfPeriodKey(lastPk));
  ds.rows = [
    {
      id: "total",
      name: "Итого",
      planProjectRub: 0,
      planReportMonthRub: 0,
      factReportMonthRub: undefined,
      planCumulativeRub: 0,
      factCumulativeRub: 0,
      deviationRub: 0,
      completionPct: null,
      shareOfVolumePct: 100,
      deviationComment: null,
      isTotal: true,
    },
  ];
  ds.planFactCsvMonthly = sorted;
  ds.monthlyPlanFact = sorted.map((p) => ({
    periodKey: p.periodKey,
    planRub: p.planRub,
    factRub: p.factRub,
  }));

  warnings.push(
    "Файл plan_fact.csv: план — колонка «План продаж ЗМП», факт — «Сумма поступлений факт» (без расторжений).",
  );
  return { dataset: ds, warnings };
}
