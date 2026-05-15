import { dec1Fmt } from "@/lib/salesPlanChartFormat";
import { preprocessCell, stripBom } from "@/lib/salesPlanExecutionCsv";
import {
  isInvestorsCsvHeaderLine,
  parseRuNumber,
  shouldSilentlySkipInvestorsCsvMonthLabel,
  toNumber,
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
  /** 0…∞; при плане 0 — 0 (не null). */
  pct: number;
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
  return toNumber(row[idx]);
}

/** План из колонки «… сумма»; факт из колонки «… факт» или временно = plan. */
function numAtPlanFact(row: string[], planIdx: number | null, factIdx: number | null): { plan: number; fact: number } {
  const plan = numAt(row, planIdx);
  const fact = factIdx != null ? numAt(row, factIdx) : plan;
  return { plan, fact };
}

function completionChartFill(pct: number): string {
  if (!Number.isFinite(pct) || pct <= 0) return "#94a3b8";
  if (pct > 95) return "#10b981";
  if (pct >= 85) return "#f97316";
  return "#ef4444";
}

function buildCompletionRow(key: MacroCategoryKey, name: string, plan: number, fact: number): InvestorsCompletionChartRow {
  const planN = toNumber(plan);
  const factN = toNumber(fact);
  const rawPct = planN > 0 ? (factN / planN) * 100 : 0;
  const n = Number.isFinite(rawPct) ? Math.max(0, rawPct) : 0;
  const barLen = Math.min(108, n);
  return {
    key,
    name,
    pct: n,
    barLen,
    label: `${dec1Fmt.format(n)}%`,
    fill: completionChartFill(n),
  };
}

/** Ряды «Выполнение %» из нормализованных план/факт (только числа для Recharts). */
export function buildInvestorsCompletionChartRowsFromPlanFact(
  planFactRows: readonly InvestorsPlanFactChartRow[],
): InvestorsCompletionChartRow[] {
  return planFactRows.map((r) => buildCompletionRow(r.key as MacroCategoryKey, r.name, r.plan, r.fact));
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
      apartmentsPlan: toNumber(ap.plan as unknown),
      apartmentsFact: toNumber(ap.fact as unknown),
      parkingPlan: toNumber(pk.plan as unknown),
      parkingFact: toNumber(pk.fact as unknown),
      storagePlan: toNumber(st.plan as unknown),
      storageFact: toNumber(st.fact as unknown),
      commercialPlan: toNumber(cm.plan as unknown),
      commercialFact: toNumber(cm.fact as unknown),
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

  const totals = parsedRows.reduce(
    (acc, r) => ({
      apartmentsPlan: acc.apartmentsPlan + toNumber(r.apartmentsPlan as unknown),
      apartmentsFact: acc.apartmentsFact + toNumber(r.apartmentsFact as unknown),
      parkingPlan: acc.parkingPlan + toNumber(r.parkingPlan as unknown),
      parkingFact: acc.parkingFact + toNumber(r.parkingFact as unknown),
      storagePlan: acc.storagePlan + toNumber(r.storagePlan as unknown),
      storageFact: acc.storageFact + toNumber(r.storageFact as unknown),
      commercialPlan: acc.commercialPlan + toNumber(r.commercialPlan as unknown),
      commercialFact: acc.commercialFact + toNumber(r.commercialFact as unknown),
    }),
    {
      apartmentsPlan: 0,
      apartmentsFact: 0,
      parkingPlan: 0,
      parkingFact: 0,
      storagePlan: 0,
      storageFact: 0,
      commercialPlan: 0,
      commercialFact: 0,
    },
  );

  console.log("[aggregated totals]", totals);

  const byKey: Record<MacroCategoryKey, { plan: number; fact: number }> = {
    apartments: { plan: totals.apartmentsPlan, fact: totals.apartmentsFact },
    parking: { plan: totals.parkingPlan, fact: totals.parkingFact },
    storage: { plan: totals.storagePlan, fact: totals.storageFact },
    commercial: { plan: totals.commercialPlan, fact: totals.commercialFact },
  };

  const planFactChartRows: InvestorsPlanFactChartRow[] = MACRO_ORDER.map(({ key, name }) => ({
    key,
    name,
    plan: toNumber(byKey[key].plan as unknown),
    fact: toNumber(byKey[key].fact as unknown),
  }));

  console.table(planFactChartRows);

  const completionChartRows: InvestorsCompletionChartRow[] = planFactChartRows.map((r) =>
    buildCompletionRow(r.key as MacroCategoryKey, r.name, r.plan, r.fact),
  );

  console.table(completionChartRows);

  const investorsMacroChartsPayload = { planFactChartRows, completionChartRows };
  console.log("[parsed investors charts]", {
    ...investorsMacroChartsPayload,
    planLen: planFactChartRows.length,
    completionLen: completionChartRows.length,
  });

  return { ok: true, planFactChartRows, completionChartRows, warnings };
}

function normalizeStoredPlanFactRow(raw: unknown): InvestorsPlanFactChartRow {
  if (!raw || typeof raw !== "object") {
    return { key: "", name: "", plan: 0, fact: 0 };
  }
  const row = raw as Record<string, unknown>;
  return {
    key: String(row.key ?? ""),
    name: String(row.name ?? ""),
    plan: toNumber(row.plan),
    fact: toNumber(row.fact),
  };
}

export function parseStoredMarketingInvestorsCsv(raw: unknown): MarketingInvestorsCsvStoredV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (typeof o.updatedAt !== "string" || typeof o.fileName !== "string") return null;
  if (!Array.isArray(o.planFactChartRows) || !Array.isArray(o.completionChartRows)) return null;
  const warnings = Array.isArray(o.warnings) ? (o.warnings.filter((w) => typeof w === "string") as string[]) : [];
  const planFactChartRows = o.planFactChartRows.map((row: unknown) => normalizeStoredPlanFactRow(row));
  const completionChartRows = planFactChartRows.map((r) =>
    buildCompletionRow(r.key as MacroCategoryKey, r.name, r.plan, r.fact),
  );
  return {
    v: 1,
    updatedAt: o.updatedAt,
    fileName: o.fileName,
    planFactChartRows,
    completionChartRows,
    warnings,
  };
}

export function readMarketingInvestorsCsvFromLocalStorage(projectId: string): MarketingInvestorsCsvStoredV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const storageKey = marketingInvestorsCsvLocalStorageKey(projectId);
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      console.log("[loaded investors charts from localStorage]", { storageKey, doc: null, reason: "no_item" });
      return null;
    }
    const parsedJson = JSON.parse(raw) as unknown;
    const doc = parseStoredMarketingInvestorsCsv(parsedJson);
    console.log("[loaded investors charts from localStorage]", {
      storageKey,
      parseOk: !!doc,
      planLen: doc?.planFactChartRows?.length,
      completionLen: doc?.completionChartRows?.length,
      fileName: doc?.fileName,
    });
    return doc;
  } catch (e) {
    console.log("[loaded investors charts from localStorage]", { error: String(e) });
    return null;
  }
}

export function writeMarketingInvestorsCsvToLocalStorage(projectId: string, doc: MarketingInvestorsCsvStoredV1): void {
  if (typeof window === "undefined") return;
  try {
    const storageKey = marketingInvestorsCsvLocalStorageKey(projectId);
    console.log("[saving investors charts]", {
      storageKey,
      payload: {
        planFactChartRows: doc.planFactChartRows,
        completionChartRows: doc.completionChartRows,
        planLen: doc.planFactChartRows?.length,
        completionLen: doc.completionChartRows?.length,
        fileName: doc.fileName,
      },
    });
    window.localStorage.setItem(storageKey, JSON.stringify(doc));
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
