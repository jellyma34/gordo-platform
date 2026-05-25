"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import {
  DEAL_SEGMENT_KEYS,
  DEAL_SEGMENT_LABEL_RU,
  type DealSegmentKey,
  type NormalizedDealRow,
} from "@/components/marketing/DealsSection";
import { UploadSalesSegmentsCsvButton } from "@/components/marketing/UploadSalesSegmentsCsvButton";
import { useMarketingPresentationLight, useMarketingPresVisual } from "@/components/marketing/marketingPresentationLightContext";
import { DEALS_ANALYTICS_SEGMENT_KEYS, type DealsAnalyticsSegmentKey } from "@/lib/buildDealsSegmentMonthAnalytics";
import { buildSegmentFactSeriesFromDeals } from "@/lib/buildSegmentFactSeriesFromDeals";
import { buildSegmentPlanRubByExecKeyFromUnits } from "@/lib/buildSegmentPlanRubFromUnitsExecution";
import type { SegmentExecutionChartsPayload } from "@/lib/marketingSegmentExecutionCsv";
import type { SegmentExecutionSegmentKey } from "@/lib/parseSegmentExecutionCsv";
import {
  unitsExecutionChartsHaveRows,
  type UnitsExecutionChartsPayload,
} from "@/lib/marketingUnitsExecutionCsv";
import {
  filterDealsForSegmentChartPeriod,
  type SegmentChartPeriodMode,
} from "@/lib/filterDealsForSegmentChartPeriod";
import { isStagnantDealMonthNoNewSales } from "@/lib/marketingDealMonthCumulative";
import { normalizeMonthKey } from "@/lib/normalizeMonthKey";
import { CASHFLOW_INFLOW_PLAN } from "@/lib/cashflowInflowChartSeries";
import {
  formatCashflowMillionsLabelTidy,
  formatCompactMoneyAxis,
  formatCompactMoneyAxisTick,
} from "@/lib/salesPlanChartFormat";
import {
  MPL_PREMIUM_CHART_SHELL,
  MPL_PREMIUM_FILTER_SELECT_10,
  MPL_PREMIUM_FILTER_SELECT_12,
  MPL_PREMIUM_FILTER_SELECT_95,
  MPL_PREMIUM_TOOLTIP_SHELL,
} from "@/lib/marketingPremiumUi";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/charting/rechartsClient";

export type SegmentPlanFactBarRow = {
  name: string;
  fact: number;
  plan: number;
};

function SegmentBarTooltip({
  active,
  payload,
  presDark,
  mplPremium,
  suppress,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: SegmentPlanFactBarRow }>;
  presDark: boolean;
  mplPremium: boolean;
  /** Нет реальных данных (плейсхолдер осей) — тултип не показываем. */
  suppress?: boolean;
}) {
  if (suppress || !active || !payload?.length) return null;
  const row = payload[0]?.payload as SegmentPlanFactBarRow | undefined;
  if (!row) return null;
  const fact = Number.isFinite(row.fact) ? row.fact : 0;
  const plan = Number.isFinite(row.plan) && row.plan > 0 ? row.plan : null;
  const pct = plan != null ? ((fact / plan) * 100).toFixed(1) : "—";
  const shell = presDark
    ? "rounded-lg border border-slate-500/40 bg-[#0b1220]/95 px-3 py-2 text-xs text-slate-100 shadow-lg"
    : mplPremium
      ? MPL_PREMIUM_TOOLTIP_SHELL
      : "rounded-lg border border-mpl-border bg-mpl-card px-3 py-2 text-xs text-mpl-text shadow-lg";

  return (
    <div className={shell}>
      <div className={`font-semibold ${presDark ? "text-slate-100" : "text-mpl-text"}`}>{row.name}</div>
      <div className={`mt-1.5 space-y-1 tabular-nums ${presDark ? "text-slate-200" : "text-mpl-text"}`}>
        <div>
          <span className={presDark ? "text-slate-400" : "text-mpl-muted"}>Факт: </span>
          <span style={{ color: "#2563EB" }} className="font-medium">
            {formatCompactMoneyAxis(fact)}
          </span>
        </div>
        <div>
          <span className={presDark ? "text-slate-400" : "text-mpl-muted"}>План: </span>
          <span style={{ color: CASHFLOW_INFLOW_PLAN.label }} className="font-medium">
            {plan != null ? formatCompactMoneyAxis(plan) : "—"}
          </span>
        </div>
        <div
          className={`border-t pt-1.5 ${presDark ? "border-slate-600/50" : mplPremium ? "border-black/[0.06]" : "border-mpl-border"}`}
        >
          <span className={presDark ? "text-slate-400" : "text-mpl-muted"}>Выполнение: </span>
          <span className="font-semibold">{pct === "—" ? pct : `${pct}%`}</span>
        </div>
      </div>
    </div>
  );
}

/** Подписи над столбцами: только число в млн (напр. «261,1»); ось/tooltip — `formatCompactMoneyAxis`. */
function formatBarTopLabel(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n === 0) return "";
  return formatCashflowMillionsLabelTidy(n, false);
}

function monthKeyLabelRu(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
    return new Date(y, m - 1, 1).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  }
  return monthKey;
}

type SegmentChartScope = "all" | DealSegmentKey;

/** Дефолт фильтров графика (не «последний месяц» из данных). */
const SEGMENT_CHART_DEFAULT_PERIOD: SegmentChartPeriodMode = "month";
const SEGMENT_CHART_DEFAULT_MONTH = "2026-02";
const SEGMENT_CHART_DEFAULT_SCOPE: SegmentChartScope = "all";

const DEAL_TO_EXEC_SEGMENT: Record<DealsAnalyticsSegmentKey, SegmentExecutionSegmentKey> = {
  apartment: "apartments",
  parking: "parking",
  storage: "storage",
  commercial: "commercial",
};

type Props = {
  dealsRows: NormalizedDealRow[];
  fallbackTotalPlanRub: number | null | undefined;
  presentation: boolean;
  /** Верхний фильтр «Период» (месяц/квартал) — общая логика с панелью, без дублирования смысла. */
  marketingPeriod: MarketingPeriodGranularity;
  /** Дата отчёта плана (YYYY-MM-DD): якорь месяца/квартала, если в сделках нет ни одного monthKey. */
  planReportAsOfYmd?: string | null;
  /** Исполнение плана в штуках — источник планового количества для расчёта PLAN (₽). */
  unitsExecutionCharts?: UnitsExecutionChartsPayload | null;
  /** CSV segment_execution с сервера (не localStorage). */
  segmentExecutionCharts?: SegmentExecutionChartsPayload | null;
  /** Глобальный режим «Редактирование» (маршрут /edit/*), не внутренний View/Edit mode панели. */
  isEditMode?: boolean;
  segmentExecutionCsvLoading?: boolean;
  hasSegmentExecutionCsv?: boolean;
  onSegmentExecutionCsvUpload?: (file: File) => Promise<void>;
  onSegmentExecutionCsvClear?: () => Promise<void>;
};

export function SalesPlanSegmentPlanFactBarChart({
  dealsRows,
  fallbackTotalPlanRub,
  presentation,
  marketingPeriod,
  planReportAsOfYmd,
  unitsExecutionCharts = null,
  segmentExecutionCharts = null,
  isEditMode = false,
  segmentExecutionCsvLoading = false,
  hasSegmentExecutionCsv = false,
  onSegmentExecutionCsvUpload,
  onSegmentExecutionCsvClear,
}: Props) {
  const presDark = useMarketingPresVisual(presentation) === "presDark";
  const mplLight = useMarketingPresentationLight();
  const showCsvUploadControls =
    isEditMode && !presentation && onSegmentExecutionCsvUpload != null && onSegmentExecutionCsvClear != null;

  const [periodMode, setPeriodMode] = useState<SegmentChartPeriodMode>(SEGMENT_CHART_DEFAULT_PERIOD);
  const [segmentScope, setSegmentScope] = useState<SegmentChartScope>(SEGMENT_CHART_DEFAULT_SCOPE);
  /** Явный выбор месяца YYYY-MM (совпадает с колонками «Сделки по месяцам»). */
  const [userMonthKey, setUserMonthKey] = useState<string | null>(SEGMENT_CHART_DEFAULT_MONTH);
  /** Явный выбор квартала `YYYY-q`, q = 0…3. */
  const [userQuarterId, setUserQuarterId] = useState<string | null>(null);

  const applyDefaultChartFilters = useCallback(() => {
    setPeriodMode(SEGMENT_CHART_DEFAULT_PERIOD);
    setUserMonthKey(SEGMENT_CHART_DEFAULT_MONTH);
    setUserQuarterId(null);
    setSegmentScope(SEGMENT_CHART_DEFAULT_SCOPE);
  }, []);

  useEffect(() => {
    applyDefaultChartFilters();
  }, [applyDefaultChartFilters]);

  const handleSegmentExecutionCsvUpload = useCallback(
    async (file: File) => {
      if (!onSegmentExecutionCsvUpload) return;
      await onSegmentExecutionCsvUpload(file);
      applyDefaultChartFilters();
    },
    [onSegmentExecutionCsvUpload, applyDefaultChartFilters],
  );

  const handleSegmentExecutionCsvClear = useCallback(
    async () => {
      if (!onSegmentExecutionCsvClear) return;
      await onSegmentExecutionCsvClear();
      applyDefaultChartFilters();
    },
    [onSegmentExecutionCsvClear, applyDefaultChartFilters],
  );

  const selectCls = presentation
    ? mplLight
      ? MPL_PREMIUM_FILTER_SELECT_95
      : "h-8 min-w-[9.5rem] rounded-lg border border-slate-600/70 bg-slate-900/60 px-2.5 text-xs text-slate-100"
    : "h-9 min-w-[9.5rem] rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900";

  const filterLabelCls = presentation
    ? mplLight
      ? "text-[11px] font-medium uppercase tracking-wide text-mpl-muted"
      : "text-[11px] font-medium uppercase tracking-wide text-slate-500"
    : "text-xs font-medium text-slate-600";

  const sortedMonthKeys = useMemo(
    () =>
      [...new Set(dealsRows.map((r) => normalizeMonthKey(r.monthKey)).filter((k): k is string => k != null))].sort(),
    [dealsRows],
  );

  const anchorMonthKey = useMemo(() => {
    if (!planReportAsOfYmd || !/^\d{4}-\d{2}/.test(planReportAsOfYmd)) return null;
    return normalizeMonthKey(planReportAsOfYmd) ?? planReportAsOfYmd.slice(0, 7);
  }, [planReportAsOfYmd]);

  const monthOptionsForSelect = useMemo(() => {
    const out = new Set(sortedMonthKeys);
    out.add(SEGMENT_CHART_DEFAULT_MONTH);
    if (anchorMonthKey) out.add(anchorMonthKey);
    return [...out].sort();
  }, [sortedMonthKeys, anchorMonthKey]);

  const quarterOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { id: string; label: string }[] = [];
    const monthKeysForQuarter = new Set(sortedMonthKeys);
    if (anchorMonthKey) monthKeysForQuarter.add(anchorMonthKey);
    for (const key of monthKeysForQuarter) {
      const canon = normalizeMonthKey(key) ?? key;
      const [y, m] = canon.split("-").map(Number);
      if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) continue;
      const q = Math.floor((m - 1) / 3);
      const id = `${y}-${q}`;
      if (seen.has(id)) continue;
      seen.add(id);
      opts.push({ id, label: `${y} · Q${q + 1}` });
    }
    opts.sort((a, b) => a.id.localeCompare(b.id));
    return opts;
  }, [sortedMonthKeys, anchorMonthKey]);

  const monthKeyForFilter = useMemo(() => {
    if (periodMode !== "month") return null;
    return normalizeMonthKey(userMonthKey ?? SEGMENT_CHART_DEFAULT_MONTH) ?? SEGMENT_CHART_DEFAULT_MONTH;
  }, [periodMode, userMonthKey]);

  const quarterIdForFilter = useMemo(() => {
    if (periodMode !== "quarter") return null;
    if (userQuarterId && quarterOptions.some((o) => o.id === userQuarterId)) return userQuarterId;
    if (quarterOptions.length > 0) return quarterOptions[quarterOptions.length - 1]!.id;
    if (planReportAsOfYmd && /^\d{4}-\d{2}-\d{2}$/.test(planReportAsOfYmd)) {
      const [y, m] = planReportAsOfYmd.slice(0, 7).split("-").map(Number);
      if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
        const q = Math.floor((m - 1) / 3);
        return `${y}-${q}`;
      }
    }
    return null;
  }, [periodMode, userQuarterId, quarterOptions, planReportAsOfYmd]);

  const hasUnitsPlanSource = unitsExecutionChartsHaveRows(unitsExecutionCharts);

  const periodFilterOptions = useMemo(
    () => ({
      fallbackAsOfYmd: planReportAsOfYmd,
      ...(periodMode === "month" && monthKeyForFilter ? { selectedMonthKey: monthKeyForFilter } : {}),
      ...(periodMode === "quarter" && quarterIdForFilter ? { selectedQuarterId: quarterIdForFilter } : {}),
    }),
    [periodMode, planReportAsOfYmd, monthKeyForFilter, quarterIdForFilter],
  );

  /** Факт — только `/api/deals` (sumRub по сегменту). */
  const factSeries = useMemo(
    () => buildSegmentFactSeriesFromDeals(dealsRows, periodMode, periodFilterOptions),
    [dealsRows, periodMode, periodFilterOptions],
  );

  /** План — только штуки × средняя цена; без сделок и без факта. */
  const planSeries = useMemo(
    () =>
      buildSegmentPlanRubByExecKeyFromUnits(
        unitsExecutionCharts,
        {
          periodMode,
          monthKey: periodMode === "month" ? monthKeyForFilter : null,
          quarterId: periodMode === "quarter" ? quarterIdForFilter : null,
          fallbackAsOfYmd: planReportAsOfYmd,
        },
        sortedMonthKeys,
      ),
    [unitsExecutionCharts, periodMode, monthKeyForFilter, quarterIdForFilter, planReportAsOfYmd, sortedMonthKeys],
  );

  const segmentBarRowsAll = useMemo(() => {
    const byPeriod = filterDealsForSegmentChartPeriod(dealsRows, periodMode, periodFilterOptions);
    const stagnantMonth =
      periodMode === "month" && monthKeyForFilter != null
        ? isStagnantDealMonthNoNewSales(dealsRows, monthKeyForFilter)
        : false;
    const showZeroSalesSegments =
      (periodMode === "month" && monthKeyForFilter != null && (stagnantMonth || byPeriod.length === 0)) ||
      (periodMode === "quarter" && quarterIdForFilter != null && byPeriod.length === 0);

    const merged: SegmentPlanFactBarRow[] = DEALS_ANALYTICS_SEGMENT_KEYS.map((key) => {
      const execKey = DEAL_TO_EXEC_SEGMENT[key];
      return {
        name: DEAL_SEGMENT_LABEL_RU[key],
        fact: factSeries[key],
        plan: planSeries?.get(execKey) ?? 0,
      };
    }).filter(
      (row) =>
        showZeroSalesSegments || Math.abs(row.fact) > 1e-9 || Math.abs(row.plan) > 1e-9,
    );

    if (process.env.NODE_ENV === "development") {
      console.table(merged);
      console.log("[segment chart datasets]", {
        factSource: "deals-json-aggregateSegmentAnalyticsFromDeals",
        planSource: hasUnitsPlanSource ? "units-plan-cumulative-x-avg-price" : "none",
        periodMode,
        selectedMonthKey: periodMode === "month" ? monthKeyForFilter : null,
        selectedQuarterId: periodMode === "quarter" ? quarterIdForFilter : null,
        filteredDealsCount: byPeriod.length,
        factSeries,
        planSeries: planSeries ? Object.fromEntries(planSeries) : null,
      });
    }
    return merged;
  }, [
    dealsRows,
    periodMode,
    periodFilterOptions,
    monthKeyForFilter,
    quarterIdForFilter,
    factSeries,
    planSeries,
    hasUnitsPlanSource,
  ]);

  useEffect(() => {
    if (segmentScope === "all") return;
    const label = DEAL_SEGMENT_LABEL_RU[segmentScope];
    if (!segmentBarRowsAll.some((r) => r.name === label)) setSegmentScope("all");
  }, [segmentScope, segmentBarRowsAll]);

  const hasSegmentPlanBar = useMemo(
    () => segmentBarRowsAll.some((r) => Math.abs(r.plan) > 1e-9),
    [segmentBarRowsAll],
  );

  const rows = useMemo(() => {
    if (segmentScope === "all") return segmentBarRowsAll;
    const label = DEAL_SEGMENT_LABEL_RU[segmentScope];
    return segmentBarRowsAll.filter((r) => r.name === label);
  }, [segmentBarRowsAll, segmentScope]);

  /** Плейсхолдер категорий для осей при отсутствии строк после фильтра. */
  const emptyPlaceholderRows = useMemo((): SegmentPlanFactBarRow[] => {
    if (segmentScope === "all") {
      return DEAL_SEGMENT_KEYS.map((k) => ({
        name: DEAL_SEGMENT_LABEL_RU[k],
        fact: 0,
        plan: 0,
      }));
    }
    return [{ name: DEAL_SEGMENT_LABEL_RU[segmentScope], fact: 0, plan: 0 }];
  }, [segmentScope]);

  /** Нет сделок вовсе (режим «Все» / пустой JSON) — не путать с нулевым фактом за выбранный месяц. */
  const showEmptyOverlay = rows.length === 0 && dealsRows.length === 0 && !hasUnitsPlanSource;
  const displayRows = showEmptyOverlay ? emptyPlaceholderRows : rows;

  const segmentSelectOptions = useMemo(() => {
    const withData = new Set(segmentBarRowsAll.map((r) => r.name));
    return [
      { value: "all" as const, label: "Все" },
      ...DEAL_SEGMENT_KEYS.filter((k) => withData.has(DEAL_SEGMENT_LABEL_RU[k])).map((k) => ({
        value: k,
        label: DEAL_SEGMENT_LABEL_RU[k],
      })),
    ];
  }, [segmentBarRowsAll]);

  const barCategoryGapPct = useMemo(() => {
    const n = displayRows.length;
    if (n <= 1) return "6%";
    if (n <= 2) return "12%";
    if (n <= 4) return "18%";
    return "22%";
  }, [displayRows.length]);

  const yDomain = useMemo((): [number, number] => {
    if (rows.length === 0) return [0, 1];
    const vals = rows
      .flatMap((r) => (hasSegmentPlanBar ? [r.fact, r.plan] : [r.fact]))
      .map((v) => (typeof v === "number" && Number.isFinite(v) ? v : 0));
    const max = Math.max(0, ...vals);
    const head = max > 0 ? max * 0.14 : 1;
    return [0, max + head];
  }, [rows, hasSegmentPlanBar]);

  const gridStroke = presDark ? "rgba(148,163,184,0.12)" : "rgba(148,163,184,0.35)";
  const axisColor = presDark ? "#94a3b8" : "#64748b";

  return (
    <div
      className={
        presDark
          ? "mb-7 overflow-visible rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4 shadow-sm sm:p-5"
          : presentation && mplLight
            ? `mb-7 overflow-visible p-4 sm:p-5 ${MPL_PREMIUM_CHART_SHELL}`
            : presentation
              ? "mb-7 overflow-visible rounded-2xl border border-mpl-border bg-mpl-chart p-4 shadow-sm sm:p-5"
              : "mb-7 overflow-visible rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      }
    >
      <div className="mb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3
              className={`text-sm font-semibold ${presDark ? "text-slate-100" : presentation ? "text-mpl-text" : "text-slate-900"}`}
            >
              Выполнение плана продаж по сегментам
            </h3>
          </div>
          {showCsvUploadControls ? (
            <div className="flex shrink-0 items-center gap-2">
              <UploadSalesSegmentsCsvButton
                hasCsv={hasSegmentExecutionCsv}
                loading={segmentExecutionCsvLoading}
                presDark={presDark}
                onUploadFile={handleSegmentExecutionCsvUpload}
                onClear={handleSegmentExecutionCsvClear}
              />
            </div>
          ) : null}
        </div>
        {!presentation && hasUnitsPlanSource ? (
          <p className={`mt-1 text-[11px] ${presDark ? "text-slate-400" : "text-slate-500"}`}>
            Факт — сделки JSON; план — накопительный план в штуках × средняя стоимость сегмента.
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className={filterLabelCls}>Период графика</span>
            <select
              value={periodMode}
              onChange={(e) => {
                setPeriodMode(e.target.value as SegmentChartPeriodMode);
              }}
              className={selectCls}
            >
              <option value="month">Месяц</option>
              <option value="quarter">Квартал</option>
              <option value="all">Все</option>
            </select>
          </label>
          {periodMode === "month" ? (
            <label className="flex flex-col gap-1">
              <span className={filterLabelCls}>Месяц</span>
              <select
                value={userMonthKey ?? SEGMENT_CHART_DEFAULT_MONTH}
                onChange={(e) => setUserMonthKey(e.target.value || SEGMENT_CHART_DEFAULT_MONTH)}
                className={
                  presentation
                    ? mplLight
                      ? MPL_PREMIUM_FILTER_SELECT_12
                      : "h-8 min-w-[12rem] rounded-lg border border-slate-600/70 bg-slate-900/60 px-2.5 text-xs text-slate-100"
                    : "h-9 min-w-[12rem] rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900"
                }
              >
                {monthOptionsForSelect.map((mk) => (
                  <option key={mk} value={mk}>
                    {monthKeyLabelRu(mk)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {periodMode === "quarter" && quarterOptions.length > 0 ? (
            <label className="flex flex-col gap-1">
              <span className={filterLabelCls}>Квартал</span>
              <select
                value={quarterIdForFilter ?? ""}
                onChange={(e) => setUserQuarterId(e.target.value || null)}
                className={
                  presentation
                    ? mplLight
                      ? MPL_PREMIUM_FILTER_SELECT_10
                      : "h-8 min-w-[10rem] rounded-lg border border-slate-600/70 bg-slate-900/60 px-2.5 text-xs text-slate-100"
                    : "h-9 min-w-[10rem] rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900"
                }
              >
                {quarterOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="flex flex-col gap-1">
            <span className={filterLabelCls}>Сегмент</span>
            <select
              value={segmentScope}
              onChange={(e) => setSegmentScope(e.target.value as SegmentChartScope)}
              className={selectCls}
            >
              {segmentSelectOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="relative h-[300px] min-h-[280px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={displayRows}
            margin={{ top: 28, right: 8, left: 8, bottom: 8 }}
            barCategoryGap={barCategoryGapPct}
            barGap={displayRows.length <= 2 ? 6 : 8}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fill: axisColor, fontSize: 11 }}
              axisLine={{ stroke: gridStroke }}
              tickLine={false}
              interval={0}
            />
            <YAxis
              domain={yDomain}
              allowDecimals={false}
              tick={{ fill: axisColor, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => {
                const n = Number(v);
                return Number.isFinite(n) ? formatCompactMoneyAxisTick(n) : "";
              }}
              width={56}
            />
            <Tooltip
              cursor={{ fill: presDark ? "rgba(148,163,184,0.06)" : "rgba(100,116,139,0.08)" }}
              content={
                <SegmentBarTooltip
                  presDark={presDark}
                  mplPremium={presentation && mplLight}
                  suppress={showEmptyOverlay}
                />
              }
            />
            <Bar
              dataKey="fact"
              name="Факт"
              fill={showEmptyOverlay ? "transparent" : "#2563EB"}
              radius={[8, 8, 0, 0]}
              maxBarSize={52}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="fact"
                position="top"
                fill={showEmptyOverlay ? "transparent" : "#2563EB"}
                fontSize={12}
                fontWeight={600}
                className="tabular-nums"
                formatter={formatBarTopLabel}
              />
            </Bar>
            {hasSegmentPlanBar ? (
              <Bar
                dataKey="plan"
                name="План"
                fill={showEmptyOverlay ? "transparent" : CASHFLOW_INFLOW_PLAN.stroke}
                fillOpacity={showEmptyOverlay ? 0 : CASHFLOW_INFLOW_PLAN.strokeOpacity}
                radius={[8, 8, 0, 0]}
                maxBarSize={52}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="plan"
                  position="top"
                  fill={showEmptyOverlay ? "transparent" : CASHFLOW_INFLOW_PLAN.label}
                  fontSize={12}
                  fontWeight={500}
                  className="tabular-nums"
                  formatter={formatBarTopLabel}
                />
              </Bar>
            ) : null}
          </BarChart>
        </ResponsiveContainer>
        {showEmptyOverlay ? (
          <div
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4"
            aria-live="polite"
          >
            <p
              className={`max-w-md text-center text-sm font-medium leading-snug ${
                presDark ? "text-slate-200" : presentation ? "text-mpl-text" : "text-slate-800"
              }`}
            >
              Нет данных за выбранный период
            </p>
          </div>
        ) : null}
      </div>

      <div className={`mt-3 flex flex-wrap items-center gap-4 text-[10px] ${presDark ? "text-slate-500" : presentation ? "text-mpl-muted" : "text-slate-600"}`}>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm bg-[#2563EB]" />
          Факт
        </span>
        {hasSegmentPlanBar ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-4 rounded-sm"
              style={{ backgroundColor: CASHFLOW_INFLOW_PLAN.stroke }}
            />
            План
          </span>
        ) : null}
      </div>
    </div>
  );
}
