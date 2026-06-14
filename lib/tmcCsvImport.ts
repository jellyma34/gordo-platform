import Papa from "papaparse";

import { readCsvFileTextSmart } from "@/lib/csvTextEncoding";
import { ruDateCellToIsoOrNull } from "@/lib/gprReportCsv";
import type { ProjectPartKey } from "@/lib/gprUtils";
import {
  parseTmcSupplyStatus,
  syncTmcFinancials,
  TMC_GPR_STAGE_ROOT_CODE,
  type TMCItem,
  type TmcSupplyStatus,
} from "@/lib/tmcData";

/** Число из ячейки Excel (пробелы в числе, запятая как десятичный разделитель). Legacy: пустое → 0. */
export function cleanNumber(val: unknown): number {
  const n = parseImportNumber(val);
  return n ?? 0;
}

/** Число для импорта; пустая ячейка → null (не 0). */
export function parseImportNumber(val: unknown): number | null {
  if (val == null) return null;
  const s = String(val).trim();
  if (!s) return null;
  const normalized = s.replace(/\s/g, "").replace(/\u00a0/g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

export function normalizeHeaderCell(h: string): string {
  return String(h).replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Индекс первого столбца, у которого нормализованный заголовок содержит ВСЕ подстроки из `includesList`.
 */
export function findColumnIndex(headers: string[], includesList: string[]): number {
  const normalized = headers.map((x) => normalizeHeaderCell(String(x)));
  return normalized.findIndex((h) =>
    includesList.every((part) => h.includes(String(part).toLowerCase())),
  );
}

/** Первое совпадение по одному из синонимов (includes(name)), паттерны от более длинных к коротким. */
export function findColumnByIncludes(headersNorm: string[], possibleNames: string[]): number {
  const sorted = [...possibleNames].sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    const idx = headersNorm.findIndex((h) => h.includes(name));
    if (idx >= 0) return idx;
  }
  return -1;
}

function looksLikeHeaderRow(row: unknown[]): boolean {
  return row.some((cell) => {
    const s = String(cell ?? "").toLowerCase();
    return s.includes("наименование") || s.includes("номенклатур");
  });
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

export type TmcColumnMapKey =
  | "deliveryPlan"
  | "deliveryFact"
  | "contractPlan"
  | "contractFact"
  | "volumePlan"
  | "volumeFact"
  | "pricePlan"
  | "priceFact"
  | "costPlan"
  | "costFact"
  | "name"
  | "itemCode"
  | "stage"
  | "unit"
  | "supplier"
  | "contract"
  | "status"
  | "projectPart";

export type TmcColumnMap = Record<TmcColumnMapKey, number>;

/** Колонки метрик идут блоками по 3: План / Факт / Отклонение (откл игнорируется). */
export const TMC_METRIC_TRIPLET_STEP = 3;

/** Число блоков метрик подряд: дата поставки, дата договора, объём, цена, стоимость. */
export const TMC_METRIC_TRIPLET_BLOCKS = 5;

export type TmcMetricLayout = "triplet" | "legacy";

/** Описание колонок для лога и отладки. */
export function describeTmcColumnMap(headers: string[], colMap: TmcColumnMap): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const key of Object.keys(colMap) as TmcColumnMapKey[]) {
    const idx = colMap[key];
    out[key] = idx >= 0 && idx < headers.length ? `${idx}:${headers[idx]}` : -1;
  }
  return out;
}

/**
 * Порядок важен: сначала колонки с длинными уникальными подстроками, чтобы не занимать индекс «чужим» полем.
 */
const COLUMN_DEFINITIONS: { key: TmcColumnMapKey; patterns: string[] }[] = [
  {
    key: "deliveryPlan",
    patterns: [
      "дата поставки план",
      "дата отгрузки план",
      "дата поставки (план)",
      "поставки план",
      "отгрузка план",
      "план поставки",
    ],
  },
  {
    key: "deliveryFact",
    patterns: [
      "дата поставки факт",
      "дата отгрузки факт",
      "дата поставки (факт)",
      "поставки факт",
      "отгрузка факт",
      "факт поставки",
    ],
  },
  {
    key: "contractPlan",
    patterns: [
      "дата заключения договора план",
      "дата заключения договора (план)",
      "заключения договора план",
      "дата договора план",
      "контракт план",
      "договор план",
    ],
  },
  {
    key: "contractFact",
    patterns: [
      "дата заключения договора факт",
      "дата заключения договора (факт)",
      "заключения договора факт",
      "дата договора факт",
      "контракт факт",
      "договор факт",
    ],
  },
  {
    key: "volumePlan",
    patterns: [
      "объем поставки план",
      "объём поставки план",
      "объем план",
      "объём план",
      "количество план",
      "объем (план)",
    ],
  },
  {
    key: "volumeFact",
    patterns: [
      "объем поставки факт",
      "объём поставки факт",
      "объем факт",
      "объём факт",
      "количество факт",
      "объем (факт)",
    ],
  },
  {
    key: "pricePlan",
    patterns: [
      "цена закупки за ед. план",
      "цена закупки за единицу план",
      "цена закупки план",
      "цена за ед план",
      "цена за ед. план",
    ],
  },
  {
    key: "priceFact",
    patterns: [
      "цена закупки за ед. факт",
      "цена закупки за единицу факт",
      "цена закупки факт",
      "цена за ед факт",
      "цена за ед. факт",
    ],
  },
  {
    key: "costPlan",
    patterns: [
      "стоимость план",
      "стоимость (руб.) план",
      "сумма план",
      "план ₽",
      "план стоимость",
      "бюджет",
      "плановая стоимость",
    ],
  },
  {
    key: "costFact",
    patterns: [
      "стоимость факт",
      "стоимость (руб.) факт",
      "сумма факт",
      "факт ₽",
      "факт стоимость",
    ],
  },
  {
    key: "name",
    patterns: [
      "наименование тмц",
      "наименование позиции",
      "номенклатура",
      "наименование",
      "название",
      "материал",
      "позиция",
    ],
  },
  {
    key: "itemCode",
    patterns: ["шифр гпр", "код позиции", "шифр", "код гпр", "код", "itemcode"],
  },
  {
    key: "stage",
    patterns: ["этап работ гпр", "этап гпр", "этап работ", "этап", "gprstage"],
  },
  {
    key: "unit",
    patterns: ["единица измерения", "ед. изм.", "ед изм", "единица", "ед."],
  },
  { key: "supplier", patterns: ["поставщик", "supplier"] },
  {
    key: "contract",
    patterns: ["номер договора", "реквизиты договора", "договор", "контракт", "контракт №"],
  },
  { key: "status", patterns: ["статус поставки", "статус поставк", "статус"] },
  { key: "projectPart", patterns: ["часть проекта", "projectpart", "объект", "зона", "часть"] },
];

export function buildTmcColumnMap(headers: string[]): TmcColumnMap {
  const norm = headers.map((h) => normalizeHeaderCell(String(h)));
  const used = new Set<number>();
  const map = {} as TmcColumnMap;

  const emptyKeys: TmcColumnMapKey[] = [
    "deliveryPlan",
    "deliveryFact",
    "contractPlan",
    "contractFact",
    "volumePlan",
    "volumeFact",
    "pricePlan",
    "priceFact",
    "costPlan",
    "costFact",
    "name",
    "itemCode",
    "stage",
    "unit",
    "supplier",
    "contract",
    "status",
    "projectPart",
  ];
  for (const k of emptyKeys) map[k] = -1;

  for (const def of COLUMN_DEFINITIONS) {
    const ordered = [...def.patterns].sort((a, b) => b.length - a.length);
    outer: for (const pattern of ordered) {
      for (let i = 0; i < norm.length; i++) {
        if (used.has(i)) continue;
        if (norm[i].includes(pattern)) {
          map[def.key] = i;
          used.add(i);
          break outer;
        }
      }
    }
  }

  return map;
}

function tripletSubheaderOk(h: string | undefined, kind: "plan" | "fact" | "deviation"): boolean {
  if (!h) return false;
  if (kind === "plan") return h.includes("план");
  if (kind === "fact") return h.includes("факт");
  return h.includes("откл") || h.includes("отклон");
}

/** Плановая колонка блока «дата поставки» (не объём/цена/стоимость/договор). */
function isDeliveryPlanHeader(h: string): boolean {
  if (!tripletSubheaderOk(h, "plan")) return false;
  if (h.includes("объем") || h.includes("объём") || h.includes("цена") || h.includes("стоимост")) {
    return false;
  }
  if (h.includes("договор") || h.includes("заключен")) return false;
  return h.includes("дата") && (h.includes("постав") || h.includes("отгруз"));
}

function isContractPlanHeader(h: string): boolean {
  return (
    tripletSubheaderOk(h, "plan") &&
    (h.includes("договор") || h.includes("заключен") || h.includes("контракт")) &&
    !h.includes("объем") &&
    !h.includes("объём")
  );
}

function isVolumePlanHeader(h: string): boolean {
  return tripletSubheaderOk(h, "plan") && (h.includes("объем") || h.includes("объём"));
}

function isPricePlanHeader(h: string): boolean {
  return tripletSubheaderOk(h, "plan") && h.includes("цена");
}

function isCostPlanHeader(h: string): boolean {
  return tripletSubheaderOk(h, "plan") && h.includes("стоимост");
}

/** Пять блоков подряд: дата поставки → договор → объём → цена → стоимость (план/факт/откл.). */
function verifyFiveMetricTriplets(headersNorm: string[], start: number): boolean {
  const step = TMC_METRIC_TRIPLET_STEP;
  const planChecks = [
    isDeliveryPlanHeader,
    isContractPlanHeader,
    isVolumePlanHeader,
    isPricePlanHeader,
    isCostPlanHeader,
  ] as const;
  for (let block = 0; block < TMC_METRIC_TRIPLET_BLOCKS; block += 1) {
    const i = start + block * step;
    const planH = headersNorm[i];
    const factH = headersNorm[i + 1];
    const devH = headersNorm[i + 2];
    if (!planChecks[block]!(planH ?? "")) return false;
    if (!tripletSubheaderOk(factH, "fact")) return false;
    if (!tripletSubheaderOk(devH, "deviation")) return false;
  }
  return true;
}

/**
 * Индекс колонки «дата поставки — план»: начало цепочки из 5 троек План/Факт/Откл.
 * Короткие подстроки вроде «поставки план» намеренно не используются — они ложно
 * совпадают с «объём поставки план» и сдвигают разбор на колонку «откл.».
 */
export function findDeliveryPlanColumnStart(headersNorm: string[]): number {
  const need = TMC_METRIC_TRIPLET_STEP * TMC_METRIC_TRIPLET_BLOCKS;
  for (let i = 0; i <= headersNorm.length - need; i += 1) {
    if (!isDeliveryPlanHeader(headersNorm[i] ?? "")) continue;
    if (!verifyFiveMetricTriplets(headersNorm, i)) continue;
    return i;
  }
  return -1;
}

export function detectTripletMetricLayout(headers: string[]): {
  layout: TmcMetricLayout;
  tripletStart: number;
} {
  const norm = headers.map((h) => normalizeHeaderCell(String(h)));
  const tripletStart = findDeliveryPlanColumnStart(norm);
  const needCols = TMC_METRIC_TRIPLET_STEP * TMC_METRIC_TRIPLET_BLOCKS;
  if (tripletStart >= 0 && tripletStart + needCols <= headers.length) {
    return { layout: "triplet", tripletStart };
  }
  return { layout: "legacy", tripletStart: -1 };
}

function rawCellAt(headers: string[], row: Record<string, unknown>, idx: number): unknown {
  if (idx < 0 || idx >= headers.length) return undefined;
  const k = headers[idx];
  if (k === undefined || !(k in row)) return undefined;
  return row[k];
}

/**
 * Пять блоков подряд: дата поставки, дата договора, объём, цена, стоимость — в каждом [план, факт, откл.].
 */
function parseTripletMetricCells(
  row: Record<string, unknown>,
  headers: string[],
  startIdx: number,
): {
  supplyPlanDate: string | null;
  supplyFactDate: string | null;
  contractPlanDate: string | null;
  contractFactDate: string | null;
  volumePlanRaw: unknown;
  volumeFactRaw: unknown;
  pricePlanRaw: unknown;
  priceFactRaw: unknown;
  planCostRaw: unknown;
  factCostRaw: unknown;
} {
  let i = startIdx;

  const deliveryPlan = rawCellAt(headers, row, i);
  const deliveryFact = rawCellAt(headers, row, i + 1);
  i += TMC_METRIC_TRIPLET_STEP;

  const contractPlan = rawCellAt(headers, row, i);
  const contractFact = rawCellAt(headers, row, i + 1);
  i += TMC_METRIC_TRIPLET_STEP;

  const volumePlanRaw = rawCellAt(headers, row, i);
  const volumeFactRaw = rawCellAt(headers, row, i + 1);
  i += TMC_METRIC_TRIPLET_STEP;

  const pricePlanRaw = rawCellAt(headers, row, i);
  const priceFactRaw = rawCellAt(headers, row, i + 1);
  i += TMC_METRIC_TRIPLET_STEP;

  const planCostRaw = rawCellAt(headers, row, i);
  const factCostRaw = rawCellAt(headers, row, i + 1);

  return {
    supplyPlanDate: normalizeImportedDate(deliveryPlan),
    supplyFactDate: normalizeImportedDate(deliveryFact),
    contractPlanDate: normalizeImportedDate(contractPlan),
    contractFactDate: normalizeImportedDate(contractFact),
    volumePlanRaw,
    volumeFactRaw,
    pricePlanRaw,
    priceFactRaw,
    planCostRaw,
    factCostRaw,
  };
}

/** Контрольная первая строка шаблона «Поставка ТМЦ.csv». */
const TRIPLET_FIRST_ROW_EXPECT = {
  volumePlan: 47,
  volumeFact: 47,
  pricePlan: 36307.2,
  priceFact: 33997,
  planCost: 1706438.4,
  factCost: 1597859,
} as const;

function approxEq(a: number, b: number, eps: number): boolean {
  return Math.abs(a - b) <= eps;
}

function assertTripletFirstRowSample(slice: {
  volumePlan: number;
  volumeFact: number;
  pricePlan: number;
  priceFact: number;
  planCost: number;
  factCost: number | null;
}): void {
  const exp = TRIPLET_FIRST_ROW_EXPECT;
  const checks = [
    approxEq(slice.volumePlan, exp.volumePlan, 1e-4),
    approxEq(slice.volumeFact, exp.volumeFact, 1e-4),
    approxEq(slice.pricePlan, exp.pricePlan, 1),
    approxEq(slice.priceFact, exp.priceFact, 1),
    approxEq(slice.planCost, exp.planCost, 2),
    slice.factCost != null && approxEq(slice.factCost, exp.factCost, 2),
  ];
  if (checks.every(Boolean)) return;

  throw new Error(
    `[TMC CSV] Контроль первой строки не пройден. Ожидалось: объём=${exp.volumePlan}/${exp.volumeFact}, цена=${exp.pricePlan}/${exp.priceFact}, стоимость=${exp.planCost}/${exp.factCost}; получено: объём=${slice.volumePlan}/${slice.volumeFact}, цена=${slice.pricePlan}/${slice.priceFact}, стоимость=${slice.planCost}/${slice.factCost ?? "null"}.`,
  );
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

function forwardFillHeaderRow(cells: string[]): string[] {
  let last = "";
  return cells.map((c) => {
    const t = c.trim();
    if (t) last = t;
    return last;
  });
}

/** Вторая строка шапки: подписи «план» / «факт», без главного заголовка позиций. */
function looksLikeSecondHeaderRow(sub: unknown[], primary: unknown[]): boolean {
  const subS = sub.map((c) => String(c ?? "").trim().toLowerCase());
  if (subS.some((s) => s.includes("наименование") || s.includes("номенклатур"))) return false;

  let planFactTokens = 0;
  let deviationTokens = 0;
  for (const s of subS) {
    if (!s) continue;
    if (s === "план" || s === "факт") planFactTokens += 1;
    else if (/^план[\s.),]/u.test(s) || /^факт[\s.),]/u.test(s)) planFactTokens += 1;
    else if ((s.startsWith("план") || s.startsWith("факт")) && s.length < 18) planFactTokens += 1;
    if (s.includes("откл") || s.includes("отклон")) deviationTokens += 1;
  }

  return planFactTokens >= 2 || (planFactTokens >= 1 && deviationTokens >= 1);
}

/** Склейка двух строк заголовка Excel в один подписанный столбец на колонку. */
function mergeTwoHeaderRows(primary: unknown[], secondary: unknown[]): string[] {
  const a = forwardFillHeaderRow(
    primary.map((c) =>
      String(c ?? "").replace(/^\uFEFF/, "").trim().replace(/\s+/g, " "),
    ),
  );
  const bRaw = secondary.map((c) =>
    String(c ?? "").replace(/^\uFEFF/, "").trim().replace(/\s+/g, " "),
  );
  const b = forwardFillHeaderRow(bRaw);
  const len = Math.max(a.length, b.length);
  const out: string[] = [];
  for (let i = 0; i < len; i++) {
    const top = a[i] ?? "";
    const bot = b[i] ?? "";
    const botNorm = bot.toLowerCase();
    const topNorm = top.toLowerCase();
    const subIsMetricOnly =
      botNorm === "план" || botNorm === "факт" || botNorm.startsWith("откл");
    const topIsMetricGroup =
      topNorm.includes("дата") ||
      topNorm.includes("объем") ||
      topNorm.includes("объём") ||
      topNorm.includes("цена") ||
      topNorm.includes("стоимост");
    const merged =
      top && subIsMetricOnly && !topIsMetricGroup
        ? top
        : [top, bot].filter(Boolean).join(" ").trim().replace(/\s+/g, " ");
    out.push(merged || `__col_${i}`);
  }
  return out;
}

/**
 * Парсинг без `header: true`: многострочная шапка Excel не ломает колонки.
 * Строка заголовков ищется по ячейке с «наименование» / «номенклатура».
 */
export type TmcCsvParsed = {
  rows: Record<string, string>[];
  headers: string[];
};

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function sniffCsvDelimiter(text: string): string {
  const lines = stripBom(text).split(/\r?\n/).slice(0, 48);
  let commas = 0;
  let semis = 0;
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    commas += (t.match(/,/g) ?? []).length;
    semis += (t.match(/;/g) ?? []).length;
  }
  return semis > commas ? ";" : ",";
}

export function parseTmcCsvText(csvText: string): TmcCsvParsed {
  const delimiter = sniffCsvDelimiter(csvText);
  const result = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: true,
    delimiter,
  });
  if (result.errors?.length) {
    console.warn("[tmc CSV]", result.errors.slice(0, 5));
  }

  const rawRows = Array.isArray(result.data) ? result.data : [];
  const rows = rawRows.filter(
    (row) => Array.isArray(row) && row.some((c) => String(c ?? "").trim() !== ""),
  );

  const headerRowIndex = rows.findIndex((row) => looksLikeHeaderRow(row));

  if (headerRowIndex === -1) {
    throw new Error(
      "Не найдена строка заголовков: в CSV нет колонки с подписью «Наименование» (или «Номенклатура»).",
    );
  }

  const primaryHeaderRow = rows[headerRowIndex]!;
  const nextRow = rows[headerRowIndex + 1];

  let headerRaw: string[];
  let dataSliceStart: number;

  if (nextRow && looksLikeSecondHeaderRow(nextRow, primaryHeaderRow)) {
    headerRaw = mergeTwoHeaderRows(primaryHeaderRow, nextRow);
    dataSliceStart = headerRowIndex + 2;
  } else {
    headerRaw = primaryHeaderRow.map((h) =>
      String(h ?? "")
        .replace(/^\uFEFF/, "")
        .trim()
        .replace(/\s+/g, " "),
    );
    dataSliceStart = headerRowIndex + 1;
  }

  const headers = makeUniqueHeaderKeys(headerRaw);

  const dataRows = rows.slice(dataSliceStart);

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

function getMappedCell(
  row: Record<string, unknown>,
  headers: string[],
  colMap: TmcColumnMap,
  key: TmcColumnMapKey,
): string | null {
  const idx = colMap[key];
  if (idx === undefined || idx < 0 || idx >= headers.length) return null;
  const k = headers[idx];
  if (k === undefined || !(k in row)) return null;
  const v = row[k];
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** Этап ГПР для группировки дублей строк по одной позиции. */
function getTmcRowStage(row: Record<string, unknown>, headers: string[], colMap: TmcColumnMap): string {
  const mapped = getMappedCell(row, headers, colMap, "stage");
  if (mapped) return mapped.trim();
  const exact = pickCell(row, ["Этап работ ГПР", "Этап ГПР", "Этап", "gprStage", "stage"]);
  if (exact.trim()) return exact.trim();
  return pickCellSubstring(row, ["этап работ гпр", "этап гпр", "этап гп", "этап", "gprstage", "stage"]).trim();
}

/** Наименование: колонка из карты, затем известные заголовки. */
function getTmcRowName(row: Record<string, unknown>, headers: string[], colMap: TmcColumnMap): string {
  const mapped = getMappedCell(row, headers, colMap, "name");
  if (mapped?.trim()) return mapped.trim();

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

/** Отсечение заголовков и служебных подписей по тексту наименования (без учёта строки CSV целиком). */
function isJunkTmcLabel(name: string): boolean {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ");

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

  if (/^№\s*п[/\\]?п\.?$/iu.test(name.trim())) return true;

  if (/^\d+$/.test(cleaned)) return true;

  if (/^\d+\s*[.)]\s*$/.test(cleaned)) return true;

  if (/^[\s\-–—.]+$/.test(cleaned)) return true;

  return false;
}

export function isValidTmcRow(row: Record<string, unknown>): boolean {
  const name = getTmcRowName(row, [], {} as TmcColumnMap);
  if (!name) return false;
  return !isJunkTmcLabel(name);
}

function dropLeadingJunkRows(rows: Record<string, unknown>[], maxLeadingSkip = 5): Record<string, unknown>[] {
  let i = 0;
  while (i < rows.length && i < maxLeadingSkip && !isValidTmcRow(rows[i]!)) {
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

type ResolvedTmcRow = { row: Record<string, unknown>; name: string; stage: string };

function resolveTmcRowsWithCarryForward(
  rows: Record<string, unknown>[],
  headers: string[],
  colMap: TmcColumnMap,
): ResolvedTmcRow[] {
  let lastValidName = "";
  let lastValidStage = "";
  const result: ResolvedTmcRow[] = [];

  for (const row of rows) {
    let name = getTmcRowName(row, headers, colMap).trim();
    let stage = getTmcRowStage(row, headers, colMap).trim();

    if (name) lastValidName = name;
    else name = lastValidName;

    if (stage) lastValidStage = stage;
    else stage = lastValidStage;

    const code =
      getMappedCell(row, headers, colMap, "itemCode") ??
      pickCell(row, ["Шифр", "Код", "Код позиции", "itemCode", "Шифр ГПР", "Код ГПР"]).trim();

    if (!stage && code) stage = inferGprStageFromItemCode(code);

    result.push({ row, name, stage });
  }
  return result;
}

function parseTmcCsvRowSlice(
  row: Record<string, unknown>,
  headers: string[],
  colMap: TmcColumnMap,
  metric: { layout: TmcMetricLayout; tripletStart: number },
) {
  const itemCodeRaw =
    getMappedCell(row, headers, colMap, "itemCode") ??
    pickCell(row, ["Шифр", "Код", "Код позиции", "itemCode", "Шифр ГПР", "Код ГПР"]);

  let supplyPlanDate: string | null = null;
  let supplyFactDate: string | null = null;
  let contractPlanDate: string | null = null;
  let contractFactDate: string | null = null;
  let volumePlanRaw: unknown;
  let volumeFactRaw: unknown;
  let priceRaw: unknown;
  let priceFactRaw: unknown;
  let planCostRaw: unknown;
  let factCostRaw: unknown;

  if (metric.layout === "triplet" && metric.tripletStart >= 0) {
    const tm = parseTripletMetricCells(row, headers, metric.tripletStart);
    supplyPlanDate = tm.supplyPlanDate;
    supplyFactDate = tm.supplyFactDate;
    contractPlanDate = tm.contractPlanDate;
    contractFactDate = tm.contractFactDate;
    volumePlanRaw = tm.volumePlanRaw;
    volumeFactRaw = tm.volumeFactRaw;
    priceRaw = tm.pricePlanRaw;
    priceFactRaw = tm.priceFactRaw;
    planCostRaw = tm.planCostRaw;
    factCostRaw = tm.factCostRaw;
  } else {
    supplyPlanDate = normalizeImportedDate(getMappedCell(row, headers, colMap, "deliveryPlan"));
    supplyFactDate = normalizeImportedDate(getMappedCell(row, headers, colMap, "deliveryFact"));
    contractPlanDate = normalizeImportedDate(getMappedCell(row, headers, colMap, "contractPlan"));
    contractFactDate = normalizeImportedDate(getMappedCell(row, headers, colMap, "contractFact"));
    volumePlanRaw =
      getMappedCell(row, headers, colMap, "volumePlan") ??
      pickCell(row, [
        "Объем поставки План",
        "Объем план",
        "Объем поставки",
        "Количество",
        "Qty",
        "quantity",
      ]);
    volumeFactRaw =
      getMappedCell(row, headers, colMap, "volumeFact") ??
      pickCell(row, ["Объем факт", "Объем поставки Факт", "Объем поставки факт", "Объем (факт)"]);
    priceRaw =
      getMappedCell(row, headers, colMap, "pricePlan") ??
      pickCell(row, [
        "Цена закупки за ед. (руб.) План",
        "Цена закупки за ед. (руб.)",
        "Цена закупки за ед",
        "Цена план",
        "Цена",
        "price",
        "Цена за ед.",
        "Цена за единицу",
      ]);
    priceFactRaw =
      getMappedCell(row, headers, colMap, "priceFact") ??
      pickCell(row, ["Цена закупки за ед. (руб.) Факт", "Цена факт", "Цена закупки факт", "Цена (факт)"]);
    planCostRaw =
      getMappedCell(row, headers, colMap, "costPlan") ??
      pickCell(row, [
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
      ]);
    factCostRaw =
      getMappedCell(row, headers, colMap, "costFact") ??
      pickCell(row, [
        "Стоимость (руб.) Факт",
        "Стоимость (руб) факт",
        "Факт ₽",
        "Факт стоимость",
        "factCost",
      ]);
  }

  const unit =
    (getMappedCell(row, headers, colMap, "unit") ??
      pickCell(row, ["Ед. изм.", "Ед изм.", "Единица измерения", "Ед.", "unit"]).trim()) ||
    pickCellSubstring(row, ["ед изм", "ед.изм", "единица измерения"]).trim();

  const supplier =
    (getMappedCell(row, headers, colMap, "supplier") ??
      pickCell(row, ["Поставщик", "supplier"]).trim()) ||
    pickCellSubstring(row, ["поставщик"]).trim();

  const contract =
    (getMappedCell(row, headers, colMap, "contract") ??
      pickCell(row, ["Договор", "Номер договора", "Контракт"]).trim()) ||
    pickCellSubstring(row, ["договор", "контракт №", "номер договора"]).trim();

  const statusLine =
    (getMappedCell(row, headers, colMap, "status") ??
      pickCell(row, ["Статус поставки", "Статус"]).trim()) ||
    pickCellSubstring(row, ["статус"]).trim();
  const status = parseTmcSupplyStatus(statusLine);

  let planCost = parseImportNumber(planCostRaw);
  let volumePlan = parseImportNumber(volumePlanRaw);
  let pricePlan = parseImportNumber(priceRaw);
  let volumeFact = parseImportNumber(volumeFactRaw);
  let priceFact = parseImportNumber(priceFactRaw);

  if (volumePlan == null) volumePlan = 0;
  if (volumeFact == null) volumeFact = 0;
  if (pricePlan == null) pricePlan = 0;
  if (priceFact == null) priceFact = 0;

  if (
    planCost == null &&
    String(volumePlanRaw ?? "").trim() !== "" &&
    String(priceRaw ?? "").trim() !== ""
  ) {
    planCost = volumePlan * pricePlan;
  }
  if (planCost == null) planCost = 0;

  if (metric.layout !== "triplet") {
    if (volumePlan === 0 && pricePlan === 0 && planCost > 0) {
      volumePlan = 1;
      pricePlan = planCost;
    }
  }

  const factCost: number | null = parseImportNumber(factCostRaw ?? "");

  if (metric.layout !== "triplet") {
    if (volumeFact === 0 && priceFact === 0 && factCost != null && factCost > 0) {
      volumeFact = 1;
      priceFact = factCost;
    }
  }

  if (pricePlan === 0 && planCost > 0 && volumePlan > 0) {
    pricePlan = planCost / volumePlan;
  }
  if (priceFact === 0 && factCost != null && factCost > 0 && volumeFact > 0) {
    priceFact = factCost / volumeFact;
  }

  const projectPartRaw =
    getMappedCell(row, headers, colMap, "projectPart") ??
    pickCell(row, ["Часть проекта", "projectPart", "Объект", "Часть", "Зона"]);
  const projectPart = parseProjectPart(projectPartRaw ?? "");

  return {
    itemCodeRaw,
    unit,
    supplier,
    contract,
    status,
    volumePlan,
    volumeFact,
    pricePlan,
    priceFact,
    planCost,
    factCost,
    supplyPlanDate,
    contractPlanDate,
    supplyFactDate,
    contractFactDate,
    projectPart,
  };
}

/**
 * Полная замена реестра из CSV.
 * Одна строка файла → одна позиция ТМЦ (без склейки дубликатов по имени/этапу).
 */
export function normalizeTmcCsvRows(rows: Record<string, unknown>[], headers?: string[]): TMCItem[] {
  if (!headers || headers.length === 0) {
    console.warn("[tmc CSV] normalizeTmcCsvRows: не переданы заголовки столбцов");
    return [];
  }

  const metric = detectTripletMetricLayout(headers);
  const colMap = buildTmcColumnMap(headers);

  const trimmed = dropLeadingJunkRows(rows);
  const resolved = resolveTmcRowsWithCarryForward(trimmed, headers, colMap);

  const usable = resolved.filter((x) => {
    if (!x.name.trim()) return false;
    if (isJunkTmcLabel(x.name)) return false;
    return true;
  });

  if (typeof console !== "undefined") {
    console.log({
      parsedRows: usable.length,
      mappedColumns: describeTmcColumnMap(headers, colMap),
      metricLayout: metric.layout,
      tripletColumnStart: metric.tripletStart,
    });
  }

  const out: TMCItem[] = [];
  let idx = 0;
  let tripletSampleDone = false;

  for (const { row, name, stage } of usable) {
    idx += 1;
    const slice = parseTmcCsvRowSlice(row, headers, colMap, metric);

    if (metric.layout === "triplet" && !tripletSampleDone) {
      tripletSampleDone = true;
      assertTripletFirstRowSample(slice);
      if (typeof console !== "undefined") {
        console.log({
          volumePlan: slice.volumePlan,
          volumeFact: slice.volumeFact,
          pricePlan: slice.pricePlan,
          priceFact: slice.priceFact,
          costPlan: slice.planCost,
          costFact: slice.factCost,
        });
      }
    }

    let gprStage = stage.trim();
    if (!gprStage) gprStage = inferGprStageFromItemCode(slice.itemCodeRaw.trim());

    const itemCode = slice.itemCodeRaw.trim() || `2.05.99.${String(idx).padStart(3, "0")}`;

    const draft: TMCItem = {
      id: newIdFallback(idx),
      itemCode,
      name: name.trim(),
      gprStage,
      unit: slice.unit.trim() || "шт",
      volumePlan: slice.volumePlan,
      volumeFact: slice.volumeFact,
      pricePlan: slice.pricePlan,
      priceFact: slice.priceFact,
      totalPlan: 0,
      totalFact: 0,
      supplier: slice.supplier.trim(),
      contract: slice.contract.trim(),
      status: slice.status,
      planCost: slice.planCost,
      factCost: slice.factCost,
      supplyPlanDate: slice.supplyPlanDate,
      contractPlanDate: slice.contractPlanDate,
      supplyFactDate: slice.supplyFactDate,
      contractFactDate: slice.contractFactDate,
      projectPart: slice.projectPart,
    };

    out.push(syncTmcFinancials(draft));
  }

  return out;
}
