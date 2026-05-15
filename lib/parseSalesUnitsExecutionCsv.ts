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

const SEGMENT_ORDER: readonly { key: UnitsExecutionSegmentRow["key"]; label: string; aliases: readonly string[] }[] = [
  { key: "apartments", label: "Квартиры", aliases: ["квартиры", "квартира", "жилые помещения", "жилой фонд"] },
  { key: "parking", label: "Парковки", aliases: ["парковки", "паркинг", "машино-места", "машиноместа", "м/места"] },
  { key: "storage", label: "Кладовые", aliases: ["кладовые", "кладов", "кладовки", "кладовая"] },
  { key: "commercial", label: "Коммерческие помещения", aliases: ["коммерческие помещения", "коммерция", "нжп", "нежилые помещения"] },
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

/** Число неэкранированных `"` в строке (`""` в CSV — экранирование кавычки). */
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

/**
 * Excel иногда вставляет перевод строки внутри `"..."`; тогда одна логическая строка CSV разбивается на несколько.
 * Склеиваем физические строки, пока число `"` нечётное.
 */
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

function normCell(s: string): string {
  return preprocessCell(s)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Имя сегмента из ячейки «Наименование» (Excel): trim, lower, ё→е, без кавычек/NBSP/zero-width/переносов.
 * Для сопоставления с apartments / parking / storage / commercial.
 */
export function normalizeSegmentName(raw: string): string {
  let s = preprocessCell(String(raw ?? ""))
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\r\n/g, " ")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/[\u00a0\u202f\u2009\u2007\u2008\u200a]/g, " ");
  s = s.replace(/^[\s"'«»\u201c\u201d\u201e\u201f]+|[\s"'«»\u201c\u201d\u201e\u201f]+$/g, "");
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Нормализация заголовка ячейки (Excel CSV): lower, trim, без :, *, переносов, «скрытых» пробелов, ё→е.
 * Используется для поиска строки заголовков и сопоставления колонок.
 */
function normalizeHeader(s: string): string {
  let x = preprocessCell(String(s ?? ""))
    .replace(/\r\n/g, " ")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/:/g, "")
    .replace(/\*/g, "")
    .replace(/[\u00a0\u202f\u2009\u2007\u2008\u200a\u200b\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  x = x.replace(/^["'\u201c\u201d\u201e\u201f\u00ab\u00bb]+|["'\u201c\u201d\u201e\u201f\u00ab\u00bb]+$/g, "").trim();
  return x.replace(/\s+/g, " ").trim();
}

/** Разделитель: приоритет как в Excel-экспорте — `;`, иначе таб, иначе запятая. */
function detectDelimiter(raw: string): ";" | "\t" | "," {
  const s = stripBomStart(raw);
  if (s.includes(";")) return ";";
  if (s.includes("\t")) return "\t";
  return ",";
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

function splitRow(line: string, delim: ";" | "\t" | ","): string[] {
  return line.split(delim).map((c) => unwrapCsvCell(c));
}

/** Ячейка CSV из Excel: trim, переносы → пробел, снять оборачивающие `"` и экранирование `""`. */
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

/** Групповой заголовок «Количество, штук» — не смешивать с подписями второй строки (данные идут по sub-columns). */
function isQuantityPiecesGroupHeader(cell: string): boolean {
  const n = normalizeHeader(cell);
  return n.includes("количество") && n.includes("штук");
}

function findPrimaryHeaderRowIndex(lines: string[], delim: ";" | "\t" | ","): number {
  for (let i = 0; i < lines.length; i++) {
    const row = splitRow(lines[i] ?? "", delim);
    for (const cell of row) {
      const h = normalizeHeader(cell);
      if (h.includes("наимен") || h.includes("наименование")) return i;
    }
  }
  return -1;
}

/** Вторая строка заголовка: есть «План», «Факт» или «%» в подписях колонок. */
function findSecondaryHeaderRowIndex(lines: string[], primaryIdx: number, delim: ";" | "\t" | ","): number {
  for (let i = primaryIdx + 1; i < lines.length; i++) {
    const row = splitRow(lines[i] ?? "", delim);
    if (row.every((c) => preprocessCell(c) === "")) continue;
    for (const cell of row) {
      const h = normalizeHeader(cell);
      if (h.includes("план") || h.includes("факт") || h.includes("%")) return i;
    }
  }
  return -1;
}

/** Подпись группы из первой строки заголовка: пустые ячейки наследуют последнюю непустую слева. */
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

/** Слияние: группа (первая строка) + вторая строка → одна нормализованная подпись на колонку для colMap. */
function buildMergedHeaderLabels(primary: string[], secondary: string[]): string[] {
  const n = Math.max(primary.length, secondary.length);
  const primFilled = forwardFillPrimaryGroupLabels(primary, n);
  const sec = [...secondary];
  while (sec.length < n) sec.push("");
  const merged: string[] = [];
  for (let i = 0; i < n; i++) {
    let p = preprocessCell(primFilled[i] ?? "");
    if (isQuantityPiecesGroupHeader(p)) p = "";
    const s = preprocessCell(sec[i] ?? "");
    const combined = [p, s].filter((x) => x !== "").join(" ");
    merged.push(normalizeHeader(combined));
  }
  return merged;
}

function pickCol(headers: string[], predicate: (n: string) => boolean): number | null {
  for (let i = 0; i < headers.length; i++) {
    const n = normalizeHeader(headers[i] ?? "");
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
  const nameCol = pickCol(headers, (n) => n.includes("наимен") || n.includes("наименование"));
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

function shouldSkipName(segmentNorm: string): boolean {
  if (!segmentNorm) return true;
  if (segmentNorm.includes("итого")) return true;
  if (segmentNorm.includes("1-ком") || segmentNorm.includes("1 ком")) return true;
  if (segmentNorm.includes("2-ком") || segmentNorm.includes("2 ком")) return true;
  if (segmentNorm.includes("3-ком") || segmentNorm.includes("3 ком")) return true;
  if (segmentNorm.includes("вложен")) return true;
  if (segmentNorm.includes("комнат") && !segmentNorm.includes("коммерч")) return true;
  return false;
}

/** Совпадение с алиасом: полное имя или префикс до пробела/запятой/скобки и т.п. (не только `alias `). */
function matchSegment(segmentNorm: string): UnitsExecutionSegmentRow["key"] | null {
  const n = segmentNorm;
  if (!n) return null;
  for (const { key, aliases } of SEGMENT_ORDER) {
    const sorted = [...aliases].sort((a, b) => b.length - a.length);
    for (const a of sorted) {
      if (n === a) return key;
      if (n.startsWith(a)) {
        const rest = n.slice(a.length);
        if (rest === "" || /^[\s,;:.\-([{«]/u.test(rest)) return key;
      }
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

function extractReportDateYmd(lines: string[], delim: ";" | "\t" | ","): string {
  for (const line of lines) {
    const row = splitRow(line, delim);
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
  const delim = detectDelimiter(text);
  const physicalMerged = mergePhysicalLinesForQuotedNewlines(splitLines(text));
  const lines = physicalMerged.filter((l) => preprocessCell(l) !== "");
  if (lines.length < 2) {
    return { ok: false, error: "Файл слишком короткий или пустой.", warnings };
  }

  const reportDateYmd = extractReportDateYmd(lines, delim);

  const primaryIdx = findPrimaryHeaderRowIndex(lines, delim);
  if (primaryIdx < 0) {
    return { ok: false, error: "Не найдена строка заголовков (нужна колонка «Наименование»).", warnings };
  }

  const secondaryIdx = findSecondaryHeaderRowIndex(lines, primaryIdx, delim);
  if (secondaryIdx < 0) {
    return {
      ok: false,
      error: "Не найдена вторая строка заголовков (ожидаются подписи План / Факт / %).",
      warnings,
    };
  }

  const primaryHeader = splitRow(lines[primaryIdx] ?? "", delim).map((c) => preprocessCell(c));
  const secondaryHeader = splitRow(lines[secondaryIdx] ?? "", delim).map((c) => preprocessCell(c));
  const mergedHeaders = buildMergedHeaderLabels(primaryHeader, secondaryHeader);

  const col = buildColumnIndices(mergedHeaders);
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
  console.table({ primaryHeader, secondaryHeader, mergedHeaders, colMap });

  const byKey = new Map<UnitsExecutionSegmentRow["key"], UnitsExecutionSegmentRow>();
  const parsedRows: { key: UnitsExecutionSegmentRow["key"]; segment: string; plan: number; fact: number; completion: number }[] = [];

  for (let i = secondaryIdx + 1; i < lines.length; i++) {
    const row = splitRow(lines[i] ?? "", delim);
    if (row.every((c) => preprocessCell(c) === "")) continue;
    const nameRaw = preprocessCell(row[nameCol] ?? "");
    const segmentNorm = normalizeSegmentName(nameRaw);
    if (!segmentNorm) continue;
    if (shouldSkipName(segmentNorm)) continue;

    const segKey = matchSegment(segmentNorm);
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
      key: segKey,
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
