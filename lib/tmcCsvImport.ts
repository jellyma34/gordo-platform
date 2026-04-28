import Papa from "papaparse";

import { readCsvFileTextSmart } from "@/lib/csvTextEncoding";
import { ruDateCellToIsoOrNull } from "@/lib/gprReportCsv";
import type { ProjectPartKey } from "@/lib/gprUtils";
import { TMC_GPR_STAGE_ROOT_CODE, type TMCItem } from "@/lib/tmcData";

/** Число из ячейки Excel (пробелы в числе, запятая как десятичный разделитель). */
export function cleanNumber(val: unknown): number {
  if (val == null || val === "") return 0;
  const s = String(val)
    .replace(/\s/g, "")
    .replace(/\u00a0/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function looksLikeHeaderRow(row: unknown[]): boolean {
  return row.some((cell) => {
    const s = String(cell ?? "").toLowerCase();
    return s.includes("наименование") || s.includes("номенклатур");
  });
}

/**
 * Индекс первого столбца, у которого нормализованный заголовок содержит ВСЕ подстроки из `includesList`.
 */
export function findColumnIndex(headers: string[], includesList: string[]): number {
  const normalized = headers.map((h) =>
    String(h).replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, " "),
  );
  return normalized.findIndex((h) =>
    includesList.every((part) => h.includes(String(part).toLowerCase())),
  );
}

/** Первое совпадение по одному из наборов подстрок (приоритет сверху вниз). */
function pickColumnIndexByPatterns(headers: string[], patterns: string[][]): number {
  for (const parts of patterns) {
    const i = findColumnIndex(headers, parts);
    if (i >= 0) return i;
  }
  return -1;
}

/** ISO ГГГГ-ММ-ДД из произвольной ячейки (ДД.MM.ГГГГ, Excel serial опционально через gpr). */
export function normalizeImportedDate(val: unknown): string | null {
  if (val == null || val === "") return null;
  const t = String(val).trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const dotted = t.replace(/\//g, ".");
  const fromRu = ruDateCellToIsoOrNull(dotted);
  if (fromRu) return fromRu;
  const m = dotted.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    const d = m[1]!.padStart(2, "0");
    const mo = m[2]!.padStart(2, "0");
    const y = m[3]!;
    return `${y}-${mo}-${d}`;
  }
  return null;
}

/** Алиас для импорта ТМЦ (ДД.MM.ГГГГ → ISO). */
export const normalizeDate = normalizeImportedDate;

export type TmcDateColumnContext = {
  headers: string[];
  /** Дата поставки план → planStart */
  deliveryPlanIdx: number;
  /** Дата поставки факт → factStart */
  deliveryFactIdx: number;
  /** Дата договора план → planEnd */
  contractPlanIdx: number;
  /** Дата договора факт → factEnd */
  contractFactIdx: number;
  /**
   * Четыре даты подряд после колонки «Этап»: план поставки, факт поставки, план договора, факт договора.
   * Без подбора колонок по именам — только индексы.
   */
  relativeToStage?: boolean;
  /** Индекс колонки с этапом (для отладки). */
  stageIdx?: number;
};

function buildTmcDateColumnContext(headers: string[]): TmcDateColumnContext {
  const normalizedHeaders = headers.map((h) =>
    String(h).replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, " "),
  );
  const stageIdx = normalizedHeaders.findIndex((h) => h.includes("этап"));

  let deliveryPlanIdx = -1;
  let deliveryFactIdx = -1;
  let contractPlanIdx = -1;
  let contractFactIdx = -1;
  let relativeToStage = false;

  /** Плоская схема Excel: после колонки этапа идут 4 даты подряд */
  if (stageIdx >= 0 && stageIdx + 4 < headers.length) {
    deliveryPlanIdx = stageIdx + 1;
    deliveryFactIdx = stageIdx + 2;
    contractPlanIdx = stageIdx + 3;
    contractFactIdx = stageIdx + 4;
    relativeToStage = true;
  } else {
    deliveryPlanIdx = pickColumnIndexByPatterns(headers, [
      ["дата", "постав", "план"],
      ["поставк", "план"],
      ["отгруз", "план"],
      ["план", "постав"],
      ["постав", "план"],
    ]);
    deliveryFactIdx = pickColumnIndexByPatterns(headers, [
      ["дата", "постав", "факт"],
      ["поставк", "факт"],
      ["отгруз", "факт"],
      ["факт", "постав"],
      ["постав", "факт"],
    ]);
    contractPlanIdx = pickColumnIndexByPatterns(headers, [
      ["дата", "договор", "план"],
      ["договор", "план"],
      ["план", "договор"],
      ["контракт", "план"],
    ]);
    contractFactIdx = pickColumnIndexByPatterns(headers, [
      ["дата", "договор", "факт"],
      ["договор", "факт"],
      ["факт", "договор"],
      ["контракт", "факт"],
    ]);
  }

  if (typeof console !== "undefined") {
    console.log({
      headers,
      stageIdx,
      relativeToStage,
      planStartIdx: deliveryPlanIdx,
      factStartIdx: deliveryFactIdx,
      contractPlanIdx,
      contractFactIdx,
    });
  }

  return {
    headers,
    deliveryPlanIdx,
    deliveryFactIdx,
    contractPlanIdx,
    contractFactIdx,
    relativeToStage,
    stageIdx: stageIdx >= 0 ? stageIdx : undefined,
  };
}

export function cellAtColumnIndex(
  headers: string[],
  row: Record<string, unknown>,
  idx: number,
): string {
  if (idx < 0 || idx >= headers.length) return "";
  const k = headers[idx];
  if (k === undefined || !(k in row)) return "";
  const v = row[k];
  return v == null ? "" : String(v).trim();
}

/** Уникальные ключи объекта при повторяющихся подписях столбцов. */
function makeUniqueHeaderKeys(headerCells: string[]): string[] {
  const counts = new Map<string, number>();
  return headerCells.map((raw, i) => {
    const h = raw.replace(/^\uFEFF/, "").trim().replace(/\s+/g, " ") || `__col_${i}`;
    const n = (counts.get(h) ?? 0) + 1;
    counts.set(h, n);
    return n === 1 ? h : `${h}__dup_${i}`;
  });
}

/**
 * Парсинг без `header: true`: многострочная шапка Excel не ломает колонки.
 * Строка заголовков ищется по ячейке с «наименование» / «номенклатура».
 */
export type TmcCsvParsed = {
  rows: Record<string, string>[];
  headers: string[];
};

export function parseTmcCsvText(csvText: string): TmcCsvParsed {
  const result = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: true,
  });
  if (result.errors?.length) {
    console.warn("[tmc CSV]", result.errors.slice(0, 5));
  }

  const rawRows = Array.isArray(result.data) ? result.data : [];
  const rows = rawRows.filter(
    (row) => Array.isArray(row) && row.some((c) => String(c ?? "").trim() !== ""),
  );

  if (typeof console !== "undefined") {
    console.log("TOTAL ROWS:", rows.length);
  }

  const headerRowIndex = rows.findIndex((row) => looksLikeHeaderRow(row));

  if (headerRowIndex === -1) {
    throw new Error(
      "Не найдена строка заголовков: в CSV нет колонки с подписью «Наименование» (или «Номенклатура»).",
    );
  }

  const headerRaw = rows[headerRowIndex]!.map((h, i) =>
    String(h ?? "")
      .replace(/^\uFEFF/, "")
      .trim()
      .replace(/\s+/g, " "),
  );
  const headers = makeUniqueHeaderKeys(headerRaw);

  const dataRows = rows.slice(headerRowIndex + 1);

  const objects: Record<string, string>[] = dataRows.map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      const v = row[i];
      obj[h] = v == null ? "" : String(v).trim();
    });
    return obj;
  });

  if (typeof console !== "undefined") {
    console.log("DATA ROWS:", objects.length);
    console.log("CSV columns:", headers);
  }

  return { rows: objects, headers };
}

export async function parseTmcCsvFile(file: File): Promise<TmcCsvParsed> {
  const text = await readCsvFileTextSmart(file);
  return parseTmcCsvText(text);
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

/** Совпадение по подстроке в имени колонки (длинные заголовки из Excel). */
function pickCellSubstring(row: Record<string, unknown>, needles: string[]): string {
  const orderedNeedles = [...needles].sort((a, b) => b.length - a.length);
  for (const needle of orderedNeedles) {
    const nl = needle.toLowerCase();
    for (const k of Object.keys(row)) {
      const nk = k.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, " ");
      if (nk.includes(nl)) {
        const v = row[k];
        if (v == null) continue;
        const s = String(v).trim();
        if (s !== "") return s;
      }
    }
  }
  return "";
}

/** Этап ГПР для группировки дублей строк по одной позиции. */
function getTmcRowStage(row: Record<string, unknown>): string {
  const exact = pickCell(row, [
    "Этап работ ГПР",
    "Этап ГПР",
    "Этап",
    "gprStage",
    "stage",
  ]);
  if (exact.trim()) return exact.trim();
  return pickCellSubstring(row, ["этап работ гпр", "этап гпр", "этап гп", "этап", "gprstage", "stage"]).trim();
}

/** Наименование: известные заголовки, затем первое значение строки / первое непустое значение ячейки. */
function getTmcRowName(row: Record<string, unknown>): string {
  const fromKeys = pickCell(row, [
    "Наименование ТМЦ",
    "Название",
    "Наименование",
    "Номенклатура",
    "Материал",
    "Item",
    "name",
    "Наименование позиции",
    "Позиция",
  ]);
  if (fromKeys.trim()) return fromKeys.trim();

  const fuzzy = pickCellSubstring(row, ["наименование", "номенклатура", "название", "материал"]);
  if (fuzzy.trim()) return fuzzy.trim();

  const firstVal = Object.values(row)[0];
  if (firstVal != null && String(firstVal).trim() !== "") {
    return String(firstVal).trim();
  }

  for (const v of Object.values(row)) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s !== "") return s;
  }
  return "";
}

/**
 * Строка похожа на данные ТМЦ, а не на шапку / служебную строку.
 * Имя берётся через {@link getTmcRowName} (те же синонимы и fallback по ячейкам).
 */
/** Отсечение заголовков и служебных подписей по тексту наименования (без учёта строки CSV целиком). */
function isJunkTmcLabel(name: string): boolean {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ");

  /** Точные совпадения с типичными заголовками и подписями отчётов */
  const junkExact = new Set([
    "№ п/п",
    "№п/п",
    "п/п",
    "план",
    "факт",
    "отчетная дата:",
    "отчётная дата:",
    "наименование",
    "название",
    "номенклатура",
    "итого",
    "всего",
    "№",
    "no",
    "единица измерения",
    "ед.изм.",
    "ед изм",
  ]);

  if (junkExact.has(cleaned)) return true;

  /** Шапка «№ п/п» с вариациями пунктуации */
  if (/^№\s*п[/\\]?п\.?$/iu.test(name.trim())) return true;

  /** Только цифры — номер строки */
  if (/^\d+$/.test(cleaned)) return true;

  /** Только номер позиции: «12» или «3.» */
  if (/^\d+\s*[.)]\s*$/.test(cleaned)) return true;

  /** Строка из дефисов / точек */
  if (/^[\s\-–—.]+$/.test(cleaned)) return true;

  return false;
}

export function isValidTmcRow(row: Record<string, unknown>): boolean {
  const name = getTmcRowName(row);
  if (!name) return false;
  return !isJunkTmcLabel(name);
}

/**
 * Убирает «двойную шапку»: первые 1–5 строк, пока они не проходят {@link isValidTmcRow}.
 */
function dropLeadingJunkRows(rows: Record<string, unknown>[], maxLeadingSkip = 5): Record<string, unknown>[] {
  let i = 0;
  while (i < rows.length && i < maxLeadingSkip && !isValidTmcRow(rows[i])) {
    i += 1;
  }
  return rows.slice(i);
}

function parseProjectPart(raw: string): ProjectPartKey {
  const s = raw.trim().toLowerCase();
  if (!s) return "residential";
  if (
    s === "parking" ||
    s === "паркинг" ||
    s === "автостоянка" ||
    s === "2" ||
    s.includes("автостоян")
  ) {
    return "parking";
  }
  if (s === "1" || s.includes("жил")) return "residential";
  return "residential";
}

function inferGprStageFromItemCode(code: string): string {
  const t = code.trim();
  if (!t) return "Строительство зданий и сооружений";
  const parts = t.split(".").filter(Boolean);
  if (parts.length < 2) return "Строительство зданий и сооружений";
  const root = `${parts[0]}.${parts[1]}`;
  for (const [label, rootCode] of Object.entries(TMC_GPR_STAGE_ROOT_CODE)) {
    if (rootCode === root || t.startsWith(`${rootCode}.`)) return label;
  }
  return "Строительство зданий и сооружений";
}

function newIdFallback(index: number): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tmc-import-${Date.now()}-${index}`;
}

function normGroupKey(name: string, stage: string): string {
  const n = name.trim().toLowerCase().replace(/\s+/g, " ");
  const s = stage.trim().toLowerCase().replace(/\s+/g, " ");
  return `${n}__${s}`;
}

function mergeIsoMin(a: string | null, b: string | null): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a <= b ? a : b;
}

function mergeIsoMax(a: string | null, b: string | null): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a >= b ? a : b;
}

type ResolvedTmcRow = { row: Record<string, unknown>; name: string; stage: string };

/**
 * Подстановка наименования и этапа с предыдущей строки (lastValidName / lastValidStage)
 * — строки блока без повторённого «Наименование» и «Этап» не теряются.
 */
function resolveTmcRowsWithCarryForward(rows: Record<string, unknown>[]): ResolvedTmcRow[] {
  let lastValidName = "";
  let lastValidStage = "";
  const result: ResolvedTmcRow[] = [];

  for (const row of rows) {
    let name = getTmcRowName(row).trim();
    let stage = getTmcRowStage(row).trim();

    if (name) lastValidName = name;
    else name = lastValidName;

    if (stage) lastValidStage = stage;
    else stage = lastValidStage;

    const code = pickCell(row, [
      "Шифр",
      "Код",
      "Код позиции",
      "itemCode",
      "Шифр ГПР",
      "Код ГПР",
    ]).trim();

    if (!stage && code) stage = inferGprStageFromItemCode(code);

    result.push({ row, name, stage });
  }
  return result;
}

/**
 * Первая непустая дата по совпадению заголовков колонок строки (`includes` для каждого набора подстрок).
 */
function firstDateByHeaderPatterns(row: Record<string, unknown>, patterns: string[][]): string | null {
  const keys = Object.keys(row);
  for (const parts of patterns) {
    const idx = findColumnIndex(keys, parts);
    if (idx >= 0) {
      const k = keys[idx];
      const iso = normalizeImportedDate(k !== undefined ? row[k] : "");
      if (iso) return iso;
    }
  }
  return null;
}

/** Разбор чисел и дат одной строки CSV перед агрегацией по группе (name + stage). */
function parseTmcCsvRowSlice(row: Record<string, unknown>, dateCtx?: TmcDateColumnContext) {
  const itemCodeRaw = pickCell(row, [
    "Шифр",
    "Код",
    "Код позиции",
    "itemCode",
    "Шифр ГПР",
    "Код ГПР",
  ]);

  let planStart: string | null = null;
  let planEnd: string | null = null;
  let factStart: string | null = null;
  let factEnd: string | null = null;

  if (dateCtx) {
    const { headers, relativeToStage } = dateCtx;

    if (relativeToStage) {
      planStart = normalizeImportedDate(cellAtColumnIndex(headers, row, dateCtx.deliveryPlanIdx));
      factStart = normalizeImportedDate(cellAtColumnIndex(headers, row, dateCtx.deliveryFactIdx));
      planEnd = normalizeImportedDate(cellAtColumnIndex(headers, row, dateCtx.contractPlanIdx));
      factEnd = normalizeImportedDate(cellAtColumnIndex(headers, row, dateCtx.contractFactIdx));
    } else {
      planStart =
        normalizeImportedDate(cellAtColumnIndex(headers, row, dateCtx.deliveryPlanIdx)) ??
        firstDateByHeaderPatterns(row, [
          ["дата", "постав", "план"],
          ["постав", "план"],
          ["план", "нач"],
          ["начало", "план"],
        ]);
      factStart =
        normalizeImportedDate(cellAtColumnIndex(headers, row, dateCtx.deliveryFactIdx)) ??
        firstDateByHeaderPatterns(row, [
          ["дата", "постав", "факт"],
          ["постав", "факт"],
          ["факт", "нач"],
          ["начало", "факт"],
        ]);
      planEnd =
        normalizeImportedDate(cellAtColumnIndex(headers, row, dateCtx.contractPlanIdx)) ??
        firstDateByHeaderPatterns(row, [
          ["дата", "договор", "план"],
          ["договор", "план"],
          ["план", "договор"],
        ]);
      factEnd =
        normalizeImportedDate(cellAtColumnIndex(headers, row, dateCtx.contractFactIdx)) ??
        firstDateByHeaderPatterns(row, [
          ["дата", "договор", "факт"],
          ["договор", "факт"],
          ["факт", "договор"],
        ]);
    }
  } else {
    planStart = firstDateByHeaderPatterns(row, [
      ["план", "нач"],
      ["начало", "план"],
      ["дата", "план"],
    ]);
    factStart = firstDateByHeaderPatterns(row, [
      ["факт", "нач"],
      ["начало", "факт"],
      ["дата", "факт"],
    ]);
    planEnd = firstDateByHeaderPatterns(row, [
      ["план", "кон"],
      ["окончание", "план"],
      ["план", "оконч"],
    ]);
    factEnd = firstDateByHeaderPatterns(row, [
      ["факт", "кон"],
      ["окончание", "факт"],
    ]);
  }

  const planCostRaw = pickCell(row, [
    "Стоимость (руб.) План",
    "Стоимость (руб) план",
    "План ₽",
    "План стоимость",
    "Сумма план",
    "Бюджет",
    "Плановая стоимость",
    "Сумма",
    "Итого",
    "total",
    "planCost",
    "План",
  ]);

  const qtyRaw = pickCell(row, [
    "Объем поставки План",
    "Объем поставки",
    "Количество",
    "Qty",
    "quantity",
  ]);
  const priceRaw = pickCell(row, [
    "Цена закупки за ед. (руб.) План",
    "Цена закупки за ед. (руб.)",
    "Цена закупки за ед",
    "Цена",
    "price",
    "Цена за ед.",
    "Цена за единицу",
  ]);

  let planCost: number | undefined = planCostRaw ? cleanNumber(planCostRaw) : undefined;
  if (planCost === undefined && qtyRaw && priceRaw) {
    const q = cleanNumber(qtyRaw);
    const p = cleanNumber(priceRaw);
    planCost = q * p;
  }
  if (planCost === undefined) planCost = 0;

  const factRaw = pickCell(row, [
    "Стоимость (руб.) Факт",
    "Стоимость (руб) факт",
    "Факт ₽",
    "Факт стоимость",
    "Факт",
    "factCost",
  ]);
  let factCost: number | null = null;
  if (factRaw.trim()) {
    factCost = cleanNumber(factRaw);
  }

  const projectPart = parseProjectPart(
    pickCell(row, [
      "Часть проекта",
      "projectPart",
      "Объект",
      "Часть",
      "Зона",
    ]),
  );

  return {
    itemCodeRaw,
    planCost,
    factCost,
    planStart,
    planEnd,
    factStart,
    factEnd,
    projectPart,
  };
}

type TmcGroupAcc = {
  name: string;
  gprStage: string;
  planCost: number;
  factCostSum: number;
  factRowCount: number;
  planStart: string | null;
  planEnd: string | null;
  factStart: string | null;
  factEnd: string | null;
  itemCode: string;
  projectPart: ProjectPartKey;
  id: string;
};

/**
 * Полная замена реестра из CSV.
 * Строки с одним наименованием и этапом ГПР объединяются: суммы и факт суммируются, даты — min/max по строкам.
 */
export function normalizeTmcCsvRows(rows: Record<string, unknown>[], headers?: string[]): TMCItem[] {
  const dateCtx =
    headers && headers.length > 0 ? buildTmcDateColumnContext(headers) : undefined;

  const trimmed = dropLeadingJunkRows(rows);
  const resolved = resolveTmcRowsWithCarryForward(trimmed);

  const usable = resolved.filter((x) => {
    if (!x.name.trim()) return false;
    if (isJunkTmcLabel(x.name)) return false;
    if (!x.stage.trim()) return false;
    return true;
  });

  const map = new Map<string, TmcGroupAcc>();
  let synth = 0;
  let loggedSampleRow = false;

  for (const { row, name, stage } of usable) {
    if (!loggedSampleRow && dateCtx && typeof console !== "undefined") {
      loggedSampleRow = true;
      const h = dateCtx.headers;
      const supplyPlan = cellAtColumnIndex(h, row, dateCtx.deliveryPlanIdx);
      const supplyFact = cellAtColumnIndex(h, row, dateCtx.deliveryFactIdx);
      const contractPlan = cellAtColumnIndex(h, row, dateCtx.contractPlanIdx);
      const contractFact = cellAtColumnIndex(h, row, dateCtx.contractFactIdx);
      console.log({
        row,
        supplyPlan,
        supplyFact,
        contractPlan,
        contractFact,
      });
    }

    const slice = parseTmcCsvRowSlice(row, dateCtx);
    const key = normGroupKey(name, stage);
    let acc = map.get(key);
    if (!acc) {
      synth += 1;
      acc = {
        name: name.trim(),
        gprStage: stage.trim(),
        planCost: 0,
        factCostSum: 0,
        factRowCount: 0,
        planStart: null,
        planEnd: null,
        factStart: null,
        factEnd: null,
        itemCode: "",
        projectPart: slice.projectPart,
        id: newIdFallback(synth),
      };
      map.set(key, acc);
    }

    acc.planCost += slice.planCost;
    if (slice.factCost != null) {
      acc.factCostSum += slice.factCost;
      acc.factRowCount += 1;
    }

    acc.planStart = mergeIsoMin(acc.planStart, slice.planStart);
    acc.planEnd = mergeIsoMax(acc.planEnd, slice.planEnd);
    acc.factStart = mergeIsoMin(acc.factStart, slice.factStart);
    acc.factEnd = mergeIsoMax(acc.factEnd, slice.factEnd);

    if (!acc.itemCode.trim() && slice.itemCodeRaw.trim()) {
      acc.itemCode = slice.itemCodeRaw.trim();
    }
    acc.projectPart = slice.projectPart;
  }

  const out: TMCItem[] = [];
  let idx = 0;
  for (const acc of map.values()) {
    idx += 1;
    const itemCode =
      acc.itemCode.trim() || `2.05.99.${String(idx).padStart(3, "0")}`;
    const factCost: number | null = acc.factRowCount > 0 ? acc.factCostSum : null;

    out.push({
      id: acc.id,
      itemCode,
      name: acc.name,
      gprStage: acc.gprStage,
      planCost: acc.planCost,
      factCost,
      planStart: acc.planStart,
      planEnd: acc.planEnd,
      factStart: acc.factStart,
      factEnd: acc.factEnd,
      projectPart: acc.projectPart,
    });
  }

  return out;
}
