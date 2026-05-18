"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import { filterByObject, marketingMockData } from "@/lib/marketingMockData";
import { numFmt, rubFmt } from "@/lib/salesPlanChartFormat";
import {
  buildDealsDynamicsSeries,
  buildStackedShareChartRows,
  buildTypeBuckets,
  dealsDeltaTone,
  deltaToneClasses,
  enrichDealsDynamicsRow,
  type DealsDynamicsEnrichedRow,
  type TypeBucketKey,
} from "@/lib/marketingDealsDynamics";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "@/components/charting/rechartsClient";

type Props = {
  presentation: boolean;
  period: MarketingPeriodGranularity;
  objectId: string;
};

type DrillTab = "types" | "objects" | "managers" | "sources";

/**
 * 100% стек «Доли типов квартир»: фиксированные цвета, порядок серий — студии → 1к → 2к → 3к (снизу вверх).
 */
const STRUCT_HEX: Record<TypeBucketKey, string> = {
  studio: "#94A3B8",
  k1: "#7DD3FC",
  k2: "#2563EB",
  k3: "#8B5CF6",
};

const STRUCT_STACK_SEGMENT_STROKE = "rgba(15,23,42,0.42)";

/** Подсветка периода: без tooltip — только лёгкое затемнение чужих столбцов/сегментов. */
const CHART_DIM_OPACITY = 0.38;

function chartFocusOpacity(periodKey: string, selectedKey: string | null, hoveredKey: string | null): number {
  const focus = hoveredKey ?? selectedKey;
  if (!focus) return 1;
  return periodKey === focus ? 1 : CHART_DIM_OPACITY;
}

const TRAFFIC_GREEN = "#22C55E";
const TRAFFIC_YELLOW = "#F59E0B";
const TRAFFIC_RED = "#EF4444";
const TRAFFIC_NEUTRAL = "#94A3B8";
/** Базовая заливка столбцов (динамика): светофор — в обводке (stroke). */
const BAR_FILL_BASE = "#4FD1FF";
/** Толщина «светофора» по периметру столбца (сделки / выручка). */
const BAR_STROKE_WIDTH = 2;
/** Линия числа сделок на графике «Выручка + сделки» (не смешивать со столбцами денег). */
const DEALS_IN_REVENUE_CHART_LINE = "#A78BFA";
const AVG_CHECK_LINE_NEUTRAL = "#94A3B8";
/** Точки линии «Средний чек»: мягкие, по Δ к пред. периоду. */
const AVG_DOT_SOFT_GREEN = "#6EE7A0";
const AVG_DOT_SOFT_RED = "#FCA5A5";

function trafficState(delta: number | null, current: number | null): "growth" | "stable" | "decline" | "na" {
  if (delta == null || current == null) return "na";
  const prev = current - delta;
  const base = Math.abs(prev) > 1 ? Math.abs(prev) : Math.max(Math.abs(current), 1);
  const pct = (Math.abs(delta) / base) * 100;
  if (pct < 5) return "stable";
  if (delta > 0) return "growth";
  return "decline";
}

function trafficColor(state: ReturnType<typeof trafficState>): string {
  if (state === "growth") return TRAFFIC_GREEN;
  if (state === "stable") return TRAFFIC_YELLOW;
  if (state === "decline") return TRAFFIC_RED;
  return TRAFFIC_NEUTRAL;
}

function trafficLabel(state: ReturnType<typeof trafficState>): string {
  if (state === "growth") return "рост";
  if (state === "stable") return "стабильно";
  if (state === "decline") return "снижение";
  return "нет данных";
}

/** Подпись статуса только для блока «Средний чек» (управленческий сигнал). */
function avgCheckManagementLabel(state: ReturnType<typeof trafficState>): string {
  if (state === "growth") return "рост";
  if (state === "stable") return "стагнация";
  if (state === "decline") return "снижение";
  return "нет данных";
}

/** Цвет сигнала для среднего чека: без «жёлтого светофора» на плато. */
function avgCheckSignalTextColor(state: ReturnType<typeof trafficState>): string {
  if (state === "growth") return TRAFFIC_GREEN;
  if (state === "decline") return TRAFFIC_RED;
  if (state === "stable") return "#94a3b8";
  return "#94a3b8";
}

function dealsTrafficStroke(row: DealsDynamicsEnrichedRow): string {
  return trafficColor(trafficState(row.deltaDeals, row.deals));
}

function revenueTrafficStroke(row: DealsDynamicsEnrichedRow): string {
  return trafficColor(trafficState(row.deltaRevenue, row.revenue));
}

function structSegmentFill(segment: TypeBucketKey): string {
  return STRUCT_HEX[segment];
}

/** Относительное изменение среднего чека к пред. периоду, % (та же база, что и trafficState). */
function avgCheckDeltaPct(row: DealsDynamicsEnrichedRow): number | null {
  const d = row.deltaAvgCheck;
  const cur = row.avgCheck;
  if (d == null || cur == null) return null;
  const prev = cur - d;
  const base = Math.abs(prev) > 1 ? Math.abs(prev) : Math.max(Math.abs(cur), 1);
  return (d / base) * 100;
}

function avgCheckDotFill(row: DealsDynamicsEnrichedRow): string {
  const st = trafficState(row.deltaAvgCheck, row.avgCheck ?? null);
  if (st === "growth") return AVG_DOT_SOFT_GREEN;
  if (st === "decline") return AVG_DOT_SOFT_RED;
  return TRAFFIC_NEUTRAL;
}

/** По модулю вклада в Δ выручки (volPart vs mixPart) — только карточка по клику. */
function revenueContributionDominanceHint(vol: number, mix: number): string {
  const av = Math.abs(vol);
  const am = Math.abs(mix);
  if (av > am) return "Основное влияние — сделки";
  if (am > av) return "Основное влияние — средний чек";
  return "Вклад сделок и среднего чека близок по силе";
}

function formatDelta(n: number | null, suffix = ""): string {
  if (n == null) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${numFmt.format(Math.abs(Math.round(n)))}${suffix}`;
}

/** Единая карточка аналитики по выбранному периоду (по клику). */
function DealsAnalyticsCard({
  row,
  onDismiss,
}: {
  row: DealsDynamicsEnrichedRow;
  onDismiss?: () => void;
}) {
  const dDeal = deltaToneClasses(dealsDeltaTone(row.deltaDeals), true);
  const dRev = deltaToneClasses(dealsDeltaTone(row.deltaRevenue), true);
  const dAvg = deltaToneClasses(dealsDeltaTone(row.deltaAvgCheck), true);
  const avgStr = row.avgCheck != null ? rubFmt.format(Math.round(row.avgCheck)) : "—";
  const sumParts = row.volPart != null && row.mixPart != null ? row.volPart + row.mixPart : null;
  const approxDeltaRev = row.deltaRevenue;
  const structWarn =
    row.typeStructure &&
    (!row.typeStructure.matchesOfficialDeals || !row.typeStructure.matchesOfficialRevenue);

  return (
    <div
      data-deals-period-card
      className="rounded-xl border border-cyan-500/25 bg-slate-900/80 p-3 shadow-[0_0_24px_-8px_rgba(34,211,238,0.2)] ring-1 ring-cyan-400/15"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-600/40 pb-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-cyan-200/80">Выбранный период</div>
          <div className="text-sm font-bold text-slate-100">{row.label}</div>
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md border border-slate-600/60 px-2 py-0.5 text-[10px] font-medium text-slate-400 hover:border-slate-500 hover:text-slate-200"
          >
            Снять выбор
          </button>
        ) : null}
      </div>

      <div className="mt-3 grid gap-3 text-[11px] tabular-nums sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Показатели</div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-400">Сделки</span>
            <span className="text-slate-100">{numFmt.format(row.deals)} шт</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-400">Выручка</span>
            <span className="text-slate-100">{rubFmt.format(row.revenue)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-400">Средний чек</span>
            <span className="text-slate-100">{avgStr}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">К пред. периоду</div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-400">Δ сделок</span>
            <span className={dDeal.text}>{formatDelta(row.deltaDeals, " шт")}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-400">Δ выручки</span>
            <span className={dRev.text}>
              {row.deltaRevenue == null
                ? "—"
                : `${row.deltaRevenue > 0 ? "+" : row.deltaRevenue < 0 ? "−" : ""}${rubFmt.format(Math.abs(row.deltaRevenue))}`}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-400">Δ среднего чека</span>
            <span className={dAvg.text}>
              {row.deltaAvgCheck == null
                ? "—"
                : `${row.deltaAvgCheck > 0 ? "+" : row.deltaAvgCheck < 0 ? "−" : ""}${rubFmt.format(Math.abs(Math.round(row.deltaAvgCheck)))}`}
            </span>
          </div>
        </div>

        <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Разложение Δ выручки</div>
          {row.volPart != null && row.mixPart != null && approxDeltaRev != null ? (
            <>
              <div className="flex justify-between gap-3">
                <span className="text-slate-400">Эффект объёма</span>
                <span className={deltaToneClasses(dealsDeltaTone(row.volPart), true).text}>
                  {row.volPart >= 0 ? "+" : "−"}
                  {rubFmt.format(Math.abs(Math.round(row.volPart)))}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-400">Эффект чека</span>
                <span className={deltaToneClasses(dealsDeltaTone(row.mixPart), true).text}>
                  {row.mixPart >= 0 ? "+" : "−"}
                  {rubFmt.format(Math.abs(Math.round(row.mixPart)))}
                </span>
              </div>
              <div className="text-[10px] text-slate-500">
                Σ эффектов:{" "}
                {sumParts != null ? `${sumParts >= 0 ? "+" : "−"}${rubFmt.format(Math.abs(Math.round(sumParts)))}` : "—"} ·
                факт Δ: {approxDeltaRev >= 0 ? "+" : "−"}
                {rubFmt.format(Math.abs(approxDeltaRev))}
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-400">
                {revenueContributionDominanceHint(row.volPart, row.mixPart)}
              </p>
            </>
          ) : (
            <div className="text-slate-500">Нет предыдущего периода для модели.</div>
          )}
        </div>
      </div>

      {row.funnel ? (
        <div className="mt-3 border-t border-slate-600/40 pt-3 text-[11px]">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-cyan-200/80">Воронка</div>
          <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 tabular-nums">
            <span className="text-slate-400">
              Лиды: <span className="text-slate-200">{numFmt.format(row.funnel.leads)}</span>
            </span>
            <span className="text-slate-400">
              Конверсия в сделку:{" "}
              <span className="text-slate-200">{numFmt.format(Math.round(row.funnel.conversionPct * 10) / 10)}%</span>
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-3 border-t border-slate-600/40 pt-3 text-[10px] text-slate-500">Воронка: нет данных лидов за период.</div>
      )}

      {row.typeStructure ? (
        <div className="mt-3 border-t border-slate-600/40 pt-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-200/85">Структура по типам</div>
          {structWarn ? (
            <div className="mt-1 rounded bg-amber-500/15 px-2 py-1 text-[10px] text-amber-200">
              Σ по типам не совпадает с агрегатом — проверьте срез.
            </div>
          ) : null}
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-[10px]">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-1 pr-2 font-semibold">Тип</th>
                  <th className="pb-1 pr-2 font-semibold tabular-nums">Сделки</th>
                  <th className="pb-1 pr-2 font-semibold tabular-nums">Выручка</th>
                  <th className="pb-1 pr-2 font-semibold tabular-nums">Доля сделок</th>
                  <th className="pb-1 font-semibold tabular-nums">Доля выручки</th>
                </tr>
              </thead>
              <tbody>
                {row.typeStructure.buckets.map((b) => (
                  <tr key={b.key} className="border-t border-slate-600/30 text-slate-300">
                    <td className="py-1 pr-2 font-medium text-slate-200">{b.label}</td>
                    <td className="py-1 pr-2 tabular-nums">{numFmt.format(b.deals)} шт</td>
                    <td className="py-1 pr-2 tabular-nums">{rubFmt.format(Math.round(b.revenueRub))}</td>
                    <td className="py-1 pr-2 tabular-nums">{numFmt.format(Math.round(b.shareDealsPct))}%</td>
                    <td className="py-1 tabular-nums">{numFmt.format(Math.round(b.shareRevPct))}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="mt-3 border-t border-slate-600/40 pt-3 text-[10px] text-slate-500">Структура: нет среза по типам.</div>
      )}

      {row.narrative.length > 0 ? (
        <div className="mt-3 border-t border-slate-600/40 pt-3 text-[10px] leading-snug text-slate-400">
          <div className="font-semibold text-slate-300">Интерпретация</div>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {row.narrative.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function MarketingDealsDynamicsSection({ presentation, period, objectId }: Props) {
  const blockRef = useRef<HTMLDivElement>(null);
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string | null>(null);
  const [hoveredPeriodKey, setHoveredPeriodKey] = useState<string | null>(null);
  const [drillTab, setDrillTab] = useState<DrillTab>("types");

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (!blockRef.current?.contains(t)) {
        setSelectedPeriodKey(null);
        setHoveredPeriodKey(null);
        return;
      }
      const el = t as Element;
      if (
        el.closest?.(".recharts-wrapper") ||
        el.closest?.("[data-deals-period-card]") ||
        el.closest?.("[data-deals-drill-panel]") ||
        el.closest?.("button")
      ) {
        return;
      }
      setSelectedPeriodKey(null);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const axisColor = presentation ? "#cbd5e1" : "#64748b";
  const gridColor = presentation ? "rgba(186, 230, 253, 0.14)" : "rgba(100,116,139,0.15)";

  const chartData = useMemo(() => {
    const factSrc = period === "month" ? marketingMockData.salesFact.month : marketingMockData.salesFact.quarter;
    const revSrc = period === "month" ? marketingMockData.salesRevenue.month : marketingMockData.salesRevenue.quarter;
    const factRows = filterByObject(factSrc, objectId);
    const revenueRows = filterByObject(revSrc, objectId);
    return buildDealsDynamicsSeries(factRows, revenueRows);
  }, [period, objectId]);

  const enrichedChartData = useMemo(() => {
    const funnelSrc =
      period === "month" ? marketingMockData.salesFunnelMonthly.month : marketingMockData.salesFunnelMonthly.quarter;
    const leadsByKey = new Map(funnelSrc.map((r) => [r.periodKey, r.leads]));
    return chartData.map((row) =>
      enrichDealsDynamicsRow(
        row,
        marketingMockData.dealsPeriodDrilldown[row.periodKey]?.apartmentTypes,
        leadsByKey.get(row.periodKey),
      ),
    );
  }, [chartData, period]);

  const stackedShareData = useMemo(() => buildStackedShareChartRows(enrichedChartData), [enrichedChartData]);

  const selectedRow = useMemo(
    () =>
      selectedPeriodKey ? enrichedChartData.find((r) => r.periodKey === selectedPeriodKey) ?? null : null,
    [enrichedChartData, selectedPeriodKey],
  );

  const drillSlice =
    selectedPeriodKey != null ? marketingMockData.dealsPeriodDrilldown[selectedPeriodKey] ?? null : null;

  const drillRows = useMemo(() => {
    if (!drillSlice) return [];
    switch (drillTab) {
      case "types":
        return buildTypeBuckets(drillSlice.apartmentTypes).buckets.map((b) => ({
          key: b.key,
          label: b.label,
          deals: b.deals,
          revenueRub: b.revenueRub,
        }));
      case "objects":
        return drillSlice.objects;
      case "managers":
        return drillSlice.managers;
      case "sources":
        return drillSlice.sources;
      default:
        return [];
    }
  }, [drillSlice, drillTab]);

  const maxDrillDeals = useMemo(() => Math.max(1, ...drillRows.map((r) => r.deals)), [drillRows]);

  const onBarSelect = useCallback((row: DealsDynamicsEnrichedRow | undefined) => {
    if (row?.periodKey) setSelectedPeriodKey(row.periodKey);
  }, []);

  /** Заголовок «Средний чек»: статус и Δ в % за последний период (управленческий сигнал). */
  const avgCheckHeaderSubtitle = useMemo(() => {
    const last = enrichedChartData[enrichedChartData.length - 1];
    if (!last?.avgCheck) return null;
    const st = trafficState(last.deltaAvgCheck, last.avgCheck);
    if (st === "na") return null;
    const status = avgCheckManagementLabel(st);
    const pct = avgCheckDeltaPct(last);
    const d = last.deltaAvgCheck;
    let pctBracket = "";
    if (pct != null && d != null) {
      const sign = d > 0 ? "+" : d < 0 ? "−" : "";
      pctBracket = ` (${sign}${numFmt.format(Math.abs(Math.round(pct)))}%)`;
    }
    const cls =
      st === "growth" ? "text-emerald-300/90" : st === "decline" ? "text-rose-300/90" : "text-slate-400";
    return { status, pctBracket, cls };
  }, [enrichedChartData]);

  const renderAvgCheckDot = useCallback(
    (props: { cx?: number; cy?: number; index?: number }) => {
      const { cx, cy, index } = props;
      const row = typeof index === "number" ? enrichedChartData[index] : undefined;
      if (row == null || cx == null || cy == null || row.avgCheck == null) return <g />;
      const fill = avgCheckDotFill(row);
      const isLast = typeof index === "number" && index === enrichedChartData.length - 1;
      const dim = chartFocusOpacity(row.periodKey, selectedPeriodKey, hoveredPeriodKey);
      const hot = row.periodKey === hoveredPeriodKey || row.periodKey === selectedPeriodKey;
      const r = (isLast ? 4.25 : 3) * (hot ? 1.28 : 1);
      const stroke = isLast ? "rgba(248,250,252,0.55)" : "rgba(15,23,42,0.35)";
      const strokeWidth = (isLast ? 1.1 : 0.6) * (hot ? 1.15 : 1);
      return (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill={fill}
          fillOpacity={dim * (isLast ? 1 : 0.95)}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeOpacity={dim}
          style={{ cursor: "pointer" }}
          onMouseEnter={() => setHoveredPeriodKey(row.periodKey)}
          onMouseLeave={() => setHoveredPeriodKey(null)}
          onClick={(e) => {
            e.stopPropagation();
            onBarSelect(row);
          }}
        />
      );
    },
    [enrichedChartData, hoveredPeriodKey, onBarSelect, selectedPeriodKey],
  );

  if (!presentation) return null;

  const tabBtn = (id: DrillTab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setDrillTab(id)}
      className={`rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
        drillTab === id
          ? "bg-cyan-500/25 text-cyan-100 ring-1 ring-cyan-400/40"
          : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      ref={blockRef}
      className="mt-4 rounded-xl border border-slate-600/45 bg-gradient-to-br from-slate-900/75 via-slate-900/50 to-slate-950/90 p-3 sm:p-4"
    >
      <div className="mb-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">Сделки</div>
        <p className="mt-1 max-w-3xl text-[10px] leading-snug text-slate-500">
          Три графика отвечают на разные вопросы: объём сделок, связь выручки и сделок, средний чек. Подсказок при наведении нет —
          клик по столбцу или точке открывает единую карточку периода (метрики и Δ к предыдущему периоду). Наведение только слегка
          подсвечивает месяц на всех графиках. Клик по пустому месту в блоке (вне графиков и карточки), вне блока или «Снять выбор»
          сбрасывает выбор. Обводка столбцов динамики — «светофор» к голубой заливке.
        </p>
      </div>

      {selectedRow ? (
        <div className="mb-4">
          <DealsAnalyticsCard row={selectedRow} onDismiss={() => setSelectedPeriodKey(null)} />
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-dashed border-slate-600/50 bg-slate-950/30 px-3 py-4 text-center text-[11px] text-slate-500">
          Выберите период кликом на любом графике — здесь появится единая аналитика (метрики, Δ, разложение выручки, структура,
          воронка).
        </div>
      )}

      <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-3">
        {/* 1. Сделки — вторичный, тот же голубой, слабее центра */}
        <div className="order-2 rounded-xl border border-cyan-500/20 bg-slate-800/35 p-2 shadow-[0_0_20px_-6px_rgba(34,211,238,0.18)] xl:order-1">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Сделки по {period === "month" ? "месяцам" : "кварталам"}
            </span>
            <span className="text-[9px] font-medium uppercase tracking-wide text-slate-600">Контекст</span>
          </div>
          <div className="h-[210px] w-full min-w-0 xl:h-[228px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={enrichedChartData} margin={{ top: 8, right: 6, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 9 }} axisLine={{ stroke: gridColor }} tickLine={false} interval={0} angle={-18} textAnchor="end" height={48} />
                <YAxis tick={{ fill: axisColor, fontSize: 9 }} axisLine={false} width={28} tickFormatter={(v) => numFmt.format(v)} />
                <Bar
                  dataKey="deals"
                  name="Сделки"
                  fill={BAR_FILL_BASE}
                  stroke={BAR_FILL_BASE}
                  strokeWidth={BAR_STROKE_WIDTH}
                  strokeOpacity={1}
                  opacity={1}
                  fillOpacity={1}
                  radius={[4, 4, 0, 0]}
                  onClick={(_, idx) => {
                    if (typeof idx === "number" && enrichedChartData[idx]) onBarSelect(enrichedChartData[idx]);
                  }}
                >
                  {enrichedChartData.map((entry) => {
                    const dim = chartFocusOpacity(entry.periodKey, selectedPeriodKey, hoveredPeriodKey);
                    const sel = entry.periodKey === selectedPeriodKey;
                    return (
                      <Cell
                        key={entry.periodKey}
                        fill={BAR_FILL_BASE}
                        stroke={dealsTrafficStroke(entry)}
                        strokeWidth={sel ? BAR_STROKE_WIDTH + 1.4 : BAR_STROKE_WIDTH}
                        strokeOpacity={dim}
                        opacity={dim}
                        fillOpacity={1}
                        cursor="pointer"
                        onMouseEnter={() => setHoveredPeriodKey(entry.periodKey)}
                        onMouseLeave={() => setHoveredPeriodKey(null)}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2. Главный график — контраст и фокус */}
        <div className="order-1 rounded-xl border border-cyan-400/40 bg-slate-800/50 p-2 shadow-[0_0_32px_-8px_rgba(34,211,238,0.35)] ring-1 ring-cyan-400/25 xl:order-2 xl:z-10">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-cyan-100">Выручка + сделки</span>
            <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-cyan-200/90">
              Главный снимок
            </span>
          </div>
          <div className="h-[236px] w-full min-w-0 xl:h-[252px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={enrichedChartData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 9 }} axisLine={{ stroke: gridColor }} tickLine={false} interval={0} angle={-18} textAnchor="end" height={48} />
                <YAxis yAxisId="left" tick={{ fill: axisColor, fontSize: 9 }} axisLine={false} width={36} tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: axisColor, fontSize: 9 }} axisLine={false} width={28} tickFormatter={(v) => numFmt.format(v)} />
                <Legend wrapperStyle={{ fontSize: 9 }} formatter={(v) => <span style={{ color: axisColor }}>{v}</span>} />
                <Bar
                  yAxisId="left"
                  dataKey="revenue"
                  name="Выручка ₽"
                  fill={BAR_FILL_BASE}
                  stroke={BAR_FILL_BASE}
                  strokeWidth={BAR_STROKE_WIDTH}
                  strokeOpacity={1}
                  opacity={1}
                  fillOpacity={1}
                  radius={[4, 4, 0, 0]}
                  onClick={(_, idx) => {
                    if (typeof idx === "number" && enrichedChartData[idx]) onBarSelect(enrichedChartData[idx]);
                  }}
                >
                  {enrichedChartData.map((entry) => {
                    const dim = chartFocusOpacity(entry.periodKey, selectedPeriodKey, hoveredPeriodKey);
                    const sel = entry.periodKey === selectedPeriodKey;
                    return (
                      <Cell
                        key={entry.periodKey}
                        fill={BAR_FILL_BASE}
                        stroke={revenueTrafficStroke(entry)}
                        strokeWidth={sel ? BAR_STROKE_WIDTH + 1.4 : BAR_STROKE_WIDTH}
                        strokeOpacity={dim}
                        opacity={dim}
                        fillOpacity={1}
                        cursor="pointer"
                        onMouseEnter={() => setHoveredPeriodKey(entry.periodKey)}
                        onMouseLeave={() => setHoveredPeriodKey(null)}
                      />
                    );
                  })}
                </Bar>
                <Line
                  yAxisId="right"
                  type="linear"
                  dataKey="deals"
                  name="Сделки (шт)"
                  stroke={DEALS_IN_REVENUE_CHART_LINE}
                  strokeWidth={3}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                  onClick={(_, idx) => {
                    if (typeof idx === "number" && enrichedChartData[idx]) onBarSelect(enrichedChartData[idx]);
                  }}
                />
                
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 3. Средний чек — объясняющий, фиолетовый + заливка */}
        <div className="order-3 rounded-xl border border-violet-400/25 bg-slate-800/35 p-2 shadow-[0_0_18px_-6px_rgba(167,139,250,0.2)]">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-1 gap-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wide text-violet-200/85">Средний чек</span>
              {avgCheckHeaderSubtitle ? (
                <span className={`text-[9px] font-semibold normal-case leading-tight ${avgCheckHeaderSubtitle.cls}`}>
                  — {avgCheckHeaderSubtitle.status}
                  {avgCheckHeaderSubtitle.pctBracket}
                </span>
              ) : null}
            </span>
            <span className="text-[9px] font-medium uppercase tracking-wide text-slate-600">Объяснение</span>
          </div>
          <div className="h-[210px] w-full min-w-0 xl:h-[228px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={enrichedChartData} margin={{ top: 8, right: 6, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 9 }} axisLine={{ stroke: gridColor }} tickLine={false} interval={0} angle={-18} textAnchor="end" height={48} />
                <YAxis tick={{ fill: axisColor, fontSize: 9 }} axisLine={false} width={36} tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`} />
                <defs>
                  <linearGradient id="avgCheckAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C4B5FD" stopOpacity={0.06} />
                    <stop offset="100%" stopColor="#C4B5FD" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <Area
                  type="linear"
                  dataKey="avgCheck"
                  name="Средний чек"
                  stroke="none"
                  fill="url(#avgCheckAreaGrad)"
                  connectNulls={false}
                  legendType="none"
                  isAnimationActive={false}
                />
                <Line
                  type="linear"
                  dataKey="avgCheck"
                  name="Средний чек"
                  stroke={AVG_CHECK_LINE_NEUTRAL}
                  strokeWidth={3.25}
                  connectNulls={false}
                  dot={renderAvgCheckDot}
                  activeDot={false}
                  isAnimationActive={false}
                  onClick={(_, idx) => {
                    if (typeof idx === "number" && enrichedChartData[idx]) onBarSelect(enrichedChartData[idx]);
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-500/35 bg-slate-800/40 p-2 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-300">
              Доли типов квартир (структура, не количество)
            </span>
            <p className="mt-0.5 max-w-[28rem] text-[9px] leading-snug text-slate-500">
              Каждый столбец — 100% состава месяца; высота не отражает объём. Объём и доли по типам — в карточке после клика по
              периоду.
            </p>
          </div>
          <span className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Детализация</span>
        </div>
        <div className="h-[180px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stackedShareData} margin={{ top: 8, right: 6, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 9 }} axisLine={{ stroke: gridColor }} tickLine={false} interval={0} angle={-18} textAnchor="end" height={48} />
              <YAxis tick={{ fill: axisColor, fontSize: 9 }} axisLine={false} width={32} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Legend
                wrapperStyle={{ fontSize: 9 }}
                formatter={(value, entry) => (
                  <span style={{ color: (entry.color as string) ?? axisColor }}>{value}</span>
                )}
              />
              <Bar
                dataKey="studio"
                name="Студии"
                stackId="mix"
                fill={structSegmentFill("studio")}
                stroke={structSegmentFill("studio")}
                strokeOpacity={1}
                opacity={1}
                fillOpacity={1}
                onClick={(_, idx) => {
                  if (typeof idx === "number" && enrichedChartData[idx]) onBarSelect(enrichedChartData[idx]);
                }}
              >
                {enrichedChartData.map((entry) => {
                  const dim = chartFocusOpacity(entry.periodKey, selectedPeriodKey, hoveredPeriodKey);
                  const sel = entry.periodKey === selectedPeriodKey;
                  return (
                    <Cell
                      key={entry.periodKey}
                      fill={structSegmentFill("studio")}
                      stroke={sel ? "rgba(248,250,252,0.5)" : STRUCT_STACK_SEGMENT_STROKE}
                      strokeWidth={sel ? 1.1 : 0.5}
                      strokeOpacity={dim}
                      opacity={dim}
                      fillOpacity={1}
                      cursor="pointer"
                      onMouseEnter={() => setHoveredPeriodKey(entry.periodKey)}
                      onMouseLeave={() => setHoveredPeriodKey(null)}
                    />
                  );
                })}
              </Bar>
              <Bar
                dataKey="k1"
                name="1к"
                stackId="mix"
                fill={structSegmentFill("k1")}
                stroke={structSegmentFill("k1")}
                strokeOpacity={1}
                opacity={1}
                fillOpacity={1}
                onClick={(_, idx) => {
                  if (typeof idx === "number" && enrichedChartData[idx]) onBarSelect(enrichedChartData[idx]);
                }}
              >
                {enrichedChartData.map((entry) => {
                  const dim = chartFocusOpacity(entry.periodKey, selectedPeriodKey, hoveredPeriodKey);
                  const sel = entry.periodKey === selectedPeriodKey;
                  return (
                    <Cell
                      key={entry.periodKey}
                      fill={structSegmentFill("k1")}
                      stroke={sel ? "rgba(248,250,252,0.5)" : STRUCT_STACK_SEGMENT_STROKE}
                      strokeWidth={sel ? 1.1 : 0.5}
                      strokeOpacity={dim}
                      opacity={dim}
                      fillOpacity={1}
                      cursor="pointer"
                      onMouseEnter={() => setHoveredPeriodKey(entry.periodKey)}
                      onMouseLeave={() => setHoveredPeriodKey(null)}
                    />
                  );
                })}
              </Bar>
              <Bar
                dataKey="k2"
                name="2к"
                stackId="mix"
                fill={structSegmentFill("k2")}
                stroke={structSegmentFill("k2")}
                strokeOpacity={1}
                opacity={1}
                fillOpacity={1}
                onClick={(_, idx) => {
                  if (typeof idx === "number" && enrichedChartData[idx]) onBarSelect(enrichedChartData[idx]);
                }}
              >
                {enrichedChartData.map((entry) => {
                  const dim = chartFocusOpacity(entry.periodKey, selectedPeriodKey, hoveredPeriodKey);
                  const sel = entry.periodKey === selectedPeriodKey;
                  return (
                    <Cell
                      key={entry.periodKey}
                      fill={structSegmentFill("k2")}
                      stroke={sel ? "rgba(248,250,252,0.5)" : STRUCT_STACK_SEGMENT_STROKE}
                      strokeWidth={sel ? 1.1 : 0.5}
                      strokeOpacity={dim}
                      opacity={dim}
                      fillOpacity={1}
                      cursor="pointer"
                      onMouseEnter={() => setHoveredPeriodKey(entry.periodKey)}
                      onMouseLeave={() => setHoveredPeriodKey(null)}
                    />
                  );
                })}
              </Bar>
              <Bar
                dataKey="k3"
                name="3к"
                stackId="mix"
                fill={structSegmentFill("k3")}
                stroke={structSegmentFill("k3")}
                strokeOpacity={1}
                opacity={1}
                fillOpacity={1}
                onClick={(_, idx) => {
                  if (typeof idx === "number" && enrichedChartData[idx]) onBarSelect(enrichedChartData[idx]);
                }}
              >
                {enrichedChartData.map((entry) => {
                  const dim = chartFocusOpacity(entry.periodKey, selectedPeriodKey, hoveredPeriodKey);
                  const sel = entry.periodKey === selectedPeriodKey;
                  return (
                    <Cell
                      key={entry.periodKey}
                      fill={structSegmentFill("k3")}
                      stroke={sel ? "rgba(248,250,252,0.5)" : STRUCT_STACK_SEGMENT_STROKE}
                      strokeWidth={sel ? 1.1 : 0.5}
                      strokeOpacity={dim}
                      opacity={dim}
                      fillOpacity={1}
                      cursor="pointer"
                      onMouseEnter={() => setHoveredPeriodKey(entry.periodKey)}
                      onMouseLeave={() => setHoveredPeriodKey(null)}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div data-deals-drill-panel className="mt-4 rounded-xl border border-slate-600/40 bg-slate-950/35 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Детализация периода
            {selectedRow ? (
              <span className="ml-2 font-bold normal-case text-slate-100">— {selectedRow.label}</span>
            ) : (
              <span className="ml-2 font-normal normal-case text-slate-500">(сначала выберите период на графике)</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {tabBtn("types", "Типы")}
            {tabBtn("objects", "Объекты")}
            {tabBtn("managers", "Менеджеры")}
            {tabBtn("sources", "Источники")}
          </div>
        </div>

        {!selectedPeriodKey || !drillSlice ? (
          <p className="mt-3 text-center text-[11px] text-slate-500">
            Выберите период кликом на любом графике выше — здесь появится разрез по типам, объектам, менеджерам и источникам.
          </p>
        ) : drillRows.length === 0 ? (
          <p className="mt-3 text-center text-[11px] text-slate-500">Нет среза в моке для этого периода.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {drillRows.map((r) => (
              <li key={r.key} className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,7rem)_1fr_auto] sm:items-center sm:gap-3">
                <span className="truncate text-xs font-medium text-slate-200">{r.label}</span>
                <div className="h-2 min-w-0 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#2EA8FF] to-[#4FD1FF]"
                    style={{ width: `${Math.min(100, (r.deals / maxDrillDeals) * 100)}%` }}
                  />
                </div>
                <div className="flex flex-wrap justify-end gap-x-2 text-[10px] tabular-nums text-slate-400">
                  <span>{numFmt.format(r.deals)} шт</span>
                  <span className="text-slate-300">{rubFmt.format(r.revenueRub)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

    </div>
  );
}
