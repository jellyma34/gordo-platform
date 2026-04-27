import type { HomeProjectStatus, StatusTone } from "@/lib/homeDashboardSnapshot";

const toneDot: Record<StatusTone, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-400",
  red: "bg-rose-500",
};

type Props = {
  project: HomeProjectStatus;
  className?: string;
};

export function ProjectStatus({ project, className = "" }: Props) {
  const { sales, construction, finance } = project;
  const gapStr =
    sales.gapDeals >= 0
      ? `+${sales.gapDeals} сделок к плану`
      : `−${Math.abs(sales.gapDeals)} сделок к плану`;

  const delta = construction.progressDeltaPp;
  const deltaLine =
    delta < 0
      ? `Отставание: ${Math.abs(delta)} п.п.`
      : delta > 0
        ? `Опережение: ${delta} п.п.`
        : "По плану (0 п.п.)";

  return (
    <section
      className={`rounded-xl border border-slate-200/80 bg-white/95 p-4 shadow-sm backdrop-blur-sm md:p-5 ${className}`}
      aria-label="Сводка по направлениям"
    >
      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <div
          className={
            sales.needsAttention
              ? "rounded-lg border border-rose-300/80 bg-rose-50/60 px-3 py-2.5"
              : "rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5"
          }
        >
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Продажи</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{sales.planPercent}%</p>
          <p className="text-sm text-slate-600">{gapStr}</p>
        </div>

        <div
          className={
            construction.needsAttention
              ? "rounded-lg border border-rose-300/80 bg-rose-50/60 px-3 py-2.5"
              : "rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5"
          }
        >
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Строительство</p>
          <div className="mt-1 flex items-baseline gap-2">
            <p className="text-lg font-semibold tabular-nums text-slate-900">
              {construction.factPercent}%
            </p>
            <span
              className={`inline-block h-2 w-2 shrink-0 rounded-full ${toneDot[construction.status]}`}
              title={construction.status}
            />
          </div>
          <p className="mt-0.5 text-sm tabular-nums text-slate-600">
            План: {construction.plannedPercentAtDate}% · Факт: {construction.factPercent}%
          </p>
          <p className="mt-0.5 text-sm text-slate-600">{deltaLine}</p>
        </div>

        <div
          className={
            finance.needsAttention
              ? "rounded-lg border border-rose-300/80 bg-rose-50/60 px-3 py-2.5"
              : "rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5"
          }
        >
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Финансы</p>
          <p className="mt-1 text-sm font-medium leading-snug text-slate-900">{finance.statusLabel}</p>
        </div>
      </div>
    </section>
  );
}
