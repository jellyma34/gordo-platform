/**
 * Единый стиль сегментированных кнопок (разделы маркетинга, «Помесячно» / «Нарастающим итогом»).
 * `premium` — светлая презентация маркетинга: мягкий акцент без сплошной синей плашки.
 */
const BASE =
  "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors";

export type SegmentedControlSurface = "light" | "dark" | "premium";

export function segmentedControlTabClass(active: boolean, surface: SegmentedControlSurface): string {
  if (surface === "premium") {
    if (active) {
      return `${BASE} rounded-full border-0 bg-blue-500/10 text-blue-600 hover:bg-blue-500/15`;
    }
    return `${BASE} rounded-full border border-black/[0.05] bg-white/60 text-slate-500 hover:bg-white/85`;
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
