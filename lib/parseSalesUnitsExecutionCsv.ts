/**
 * CSV «штуки_Продажи.csv» — исполнение плана в штуках по сегментам (отдельный источник от plan_fact / investors / Verba).
 */

import { preprocessCell, stripBom } from "@/lib/salesPlanExecutionCsv";

export type UnitsExecutionSegmentRow = {
  key: "apartments" | "parking" | "storage" | "commercial";
  segment: string;
  planProject: number;
  planCumulative: number;
  factCumulative: number;
  deviationCumulative: number;
  completionPct: number;
  shareOfVolumePct: number;
};

export type UnitsExecutionTotals = {
  planCumulative: number;
  factCumulative: number;
  deviationCumulative: number;
  completionPct: number;
};

export type ParseSalesUnitsExecutionCsvOk = {
  ok: true;
  reportDateYmd: string;
  segments: UnitsExecutionSegmentRow[];
  totals: UnitsExecutionTotals;
  warnings: string[];
};

export type ParseSalesUnitsExecutionCsvFail = {
  ok: false;
  error: string;
  warnings?: string[];
};

export type ParseSalesUnitsExecutionCsvResult = ParseSalesUnitsExecutionCsvOk | ParseSalesUnitsExecutionCsvFail;

const DELIM = ";";

const SEGMENT_ORDER: readonly { key: UnitsExecutionSegmentRow["key"]; label: string; aliases: readonly string[] }[] = [
  { key: "apartments", label: "Квартиры", aliases: ["квартиры"] },
  { key: "parking", label: "Парковки", aliases: ["парковки", "паркинг"] },
  { key: "storage", label: "Кладовые", aliases: ["кладовые", "кладов"] },
  { key: "commercial", label: "Коммерческие помещения", aliases: ["коммерческие помещения", "коммерция", "нжп"] },
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

function normCell(s: string): string {
  return preprocessCell(s)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

/** Заголовок для сопоставления колонок: lower, без *, NBSP→пробел, схлопывание пробелов. */
function normHeaderForUnitsMap(s: string): string {
  return normCell(s)
    .replace(/\*/g, "")
    .replace(/[\u00a0\u202f\u2009]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** «88,2%», «1 234», «34» → число */
export function normalizeUnitCell(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value == null) return 0;
  const t = String(value)
    .trim()
    .replace(/%/g, "")
    .replace(/[\s\u00a0\u202f\u2009]+/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function splitRow(line: string): string[] {
  return line.split(DELIM).map((c) => preprocessCell(c));
}

function findHeaderRowIndex(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const row = splitRow(lines[i] ?? "");
    const joined = row.map(normCell).join(" ");
    if (joined.includes("наименован")) return i;
  }
  return -1;
}

function pickCol(headers: string[], predicate: (n: string) => boolean): number | null {
  for (let i = 0; i < headers.length; i++) {
    const n = normHeaderForUnitsMap(headers[i] ?? "");
    if (!n) continue;
    if (predicate(n)) return i;
  }
  return null;
}

function buildColumnIndices(headers: string[]): {
  nameCol: number;
  planCumulative: number | null;
  factCumulative: number | null;
  deviation: number | null;
  completionPct: number | null;
  shareVol: number | null;
} | null {
  const nameCol = pickCol(headers, (n) => n.includes("наименован"));
  if (nameCol == null) return null;

  /** План в штуках: «план накопит…»; fallback — план+накопит без % / выполн / проект. */
  let planCumulative = pickCol(
    headers,
    (n) =>
      n.includes("план накопит") &&
      !n.includes("%") &&
      !n.includes("выполн") &&
      !n.includes("проект"),
  );
  if (planCumulative == null) {
    planCumulative = pickCol(
      headers,
      (n) =>
        n.includes("план") &&
        (n.includes("накопит") || n.includes("накоп")) &&
        !n.includes("%") &&
        !n.includes("выполн") &&
        !n.includes("проект"),
    );
  }

  /** Факт в штуках: «Факт … накоп…» без %; предпочтительно ДДУ / заключённые. */
  const factCumulativeStrict = pickCol(
    headers,
    (n) =>
      n.includes("факт") &&
      (n.includes("накопит") || n.includes("накоп")) &&
      (n.includes("дду") || n.includes("заключ")) &&
      !n.includes("%"),
  );
  const factCumulative =
    factCumulativeStrict ??
    pickCol(
      headers,
      (n) => n.includes("факт") && (n.includes("накопит") || n.includes("накоп")) && !n.includes("%"),
    );

  /** «% выполнения накопительно», не «от общего объёма». */
  const completionPct = pickCol(
    headers,
    (n) =>
      n.includes("%") &&
      n.includes("выполн") &&
      (n.includes("накопит") || n.includes("накоп")) &&
      !n.includes("общего") &&
      !n.includes("объем") &&
      !n.includes("объём"),
  );

  const deviation = pickCol(
    headers,
    (n) =>
      (n.includes("откл") || n.includes("отклон")) &&
      (n.includes("накопит") || n.includes("накоп")) &&
      !n.includes("%"),
  );
  const shareVol = pickCol(
    headers,
    (n) => n.includes("%") && (n.includes("общего") || n.includes("объем") || n.includes("объём")),
  );

  if (planCumulative == null || factCumulative == null) return null;

  return { nameCol, planCumulative, factCumulative, deviation, completionPct, shareVol };
}

function shouldSkipName(nameNorm: string): boolean {
  if (!nameNorm) return true;
  if (nameNorm.includes("итого")) return true;
  if (nameNorm.includes("1-ком") || nameNorm.includes("1 ком")) return true;
  if (nameNorm.includes("2-ком") || nameNorm.includes("2 ком")) return true;
  if (nameNorm.includes("3-ком") || nameNorm.includes("3 ком")) return true;
  if (nameNorm.includes("вложен")) return true;
  if (nameNorm.includes("комнат") && !nameNorm.includes("коммерч")) return true;
  return false;
}

function matchSegment(nameNorm: string): UnitsExecutionSegmentRow["key"] | null {
  for (const { key, aliases } of SEGMENT_ORDER) {
    for (const a of aliases) {
      if (nameNorm === a || nameNorm.startsWith(a + " ") || nameNorm.startsWith(a + ",")) return key;
    }
  }
  return null;
}

function ruDateToYmd(text: string): string | null {
  const t = preprocessCell(text);
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t);
  if (m) {
    const d = m[1]!.padStart(2, "0");
    const mo = m[2]!.padStart(2, "0");
    const y = m[3]!;
    return `${y}-${mo}-${d}`;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

function extractReportDateYmd(lines: string[]): string {
  for (const line of lines) {
    const row = splitRow(line);
    if (row.length < 2) continue;
    const a0 = normCell(row[0] ?? "");
    if (a0.includes("отчетн") || a0.includes("отчётн")) {
      for (let j = 1; j < row.length; j++) {
        const ymd = ruDateToYmd(row[j] ?? "");
        if (ymd) return ymd;
      }
    }
    const joined = row.join(" ");
    const dm = /\b(\d{2})\.(\d{2})\.(\d{4})\b/.exec(joined);
    if (dm && (a0.includes("отчет") || a0.includes("отчёт") || joined.toLowerCase().includes("отчетная дата"))) {
      return `${dm[3]}-${dm[2]}-${dm[1]}`;
    }
  }
  return "";
}

export function parseSalesUnitsExecutionCsv(text: string): ParseSalesUnitsExecutionCsvResult {
  const warnings: string[] = [];
  const lines = splitLines(text).filter((l) => preprocessCell(l) !== "");
  if (lines.length < 2) {
    return { ok: false, error: "Файл слишком короткий или пустой.", warnings };
  }

  const reportDateYmd = extractReportDateYmd(lines);

  const headerIdx = findHeaderRowIndex(lines);
  if (headerIdx < 0) {
    return { ok: false, error: "Не найдена строка заголовков (нужна колонка «Наименование»).", warnings };
  }

  const headerRow = splitRow(lines[headerIdx] ?? "");
  const col = buildColumnIndices(headerRow);
  if (!col) {
    return {
      ok: false,
      error: "Не удалось сопоставить колонки: нужны «План накопит…» и «Факт накопит… по ДДУ» (или аналоги).",
      warnings,
    };
  }

  const nameCol = col.nameCol;
  const planCumIdx = col.planCumulative;
  const factCumIdx = col.factCumulative;
  if (planCumIdx == null || factCumIdx == null) {
    return { ok: false, error: "Не найдены колонки план/факт (накопительно).", warnings };
  }

  const colMap = {
    name: nameCol,
    plan: planCumIdx,
    fact: factCumIdx,
    completion: col.completionPct,
    deviation: col.deviation,
    share: col.shareVol,
  };
  console.log("UNITS CSV colMap", colMap);

  const byKey = new Map<UnitsExecutionSegmentRow["key"], UnitsExecutionSegmentRow>();
  const parsedRows: { segment: string; plan: number; fact: number; completion: number }[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const row = splitRow(lines[i] ?? "");
    if (row.every((c) => preprocessCell(c) === "")) continue;
    const nameRaw = preprocessCell(row[nameCol] ?? "");
    const nameNorm = normCell(nameRaw);
    if (!nameNorm) continue;
    if (shouldSkipName(nameNorm)) continue;

    const segKey = matchSegment(nameNorm);
    if (!segKey) continue;

    const planProject = 0;
    const planCumulative = normalizeUnitCell(row[planCumIdx] ?? "");
    const factCumulative = normalizeUnitCell(row[factCumIdx] ?? "");
    const deviationCumulative =
      col.deviation != null ? normalizeUnitCell(row[col.deviation]) : factCumulative - planCumulative;
    const completionPct = col.completionPct != null ? normalizeUnitCell(row[col.completionPct]) : 0;
    const shareOfVolumePct = col.shareVol != null ? normalizeUnitCell(row[col.shareVol]) : 0;

    const label = SEGMENT_ORDER.find((s) => s.key === segKey)?.label ?? nameRaw;

    parsedRows.push({
      segment: label,
      plan: planCumulative,
      fact: factCumulative,
      completion: completionPct,
    });
    byKey.set(segKey, {
      key: segKey,
      segment: label,
      planProject,
      planCumulative,
      factCumulative,
      deviationCumulative,
      completionPct,
      shareOfVolumePct,
    });
  }

  console.table(parsedRows);

  const segments: UnitsExecutionSegmentRow[] = [];
  for (const { key, label } of SEGMENT_ORDER) {
    const r = byKey.get(key);
    if (r) segments.push(r);
    else warnings.push(`Нет строки сегмента «${label}».`);
  }

  if (segments.length === 0) {
    return {
      ok: false,
      error: "Не найдено ни одной строки сегмента (Квартиры, Парковки, Кладовые, Коммерческие помещения).",
      warnings,
    };
  }

  let planSum = 0;
  let factSum = 0;
  let devSum = 0;
  for (const s of segments) {
    planSum += Number.isFinite(s.planCumulative) ? s.planCumulative : 0;
    factSum += Number.isFinite(s.factCumulative) ? s.factCumulative : 0;
    devSum += Number.isFinite(s.deviationCumulative) ? s.deviationCumulative : 0;
  }
  const completionAgg = planSum > 0 ? (factSum / planSum) * 100 : 0;

  const totals: UnitsExecutionTotals = {
    planCumulative: planSum,
    factCumulative: factSum,
    deviationCumulative: devSum,
    completionPct: Number.isFinite(completionAgg) ? Math.max(0, completionAgg) : 0,
  };

  if (!reportDateYmd) warnings.push("Не найдена отчётная дата — используйте строку «Отчетная дата» с датой ДД.ММ.ГГГГ.");

  return {
    ok: true,
    reportDateYmd: reportDateYmd || new Date().toISOString().slice(0, 10),
    segments,
    totals,
    warnings,
  };
}
