"use client";

import type { MarketingDealTypeOption, MarketingObjectOption } from "@/lib/marketingMockData";

export type MarketingPeriodGranularity = "month" | "quarter";

type Props = {
  presentation: boolean;
  period: MarketingPeriodGranularity;
  onPeriodChange: (p: MarketingPeriodGranularity) => void;
  objectId: string;
  onObjectIdChange: (id: string) => void;
  dealTypeId: string;
  onDealTypeIdChange: (id: string) => void;
  objects: MarketingObjectOption[];
  dealTypes: MarketingDealTypeOption[];
};

const selectPresentation =
  "h-8 min-w-[10rem] rounded-lg border border-slate-600/70 bg-slate-900/60 px-2.5 text-xs text-slate-100";
const selectEdit =
  "h-9 min-w-[10rem] rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900";
const labelCls = (p: boolean) =>
  p ? "text-[11px] font-medium uppercase tracking-wide text-slate-500" : "text-xs font-medium text-slate-600";

export function MarketingFilters({
  presentation,
  period,
  onPeriodChange,
  objectId,
  onObjectIdChange,
  dealTypeId,
  onDealTypeIdChange,
  objects,
  dealTypes,
}: Props) {
  const sel = presentation ? selectPresentation : selectEdit;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className={labelCls(presentation)}>Период</span>
        <select
          value={period}
          onChange={(e) => onPeriodChange(e.target.value as MarketingPeriodGranularity)}
          className={sel}
        >
          <option value="month">Месяц</option>
          <option value="quarter">Квартал</option>
        </select>
      </label>
      <label className="flex min-w-[12rem] flex-col gap-1">
        <span className={labelCls(presentation)}>Объект / ЖК</span>
        <select value={objectId} onChange={(e) => onObjectIdChange(e.target.value)} className={sel}>
          {objects.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-[10rem] flex-col gap-1">
        <span className={labelCls(presentation)}>Тип сделки</span>
        <select value={dealTypeId} onChange={(e) => onDealTypeIdChange(e.target.value)} className={sel}>
          {dealTypes.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
