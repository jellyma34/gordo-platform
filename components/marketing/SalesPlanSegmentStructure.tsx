"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  extractNormalizedDeals,
  groupDealsBySegment,
  type DealSegmentKey,
  type NormalizedDealRow,
} from "@/components/marketing/DealsSection";
import { marketingMockData } from "@/lib/marketingMockData";
import { numFmt, rubFmt } from "@/lib/salesPlanChartFormat";

const shareFmt = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 1 });

const SEGMENT_ORDER: DealSegmentKey[] = ["apartment", "parking", "storage", "commercial"];

const SEGMENT_TITLES: Record<DealSegmentKey, string> = {
  apartment: "Квартиры",
  parking: "Машино-места",
  storage: "Кладовые",
  commercial: "Коммерция",
};

function parseDealsEnvelope(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json != null && typeof json === "object" && "data" in json && Array.isArray((json as { data: unknown }).data)) {
    return (json as { data: unknown[] }).data;
  }
  return [];
}

/**
 * Сужает строки по выбранному ЖК (мок-фильтры маркетинга). API-сделки матчятся по objectLabel.
 */
export function filterNormalizedDealsForMarketingObject(rows: NormalizedDealRow[], objectId: string): NormalizedDealRow[] {
  if (!objectId || objectId === "all") return rows;
  if (objectId === "gordo-park") {
    return rows.filter((r) => /паркинг/i.test(r.objectLabel));
  }
  if (objectId === "gordo-main") {
    return rows.filter((r) => !/паркинг/i.test(r.objectLabel));
  }
  const opt = marketingMockData.objects.find((o) => o.id === objectId);
  if (!opt || opt.id === "all") return rows;
  const needle = opt.name.slice(0, 12).toLowerCase();
  return rows.filter((r) => r.objectLabel.toLowerCase().includes(needle));
}

type Props = {
  presentation: boolean;
  objectId: string;
};

export function SalesPlanSegmentStructure({ presentation, objectId }: Props) {
  const [rows, setRows] = useState<NormalizedDealRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/deals");
      const json: unknown = await res.json();
      if (!res.ok) {
        setRows([]);
        setLoadError(typeof json === "object" && json && "error" in json ? String((json as { error: unknown }).error) : `Ошибка ${res.status}`);
        return;
      }
      const list = parseDealsEnvelope(json);
      const normalized = extractNormalizedDeals(list);
      setRows(normalized);
    } catch {
      setRows([]);
      setLoadError("Не удалось загрузить сделки");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(
    () => filterNormalizedDealsForMarketingObject(rows, objectId),
    [rows, objectId],
  );

  const cards = useMemo(() => {
    const totalSum = filteredRows.reduce((s, r) => s + r.sumRub, 0);
    const grouped = groupDealsBySegment(filteredRows);
    const out: Array<{
      key: DealSegmentKey;
      title: string;
      count: number;
      sum: number;
      avg: number;
      share: number;
    }> = [];
    for (const key of SEGMENT_ORDER) {
      const list = grouped[key];
      if (list.length === 0) continue;
      const sum = list.reduce((s, r) => s + r.sumRub, 0);
      const count = list.length;
      out.push({
        key,
        title: SEGMENT_TITLES[key],
        count,
        sum,
        avg: count > 0 ? sum / count : 0,
        share: totalSum > 0 ? sum / totalSum : 0,
      });
    }
    return out;
  }, [filteredRows]);

  const gridClass = "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4";
  const cardPresentation =
    "rounded-xl border border-slate-600/45 bg-gradient-to-br from-slate-800/55 via-slate-900/45 to-slate-950/75 p-3.5 shadow-sm ring-1 ring-white/[0.04]";
  const cardWork =
    "rounded-xl border border-slate-200/90 bg-gradient-to-br from-white to-slate-50/90 p-3.5 shadow-sm";

  if (loadError) {
    return (
      <div className="mb-7">
        <h2 className={`mb-3 text-sm font-semibold ${presentation ? "text-slate-300" : "text-slate-800"}`}>Структура продаж</h2>
        <p className={`text-xs ${presentation ? "text-slate-500" : "text-slate-600"}`}>{loadError}</p>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="mb-7">
        <h2 className={`mb-3 text-sm font-semibold ${presentation ? "text-slate-300" : "text-slate-800"}`}>Структура продаж</h2>
        <p className={`text-xs ${presentation ? "text-slate-500" : "text-slate-600"}`}>
          Нет сделок по сегментам в текущем срезе (загрузите выгрузку или смените фильтр объекта).
        </p>
      </div>
    );
  }

  return (
    <div className="mb-7">
      <h2 className={`mb-3 text-sm font-semibold ${presentation ? "text-slate-300" : "text-slate-800"}`}>Структура продаж</h2>
      <p className={`mb-3 text-[11px] leading-snug ${presentation ? "text-slate-500" : "text-slate-600"}`}>
        По нормализованным сделкам (<span className="font-mono">normalizeDeal</span> / сегмент из <span className="font-mono">type</span> и{" "}
        <span className="font-mono">object.category</span>).
      </p>
      <div className={gridClass}>
        {cards.map((c) => (
          <div key={c.key} className={presentation ? cardPresentation : cardWork}>
            <div className={`text-[11px] font-semibold uppercase tracking-wide ${presentation ? "text-slate-400" : "text-slate-500"}`}>
              {c.title}
            </div>
            <div className={`mt-2 text-lg font-bold tabular-nums leading-tight ${presentation ? "text-slate-100" : "text-slate-900"}`}>
              {numFmt.format(c.count)} шт · {rubFmt.format(c.sum)}
            </div>
            <div className={`mt-2 space-y-0.5 text-xs tabular-nums ${presentation ? "text-slate-400" : "text-slate-600"}`}>
              <div>
                Средний чек: <span className={presentation ? "font-semibold text-slate-200" : "font-semibold text-slate-800"}>{rubFmt.format(c.avg)}</span>
              </div>
              <div>
                Доля выручки:{" "}
                <span className={presentation ? "font-semibold text-slate-200" : "font-semibold text-slate-800"}>{shareFmt.format(c.share)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
