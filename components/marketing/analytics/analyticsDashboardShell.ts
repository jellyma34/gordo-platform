import type { SegmentedControlSurface } from "@/components/marketing/marketingSegmentedControlClasses";

export function analyticsDashboardShellClass(
  presDark: boolean,
  presentation: boolean,
  mplPremium: boolean,
): string {
  if (presDark) {
    return "rounded-[22px] border border-white/10 bg-slate-900/45 shadow-[0_8px_32px_rgba(0,0,0,0.22)] ring-1 ring-indigo-500/10";
  }
  if (mplPremium && presentation) {
    return "rounded-[22px] border border-black/[0.04] bg-gradient-to-br from-white/95 via-white to-indigo-50/35 shadow-[0_12px_32px_rgba(99,102,241,0.08)] ring-1 ring-indigo-100/70";
  }
  return "rounded-[22px] border border-slate-200/70 bg-gradient-to-br from-white via-white to-indigo-50/25 shadow-[0_8px_28px_rgba(15,23,42,0.05)] ring-1 ring-indigo-100/50";
}

export function resolveAnalyticsSegmentSurface(
  presDark: boolean,
  presentation: boolean,
  mplPremium: boolean,
): SegmentedControlSurface {
  if (presDark) return "dark";
  if (mplPremium && presentation) return "premium";
  return "light";
}

/** Компактный второй уровень (комнатность). */
export function analyticsSecondaryRoomPillClass(active: boolean, surface: SegmentedControlSurface): string {
  const base =
    "shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-200 ease-out";
  if (surface === "premium") {
    return active
      ? `${base} bg-indigo-500/12 text-indigo-700 ring-1 ring-indigo-200/80`
      : `${base} bg-white/50 text-slate-500 ring-1 ring-slate-200/60 hover:bg-white/80`;
  }
  if (surface === "dark") {
    return active
      ? `${base} bg-indigo-500/25 text-indigo-100 ring-1 ring-indigo-400/35`
      : `${base} text-slate-400 ring-1 ring-white/10 hover:bg-white/[0.06]`;
  }
  return active
    ? `${base} bg-indigo-50 text-indigo-800 ring-1 ring-indigo-200/90`
    : `${base} text-slate-600 ring-1 ring-slate-200/80 hover:bg-slate-50`;
}

export const ANALYTICS_SECTION_SPACING_CLASS = "my-6";
