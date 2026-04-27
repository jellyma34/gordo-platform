"use client";

import { segmentedControlTabClass } from "@/components/marketing/marketingSegmentedControlClasses";

export type ConstructionPeriodFilter = "month" | "quarter";
export type ConstructionTypeFilter = "all" | "plan" | "fact";

const selectDark =
  "h-8 min-w-[10rem] rounded-lg border border-slate-600/70 bg-slate-900/60 px-2.5 text-xs text-slate-100";
const labelCls = "text-[11px] font-medium uppercase tracking-wide text-slate-500";

/** Короткие подписи для сегмента «Объект» (две части проекта). */
const OBJECT_SEGMENTS: { id: number; label: string }[] = [
  { id: 1, label: "Жилой дом" },
  { id: 2, label: "Автостоянка" },
];

type Props = {
  period: ConstructionPeriodFilter;
  onPeriodChange: (p: ConstructionPeriodFilter) => void;
  activePartId: number;
  onPartIdChange: (partId: number) => void;
  typeFilter: ConstructionTypeFilter;
  onTypeFilterChange: (t: ConstructionTypeFilter) => void;
};

export function ConstructionPresentationFilters({
  period,
  onPeriodChange,
  activePartId,
  onPartIdChange,
  typeFilter,
  onTypeFilterChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className={labelCls}>Период</span>
        <select
          value={period}
          onChange={(e) => onPeriodChange(e.target.value as ConstructionPeriodFilter)}
          className={selectDark}
        >
          <option value="month">Месяц</option>
          <option value="quarter">Квартал</option>
        </select>
      </label>

      <div className="flex flex-col gap-1">
        <span className={labelCls}>Объект</span>
        <div className="inline-flex rounded-lg border border-slate-600/70 bg-slate-900/50 p-0.5">
          {OBJECT_SEGMENTS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onPartIdChange(o.id)}
              className={segmentedControlTabClass(activePartId === o.id, "dark")}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <label className="flex min-w-[10rem] flex-col gap-1">
        <span className={labelCls}>Тип</span>
        <select
          value={typeFilter}
          onChange={(e) => onTypeFilterChange(e.target.value as ConstructionTypeFilter)}
          className={selectDark}
        >
          <option value="all">Все</option>
          <option value="plan">План</option>
          <option value="fact">Факт</option>
        </select>
      </label>
    </div>
  );
}
