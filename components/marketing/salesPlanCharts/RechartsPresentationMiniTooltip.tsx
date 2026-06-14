"use client";

type MiniPayload = { value?: unknown; dataKey?: unknown; name?: unknown };

export type RechartsPresentationMiniTooltipOptions = {
  /** Взять точку из payload с этим dataKey (например «ddu», «execPct») */
  dataKey?: string;
};

/** Контент для Recharts Tooltip в режиме презентации: только подпись категории и одно число. */
export function rechartsPresentationMiniTooltip(
  formatValue: (n: number) => string,
  options?: RechartsPresentationMiniTooltipOptions,
) {
  return function RechartsPresentationMiniTooltipContent({
    active,
    label,
    payload,
  }: {
    active?: boolean;
    label?: unknown;
    payload?: ReadonlyArray<MiniPayload>;
  }) {
    if (!active || !payload?.length) return null;
    let item: MiniPayload | undefined;
    if (options?.dataKey) {
      const key = options.dataKey;
      item = payload.find((p) => String(p.dataKey) === key || String(p.name) === key);
    }
    if (item == null) {
      item = payload[payload.length - 1];
    }
    const v = item?.value;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return null;
    return (
      <div className="pointer-events-none rounded-md border border-slate-500/35 bg-[#0f172a]/96 px-2 py-1 shadow-md">
        <div className="max-w-[12rem] truncate text-[9px] font-semibold text-slate-50">{label != null ? String(label) : ""}</div>
        <div className="mt-0.5 text-[9px] tabular-nums text-slate-200">{formatValue(n)}</div>
      </div>
    );
  };
}
