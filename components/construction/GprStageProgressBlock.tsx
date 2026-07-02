"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PDF_CHART_BLOCK_ATTR, PDF_SECTION_TITLE_ATTR } from "@/lib/pdf/constructionPdfConstants";
import {
  buildGprStageProgressModel,
  GPR_WORK_HEATMAP_META,
  GPR_WORK_HEATMAP_STATUS_ORDER,
  gprWorkProgressBarColor,
  type GprStageProgressStageRow,
  type GprStageProgressWorkCell,
  type GprWorkHeatmapStatus,
} from "@/lib/gprStageProgress";
import type { GPRTask } from "@/lib/gprUtils";

const COLORS = {
  green: "#22c55e",
  red: "#ef4444",
  gray: "#94a3b8",
  card: "#1e293b",
} as const;

const HEATMAP_CELL_PX = 14;
const HEATMAP_GAP_PX = 4;

type GprStageProgressBlockProps = {
  tasks: GPRTask[];
  branchRoots: readonly string[];
  asOf: Date;
  reportDateLabel?: string;
};

function heatmapCellStyle(status: GprWorkHeatmapStatus): CSSProperties {
  const meta = GPR_WORK_HEATMAP_META[status];
  return {
    width: HEATMAP_CELL_PX,
    height: HEATMAP_CELL_PX,
    backgroundColor: meta.color,
    ...(status === "excluded"
      ? {
          backgroundImage:
            "repeating-linear-gradient(135deg, rgba(255,255,255,0.14) 0 1px, transparent 1px 4px)",
        }
      : {}),
  };
}

/** Плотная лента квадратов: один квадрат = одна работа, порядок как в календарном ГПР. */
function HeatmapStrip({
  cells,
  className = "",
}: {
  cells: GprStageProgressWorkCell[];
  className?: string;
}) {
  if (cells.length === 0) {
    return <span className="text-xs text-slate-500">—</span>;
  }

  return (
    <div
      className={`flex min-w-0 flex-wrap items-center ${className}`.trim()}
      style={{ gap: HEATMAP_GAP_PX }}
      role="img"
      aria-label={`Тепловая матрица: ${cells.length} работ`}
    >
      {cells.map((cell) => {
        const meta = GPR_WORK_HEATMAP_META[cell.status];
        const taskName = cell.task.name.trim() || cell.task.code;
        return (
          <span
            key={cell.task.globalTaskId ?? cell.task.id}
            className="inline-block shrink-0 rounded-[2px] ring-1 ring-inset ring-black/10"
            style={heatmapCellStyle(cell.status)}
            title={`${taskName} — ${meta.label}`}
            aria-label={`${taskName}: ${meta.label}`}
          />
        );
      })}
    </div>
  );
}

function HeatmapLegendSwatch({ status }: { status: GprWorkHeatmapStatus }) {
  return (
    <span
      className="inline-block shrink-0 rounded-[2px] ring-1 ring-inset ring-black/10"
      style={heatmapCellStyle(status)}
      aria-hidden
    />
  );
}

/** Мини-полоса прогресса одной работы: длина = % выполнения, цвет = отклонение. */
function WorkProgressBar({ cell }: { cell: GprStageProgressWorkCell }) {
  const barColor = gprWorkProgressBarColor(cell.status);
  const pct = Math.min(100, Math.max(0, cell.progressPercent));

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div
        className="relative h-3 min-w-[160px] flex-1 overflow-hidden rounded-sm bg-slate-800/75 ring-1 ring-inset ring-white/5"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Выполнение ${pct}%`}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-sm transition-[width] duration-300"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>
      <span
        className="w-[76px] shrink-0 text-right text-xs font-semibold tabular-nums leading-none"
        style={{ color: barColor }}
      >
        {cell.deviationLabel}
      </span>
    </div>
  );
}

function WorkProgressMiniRing({
  percent,
  strokeColor,
}: {
  percent: number;
  strokeColor: string;
}) {
  const size = 40;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, percent));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg className="h-full w-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute text-[9px] font-bold tabular-nums text-slate-200">
        {Number.isInteger(clamped) ? clamped : clamped.toFixed(0)}%
      </span>
    </div>
  );
}

function StageProgressRing({ percent }: { percent: number }) {
  const size = 52;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, percent));
  const offset = circumference - (clamped / 100) * circumference;
  const ringColor = clamped >= 70 ? COLORS.green : clamped >= 40 ? "#f59e0b" : COLORS.red;

  return (
    <div
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      aria-label={`Выполнение этапа ${clamped}%`}
    >
      <svg className="h-full w-full -rotate-90" viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <span className="absolute text-[11px] font-bold tabular-nums text-slate-100">
        {Number.isInteger(clamped) ? clamped : clamped.toFixed(1)}%
      </span>
    </div>
  );
}

function KpiMiniCard({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string | number;
  valueColor?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700/55 bg-slate-900/30 px-4 py-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</div>
      <div
        className="mt-1 text-xl font-bold tabular-nums leading-tight text-slate-100"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function StageFilterDropdown({
  options,
  selectedCodes,
  onChange,
}: {
  options: { code: string; label: string }[];
  selectedCodes: string[];
  onChange: (codes: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const allSelected = selectedCodes.length === 0;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggleCode = (code: string) => {
    if (allSelected) {
      onChange([code]);
      return;
    }
    if (selectedCodes.includes(code)) {
      const next = selectedCodes.filter((c) => c !== code);
      onChange(next);
    } else {
      onChange([...selectedCodes, code]);
    }
  };

  const filterLabel = allSelected
    ? "Все этапы"
    : selectedCodes.length === 1
      ? options.find((o) => o.code === selectedCodes[0])?.label ?? "1 этап"
      : `Выбрано: ${selectedCodes.length}`;

  return (
    <div ref={ref} className="relative min-w-[200px] sm:min-w-[240px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-600/70 bg-slate-900/40 px-3 py-2.5 text-left text-sm text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-900/55"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span>
          <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Фильтр этапов
          </span>
          <span className="mt-0.5 block truncate font-medium text-slate-100">{filterLabel}</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          className="absolute right-0 z-50 mt-2 max-h-[min(360px,60vh)] w-[min(100vw-2rem,320px)] overflow-y-auto rounded-xl border border-slate-600/70 bg-[#1e293b] p-2 shadow-2xl shadow-black/40"
          role="listbox"
          aria-multiselectable
        >
          <button
            type="button"
            className="mb-1 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800/70"
            onClick={() => {
              onChange([]);
              setOpen(false);
            }}
          >
            Все этапы
          </button>
          <div className="my-1 border-t border-white/10" />
          {options.map((opt) => {
            const checked = allSelected || selectedCodes.includes(opt.code);
            return (
              <label
                key={opt.code}
                className="flex cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2 hover:bg-slate-800/70"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 accent-sky-500"
                  checked={checked}
                  onChange={() => toggleCode(opt.code)}
                />
                <span className="min-w-0 text-sm leading-snug text-slate-200">{opt.label}</span>
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function StageProgressTableRow({
  stage,
  expanded,
  onToggle,
}: {
  stage: GprStageProgressStageRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-b border-slate-700/40 bg-slate-900/15">
        <td className="min-w-[220px] px-3 py-3 align-middle">
          <button
            type="button"
            onClick={onToggle}
            className="flex w-full items-start gap-2 text-left transition-colors hover:text-sky-100"
            aria-expanded={expanded}
          >
            <span className="mt-0.5 shrink-0 text-slate-400">
              {expanded ? (
                <ChevronDown className="h-4 w-4" aria-hidden />
              ) : (
                <ChevronRight className="h-4 w-4" aria-hidden />
              )}
            </span>
            <span className="min-w-0">
              <span className="block font-mono text-xs font-semibold text-sky-300/90">{stage.code}</span>
              <span className="stage-title mt-0.5 block text-sm font-semibold leading-snug text-slate-100">
                {stage.name}
              </span>
            </span>
          </button>
        </td>
        <td className="min-w-0 px-3 py-3 align-middle">
          <HeatmapStrip cells={stage.works} />
        </td>
        <td className="w-[88px] px-3 py-3 align-middle">
          <div className="flex flex-col items-center gap-1">
            <StageProgressRing percent={stage.completionPercent} />
            <span className="text-[10px] tabular-nums text-slate-500">
              {stage.completedCount}/{stage.totalCount}
            </span>
          </div>
        </td>
      </tr>

      {expanded
        ? stage.works.map((cell) => {
            const barColor = gprWorkProgressBarColor(cell.status);
            const taskName = cell.task.name.trim() || cell.task.code;
            return (
              <tr
                key={`work-${cell.task.globalTaskId ?? cell.task.id}`}
                className="border-b border-slate-800/50 bg-slate-950/20"
              >
                <td className="px-3 py-2.5 pl-11 align-middle">
                  <span className="block text-sm leading-snug text-slate-200">{taskName}</span>
                  <span className="mt-0.5 block font-mono text-[10px] text-slate-500">
                    {cell.task.code}
                  </span>
                </td>
                <td className="px-3 py-2.5 align-middle">
                  <WorkProgressBar cell={cell} />
                </td>
                <td className="px-3 py-2.5 align-middle">
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-xs font-semibold tabular-nums text-slate-300">
                      {cell.progressPercent}%
                    </span>
                    <WorkProgressMiniRing percent={cell.progressPercent} strokeColor={barColor} />
                  </div>
                </td>
              </tr>
            );
          })
        : null}
    </>
  );
}

export function GprStageProgressBlock({
  tasks,
  branchRoots,
  asOf,
  reportDateLabel,
}: GprStageProgressBlockProps) {
  const [selectedStageCodes, setSelectedStageCodes] = useState<string[]>([]);
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());

  const model = useMemo(
    () => buildGprStageProgressModel(tasks, branchRoots, asOf, selectedStageCodes),
    [tasks, branchRoots, asOf, selectedStageCodes],
  );

  useEffect(() => {
    setExpandedStages(new Set());
  }, [branchRoots.join(","), tasks.length, selectedStageCodes.join(",")]);

  const toggleStage = (code: string) => {
    setExpandedStages((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const avgColor =
    model.kpi.averageDeviation === null
      ? COLORS.gray
      : model.kpi.averageDeviation > 0
        ? COLORS.red
        : model.kpi.averageDeviation < 0
          ? COLORS.green
          : COLORS.gray;

  return (
    <div
      className="rounded-2xl border border-slate-700/60 bg-[#1e293b] p-6 shadow-sm"
      {...{ [PDF_CHART_BLOCK_ATTR]: "" }}
      {...{ [PDF_SECTION_TITLE_ATTR]: "Прогресс этапа" }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-50">Прогресс этапа</h3>
          {reportDateLabel ? (
            <p className="mt-1 text-xs text-slate-500">по состоянию на {reportDateLabel}</p>
          ) : null}
        </div>
        {model.allStageOptions.length > 0 ? (
          <StageFilterDropdown
            options={model.allStageOptions}
            selectedCodes={selectedStageCodes}
            onChange={setSelectedStageCodes}
          />
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiMiniCard
          label="Среднее отклонение"
          value={model.kpi.averageDeviationDisplay}
          valueColor={avgColor}
        />
        <KpiMiniCard
          label="Критических отклонений"
          value={model.kpi.criticalCount}
          valueColor={model.kpi.criticalCount > 0 ? COLORS.red : undefined}
        />
        <KpiMiniCard label="Всего работ" value={model.kpi.totalWorks} />
        <KpiMiniCard
          label="Завершено вовремя"
          value={model.kpi.completedOnTimeCount}
          valueColor={model.kpi.completedOnTimeCount > 0 ? COLORS.green : undefined}
        />
      </div>

      {model.stages.length === 0 ? (
        <p className="mt-6 rounded-xl border border-slate-700/50 bg-slate-900/25 px-4 py-8 text-center text-sm text-slate-400">
          Нет этапов WBS с дочерними работами для выбранного объекта.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-xl border border-slate-700/55">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-700/55 bg-slate-900/35 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2.5">Этап / работа</th>
                <th className="px-3 py-2.5">Обзор / прогресс</th>
                <th className="px-3 py-2.5 w-[88px] text-center">Выполнение</th>
              </tr>
            </thead>
            <tbody>
              {model.stages.map((stage) => (
                <StageProgressTableRow
                  key={stage.code}
                  stage={stage}
                  expanded={expandedStages.has(stage.code)}
                  onToggle={() => toggleStage(stage.code)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5 rounded-xl border border-slate-700/50 bg-slate-900/25 px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Легенда</div>
        <p className="mt-1 text-[11px] text-slate-500">
          Строка этапа — компактные квадраты-обзор. Раскрытые работы — полоса прогресса (длина = % выполнения,
          цвет = отклонение).
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          {GPR_WORK_HEATMAP_STATUS_ORDER.map((status) => {
            const meta = GPR_WORK_HEATMAP_META[status];
            return (
              <div key={status} className="flex items-center gap-2 text-xs text-slate-300">
                <HeatmapLegendSwatch status={status} />
                <span>{meta.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
