"use client";

import { useEffect, useMemo, useState } from "react";

import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import {
  DEAL_SEGMENT_KEYS,
  DEAL_SEGMENT_LABEL_RU,
  type DealSegmentKey,
  type NormalizedDealRow,
} from "@/components/marketing/DealsSection";
import { useMarketingPresentationLight, useMarketingPresVisual } from "@/components/marketing/marketingPresentationLightContext";
import { buildSegmentPlanFactBarDataFromDeals } from "@/lib/buildSegmentPlanFactFromDeals";
import {
  filterDealsForSegmentChartPeriod,
  type SegmentChartPeriodMode,
} from "@/lib/filterDealsForSegmentChartPeriod";
import { normalizeMonthKey } from "@/lib/normalizeMonthKey";
import { formatCompactMoneyAxis } from "@/lib/salesPlanChartFormat";
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
  const plan = Number.isFinite(row.plan) ? row.plan : 0;
  const pct = plan > 0 ? ((fact / plan) * 100).toFixed(1) : "—";
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
          <span style={{ color: "#F97316" }} className="font-medium">
            {formatCompactMoneyAxis(plan)}
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

/** Подписи над столбцами — те же правила, что ось Y (`formatCompactMoneyAxis`). */
function formatBarTopLabel(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n === 0) return "";
  return formatCompactMoneyAxis(n);
}

function monthKeyLabelRu(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
    return new Date(y, m - 1, 1).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  }
  return monthKey;
}

type SegmentChartScope = "all" | DealSegmentKey;

type Props = {
  dealsRows: NormalizedDealRow[];
  fallbackTotalPlanRub: number | null | undefined;
  presentation: boolean;
  /** Верхний фильтр «Период» (месяц/квартал) — общая логика с панелью, без дублирования смысла. */
  marketingPeriod: MarketingPeriodGranularity;
  /** Дата отчёта плана (YYYY-MM-DD): якорь месяца/квартала, если в сделках нет ни одного monthKey. */
  planReportAsOfYmd?: string | null;
};

export function SalesPlanSegmentPlanFactBarChart({
  dealsRows,
  fallbackTotalPlanRub,
  presentation,
  marketingPeriod,
  planReportAsOfYmd,
}: Props) {
  const presDark = useMarketingPresVisual(presentation) === "presDark";
  const mplLight = useMarketingPresentationLight();

  const [periodMode, setPeriodMode] = useState<SegmentChartPeriodMode>(() =>
    marketingPeriod === "quarter" ? "quarter" : "month",
  );
  const [segmentScope, setSegmentScope] = useState<SegmentChartScope>("all");
  /** Явный выбор месяца YYYY-MM (совпадает с колонками «Сделки по месяцам»). */
  const [userMonthKey, setUserMonthKey] = useState<string | null>(null);
  /** Явный выбор квартала `YYYY-q`, q = 0…3. */
  const [userQuarterId, setUserQuarterId] = useState<string | null>(null);

  useEffect(() => {
    setPeriodMode((prev) => {
      if (prev === "all") return prev;
      return marketingPeriod === "quarter" ? "quarter" : "month";
    });
  }, [marketingPeriod]);

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

  const monthOptionsForSelect = useMemo(() => {
    const out = [...sortedMonthKeys];
    if (planReportAsOfYmd && /^\d{4}-\d{2}/.test(planReportAsOfYmd)) {
      const mk = normalizeMonthKey(planReportAsOfYmd) ?? planReportAsOfYmd.slice(0, 7);
      if (mk && !out.includes(mk)) out.push(mk);
    }
    return out.sort();
  }, [sortedMonthKeys, planReportAsOfYmd]);

  const quarterOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { id: string; label: string }[] = [];
    for (const key of sortedMonthKeys) {
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
  }, [sortedMonthKeys]);

  const monthKeyForFilter = useMemo(() => {
    if (periodMode !== "month") return null;
    if (userMonthKey) {
      const canon = normalizeMonthKey(userMonthKey) ?? userMonthKey;
      if (monthOptionsForSelect.includes(canon)) return canon;
    }
    if (sortedMonthKeys.length > 0) return sortedMonthKeys[sortedMonthKeys.length - 1]!;
    if (planReportAsOfYmd && /^\d{4}-\d{2}/.test(planReportAsOfYmd)) {
      return normalizeMonthKey(planReportAsOfYmd) ?? planReportAsOfYmd.slice(0, 7);
    }
    return null;
  }, [periodMode, userMonthKey, sortedMonthKeys, monthOptionsForSelect, planReportAsOfYmd]);

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

  const segmentBarRowsAll = useMemo(() => {
    const byPeriod = filterDealsForSegmentChartPeriod(dealsRows, periodMode, {
      fallbackAsOfYmd: planReportAsOfYmd,
      ...(periodMode === "month" && monthKeyForFilter ? { selectedMonthKey: monthKeyForFilter } : {}),
      ...(periodMode === "quarter" && quarterIdForFilter ? { selectedQuarterId: quarterIdForFilter } : {}),
    });
    const built = buildSegmentPlanFactBarDataFromDeals(byPeriod, fallbackTotalPlanRub);
    if (process.env.NODE_ENV === "development") {
      console.debug("[segment-plan-chart]", {
        periodMode,
        selectedMonthKey: periodMode === "month" ? monthKeyForFilter : null,
        selectedQuarterId: periodMode === "quarter" ? quarterIdForFilter : null,
        filteredDealsCount: byPeriod.length,
        groupedSegmentTotals: built.map((r) => ({ name: r.name, fact: r.fact, plan: r.plan })),
        finalChartDatasetRowCount: built.length,
      });
    }
    return built;
  }, [dealsRows, fallbackTotalPlanRub, periodMode, planReportAsOfYmd, monthKeyForFilter, quarterIdForFilter]);

  useEffect(() => {
    if (segmentScope === "all") return;
    const label = DEAL_SEGMENT_LABEL_RU[segmentScope];
    if (!segmentBarRowsAll.some((r) => r.name === label)) setSegmentScope("all");
  }, [segmentScope, segmentBarRowsAll]);

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

  const showEmptyOverlay = rows.length === 0;
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
      .flatMap((r) => [r.fact, r.plan])
      .map((v) => (typeof v === "number" && Number.isFinite(v) ? v : 0));
    const max = Math.max(0, ...vals);
    const head = max > 0 ? max * 0.14 : 1;
    return [0, max + head];
  }, [rows]);

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
        <h3 className={`text-sm font-semibold ${presDark ? "text-slate-100" : presentation ? "text-mpl-text" : "text-slate-900"}`}>
          Выполнение плана продаж по сегментам
        </h3>
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
          {periodMode === "month" && monthOptionsForSelect.length > 0 ? (
            <label className="flex flex-col gap-1">
              <span className={filterLabelCls}>Месяц</span>
              <select
                value={monthKeyForFilter ?? ""}
                onChange={(e) => setUserMonthKey(e.target.value || null)}
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
              tick={{ fill: axisColor, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => {
                const n = Number(v);
                return Number.isFinite(n) ? formatCompactMoneyAxis(n) : "";
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
                fontSize={11}
                fontWeight={500}
                className="tabular-nums"
                formatter={formatBarTopLabel}
              />
            </Bar>
            <Bar
              dataKey="plan"
              name="План"
              fill={showEmptyOverlay ? "transparent" : "#F97316"}
              radius={[8, 8, 0, 0]}
              maxBarSize={52}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="plan"
                position="top"
                fill={showEmptyOverlay ? "transparent" : "#F97316"}
                fontSize={11}
                fontWeight={500}
                className="tabular-nums"
                formatter={formatBarTopLabel}
              />
            </Bar>
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
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm bg-[#F97316]" />
          План
        </span>
      </div>
    </div>
  );
}
