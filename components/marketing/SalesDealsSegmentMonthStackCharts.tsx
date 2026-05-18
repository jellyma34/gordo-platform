"use client";

import { useMemo } from "react";

import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
import { MarketingDealSegmentHeader } from "@/components/marketing/MarketingDealSegmentHeader";
import { useMarketingPresentationLight, useMarketingPresVisual } from "@/components/marketing/marketingPresentationLightContext";
import {
  buildDealsSegmentAnalyticsBundle,
  type DealsAnalyticsSegmentKey,
  type DealsSegmentCardModel,
} from "@/lib/buildDealsSegmentMonthAnalytics";
import { MPL_PREMIUM_CHART_SHELL } from "@/lib/marketingPremiumUi";
import { compactRub, formatAvgPricePerM2Rub, formatSegmentMiniRevenueChartNumber, numFmt } from "@/lib/salesPlanChartFormat";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/charting/rechartsClient";
import {
  createMarketingDealsStyleMonthTickRenderer,
  MARKETING_DEALS_STYLE_MONTH_X_AXIS,
} from "@/components/marketing/marketingDealsStyleMonthXAxis";

type SegmentCardSkin = {
  dark: string;
  premium: string;
  work: string;
  radial: string;
  titleDark: string;
  titleLight: string;
  mutedDark: string;
  mutedLight: string;
};

const SEGMENT_CARD_SKIN: Record<DealsAnalyticsSegmentKey, SegmentCardSkin> = {
  apartment: {
    dark:
      "rounded-2xl border border-slate-600/45 bg-gradient-to-br from-indigo-950/35 via-slate-900/40 to-slate-950/55 shadow-[0_10px_28px_rgba(0,0,0,0.22)]",
    premium:
      "rounded-2xl border border-black/[0.04] bg-gradient-to-br from-white via-white to-indigo-50/25 shadow-[0_4px_22px_rgba(0,0,0,0.04)] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(0,0,0,0.06)]",
    work:
      "rounded-2xl border border-slate-200/65 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.045)]",
    radial: "radial-gradient(circle at 14% 12%, rgba(99,102,241,0.07), transparent 58%)",
    titleDark: "text-indigo-300/90",
    titleLight: "text-indigo-800",
    mutedDark: "text-slate-500/85",
    mutedLight: "text-slate-400",
  },
  parking: {
    dark:
      "rounded-2xl border border-slate-600/45 bg-gradient-to-br from-violet-950/32 via-slate-900/40 to-slate-950/55 shadow-[0_10px_28px_rgba(0,0,0,0.22)]",
    premium:
      "rounded-2xl border border-black/[0.04] bg-gradient-to-br from-white via-white to-violet-50/25 shadow-[0_4px_22px_rgba(0,0,0,0.04)] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(0,0,0,0.06)]",
    work:
      "rounded-2xl border border-slate-200/65 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.045)]",
    radial: "radial-gradient(circle at 14% 12%, rgba(139,92,246,0.07), transparent 58%)",
    titleDark: "text-violet-300/90",
    titleLight: "text-violet-800",
    mutedDark: "text-slate-500/85",
    mutedLight: "text-slate-400",
  },
  storage: {
    dark:
      "rounded-2xl border border-slate-600/45 bg-gradient-to-br from-slate-800/40 via-slate-900/40 to-slate-950/55 shadow-[0_10px_28px_rgba(0,0,0,0.22)]",
    premium:
      "rounded-2xl border border-black/[0.04] bg-gradient-to-br from-white via-white to-cyan-50/20 shadow-[0_4px_22px_rgba(0,0,0,0.04)] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(0,0,0,0.06)]",
    work:
      "rounded-2xl border border-slate-200/65 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.045)]",
    radial: "radial-gradient(circle at 14% 12%, rgba(6,182,212,0.06), transparent 58%)",
    titleDark: "text-slate-300",
    titleLight: "text-cyan-900",
    mutedDark: "text-slate-500/80",
    mutedLight: "text-slate-400",
  },
  commercial: {
    dark:
      "rounded-2xl border border-slate-600/45 bg-gradient-to-br from-orange-950/30 via-slate-900/40 to-slate-950/55 shadow-[0_10px_28px_rgba(0,0,0,0.22)]",
    premium:
      "rounded-2xl border border-black/[0.04] bg-gradient-to-br from-white via-white to-amber-50/22 shadow-[0_4px_22px_rgba(0,0,0,0.04)] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(0,0,0,0.06)]",
    work:
      "rounded-2xl border border-slate-200/65 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.045)]",
    radial: "radial-gradient(circle at 14% 12%, rgba(249,115,22,0.07), transparent 58%)",
    titleDark: "text-orange-300/90",
    titleLight: "text-orange-900",
    mutedDark: "text-slate-500/85",
    mutedLight: "text-slate-400",
  },
};

function trendPillClass(trend: string, presDark: boolean): string {
  if (trend === "Нет сделок" || trend === "Недостаточно периодов") {
    return presDark
      ? "border border-slate-500/35 bg-slate-900/45 text-slate-400"
      : "border border-slate-200/90 bg-slate-50/90 text-slate-600";
  }
  if (trend.includes("Снижение")) {
    return presDark
      ? "border border-rose-500/45 bg-rose-950/35 text-rose-200"
      : "border border-rose-100 bg-rose-50/90 text-rose-800";
  }
  if (trend.includes("Рост")) {
    return presDark
      ? "border border-emerald-500/45 bg-emerald-950/30 text-emerald-200"
      : "border border-emerald-100 bg-emerald-50/90 text-emerald-800";
  }
  return presDark
    ? "border border-slate-500/40 bg-slate-900/40 text-slate-300"
    : "border border-slate-200/90 bg-slate-50/90 text-slate-700";
}

/** Вторичные мини-графики: лёгкая сетка, спокойные оси. */
function chartWellClass(presDark: boolean, presentation: boolean): string {
  if (presDark) return "rounded-xl border border-white/[0.08] bg-black/12";
  if (presentation) return "rounded-xl border border-slate-200/50 bg-white";
  return "rounded-xl border border-slate-200/55 bg-white";
}

function SegmentMonthBarChart({
  title,
  rows,
  dataKey,
  fill,
  peakFill,
  peakIndex,
  ringLastBar,
  presDark,
  presentation,
  infographicMode,
  yTickFmt,
}: {
  title: string;
  rows: DealsSegmentCardModel["months"];
  dataKey: "deals" | "revenueRub";
  fill: string;
  peakFill: string;
  peakIndex: number | null;
  ringLastBar: boolean;
  presDark: boolean;
  presentation: boolean;
  /** Презентация: меньше визуального шума, чуть больше воздуха. */
  infographicMode?: boolean;
  yTickFmt: (n: number) => string;
}) {
  const data = useMemo(
    () =>
      rows.map((r) => ({
        labelShort: r.labelShort,
        labelReadable: r.labelReadable,
        deals: r.deals,
        revenueRub: r.revenueRub,
      })),
    [rows],
  );
  const n = data.length;
  const yMax = useMemo(() => {
    const m = Math.max(0, ...data.map((d) => d[dataKey]));
    return m > 0 ? m * 1.1 : 1;
  }, [data, dataKey]);
  const gridStroke = presDark ? "rgba(148,163,184,0.06)" : "rgba(148,163,184,0.11)";
  const axisColor = presDark ? "#94a3b8" : "#a1a7b3";
  const categoryGap = infographicMode ? (n <= 6 ? "18%" : n <= 10 ? "22%" : "28%") : n <= 6 ? "16%" : n <= 10 ? "20%" : "26%";
  const lastI = n - 1;
  const renderMonthTick = useMemo(
    () =>
      createMarketingDealsStyleMonthTickRenderer({
        presDark,
        tickCount: n,
        isTickMuted: (i) => {
          const row = rows[i];
          if (!row) return true;
          const v = dataKey === "deals" ? row.deals : row.revenueRub;
          return !(Number.isFinite(v) && v > 0);
        },
      }),
    [presDark, n, rows, dataKey],
  );

  return (
    <div className={`${chartWellClass(presDark, presentation)} ${infographicMode ? "px-2.5 pb-2 pt-2 sm:px-3 sm:pb-2 sm:pt-2" : "px-2 pb-1.5 pt-2 sm:px-2.5 sm:pb-2 sm:pt-2"}`}>
      <div
        className={`mb-1.5 pl-10 pr-1 sm:pl-[2.6rem] text-[10px] font-medium tracking-normal ${presDark ? "text-slate-500" : "text-slate-400"}`}
      >
        {title}
      </div>
      <div className={`w-full min-w-0 ${infographicMode ? "h-[158px] sm:h-[172px]" : "h-[148px] sm:h-[162px]"}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: infographicMode ? 10 : 8, right: 4, left: 2, bottom: 30 }}
            barCategoryGap={categoryGap}
            barGap={infographicMode ? 3 : 2}
          >
            <CartesianGrid strokeDasharray="4 10" stroke={gridStroke} vertical={false} />
            <XAxis dataKey="labelShort" tick={renderMonthTick} {...MARKETING_DEALS_STYLE_MONTH_X_AXIS} />
            <YAxis
              domain={[0, yMax]}
              tick={{ fill: axisColor, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={dataKey === "revenueRub" ? 38 : 32}
              tickCount={4}
              tickFormatter={(v) => yTickFmt(Number(v))}
            />
            <Tooltip
              cursor={{ fill: presDark ? "rgba(148,163,184,0.04)" : "rgba(100,116,139,0.06)" }}
              formatter={(value) => {
                const num = typeof value === "number" ? value : Number(value);
                return dataKey === "revenueRub" ? formatSegmentMiniRevenueChartNumber(num) : numFmt.format(Math.round(num));
              }}
              labelFormatter={(_, payload) => {
                const row = payload?.[0]?.payload as { labelReadable?: string } | undefined;
                return row?.labelReadable ?? "";
              }}
              contentStyle={
                presDark
                  ? { borderRadius: 8, fontSize: 10, borderColor: "rgba(148,163,184,0.3)", background: "#0f172a" }
                  : { borderRadius: 8, fontSize: 10 }
              }
              labelStyle={presDark ? { color: "#e2e8f0" } : { color: "#334155" }}
            />
            <Bar dataKey={dataKey} radius={[4, 4, 0, 0]} maxBarSize={infographicMode ? 32 : 28} isAnimationActive={false}>
              {data.map((_, i) => {
                const isPeak = peakIndex != null && i === peakIndex;
                const ring = ringLastBar && i === lastI;
                return (
                  <Cell
                    key={i}
                    fill={isPeak ? peakFill : fill}
                    stroke={ring ? (presDark ? "#fb7185" : "#e11d48") : undefined}
                    strokeWidth={ring ? 1.5 : 0}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SegmentAnalyticsCard({
  model,
  presDark,
  mplPremium,
  presentation,
}: {
  model: DealsSegmentCardModel;
  presDark: boolean;
  mplPremium: boolean;
  presentation: boolean;
}) {
  const skin = SEGMENT_CARD_SKIN[model.segment];
  const wrap = presDark ? skin.dark : mplPremium && presentation ? skin.premium : skin.work;
  const mutedCls = presDark ? skin.mutedDark : skin.mutedLight;
  const statValueCls = presDark ? "text-slate-50" : "text-slate-950";
  const bodyCls = presDark ? "text-slate-300/95" : "text-slate-600";
  const sectionTitleCls = presDark ? "text-slate-200" : "text-slate-500";
  const lastPt = model.months.length > 0 ? model.months[model.months.length - 1]! : null;
  const ringLast =
    model.declineNote != null &&
    model.months.length >= 2 &&
    lastPt != null &&
    !(lastPt.reportingTail && lastPt.deals === 0 && lastPt.revenueRub === 0);
  const cardPad = presentation ? "p-6 sm:p-7" : "p-5 sm:p-6";
  const stackGap = presentation ? "gap-6" : "gap-5";

  return (
    <div className={`relative overflow-hidden ${cardPad} ${wrap}`}>
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 ${presDark ? "opacity-80" : "opacity-[0.28]"}`}
        style={{ background: skin.radial }}
      />

      <div className={`relative flex flex-col ${stackGap}`}>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <MarketingDealSegmentHeader
            segment={model.segment}
            iconWrapTone={
              presDark ? "dark" : mplPremium && presentation ? "premium" : presentation ? "presentation" : "work"
            }
            labelTone={presDark ? "dark" : "work"}
            className="min-w-0 flex-1 gap-3 pr-2 pt-0.5"
          />
          {model.trendLabel !== "Без существенных изменений" ? (
            <span
              className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium ${trendPillClass(model.trendLabel, presDark)}`}
            >
              {model.trendLabel}
            </span>
          ) : null}
        </div>

        <div
          className={`grid grid-cols-2 gap-x-2.5 gap-y-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(10.25rem,1.4fr)] sm:gap-x-3 sm:gap-y-4 ${presentation ? "pt-1" : "pt-0.5"}`}
        >
          <div className="min-w-0">
            <div className={`text-[10px] font-medium tracking-normal ${mutedCls}`}>Сделок</div>
            <div className={`mt-1.5 text-lg font-bold tabular-nums sm:text-xl ${statValueCls}`}>
              {numFmt.format(model.totalDeals)}
            </div>
          </div>
          <div className="min-w-0">
            <div className={`text-[10px] font-medium tracking-normal ${mutedCls}`}>Выручка</div>
            <div className={`mt-1.5 text-base font-bold tabular-nums leading-snug sm:text-lg ${statValueCls}`}>
              {compactRub(model.totalRevenueRub)}
            </div>
          </div>
          <div className="min-w-0">
            <div className={`text-[10px] font-medium tracking-normal ${mutedCls}`}>Средний чек</div>
            <div className={`mt-1.5 text-base font-bold tabular-nums leading-snug sm:text-lg ${statValueCls}`}>
              {model.totalDeals > 0 ? compactRub(model.avgCheckRub) : "—"}
            </div>
          </div>
          <div className="min-w-0 sm:min-w-[10rem]">
            <div className={`text-[10px] font-medium leading-snug tracking-normal ${mutedCls}`}>Средняя стоимость м²</div>
            <div
              className={`mt-1.5 text-base font-bold tabular-nums leading-snug sm:text-lg whitespace-nowrap ${statValueCls}`}
            >
              {model.avgPricePerM2Rub != null ? formatAvgPricePerM2Rub(model.avgPricePerM2Rub) : "—"}
            </div>
          </div>
        </div>

        {presentation ? (
          model.presentationInsightLine ? (
            <p
              className={`text-left text-[11px] font-medium leading-relaxed sm:text-xs ${presDark ? "text-slate-400" : "text-slate-600"}`}
            >
              {model.presentationInsightLine}
            </p>
          ) : null
        ) : (
          <div
            className={`space-y-3 rounded-xl border px-4 py-3 text-[11px] leading-relaxed sm:text-[12px] ${presDark ? "border-white/10 bg-black/10" : "border-slate-200/70 bg-slate-50/40"}`}
          >
            <div>
              <div className={`mb-1 text-[10px] font-semibold tracking-normal ${sectionTitleCls}`}>Что происходит</div>
              <p className={bodyCls}>{model.analyticsWhat}</p>
            </div>
            <div className={`border-t pt-3 ${presDark ? "border-white/10" : "border-slate-200/60"}`}>
              <div className={`mb-1 text-[10px] font-semibold tracking-normal ${sectionTitleCls}`}>Почему важно</div>
              <p className={bodyCls}>{model.analyticsWhy}</p>
            </div>
          </div>
        )}

        <div className={`grid grid-cols-1 gap-3 md:grid-cols-2 ${presentation ? "md:gap-4" : "md:gap-3"}`}>
          <SegmentMonthBarChart
            title="По месяцам — шт."
            rows={model.months}
            dataKey="deals"
            fill={model.accentHex}
            peakFill={model.peakAccentHex}
            peakIndex={model.peakDealsMonthIndex}
            ringLastBar={ringLast}
            presDark={presDark}
            presentation={presentation}
            infographicMode={presentation}
            yTickFmt={(v) => numFmt.format(Math.round(v))}
          />
          <SegmentMonthBarChart
            title="По месяцам — ₽"
            rows={model.months}
            dataKey="revenueRub"
            fill={model.accentHex}
            peakFill={model.peakAccentHex}
            peakIndex={model.peakRevenueMonthIndex}
            ringLastBar={ringLast}
            presDark={presDark}
            presentation={presentation}
            infographicMode={presentation}
            yTickFmt={(v) => formatSegmentMiniRevenueChartNumber(v)}
          />
        </div>
      </div>
    </div>
  );
}

type Props = {
  dealsRows: NormalizedDealRow[];
  presentation: boolean;
};

/** Карточки сегментов: единая шкала времени от первой сделки до последней активности. */
export function SalesDealsSegmentMonthStackCharts({ dealsRows, presentation }: Props) {
  const mplLight = useMarketingPresentationLight();
  const presDark = useMarketingPresVisual(presentation) === "presDark";

  const bundle = useMemo(() => buildDealsSegmentAnalyticsBundle(dealsRows), [dealsRows]);
  const hasMonths = bundle.timelineMonthKeys.length > 0;

  const shellPad = presentation ? "p-6 sm:p-7" : "p-5 sm:p-6";
  const shellClass =
    presDark
      ? `mb-8 overflow-visible rounded-2xl border border-slate-700/55 bg-[#1e293b] shadow-[0_8px_28px_rgba(0,0,0,0.2)] ${shellPad}`
      : presentation && mplLight
        ? `mb-8 overflow-visible ${shellPad} ${MPL_PREMIUM_CHART_SHELL}`
        : presentation
          ? `mb-8 overflow-visible rounded-2xl border border-mpl-border bg-mpl-chart shadow-[0_4px_22px_rgba(15,23,42,0.05)] ${shellPad}`
          : `mb-8 overflow-visible rounded-2xl border border-slate-200/70 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.04)] ${shellPad}`;

  const titleCls = presDark ? "text-slate-100" : presentation ? "text-mpl-text" : "text-slate-950";
  const subCls = presDark ? "text-slate-500" : presentation ? "text-mpl-muted" : "text-slate-500";

  if (!hasMonths) {
    return (
      <div className={shellClass}>
        <h3 className={`text-sm font-semibold tracking-tight ${titleCls}`}>Сделки</h3>
        <p className={`mt-0.5 text-[11px] ${subCls}`}>Динамика сделок и выручки по сегментам недвижимости.</p>
        <p className={`mt-4 text-xs ${subCls}`}>
          Нет сделок с валидным месяцем в текущем срезе (загрузите выгрузку или смените фильтр объекта).
        </p>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <div className={presentation ? "mb-6" : "mb-5"}>
        <h3 className={`text-sm font-semibold tracking-tight ${titleCls}`}>Сделки</h3>
        {!presentation ? (
          <p className={`mt-1 text-[11px] leading-relaxed ${subCls}`}>
            Динамика сделок и выручки по сегментам недвижимости.
          </p>
        ) : null}
      </div>

      <div className={`grid grid-cols-1 ${presentation ? "gap-6 lg:gap-7" : "gap-5"} lg:grid-cols-2`}>
        {bundle.segments.map((model) => (
          <SegmentAnalyticsCard
            key={model.segment}
            model={model}
            presDark={presDark}
            mplPremium={mplLight}
            presentation={presentation}
          />
        ))}
      </div>

      {!presentation ? (
        <div className={`mt-3 text-[10px] leading-snug ${subCls}`}>
          Подсветка столбца — пик по метрике; контур последнего месяца — при признаках спада к пику. Без «Прочее». Данные из выгрузки
          сделок. Подробные пояснения — в рабочем режиме до перехода в презентацию.
        </div>
      ) : null}
    </div>
  );
}

export {
  DEALS_SEGMENT_ACCENT_HEX as DEALS_SEGMENT_STACK_COLORS,
  type DealsAnalyticsSegmentKey,
} from "@/lib/buildDealsSegmentMonthAnalytics";
