/**
 * Единый стиль сегментированных кнопок (разделы маркетинга, «Помесячно» / «Нарастающим итогом»).
 * Активная — #2563EB, неактивная — обводка #D1D5DB, hover — #1D4ED8 + белый текст.
 */
const BASE =
  "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors";

export type SegmentedControlSurface = "light" | "dark";

export function segmentedControlTabClass(active: boolean, surface: SegmentedControlSurface): string {
  if (surface === "dark") {
    if (active) {
      return `${BASE} border-0 bg-[#2563EB] text-white hover:bg-[#1D4ED8]`;
    }
    return `${BASE} border border-solid border-slate-500/75 bg-transparent text-slate-200 hover:bg-[#1D4ED8] hover:text-white`;
  }
  if (active) {
    return `${BASE} border-0 bg-[#2563EB] text-white hover:bg-[#1D4ED8]`;
  }
  return `${BASE} border border-solid border-[#D1D5DB] bg-transparent text-[#374151] hover:bg-[#1D4ED8] hover:text-white`;
}
