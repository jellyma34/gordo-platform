"use client";

/**
 * Раздел «Сделки»: рабочий режим — только таблицы и цифры; презентация — DealsPresentation.
 */

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

const DealsPresentationPanel = dynamic(() => import("./DealsPresentation"), { ssr: false });

export const DEALS_EMPTY_LABEL = "нет данных";

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

export type DealRecord = {
  deal_date?: string;
  deal_sum?: string | number;
  deal_type?: string;
  type?: string;
  dealType?: string;
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
};

export type DealExportRow = {
  id?: string | number;
  deal?: DealRecord;
};

/** Сделки по месяцам (ключ YYYY-MM). */
export type DealsByMonth = Record<string, DealExportRow[]>;

export type DealsPerMonthGrouped = Record<string, { count: number; sum: number }>;

export type SegmentBucket = { count: number; sum: number };

export type NormalizedDealRow = {
  dealDate: string;
  dealDateMs: number;
  monthKey: string;
  sumRub: number;
  typeLabel: string;
  objectLabel: string;
  managerLabel: string;
  sourceLabel: string;
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

function normalizeField(value: unknown): string {
  if (value == null) return DEALS_EMPTY_LABEL;
  const s = String(value).trim();
  return s.length > 0 ? s : DEALS_EMPTY_LABEL;
}

function pickFirstString(record: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    if (k in record && record[k] != null && String(record[k]).trim() !== "") {
      return normalizeField(record[k]);
    }
  }
  return DEALS_EMPTY_LABEL;
}

function monthKeyFromDate(dateStr: string): string {
  return String(dateStr).trim().slice(0, 7);
}

function parseDealDateMs(dateStr: string): number {
  const d = new Date(String(dateStr).trim());
  const t = d.getTime();
  return Number.isFinite(t) ? t : 0;
}

export function extractNormalizedDeals(data: unknown): NormalizedDealRow[] {
  const list: DealExportRow[] = Array.isArray(data) ? data : [];
  const out: NormalizedDealRow[] = [];

  for (const item of list) {
    const deal = item?.deal;
    if (deal == null || typeof deal !== "object") continue;
    const d = deal as DealRecord & Record<string, unknown>;
    const dealDateRaw = d.deal_date;
    if (dealDateRaw == null || String(dealDateRaw).trim() === "") continue;

    const dealDate = String(dealDateRaw).trim().slice(0, 10);
    const monthKey = monthKeyFromDate(dealDate);
    const sumRub = parseDealSum(d.deal_sum);

    const typeLabel = pickFirstString(d as Record<string, unknown>, [
      "deal_type",
      "type",
      "dealType",
      "category",
      "deal_kind",
    ]);
    const objectLabel = pickFirstString(d as Record<string, unknown>, [
      "house_name",
      "project_name",
      "object",
      "zhk",
      "jk",
      "complex_name",
      "house",
      "building",
    ]);
    const managerLabel = pickFirstString(d as Record<string, unknown>, [
      "manager_name",
      "manager",
      "responsible",
      "user_name",
      "agent_name",
    ]);
    const sourceLabel = pickFirstString(d as Record<string, unknown>, [
      "source",
      "deal_source",
      "utm_source",
      "channel",
      "lead_source",
    ]);

    out.push({
      dealDate,
      dealDateMs: parseDealDateMs(dealDate),
      monthKey,
      sumRub,
      typeLabel,
      objectLabel,
      managerLabel,
      sourceLabel,
    });
  }

  return out;
}

function bumpBucket(map: Record<string, SegmentBucket>, key: string, sum: number) {
  if (!map[key]) map[key] = { count: 0, sum: 0 };
  map[key].count += 1;
  map[key].sum += sum;
}

function flattenDealsInput(data: unknown): DealExportRow[] {
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
    const types = [...new Set(rows.map((r) => r.typeLabel))].sort((a, b) => a.localeCompare(b, "ru"));
    const objects = [...new Set(rows.map((r) => r.objectLabel))].sort((a, b) => a.localeCompare(b, "ru"));
    return { months, types, objects };
  }, [fullBase.normalizedDeals]);

  const filteredRows = useMemo(() => {
    return fullBase.normalizedDeals.filter((r) => {
      if (filterMonth && r.monthKey !== filterMonth) return false;
      if (filterType && r.typeLabel !== filterType) return false;
      if (filterObject && r.objectLabel !== filterObject) return false;
      return true;
    });
  }, [filterMonth, filterType, filterObject, fullBase.normalizedDeals]);

  const analytics = useMemo(() => computeDealMetrics(filteredRows), [filteredRows]);

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
      : `К предыдущему: ${prevMonthLabel ?? DEALS_EMPTY_LABEL}`;
  const momValue =
    deltaCount != null && deltaPct != null
      ? `${deltaCount >= 0 ? "+" : ""}${numFmt.format(deltaCount)} шт · ${deltaPct >= 0 ? "+" : ""}${pctFmt.format(deltaPct)}%`
      : DEALS_EMPTY_LABEL;

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
              Срез по выгрузке: все поля <span className="font-mono text-xs">deal.*</span> нормализуются в таблицах ниже.
              Рабочий режим: только таблицы и показатели, без графиков.
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
            Тип
            <select
              className={selectClass}
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              aria-label="Фильтр по типу сделки"
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
                    {r.delta == null ? DEALS_EMPTY_LABEL : `${r.delta >= 0 ? "+" : ""}${numFmt.format(r.delta)}`}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${deltaPctCellClass(r.delta, r.deltaPct)}`}>
                    {r.deltaPct == null ? DEALS_EMPTY_LABEL : `${r.deltaPct >= 0 ? "+" : ""}${pctFmt.format(r.deltaPct)}%`}
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
                <td className="px-3 py-2.5 text-right text-slate-600">{DEALS_EMPTY_LABEL}</td>
                <td className="px-3 py-2.5 text-right text-slate-600">{DEALS_EMPTY_LABEL}</td>
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
                      {r.deltaPct == null ? DEALS_EMPTY_LABEL : `${r.deltaPct >= 0 ? "+" : ""}${pctFmt.format(r.deltaPct)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-600">{DEALS_EMPTY_LABEL}: нужен ряд минимум из двух месяцев в срезе.</p>
        )}
      </section>

      <section className={panelClass}>
        <h3 className="text-base font-semibold text-slate-900">Сделки по типам</h3>
        <p className="text-xs text-slate-500">Агрегат analytics.dealsByType для текущего среза.</p>
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-3 py-2.5">Тип</th>
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
                    {DEALS_EMPTY_LABEL}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={panelClass}>
        <h3 className="text-base font-semibold text-slate-900">Сделки по объектам</h3>
        <p className="text-xs text-slate-500">Агрегат analytics.dealsByProject (дом / ЖК).</p>
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
                    {DEALS_EMPTY_LABEL}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={panelClass}>
        <h3 className="text-base font-semibold text-slate-900">Сделки по менеджерам</h3>
        <p className="text-xs text-slate-500">analytics.dealsByManager — поля manager_name, manager, responsible и др.</p>
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
                    {DEALS_EMPTY_LABEL}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={panelClass}>
        <h3 className="text-base font-semibold text-slate-900">Сделки по источникам</h3>
        <p className="text-xs text-slate-500">analytics.dealsBySource — source, deal_source, utm_source и др.</p>
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
                    {DEALS_EMPTY_LABEL}
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
                <th className="px-3 py-2.5">Тип</th>
                <th className="px-3 py-2.5">Объект / ЖК</th>
                <th className="px-3 py-2.5">Менеджер</th>
                <th className="px-3 py-2.5">Источник</th>
              </tr>
            </thead>
            <tbody>
              {rawTableRows.length > 0 ? (
                rawTableRows.map((r, idx) => (
                  <tr key={`${r.dealDate}-${r.sumRub}-${idx}`} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-900">{r.dealDate}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{rubFmt.format(r.sumRub)}</td>
                    <td className="px-3 py-2.5 text-slate-800">{r.typeLabel}</td>
                    <td className="px-3 py-2.5 text-slate-800">{r.objectLabel}</td>
                    <td className="px-3 py-2.5 text-slate-800">{r.managerLabel}</td>
                    <td className="px-3 py-2.5 text-slate-800">{r.sourceLabel}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-600">
                    {DEALS_EMPTY_LABEL} в текущем срезе — измените фильтры.
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
