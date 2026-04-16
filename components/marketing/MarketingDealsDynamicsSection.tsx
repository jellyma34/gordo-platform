"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";

import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import { filterByObjectAndDealType, marketingMockData } from "@/lib/marketingMockData";
import { numFmt, rubFmt } from "@/lib/salesPlanChartFormat";
import {
  buildDealsDynamicsSeries,
  dealsDeltaTone,
  deltaToneClasses,
  type DealsDynamicsChartRow,
} from "@/lib/marketingDealsDynamics";

const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false });
const ComposedChart = dynamic(() => import("recharts").then((m) => m.ComposedChart), { ssr: false });
const BarChart = dynamic(() => import("recharts").then((m) => m.BarChart), { ssr: false });
const Bar = dynamic(() => import("recharts").then((m) => m.Bar), { ssr: false });
const Line = dynamic(() => import("recharts").then((m) => m.Line), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((m) => m.CartesianGrid), { ssr: false });
const Legend = dynamic(() => import("recharts").then((m) => m.Legend), { ssr: false });
const Cell = dynamic(() => import("recharts").then((m) => m.Cell), { ssr: false });

type Props = {
  presentation: boolean;
  period: MarketingPeriodGranularity;
  objectId: string;
  dealTypeId: string;
};

type DrillTab = "types" | "objects" | "managers" | "sources";

function formatDelta(n: number | null, suffix = ""): string {
  if (n == null) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${numFmt.format(Math.abs(Math.round(n)))}${suffix}`;
}

function DealsTooltipBody({
  row,
  presentation,
}: {
  row: DealsDynamicsChartRow;
  presentation: boolean;
}) {
  const dDeal = deltaToneClasses(dealsDeltaTone(row.deltaDeals), presentation);
  const dRev = deltaToneClasses(dealsDeltaTone(row.deltaRevenue), presentation);
  const dAvg = deltaToneClasses(dealsDeltaTone(row.deltaAvgCheck), presentation);
  const avgStr = row.avgCheck != null ? rubFmt.format(Math.round(row.avgCheck)) : "—";
  const sumParts =
    row.volPart != null && row.mixPart != null ? row.volPart + row.mixPart : null;
  const approxDeltaRev = row.deltaRevenue;

  return (
    <div
      className={`min-w-[220px] rounded-lg border px-3 py-2 text-[11px] shadow-lg ${
        presentation ? "border-slate-600 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-900"
      }`}
    >
      <div className={`font-semibold ${presentation ? "text-slate-100" : "text-slate-900"}`}>{row.label}</div>
      <div className="mt-2 space-y-1 tabular-nums">
        <div className="flex justify-between gap-4">
          <span className={presentation ? "text-slate-400" : "text-slate-600"}>Сделки</span>
          <span>{numFmt.format(row.deals)} шт</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className={presentation ? "text-slate-400" : "text-slate-600"}>Выручка</span>
          <span>{rubFmt.format(row.revenue)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className={presentation ? "text-slate-400" : "text-slate-600"}>Средний чек</span>
          <span>{avgStr}</span>
        </div>
        <div className={`mt-2 border-t pt-2 ${presentation ? "border-slate-600" : "border-slate-200"}`}>
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-80">К пред. периоду</div>
          <div className="flex justify-between gap-4">
            <span className={presentation ? "text-slate-400" : "text-slate-600"}>Δ сделок</span>
            <span className={dDeal.text}>{formatDelta(row.deltaDeals, " шт")}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className={presentation ? "text-slate-400" : "text-slate-600"}>Δ выручки</span>
            <span className={dRev.text}>
              {row.deltaRevenue == null
                ? "—"
                : `${row.deltaRevenue > 0 ? "+" : row.deltaRevenue < 0 ? "−" : ""}${rubFmt.format(Math.abs(row.deltaRevenue))}`}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className={presentation ? "text-slate-400" : "text-slate-600"}>Δ среднего чека</span>
            <span className={dAvg.text}>
              {row.deltaAvgCheck == null
                ? "—"
                : `${row.deltaAvgCheck > 0 ? "+" : row.deltaAvgCheck < 0 ? "−" : ""}${rubFmt.format(Math.abs(Math.round(row.deltaAvgCheck)))}`}
            </span>
          </div>
        </div>
        {row.volPart != null && row.mixPart != null && approxDeltaRev != null ? (
          <div className={`mt-2 border-t pt-2 text-[10px] leading-snug ${presentation ? "border-slate-600 text-slate-400" : "border-slate-200 text-slate-600"}`}>
            <div className={`font-semibold ${presentation ? "text-emerald-300" : "text-emerald-700"}`}>Разложение Δ выручки</div>
            <div>Δ ≈ (Δ сделок × чек<sub>пр</sub>) + (сделок<sub>пр</sub> × Δ чек)</div>
            <div className="mt-1 tabular-nums">
              Объём: {row.volPart >= 0 ? "+" : "−"}
              {rubFmt.format(Math.abs(Math.round(row.volPart)))} · Цена: {row.mixPart >= 0 ? "+" : "−"}
              {rubFmt.format(Math.abs(Math.round(row.mixPart)))}
            </div>
            <div className="opacity-90">
              Сумма: {sumParts != null ? `${sumParts >= 0 ? "+" : "−"}${rubFmt.format(Math.abs(Math.round(sumParts)))}` : "—"} · Факт Δ
              выручки: {approxDeltaRev >= 0 ? "+" : "−"}
              {rubFmt.format(Math.abs(approxDeltaRev))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SharedTooltip({
  active,
  payload,
  presentation,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: DealsDynamicsChartRow }>;
  presentation: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return <DealsTooltipBody row={row} presentation={presentation} />;
}

export function MarketingDealsDynamicsSection({ presentation, period, objectId, dealTypeId }: Props) {
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string | null>(null);
  const [drillTab, setDrillTab] = useState<DrillTab>("types");

  const axisColor = presentation ? "#94a3b8" : "#64748b";
  const gridColor = presentation ? "rgba(148,163,184,0.12)" : "rgba(100,116,139,0.15)";

  const chartData = useMemo(() => {
    const factSrc = period === "month" ? marketingMockData.salesFact.month : marketingMockData.salesFact.quarter;
    const revSrc = period === "month" ? marketingMockData.salesRevenue.month : marketingMockData.salesRevenue.quarter;
    const factRows = filterByObjectAndDealType(factSrc, objectId, dealTypeId);
    const revenueRows = filterByObjectAndDealType(revSrc, objectId, dealTypeId);
    return buildDealsDynamicsSeries(factRows, revenueRows);
  }, [period, objectId, dealTypeId]);

  const selectedRow = useMemo(
    () => (selectedPeriodKey ? chartData.find((r) => r.periodKey === selectedPeriodKey) ?? null : null),
    [chartData, selectedPeriodKey],
  );

  const drillSlice =
    selectedPeriodKey != null ? marketingMockData.dealsPeriodDrilldown[selectedPeriodKey] ?? null : null;

  const drillRows = useMemo(() => {
    if (!drillSlice) return [];
    switch (drillTab) {
      case "types":
        return drillSlice.apartmentTypes;
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

  const onBarSelect = useCallback((row: DealsDynamicsChartRow | undefined) => {
    if (row?.periodKey) setSelectedPeriodKey(row.periodKey);
  }, []);

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
    <div className="mt-4 rounded-xl border border-slate-600/45 bg-gradient-to-br from-slate-900/75 via-slate-900/50 to-slate-950/90 p-3 sm:p-4">
      <div className="mb-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">Сделки</div>
        <p className="mt-1 max-w-3xl text-[10px] leading-snug text-slate-500">
          Динамика сделок и выручки по данным мока: <span className="font-mono">salesFact</span> +{" "}
          <span className="font-mono">salesRevenue</span>. Средний чек = выручка / сделки. Наведите на месяц — все Δ и разложение
          выручки; клик по столбцу — детализация по разрезам.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-600/50 bg-slate-950/40 p-2">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-cyan-200/80">
            Сделки по {period === "month" ? "месяцам" : "кварталам"}
          </div>
          <div className="h-[220px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 6, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 9 }} axisLine={{ stroke: gridColor }} tickLine={false} interval={0} angle={-18} textAnchor="end" height={48} />
                <YAxis tick={{ fill: axisColor, fontSize: 9 }} axisLine={false} width={28} tickFormatter={(v) => numFmt.format(v)} />
                <Tooltip
                  content={(props) => <SharedTooltip active={props.active} payload={props.payload as typeof props.payload} presentation />}
                  cursor={{ fill: "rgba(56,189,248,0.08)" }}
                />
                <Bar
                  dataKey="deals"
                  name="Сделки"
                  radius={[4, 4, 0, 0]}
                  onClick={(_, idx) => {
                    if (typeof idx === "number" && chartData[idx]) onBarSelect(chartData[idx]);
                  }}
                >
                  {chartData.map((entry, i) => {
                    const fill = deltaToneClasses(dealsDeltaTone(entry.deltaDeals), true).fill;
                    return <Cell key={entry.periodKey} fill={fill} cursor="pointer" />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-600/50 bg-slate-950/40 p-2">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-cyan-200/80">Выручка + сделки</div>
          <div className="h-[220px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 9 }} axisLine={{ stroke: gridColor }} tickLine={false} interval={0} angle={-18} textAnchor="end" height={48} />
                <YAxis yAxisId="left" tick={{ fill: axisColor, fontSize: 9 }} axisLine={false} width={36} tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: axisColor, fontSize: 9 }} axisLine={false} width={28} tickFormatter={(v) => numFmt.format(v)} />
                <Tooltip content={(props) => <SharedTooltip active={props.active} payload={props.payload as typeof props.payload} presentation />} />
                <Legend wrapperStyle={{ fontSize: 9 }} formatter={(v) => <span style={{ color: axisColor }}>{v}</span>} />
                <Bar
                  yAxisId="left"
                  dataKey="revenue"
                  name="Выручка ₽"
                  fill="url(#revGradDeals)"
                  radius={[4, 4, 0, 0]}
                  onClick={(_, idx) => {
                    if (typeof idx === "number" && chartData[idx]) onBarSelect(chartData[idx]);
                  }}
                />
                <Line yAxisId="right" type="linear" dataKey="deals" name="Сделки" stroke="#fbbf24" strokeWidth={2} dot={{ r: 3, fill: "#fbbf24" }} activeDot={{ r: 5 }} isAnimationActive={false} />
                <defs>
                  <linearGradient id="revGradDeals" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.5} />
                  </linearGradient>
                </defs>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-600/50 bg-slate-950/40 p-2">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-cyan-200/80">Средний чек</div>
          <div className="h-[220px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 6, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 9 }} axisLine={{ stroke: gridColor }} tickLine={false} interval={0} angle={-18} textAnchor="end" height={48} />
                <YAxis tick={{ fill: axisColor, fontSize: 9 }} axisLine={false} width={36} tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`} />
                <Tooltip content={(props) => <SharedTooltip active={props.active} payload={props.payload as typeof props.payload} presentation />} />
                <Line
                  type="linear"
                  dataKey="avgCheck"
                  name="Средний чек"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  connectNulls={false}
                  dot={{ r: 3, strokeWidth: 1, fill: "#c4b5fd", stroke: "#1e293b" }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-600/40 bg-slate-950/35 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Детализация периода
            {selectedRow ? (
              <span className="ml-2 font-bold normal-case text-slate-100">— {selectedRow.label}</span>
            ) : (
              <span className="ml-2 font-normal normal-case text-slate-500">(клик по столбцу на графике)</span>
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
          <p className="mt-3 text-center text-[11px] text-slate-500">Выберите месяц на графике «Сделки» или «Выручка + сделки».</p>
        ) : drillRows.length === 0 ? (
          <p className="mt-3 text-center text-[11px] text-slate-500">Нет среза в моке для этого периода.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {drillRows.map((r) => (
              <li key={r.key} className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,7rem)_1fr_auto] sm:items-center sm:gap-3">
                <span className="truncate text-xs font-medium text-slate-200">{r.label}</span>
                <div className="h-2 min-w-0 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-sky-400"
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
