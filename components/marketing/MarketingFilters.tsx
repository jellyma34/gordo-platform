"use client";

import type { MarketingObjectOption } from "@/lib/marketingMockData";
import { useMarketingPresentationLight } from "@/components/marketing/marketingPresentationLightContext";
import { MPL_PREMIUM_FILTER_SELECT_10 } from "@/lib/marketingPremiumUi";

export type MarketingPeriodGranularity = "month" | "quarter";

type Props = {
  presentation: boolean;
  period: MarketingPeriodGranularity;
  onPeriodChange: (p: MarketingPeriodGranularity) => void;
  objectId: string;
  onObjectIdChange: (id: string) => void;
  objects: MarketingObjectOption[];
  /** Если false — блок «Период» скрыт. */
  showPeriod?: boolean;
};

const selectPresentationDark =
  "h-8 min-w-[10rem] rounded-lg border border-slate-600/70 bg-slate-900/60 px-2.5 text-xs text-slate-100";
const selectPresentationLight = MPL_PREMIUM_FILTER_SELECT_10;
const selectEdit =
  "h-9 min-w-[10rem] rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900";
const labelCls = (p: boolean, mplLight: boolean) =>
  p
    ? mplLight
      ? "text-[11px] font-medium text-mpl-muted"
      : "text-[11px] font-medium text-slate-500"
    : "text-xs font-medium text-slate-500";

export function MarketingFilters({
  presentation,
  period,
  onPeriodChange,
  objectId,
  onObjectIdChange,
  objects,
  showPeriod = true,
}: Props) {
  const mplLight = useMarketingPresentationLight();
  const sel = presentation ? (mplLight ? selectPresentationLight : selectPresentationDark) : selectEdit;
  return (
    <div className="flex flex-wrap items-end gap-3">
      {showPeriod ? (
        <label className="flex flex-col gap-1">
          <span className={labelCls(presentation, mplLight)}>Период</span>
          <select
            value={period}
            onChange={(e) => onPeriodChange(e.target.value as MarketingPeriodGranularity)}
            className={sel}
          >
            <option value="month">Месяц</option>
            <option value="quarter">Квартал</option>
          </select>
        </label>
      ) : null}
      <label className="flex min-w-[12rem] flex-col gap-1">
        <span className={labelCls(presentation, mplLight)}>Объект / ЖК</span>
        <select value={objectId} onChange={(e) => onObjectIdChange(e.target.value)} className={sel}>
          {objects.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
