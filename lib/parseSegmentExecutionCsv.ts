/**
 * CSV «исполнение плана по сегментам» — только для bar charts
 * «План vs факт (накопительно)» и «Выполнение %» в блоке «Исполнение плана продаж».
 */

import { dec1Fmt } from "@/lib/salesPlanChartFormat";
import { normalizeSegmentName, normalizeUnitCell } from "@/lib/parseSalesUnitsExecutionCsv";
import { preprocessCell, stripBom } from "@/lib/salesPlanExecutionCsv";

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

function normHeader(s: string): string {
  return preprocessCell(s)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/:/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectDelimiter(raw: string): ";" | "\t" | "," {
  const s = stripBomStart(raw);
  if (s.includes(";")) return ";";
  if (s.includes("\t")) return "\t";
  return ",";
}

function splitRow(line: string, delim: ";" | "\t" | ","): string[] {
  if (delim === "\t") return line.split("\t").map((c) => preprocessCell(c));
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
      out.push(preprocessCell(cur));
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(preprocessCell(cur));
  return out;
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

type ColMap = {
  name: number;
  plan: number;
  fact: number;
  completion: number | null;
};

function buildColMap(headers: string[]): ColMap | null {
  let name = -1;
  let plan: number | null = null;
  let fact: number | null = null;
  let completion: number | null = null;

  for (let i = 0; i < headers.length; i++) {
    const h = normHeader(headers[i] ?? "");
    if (!h) continue;
    if (name < 0 && (h.includes("наимен") || h.includes("сегмент") || h === "категория")) {
      name = i;
    }
    if (h.includes("план") && !h.includes("месяц") && plan == null) {
      if (h.includes("накоп") || h.includes("проект") || h.includes("итого") || !h.includes("отчет")) {
        plan = i;
      }
    }
    if ((h.includes("факт") || h.includes("фактич")) && fact == null) {
      if (h.includes("накоп") || h.includes("дду") || !h.includes("месяц")) {
        fact = i;
      }
    }
    if (
      completion == null &&
      (h.includes("выполн") || h.includes("%") || h.includes("процент") || h.includes("pct"))
    ) {
      completion = i;
    }
  }

  if (name < 0) name = 0;
  if (plan == null || fact == null) return null;
  return { name, plan, fact, completion };
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

export function parseSegmentExecutionCsv(text: string): ParseSegmentExecutionCsvResult {
  const warnings: string[] = [];
  const delim = detectDelimiter(text);
  const lines = splitLines(text).filter((l) => preprocessCell(l) !== "");
  if (lines.length < 2) {
    return { ok: false, error: "Файл слишком короткий или пустой.", warnings };
  }

  let headerIdx = -1;
  let col: ColMap | null = null;
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const cells = splitRow(lines[i] ?? "", delim);
    const map = buildColMap(cells);
    if (map) {
      headerIdx = i;
      col = map;
      break;
    }
  }

  if (headerIdx < 0 || !col) {
    return {
      ok: false,
      error:
        "Не найдена строка заголовков: нужны колонки «Наименование», «План» (накопительно) и «Факт» (накопительно).",
      warnings,
    };
  }

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
