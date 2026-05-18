/**
 * CSV «исполнение плана по сегментам» — только для bar charts
 * «План vs факт (накопительно)» и «Выполнение %» в блоке «Исполнение плана продаж».
 */

import { parseMarketingInvestorsCsv } from "@/lib/marketingInvestorsCsv";
import { dec1Fmt } from "@/lib/salesPlanChartFormat";
import { normalizeSegmentName, normalizeUnitCell } from "@/lib/parseSalesUnitsExecutionCsv";
import { preprocessCell, stripBom } from "@/lib/salesPlanExecutionCsv";
import { isInvestorsCsvHeaderLine } from "@/src/shared/lib/csv/parseInvestorsCsv";

export type SegmentExecutionSegmentKey = "apartments" | "parking" | "storage" | "commercial";

export type SegmentExecutionPlanFactRow = {
  key: SegmentExecutionSegmentKey;
  segment: string;
  plan: number;
  fact: number;
};

export type SegmentExecutionCompletionRow = {
  key: SegmentExecutionSegmentKey;
  segment: string;
  pct: number;
  /** 0…108 — длина бара Recharts. */
  completion: number;
  label: string;
  fill: string;
};

const SEGMENT_ORDER: readonly {
  key: SegmentExecutionSegmentKey;
  label: string;
  aliases: readonly string[];
}[] = [
  { key: "apartments", label: "Квартиры", aliases: ["квартиры", "квартира", "жилые помещения"] },
  { key: "parking", label: "Парковки", aliases: ["парковки", "паркинг", "машино-места", "машиноместа"] },
  { key: "storage", label: "Кладовые", aliases: ["кладовые", "кладов", "кладовки"] },
  {
    key: "commercial",
    label: "Коммерческие помещения",
    aliases: ["коммерческие помещения", "коммерция", "нжп", "нежилые помещения"],
  },
];

function stripBomStart(raw: string): string {
  let s = stripBom(raw);
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.replace(/^\uFEFF/, "");
}

function splitLines(raw: string): string[] {
  return stripBomStart(raw)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");
}

function countUnescapedDoubleQuotes(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"') {
      if (s[i + 1] === '"') {
        i++;
        continue;
      }
      n++;
    }
  }
  return n;
}

function mergePhysicalLinesForQuotedNewlines(lines: string[]): string[] {
  const out: string[] = [];
  let acc = "";
  for (const line of lines) {
    acc = acc === "" ? line : `${acc}\n${line}`;
    if (countUnescapedDoubleQuotes(acc) % 2 === 0) {
      out.push(acc);
      acc = "";
    }
  }
  if (acc !== "") out.push(acc);
  return out;
}

/** Нормализация заголовка: lower, ё→е, без %/₽/скобок/NBSP/BOM, схлопнуть пробелы. */
export function normalizeSegmentExecutionHeader(s: string): string {
  let x = preprocessCell(String(s ?? ""))
    .replace(/\r\n/g, " ")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[₽%]/g, " ")
    .replace(/[()[\]{}«»]/g, " ")
    .replace(/:/g, " ")
    .replace(/\*/g, " ")
    .replace(/[\u00a0\u202f\u2009\u2007\u2008\u200a\u200b\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  x = x.replace(/^["'\u201c\u201d\u201e\u201f]+|["'\u201c\u201d\u201e\u201f]+$/g, "").trim();
  return x.replace(/\s+/g, " ").trim();
}

function detectDelimiter(raw: string): ";" | "\t" | "," {
  const s = stripBomStart(raw);
  if (s.includes(";")) return ";";
  if (s.includes("\t")) return "\t";
  return ",";
}

function unwrapCsvCell(raw: string | undefined | null): string {
  let s = preprocessCell(String(raw ?? ""));
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1).replace(/""/g, '"');
  }
  return s
    .replace(/\r\n/g, " ")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitRow(line: string, delim: ";" | "\t" | ","): string[] {
  if (delim === "\t") return line.split("\t").map((c) => unwrapCsvCell(c));
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      inQ = !inQ;
      continue;
    }
    if (!inQ && ch === delim) {
      out.push(unwrapCsvCell(cur));
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(unwrapCsvCell(cur));
  return out;
}

function rowHasNameColumnHeader(row: string[]): boolean {
  return row.some((cell) => {
    const h = normalizeSegmentExecutionHeader(cell);
    return h.includes("наимен") || h.includes("сегмент") || h === "категория";
  });
}

function lineLooksLikePrimaryHeader(line: string): boolean {
  const h = normalizeSegmentExecutionHeader(line.replace(/[;\t]/g, " "));
  return h.includes("наимен") || h.includes("сегмент");
}

function findPrimaryHeaderRowIndex(lines: string[], delim: ";" | "\t" | ","): number {
  for (let i = 0; i < lines.length; i++) {
    const row = splitRow(lines[i] ?? "", delim);
    if (rowHasNameColumnHeader(row)) return i;
    if (lineLooksLikePrimaryHeader(lines[i] ?? "")) return i;
  }
  return -1;
}

function findSecondaryHeaderRowIndex(lines: string[], primaryIdx: number, delim: ";" | "\t" | ","): number {
  for (let i = primaryIdx + 1; i < Math.min(lines.length, primaryIdx + 6); i++) {
    const row = splitRow(lines[i] ?? "", delim);
    if (row.every((c) => preprocessCell(c) === "")) continue;
    for (const cell of row) {
      const h = normalizeSegmentExecutionHeader(cell);
      if (h.includes("план") || h.includes("факт") || h.includes("%") || h.includes("completion")) return i;
    }
  }
  return -1;
}

function mergeHeaderRows(primaryCells: string[], secondaryCells: string[]): {
  raw: string[];
  normalized: string[];
} {
  const n = Math.max(primaryCells.length, secondaryCells.length);
  const primFilled = forwardFillPrimaryGroupLabels(primaryCells, n);
  const sec = [...secondaryCells];
  while (sec.length < n) sec.push("");
  const raw: string[] = [];
  const normalized: string[] = [];
  for (let i = 0; i < n; i++) {
    const combined = [preprocessCell(primFilled[i] ?? ""), preprocessCell(sec[i] ?? "")]
      .filter((x) => x !== "")
      .join(" ");
    raw.push(combined);
    normalized.push(normalizeSegmentExecutionHeader(combined));
  }
  return { raw, normalized };
}

function forwardFillPrimaryGroupLabels(primary: string[], targetLen: number): string[] {
  const p = [...primary];
  while (p.length < targetLen) p.push("");
  let last = "";
  const out: string[] = [];
  for (let i = 0; i < targetLen; i++) {
    const cell = preprocessCell(p[i] ?? "");
    if (cell) last = cell;
    out.push(last);
  }
  return out;
}

function scorePlanHeader(n: string): number {
  if (!n) return -1;
  if (!n.includes("план")) return -1;
  if (n.includes("выполн") || n.includes("completion")) return -1;
  if (n.includes("%") && !n.includes("план")) return -1;
  if (n.includes("месяц") && !n.includes("накоп")) return -1;
  let s = 10;
  if (n.includes("накопит") || n.includes("накоп")) s += 40;
  if (n.includes("факт") && n.includes("план")) s += 35;
  if (n.includes("млн") || n.includes("руб") || n.includes("тыс")) s += 8;
  if (n === "план" || n.endsWith(" план")) s += 25;
  if (n.includes("проект") && !n.includes("накоп")) s += 5;
  if (n.includes("отчет")) s -= 10;
  return s;
}

function scoreFactHeader(n: string): number {
  if (!n) return -1;
  if (!n.includes("факт") && !n.includes("фактич")) return -1;
  if (n.includes("план") && !n.includes("факт")) return -1;
  if (n.includes("выполн") && !n.includes("факт")) return -1;
  let s = 10;
  if (n.includes("накопит") || n.includes("накоп")) s += 40;
  if (n.includes("дду") || n.includes("заключ")) s += 15;
  if (n.includes("млн") || n.includes("руб") || n.includes("тыс")) s += 8;
  if (n === "факт" || n.endsWith(" факт") || n.startsWith("факт ")) s += 25;
  if (n.includes("месяц") && !n.includes("накоп")) return -1;
  if (n.includes("%")) s -= 5;
  return s;
}

function scoreCompletionHeader(n: string): number {
  if (!n) return -1;
  if (n.includes("completion")) return 50;
  if (n.includes("выполн") && (n.includes("%") || n.includes("процент"))) return 45;
  if (n.includes("%") && n.includes("выполн")) return 45;
  if (n === "%" || n.includes("процент выполн")) return 30;
  if (n.includes("%") && !n.includes("общего") && !n.includes("объем") && !n.includes("объём")) return 20;
  return -1;
}

function pickBestColumn(headers: string[], scoreFn: (n: string) => number, exclude: Set<number>): number | null {
  let bestI: number | null = null;
  let bestS = -1;
  for (let i = 0; i < headers.length; i++) {
    if (exclude.has(i)) continue;
    const n = headers[i] ?? "";
    const s = scoreFn(n);
    if (s > bestS) {
      bestS = s;
      bestI = i;
    }
  }
  return bestS >= 0 ? bestI : null;
}

type ColMap = {
  name: number;
  plan: number;
  fact: number;
  completion: number | null;
};

function buildColMapFromNormalizedHeaders(headers: string[]): ColMap | null {
  let name = pickBestColumn(headers, (n) => {
    if (n.includes("наимен") || n.includes("сегмент") || n === "категория") return 50;
    return -1;
  }, new Set());
  if (name == null) name = 0;

  const used = new Set<number>([name]);
  const plan = pickBestColumn(headers, scorePlanHeader, used);
  if (plan == null) return null;
  used.add(plan);

  const fact = pickBestColumn(headers, scoreFactHeader, used);
  if (fact == null) return null;
  used.add(fact);

  const completion = pickBestColumn(headers, scoreCompletionHeader, used);

  return { name, plan, fact, completion };
}

function resolveHeaderMap(
  lines: string[],
  delim: ";" | "\t" | ",",
): { headerIdx: number; col: ColMap; mergedHeaders: string[]; rawHeaders: string[] } | null {
  const primaryIdx = findPrimaryHeaderRowIndex(lines, delim);
  if (primaryIdx < 0) return null;

  const primaryRow = splitRow(lines[primaryIdx] ?? "", delim);
  const primCells = primaryRow.map((c) => preprocessCell(c));

  const attempts: { headerIdx: number; raw: string[]; normalized: string[] }[] = [];

  const singleNorm = primCells.map((c) => normalizeSegmentExecutionHeader(c));
  attempts.push({
    headerIdx: primaryIdx,
    raw: primCells,
    normalized: singleNorm,
  });

  if (primaryIdx > 0) {
    const groupRow = splitRow(lines[primaryIdx - 1] ?? "", delim).map((c) => preprocessCell(c));
    if (groupRow.some((c) => c !== "")) {
      const merged = mergeHeaderRows(groupRow, primCells);
      attempts.push({ headerIdx: primaryIdx, ...merged });
    }
  }

  const secondaryIdx = findSecondaryHeaderRowIndex(lines, primaryIdx, delim);
  if (secondaryIdx >= 0 && secondaryIdx !== primaryIdx) {
    const secondaryRow = splitRow(lines[secondaryIdx] ?? "", delim).map((c) => preprocessCell(c));
    const merged = mergeHeaderRows(primCells, secondaryRow);
    attempts.push({ headerIdx: secondaryIdx, ...merged });
    if (primaryIdx > 0) {
      const groupRow = splitRow(lines[primaryIdx - 1] ?? "", delim).map((c) => preprocessCell(c));
      if (groupRow.some((c) => c !== "")) {
        const mergedGroup = mergeHeaderRows(groupRow, secondaryRow);
        attempts.push({ headerIdx: secondaryIdx, ...mergedGroup });
      }
    }
  }

  for (const attempt of attempts) {
    const col = buildColMapFromNormalizedHeaders(attempt.normalized);
    if (col) {
      return {
        headerIdx: attempt.headerIdx,
        col,
        mergedHeaders: attempt.normalized,
        rawHeaders: attempt.raw,
      };
    }
  }

  return null;
}

function matchSegmentKey(segmentNorm: string): SegmentExecutionSegmentKey | null {
  if (!segmentNorm) return null;
  for (const s of SEGMENT_ORDER) {
    const labelNorm = normalizeSegmentName(s.label);
    if (segmentNorm === labelNorm || segmentNorm.includes(labelNorm) || labelNorm.includes(segmentNorm)) {
      return s.key;
    }
    for (const a of s.aliases) {
      const an = normalizeSegmentName(a);
      if (segmentNorm === an || segmentNorm.includes(an) || an.includes(segmentNorm)) return s.key;
    }
  }
  return null;
}

function isItogoName(n: string): boolean {
  return n.includes("итого") || n === "всего" || n.includes("total");
}

function completionChartFill(pct: number): string {
  if (!Number.isFinite(pct) || pct <= 0) return "#94a3b8";
  if (pct > 95) return "#10b981";
  if (pct >= 85) return "#f97316";
  return "#ef4444";
}

function buildCompletionRow(
  key: SegmentExecutionSegmentKey,
  segment: string,
  plan: number,
  fact: number,
  completionPct: number | null,
): SegmentExecutionCompletionRow {
  const planN = Number.isFinite(plan) ? plan : 0;
  const factN = Number.isFinite(fact) ? fact : 0;
  const rawPct =
    completionPct != null && Number.isFinite(completionPct)
      ? completionPct
      : planN > 0
        ? (factN / planN) * 100
        : 0;
  const pct = Number.isFinite(rawPct) ? Math.max(0, rawPct) : 0;
  const completion = Math.min(108, pct);
  return {
    key,
    segment,
    pct,
    completion,
    label: `${dec1Fmt.format(pct)}%`,
    fill: completionChartFill(pct),
  };
}

export type ParseSegmentExecutionCsvOk = {
  ok: true;
  planFactRows: SegmentExecutionPlanFactRow[];
  completionRows: SegmentExecutionCompletionRow[];
  warnings: string[];
};

export type ParseSegmentExecutionCsvFail = {
  ok: false;
  error: string;
  warnings?: string[];
};

export type ParseSegmentExecutionCsvResult = ParseSegmentExecutionCsvOk | ParseSegmentExecutionCsvFail;

function toSegmentKey(key: string): SegmentExecutionSegmentKey {
  if (key === "parking" || key === "storage" || key === "commercial") return key;
  return "apartments";
}

/** Помесячный CSV (год / месяц / квартиры…) → bar charts по сегментам. */
function parseSegmentExecutionFromInvestorsFormat(text: string): ParseSegmentExecutionCsvResult {
  const parsed = parseMarketingInvestorsCsv(text);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, warnings: parsed.warnings };
  }

  const planFactRows: SegmentExecutionPlanFactRow[] = parsed.planFactChartRows.map((r) => ({
    key: toSegmentKey(r.key),
    segment: r.segment || r.name,
    plan: r.plan,
    fact: r.fact,
  }));

  const completionRows: SegmentExecutionCompletionRow[] = parsed.completionChartRows.map((r) => ({
    key: toSegmentKey(r.key),
    segment: r.segment || r.name,
    pct: r.pct,
    completion: r.completion,
    label: r.label,
    fill: r.fill,
  }));

  const warnings = [
    ...(parsed.warnings ?? []),
    "Формат CSV: помесячный (год, месяц, квартиры…) — агрегировано по сегментам для графиков.",
  ];

  console.log("[segment execution csv] format", "investors-year-month");
  console.table(planFactRows);
  console.table(completionRows);

  return { ok: true, planFactRows, completionRows, warnings };
}

function detectInvestorsMacroHeader(lines: string[]): boolean {
  for (const line of lines) {
    if (isInvestorsCsvHeaderLine(line)) return true;
  }
  return false;
}

export function parseSegmentExecutionCsv(text: string): ParseSegmentExecutionCsvResult {
  const warnings: string[] = [];
  const delim = detectDelimiter(text);
  const physicalMerged = mergePhysicalLinesForQuotedNewlines(splitLines(text));
  const lines = physicalMerged.filter((l) => preprocessCell(l) !== "");
  if (lines.length < 2) {
    return { ok: false, error: "Файл слишком короткий или пустой.", warnings };
  }

  if (detectInvestorsMacroHeader(lines)) {
    return parseSegmentExecutionFromInvestorsFormat(text);
  }

  const resolved = resolveHeaderMap(lines, delim);
  if (!resolved) {
    const investorsFallback = parseSegmentExecutionFromInvestorsFormat(text);
    if (investorsFallback.ok) return investorsFallback;
    return {
      ok: false,
      error:
        "Не найдена строка заголовков. Ожидается таблица по сегментам (колонка «Наименование», план/факт накопительно) или помесячный формат (год, месяц, квартиры…).",
      warnings,
    };
  }

  console.log("[segment execution csv] format", "segment-table");

  const { headerIdx, col, mergedHeaders, rawHeaders } = resolved;

  const headerTable = rawHeaders.map((raw, i) => ({
    col: i,
    raw,
    normalized: mergedHeaders[i] ?? "",
  }));
  console.table(headerTable);
  console.log("[segment execution csv headers]", mergedHeaders);

  const byKey = new Map<
    SegmentExecutionSegmentKey,
    { plan: number; fact: number; completionPct: number | null }
  >();

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const row = splitRow(lines[i] ?? "", delim);
    if (row.every((c) => preprocessCell(c) === "")) continue;
    const nameRaw = preprocessCell(row[col.name] ?? "");
    const segmentNorm = normalizeSegmentName(nameRaw);
    if (!segmentNorm || isItogoName(segmentNorm)) continue;

    const segKey = matchSegmentKey(segmentNorm);
    if (!segKey) continue;

    const plan = normalizeUnitCell(row[col.plan] ?? "");
    const fact = normalizeUnitCell(row[col.fact] ?? "");
    const completionPct = col.completion != null ? normalizeUnitCell(row[col.completion] ?? "") : null;
    const label = SEGMENT_ORDER.find((s) => s.key === segKey)?.label ?? nameRaw;

    byKey.set(segKey, { plan, fact, completionPct });
    if (completionPct == null && plan > 0) {
      warnings.push(`Сегмент «${label}»: % выполнения вычислен как факт/план.`);
    }
  }

  const planFactRows: SegmentExecutionPlanFactRow[] = SEGMENT_ORDER.map((s) => {
    const cell = byKey.get(s.key);
    return {
      key: s.key,
      segment: s.label,
      plan: cell?.plan ?? 0,
      fact: cell?.fact ?? 0,
    };
  });

  const completionRows: SegmentExecutionCompletionRow[] = SEGMENT_ORDER.map((s) => {
    const cell = byKey.get(s.key);
    const pf = planFactRows.find((r) => r.key === s.key)!;
    return buildCompletionRow(s.key, pf.segment, pf.plan, pf.fact, cell?.completionPct ?? null);
  });

  const hasAny = planFactRows.some((r) => r.plan !== 0 || r.fact !== 0);
  if (!hasAny) {
    return {
      ok: false,
      error: "Не найдено строк по сегментам (Квартиры, Парковки, Кладовые, Коммерческие помещения).",
      warnings,
    };
  }

  console.table(planFactRows);
  console.table(completionRows);

  return { ok: true, planFactRows, completionRows, warnings };
}
