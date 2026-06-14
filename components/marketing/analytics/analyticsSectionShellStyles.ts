import { MPL_PREMIUM_CHART_SHELL } from "@/lib/marketingPremiumUi";

/** Оболочка секции аналитики (как «Рассрочки ДДУ» / выбытие / динамика ₽/м²). */
export function analyticsMarketingSectionShellClass(
  presDark: boolean,
  presentation: boolean,
  mplPremium: boolean,
): string {
  const shellPad = presentation ? "p-5 sm:p-6" : "p-4 sm:p-5";
  if (presDark) {
    return `overflow-visible rounded-2xl border border-slate-700/55 bg-[#1e293b] shadow-[0_8px_28px_rgba(0,0,0,0.2)] ${shellPad}`;
  }
  if (presentation && mplPremium) {
    return `overflow-visible ${shellPad} ${MPL_PREMIUM_CHART_SHELL}`;
  }
  if (presentation) {
    return `overflow-visible rounded-2xl border border-mpl-border bg-mpl-chart shadow-[0_4px_22px_rgba(15,23,42,0.05)] ${shellPad}`;
  }
  return `overflow-visible rounded-2xl border border-slate-200/70 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.04)] ${shellPad}`;
}

export function analyticsMarketingInnerCardClass(presDark: boolean): string {
  return presDark
    ? "rounded-xl border border-slate-700/50 bg-slate-900/35 p-4 sm:p-5"
    : "rounded-xl border border-slate-200/70 bg-slate-50/40 p-4 sm:p-5";
}

export const ANALYTICS_MARKETING_CHART_HEIGHT_PX = 280;
