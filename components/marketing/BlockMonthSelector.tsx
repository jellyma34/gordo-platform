"use client";

import { useMemo } from "react";

import {
  MPL_PREMIUM_FILTER_SELECT_12,
  MPL_PREMIUM_FILTER_SELECT_95,
} from "@/lib/marketingPremiumUi";
import { MARKETING_BLOCK_REPORTING_MONTH_LABEL } from "@/lib/marketingBlockLabels";

export { MARKETING_BLOCK_REPORTING_MONTH_LABEL };

function monthKeyLabelRu(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
    return new Date(y, m - 1, 1).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  }
  return monthKey;
}

export type BlockMonthSelectorOption = {
  value: string;
  label?: string;
};

export function BlockMonthSelector({
  value,
  options,
  onChange,
  presDark,
  presentation,
  mplPremium,
  label = MARKETING_BLOCK_REPORTING_MONTH_LABEL,
  selectMinWidthPx = 190,
  disabled = false,
  className = "",
}: {
  value: string;
  options: readonly (string | BlockMonthSelectorOption)[];
  onChange: (monthKey: string) => void;
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
  label?: string;
  selectMinWidthPx?: number;
  disabled?: boolean;
  className?: string;
}) {
  const normalized = useMemo(() => {
    const seen = new Set<string>();
    const out: BlockMonthSelectorOption[] = [];
    for (const opt of options) {
      const o = typeof opt === "string" ? { value: opt } : opt;
      const v = (o.value ?? "").trim();
      if (!v || seen.has(v)) continue;
      seen.add(v);
      out.push({ value: v, label: o.label ?? monthKeyLabelRu(v) });
    }
    out.sort((a, b) => a.value.localeCompare(b.value));
    return out;
  }, [options]);

  const selectCls = presentation
    ? mplPremium
      ? MPL_PREMIUM_FILTER_SELECT_12
      : "h-8 rounded-lg border border-slate-600/70 bg-slate-900/60 px-2.5 text-xs text-slate-100"
    : presDark
      ? "h-9 rounded-lg border border-slate-600 bg-slate-900 px-2.5 text-sm text-slate-100"
      : "h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900";

  const filterLabelCls = presentation
    ? mplPremium
      ? "text-[11px] font-medium uppercase tracking-wide text-mpl-muted"
      : "text-[11px] font-medium uppercase tracking-wide text-slate-500"
    : presDark
      ? "text-xs font-medium text-slate-400"
      : "text-xs font-medium text-slate-600";

  const effectiveSelectCls =
    presentation && mplPremium && selectMinWidthPx <= 160 ? MPL_PREMIUM_FILTER_SELECT_95 : selectCls;

  return (
    <label className={`flex flex-col gap-1 ${className}`.trim()}>
      <span className={filterLabelCls}>{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={effectiveSelectCls}
        style={{ minWidth: selectMinWidthPx }}
      >
        {normalized.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label ?? o.value}
          </option>
        ))}
      </select>
    </label>
  );
}

