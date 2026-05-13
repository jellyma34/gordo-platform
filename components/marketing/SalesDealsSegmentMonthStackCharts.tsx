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
import { compactRub, formatSegmentMiniRevenueChartNumber, numFmt } from "@/lib/salesPlanChartFormat";
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
import type { XAxisTickContentProps } from "recharts";

function fmtChartSpan(ym: string): string {
  const [y, m] = ym.split("-");
  if (!y || !m) return ym;
  return `${m}.${y.slice(2)}`;
}

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
      "rounded-2xl border border-slate-600/50 bg-gradient-to-br from-indigo-900/42 via-slate-900/38 to-slate-900/60 shadow-[0_14px_36px_rgba(99,102,241,0.26)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_36px_rgba(99,102,241,0.15)]",
    premium:
      "rounded-[18px] border border-black/[0.03] bg-gradient-to-br from-white/90 via-white to-indigo-50/45 shadow-[0_10px_25px_rgba(0,0,0,0.05)] hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(0,0,0,0.07)] transition-[transform,box-shadow] duration-200 ease-out",
    work:
      "rounded-xl border border-slate-200/90 bg-gradient-to-br from-indigo-100/85 via-white to-indigo-50/70 shadow-[0_12px_30px_rgba(99,102,241,0.18)] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_0_0_26px_rgba(99,102,241,0.10)]",
    radial: "radial-gradient(circle at 18% 15%, rgba(129,140,248,0.28), transparent 52%)",
    titleDark: "text-indigo-300/90",
    titleLight: "text-indigo-800",
    mutedDark: "text-slate-500/85",
    mutedLight: "text-slate-500",
  },
  parking: {
    dark:
      "rounded-2xl border border-slate-600/50 bg-gradient-to-br from-violet-900/40 via-slate-900/38 to-slate-900/60 shadow-[0_14px_36px_rgba(139,92,246,0.24)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_36px_rgba(167,139,250,0.14)]",
    premium:
      "rounded-[18px] border border-black/[0.03] bg-gradient-to-br from-white/90 via-white to-violet-50/45 shadow-[0_10px_25px_rgba(0,0,0,0.05)] hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(0,0,0,0.07)] transition-[transform,box-shadow] duration-200 ease-out",
    work:
      "rounded-xl border border-slate-200/90 bg-gradient-to-br from-violet-100/85 via-white to-violet-50/70 shadow-[0_12px_30px_rgba(139,92,246,0.16)] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_0_0_26px_rgba(167,139,250,0.09)]",
    radial: "radial-gradient(circle at 18% 15%, rgba(167,139,250,0.26), transparent 52%)",
    titleDark: "text-violet-300/90",
    titleLight: "text-violet-800",
    mutedDark: "text-slate-500/85",
    mutedLight: "text-slate-500",
  },
  storage: {
    dark:
      "rounded-2xl border border-slate-600/50 bg-gradient-to-br from-slate-800/48 via-slate-900/38 to-slate-900/60 shadow-[0_14px_36px_rgba(34,211,238,0.16)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_36px_rgba(103,232,249,0.08)]",
    premium:
      "rounded-[18px] border border-black/[0.03] bg-gradient-to-br from-white/92 via-white to-cyan-50/35 shadow-[0_10px_25px_rgba(0,0,0,0.05)] hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(0,0,0,0.07)] transition-[transform,box-shadow] duration-200 ease-out",
    work:
      "rounded-xl border border-slate-200/90 bg-gradient-to-br from-slate-100/90 via-white to-cyan-50/65 shadow-[0_12px_30px_rgba(14,116,144,0.12)] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_0_0_26px_rgba(34,211,238,0.07)]",
    radial: "radial-gradient(circle at 18% 15%, rgba(103,232,249,0.14), transparent 52%)",
    titleDark: "text-slate-300",
    titleLight: "text-cyan-900",
    mutedDark: "text-slate-500/80",
    mutedLight: "text-slate-500",
  },
  commercial: {
    dark:
      "rounded-2xl border border-slate-600/50 bg-gradient-to-br from-orange-900/40 via-slate-900/38 to-slate-900/60 shadow-[0_14px_36px_rgba(249,115,22,0.24)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_36px_rgba(251,146,60,0.12)]",
    premium:
      "rounded-[18px] border border-black/[0.03] bg-gradient-to-br from-white/90 via-white to-amber-50/40 shadow-[0_10px_25px_rgba(0,0,0,0.05)] hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(0,0,0,0.07)] transition-[transform,box-shadow] duration-200 ease-out",
    work:
      "rounded-xl border border-slate-200/85 bg-gradient-to-br from-orange-100/88 via-white to-amber-50/70 shadow-[0_12px_30px_rgba(234,88,12,0.16)] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_0_0_26px_rgba(251,146,60,0.09)]",
    radial: "radial-gradient(circle at 18% 15%, rgba(251,146,60,0.26), transparent 52%)",
    titleDark: "text-orange-300/90",
    titleLight: "text-orange-900",
    mutedDark: "text-slate-500/85",
    mutedLight: "text-slate-500",
  },
};

function trendPillClass(trend: string, presDark: boolean): string {
  if (trend === "Нет сделок" || trend === "Недостаточно периодов") {
    return presDark
      ? "border border-slate-500/35 bg-slate-900/45 text-slate-400"
      : "border border-slate-200 bg-slate-50 text-slate-600";
  }
  if (trend.includes("Снижение")) {
    return presDark
      ? "border border-rose-500/45 bg-rose-950/35 text-rose-200"
      : "border border-rose-200 bg-rose-50 text-rose-800";
  }
  if (trend.includes("Рост")) {
    return presDark
      ? "border border-emerald-500/45 bg-emerald-950/30 text-emerald-200"
      : "border border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  return presDark
    ? "border border-slate-500/40 bg-slate-900/40 text-slate-300"
    : "border border-slate-200 bg-slate-50 text-slate-700";
}

/** Вторичные мини-графики: меньше контраста сетки. */
function chartWellClass(presDark: boolean, presentation: boolean): string {
  if (presDark) return "rounded-lg border border-white/10 bg-black/15";
  if (presentation) return "rounded-lg border border-black/[0.05] bg-white/40";
  return "rounded-lg border border-slate-200/70 bg-white/70";
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
  const gridStroke = presDark ? "rgba(148,163,184,0.05)" : "rgba(148,163,184,0.18)";
  const axisColor = presDark ? "#94a3b8" : "#64748b";
  const categoryGap = infographicMode ? (n <= 6 ? "22%" : n <= 10 ? "26%" : "32%") : n <= 6 ? "20%" : n <= 10 ? "24%" : "30%";
  const lastI = n - 1;
  const renderMonthTick = (props: XAxisTickContentProps) => {
    const { x, y, payload, index, textAnchor, angle } = props;
    const row = rows[index];
    const muted = row?.reportingTail === true;
    const fill = muted
      ? presDark
        ? "rgba(148,163,184,0.4)"
        : "rgba(100,116,139,0.48)"
      : axisColor;
    const fs = n > 14 ? 7 : 8;
    const v = payload?.value;
    const label = v == null ? "" : String(v);
    const xf = typeof x === "number" ? x : Number(x);
    const yf = typeof y === "number" ? y : Number(y);
    return (
      <text
        x={xf}
        y={yf}
        fill={fill}
        fontSize={fs}
        textAnchor={textAnchor}
        transform={angle ? `rotate(${angle}, ${xf}, ${yf})` : undefined}
      >
        {label}
      </text>
    );
  };

  return (
    <div className={`${chartWellClass(presDark, presentation)} ${infographicMode ? "p-2 sm:p-2.5" : "p-1.5 sm:p-2"}`}>
      <div
        className={`mb-0.5 px-0.5 ${infographicMode ? "text-[9px]" : "text-[8px]"} font-bold uppercase tracking-wide ${presDark ? "text-slate-500" : "text-slate-500"}`}
      >
        {title}
      </div>
      <div className={`w-full min-w-0 ${infographicMode ? "h-[118px] sm:h-[124px]" : "h-[100px] sm:h-[108px]"}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: infographicMode ? -4 : -8, bottom: 0 }} barCategoryGap={categoryGap} barGap={infographicMode ? 4 : 3}>
            <CartesianGrid strokeDasharray="6 8" stroke={gridStroke} vertical={false} />
            <XAxis
              dataKey="labelShort"
              tick={renderMonthTick}
              axisLine={false}
              tickLine={false}
              interval={0}
              angle={n > 14 ? -35 : 0}
              textAnchor={n > 14 ? "end" : "middle"}
              height={n > 14 ? 38 : 16}
            />
            <YAxis
              domain={[0, yMax]}
              tick={{ fill: axisColor, fontSize: 8 }}
              axisLine={false}
              tickLine={false}
              width={dataKey === "revenueRub" ? 32 : 26}
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
            <Bar dataKey={dataKey} radius={[4, 4, 0, 0]} maxBarSize={infographicMode ? 28 : 26} isAnimationActive={false}>
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
  const statValueCls = presDark ? "text-slate-50" : "text-slate-900";
  const bodyCls = presDark ? "text-slate-300/95" : "text-slate-700";
  const sectionTitleCls = presDark ? "text-slate-200" : "text-slate-800";
  const lastPt = model.months.length > 0 ? model.months[model.months.length - 1]! : null;
  const ringLast =
    model.declineNote != null &&
    model.months.length >= 2 &&
    lastPt != null &&
    !(lastPt.reportingTail && lastPt.deals === 0 && lastPt.revenueRub === 0);
  const cardPad = presentation ? "p-5 sm:p-6" : "p-4 sm:p-5";
  const stackGap = presentation ? "gap-5" : "gap-3";

  return (
    <div className={`relative overflow-hidden ${cardPad} ${wrap}`}>
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-90" style={{ background: skin.radial }} />

      <div className={`relative flex flex-col ${stackGap}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <MarketingDealSegmentHeader
            segment={model.segment}
            iconWrapTone={
              presDark ? "dark" : mplPremium && presentation ? "premium" : presentation ? "presentation" : "work"
            }
            labelTone={presDark ? "dark" : "work"}
            className="min-w-0 flex-1 pr-2"
          />
          <span
            className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold ${trendPillClass(model.trendLabel, presDark)}`}
          >
            {model.trendLabel}
          </span>
        </div>

        <div className={`grid grid-cols-3 gap-3 sm:gap-4 ${presentation ? "pt-1" : ""}`}>
          <div>
            <div className={`text-[9px] font-semibold uppercase tracking-wide ${mutedCls}`}>Сделок</div>
            <div className={`mt-1 text-base font-black tabular-nums sm:text-lg ${statValueCls}`}>
              {numFmt.format(model.totalDeals)}
            </div>
          </div>
          <div>
            <div className={`text-[9px] font-semibold uppercase tracking-wide ${mutedCls}`}>Выручка</div>
            <div className={`mt-1 text-sm font-black tabular-nums leading-tight sm:text-base ${statValueCls}`}>
              {compactRub(model.totalRevenueRub)}
            </div>
          </div>
          <div>
            <div className={`text-[9px] font-semibold uppercase tracking-wide ${mutedCls}`}>Средний чек</div>
            <div className={`mt-1 text-sm font-black tabular-nums leading-tight sm:text-base ${statValueCls}`}>
              {model.totalDeals > 0 ? compactRub(model.avgCheckRub) : "—"}
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
            className={`space-y-2.5 rounded-xl border px-3 py-2.5 text-[11px] leading-snug sm:text-[12px] ${presDark ? "border-white/10 bg-black/10" : "border-slate-200/80 bg-white/45"}`}
          >
            <div>
              <div className={`mb-1 text-[9px] font-bold uppercase tracking-wider ${sectionTitleCls}`}>Что происходит</div>
              <p className={bodyCls}>{model.analyticsWhat}</p>
            </div>
            <div className={`border-t pt-2 ${presDark ? "border-white/10" : "border-slate-200/70"}`}>
              <div className={`mb-1 text-[9px] font-bold uppercase tracking-wider ${sectionTitleCls}`}>Почему важно</div>
              <p className={bodyCls}>{model.analyticsWhy}</p>
            </div>
          </div>
        )}

        <div className={`grid grid-cols-1 gap-3 md:grid-cols-2 ${presentation ? "md:gap-4" : "md:gap-2.5"}`}>
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

  const shellPad = presentation ? "p-5 sm:p-6" : "p-4 sm:p-5";
  const shellClass =
    presDark
      ? `mb-7 overflow-visible rounded-2xl border border-slate-700/60 bg-[#1e293b] shadow-sm ${shellPad}`
      : presentation && mplLight
        ? `mb-7 overflow-visible ${shellPad} ${MPL_PREMIUM_CHART_SHELL}`
        : presentation
          ? `mb-7 overflow-visible rounded-2xl border border-mpl-border bg-mpl-chart shadow-sm ${shellPad}`
          : `mb-7 overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm ${shellPad}`;

  const titleCls = presDark ? "text-slate-100" : presentation ? "text-mpl-text" : "text-slate-900";
  const subCls = presDark ? "text-slate-500" : presentation ? "text-mpl-muted" : "text-slate-600";

  const firstM = bundle.timelineMonthKeys[0];
  const lastM = bundle.timelineMonthKeys[bundle.timelineMonthKeys.length - 1];

  if (!hasMonths) {
    return (
      <div className={shellClass}>
        <h3 className={`text-sm font-semibold ${titleCls}`}>Сделки</h3>
        <p className={`mt-0.5 text-[11px] ${subCls}`}>Динамика сделок и выручки по сегментам недвижимости.</p>
        <p className={`mt-4 text-xs ${subCls}`}>
          Нет сделок с валидным месяцем в текущем срезе (загрузите выгрузку или смените фильтр объекта).
        </p>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <div className={presentation ? "mb-5" : "mb-4"}>
        <h3 className={`text-sm font-semibold ${titleCls}`}>Сделки</h3>
        {presentation ? (
          <p className={`mt-1 text-[10px] leading-relaxed ${subCls}`}>
            Единая ось: {firstM ? fmtChartSpan(firstM) : ""}–{lastM ? fmtChartSpan(lastM) : ""}
          </p>
        ) : (
          <p className={`mt-0.5 text-[11px] leading-snug ${subCls}`}>
            Динамика сделок и выручки по сегментам недвижимости. Единая ось: с {firstM ? fmtChartSpan(firstM) : ""} по {lastM ? fmtChartSpan(lastM) : ""}{" "}
            (с первого месяца с реальными сделками в срезе до последнего месяца с активностью; пустые месяцы до старта не показываются).
          </p>
        )}
      </div>

      <div className={`grid grid-cols-1 ${presentation ? "gap-5 lg:gap-6" : "gap-4"} lg:grid-cols-2`}>
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
