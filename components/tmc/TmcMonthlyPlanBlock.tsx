"use client";

import { useMemo } from "react";
import { TmcMaterialCell } from "@/components/tmc/TmcMaterialCell";
import type { TMCItem } from "@/lib/tmcData";
import {
  buildTmcMonthlyPlanAnalytics,
  type TmcMonthlyPlanNextMonthRow,
  type TmcMonthlyPlanOverdueRow,
  type TmcMonthlyPlanPriority,
} from "@/lib/tmcMonthlyPlanAnalytics";

const TABLE_BODY_MAX_H = "min(320px, 42vh)";

function formatPlanDateRu(iso: string): string {
  if (!iso?.trim()) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

function priorityClass(priority: TmcMonthlyPlanPriority): string {
  return priority === "high"
    ? "font-semibold text-rose-400"
    : "font-medium text-amber-300/90";
}

function ViewAllFooter({ accent }: { accent: "sky" | "rose" }) {
  const hover =
    accent === "sky" ? "hover:text-sky-300" : "hover:text-rose-300";
  return (
    <div className="border-t border-slate-700/40 px-3 py-2.5">
      <button
        type="button"
        className={`text-[11px] font-medium text-slate-400 transition-colors ${hover}`}
      >
        Смотреть все →
      </button>
    </div>
  );
}

function NextMonthTable({ rows }: { rows: TmcMonthlyPlanNextMonthRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="px-3 py-6">
        <p className="text-center text-[12px] text-slate-500">Нет позиций для закупки</p>
      </div>
    );
  }

  return (
    <div className="overflow-auto pb-1" style={{ maxHeight: TABLE_BODY_MAX_H }}>
      <table className="w-full table-fixed border-collapse text-left text-[11px]">
        <colgroup>
          <col className="w-[12%]" />
          <col className="w-[32%]" />
          <col className="w-[20%]" />
          <col className="w-[20%]" />
          <col className="w-[16%]" />
        </colgroup>
        <thead className="sticky top-0 z-[1] bg-slate-950/95 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-3 py-2 font-semibold">ID</th>
            <th className="px-3 py-2 font-semibold">Материал</th>
            <th className="whitespace-nowrap px-3 py-2 font-semibold">V, ПОСТАВКИ</th>
            <th className="px-3 py-2 font-semibold">Плановая дата</th>
            <th className="px-3 py-2 font-semibold">Статус</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-slate-700/35 text-slate-300">
              <td className="truncate px-3 py-2 align-top tabular-nums text-sky-300/90">
                {row.workId}
              </td>
              <td className="px-3 py-2 align-middle font-medium text-slate-100">
                <TmcMaterialCell name={row.name} />
              </td>
              <td className="truncate px-3 py-2 align-top tabular-nums text-slate-300">
                {row.quantityLabel}
              </td>
              <td className="truncate px-3 py-2 align-top tabular-nums text-slate-300">
                {formatPlanDateRu(row.planDate)}
              </td>
              <td className="px-3 py-2 align-top text-slate-400">
                <span className="line-clamp-2 break-words">{row.statusLabel}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OverdueTable({ rows }: { rows: TmcMonthlyPlanOverdueRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="px-3 py-6">
        <p className="text-center text-[12px] text-slate-500">Просроченных позиций нет</p>
      </div>
    );
  }

  return (
    <div className="overflow-auto pb-1" style={{ maxHeight: TABLE_BODY_MAX_H }}>
      <table className="w-full table-fixed border-collapse text-left text-[11px]">
        <colgroup>
          <col className="w-[12%]" />
          <col className="w-[32%]" />
          <col className="w-[20%]" />
          <col className="w-[18%]" />
          <col className="w-[18%]" />
        </colgroup>
        <thead className="sticky top-0 z-[1] bg-slate-950/95 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-3 py-2 font-semibold">ID</th>
            <th className="px-3 py-2 font-semibold">Материал</th>
            <th className="px-3 py-2 font-semibold">Плановая дата</th>
            <th className="px-3 py-2 font-semibold">Просрочка</th>
            <th className="px-3 py-2 font-semibold">Приоритет</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-rose-900/25 text-slate-300">
              <td className="truncate px-3 py-2 align-top tabular-nums text-slate-200">
                {row.workId}
              </td>
              <td className="px-3 py-2 align-middle font-medium text-slate-100">
                <TmcMaterialCell name={row.name} />
              </td>
              <td className="truncate px-3 py-2 align-top tabular-nums text-slate-400">
                {formatPlanDateRu(row.planDate)}
              </td>
              <td
                className={`truncate px-3 py-2 align-top tabular-nums font-semibold ${
                  row.overdueDays >= 14 ? "text-rose-400" : "text-rose-300"
                }`}
              >
                {row.overdueLabel}
              </td>
              <td className={`truncate px-3 py-2 align-top ${priorityClass(row.priority)}`}>
                {row.priorityLabel}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TmcMonthlyPlanBlock({
  items,
  reportDate = new Date(),
  remainingItemIds,
}: {
  items: TMCItem[];
  reportDate?: Date;
  /**
   * ID остатка из `buildTmcMetrics().deliveries` — тот же набор, что KPI «В работе».
   * Если не передан, считается внутри analytics.
   */
  remainingItemIds?: string[];
}) {
  const analytics = useMemo(
    () =>
      buildTmcMonthlyPlanAnalytics(items, reportDate, {
        remainingItemIds,
        logDiagnostic: process.env.NODE_ENV === "development",
      }),
    [items, reportDate, remainingItemIds],
  );

  return (
    <div
      className="overflow-hidden rounded-2xl border border-slate-600/45 bg-[#1e293b] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/[0.06] sm:p-6"
      data-pdf-chart-block
      data-pdf-section-title="План на месяц"
      style={{
        background:
          "linear-gradient(160deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.95) 100%)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold uppercase tracking-wide text-slate-50">
            План на месяц
          </h3>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2.5">
          <div className="min-w-[112px] rounded-xl border border-sky-500/35 bg-sky-950/30 px-3.5 py-2">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-sky-400/90">
              Следующий месяц
            </div>
            <div className="mt-0.5 text-2xl font-extrabold tabular-nums leading-none text-sky-300">
              {analytics.nextMonthCount}
            </div>
          </div>
          <div className="min-w-[112px] rounded-xl border border-rose-500/40 bg-rose-950/35 px-3.5 py-2">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-rose-400/90">
              Просрочено
            </div>
            <div className="mt-0.5 text-2xl font-extrabold tabular-nums leading-none text-rose-400">
              {analytics.overdueCount}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <div className="flex h-auto min-w-0 flex-col overflow-hidden rounded-xl border border-sky-500/25 bg-slate-950/45">
          <div className="border-b border-sky-500/20 bg-sky-950/35 px-3 py-2.5">
            <h4 className="text-[11px] font-semibold uppercase leading-snug tracking-wider text-sky-300">
              Нужно закупить в следующем месяце
            </h4>
          </div>
          <NextMonthTable rows={analytics.nextMonthRows} />
          <ViewAllFooter accent="sky" />
        </div>

        <div className="flex h-auto min-w-0 flex-col overflow-hidden rounded-xl border border-rose-500/30 bg-slate-950/45">
          <div className="border-b border-rose-500/25 bg-rose-950/40 px-3 py-2.5">
            <h4 className="text-[11px] font-semibold uppercase leading-snug tracking-wider text-rose-300">
              Не закуплено в срок
            </h4>
          </div>
          <OverdueTable rows={analytics.overdueRows} />
          <ViewAllFooter accent="rose" />
        </div>
      </div>
    </div>
  );
}
