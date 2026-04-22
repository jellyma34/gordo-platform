/**
 * Единый стиль сегментированных кнопок (разделы маркетинга, «Помесячно» / «Нарастающим итогом»).
 * `premium` — светлая презентация маркетинга (мягкое стекло + градиент активной).
 */
const BASE =
  "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors";

export type SegmentedControlSurface = "light" | "dark" | "premium";

export function segmentedControlTabClass(active: boolean, surface: SegmentedControlSurface): string {
  if (surface === "premium") {
    if (active) {
      return `${BASE} rounded-full border-0 bg-gradient-to-br from-[#4f6bff] to-[#6c8cff] text-white shadow-[0_6px_16px_rgba(79,107,255,0.25)] hover:opacity-95`;
    }
    return `${BASE} rounded-full border border-black/[0.05] bg-white/60 text-[#374151] hover:bg-white/85`;
  }
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
