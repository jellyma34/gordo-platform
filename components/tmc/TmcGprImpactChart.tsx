"use client";

import { AnalyticsLegendItem, AnalyticsLegendList } from "@/components/construction/AnalyticsLegendItem";
import {
  tmcGprImpactLevelColor,
  type TmcGprImpactMaterialRow,
  type TmcGprImpactStageRow,
} from "@/lib/tmcGprImpact";

const COLORS = {
  deficit: "#f97316",
  plan: "#94a3b8",
  fact: "#22d3ee",
  lag: "#f87171",
} as const;

function fmtPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  if (Number.isInteger(rounded)) return `${Math.round(rounded)}%`;
  return `${rounded.toFixed(1).replace(".", ",")}%`;
}

function fmtDeviation(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded)
    ? String(Math.round(rounded))
    : rounded.toFixed(1).replace(".", ",");
  if (rounded > 0) return `+${text}%`;
  if (rounded < 0) return `${text}%`;
  return "0%";
}

function formatStageCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} этап`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} этапа`;
  return `${count} этапов`;
}

function ImpactBadge({ row }: { row: TmcGprImpactMaterialRow }) {
  const color = tmcGprImpactLevelColor(row.impactLevel);
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[10px] font-semibold leading-snug"
      style={{
        backgroundColor: `${color}22`,
        color,
        border: `1px solid ${color}44`,
      }}
    >
      {row.impactLabel}
    </span>
  );
}

function StageRow({ stage }: { stage: TmcGprImpactStageRow }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-t border-slate-700/25 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_repeat(3,72px)] sm:items-center sm:gap-3">
      <p className="min-w-0 break-words text-[11px] leading-snug text-slate-200 [overflow-wrap:anywhere]">
        {stage.stageLabel}
      </p>
      <div className="flex items-baseline gap-3 sm:contents">
        <span className="text-[10px] tabular-nums text-slate-400 sm:text-right">
          <span className="text-slate-500 sm:hidden">План: </span>
          {fmtPct(stage.planPct)}
        </span>
        <span className="text-[10px] tabular-nums text-slate-400 sm:text-right">
          <span className="text-slate-500 sm:hidden">Факт: </span>
          {fmtPct(stage.factPct)}
        </span>
        <span
          className={`text-[10px] tabular-nums sm:text-right ${
            stage.isLagging ? "font-medium text-rose-300" : "text-slate-400"
          }`}
        >
          <span className="text-slate-500 sm:hidden">Отклонение: </span>
          {fmtDeviation(stage.deviationPct)}
        </span>
      </div>
    </div>
  );
}

function MaterialCard({ row }: { row: TmcGprImpactMaterialRow }) {
  const impactColor = tmcGprImpactLevelColor(row.impactLevel);

  return (
    <article
      className="overflow-hidden rounded-xl border border-slate-600/45 bg-slate-950/35"
      style={{ boxShadow: `inset 3px 0 0 ${impactColor}` }}
    >
      <header className="px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="break-words text-sm font-semibold leading-snug text-slate-50 [overflow-wrap:anywhere]">
              {row.materialName}
              <span className="ml-2 font-bold tabular-nums text-orange-300">
                (дефицит {fmtPct(row.remainingPercent)})
              </span>
            </h4>
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
              <span>
                Связано:{" "}
                <span className="font-semibold tabular-nums text-slate-200">
                  {formatStageCount(row.linkedStageCount)}
                </span>
              </span>
              <span>
                Отстают:{" "}
                <span className="font-semibold tabular-nums text-rose-300">
                  {formatStageCount(row.laggingStageCount)}
                </span>
              </span>
            </p>
          </div>
          <ImpactBadge row={row} />
        </div>
      </header>

      {row.stages.length > 0 ? (
        <div className="border-t border-slate-700/35 bg-slate-950/20">
          <div className="hidden px-3 py-1.5 sm:grid sm:grid-cols-[minmax(0,1fr)_repeat(3,72px)] sm:gap-3">
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Связанные этапы
            </span>
            <span className="text-right text-[10px] font-medium uppercase tracking-wide text-slate-500">
              План
            </span>
            <span className="text-right text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Факт
            </span>
            <span className="text-right text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Откл.
            </span>
          </div>
          {row.stages.map((stage) => (
            <StageRow key={stage.rowKey} stage={stage} />
          ))}
        </div>
      ) : (
        <p className="border-t border-slate-700/35 px-4 py-3 text-[11px] text-slate-500">
          Связанные этапы ГПР не определены
        </p>
      )}
    </article>
  );
}

export function TmcGprImpactChart({ rows }: { rows: TmcGprImpactMaterialRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-xl border border-slate-700/35 bg-slate-950/40 px-6 text-center text-sm text-slate-400">
        Нет материалов с незакрытой потребностью, влияющих на выполнение ГПР
      </div>
    );
  }

  return (
    <div className="w-full min-w-0">
      <p className="mb-3 text-xs text-slate-400">
        Материалов с дефицитом:{" "}
        <span className="font-semibold tabular-nums text-slate-200">{rows.length}</span>
        {" · "}
        с отстающими этапами:{" "}
        <span className="font-semibold tabular-nums text-rose-300">
          {rows.filter((row) => row.laggingStageCount > 0).length}
        </span>
      </p>

      <div className="max-h-[720px] space-y-3 overflow-y-auto pr-1">
        {rows.map((row) => (
          <MaterialCard key={row.materialKey} row={row} />
        ))}
      </div>

      <div className="mt-3 border-t border-slate-700/40 pt-3">
        <AnalyticsLegendList>
          <AnalyticsLegendItem markerColor={COLORS.deficit} label="Дефицит ТМЦ (% незакрытой потребности)" />
          <AnalyticsLegendItem markerColor="#94a3b8" label="Низкое влияние" />
          <AnalyticsLegendItem markerColor="#eab308" label="Среднее влияние" />
          <AnalyticsLegendItem markerColor="#f97316" label="Высокое влияние" />
          <AnalyticsLegendItem markerColor="#ef4444" label="Критическое влияние" />
        </AnalyticsLegendList>
      </div>
    </div>
  );
}
