"use client";

import { MarketingDealSegmentHeader } from "@/components/marketing/MarketingDealSegmentHeader";
import { useMemo } from "react";

import {
  buildDealsMonthSeries,
  DEAL_SEGMENT_KEYS,
  DEALS_LABEL_EM_DASH,
  transformDealsData,
  type DealSegmentKey,
  type DealsByMonth,
  type NormalizedDealRow,
} from "./DealsSection";

const numFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const pctFmt = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const rubFmt = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
const shareFmt = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 1 });

export type SegmentPresentationKey = DealSegmentKey;

function monthSumSeriesForSegment(rows: NormalizedDealRow[], seg: DealSegmentKey) {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.dealType !== seg) continue;
    m.set(r.monthKey, (m.get(r.monthKey) ?? 0) + r.sumRub);
  }
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([monthKey, sum]) => ({ monthKey, sum }));
}

function segmentStatus(
  monthSeries: { sum: number }[],
  planSum: number | undefined,
  actualSum: number,
): "норма" | "риск" | "критично" {
  if (planSum != null && planSum > 0) {
    const d = (actualSum - planSum) / planSum;
    if (d >= -0.05) return "норма";
    if (d >= -0.15) return "риск";
    return "критично";
  }
  if (monthSeries.length < 2) return "норма";
  const last = monthSeries[monthSeries.length - 1]!.sum;
  const prev = monthSeries[monthSeries.length - 2]!.sum;
  if (prev === 0 && last === 0) return "норма";
  const ch = prev > 0 ? (last - prev) / prev : last > 0 ? 1 : 0;
  if (ch >= -0.05) return "норма";
  if (ch >= -0.15) return "риск";
  return "критично";
}

function statusBadgeClass(s: "норма" | "риск" | "критично"): string {
  switch (s) {
    case "норма":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "риск":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "критично":
      return "border-red-200 bg-red-50 text-red-900";
    default:
      return "border-slate-200 bg-slate-50 text-slate-800";
  }
}

type Props = {
  dealsByMonth: DealsByMonth;
  /** План выручки по сегменту (₽); если не задан — отклонение от плана не показывается, статус по динамике месяцев. */
  segmentPlanRub?: Partial<Record<SegmentPresentationKey, number>>;
};

function DealsPresentation({ dealsByMonth, segmentPlanRub }: Props) {
  const analytics = useMemo(() => transformDealsData(dealsByMonth), [dealsByMonth]);
  const rows = analytics.normalizedDeals;
  const totalSum = analytics.totalSum;

  const segmentBlocks = useMemo(() => {
    return DEAL_SEGMENT_KEYS.map((key) => {
      const segRows = rows.filter((r) => r.dealType === key);
      const count = segRows.length;
      const sum = segRows.reduce((s, r) => s + r.sumRub, 0);
      const share = totalSum > 0 ? sum / totalSum : 0;
      const monthSeries = monthSumSeriesForSegment(rows, key);
      const maxM = Math.max(1, ...monthSeries.map((p) => p.sum));
      const plan = segmentPlanRub?.[key];
      const status = segmentStatus(monthSeries, plan, sum);
      const planDeviationPct =
        plan != null && plan > 0 ? ((sum - plan) / plan) * 100 : null;
      return {
        key,
        count,
        sum,
        share,
        monthSeries,
        maxM,
        plan,
        planDeviationPct,
        status,
      };
    });
  }, [rows, totalSum, segmentPlanRub]);

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

  const momDisplay =
    deltaCount != null && deltaPct != null
      ? `${deltaCount >= 0 ? "+" : ""}${numFmt.format(deltaCount)} шт · ${deltaPct >= 0 ? "+" : ""}${pctFmt.format(deltaPct)}%`
      : DEALS_LABEL_EM_DASH;

  const withDelta = useMemo(() => {
    return series.map((row, i) => {
      if (i === 0) {
        return { ...row, delta: null as number | null };
      }
      const p = series[i - 1]!;
      const delta = row.count - p.count;
      return { ...row, delta };
    });
  }, [series]);

  const topNegativeMonths = useMemo(() => {
    return withDelta
      .filter((r) => r.delta != null && r.delta < 0)
      .sort((a, b) => (a.delta! - b.delta!))
      .slice(0, 5);
  }, [withDelta]);

  const maxCount = useMemo(() => Math.max(1, ...series.map((r) => r.count)), [series]);

  const interpretation =
    topNegativeMonths.length > 0
      ? "Снижение связано с падением количества сделок в указанные месяцы."
      : series.length >= 2
        ? "Существенных просадок по месяцам относительно предыдущего периода не выявлено."
        : "Для сравнения динамики по месяцам нужны данные минимум за два месяца.";

  return (
    <div className="mx-auto max-w-4xl space-y-16 px-4 py-10 sm:px-6 lg:px-8">
      <header className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Сделки</h1>
        <p className="mt-2 text-slate-600">Обзор по загруженным данным</p>
      </header>

      <section>
        <h2 className="text-center text-lg font-semibold text-slate-900">Структура продаж по сегментам</h2>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {segmentBlocks.map((b) => (
            <div
              key={b.key}
              className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm ring-1 ring-slate-100"
            >
              <div className="flex items-start justify-between gap-2">
                <MarketingDealSegmentHeader segment={b.key} iconWrapTone="work" labelTone="work" className="min-w-0 flex-1" />
                <span
                  className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClass(b.status)}`}
                >
                  {b.status}
                </span>
              </div>
              <p className="mt-3 text-lg font-semibold tabular-nums leading-tight text-slate-900">
                {numFmt.format(b.count)} шт · {rubFmt.format(b.sum)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Доля выручки: <span className="font-medium text-slate-700">{shareFmt.format(b.share)}</span>
              </p>
              {b.planDeviationPct != null ? (
                <p className="mt-0.5 text-xs text-slate-500">
                  К плану:{" "}
                  <span className={b.planDeviationPct >= 0 ? "font-medium text-emerald-800" : "font-medium text-red-800"}>
                    {b.planDeviationPct >= 0 ? "+" : ""}
                    {pctFmt.format(b.planDeviationPct)}%
                  </span>
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-slate-400">План не задан — статус по динамике месяцев</p>
              )}
              <div className="mt-3 flex h-9 items-end gap-0.5">
                {b.monthSeries.length === 0 ? (
                  <div className="h-1 w-full rounded bg-slate-100" />
                ) : (
                  b.monthSeries.map((p, i) => (
                    <div
                      key={`${b.key}-${p.monthKey}-${i}`}
                      className="min-w-0 flex-1 rounded-sm bg-slate-300/90"
                      style={{
                        height: `${Math.max(4, (p.sum / b.maxM) * 36)}px`,
                      }}
                      title={`${p.monthKey}: ${rubFmt.format(p.sum)}`}
                    />
                  ))
                )}
              </div>
              <p className="mt-1 text-[10px] text-slate-400">Выручка по месяцам</p>
            </div>
          ))}
        </div>
      </section>

      <section className="text-center">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Всего сделок</p>
            <p className="mt-3 text-4xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-5xl">
              {numFmt.format(analytics.totalCount)}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Общая выручка</p>
            <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-4xl">
              {rubFmt.format(analytics.totalSum)}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Средний чек</p>
            <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-4xl">
              {rubFmt.format(avgCheckTotal)}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Δ к предыдущему месяцу</p>
            <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-3xl">
              {momDisplay}
            </p>
            {prevMonthLabel ? (
              <p className="mt-2 text-sm text-slate-500">к месяцу: {prevMonthLabel}</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl text-center">
        <h2 className="text-lg font-semibold text-slate-900">Сделки по месяцам</h2>
        {series.length === 0 ? (
          <p className="mt-8 text-slate-600">Нет месяцев в выгрузке — загрузите JSON сделок.</p>
        ) : (
          <div className="mt-10 flex h-72 items-end justify-center gap-2 px-2 sm:gap-3">
            {series.map((r) => (
              <div key={r.monthKey} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-3">
                <span className="text-sm font-semibold tabular-nums text-slate-800">{numFmt.format(r.count)}</span>
                <div
                  className="w-full max-w-[4rem] rounded-t-lg bg-slate-800"
                  style={{
                    height: `${(r.count / maxCount) * 100}%`,
                    minHeight: r.count > 0 ? 8 : 0,
                  }}
                />
                <span className="text-xs font-medium text-slate-500">{r.chartLabel}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto max-w-xl text-center">
        <h2 className="text-lg font-semibold text-slate-900">Основной вклад в отклонение</h2>
        {topNegativeMonths.length === 0 ? (
          <p className="mt-6 text-slate-600">Отрицательных месяцев к предыдущему периоду нет.</p>
        ) : (
          <ul className="mt-8 space-y-4 text-left sm:text-center">
            {topNegativeMonths.map((r) => (
              <li key={r.monthKey} className="text-lg text-slate-800">
                <span className="font-medium">{r.labelRu}:</span>{" "}
                <span className="tabular-nums text-red-700">
                  −{numFmt.format(Math.abs(r.delta!))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mx-auto max-w-2xl text-center">
        <p className="text-base leading-relaxed text-slate-700">{interpretation}</p>
      </section>

      <section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-slate-50/80 px-8 py-10 text-center">
        <h2 className="text-lg font-semibold text-slate-900">Рекомендации</h2>
        <p className="mt-4 text-sm text-slate-600">Блок для выводов и действий (заполняется вручную или из отчёта).</p>
      </section>
    </div>
  );
}

export { DealsPresentation };
export default DealsPresentation;
