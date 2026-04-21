"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  extractNormalizedDeals,
  groupDealsBySegment,
  type DealSegmentKey,
  type NormalizedDealRow,
} from "@/components/marketing/DealsSection";
import { useMarketingPresVisual } from "@/components/marketing/marketingPresentationLightContext";
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

/**
 * Визуал сегментов = та же база, что KPI (SalesPlanKpiDashboard): тройной градиент,
 * shadow 14px/36px, inset, radial сверху-слева; без жёсткой рамки — акцент через свечение.
 */
type SegmentVisual = {
  card: string;
  glow: string;
  insetGlow: string;
  hoverGlow: string;
  radial: string;
  /** Мягкий переливающийся слой (linear-gradient + .segment-card-gradient-sheen) */
  sheen: string;
  /** Заливка микро-бара доли выручки */
  barFill: string;
  label: string;
  value: string;
  sub: string;
  tertiary: string;
};

const SEGMENT_VISUAL_PRESENTATION: Record<DealSegmentKey, SegmentVisual> = {
  apartment: {
    card: "bg-gradient-to-br from-indigo-900/42 via-slate-900/38 to-slate-900/60",
    glow: "shadow-[0_14px_36px_rgba(99,102,241,0.26)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_36px_rgba(99,102,241,0.15)]",
    hoverGlow: "hover:shadow-[0_22px_44px_rgba(99,102,241,0.38)]",
    radial: "radial-gradient(circle at 18% 15%, rgba(129,140,248,0.28), transparent 52%)",
    sheen: "linear-gradient(125deg, rgba(129,140,248,0.22) 0%, transparent 42%, rgba(255,255,255,0.04) 100%)",
    barFill: "rgba(129, 140, 248, 0.92)",
    label: "text-indigo-300/90",
    value: "text-indigo-50",
    sub: "text-slate-400",
    tertiary: "text-slate-500/85",
  },
  parking: {
    card: "bg-gradient-to-br from-violet-900/40 via-slate-900/38 to-slate-900/60",
    glow: "shadow-[0_14px_36px_rgba(139,92,246,0.24)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_36px_rgba(167,139,250,0.14)]",
    hoverGlow: "hover:shadow-[0_22px_44px_rgba(139,92,246,0.36)]",
    radial: "radial-gradient(circle at 18% 15%, rgba(167,139,250,0.26), transparent 52%)",
    sheen: "linear-gradient(125deg, rgba(167,139,250,0.2) 0%, transparent 42%, rgba(255,255,255,0.035) 100%)",
    barFill: "rgba(167, 139, 250, 0.9)",
    label: "text-violet-300/90",
    value: "text-violet-50",
    sub: "text-slate-400",
    tertiary: "text-slate-500/85",
  },
  storage: {
    card: "bg-gradient-to-br from-slate-800/48 via-slate-900/38 to-slate-900/60",
    glow: "shadow-[0_14px_36px_rgba(34,211,238,0.16)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_36px_rgba(103,232,249,0.08)]",
    hoverGlow: "hover:shadow-[0_22px_44px_rgba(34,211,238,0.24)]",
    radial: "radial-gradient(circle at 18% 15%, rgba(103,232,249,0.14), transparent 52%)",
    sheen: "linear-gradient(125deg, rgba(148,163,184,0.14) 0%, transparent 45%, rgba(103,232,249,0.08) 100%)",
    barFill: "rgba(103, 232, 249, 0.55)",
    label: "text-slate-400",
    value: "text-slate-100",
    sub: "text-slate-400",
    tertiary: "text-slate-500/80",
  },
  commercial: {
    card: "bg-gradient-to-br from-orange-900/40 via-slate-900/38 to-slate-900/60",
    glow: "shadow-[0_14px_36px_rgba(249,115,22,0.24)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_36px_rgba(251,146,60,0.12)]",
    hoverGlow: "hover:shadow-[0_22px_44px_rgba(249,115,22,0.36)]",
    radial: "radial-gradient(circle at 18% 15%, rgba(251,146,60,0.26), transparent 52%)",
    sheen: "linear-gradient(125deg, rgba(251,146,60,0.22) 0%, transparent 40%, rgba(248,113,113,0.08) 100%)",
    barFill: "rgba(251, 146, 60, 0.95)",
    label: "text-orange-300/90",
    value: "text-orange-50",
    sub: "text-slate-400",
    tertiary: "text-slate-500/85",
  },
};

const SEGMENT_VISUAL_WORK: Record<DealSegmentKey, SegmentVisual> = {
  apartment: {
    card: "bg-gradient-to-br from-indigo-100/85 via-white to-indigo-50/70",
    glow: "shadow-[0_12px_30px_rgba(99,102,241,0.18)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_0_0_26px_rgba(99,102,241,0.10)]",
    hoverGlow: "hover:shadow-[0_18px_38px_rgba(99,102,241,0.24)]",
    radial: "radial-gradient(circle at 18% 15%, rgba(129,140,248,0.24), transparent 55%)",
    sheen: "linear-gradient(125deg, rgba(129,140,248,0.18) 0%, transparent 50%, rgba(255,255,255,0.5) 100%)",
    barFill: "rgba(79, 70, 229, 0.88)",
    label: "text-indigo-700/90",
    value: "text-indigo-950",
    sub: "text-slate-600",
    tertiary: "text-slate-500",
  },
  parking: {
    card: "bg-gradient-to-br from-violet-100/85 via-white to-violet-50/70",
    glow: "shadow-[0_12px_30px_rgba(139,92,246,0.16)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_0_0_26px_rgba(167,139,250,0.09)]",
    hoverGlow: "hover:shadow-[0_18px_38px_rgba(139,92,246,0.22)]",
    radial: "radial-gradient(circle at 18% 15%, rgba(167,139,250,0.22), transparent 55%)",
    sheen: "linear-gradient(125deg, rgba(167,139,250,0.16) 0%, transparent 50%, rgba(255,255,255,0.45) 100%)",
    barFill: "rgba(124, 58, 237, 0.82)",
    label: "text-violet-800/90",
    value: "text-violet-950",
    sub: "text-slate-600",
    tertiary: "text-slate-500",
  },
  storage: {
    card: "bg-gradient-to-br from-slate-100/90 via-white to-cyan-50/65",
    glow: "shadow-[0_12px_30px_rgba(14,116,144,0.12)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_0_0_26px_rgba(34,211,238,0.07)]",
    hoverGlow: "hover:shadow-[0_18px_38px_rgba(14,116,144,0.18)]",
    radial: "radial-gradient(circle at 18% 15%, rgba(34,211,238,0.12), transparent 55%)",
    sheen: "linear-gradient(125deg, rgba(148,163,184,0.12) 0%, transparent 50%, rgba(236,254,255,0.6) 100%)",
    barFill: "rgba(8, 145, 178, 0.65)",
    label: "text-slate-600",
    value: "text-slate-900",
    sub: "text-slate-600",
    tertiary: "text-slate-500",
  },
  commercial: {
    card: "bg-gradient-to-br from-orange-100/85 via-white to-amber-50/70",
    glow: "shadow-[0_12px_30px_rgba(234,88,12,0.16)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_0_0_26px_rgba(251,146,60,0.10)]",
    hoverGlow: "hover:shadow-[0_18px_38px_rgba(234,88,12,0.22)]",
    radial: "radial-gradient(circle at 18% 15%, rgba(251,146,60,0.22), transparent 55%)",
    sheen: "linear-gradient(125deg, rgba(251,146,60,0.16) 0%, transparent 48%, rgba(254,215,170,0.5) 100%)",
    barFill: "rgba(234, 88, 12, 0.88)",
    label: "text-orange-800/90",
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
  const presDark = useMarketingPresVisual(presentation) === "presDark";
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
        <h2 className={`mb-3 text-sm font-semibold ${presDark ? "text-slate-300" : presentation ? "text-mpl-text" : "text-slate-800"}`}>Структура продаж</h2>
        <p className={`text-xs ${presDark ? "text-slate-500" : presentation ? "text-mpl-muted" : "text-slate-600"}`}>{loadError}</p>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="mb-7">
        <h2 className={`mb-3 text-sm font-semibold ${presDark ? "text-slate-300" : presentation ? "text-mpl-text" : "text-slate-800"}`}>Структура продаж</h2>
        <p className={`text-xs ${presDark ? "text-slate-500" : presentation ? "text-mpl-muted" : "text-slate-600"}`}>
          Нет сделок по сегментам в текущем срезе (загрузите выгрузку или смените фильтр объекта).
        </p>
      </div>
    );
  }

  return (
    <div className="mb-7">
      <h2 className={`mb-3 text-sm font-semibold ${presDark ? "text-slate-300" : presentation ? "text-mpl-text" : "text-slate-800"}`}>Структура продаж</h2>
      <p className={`mb-4 text-[11px] leading-snug ${presDark ? "text-slate-500" : presentation ? "text-mpl-muted" : "text-slate-600"}`}>
        По нормализованным сделкам (<span className="font-mono">normalizeDeal</span> / сегмент из <span className="font-mono">type</span> и{" "}
        <span className="font-mono">object.category</span>).
      </p>
      <div className={`${gridClass} items-stretch`}>
        {cards.map((c) => {
          const vs = presDark ? SEGMENT_VISUAL_PRESENTATION[c.key] : SEGMENT_VISUAL_WORK[c.key];
          const sharePct = Math.min(100, Math.max(0, c.share * 100));
          return (
            <div key={c.key} className="flex h-full min-h-0 flex-col">
              <div
                className={`group relative flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-xl ${vs.card} ${vs.glow} ${vs.insetGlow} ${vs.hoverGlow} transition-[transform,box-shadow] duration-200 ease-out will-change-transform hover:z-[1] hover:-translate-y-0.5`}
              >
                <div className="pointer-events-none absolute inset-0" style={{ background: vs.radial }} aria-hidden />
                <div
                  className={`pointer-events-none absolute inset-0 rounded-xl segment-card-gradient-sheen ${
                    presentation ? "opacity-[0.38] mix-blend-soft-light" : "opacity-[0.22]"
                  }`}
                  style={{ backgroundImage: vs.sheen }}
                  aria-hidden
                />
                <div
                  className={`pointer-events-none absolute inset-0 rounded-xl mix-blend-overlay ${
                    presentation ? "opacity-[0.14]" : "opacity-[0.06]"
                  }`}
                  style={{
                    backgroundImage: `repeating-linear-gradient(135deg, rgba(255,255,255,0.06) 0px, transparent 1px, transparent 5px)`,
                  }}
                  aria-hidden
                />
                <div className="relative flex min-h-0 flex-1 flex-col p-3 sm:p-3.5">
                  <div className={`min-w-0 text-[11px] uppercase tracking-wide ${vs.label}`}>{c.title}</div>
                  <div className={`mt-1.5 text-2xl font-medium leading-none tabular-nums sm:text-[30px] ${vs.value}`}>
                    <span className="tabular-nums">{numFmt.format(c.count)}</span>
                    <span className="opacity-70"> шт</span>
                    <span className="inline-block px-0.5 opacity-45 select-none" aria-hidden>
                      {" · "}
                    </span>
                    <span className="tabular-nums">{compactRub(c.sum)}</span>
                  </div>
                  <div className={`mt-1 text-[11px] tabular-nums leading-snug ${vs.sub}`}>
                    Средний чек: <span className={`font-semibold ${presentation ? "text-slate-200" : "text-slate-800"}`}>{rubFmt.format(c.avg)}</span>
                  </div>
                  <div className="mt-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`text-[10px] font-semibold uppercase tracking-wide ${vs.tertiary}`}>Доля выручки</span>
                      <span className={`text-[11px] tabular-nums leading-none ${vs.tertiary}`}>{shareFmt.format(c.share)}</span>
                    </div>
                    <div
                      className={`mt-1.5 h-1 w-full overflow-hidden rounded-full ${
                        presentation ? "bg-white/[0.08] ring-1 ring-white/[0.06]" : "bg-slate-200/90 ring-1 ring-slate-300/50"
                      }`}
                    >
                      <div
                        className={`h-full rounded-full transition-[width] duration-500 ease-out ${
                          presentation ? "shadow-[0_0_12px_rgba(255,255,255,0.12)]" : ""
                        }`}
                        style={{
                          width: `${sharePct}%`,
                          backgroundColor: vs.barFill,
                        }}
                      />
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
