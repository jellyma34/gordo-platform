"use client";

import { useMemo, useState } from "react";
import type { TMCItem } from "@/lib/tmcData";
import type { ConstructionObjectScope, GPRTask } from "@/lib/gprUtils";
import {
  buildGprTmcWorkLifecycleTimeline,
  buildTmcRequestVsGprRows,
  constructionScopeToPlanFactPartKey,
  formatTmcIsoRu,
  summarizeTmcRequestVsGpr,
  type TmcRequestVsGprRow,
  type TmcRequestVsGprStatus,
  type TmcSupplyChainStatus,
} from "@/lib/tmcProcurementAnalytics";
import type { PlanFactTasksBarLevel } from "@/lib/planFactWorkTypeTimeline";
import { segmentedControlTabClass } from "@/components/marketing/marketingSegmentedControlClasses";
import {
  TmcGprWorkStartByCodeChart,
  TmcGprWorkStartByCodeLegend,
} from "@/components/tmc/TmcGprWorkStartByCodeChart";

type StatusFilter = "all" | TmcRequestVsGprStatus;

function statusToneClass(status: TmcSupplyChainStatus): string {
  if (status === "on_time") return "bg-emerald-500/15 text-emerald-300";
  if (
    status === "request_late" ||
    status === "contract_late" ||
    status === "not_supplied" ||
    status === "missing_overdue"
  ) {
    return "bg-rose-500/15 text-rose-300";
  }
  if (status === "deadline_pending") return "bg-slate-500/20 text-slate-300";
  return "bg-slate-600/30 text-slate-400";
}

function matchesFilter(row: { filterStatus: TmcRequestVsGprStatus }, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  return row.filterStatus === filter;
}

function matchesSearch(haystack: string[], q: string): boolean {
  if (!q) return true;
  return haystack.join(" ").toLowerCase().includes(q);
}

export function TmcRequestVsGprTimingBlock({
  items,
  gprTasks = [],
  objectScope = 1,
  reportDate = new Date(),
}: {
  items: TMCItem[];
  gprTasks?: GPRTask[];
  objectScope?: ConstructionObjectScope;
  reportDate?: Date;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [barLevel, setBarLevel] = useState<PlanFactTasksBarLevel>("detailed");

  const allRows = useMemo(
    () => buildTmcRequestVsGprRows(items, reportDate, gprTasks),
    [items, reportDate, gprTasks],
  );

  const kpiSummary = useMemo(() => summarizeTmcRequestVsGpr(allRows), [allRows]);

  const partKey = useMemo(
    () => constructionScopeToPlanFactPartKey(objectScope),
    [objectScope],
  );

  const chartRowsAll = useMemo(
    () =>
      buildGprTmcWorkLifecycleTimeline({
        gprTasks,
        tmcItems: items,
        barLevel,
        partKey,
        reportDate,
      }),
    [gprTasks, items, barLevel, partKey, reportDate],
  );

  const visibleTableRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((row) => {
      if (!matchesFilter(row, statusFilter)) return false;
      return matchesSearch([row.itemCode, row.stage, row.name, row.workName ?? ""], q);
    });
  }, [allRows, statusFilter, search]);

  const visibleChartRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return chartRowsAll.filter((row) => {
      if (!matchesFilter(row, statusFilter)) return false;
      return matchesSearch([row.code, row.workName, row.tmcNames], q);
    });
  }, [chartRowsAll, statusFilter, search]);

  const filters: { id: StatusFilter; label: string }[] = [
    { id: "all", label: "Все" },
    { id: "late", label: "Опоздание" },
    { id: "on_time", label: "Успели" },
    { id: "missing_overdue", label: "Не подано в срок" },
    { id: "deadline_pending", label: "Срок не наступил" },
  ];

  return (
    <div
      className="rounded-2xl border border-slate-600/45 bg-[#1e293b] p-6 shadow-[0_18px_48px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/[0.06]"
      data-pdf-chart-block
      data-pdf-section-title="Динамика поставки материала"
      style={{
        background: "linear-gradient(160deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.95) 100%)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-50">Динамика поставки материала</h3>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Контроль обеспечения ТМЦ относительно графика производства работ ГПР
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-slate-600/35 bg-slate-950/25 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold text-slate-50">Обеспечение ГПР материалами</h4>
            <p className="mt-0.5 text-sm text-slate-400">
              Крайний срок заказа → подача заявки → договор → начало работ ГПР
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div
              className="rounded-lg border border-slate-600/50 bg-slate-900/55 px-3 py-1.5"
              title="Средняя просрочка подачи заказа по просроченным позициям"
            >
              <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                Средняя просрочка
              </div>
              <div className="text-sm font-bold tabular-nums text-rose-300">
                {kpiSummary.averageLateDays > 0 ? `${kpiSummary.averageLateDays} дн.` : "—"}
              </div>
            </div>
            <div className="inline-flex rounded-lg border border-slate-600/70 bg-slate-900/50 p-0.5">
              {(
                [
                  { id: "simplified" as const, label: "Упрощённо" },
                  { id: "detailed" as const, label: "Детально" },
                  { id: "full" as const, label: "Все этапы" },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setBarLevel(m.id)}
                  className={segmentedControlTabClass(barLevel === m.id, "dark")}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {chartRowsAll.length === 0 ? (
          <div className="mt-6 flex h-[280px] items-center justify-center text-sm text-slate-500">
            Нет данных для timeline — проверьте связь ТМЦ с кодами работ ГПР
          </div>
        ) : visibleChartRows.length === 0 ? (
          <div className="mt-6 flex h-[160px] items-center justify-center text-sm text-slate-500">
            Нет позиций для отображения по текущему фильтру
          </div>
        ) : (
          <>
            <div className="mt-3 w-full min-w-0 overflow-x-auto">
              <TmcGprWorkStartByCodeChart rows={visibleChartRows} reportDate={reportDate} />
            </div>
            <div className="mt-3 border-t border-slate-700/40 pt-3">
              <TmcGprWorkStartByCodeLegend />
            </div>
          </>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap rounded-lg border border-slate-600/70 bg-slate-900/50 p-0.5">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={segmentedControlTabClass(statusFilter === f.id, "dark")}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск: ID Код, этап, ТМЦ"
          className="min-w-[220px] flex-1 rounded-lg border border-slate-600/70 bg-slate-950/55 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
        />
      </div>

      <div className="mt-4 max-h-[480px] overflow-auto rounded-xl border border-slate-600/35">
        <table className="w-full min-w-[1400px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-[1] bg-slate-950/95 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2.5">ID код</th>
              <th className="px-3 py-2.5">Наименование ТМЦ</th>
              <th className="px-3 py-2.5">Этап работ ГПР</th>
              <th className="px-3 py-2.5">Крайний срок подачи</th>
              <th className="px-3 py-2.5">Факт подачи</th>
              <th className="px-3 py-2.5">План договора</th>
              <th className="px-3 py-2.5">Факт договора</th>
              <th className="px-3 py-2.5">План начала ГПР</th>
              <th className="px-3 py-2.5">Факт начала ГПР</th>
              <th className="px-3 py-2.5">Статус</th>
            </tr>
          </thead>
          <tbody>
            {visibleTableRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-sm text-slate-500">
                  Нет позиций для отображения по текущему фильтру
                </td>
              </tr>
            ) : (
              visibleTableRows.map((row: TmcRequestVsGprRow) => (
                <tr key={row.id} className="border-t border-slate-700/40 text-slate-300">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-slate-200">
                    {row.itemCode || "—"}
                  </td>
                  <td className="max-w-[180px] px-3 py-2 font-medium text-slate-100">
                    <span className="line-clamp-2">{row.name || "—"}</span>
                  </td>
                  <td className="max-w-[160px] px-3 py-2">
                    <span className="line-clamp-2">{row.workName || row.stage || "—"}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                    {formatTmcIsoRu(row.requestDeadlineDate)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                    {formatTmcIsoRu(row.requestFactDate)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                    {formatTmcIsoRu(row.contractPlanDate)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                    {formatTmcIsoRu(row.contractFactDate)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                    {formatTmcIsoRu(row.gprStartDate)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                    {formatTmcIsoRu(row.gprFactStartDate)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold ${statusToneClass(row.status)}`}
                    >
                      {row.statusLabel}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
