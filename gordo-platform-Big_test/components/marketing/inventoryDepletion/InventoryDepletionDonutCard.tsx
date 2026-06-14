"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "@/components/charting/rechartsClient";
import type { InventoryDepletionDonutSlice } from "@/lib/inventoryDepletionFromDeals";

type Props = {
  slice: InventoryDepletionDonutSlice;
  presDark: boolean;
};

export function InventoryDepletionDonutCard({ slice, presDark }: Props) {
  const cardCls = presDark
    ? "flex min-h-[220px] flex-col rounded-xl border border-slate-700/55 bg-slate-800/40 p-4 shadow-sm"
    : "flex min-h-[220px] flex-col rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 shadow-sm";
  const titleCls = presDark ? "text-slate-100" : "text-slate-900";
  const statCls = presDark ? "text-slate-200" : "text-slate-800";
  const mutedCls = presDark ? "text-slate-400" : "text-slate-500";
  const pctCls = presDark ? "text-slate-100" : "text-slate-900";

  const hasInventory = slice.initialSupply > 0 || slice.sold > 0;

  return (
    <article className={cardCls} data-depletion-segment={slice.id}>
      <h4 className={`text-center text-xs font-semibold tracking-tight ${titleCls}`}>{slice.label}</h4>

      <div className="relative mx-auto mt-2 h-[108px] w-full max-w-[140px]">
        {hasInventory ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slice.pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="58%"
                outerRadius="88%"
                paddingAngle={slice.pieData.length > 1 ? 2 : 0}
                stroke="none"
              >
                {slice.pieData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div
            className={`flex h-full items-center justify-center rounded-full border border-dashed text-[10px] ${presDark ? "border-slate-600 text-slate-500" : "border-slate-300 text-slate-400"}`}
          >
            —
          </div>
        )}
        {slice.depletionPct != null ? (
          <div
            className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center ${pctCls}`}
          >
            <span className="text-lg font-bold tabular-nums leading-none">{slice.depletionPct.toFixed(0)}%</span>
            <span className={`mt-0.5 text-[9px] font-medium uppercase tracking-wide ${mutedCls}`}>выбытие</span>
          </div>
        ) : null}
      </div>

      <dl className={`mt-3 space-y-1 text-[11px] tabular-nums ${statCls}`}>
        <div className="flex items-center justify-between gap-2">
          <dt className={mutedCls}>Продано</dt>
          <dd className="font-semibold">{slice.sold}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className={mutedCls}>Остаток</dt>
          <dd className="font-semibold">{slice.remaining}</dd>
        </div>
      </dl>
    </article>
  );
}
