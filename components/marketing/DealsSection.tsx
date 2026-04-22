"use client";

/**
 * Раздел «Сделки»: рабочий режим — только таблицы и цифры; презентация — DealsPresentation.
 */

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

const DealsPresentationPanel = dynamic(() => import("./DealsPresentation"), { ssr: false });

/** Пустое текстовое поле (менеджер, источник, вид сделки и т.д.). */
export const DEALS_LABEL_UNSPECIFIED = "Не указан";
/** Нет названия объекта в выгрузке (`object.name` / `object.project_name`). */
export const DEALS_LABEL_UNNAMED_OBJECT = "Без названия";
/** Совместимость с импортами: то же, что «Не указан». */
export const DEALS_EMPTY_LABEL = DEALS_LABEL_UNSPECIFIED;
/** Нет значения (Δ к пред. месяцу, итоговая строка и т.п.). */
export const DEALS_LABEL_EM_DASH = "—";

const DEALS_TABLE_NO_ROWS = "В срезе нет строк — измените фильтры или загрузите данные.";

const DEALS_BY_MONTH_STORAGE_KEY = "dealsByMonth";

const panelClass = "rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4";
const tableWrapClass = "mt-4 w-full min-w-0 rounded-lg border border-slate-200";
const tableClass = "w-full border-collapse text-sm";
const filterBarClass =
  "flex flex-wrap items-end gap-4 rounded-lg border border-slate-200 bg-slate-50/90 px-4 py-3";
const selectClass =
  "mt-1 min-w-[11rem] rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 shadow-sm";

const numFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const pctFmt = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const rubFmt = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
/** Площади в блоке «Параметры объекта»: до 1 знака + м². */
const dealObjectAreaFmt = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
/** Цена в блоке «Параметры объекта»: ₽ с разделителями разрядов. */
const dealObjectPriceFmt = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
/** Цена за м² в той же таблице: число + «₽/м²». */
const dealObjectRubPerM2Fmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
/** Доли сегмента относительно всего среза: 0.68 → «68%». */
const sharePctFmt = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 0 });

function dealsCountRu(n: number): string {
  const v = Math.floor(Math.abs(n));
  const mod100 = v % 100;
  const mod10 = v % 10;
  const word =
    mod100 > 10 && mod100 < 20 ? "сделок" : mod10 === 1 ? "сделка" : mod10 >= 2 && mod10 <= 4 ? "сделки" : "сделок";
  return `${numFmt.format(n)} ${word}`;
}

/** Краткая сумма для KPI сегмента: крупные — «261 млн ₽», иначе обычный ₽. */
function formatSumRubSegment(sumRub: number): string {
  if (!Number.isFinite(sumRub)) return rubFmt.format(0);
  if (Math.abs(sumRub) >= 1_000_000) {
    const mln = sumRub / 1_000_000;
    const dec = Math.abs(mln - Math.round(mln)) < 1e-9 ? 0 : 1;
    const s = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: dec, minimumFractionDigits: 0 }).format(mln);
    return `${s} млн ₽`;
  }
  return rubFmt.format(sumRub);
}

type SegmentKpiVisualVariant = "apartment" | "parking" | "storage" | "commercial";

function segmentKpiCardClass(variant: SegmentKpiVisualVariant): string {
  switch (variant) {
    case "apartment":
      return "rounded-xl border-2 border-indigo-300 bg-gradient-to-b from-indigo-50/95 to-white p-4 shadow-md ring-1 ring-indigo-200/50";
    case "parking":
      return "rounded-xl border border-slate-200 bg-slate-50/50 p-4 shadow-sm";
    case "storage":
      return "rounded-xl border border-slate-200 bg-white p-4 shadow-sm";
    case "commercial":
      return "rounded-xl border border-amber-400/75 bg-gradient-to-b from-amber-50/95 to-white p-4 shadow-sm ring-1 ring-amber-200/45";
    default:
      return "";
  }
}

function segmentKpiTitleClass(variant: SegmentKpiVisualVariant): string {
  switch (variant) {
    case "apartment":
      return "text-base font-bold text-indigo-950";
    case "parking":
      return "text-sm font-semibold text-slate-800";
    case "storage":
      return "text-sm font-semibold text-slate-800";
    case "commercial":
      return "text-base font-bold text-amber-950";
    default:
      return "";
  }
}

export type DealRecord = {
  deal_date?: string;
  /** Дата закрытия / подписания (альтернатива date / deal_date в выгрузках). */
  close_date?: string;
  /** Период сделки в формате YYYY-MM (агрегаты «по месяцам»). */
  month?: string;
  deal_sum?: string | number;
  /** Сумма (альтернативные имена в API). */
  amount?: string | number;
  budget?: string | number;
  /** План по сделке (если есть в выгрузке). */
  plan_sum?: string | number;
  planned_revenue?: string | number;
  plan_amount?: string | number;
  /** Тип объекта / сегмент (см. {@link resolveDealSegmentType}). */
  type?: string;
  object_type?: string;
  deal_type?: string;
  dealType?: string;
  date?: string;
  created_at?: string;
  status?: string;
  client_name?: string;
  house_name?: string;
  project_name?: string;
  object?: string;
  zhk?: string;
  jk?: string;
  complex_name?: string;
  manager?: string;
  manager_name?: string;
  responsible?: string;
  source?: string;
  deal_source?: string;
  utm_source?: string;
  deal_area?: string | number;
};

/** Ссылка на объект сделки в выгрузке: категория, имя, проект. */
export type DealObjectRef = {
  category?: string;
  category_name?: string;
  name?: string;
  project_name?: string;
  /** Код типа объекта (вместе с deal.type) — см. {@link resolveDealSegmentType}. */
  type?: string;
  object_type?: string;
  /** Параметры объекта из выгрузки (camelCase / snake_case). */
  areaTotal?: string | number;
  area_total?: string | number;
  areaLiving?: string | number;
  area_living?: string | number;
  areaBalcony?: string | number;
  area_balcony?: string | number;
  floor?: string | number;
  price?: string | number;
  section?: string;
  /** Площадь в выгрузке Trankeys / аналоги. */
  estate_area?: string | number;
  estate_floor?: string | number;
  geo_house_section?: string;
};

export type DealClientRef = {
  name?: string;
};

export type DealExportRow = {
  id?: string | number;
  deal?: DealRecord;
  object?: DealObjectRef;
  client?: DealClientRef;
  /** Верхнеуровневый проект, если не задан в object. */
  project?: string;
};

/** Сделки по месяцам (ключ YYYY-MM). */
export type DealsByMonth = Record<string, DealExportRow[]>;

export type DealsPerMonthGrouped = Record<string, { count: number; sum: number }>;

export type SegmentBucket = { count: number; sum: number };

/** Сегмент по `object.category` / `object.category_name` (см. {@link resolveObjectSegmentType}). */
export type NormalizedObjectType = "apartment" | "parking" | "storage" | "commercial" | "unknown";

export const OBJECT_TYPE_LABEL_RU: Record<NormalizedObjectType, string> = {
  apartment: "Квартиры",
  parking: "Машино-места",
  storage: "Кладовые",
  commercial: "Коммерция",
  unknown: "Не определено",
};

const DEAL_KIND_FIELD_KEYS = ["deal_type", "deal_kind", "contract_type"] as const;

/** Порядок опций фильтра «Тип» (тип объекта). */
const OBJECT_TYPE_FILTER_ORDER: string[] = [
  OBJECT_TYPE_LABEL_RU.apartment,
  OBJECT_TYPE_LABEL_RU.parking,
  OBJECT_TYPE_LABEL_RU.storage,
  OBJECT_TYPE_LABEL_RU.commercial,
  OBJECT_TYPE_LABEL_RU.unknown,
];

/** Поля объекта недвижимости из JSON (object / deal). */
export type DealObjectParams = {
  areaTotal: number | null;
  areaLiving: number | null;
  areaBalcony: number | null;
  floor: string | null;
  price: number | null;
  /** Тип / планировка из выгрузки (не путать с сегментом typeLabel). */
  type: string | null;
  section: string | null;
};

export type NormalizedDealRow = {
  dealDate: string;
  dealDateMs: number;
  monthKey: string;
  sumRub: number;
  /** План в ₽ из полей выгрузки (plan_sum / planned_revenue / plan_amount), иначе 0. */
  planRub: number;
  /** Сегмент по `object` (category + при необходимости category_name). */
  normalizedType: NormalizedObjectType;
  /** Подпись сегмента для фильтров и таблиц (на русском). */
  typeLabel: string;
  /** Вид сделки (ДДУ, бронь и т.д.) — из deal_type / deal_kind, не путать с типом объекта. */
  dealKindLabel: string;
  /** Проект / объект (из {@link normalizeDeal}, поле project). */
  objectLabel: string;
  managerLabel: string;
  sourceLabel: string;
  statusLabel: string;
  clientLabel: string;
  objectParams: DealObjectParams;
  /** Нормализованный `object.category` для сортировки таблицы «Параметры объекта». */
  objectCategoryCode: string | null;
};

/** Порядок групп: flat → garage → storageroom → comm (остальные в конце). */
export const OBJECT_PARAMS_TABLE_TYPE_ORDER: Record<string, number> = {
  flat: 1,
  garage: 2,
  storageroom: 3,
  storage: 3,
  comm: 4,
};

function objectParamsTableTypeRank(code: string | null | undefined): number {
  if (code == null || String(code).trim() === "") return 999;
  const c = String(code).trim().toLowerCase();
  return OBJECT_PARAMS_TABLE_TYPE_ORDER[c] ?? 999;
}

/** ORDER BY type ASC (по {@link OBJECT_PARAMS_TABLE_TYPE_ORDER}), затем deal_date DESC. */
export function compareForObjectParamsTable(a: NormalizedDealRow, b: NormalizedDealRow): number {
  const ta = objectParamsTableTypeRank(a.objectCategoryCode);
  const tb = objectParamsTableTypeRank(b.objectCategoryCode);
  if (ta !== tb) return ta - tb;
  return b.dealDateMs - a.dealDateMs;
}

/** Результат универсальной нормализации одной строки выгрузки (до агрегаций). */
export type NormalizedDealFields = {
  project: string;
  manager: string;
  source: string;
  amount: number;
  planRub: number;
  dateStr: string;
  dateMs: number;
  monthKey: string;
  status: string;
  client: string;
  dealKind: string;
};

export type DealMetrics = {
  totalCount: number;
  totalSum: number;
  dealsPerMonth: DealsPerMonthGrouped;
  sumPerMonth: Record<string, number>;
  avgCheckPerMonth: Record<string, number>;
  dealsByType: Record<string, SegmentBucket>;
  dealsByProject: Record<string, SegmentBucket>;
  dealsByManager: Record<string, SegmentBucket>;
  dealsBySource: Record<string, SegmentBucket>;
};

export type DealsAnalytics = { normalizedDeals: NormalizedDealRow[]; validDeals: NormalizedDealRow[] } & DealMetrics;

export type DealsSectionMode = "work" | "presentation";

export type DealsMonthSeriesRow = {
  monthKey: string;
  labelRu: string;
  chartLabel: string;
  count: number;
  sum: number;
  avgCheck: number;
};

function parseDealSum(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (raw == null) return 0;
  const n = parseFloat(String(raw).replace(/\s/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function normalizeField(value: unknown, whenEmpty: string = DEALS_LABEL_UNSPECIFIED): string {
  if (value == null) return whenEmpty;
  const s = String(value).trim();
  return s.length > 0 ? s : whenEmpty;
}

function pickFirstString(
  record: Record<string, unknown>,
  keys: string[],
  whenEmpty: string = DEALS_LABEL_UNSPECIFIED,
): string {
  for (const k of keys) {
    if (k in record && record[k] != null && String(record[k]).trim() !== "") {
      return normalizeField(record[k], whenEmpty);
    }
  }
  return whenEmpty;
}

function firstNonEmptyValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (!(k in record)) continue;
    const v = record[k];
    if (v != null && String(v).trim() !== "") return v;
  }
  return null;
}

/**
 * Приводит сырую дату сделки к YYYY-MM-DD или null.
 * Поддержка YYYY-MM (как в помесячных выгрузках) без неоднозначного `new Date("YYYY-MM")`.
 */
function normalizeDateToYmd(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  const head = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) return head;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Дата сделки из полей выгрузки (тот же приоритет полей, что при нормализации строки).
 * Не использует «сырой» `new Date(строка)` без разбора формата — см. {@link normalizeDateToYmd}.
 */
export function normalizeDealDate(deal: DealRecord): Date | null {
  const ymd = normalizeDateToYmd(
    firstNonEmptyValue(deal as Record<string, unknown>, [
      "deal_date",
      "created_at",
      "close_date",
      "date",
      "month",
    ]),
  );
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  if (![y, m, d].every((n) => Number.isFinite(n))) return null;
  return new Date(y, m - 1, d);
}

function monthKeyFromDate(dateStr: string): string {
  return String(dateStr).trim().slice(0, 7);
}

function parseDealDateMs(dateStr: string): number {
  const s = String(dateStr).trim();
  const head = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) {
    const [y, m, d] = head.split("-").map(Number);
    const t = new Date(y, m - 1, d).getTime();
    return Number.isFinite(t) ? t : 0;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Универсальная нормализация строки выгрузки сделки.
 * Все агрегации строятся только по полям из этой функции (через {@link extractNormalizedDeals}).
 */
export function normalizeDeal(row: DealExportRow): NormalizedDealFields | null {
  const deal = row.deal;
  if (deal == null || typeof deal !== "object") return null;
  const d = deal as Record<string, unknown>;

  const project = ((): string => {
    const o = row.object;
    if (o != null && typeof o === "object") {
      const or = o as Record<string, unknown>;
      const v = firstNonEmptyValue(or, ["name", "project_name"]);
      if (v != null) return String(v).trim();
    }
    const top = (row as Record<string, unknown>).project;
    if (top != null && String(top).trim() !== "") return String(top).trim();
    return DEALS_LABEL_UNNAMED_OBJECT;
  })();

  const manager = pickFirstString(d, ["manager_name", "manager", "responsible"]);
  const source = pickFirstString(d, ["source", "deal_source", "utm_source"]);

  const amountRaw = firstNonEmptyValue(d, ["deal_sum", "amount", "budget"]);
  const amount = parseDealSum(amountRaw);

  const planRaw = firstNonEmptyValue(d, ["plan_sum", "planned_revenue", "plan_amount", "planSum", "plannedRevenue"]);
  const planRub = parseDealSum(planRaw);

  const dateRaw =
    firstNonEmptyValue(d, ["deal_date", "created_at", "close_date", "date", "month"]) ??
    firstNonEmptyValue(row as Record<string, unknown>, ["month", "deal_month", "period", "period_key"]);
  const dateStr = normalizeDateToYmd(dateRaw);
  if (dateStr == null) return null;

  const statusRaw = d.status;
  const status =
    statusRaw != null && String(statusRaw).trim() !== ""
      ? String(statusRaw).trim()
      : DEALS_LABEL_UNSPECIFIED;

  const client = ((): string => {
    const cl = row.client;
    if (cl != null && typeof cl === "object") {
      const nm = (cl as Record<string, unknown>).name;
      if (nm != null && String(nm).trim() !== "") return normalizeField(nm, DEALS_LABEL_UNSPECIFIED);
    }
    return normalizeField(d.client_name, DEALS_LABEL_UNSPECIFIED);
  })();

  const dealKind = pickFirstString(d, [...DEAL_KIND_FIELD_KEYS]);

  return {
    project,
    manager,
    source,
    amount,
    planRub,
    dateStr,
    dateMs: parseDealDateMs(dateStr),
    monthKey: monthKeyFromDate(dateStr),
    status,
    client,
    dealKind,
  };
}

/**
 * Сегментация по `row.object`: `category` и при необходимости `category_name`.
 * Коды: `flat` → apartment, `garage` → parking, `storage` → storage, `comm` → commercial.
 * Если код не распознан: при подстроке «клад» в `category_name` → storage.
 */
export function resolveObjectSegmentType(obj: DealObjectRef | undefined): NormalizedObjectType {
  const c = String(obj?.category ?? "")
    .trim()
    .toLowerCase();
  if (c === "flat") return "apartment";
  if (c === "garage") return "parking";
  if (c === "storageroom" || c === "storage") return "storage";
  if (c === "comm") return "commercial";

  const name = String(obj?.category_name ?? "").toLowerCase();
  if (name.includes("клад")) return "storage";

  return "unknown";
}

/** Распознаёт сегмент по явным кодам в `type` / `object_type` (object и deal). */
function segmentTypeFromHint(raw: string): NormalizedObjectType | null {
  const t = raw.trim().toLowerCase();
  if (t === "flat" || t === "apartment" || t === "квартира" || t === "квартиры") return "apartment";
  if (t === "garage" || t === "parking" || t === "мм" || t === "машино-место" || t === "машиноместо") return "parking";
  if (t === "storageroom" || t === "storage" || t === "кладовая" || t === "кладовые") return "storage";
  if (t === "comm" || t === "commercial" || t === "коммерция") return "commercial";
  return null;
}

/**
 * Сегмент сделки: приоритет явных полей `type` / `object_type` в {@link DealObjectRef} и в deal,
 * иначе {@link resolveObjectSegmentType} по `category` / `category_name`.
 */
export function resolveDealSegmentType(row: DealExportRow): NormalizedObjectType {
  const o = row.object;
  const or = o != null && typeof o === "object" ? (o as Record<string, unknown>) : null;
  const d = row.deal as Record<string, unknown> | undefined;
  const candidates: unknown[] = [];
  if (or) {
    candidates.push(or.type, or.object_type);
  }
  if (d) {
    candidates.push(d.type, d.object_type);
  }
  for (const raw of candidates) {
    if (raw == null || String(raw).trim() === "") continue;
    const seg = segmentTypeFromHint(String(raw));
    if (seg != null) return seg;
  }
  return resolveObjectSegmentType(row.object);
}

function parseDealObjectNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (raw == null || raw === "") return null;
  const s = String(raw)
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function dealObjectStringOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function dealRecords(row: DealExportRow): { object: Record<string, unknown> | null; deal: Record<string, unknown> | null } {
  const o = row.object != null && typeof row.object === "object" ? (row.object as Record<string, unknown>) : null;
  const d = row.deal != null && typeof row.deal === "object" ? (row.deal as Record<string, unknown>) : null;
  return { object: o, deal: d };
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

/**
 * Значение по пути вида `object.area.total` от корня строки выгрузки.
 */
export function deepPick(root: unknown, path: string): unknown {
  const parts = path
    .split(".")
    .map((s) => s.trim())
    .filter(Boolean);
  let cur: unknown = root;
  for (const part of parts) {
    if (!isPlainObject(cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

/**
 * Все объекты, в которых ищем плоские ключи (корень строки, deal, object, типичные вложения `area` / `params`).
 */
function collectDealSearchRoots(row: DealExportRow): Record<string, unknown>[] {
  const seen = new Set<Record<string, unknown>>();
  const out: Record<string, unknown>[] = [];
  const add = (x: unknown) => {
    if (!isPlainObject(x)) return;
    if (seen.has(x)) return;
    seen.add(x);
    out.push(x);
  };

  add(row);
  add(row.deal);
  add(row.object);

  const deal = row.deal;
  if (isPlainObject(deal)) {
    const dr = deal as Record<string, unknown>;
    add(dr.object);
    add(dr.area);
    add(dr.property);
    add(dr.unit);
    add(dr.flat);
    add(dr.estate);
    add(dr.estate_object);
    add(dr.estateObject);
  }

  const obj = row.object;
  if (isPlainObject(obj)) {
    const or = obj as Record<string, unknown>;
    add(or.area);
    add(or.meta);
    add(or.params);
    add(or.characteristics);
    add(or.props);
  }

  return out;
}

function pickNumFromMerged(src: Record<string, unknown>, keys: string[]): number | null {
  if (src == null || typeof src !== "object") return null;
  for (const k of keys) {
    if (!(k in src)) continue;
    const v = src[k];
    if (v === null || v === undefined) continue;
    const n = parseDealObjectNumber(v);
    if (n != null) return n;
  }
  return null;
}

function pickStrFromMerged(src: Record<string, unknown>, keys: string[]): string | null {
  if (src == null || typeof src !== "object") return null;
  for (const k of keys) {
    if (!(k in src)) continue;
    const v = src[k];
    if (v === null || v === undefined) continue;
    const s = dealObjectStringOrNull(v);
    if (s) return s;
  }
  return null;
}

/** Число: плоские ключи по всем корням + dot-paths на `row`. */
function universalPickNum(row: DealExportRow, flatKeys: string[], dotPaths: string[]): number | null {
  for (const src of collectDealSearchRoots(row)) {
    const n = pickNumFromMerged(src, flatKeys);
    if (n != null) return n;
  }
  for (const p of dotPaths) {
    const v = deepPick(row, p);
    if (v !== null && v !== undefined && isPlainObject(v)) {
      const inner = pickNumFromMerged(v, flatKeys);
      if (inner != null) return inner;
    }
    const n = parseDealObjectNumber(v);
    if (n != null) return n;
  }
  return null;
}

/** Строка: плоские ключи + dot-paths. */
function universalPickStr(row: DealExportRow, flatKeys: string[], dotPaths: string[]): string | null {
  for (const src of collectDealSearchRoots(row)) {
    const s = pickStrFromMerged(src, flatKeys);
    if (s) return s;
  }
  for (const p of dotPaths) {
    const v = deepPick(row, p);
    if (v !== null && v !== undefined && isPlainObject(v)) {
      const inner = pickStrFromMerged(v, flatKeys);
      if (inner) return inner;
    }
    const s = dealObjectStringOrNull(v);
    if (s) return s;
  }
  return null;
}

/** Сырое значение для этажа (число или строка). */
function universalPickRaw(row: DealExportRow, flatKeys: string[], dotPaths: string[]): unknown {
  for (const src of collectDealSearchRoots(row)) {
    for (const k of flatKeys) {
      if (!(k in src)) continue;
      const v = src[k];
      if (v === null || v === undefined) continue;
      if (String(v).trim() === "") continue;
      return v;
    }
  }
  for (const p of dotPaths) {
    const v = deepPick(row, p);
    if (v === null || v === undefined) continue;
    if (String(v).trim() === "") continue;
    return v;
  }
  return null;
}

/** price / area; площадь > 0; округление до целого ₽/м². */
export function dealObjectPricePerM2(price: number | null, areaTotal: number | null): number | null {
  if (price == null || areaTotal == null) return null;
  if (!Number.isFinite(price) || !Number.isFinite(areaTotal) || areaTotal <= 0) return null;
  return Math.round(price / areaTotal);
}

/** Строка таблицы «Параметры объекта» (после {@link mapDeal}). */
export type DealObjectParamsTableRow = {
  date: string;
  type: string | null;
  price: number | null;
  area: number | null;
  price_per_m2: number | null;
  floor: string | null;
  section: string | null;
};

export function toDealObjectParamsTableRow(row: NormalizedDealRow): DealObjectParamsTableRow {
  const p = row.objectParams;
  const price = p.price ?? (Number.isFinite(row.sumRub) ? row.sumRub : null);
  return {
    date: row.dealDate,
    type: p.type,
    price,
    area: p.areaTotal,
    price_per_m2: dealObjectPricePerM2(price, p.areaTotal),
    floor: p.floor,
    section: p.section,
  };
}

function formatDealObjectFloor(raw: unknown): string | null {
  if (raw == null) return null;
  const n = parseDealObjectNumber(raw);
  if (n != null) {
    if (Number.isInteger(n)) return String(n);
    return dealObjectAreaFmt.format(n);
  }
  return dealObjectStringOrNull(raw);
}

/**
 * `object.category` из выгрузки (Trankeys и аналоги) → подпись в таблице «Параметры объекта».
 */
export function mapObjectCategoryLabel(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const c = String(raw).trim().toLowerCase();
  if (c === "flat") return "Квартира";
  if (c === "garage") return "Машино-место";
  if (c === "storageroom") return "Кладовая";
  if (c === "storage") return "Кладовая";
  if (c === "comm") return "Коммерция";
  return null;
}

/**
 * Код типа из JSON (`type` / `object_type`) → подпись (запасной путь, если нет `object.category`).
 */
export function mapType(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim().toLowerCase();
  const fromCat = mapObjectCategoryLabel(t);
  if (fromCat) return fromCat;
  if (t === "living" || t === "apartment") return "Квартира";
  if (t === "parking") return "Машино-место";
  return null;
}

const MAP_DEAL_AREA_TOTAL_KEYS = [
  "deal_area",
  "dealArea",
  "estate_area",
  "estateArea",
  "area_total",
  "areaTotal",
  "total_area",
  "totalArea",
  "square_total",
  "squareTotal",
  "total_square",
  "totalSquare",
  "area",
  "square",
  "sq",
  "rooms_area",
  "roomsArea",
  "object_area",
  "objectArea",
  "sum_area",
  "sumArea",
  "full_area",
  "fullArea",
  "common_area",
  "commonArea",
];

const MAP_DEAL_AREA_TOTAL_PATHS = [
  "deal.deal_area",
  "object.estate_area",
  "object.area_total",
  "object.areaTotal",
  "object.total_area",
  "object.totalArea",
  "object.area.total",
  "object.area.full",
  "object.area.common",
  "object.area.whole",
  "object.params.area_total",
  "object.params.areaTotal",
  "object.characteristics.area_total",
  "deal.area_total",
  "deal.areaTotal",
  "deal.object.area_total",
  "deal.object.area",
  "deal.object.area.total",
  "deal.flat.area_total",
  "deal.unit.area_total",
  "deal.property.area_total",
];

const MAP_DEAL_AREA_LIVING_KEYS = [
  "area_living",
  "areaLiving",
  "living_area",
  "livingArea",
  "square_living",
  "squareLiving",
  "living_square",
  "livingSquare",
  "residential_area",
  "residentialArea",
  "living",
  "residential",
];

const MAP_DEAL_AREA_LIVING_PATHS = [
  "object.area_living",
  "object.area.living",
  "object.area.living_area",
  "object.area.residential",
  "object.params.area_living",
  "deal.object.area_living",
  "deal.object.area.living",
];

const MAP_DEAL_AREA_BALCONY_KEYS = [
  "area_balcony",
  "areaBalcony",
  "balcony_area",
  "balconyArea",
  "square_balcony",
  "squareBalcony",
  "balcony",
  "loggia_area",
  "loggiaArea",
  "loggia",
];

const MAP_DEAL_AREA_BALCONY_PATHS = [
  "object.area_balcony",
  "object.area.balcony",
  "object.area.loggia",
  "object.params.area_balcony",
  "deal.object.area_balcony",
];

const MAP_DEAL_PRICE_KEYS = [
  "deal_sum",
  "dealSum",
  "price",
  "object_price",
  "objectPrice",
  "deal_price",
  "dealPrice",
  "amount",
  "budget",
  "cost",
  "sum",
  "total_price",
  "totalPrice",
];

const MAP_DEAL_PRICE_PATHS = [
  "deal.deal_sum",
  "object.price",
  "object.object_price",
  "object.params.price",
  "deal.price",
  "deal.object.price",
  "deal.amount",
];

const MAP_DEAL_FLOOR_KEYS = ["floor", "floor_number", "floorNumber", "storey", "storeys", "level", "etazh", "tier"];

const MAP_DEAL_FLOOR_PATHS = [
  "object.estate_floor",
  "object.floor",
  "object.floor_number",
  "object.params.floor",
  "object.characteristics.floor",
  "deal.floor",
  "deal.object.floor",
  "deal.flat.floor",
];

const MAP_DEAL_TYPE_KEYS = ["type", "object_type", "objectType", "typology", "layout", "layout_type", "layoutType"];

const MAP_DEAL_TYPE_PATHS = [
  "object.type",
  "object.object_type",
  "object.params.type",
  "deal.type",
  "deal.object.type",
];

const MAP_DEAL_SECTION_KEYS = [
  "geo_house_section",
  "section",
  "section_name",
  "sectionName",
  "building",
  "corpus",
  "block",
  "block_name",
  "blockName",
  "housing",
  "wing",
  "liter",
  "litera",
  "building_name",
  "buildingName",
  "house_section",
  "houseSection",
  "phase",
  "queue",
];

const MAP_DEAL_SECTION_PATHS = [
  "object.geo_house_section",
  "object.section",
  "object.section_name",
  "object.building",
  "object.corpus",
  "object.block",
  "object.params.section",
  "deal.section",
  "deal.object.section",
  "deal.object.building",
];

/**
 * Сводит поля `deal` / `object` к {@link DealObjectParams}.
 * Приоритет полей выгрузки `data[]`: `deal.deal_sum`, `deal.deal_area`, `object.estate_area`, `object.category`, `object.estate_floor`, `object.geo_house_section`.
 */
export function mapDeal(row: DealExportRow): DealObjectParams {
  const deal = row.deal != null && typeof row.deal === "object" ? (row.deal as Record<string, unknown>) : null;
  const ob = row.object != null && typeof row.object === "object" ? (row.object as Record<string, unknown>) : null;

  let price: number | null = null;
  if (deal) {
    price = parseDealObjectNumber(deal.deal_sum);
  }

  let areaTotal: number | null = null;
  if (deal) {
    areaTotal = parseDealObjectNumber(deal.deal_area);
  }
  if (areaTotal == null && ob) {
    areaTotal = parseDealObjectNumber(ob.estate_area);
  }

  let type: string | null = null;
  if (ob && ob.category != null && String(ob.category).trim() !== "") {
    const cat = String(ob.category).trim();
    type = mapObjectCategoryLabel(cat) ?? dealObjectStringOrNull(cat);
  }

  let floor: string | null = null;
  if (ob && ob.estate_floor != null && String(ob.estate_floor).trim() !== "") {
    floor = formatDealObjectFloor(ob.estate_floor);
  }

  let section: string | null = null;
  if (ob && ob.geo_house_section != null && String(ob.geo_house_section).trim() !== "") {
    section = dealObjectStringOrNull(ob.geo_house_section);
  }

  const areaLiving = universalPickNum(row, MAP_DEAL_AREA_LIVING_KEYS, MAP_DEAL_AREA_LIVING_PATHS);
  const areaBalcony = universalPickNum(row, MAP_DEAL_AREA_BALCONY_KEYS, MAP_DEAL_AREA_BALCONY_PATHS);

  if (price == null) {
    price = universalPickNum(row, MAP_DEAL_PRICE_KEYS, MAP_DEAL_PRICE_PATHS);
  }
  if (areaTotal == null) {
    areaTotal = universalPickNum(row, MAP_DEAL_AREA_TOTAL_KEYS, MAP_DEAL_AREA_TOTAL_PATHS);
  }
  if (type == null) {
    const typeCode = universalPickStr(row, ["type", "object_type", "objectType"], MAP_DEAL_TYPE_PATHS);
    const typeFromCode = mapType(typeCode);
    const typeFallback = universalPickStr(
      row,
      ["typology", "layout", "layout_type", "layoutType"],
      ["object.typology", "object.layout", "deal.object.typology"],
    );
    type = typeFromCode ?? typeFallback ?? null;
  }
  if (floor == null) {
    const floorRaw = universalPickRaw(row, MAP_DEAL_FLOOR_KEYS, MAP_DEAL_FLOOR_PATHS);
    floor = floorRaw != null ? formatDealObjectFloor(floorRaw) : null;
  }
  if (section == null) {
    section = universalPickStr(row, MAP_DEAL_SECTION_KEYS, MAP_DEAL_SECTION_PATHS);
  }

  return {
    areaTotal,
    areaLiving,
    areaBalcony,
    floor,
    price,
    type,
    section,
  };
}

export function extractDealObjectParams(row: DealExportRow): DealObjectParams {
  return mapDeal(row);
}

export function extractNormalizedDeals(data: unknown): NormalizedDealRow[] {
  const list: DealExportRow[] = Array.isArray(data) ? data : [];
  const out: NormalizedDealRow[] = [];

  for (const item of list) {
    const row = item as DealExportRow;
    const n = normalizeDeal(row);
    if (n == null) continue;

    const normalizedType = resolveDealSegmentType(row);
    const typeLabel = OBJECT_TYPE_LABEL_RU[normalizedType];

    const objectCategoryCode = ((): string | null => {
      const o = row.object;
      if (o == null || typeof o !== "object") return null;
      const raw = (o as Record<string, unknown>).category;
      if (raw == null || String(raw).trim() === "") return null;
      return String(raw).trim().toLowerCase();
    })();

    out.push({
      dealDate: n.dateStr,
      dealDateMs: n.dateMs,
      monthKey: n.monthKey,
      sumRub: n.amount,
      planRub: n.planRub,
      normalizedType,
      typeLabel,
      dealKindLabel: n.dealKind,
      objectLabel: n.project,
      managerLabel: n.manager,
      sourceLabel: n.source,
      statusLabel: n.status,
      clientLabel: n.client,
      objectParams: extractDealObjectParams(row),
      objectCategoryCode,
    });
  }

  return out;
}

/** Разбор ответа API / JSON выгрузки: массив сделок или `{ data: [...] }`. */
export function parseDealsEnvelope(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json != null && typeof json === "object" && "data" in json && Array.isArray((json as { data: unknown }).data)) {
    return (json as { data: unknown[] }).data;
  }
  return [];
}

function bumpBucket(map: Record<string, SegmentBucket>, key: string, sum: number) {
  if (!map[key]) map[key] = { count: 0, sum: 0 };
  map[key].count += 1;
  map[key].sum += sum;
}

export function flattenDealsInput(data: unknown): DealExportRow[] {
  if (Array.isArray(data)) return data as DealExportRow[];
  if (data != null && typeof data === "object" && !Array.isArray(data)) {
    const o = data as Record<string, unknown>;
    const keys = Object.keys(o).sort((a, b) => a.localeCompare(b));
    const rows: DealExportRow[] = [];
    for (const k of keys) {
      const v = o[k];
      if (Array.isArray(v)) {
        for (const item of v) rows.push(item as DealExportRow);
      }
    }
    return rows;
  }
  return [];
}

/** Агрегаты по уже нормализованным строкам ({@link extractNormalizedDeals} / {@link normalizeDeal}). */
export function computeDealMetrics(rows: NormalizedDealRow[]): DealMetrics {
  const dealsPerMonth: DealsPerMonthGrouped = {};
  const dealsByType: Record<string, SegmentBucket> = {};
  const dealsByProject: Record<string, SegmentBucket> = {};
  const dealsByManager: Record<string, SegmentBucket> = {};
  const dealsBySource: Record<string, SegmentBucket> = {};

  let totalSum = 0;

  for (const r of rows) {
    totalSum += r.sumRub;
    if (!dealsPerMonth[r.monthKey]) dealsPerMonth[r.monthKey] = { count: 0, sum: 0 };
    dealsPerMonth[r.monthKey].count += 1;
    dealsPerMonth[r.monthKey].sum += r.sumRub;

    bumpBucket(dealsByType, r.typeLabel, r.sumRub);
    bumpBucket(dealsByProject, r.objectLabel, r.sumRub);
    bumpBucket(dealsByManager, r.managerLabel, r.sumRub);
    bumpBucket(dealsBySource, r.sourceLabel, r.sumRub);
  }

  const sumPerMonth: Record<string, number> = {};
  const avgCheckPerMonth: Record<string, number> = {};
  for (const k of Object.keys(dealsPerMonth)) {
    const b = dealsPerMonth[k]!;
    sumPerMonth[k] = b.sum;
    avgCheckPerMonth[k] = b.count > 0 ? b.sum / b.count : 0;
  }

  return {
    totalCount: rows.length,
    totalSum,
    dealsPerMonth,
    sumPerMonth,
    avgCheckPerMonth,
    dealsByType,
    dealsByProject,
    dealsByManager,
    dealsBySource,
  };
}

/** Плоский массив или {@link DealsByMonth} — месяцы склеиваются в порядке ключей. */
export function transformDealsData(data: unknown): DealsAnalytics {
  const normalizedDeals = extractNormalizedDeals(flattenDealsInput(data));
  return {
    normalizedDeals,
    validDeals: normalizedDeals,
    ...computeDealMetrics(normalizedDeals),
  };
}

/** Распределение по сегменту объекта → apartment | parking | storage | commercial | unknown. */
export function groupDealsByNormalizedType(rows: NormalizedDealRow[]): Record<NormalizedObjectType, NormalizedDealRow[]> {
  const init: Record<NormalizedObjectType, NormalizedDealRow[]> = {
    apartment: [],
    parking: [],
    storage: [],
    commercial: [],
    unknown: [],
  };
  for (const r of rows) {
    init[r.normalizedType].push(r);
  }
  return init;
}

/** Четыре продуктовых сегмента (без «Не определено») — для структуры продаж / плана. */
export type DealSegmentKey = "apartment" | "parking" | "storage" | "commercial";

/** Порядок сегментов в аналитике и на графиках. */
export const DEAL_SEGMENT_KEYS: readonly DealSegmentKey[] = ["apartment", "parking", "storage", "commercial"];

/**
 * Группировка нормализованных сделок по сегменту (после {@link normalizeDeal} / {@link extractNormalizedDeals}).
 */
export function groupDealsBySegment(rows: NormalizedDealRow[]): Record<DealSegmentKey, NormalizedDealRow[]> {
  return {
    apartment: rows.filter((r) => r.normalizedType === "apartment"),
    parking: rows.filter((r) => r.normalizedType === "parking"),
    storage: rows.filter((r) => r.normalizedType === "storage"),
    commercial: rows.filter((r) => r.normalizedType === "commercial"),
  };
}

export function buildDealsMonthSeries(grouped: DealsPerMonthGrouped): DealsMonthSeriesRow[] {
  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, val]) => {
      const [y, m] = monthKey.split("-");
      const yi = Number(y);
      const mi = Number(m);
      const labelRu =
        Number.isFinite(yi) && Number.isFinite(mi)
          ? new Date(yi, mi - 1, 1).toLocaleDateString("ru-RU", { month: "short", year: "numeric" })
          : monthKey;
      const chartLabel = `${m}.${String(y).slice(-2)}`;
      const avgCheck = val.count > 0 ? val.sum / val.count : 0;
      return {
        monthKey,
        labelRu,
        chartLabel,
        count: val.count,
        sum: val.sum,
        avgCheck,
      };
    });
}

function monthLabelRu(monthKey: string): string {
  const [y, m] = monthKey.split("-");
  const yi = Number(y);
  const mi = Number(m);
  if (Number.isFinite(yi) && Number.isFinite(mi)) {
    return new Date(yi, mi - 1, 1).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  }
  return monthKey;
}

const workKpiCard =
  "rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm";

function deltaCellClass(delta: number | null): string {
  if (delta == null) return "text-slate-600";
  if (delta < 0) return "text-red-700";
  if (delta > 0) return "text-emerald-700";
  return "text-slate-700";
}

function deltaPctCellClass(delta: number | null, deltaPct: number | null): string {
  if (delta == null || deltaPct == null) return "text-slate-600";
  if (deltaPct < 0) return "text-red-700";
  if (deltaPct > 0) return "text-emerald-700";
  return "text-slate-700";
}

function bucketTableRows(map: Record<string, SegmentBucket>) {
  return Object.entries(map)
    .map(([key, v]) => ({
      key,
      count: v.count,
      sum: v.sum,
      avgCheck: v.count > 0 ? v.sum / v.count : 0,
    }))
    .sort((a, b) => b.sum - a.sum);
}

function parseUploadedDealsJson(text: string): DealExportRow[] | null {
  try {
    const json: unknown = JSON.parse(text);
    if (Array.isArray(json)) return json as DealExportRow[];
    if (json != null && typeof json === "object" && Array.isArray((json as { data: unknown }).data)) {
      return (json as { data: DealExportRow[] }).data;
    }
    return null;
  } catch {
    return null;
  }
}

function monthKeyFromFileName(fileName: string): string | null {
  const base = fileName.replace(/\.json$/i, "").trim();
  return /^\d{4}-\d{2}$/.test(base) ? base : null;
}

/** «Файл за март 2026 добавлен» (без «г.»). */
function uploadSuccessLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-");
  const yi = Number(y);
  const mi = Number(m);
  if (!Number.isFinite(yi) || !Number.isFinite(mi)) return monthKey;
  const monthWord = new Date(yi, mi - 1, 1).toLocaleDateString("ru-RU", { month: "long" });
  return `Файл за ${monthWord} ${yi} добавлен`;
}

export function DealsSection({ mode = "work" }: { mode?: DealsSectionMode }) {
  const [dealsByMonth, setDealsByMonth] = useState<DealsByMonth>({});
  const skipFirstPersist = useRef(true);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [filterMonth, setFilterMonth] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterObject, setFilterObject] = useState("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DEALS_BY_MONTH_STORAGE_KEY);
      const next = stored ? (JSON.parse(stored) as DealsByMonth) : {};
      setDealsByMonth(next);
      console.log("LOADED:", next);
    } catch {
      setDealsByMonth({});
      console.log("LOADED:", {});
    }
  }, []);

  useEffect(() => {
    if (skipFirstPersist.current) {
      skipFirstPersist.current = false;
      return;
    }
    try {
      localStorage.setItem(DEALS_BY_MONTH_STORAGE_KEY, JSON.stringify(dealsByMonth));
    } catch {
      /* quota / private mode */
    }
  }, [dealsByMonth]);

  const fullBase = useMemo(() => transformDealsData(dealsByMonth), [dealsByMonth]);

  const filterOptions = useMemo(() => {
    const rows = fullBase.normalizedDeals;
    const months = [...new Set(rows.map((r) => r.monthKey))].sort((a, b) => a.localeCompare(b));
    const present = new Set(rows.map((r) => r.typeLabel));
    const types = OBJECT_TYPE_FILTER_ORDER.filter((label) => present.has(label));
    const objects = [...new Set(rows.map((r) => r.objectLabel))].sort((a, b) => a.localeCompare(b, "ru"));
    return { months, types, objects };
  }, [fullBase.normalizedDeals]);

  /** Все загруженные строки (без фильтров) — счётчики «В загрузке». */
  const dealsByNormalizedTypeAll = useMemo(
    () => groupDealsByNormalizedType(fullBase.normalizedDeals),
    [fullBase.normalizedDeals],
  );

  const filteredRows = useMemo(() => {
    return fullBase.normalizedDeals.filter((r) => {
      if (filterMonth && r.monthKey !== filterMonth) return false;
      if (filterType && r.typeLabel !== filterType) return false;
      if (filterObject && r.objectLabel !== filterObject) return false;
      return true;
    });
  }, [filterMonth, filterType, filterObject, fullBase.normalizedDeals]);

  const analytics = useMemo(() => computeDealMetrics(filteredRows), [filteredRows]);

  /** Сегментация в текущем срезе фильтров — KPI по квартирам / машино-местам / кладовым / коммерции. */
  const dealsByNormalizedType = useMemo(
    () => groupDealsByNormalizedType(filteredRows),
    [filteredRows],
  );

  const segmentKpiRows = useMemo(() => {
    const totalCount = analytics.totalCount;
    const totalSum = analytics.totalSum;
    const defs: Array<{ key: "apartment" | "parking" | "storage" | "commercial"; variant: SegmentKpiVisualVariant }> = [
      { key: "apartment", variant: "apartment" },
      { key: "parking", variant: "parking" },
      { key: "storage", variant: "storage" },
      { key: "commercial", variant: "commercial" },
    ];
    return defs
      .map(({ key, variant }) => {
        const m = computeDealMetrics(dealsByNormalizedType[key]);
        const count = m.totalCount;
        const sum = m.totalSum;
        return {
          key,
          variant,
          label: OBJECT_TYPE_LABEL_RU[key],
          count,
          sum,
          avgCheck: count > 0 ? sum / count : 0,
          shareCount: totalCount > 0 ? count / totalCount : 0,
          shareSum: totalSum > 0 ? sum / totalSum : 0,
        };
      })
      .filter((r) => r.count > 0);
  }, [analytics.totalCount, analytics.totalSum, dealsByNormalizedType]);

  const onDealsJsonSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadNotice(null);
    try {
      const text = await file.text();
      const data = parseUploadedDealsJson(text);
      if (!data || data.length === 0) {
        setUploadNotice("Не удалось прочитать JSON: нужен массив или объект с полем data.");
        event.target.value = "";
        return;
      }

      let month = monthKeyFromFileName(file.name);
      if (!month) {
        const firstDeal = data[0]?.deal;
        const dd = firstDeal?.deal_date;
        if (typeof dd === "string" && dd.trim().length >= 7) {
          month = monthKeyFromDate(dd.trim());
        }
      }
      if (!month) {
        setUploadNotice("Не удалось определить месяц: укажите имя файла вида 2026-03.json или deal_date в данных.");
        event.target.value = "";
        return;
      }

      const monthKey = month;

      setDealsByMonth((prev) => {
        const prevMonthRows = prev[monthKey] ?? [];
        const existingIds = new Set(
          prevMonthRows.map((i) => i.id).filter((id): id is string | number => id != null && id !== ""),
        );
        const newItems = data.filter((i) => {
          if (i.id == null || i.id === "") return true;
          return !existingIds.has(i.id);
        });
        const next: DealsByMonth = {
          ...prev,
          [monthKey]: [...prevMonthRows, ...newItems],
        };
        console.log("MONTH ADDED:", monthKey);
        console.log("TOTAL MONTHS:", Object.keys(next));
        return next;
      });

      setUploadNotice(uploadSuccessLabel(monthKey));
    } catch {
      setUploadNotice("Ошибка чтения или разбора JSON.");
    }
    event.target.value = "";
  };

  const handleResetDealsStorage = () => {
    try {
      localStorage.removeItem(DEALS_BY_MONTH_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setDealsByMonth({});
    setUploadNotice(null);
  };

  const removeMonth = (month: string) => {
    if (!confirm("Удалить данные за " + month + "?")) return;
    setDealsByMonth((prev) => {
      const updated = { ...prev };
      delete updated[month];
      return updated;
    });
    if (filterMonth === month) setFilterMonth("");
  };

  const series = useMemo(() => buildDealsMonthSeries(analytics.dealsPerMonth), [analytics.dealsPerMonth]);

  const lastMonth = series.length > 0 ? series[series.length - 1] : null;
  const prevMonth = series.length > 1 ? series[series.length - 2] : null;
  const prevMonthLabel = prevMonth?.labelRu ?? null;
  const lastMonthCount = lastMonth?.count ?? null;
  const prevMonthCount = prevMonth?.count ?? null;
  const deltaCount =
    lastMonthCount != null && prevMonthCount != null ? lastMonthCount - prevMonthCount : null;
  const deltaPct =
    deltaCount != null && prevMonthCount != null
      ? prevMonthCount > 0
        ? (deltaCount / prevMonthCount) * 100
        : lastMonthCount != null && lastMonthCount > 0
          ? 100
          : 0
      : null;

  const avgCheckTotal = analytics.totalCount > 0 ? analytics.totalSum / analytics.totalCount : 0;
  const momSub =
    deltaCount == null || deltaPct == null
      ? "Сравнение к пред. месяцу недоступно в этом срезе."
      : `К предыдущему: ${prevMonthLabel ?? DEALS_LABEL_EM_DASH}`;
  const momValue =
    deltaCount != null && deltaPct != null
      ? `${deltaCount >= 0 ? "+" : ""}${numFmt.format(deltaCount)} шт · ${deltaPct >= 0 ? "+" : ""}${pctFmt.format(deltaPct)}%`
      : DEALS_LABEL_EM_DASH;

  const withDelta = useMemo(() => {
    return series.map((row, i) => {
      if (i === 0) {
        return { ...row, delta: null as number | null, deltaPct: null as number | null };
      }
      const p = series[i - 1]!;
      const delta = row.count - p.count;
      const deltaPct = p.count > 0 ? (delta / p.count) * 100 : null;
      return { ...row, delta, deltaPct };
    });
  }, [series]);

  const topDeviations = useMemo(() => {
    const withD = withDelta.filter((r) => r.delta != null);
    return [...withD].sort((a, b) => (a.delta! - b.delta!)).slice(0, 5);
  }, [withDelta]);

  const rawTableRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => b.dealDateMs - a.dealDateMs).slice(0, 50);
  }, [filteredRows]);

  const objectParamsTableRows = useMemo(() => {
    return [...filteredRows].sort(compareForObjectParamsTable).slice(0, 50);
  }, [filteredRows]);

  const byTypeRows = useMemo(() => bucketTableRows(analytics.dealsByType), [analytics.dealsByType]);
  const byObjectRows = useMemo(() => bucketTableRows(analytics.dealsByProject), [analytics.dealsByProject]);
  const byManagerRows = useMemo(() => bucketTableRows(analytics.dealsByManager), [analytics.dealsByManager]);
  const bySourceRows = useMemo(() => bucketTableRows(analytics.dealsBySource), [analytics.dealsBySource]);

  const activeFilterCount = [filterMonth, filterType, filterObject].filter(Boolean).length;

  const loadedMonthKeys = useMemo(
    () => Object.keys(dealsByMonth).sort((a, b) => a.localeCompare(b)),
    [dealsByMonth],
  );

  if (mode === "presentation") {
    return <DealsPresentationPanel dealsByMonth={dealsByMonth} />;
  }

  return (
    <div className="space-y-4">
      <section className={panelClass}>
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Сделки — разведка данных</h2>
            <p className="mt-1 text-sm text-slate-600">
              Сегмент: <span className="font-mono text-xs">object.category</span> и при необходимости{" "}
              <span className="font-mono text-xs">object.category_name</span> (коды{" "}
              <span className="font-mono text-xs">flat</span> / <span className="font-mono text-xs">garage</span> /{" "}
              <span className="font-mono text-xs">storage</span> / <span className="font-mono text-xs">comm</span>; по имени —
              подстрока «клад» → кладовые). Поля <span className="font-mono text-xs">deal.*</span> — для таблиц и сумм.
            </p>
          </div>
          <div className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-900">
            Активных фильтров: {activeFilterCount}
          </div>
        </div>

        <div className={filterBarClass}>
          <label className="text-xs font-semibold text-slate-700">
            Месяц
            <select
              className={selectClass}
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              aria-label="Фильтр по месяцу"
            >
              <option value="">Все месяцы</option>
              {filterOptions.months.map((m) => (
                <option key={m} value={m}>
                  {monthLabelRu(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Тип объекта
            <select
              className={selectClass}
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              aria-label="Фильтр по типу объекта недвижимости"
            >
              <option value="">Все типы</option>
              {filterOptions.types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Объект
            <select
              className={selectClass}
              value={filterObject}
              onChange={(e) => setFilterObject(e.target.value)}
              aria-label="Фильтр по объекту"
            >
              <option value="">Все объекты</option>
              {filterOptions.objects.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              setFilterMonth("");
              setFilterType("");
              setFilterObject("");
            }}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Сбросить фильтры
          </button>
          <p className="w-full text-xs text-slate-600 sm:w-auto">
            В загрузке: квартиры {dealsByNormalizedTypeAll.apartment.length} · машино-места{" "}
            {dealsByNormalizedTypeAll.parking.length} · кладовые {dealsByNormalizedTypeAll.storage.length} · коммерция{" "}
            {dealsByNormalizedTypeAll.commercial.length} · не определено {dealsByNormalizedTypeAll.unknown.length}
          </p>
          <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">
            Загрузить JSON
            <input type="file" accept=".json" className="sr-only" onChange={onDealsJsonSelected} aria-label="Загрузить JSON сделок за месяц" />
          </label>
          <button
            type="button"
            onClick={handleResetDealsStorage}
            className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-50"
          >
            Очистить данные
          </button>
        </div>
        {uploadNotice ? (
          <p
            className={
              uploadNotice.startsWith("Ошибка") || uploadNotice.startsWith("Не удалось")
                ? "text-sm text-red-700"
                : "text-sm text-emerald-800"
            }
          >
            {uploadNotice}
          </p>
        ) : null}

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Загруженные месяцы</h3>
          {loadedMonthKeys.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">Нет загруженных данных</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-200">
              {loadedMonthKeys.map((month) => (
                <li key={month} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                  <span className="font-mono text-sm font-medium text-slate-900">{month}</span>
                  <button
                    type="button"
                    onClick={() => removeMonth(month)}
                    className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-800 hover:bg-red-50"
                  >
                    Удалить
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className={workKpiCard}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Всего сделок</div>
            <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{numFmt.format(analytics.totalCount)}</div>
            <p className="mt-1 text-xs text-slate-500">В текущем срезе</p>
          </div>
          <div className={workKpiCard}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Сумма</div>
            <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{rubFmt.format(analytics.totalSum)}</div>
            <p className="mt-1 text-xs text-slate-500">По полю deal_sum</p>
          </div>
          <div className={workKpiCard}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Средний чек</div>
            <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{rubFmt.format(avgCheckTotal)}</div>
            <p className="mt-1 text-xs text-slate-500">Сумма / количество</p>
          </div>
          <div className={workKpiCard}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Δ к пред. месяцу</div>
            <div className="mt-2 text-xl font-bold tabular-nums text-slate-900">{momValue}</div>
            <p className="mt-1 text-xs text-slate-500">{momSub}</p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">КПИ по сегментам</h3>
          <p className="text-xs text-slate-500">
            Те же фильтры, что и у блока выше (месяц, тип объекта, объект). Доли: доля сделок и доля суммы от итого в срезе.
          </p>
          {segmentKpiRows.length === 0 ? (
            <p className="text-sm text-slate-600">
              Нет сделок в сегментах «Квартиры», «Машино-места», «Кладовые» или «Коммерция» (проверьте фильтры и поля{" "}
              <span className="font-mono">object.category</span> / <span className="font-mono">object.category_name</span>).
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {segmentKpiRows.map((row) => (
                <div key={row.key} className={segmentKpiCardClass(row.variant)}>
                  <div className={segmentKpiTitleClass(row.variant)}>{row.label}</div>
                  <div className="mt-4 space-y-4">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Сделок</div>
                      <div className="mt-1 text-xl font-bold tabular-nums leading-snug text-slate-900">
                        {dealsCountRu(row.count)} ({sharePctFmt.format(row.shareCount)})
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Сумма</div>
                      <div className="mt-1 text-xl font-bold tabular-nums leading-snug text-slate-900">
                        {formatSumRubSegment(row.sum)} ({sharePctFmt.format(row.shareSum)})
                      </div>
                    </div>
                    <div
                      className={`rounded-lg border px-3 py-2 ${
                        row.variant === "parking" || row.variant === "storage"
                          ? "border-slate-200 bg-white"
                          : "border-slate-200/80 bg-white/70"
                      }`}
                    >
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Средний чек</div>
                      <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{rubFmt.format(row.avgCheck)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className={panelClass}>
        <h3 className="text-base font-semibold text-slate-900">Сделки по месяцам</h3>
        <p className="text-xs text-slate-500">
          Месяцы по возрастанию; Δ к предыдущему месяцу в отфильтрованном ряду. Поля sumPerMonth и avgCheckPerMonth совпадают с
          аналитикой.
        </p>
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-3 py-2.5">Месяц</th>
                <th className="px-3 py-2.5 text-right">Сделки, шт.</th>
                <th className="px-3 py-2.5 text-right">Выручка, ₽</th>
                <th className="px-3 py-2.5 text-right">Средний чек, ₽</th>
                <th className="px-3 py-2.5 text-right">Δ к пред. мес., шт.</th>
                <th className="px-3 py-2.5 text-right">Δ % к пред. мес.</th>
              </tr>
            </thead>
            <tbody>
              {withDelta.map((r) => (
                <tr key={r.monthKey} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-3 py-2.5 font-medium text-slate-900">{r.labelRu}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{numFmt.format(r.count)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{rubFmt.format(r.sum)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{rubFmt.format(r.avgCheck)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${deltaCellClass(r.delta)}`}>
                    {r.delta == null ? DEALS_LABEL_EM_DASH : `${r.delta >= 0 ? "+" : ""}${numFmt.format(r.delta)}`}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${deltaPctCellClass(r.delta, r.deltaPct)}`}>
                    {r.deltaPct == null ? DEALS_LABEL_EM_DASH : `${r.deltaPct >= 0 ? "+" : ""}${pctFmt.format(r.deltaPct)}%`}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900">
                <td className="px-3 py-2.5">ИТОГО</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{numFmt.format(analytics.totalCount)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{rubFmt.format(analytics.totalSum)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {rubFmt.format(analytics.totalCount > 0 ? analytics.totalSum / analytics.totalCount : 0)}
                </td>
                <td className="px-3 py-2.5 text-right text-slate-600">{DEALS_LABEL_EM_DASH}</td>
                <td className="px-3 py-2.5 text-right text-slate-600">{DEALS_LABEL_EM_DASH}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className={panelClass}>
        <h3 className="text-base font-semibold text-slate-900">Топ отклонений</h3>
        <p className="text-xs text-slate-500">До 5 строк: наименьший Δ к предыдущему месяцу в срезе.</p>
        {topDeviations.length > 0 ? (
          <div className={tableWrapClass}>
            <table className={tableClass}>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="px-3 py-2.5">Месяц</th>
                  <th className="px-3 py-2.5 text-right">Сделки, шт.</th>
                  <th className="px-3 py-2.5 text-right">Δ, шт.</th>
                  <th className="px-3 py-2.5 text-right">Δ %</th>
                </tr>
              </thead>
              <tbody>
                {topDeviations.map((r) => (
                  <tr key={`top-${r.monthKey}`} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-3 py-2.5 font-medium text-slate-900">{r.labelRu}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{numFmt.format(r.count)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${deltaCellClass(r.delta)}`}>
                      {r.delta! >= 0 ? "+" : ""}
                      {numFmt.format(r.delta!)}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${deltaPctCellClass(r.delta, r.deltaPct)}`}>
                      {r.deltaPct == null ? DEALS_LABEL_EM_DASH : `${r.deltaPct >= 0 ? "+" : ""}${pctFmt.format(r.deltaPct)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-600">
            Нужен ряд минимум из двух месяцев в срезе, чтобы построить топ отклонений.
          </p>
        )}
      </section>

      <section className={panelClass}>
        <h3 className="text-base font-semibold text-slate-900">Сделки по типам объектов</h3>
        <p className="text-xs text-slate-500">
          Сегменты по <span className="font-mono">object.category</span> / <span className="font-mono">object.category_name</span>{" "}
          (flat / garage / storage / comm; «клад» в имени → кладовые); текущий срез учитывает фильтры.
        </p>
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-3 py-2.5">Тип объекта</th>
                <th className="px-3 py-2.5 text-right">Кол-во</th>
                <th className="px-3 py-2.5 text-right">Сумма</th>
                <th className="px-3 py-2.5 text-right">Средний чек</th>
              </tr>
            </thead>
            <tbody>
              {byTypeRows.length > 0 ? (
                byTypeRows.map((r) => (
                  <tr key={r.key} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-3 py-2.5 font-medium text-slate-900">{r.key}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{numFmt.format(r.count)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{rubFmt.format(r.sum)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{rubFmt.format(r.avgCheck)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-600">
                    {DEALS_TABLE_NO_ROWS}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={panelClass}>
        <h3 className="text-base font-semibold text-slate-900">Параметры объекта</h3>
        <p className="text-xs text-slate-500">
          До 50 сделок в срезе. Сортировка: сначала <span className="font-mono">object.category</span> (квартира → машиноместо → кладовая →
          коммерция), внутри группы — <span className="font-mono">deal.deal_date</span> по убыванию. Источник:{" "}
          <span className="font-mono">data[]</span>. Маппинг полей и ₽/м² без изменений. <span className="font-mono">buyer</span> не
          используется.
        </p>
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-3 py-2.5">Дата</th>
                <th className="px-3 py-2.5">Тип</th>
                <th className="px-3 py-2.5 text-right">Цена</th>
                <th className="px-3 py-2.5 text-right">Площадь</th>
                <th className="px-3 py-2.5 text-right">₽/м²</th>
                <th className="px-3 py-2.5">Этаж</th>
                <th className="px-3 py-2.5">Секция</th>
              </tr>
            </thead>
            <tbody>
              {objectParamsTableRows.length > 0 ? (
                objectParamsTableRows.map((r, idx) => {
                  const t = toDealObjectParamsTableRow(r);
                  return (
                    <tr key={`obj-${r.dealDate}-${r.objectLabel}-${r.sumRub}-${idx}`} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-900">{t.date}</td>
                      <td className="px-3 py-2.5 text-slate-800">{t.type ?? DEALS_LABEL_EM_DASH}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">
                        {t.price != null ? dealObjectPriceFmt.format(t.price) : DEALS_LABEL_EM_DASH}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">
                        {t.area != null ? `${dealObjectAreaFmt.format(t.area)} м²` : DEALS_LABEL_EM_DASH}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">
                        {t.price_per_m2 != null
                          ? `${dealObjectRubPerM2Fmt.format(t.price_per_m2)}\u00a0₽/м²`
                          : DEALS_LABEL_EM_DASH}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-slate-800">{t.floor ?? DEALS_LABEL_EM_DASH}</td>
                      <td className="px-3 py-2.5 text-slate-800">{t.section ?? DEALS_LABEL_EM_DASH}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-600">
                    {DEALS_TABLE_NO_ROWS}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={panelClass}>
        <h3 className="text-base font-semibold text-slate-900">Сделки по объектам</h3>
        <p className="text-xs text-slate-500">
          Агрегат <span className="font-mono">analytics.dealsByProject</span> из{" "}
          <span className="font-mono">normalizeDeal</span>:{" "}
          <span className="font-mono">object.name</span> → <span className="font-mono">object.project_name</span> →{" "}
          <span className="font-mono">project</span>.
        </p>
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-3 py-2.5">Объект</th>
                <th className="px-3 py-2.5 text-right">Кол-во</th>
                <th className="px-3 py-2.5 text-right">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {byObjectRows.length > 0 ? (
                byObjectRows.map((r) => (
                  <tr key={r.key} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-3 py-2.5 font-medium text-slate-900">{r.key}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{numFmt.format(r.count)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{rubFmt.format(r.sum)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-sm text-slate-600">
                    {DEALS_TABLE_NO_ROWS}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={panelClass}>
        <h3 className="text-base font-semibold text-slate-900">Сделки по менеджерам</h3>
        <p className="text-xs text-slate-500">
          <span className="font-mono">normalizeDeal</span> → <span className="font-mono">analytics.dealsByManager</span>:{" "}
          <span className="font-mono">deal.manager_name</span> → <span className="font-mono">deal.manager</span> →{" "}
          <span className="font-mono">deal.responsible</span>.
        </p>
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-3 py-2.5">Менеджер</th>
                <th className="px-3 py-2.5 text-right">Кол-во</th>
                <th className="px-3 py-2.5 text-right">Сумма</th>
                <th className="px-3 py-2.5 text-right">Средний чек</th>
              </tr>
            </thead>
            <tbody>
              {byManagerRows.length > 0 ? (
                byManagerRows.map((r) => (
                  <tr key={`m-${r.key}`} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-3 py-2.5 font-medium text-slate-900">{r.key}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{numFmt.format(r.count)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{rubFmt.format(r.sum)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{rubFmt.format(r.avgCheck)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-600">
                    {DEALS_TABLE_NO_ROWS}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={panelClass}>
        <h3 className="text-base font-semibold text-slate-900">Сделки по источникам</h3>
        <p className="text-xs text-slate-500">
          <span className="font-mono">normalizeDeal</span> → <span className="font-mono">analytics.dealsBySource</span>:{" "}
          <span className="font-mono">deal.source</span> → <span className="font-mono">deal.deal_source</span> →{" "}
          <span className="font-mono">deal.utm_source</span>.
        </p>
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-3 py-2.5">Источник</th>
                <th className="px-3 py-2.5 text-right">Кол-во</th>
                <th className="px-3 py-2.5 text-right">Сумма</th>
                <th className="px-3 py-2.5 text-right">Средний чек</th>
              </tr>
            </thead>
            <tbody>
              {bySourceRows.length > 0 ? (
                bySourceRows.map((r) => (
                  <tr key={`s-${r.key}`} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-3 py-2.5 font-medium text-slate-900">{r.key}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{numFmt.format(r.count)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{rubFmt.format(r.sum)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{rubFmt.format(r.avgCheck)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-600">
                    {DEALS_TABLE_NO_ROWS}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={panelClass}>
        <h3 className="text-base font-semibold text-slate-900">Сырые сделки</h3>
        <p className="text-xs text-slate-500">
          Отсортировано по дате убыванию; показано не более 50 строк из текущего среза ({filteredRows.length} всего).
        </p>
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-3 py-2.5">Дата сделки</th>
                <th className="px-3 py-2.5 text-right">Сумма</th>
                <th className="px-3 py-2.5">Тип объекта</th>
                <th className="px-3 py-2.5">Объект / ЖК</th>
                <th className="px-3 py-2.5">Менеджер</th>
                <th className="px-3 py-2.5">Источник</th>
                <th className="px-3 py-2.5">Статус</th>
                <th className="px-3 py-2.5">Клиент</th>
              </tr>
            </thead>
            <tbody>
              {rawTableRows.length > 0 ? (
                rawTableRows.map((r, idx) => (
                  <tr key={`${r.dealDate}-${r.sumRub}-${idx}`} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-900">{r.dealDate}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{rubFmt.format(r.sumRub)}</td>
                    <td className="px-3 py-2.5 text-slate-800">
                      <div className="font-medium">{r.typeLabel}</div>
                      {r.dealKindLabel !== DEALS_LABEL_UNSPECIFIED ? (
                        <div className="text-xs text-slate-500">{r.dealKindLabel}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-slate-800">{r.objectLabel}</td>
                    <td className="px-3 py-2.5 text-slate-800">{r.managerLabel}</td>
                    <td className="px-3 py-2.5 text-slate-800">{r.sourceLabel}</td>
                    <td className="px-3 py-2.5 text-slate-800">{r.statusLabel}</td>
                    <td className="px-3 py-2.5 text-slate-800">{r.clientLabel}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-sm text-slate-600">
                    {DEALS_TABLE_NO_ROWS}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
