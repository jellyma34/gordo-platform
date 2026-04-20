"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  extractNormalizedDeals,
  groupDealsBySegment,
  type DealSegmentKey,
  type NormalizedDealRow,
} from "@/components/marketing/DealsSection";
import { marketingMockData } from "@/lib/marketingMockData";
import { compactRub, numFmt, rubFmt } from "@/lib/salesPlanChartFormat";

const shareFmt = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 1 });

const SEGMENT_ORDER: DealSegmentKey[] = ["apartment", "parking", "storage", "commercial"];

const SEGMENT_TITLES: Record<DealSegmentKey, string> = {
  apartment: "Квартиры",
  parking: "Машино-места",
  storage: "Кладовые",
  commercial: "Коммерция",
};

/** Визуальные темы сегментов (как у KPI: градиент, glow, radial). */
type SegmentVisual = {
  card: string;
  glow: string;
  insetGlow: string;
  hoverGlow: string;
  radial: string;
  border: string;
  ring: string;
  label: string;
  value: string;
  sub: string;
  tertiary: string;
};

const SEGMENT_VISUAL_PRESENTATION: Record<DealSegmentKey, SegmentVisual> = {
  apartment: {
    card: "bg-gradient-to-br from-indigo-900/50 via-slate-900/38 to-slate-950/72",
    glow: "shadow-[0_14px_38px_rgba(99,102,241,0.28)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.07),inset_0_0_40px_rgba(99,102,241,0.14)]",
    hoverGlow: "hover:shadow-[0_20px_48px_rgba(99,102,241,0.38)]",
    radial: "radial-gradient(circle at 18% 14%, rgba(129,140,248,0.38), transparent 54%)",
    border: "border-indigo-400/35",
    ring: "ring-1 ring-indigo-300/15",
    label: "text-indigo-200/75",
    value: "text-indigo-50",
    sub: "text-slate-400",
    tertiary: "text-slate-500/90",
  },
  parking: {
    card: "bg-gradient-to-br from-violet-900/48 via-slate-900/38 to-slate-950/72",
    glow: "shadow-[0_14px_38px_rgba(139,92,246,0.26)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.07),inset_0_0_40px_rgba(139,92,246,0.13)]",
    hoverGlow: "hover:shadow-[0_20px_48px_rgba(139,92,246,0.36)]",
    radial: "radial-gradient(circle at 18% 14%, rgba(167,139,250,0.34), transparent 54%)",
    border: "border-violet-400/32",
    ring: "ring-1 ring-violet-300/15",
    label: "text-violet-200/75",
    value: "text-violet-50",
    sub: "text-slate-400",
    tertiary: "text-slate-500/90",
  },
  storage: {
    card: "bg-gradient-to-br from-slate-800/70 via-cyan-950/25 to-slate-950/75",
    glow: "shadow-[0_14px_38px_rgba(34,211,238,0.14)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_40px_rgba(34,211,238,0.08)]",
    hoverGlow: "hover:shadow-[0_20px_48px_rgba(34,211,238,0.22)]",
    radial: "radial-gradient(circle at 18% 14%, rgba(103,232,249,0.18), transparent 54%)",
    border: "border-cyan-500/22",
    ring: "ring-1 ring-slate-400/15",
    label: "text-cyan-100/65",
    value: "text-slate-100",
    sub: "text-slate-400",
    tertiary: "text-slate-500/85",
  },
  commercial: {
    card: "bg-gradient-to-br from-orange-950/55 via-slate-900/38 to-slate-950/72",
    glow: "shadow-[0_14px_38px_rgba(249,115,22,0.24)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_40px_rgba(249,115,22,0.12)]",
    hoverGlow: "hover:shadow-[0_20px_48px_rgba(249,115,22,0.34)]",
    radial: "radial-gradient(circle at 18% 14%, rgba(251,146,60,0.28), transparent 54%)",
    border: "border-orange-400/30",
    ring: "ring-1 ring-orange-300/12",
    label: "text-orange-200/70",
    value: "text-orange-50",
    sub: "text-slate-400",
    tertiary: "text-slate-500/90",
  },
};

const SEGMENT_VISUAL_WORK: Record<DealSegmentKey, SegmentVisual> = {
  apartment: {
    card: "bg-gradient-to-br from-indigo-50/95 via-white to-indigo-100/65",
    glow: "shadow-[0_12px_32px_rgba(99,102,241,0.16)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_0_28px_rgba(99,102,241,0.08)]",
    hoverGlow: "hover:shadow-[0_18px_42px_rgba(99,102,241,0.22)]",
    radial: "radial-gradient(circle at 18% 14%, rgba(129,140,248,0.28), transparent 58%)",
    border: "border-indigo-200/90",
    ring: "ring-1 ring-indigo-100/70",
    label: "text-indigo-700/85",
    value: "text-indigo-950",
    sub: "text-slate-600",
    tertiary: "text-slate-500",
  },
  parking: {
    card: "bg-gradient-to-br from-violet-50/95 via-white to-violet-100/60",
    glow: "shadow-[0_12px_32px_rgba(139,92,246,0.14)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_0_28px_rgba(139,92,246,0.07)]",
    hoverGlow: "hover:shadow-[0_18px_42px_rgba(139,92,246,0.20)]",
    radial: "radial-gradient(circle at 18% 14%, rgba(167,139,250,0.24), transparent 58%)",
    border: "border-violet-200/85",
    ring: "ring-1 ring-violet-100/65",
    label: "text-violet-800/80",
    value: "text-violet-950",
    sub: "text-slate-600",
    tertiary: "text-slate-500",
  },
  storage: {
    card: "bg-gradient-to-br from-slate-50/98 via-white to-cyan-50/50",
    glow: "shadow-[0_12px_32px_rgba(14,116,144,0.10)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_0_28px_rgba(34,211,238,0.06)]",
    hoverGlow: "hover:shadow-[0_18px_42px_rgba(14,116,144,0.16)]",
    radial: "radial-gradient(circle at 18% 14%, rgba(34,211,238,0.14), transparent 58%)",
    border: "border-slate-200/95",
    ring: "ring-1 ring-cyan-100/50",
    label: "text-slate-600",
    value: "text-slate-900",
    sub: "text-slate-600",
    tertiary: "text-slate-500",
  },
  commercial: {
    card: "bg-gradient-to-br from-orange-50/95 via-white to-amber-50/65",
    glow: "shadow-[0_12px_32px_rgba(234,88,12,0.14)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_0_28px_rgba(251,146,60,0.08)]",
    hoverGlow: "hover:shadow-[0_18px_42px_rgba(234,88,12,0.20)]",
    radial: "radial-gradient(circle at 18% 14%, rgba(251,146,60,0.22), transparent 58%)",
    border: "border-orange-200/85",
    ring: "ring-1 ring-amber-100/60",
    label: "text-orange-800/80",
    value: "text-orange-950",
    sub: "text-slate-600",
    tertiary: "text-slate-500",
  },
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
      <p className={`mb-4 text-[11px] leading-snug ${presentation ? "text-slate-500" : "text-slate-600"}`}>
        По нормализованным сделкам (<span className="font-mono">normalizeDeal</span> / сегмент из <span className="font-mono">type</span> и{" "}
        <span className="font-mono">object.category</span>).
      </p>
      <div className={`${gridClass} items-stretch`}>
        {cards.map((c) => {
          const vs = presentation ? SEGMENT_VISUAL_PRESENTATION[c.key] : SEGMENT_VISUAL_WORK[c.key];
          return (
            <div key={c.key} className="flex min-h-[12.5rem] h-full flex-col">
              <div
                className={`group relative flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border ${vs.border} ${vs.ring} ${vs.card} ${vs.glow} ${vs.insetGlow} ${vs.hoverGlow} transition duration-200 ease-out will-change-transform hover:z-[1] hover:scale-[1.02]`}
              >
                <div className="pointer-events-none absolute inset-0 rounded-2xl" style={{ background: vs.radial }} />
                <div className="relative flex h-full flex-1 flex-col justify-between gap-3 p-4 sm:p-[1.125rem]">
                  <div className={`text-[10px] font-bold uppercase tracking-[0.12em] ${vs.label}`}>{c.title}</div>
                  <div className={`min-h-[3.25rem] text-2xl font-extrabold leading-[1.15] tabular-nums tracking-tight sm:text-[26px] sm:leading-none ${vs.value}`}>
                    {numFmt.format(c.count)} шт · {compactRub(c.sum)}
                  </div>
                  <div
                    className={`mt-auto space-y-1.5 border-t pt-3 ${presentation ? "border-white/10" : "border-slate-200/90"}`}
                  >
                    <div className={`text-[13px] tabular-nums leading-snug ${vs.sub}`}>
                      Средний чек: <span className={`font-semibold ${presentation ? "text-slate-200" : "text-slate-800"}`}>{rubFmt.format(c.avg)}</span>
                    </div>
                    <div className={`text-[11px] tabular-nums leading-snug ${vs.tertiary}`}>
                      Доля: <span className="font-medium opacity-95">{shareFmt.format(c.share)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
