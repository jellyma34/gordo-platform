import { dec1Fmt } from "@/lib/salesPlanChartFormat";
import { preprocessCell, stripBom } from "@/lib/salesPlanExecutionCsv";
import {
  isInvestorsCsvHeaderLine,
  parseRuNumber,
  shouldSilentlySkipInvestorsCsvMonthLabel,
} from "@/src/shared/lib/csv/parseInvestorsCsv";

/** Ключ хранилища (префикс); полный ключ — {@link marketingInvestorsCsvLocalStorageKey}. */
export const MARKETING_INVESTORS_CSV_STORAGE_KEY = "marketingInvestorsCsv";

export function marketingInvestorsCsvLocalStorageKey(projectId: string): string {
  const safe = String(projectId || "default").trim().slice(0, 64) || "default";
  return `${MARKETING_INVESTORS_CSV_STORAGE_KEY}:v1:${safe}`;
}

export type MacroCategoryKey = "apartments" | "parking" | "storage" | "commercial";

export type InvestorsPlanFactChartRow = { key: string; name: string; plan: number; fact: number };

export type InvestorsCompletionChartRow = {
  key: string;
  name: string;
  pct: number | null;
  barLen: number;
  label: string;
  fill: string;
};

export type MarketingInvestorsCsvStoredV1 = {
  v: 1;
  updatedAt: string;
  fileName: string;
  planFactChartRows: InvestorsPlanFactChartRow[];
  completionChartRows: InvestorsCompletionChartRow[];
  warnings: string[];
};

const MACRO_ORDER: readonly { key: MacroCategoryKey; name: string }[] = [
  { key: "apartments", name: "Квартиры" },
  { key: "parking", name: "Парковки" },
  { key: "storage", name: "Кладовые" },
  { key: "commercial", name: "Коммерческие помещения" },
];

const DELIM = ";";

function stripBomStart(raw: string): string {
  let s = stripBom(raw);
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.replace(/^\uFEFF/, "");
}

function splitRawLines(raw: string): string[] {
  const t = stripBomStart(raw).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return t.split("\n");
}

function normHeaderCell(s: string): string {
  return stripBom(preprocessCell(s))
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

/** Пустая строка или блок итого / расторжений (не строка «год в col0»). */
function isSkippableDataRow(row: string[]): boolean {
  if (row.length === 0) return true;
  if (row.every((c) => preprocessCell(c) === "")) return true;
  const c0 = normHeaderCell(row[0] ?? "");
  if (/^\d{4}$/.test(c0)) return false;
  const rowText = row.map(normHeaderCell).join(" ");
  if (c0.includes("итого") || rowText.includes("итого")) return true;
  if (c0.includes("расторж") || rowText.includes("расторж")) return true;
  return false;
}

function isYearMonthDataRow(row: string[]): boolean {
  if (isSkippableDataRow(row)) return false;
  const y = preprocessCell(row[0] ?? "");
  return /^\d{4}$/.test(y);
}

function monthKeyRu(monthRaw: string, year: string): string {
  const m = preprocessCell(monthRaw).toLowerCase();
  return `${m} ${year}`.trim();
}

type ColIdx = {
  year: number;
  month: number;
  apartmentsPlan: number | null;
  apartmentsFact: number | null;
  parkingPlan: number | null;
  parkingFact: number | null;
  storagePlan: number | null;
  storageFact: number | null;
  commercialPlan: number | null;
  commercialFact: number | null;
};

/** Wide-table: «квартиры сумма», «паркинг сумма» — колонка с ₽, в названии есть «сумм». */
function pickWideSumColumn(headers: string[], categoryMatch: (n: string) => boolean): number | null {
  let best: { i: number; s: number } | null = null;
  for (let i = 0; i < headers.length; i++) {
    const n = normHeaderCell(headers[i] ?? "");
    if (n.includes("расторж") || n.includes("итого")) continue;
    if (!categoryMatch(n)) continue;
    if (!n.includes("сумм")) continue;
    let s = 80;
    if (n.includes("факт") || n.includes("фактич")) s -= 20;
    if (n.includes("план") || n.includes("планов")) s -= 15;
    if (!best || s > best.s) best = { i, s };
  }
  return best?.i ?? null;
}

/** Отдельная колонка факта по категории; если нет — в numAtPlanFact подставим plan. */
function pickOptionalFactColumn(headers: string[], categoryMatch: (n: string) => boolean): number | null {
  let best: { i: number; s: number } | null = null;
  for (let i = 0; i < headers.length; i++) {
    const n = normHeaderCell(headers[i] ?? "");
    if (n.includes("расторж") || n.includes("итого")) continue;
    if (!categoryMatch(n)) continue;
    if (!n.includes("факт") && !n.includes("фактич")) continue;
    if (n.includes("план") && !n.includes("факт") && !n.includes("фактич")) continue;
    let s = 70;
    if (n.includes("сумм")) s += 10;
    if (!best || s > best.s) best = { i, s };
  }
  return best?.i ?? null;
}

function matchApartments(n: string): boolean {
  return n.includes("квартир");
}

function matchParking(n: string): boolean {
  return n.includes("парк") || n.includes("парков") || n.includes("машино");
}

function matchStorage(n: string): boolean {
  return n.includes("кладов");
}

function matchCommercial(n: string): boolean {
  return n.includes("коммерч") || n.includes("коммерц") || n.includes("нжп");
}

function findYearMonthColumns(headers: string[]): { year: number; month: number } {
  let year = 0;
  let month = 1;
  for (let i = 0; i < headers.length; i++) {
    const n = normHeaderCell(headers[i] ?? "");
    if (n === "год" || (n.includes("год") && !n.includes("месяц"))) year = i;
    if (n.includes("месяц")) month = i;
  }
  return { year, month };
}

function buildColumnMap(headerCells: string[]): ColIdx | null {
  const { year, month } = findYearMonthColumns(headerCells);

  const apartmentsPlan = pickWideSumColumn(headerCells, matchApartments);
  const apartmentsFact = pickOptionalFactColumn(headerCells, matchApartments);
  const parkingPlan = pickWideSumColumn(headerCells, matchParking);
  const parkingFact = pickOptionalFactColumn(headerCells, matchParking);
  const storagePlan = pickWideSumColumn(headerCells, matchStorage);
  const storageFact = pickOptionalFactColumn(headerCells, matchStorage);
  const commercialPlan = pickWideSumColumn(headerCells, matchCommercial);
  const commercialFact = pickOptionalFactColumn(headerCells, matchCommercial);

  if (apartmentsPlan == null) {
    return null;
  }

  return {
    year,
    month,
    apartmentsPlan,
    apartmentsFact,
    parkingPlan,
    parkingFact,
    storagePlan,
    storageFact,
    commercialPlan,
    commercialFact,
  };
}

function numAt(row: string[], idx: number | null): number {
  if (idx == null || idx < 0 || idx >= row.length) return 0;
  return parseRuNumber(row[idx]);
}

/** План из колонки «… сумма»; факт из колонки «… факт» или временно = plan. */
function numAtPlanFact(row: string[], planIdx: number | null, factIdx: number | null): { plan: number; fact: number } {
  const plan = numAt(row, planIdx);
  const fact = factIdx != null ? numAt(row, factIdx) : plan;
  return { plan, fact };
}

function completionChartFill(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return "#94a3b8";
  if (pct > 95) return "#10b981";
  if (pct >= 85) return "#f97316";
  return "#ef4444";
}

function buildCompletionRow(key: MacroCategoryKey, name: string, plan: number, fact: number): InvestorsCompletionChartRow {
  const rawPct = plan > 0 && Number.isFinite(plan) ? (fact / plan) * 100 : null;
  const n = rawPct != null && Number.isFinite(rawPct) ? Math.max(0, rawPct) : null;
  const barLen = n == null ? 0 : Math.min(108, n);
  return {
    key,
    name,
    pct: n,
    barLen,
    label: n == null ? "" : `${dec1Fmt.format(n)}%`,
    fill: completionChartFill(n),
  };
}

export type ParseMarketingInvestorsCsvResult =
  | {
      ok: true;
      planFactChartRows: InvestorsPlanFactChartRow[];
      completionChartRows: InvestorsCompletionChartRow[];
      warnings: string[];
    }
  | { ok: false; error: string; warnings?: string[] };

export type InvestorsParsedMonthRow = {
  rowIndex1: number;
  monthKey: string;
  year: string;
  month: string;
  apartmentsPlan: number;
  apartmentsFact: number;
  parkingPlan: number;
  parkingFact: number;
  storagePlan: number;
  storageFact: number;
  commercialPlan: number;
  commercialFact: number;
};

export function parseMarketingInvestorsCsv(text: string): ParseMarketingInvestorsCsvResult {
  const warnings: string[] = [];
  const lines = splitRawLines(text);
  if (lines.length < 2) {
    return { ok: false, error: "Файл слишком короткий или пустой.", warnings };
  }

  let headerLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (isInvestorsCsvHeaderLine(line)) {
      headerLineIdx = i;
      break;
    }
  }

  if (headerLineIdx < 0) {
    return {
      ok: false,
      error: "Не найдена строка заголовков (нужны подстроки «год», «месяц», «квартиры» в одной строке).",
      warnings,
    };
  }

  const headerRow = (lines[headerLineIdx] ?? "").split(DELIM).map((c) => preprocessCell(c));
  const colMap = buildColumnMap(headerRow);
  if (!colMap) {
    return {
      ok: false,
      error:
        "Заголовок найден, но не найдена колонка «квартиры сумма» (или аналог с «сумма» по квартирам). Проверьте названия колонок.",
      warnings,
    };
  }

  console.log("[Investors CSV] header row", headerLineIdx + 1, headerRow);
  console.log("[Investors CSV] column map", colMap);

  const parsedRows: InvestorsParsedMonthRow[] = [];

  for (let lineIdx = headerLineIdx + 1; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx] ?? "";
    if (line.trim() === "") continue;
    const row = line.split(DELIM).map((c) => preprocessCell(c));
    if (!row.some((c) => c !== "")) continue;
    if (isSkippableDataRow(row)) continue;
    if (!isYearMonthDataRow(row)) continue;

    const year = preprocessCell(row[colMap.year] ?? "");
    const month = preprocessCell(row[colMap.month] ?? "");
    if (!year || !month) continue;
    if (shouldSilentlySkipInvestorsCsvMonthLabel(month)) continue;

    const ap = numAtPlanFact(row, colMap.apartmentsPlan, colMap.apartmentsFact);
    const pk = numAtPlanFact(row, colMap.parkingPlan, colMap.parkingFact);
    const st = numAtPlanFact(row, colMap.storagePlan, colMap.storageFact);
    const cm = numAtPlanFact(row, colMap.commercialPlan, colMap.commercialFact);

    parsedRows.push({
      rowIndex1: lineIdx + 1,
      monthKey: monthKeyRu(month, year),
      year,
      month,
      apartmentsPlan: ap.plan,
      apartmentsFact: ap.fact,
      parkingPlan: pk.plan,
      parkingFact: pk.fact,
      storagePlan: st.plan,
      storageFact: st.fact,
      commercialPlan: cm.plan,
      commercialFact: cm.fact,
    });
  }

  console.table(parsedRows);

  if (parsedRows.length === 0) {
    return {
      ok: false,
      error:
        "Не найдено ни одной строки месяца после заголовка. Ожидается: колонка года — 4 цифры, колонка месяца — «октябрь», «март» и т.д.",
      warnings,
    };
  }

  const last = parsedRows[parsedRows.length - 1]!;

  console.log("mapped investors row", {
    apartmentsPlan: last.apartmentsPlan,
    apartmentsFact: last.apartmentsFact,
    parkingPlan: last.parkingPlan,
    parkingFact: last.parkingFact,
    storagePlan: last.storagePlan,
    storageFact: last.storageFact,
    commercialPlan: last.commercialPlan,
    commercialFact: last.commercialFact,
  });

  const byKey: Record<MacroCategoryKey, { plan: number; fact: number }> = {
    apartments: { plan: last.apartmentsPlan, fact: last.apartmentsFact },
    parking: { plan: last.parkingPlan, fact: last.parkingFact },
    storage: { plan: last.storagePlan, fact: last.storageFact },
    commercial: { plan: last.commercialPlan, fact: last.commercialFact },
  };

  const planFactChartRows: InvestorsPlanFactChartRow[] = MACRO_ORDER.map(({ key, name }) => ({
    key,
    name,
    plan: byKey[key].plan,
    fact: byKey[key].fact,
  }));

  console.table(planFactChartRows);
  console.log("planFactChartRows", planFactChartRows);

  const completionChartRows: InvestorsCompletionChartRow[] = planFactChartRows.map((r) =>
    buildCompletionRow(r.key as MacroCategoryKey, r.name, r.plan, r.fact),
  );

  console.log("completionChartRows", completionChartRows);

  const investorsMacroCharts = { planFactChartRows, completionChartRows };
  console.log("[Investors CSV] investorsMacroCharts", investorsMacroCharts);

  return { ok: true, planFactChartRows, completionChartRows, warnings };
}

export function parseStoredMarketingInvestorsCsv(raw: unknown): MarketingInvestorsCsvStoredV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (typeof o.updatedAt !== "string" || typeof o.fileName !== "string") return null;
  if (!Array.isArray(o.planFactChartRows) || !Array.isArray(o.completionChartRows)) return null;
  return o as MarketingInvestorsCsvStoredV1;
}

export function readMarketingInvestorsCsvFromLocalStorage(projectId: string): MarketingInvestorsCsvStoredV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(marketingInvestorsCsvLocalStorageKey(projectId));
    if (!raw) return null;
    return parseStoredMarketingInvestorsCsv(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeMarketingInvestorsCsvToLocalStorage(projectId: string, doc: MarketingInvestorsCsvStoredV1): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(marketingInvestorsCsvLocalStorageKey(projectId), JSON.stringify(doc));
  } catch (e) {
    console.warn("[Investors CSV] localStorage save failed", e);
  }
}

export function clearMarketingInvestorsCsvLocalStorage(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(marketingInvestorsCsvLocalStorageKey(projectId));
  } catch {
    /* ignore */
  }
}
