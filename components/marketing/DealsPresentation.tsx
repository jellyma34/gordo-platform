"use client";

import { useMemo } from "react";

import {
  buildDealsMonthSeries,
  DEALS_EMPTY_LABEL,
  transformDealsData,
  type DealsByMonth,
} from "./DealsSection";

const numFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const pctFmt = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const rubFmt = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });

type Props = {
  dealsByMonth: DealsByMonth;
};

function DealsPresentation({ dealsByMonth }: Props) {
  const analytics = useMemo(() => transformDealsData(dealsByMonth), [dealsByMonth]);

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
      : DEALS_EMPTY_LABEL;

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
          <p className="mt-8 text-slate-600">{DEALS_EMPTY_LABEL}</p>
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
