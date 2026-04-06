"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

import {
  partIdToProjectPartKey,
  PROJECT_PART_KEY_TO_ID,
  PROJECT_PARTS,
  type GPRTask,
  type ProjectPartKey,
} from "@/lib/gprUtils";
import {
  calculateDeviation,
  filterByPeriod,
  flattenTasks,
  getProjectStats,
  getStatusByDeviation,
  planRootStageCode,
  type PlanFactPeriodFilterType,
} from "@/lib/gprUtils";
import {
  BarController,
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
} from "chart.js";
import type { Plugin } from "chart.js";
import { GPRTmcDependencyChart } from "@/components/construction/GPRTmcDependencyChart";
import { GPRTenderDependencyChart } from "@/components/construction/GPRTenderDependencyChart";
import { AnalyticsLegendItem, AnalyticsLegendList } from "@/components/construction/AnalyticsLegendItem";
import { GPRForecastChart } from "@/components/construction/GPRForecastChart";
import { gprStageDisplayTitle, gprStageGroupKeysForProjectPart } from "@/lib/gprTmcDependency";
import type { TMCItem } from "@/lib/tmcData";
import { filterTmcByProjectPart, getTmcData, mergeTmcSnapshotWithSeed } from "@/lib/tmcData";
import {
  buildTenderStageInsight,
  getGprStageFromTenderCode,
  mergeTenderSnapshotWithSeed,
  readTenderSnapshotFromStorage,
  type Tender,
} from "@/lib/tenderData";
import {
  clampSerialRange,
  computeQuarterlyAggregatesFromTasks,
  distinctYearsFromBuckets,
  filterKvartalyTasksForGantt,
  formatQuarterDisplayLabel,
  getGanttXWindow,
  serialDayFromOrigin,
  toKvartalyGanttFilter,
  type QuarterlyAggregateBucket,
} from "@/lib/gprQuarterlyTimeline";
import {
  aggregateToMainProcesses,
  aggregatedMainProcessDelayDays,
  aggregatedMainProcessStatus,
  isAggregatedMainProcessTask,
  sortAggregatedMainProcessRows,
} from "@/lib/gprMainProcessAggregate";
import {
  aggregateWorksToProjectPlanFactBounds,
  buildOverviewGanttRows,
  isOverviewFactGanttTask,
  isOverviewPlanGanttTask,
  overviewEndDeviationStatus,
  projectOverviewEndDelayDays,
} from "@/lib/gprProjectOverview";
import { ganttFactColorForScheduleToday, scheduleDelayTodayDays } from "@/lib/gprScheduleDelayToday";
import { kvartalyRowsToGprTasksForAllParts } from "@/lib/kvartalyGpr";
import { getProjectStatus } from "@/utils/status";

const ResponsiveContainer = dynamic(
  () => import("recharts").then((m) => m.ResponsiveContainer),
  { ssr: false },
);
const CartesianGrid = dynamic(() => import("recharts").then((m) => m.CartesianGrid), {
  ssr: false,
});
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });
const PieChart = dynamic(() => import("recharts").then((m) => m.PieChart), { ssr: false });
const Pie = dynamic(() => import("recharts").then((m) => m.Pie), { ssr: false });
const Cell = dynamic(() => import("recharts").then((m) => m.Cell), { ssr: false });
const Chart = dynamic(() => import("react-chartjs-2").then((m) => m.Chart), { ssr: false });

/** Короткий шифр для оси X: «2.05.01.2» → «2.05.01». */
function shortGprCodeForAxis(code: string): string {
  const parts = code.trim().split(".").filter(Boolean);
  if (parts.length <= 3) return code.trim();
  return parts.slice(0, 3).join(".");
}

type PlanFactDurationRow = {
  task: GPRTask;
  plan: number;
  fact: number;
  /** Факт − план по длительности (дни). */
  durationDev: number;
  /** Короткая подпись по оси X (шифр этапа). */
  xLabel: string;
};

/** Локальная календарная дата для шкалы Ганта (как у origin окна). */
function localTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type GanttTodayLinePluginOpts = {
  origin: Date;
  maxSerial: number;
};

/** Вертикальная линия «сегодня» под полосами (beforeDatasetsDraw); подпись над областью графика. */
const ganttTodayLinePlugin: Plugin<"bar"> = {
  id: "ganttTodayLine",
  beforeDatasetsDraw(chart) {
    const opts = (chart.options.plugins as { ganttTodayLine?: GanttTodayLinePluginOpts } | undefined)
      ?.ganttTodayLine;
    if (!opts || !chart.scales.x) return;

    const todayIso = localTodayIso();
    const serial = serialDayFromOrigin(todayIso, opts.origin);
    if (
      serial === null ||
      !Number.isFinite(serial) ||
      serial < -1e-6 ||
      serial > opts.maxSerial + 1e-6
    ) {
      return;
    }

    const xScale = chart.scales.x;
    const x = xScale.getPixelForValue(serial);
    const { ctx, chartArea } = chart;
    if (!Number.isFinite(x) || x < chartArea.left || x > chartArea.right) return;

    const [yy, mm, dd] = todayIso.split("-").map((s) => Number(s));
    const labelDate =
      yy != null && mm != null && dd != null
        ? new Date(yy, mm - 1, dd).toLocaleDateString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })
        : todayIso;
    const label = `Сегодня • ${labelDate}`;

    const xi = Math.round(x) + 0.5;
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = "rgba(163, 179, 199, 0.52)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 5]);
    ctx.moveTo(xi, chartArea.top);
    ctx.lineTo(xi, chartArea.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = "600 10px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    const textY = chartArea.top - 3;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(15, 23, 42, 0.88)";
    ctx.lineWidth = 3;
    ctx.strokeText(label, x, textY);
    ctx.fillStyle = "rgba(226, 232, 240, 0.92)";
    ctx.fillText(label, x, textY);
    ctx.restore();
  },
};

ChartJS.register(
  BarController,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ChartTooltip,
  ChartLegend,
  ganttTodayLinePlugin,
);

const DATE_FMT = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" });
const MS_PER_DAY_CHART = 1000 * 60 * 60 * 24;

const fmt = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return DATE_FMT.format(date);
};

const isoMs = (value: string | null | undefined) => {
  if (!value) return null;
  const ms = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(ms) ? null : ms;
};

const daysInclusive = (startIso: string | null | undefined, endIso: string | null | undefined) => {
  const startMs = isoMs(startIso);
  const endMs = isoMs(endIso);
  if (startMs === null || endMs === null) return null;
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const diff = Math.round((endMs - startMs) / MS_PER_DAY) + 1;
  if (!Number.isFinite(diff) || diff <= 0) return null;
  return diff;
};

function addDaysFromOrigin(origin: Date, serialDays: number): Date {
  return new Date(origin.getTime() + serialDays * MS_PER_DAY_CHART);
}

function truncateAxisLabel(s: string, maxLen: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}

const GANTT_FACT_LEGEND_GRAY = "rgba(148, 163, 184, 0.5)";

/** Те же уровни, что у полос факта: серый < зелёный < жёлтый < красный. */
function ganttFactColorRankForLegend(color: string): number {
  const t = color.trim();
  if (t === "#ef4444") return 3;
  if (t === "#f59e0b") return 2;
  if (t === "#22c55e") return 1;
  return 0;
}

/**
 * Цвет квадрата «Факт» в легенде: совпадает с палитрой полос.
 * Несколько полос — берём худший статус (как наиболее критичный для сроков).
 */
function pickGanttFactLegendColor(
  factBg: string[],
  factBars: Array<[number, number] | null>,
): string {
  let best = GANTT_FACT_LEGEND_GRAY;
  let bestRank = -1;
  for (let i = 0; i < factBg.length; i++) {
    if (factBars[i] == null) continue;
    const c = factBg[i] ?? GANTT_FACT_LEGEND_GRAY;
    const r = ganttFactColorRankForLegend(c);
    if (r > bestRank) {
      bestRank = r;
      best = c;
    }
  }
  return best;
}

function rowVisibleInGanttWindow(task: GPRTask, origin: Date, maxSerial: number): boolean {
  const p = clampSerialRange(task.planStart, task.planEnd, origin, maxSerial);
  if (p) return true;
  if (task.factStart && task.factEnd) {
    const f = clampSerialRange(task.factStart, task.factEnd, origin, maxSerial);
    if (f) return true;
  }
  return false;
}

function sortGanttTasks(tasks: GPRTask[]): GPRTask[] {
  return [...tasks].sort((a, b) => {
    const sa = new Date(`${a.planStart}T00:00:00`).getTime();
    const sb = new Date(`${b.planStart}T00:00:00`).getTime();
    if (sa !== sb) return sa - sb;
    return a.code.localeCompare(b.code, undefined, { numeric: true });
  });
}

const COLORS = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
  gray: "#6b7280",
  bg: "#0f172a",
  card: "#1e293b",
} as const;

function PlanFactProjectStatusLabel({ status }: { status: "green" | "yellow" | "red" }) {
  return (
    <div className="flex shrink-0 flex-col items-end gap-1 text-right text-xs text-slate-300">
      <span className="font-medium leading-snug text-slate-100">Статус проекта</span>
      <span
        className="inline-flex w-fit items-center rounded-full px-2 py-0.5 font-semibold"
        style={{
          backgroundColor:
            status === "green"
              ? "rgba(34,197,94,0.15)"
              : status === "yellow"
                ? "rgba(245,158,11,0.15)"
                : "rgba(239,68,68,0.15)",
          color: status === "green" ? COLORS.green : status === "yellow" ? COLORS.yellow : COLORS.red,
        }}
      >
        {status === "green" ? "В срок" : status === "yellow" ? "Риск" : "Просрочка"}
      </span>
    </div>
  );
}

/** Пояснение к «Риск проекта (%)» в donut «Распределение статусов». */
const STATUS_DISTRIBUTION_RISK_EXPLANATION =
  "Процент риска рассчитывается на основе распределения статусов задач: жёлтые — умеренный риск, красные — критический.";

/** Корневые этапы для агрегата и порядка карточек по части проекта. */
const AGGREGATE_ROOT_CODES_BY_PART: Record<ProjectPartKey, readonly string[]> = {
  residential: ["2.04", "2.05"],
  parking: ["2.06", "2.07"],
};

const PART_SHORT_TITLE: Record<ProjectPartKey, string> = {
  residential: "Жилой дом",
  parking: "Автостоянка",
};

/** Подписи для блока «Состав» (жилой дом) — совпадают с корневыми этапами 2.04 / 2.05. */
const RESIDENTIAL_AGGREGATE_STAGE_TITLES: readonly [string, string] = [
  "Подготовка территории строительства",
  "Строительство зданий и сооружений",
];
const RESIDENTIAL_WEIGHT_LABELS: readonly [string, string] = ["Подготовка", "Строительство"];

type AggregateStageBreakdown = {
  composeTitle: string;
  weightShortLabel: string;
  completion: number;
  planDays: number | null;
  /** Доля плановой длительности среди корневых этапов части, % */
  weightPercent: number | null;
};

function shortWeightLabelForPart(name: string, index: number): string {
  const n = name.trim();
  if (n.length <= 28) return n;
  return `Этап ${index + 1}`;
}

function computeTmcProblemSignals(
  tasks: GPRTask[],
  tmcItems: TMCItem[],
  todayIso: string,
): { notPurchased: boolean; overdueDelivery: boolean } {
  const tmcById = new Map(tmcItems.map((x) => [x.id, x]));
  const todayMs = new Date(`${todayIso}T00:00:00`).getTime();
  let notPurchased = false;
  let overdueDelivery = false;
  for (const task of tasks) {
    for (const tmcId of task.relatedTmcIds ?? []) {
      const item = tmcById.get(tmcId);
      if (!item) continue;
      const planMs = new Date(`${item.planDate}T00:00:00`).getTime();
      const factMs = item.factDate ? new Date(`${item.factDate}T00:00:00`).getTime() : null;
      if (!item.factDate && Number.isFinite(planMs) && planMs < todayMs) notPurchased = true;
      if (factMs !== null && Number.isFinite(planMs) && factMs > planMs) overdueDelivery = true;
    }
  }
  return { notPurchased, overdueDelivery };
}

/** Разница в п.п. между этапами, при которой показываем короткое пояснение в поповере. */
const AGGREGATE_POPOVER_STAGE_GAP_PTS = 15;

function buildAggregateProgressPopoverExplanation(
  partKey: ProjectPartKey,
  stages: AggregateStageBreakdown[],
  tmc: { notPurchased: boolean; overdueDelivery: boolean },
  scheduleLag: boolean,
): string[] {
  const prepProgress = stages[0]?.completion;
  const buildProgress = stages[1]?.completion;
  const hasTwoStages =
    stages.length >= 2 &&
    typeof prepProgress === "number" &&
    typeof buildProgress === "number";

  if (tmc.notPurchased || tmc.overdueDelivery) {
    return [
      "Прогресс снижен из-за отсутствия или задержки поставок материалов (ТМЦ).",
    ];
  }

  if (hasTwoStages) {
    const prep = prepProgress as number;
    const build = buildProgress as number;
    if (prep + AGGREGATE_POPOVER_STAGE_GAP_PTS <= build) {
      const line =
        partKey === "residential"
          ? "Прогресс снижен из-за отставания на этапе подготовки территории."
          : "Прогресс снижен из-за отставания по первому корневому этапу относительно второго.";
      return scheduleLag
        ? [line, "Дополнительно зафиксировано отставание по срокам относительно плана."]
        : [line];
    }
    if (build + AGGREGATE_POPOVER_STAGE_GAP_PTS <= prep) {
      const line =
        partKey === "residential"
          ? "Прогресс снижен из-за того, что этап строительства выполнен значительно меньше по сравнению с подготовкой."
          : "Общий прогресс в большей степени ограничен вторым корневым этапом: он заметно отстаёт от первого.";
      return scheduleLag
        ? [line, "Дополнительно зафиксировано отставание по срокам относительно плана."]
        : [line];
    }
  }

  if (scheduleLag) {
    return [
      "Общий показатель учитывает отставание по срокам завершения работ относительно плана.",
    ];
  }

  return [
    "Взвешенный по длительности плана прогресс по этапам сбалансирован; выраженного перекоса между ними не наблюдается.",
  ];
}

const STATUS_DISTRIBUTION_POPOVER_MAX_TASKS = 5;

function formatDeviationForStatusDistributionPopover(status: Traffic, deviationDays: number | null): string {
  if (deviationDays === null) return "—";
  if (status === "green") {
    return deviationDays > 0 ? `+${deviationDays} дн` : `${deviationDays} дн`;
  }
  if (status === "yellow" || status === "red") {
    return `+${deviationDays} дн`;
  }
  return "—";
}

function StatusDistributionTaskChunk({
  rows,
  status,
  showDeviation,
}: {
  rows: TrafficRow[];
  status: Traffic;
  showDeviation: boolean;
}) {
  const limit = STATUS_DISTRIBUTION_POPOVER_MAX_TASKS;
  const shown = rows.slice(0, limit);
  const rest = rows.length - shown.length;
  return (
    <>
      <ul className="mt-1.5 space-y-1 text-[11px] leading-snug text-slate-300">
        {shown.map((r) => (
          <li key={r.task.id}>
            • {r.task.name}
            {showDeviation
              ? ` (${formatDeviationForStatusDistributionPopover(status, r.deviationDays)})`
              : ""}
          </li>
        ))}
      </ul>
      {rest > 0 ? (
        <p className="mt-1.5 text-[11px] text-slate-500">и ещё {rest}…</p>
      ) : null}
    </>
  );
}

type Traffic = "green" | "yellow" | "red" | "gray";
type GroupKey = "prep" | "build" | "network" | "improve";

/** Иконки этапов (inline SVG — цвет через `currentColor` у родителя). */
function StageDeviationStageIcon({ groupKey, className = "" }: { groupKey: GroupKey; className?: string }) {
  const cls = `h-6 w-6 shrink-0 block ${className}`.trim();
  if (groupKey === "prep") {
    return (
      <svg
        className={cls}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 2v7M8 9h8M14 9l6-5M12 9v4M9 18h6v4H9z" />
        <path d="M5 22h14" />
        <path d="M11 13h2" />
      </svg>
    );
  }
  if (groupKey === "build") {
    return (
      <svg
        className={cls}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 21h18" />
        <path d="M5 21V11l7-5 7 5v10" />
        <path d="M9 21v-8h6v8" />
        <path d="M9 13h6" />
      </svg>
    );
  }
  if (groupKey === "network") {
    return (
      <svg
        className={cls}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="5" cy="19" r="2" />
        <circle cx="19" cy="5" r="2" />
        <path d="M6.5 17.5 17.5 6.5M15 19h3M6 5H3" />
      </svg>
    );
  }
  return (
    <svg
      className={cls}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3C8 7 6 10 6 13a6 6 0 0 0 12 0c0-3-2-6-6-10z" />
      <path d="M12 13v8M8 21h8" />
    </svg>
  );
}

type TrafficRow = {
  task: GPRTask;
  status: Traffic;
  planDays: number | null;
  factDays: number | null;
  deviationDays: number | null;
};

type StatusDonutSlice = {
  status: Traffic;
  name: string;
  value: number;
  fill: string;
  items: string[];
};

function formatStatusDonutItemLine(row: TrafficRow): string {
  if (row.status === "gray") return row.task.name;
  const d = row.deviationDays;
  if (d === null) return row.task.name;
  return `${row.task.name} (${formatDeviationForStatusDistributionPopover(row.status, d)})`;
}

function StatusDistributionPieTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: StatusDonutSlice }>;
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;
  return (
    <div
      className="max-w-xs rounded-lg border border-slate-500/50 bg-[#1e293b] p-3 shadow-xl"
      style={{ maxWidth: "min(18rem, calc(100vw - 2rem))" }}
    >
      <div className="mb-2 font-semibold text-slate-100">
        {data.name}: {data.value}
      </div>
      {data.items.length > 0 ? (
        <ul className="max-h-40 list-none space-y-1 overflow-y-auto break-words text-xs leading-snug text-slate-300">
          {data.items.map((item, i) => (
            <li key={`${data.status}-${i}`} className="pl-0">
              <span className="text-slate-500">•</span> {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">Нет задач в этой категории</p>
      )}
    </div>
  );
}

/**
 * Фильтр «План vs Факт»:
 * - для источника `tasks`: месяц / обобщённый квартал Q1–Q4;
 * - для `kvartaly`: календарный год или конкретный квартал `YYYY-Qn` на временной шкале.
 */
type PlanFactChartFilter =
  | { filterType: "all" }
  | { filterType: "month"; value: number }
  | { filterType: "quarter"; value: number }
  | { filterType: "year"; value: number }
  | { filterType: "timelineQuarter"; key: string };

type PlanFactKvartalyGranularity = "overview" | "aggregated" | "detailed";

type KvartalyGanttModel = {
  candidates: GPRTask[];
  window: { origin: Date; maxSerial: number } | null;
  ganttRows: GPRTask[];
  planFactSummary: { avg: number; severeLate: number } | null;
};

function useKvartalyGanttModel(
  tasks: GPRTask[],
  planFactFilter: PlanFactChartFilter,
  enabled: boolean,
  granularity: PlanFactKvartalyGranularity,
): KvartalyGanttModel {
  const kvartalyPlanFactFilter = useMemo(
    () => toKvartalyGanttFilter(planFactFilter),
    [planFactFilter],
  );

  const candidates = useMemo(() => {
    if (!enabled) return [];
    return filterKvartalyTasksForGantt(tasks, kvartalyPlanFactFilter);
  }, [enabled, tasks, kvartalyPlanFactFilter]);

  const ganttWindow = useMemo(() => {
    if (!enabled) return null;
    return getGanttXWindow(candidates, kvartalyPlanFactFilter);
  }, [enabled, candidates, kvartalyPlanFactFilter]);

  const ganttRows = useMemo(() => {
    if (!enabled || !ganttWindow) return [];
    const { origin, maxSerial } = ganttWindow;
    const vis = candidates.filter((t) => rowVisibleInGanttWindow(t, origin, maxSerial));

    if (granularity === "overview") {
      const agg = aggregateWorksToProjectPlanFactBounds(candidates);
      if (!agg || candidates.length === 0) return [];
      const partId = candidates[0]!.partId;
      const pk = candidates[0]!.projectPartKey ?? partIdToProjectPartKey(partId);
      return buildOverviewGanttRows(agg, partId, pk);
    }

    if (vis.length > 0 && vis.every(isAggregatedMainProcessTask)) {
      return sortAggregatedMainProcessRows(vis);
    }
    return sortGanttTasks(vis);
  }, [enabled, ganttWindow, candidates, granularity]);

  const planFactSummary = useMemo((): { avg: number; severeLate: number } | null => {
    if (!enabled) return null;
    if (granularity === "overview") {
      const agg = aggregateWorksToProjectPlanFactBounds(candidates);
      if (!agg) return null;
      const delayToday = scheduleDelayTodayDays(
        agg.planStart,
        agg.planEnd,
        agg.factStart,
        agg.factEnd,
      );
      if (delayToday === null) return null;
      return { avg: delayToday, severeLate: delayToday > 14 ? 1 : 0 };
    }
    const rows = ganttRows.filter((t) => {
      if (!t.factStart || !t.factEnd) return false;
      const plan = daysInclusive(t.planStart, t.planEnd);
      const fact = daysInclusive(t.factStart, t.factEnd);
      return plan !== null && fact !== null && plan > 0 && fact > 0;
    });
    if (rows.length === 0) return null;
    const durationDevs = rows.map((t) => {
      const plan = daysInclusive(t.planStart, t.planEnd) ?? 0;
      const fact = daysInclusive(t.factStart, t.factEnd) ?? 0;
      return fact - plan;
    });
    const avg = durationDevs.reduce((s, d) => s + d, 0) / durationDevs.length;
    const severeLate = durationDevs.filter((d) => d > 14).length;
    return { avg, severeLate };
  }, [enabled, granularity, candidates, ganttRows]);

  return {
    candidates,
    window: ganttWindow,
    ganttRows,
    planFactSummary,
  };
}

function KvartalyGanttChartPanel({ model }: { model: KvartalyGanttModel }) {
  const { window: gw, candidates, ganttRows } = model;

  if (!gw) {
    return (
      <div className="flex min-h-[220px] w-full items-center justify-center rounded-lg border border-slate-700/50 bg-slate-900/30 px-4 text-center text-sm text-slate-400">
        Нет данных для временной шкалы (нет корректных дат в источнике для этого объекта).
      </div>
    );
  }
  if (candidates.length === 0) {
    return (
      <div className="flex min-h-[220px] w-full items-center justify-center rounded-lg border border-slate-700/50 bg-slate-900/30 px-4 text-center text-sm text-slate-400">
        Нет работ, пересекающих выбранный период (по плану).
      </div>
    );
  }
  if (ganttRows.length === 0) {
    return (
      <div className="flex min-h-[220px] w-full items-center justify-center rounded-lg border border-slate-700/50 bg-slate-900/30 px-4 text-center text-sm text-slate-400">
        В текущем окне нет отрезков план/факт — сузьте или смените фильтр.
      </div>
    );
  }

  const { origin, maxSerial } = gw;
  const rows = ganttRows;
  const overviewMode =
    rows.length === 2 &&
    isOverviewPlanGanttTask(rows[0]!) &&
    isOverviewFactGanttTask(rows[1]!);

  const labels = overviewMode
    ? rows.map((t) => truncateAxisLabel(t.name.trim(), 42))
    : rows.map((t) =>
        truncateAxisLabel(`${shortGprCodeForAxis(t.code)} — ${t.name.trim()}`, 58),
      );

  const planBars: ([number, number] | null)[] = overviewMode
    ? (() => {
        const t0 = rows[0]!;
        const r = clampSerialRange(t0.planStart, t0.planEnd, origin, maxSerial);
        return [r ? ([r[0], r[1]] as [number, number]) : null, null];
      })()
    : rows.map((t) => {
        const r = clampSerialRange(t.planStart, t.planEnd, origin, maxSerial);
        return r ? ([r[0], r[1]] as [number, number]) : null;
      });

  const factBars: ([number, number] | null)[] = overviewMode
    ? (() => {
        const t1 = rows[1]!;
        if (!t1.factStart?.trim() || !t1.factEnd?.trim()) return [null, null];
        const r = clampSerialRange(t1.factStart, t1.factEnd, origin, maxSerial);
        return [null, r ? ([r[0], r[1]] as [number, number]) : null];
      })()
    : rows.map((t) => {
        if (!t.factStart || !t.factEnd) return null;
        const r = clampSerialRange(t.factStart, t.factEnd, origin, maxSerial);
        return r ? ([r[0], r[1]] as [number, number]) : null;
      });

  const factBg = rows.map((t) => ganttFactColorForScheduleToday(t));

  const legendFactColor = pickGanttFactLegendColor(factBg, factBars);
  const planLegendMarker = "#94a3b8";

  return (
    <div className="flex h-full min-h-[200px] w-full min-w-0 flex-col">
      <div className="min-h-0 min-w-0 flex-1">
        <Chart
          type="bar"
          data={{
        labels,
        datasets: [
          {
            label: "План",
            data: planBars,
            order: 1,
            backgroundColor: "rgba(148, 163, 184, 0.42)",
            borderColor: "rgba(148, 163, 184, 0.55)",
            borderWidth: 1,
            borderSkipped: false,
            barThickness: 12,
            maxBarThickness: 14,
          },
          {
            label: "Факт",
            data: factBars,
            order: 2,
            backgroundColor: factBg,
            borderColor: factBg.map((c) => c),
            borderWidth: 1,
            borderSkipped: false,
            barThickness: 12,
            maxBarThickness: 14,
          },
        ],
          } as any}
          options={{
        indexAxis: "y" as const,
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 22, right: 12, left: 4, bottom: 4 } },
        interaction: { mode: "nearest", axis: "y", intersect: false },
        datasets: {
          bar: {
            categoryPercentage: 0.82,
            barPercentage: 0.9,
          },
        },
        plugins: {
          ganttTodayLine: {
            origin,
            maxSerial,
          },
          legend: {
            display: false,
          },
          tooltip: {
            enabled: true,
            backgroundColor: "rgba(15,23,42,0.94)",
            borderColor: "rgba(148,163,184,0.35)",
            borderWidth: 1,
            titleColor: "#f8fafc",
            bodyColor: "#e2e8f0",
            padding: 10,
            callbacks: {
              title: (tooltipItems: { dataIndex?: number }[]) => {
                const idx = tooltipItems[0]?.dataIndex;
                if (typeof idx !== "number") return "";
                const task = rows[idx];
                if (!task) return "";
                if (overviewMode) return `${task.name.trim()} проекта`;
                return `${task.code} — ${task.name.trim()}`;
              },
              label: (ctx: {
                datasetIndex?: number;
                dataIndex?: number;
                parsed: { _custom?: unknown; x?: number | null };
              }) => {
                const idx = ctx.dataIndex ?? 0;
                const task = rows[idx];
                if (!task) return "";
                if (ctx.datasetIndex === 0) {
                  return `План: ${fmt(task.planStart)} — ${fmt(task.planEnd)}`;
                }
                if (!task.factStart || !task.factEnd) return "Факт: нет данных";
                return `Факт: ${fmt(task.factStart)} — ${fmt(task.factEnd)}`;
              },
              afterBody: (tooltipItems: { dataIndex?: number }[]) => {
                const idx = tooltipItems[0]?.dataIndex;
                if (typeof idx !== "number") return [];
                const task = rows[idx];
                if (!task) return [];
                const planD = daysInclusive(task.planStart, task.planEnd);
                const factD =
                  task.factStart && task.factEnd
                    ? daysInclusive(task.factStart, task.factEnd)
                    : null;
                const lines: string[] = [];
                if (isOverviewPlanGanttTask(task)) {
                  if (planD !== null) lines.push(`Длительность плана (проект): ${planD} дн.`);
                  lines.push("Сводка по всем работам выбранного периода и объекта.");
                } else if (isOverviewFactGanttTask(task)) {
                  if (planD !== null) lines.push(`Длительность плана (проект): ${planD} дн.`);
                  if (factD !== null) lines.push(`Длительность факта (проект): ${factD} дн.`);
                  const schedDel = scheduleDelayTodayDays(
                    task.planStart,
                    task.planEnd,
                    task.factStart,
                    task.factEnd,
                  );
                  if (schedDel !== null) {
                    lines.push(
                      `Отставание графика на сегодня: ${schedDel > 0 ? "+" : ""}${schedDel} дн.`,
                    );
                  }
                  const endDel = projectOverviewEndDelayDays(task.planEnd, task.factEnd);
                  if (endDel !== null) {
                    lines.push(
                      `Отклонение окончания (факт − план): ${endDel > 0 ? "+" : ""}${endDel} дн.`,
                    );
                  }
                  lines.push(
                    `Статус: ${overviewEndDeviationStatus(
                      task.planStart,
                      task.planEnd,
                      task.factStart,
                      task.factEnd,
                    )}`,
                  );
                } else if (isAggregatedMainProcessTask(task)) {
                  if (planD !== null) lines.push(`Длительность (план): ${planD} дн.`);
                  if (factD !== null) lines.push(`Длительность (факт): ${factD} дн.`);
                  const schedDel = scheduleDelayTodayDays(
                    task.planStart,
                    task.planEnd,
                    task.factStart,
                    task.factEnd,
                  );
                  if (schedDel !== null) {
                    lines.push(
                      `Отставание графика на сегодня: ${schedDel > 0 ? "+" : ""}${schedDel} дн.`,
                    );
                  }
                  const delay = aggregatedMainProcessDelayDays(task);
                  if (delay !== null) {
                    lines.push(
                      `Отклонение длительности (факт − план): ${delay > 0 ? "+" : ""}${delay} дн.`,
                    );
                  }
                  lines.push(`Статус: ${aggregatedMainProcessStatus(task)}`);
                } else {
                  if (planD !== null && factD !== null) {
                    lines.push(`Длительность: план ${planD} дн., факт ${factD} дн.`);
                  }
                  const schedDel = scheduleDelayTodayDays(
                    task.planStart,
                    task.planEnd,
                    task.factStart,
                    task.factEnd,
                  );
                  if (schedDel !== null) {
                    lines.push(
                      `Отставание графика на сегодня: ${schedDel > 0 ? "+" : ""}${schedDel} дн.`,
                    );
                  }
                  const dev = calculateDeviation(task);
                  if (dev !== null) {
                    lines.push(`Отклонение по сроку окончания: ${dev > 0 ? "+" : ""}${dev} дн.`);
                  }
                }
                const pk = task.projectPartKey ?? partIdToProjectPartKey(task.partId);
                lines.push(`Объект: ${pk === "parking" ? "автостоянка" : "жилой дом"}`);
                return lines;
              },
            },
          },
        },
        scales: {
          x: {
            type: "linear",
            min: 0,
            max: maxSerial,
            grid: { color: "rgba(148,163,184,0.12)" },
            border: { display: false },
            ticks: {
              color: "#94a3b8",
              maxTicksLimit: 14,
              font: { size: 10 },
              callback: (tickValue: string | number) => {
                const v = typeof tickValue === "number" ? tickValue : Number(tickValue);
                if (!Number.isFinite(v)) return "";
                return addDaysFromOrigin(origin, v).toLocaleDateString("ru-RU", {
                  day: "numeric",
                  month: "short",
                  year: "2-digit",
                });
              },
            },
            title: {
              display: false,
            },
          },
          y: {
            type: "category",
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: "#94a3b8",
              font: { size: 10 },
              autoSkip: false,
            },
          },
        },
      } as any}
        />
      </div>
      <div className="w-full shrink-0 pt-2">
        <AnalyticsLegendList>
          <AnalyticsLegendItem markerColor={planLegendMarker} label="План" />
          <AnalyticsLegendItem markerColor={legendFactColor} label="Факт" />
        </AnalyticsLegendList>
      </div>
    </div>
  );
}

const QUARTER_FILTER_BUTTONS: { value: number; label: string; range: string }[] = [
  { value: 1, label: "Q1", range: "Янв–Мар" },
  { value: 2, label: "Q2", range: "Апр–Июн" },
  { value: 3, label: "Q3", range: "Июл–Сен" },
  { value: 4, label: "Q4", range: "Окт–Дек" },
];

const MONTH_FILTER_BUTTONS: { value: number; label: string }[] = [
  { value: 1, label: "Янв" },
  { value: 2, label: "Фев" },
  { value: 3, label: "Мар" },
  { value: 4, label: "Апр" },
  { value: 5, label: "Май" },
  { value: 6, label: "Июн" },
  { value: 7, label: "Июл" },
  { value: 8, label: "Авг" },
  { value: 9, label: "Сен" },
  { value: 10, label: "Окт" },
  { value: 11, label: "Ноя" },
  { value: 12, label: "Дек" },
];

function periodFilterToArgs(f: PlanFactChartFilter): {
  filterType: PlanFactPeriodFilterType;
  value?: number;
} | null {
  if (f.filterType === "all") return { filterType: "all" };
  if (f.filterType === "month") return { filterType: "month", value: f.value };
  if (f.filterType === "quarter") return { filterType: "quarter", value: f.value };
  return null;
}

function filterChipClass(active: boolean) {
  return [
    "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
    active
      ? "border-sky-400/80 bg-sky-500/25 text-sky-100 shadow-[0_0_0_1px_rgba(56,189,248,0.35)]"
      : "border-slate-600 bg-slate-900/35 text-slate-300 hover:border-slate-500 hover:bg-slate-800/50",
  ].join(" ");
}

function inferGroup(task: GPRTask): GroupKey {
  const n = `${task.code} ${task.name}`.toLowerCase();
  if (/благоустрой|озелен|тротуар|покрыт|дорож|асфальт/.test(n)) return "improve";
  if (/сет|теплов|водопровод|канализ|электр|слаботоч/.test(n)) return "network";
  if (/подготов|снос|вынос|времен|площадк|территор/.test(n)) return "prep";
  return "build";
}

/**
 * Общий % по части: взвешенное по длительности плана выполнение корневых этапов
 * (prep*prepDuration + build*buildDuration + …) / sum(planDuration).
 * Не требует полных фактов по срокам — опирается на % выполнения карточек этапов.
 * totalDeviation — взвешенное по плану отклонение по сроку (цвет карточки).
 */
function computePartAggregate(
  tasks: GPRTask[],
  rootCodes: readonly string[],
  partKey: ProjectPartKey,
): {
  totalPercent: number | null;
  totalDeviation: number | null;
  stages: AggregateStageBreakdown[];
} {
  let weightedCompletionSum = 0;
  let sumPlanForCompletionWeight = 0;
  let weightedDevSum = 0;
  let sumPlanForDeviationWeight = 0;
  let sumPlanForWeights = 0;
  const stages: AggregateStageBreakdown[] = [];

  let residentialStageIndex = 0;
  for (const code of rootCodes) {
    const t = tasks.find(
      (x) => x.code.trim() === code && (x.level ?? x.code.split(".").length - 1) === 1,
    );
    if (!t) continue;

    const planD = daysInclusive(t.planStart, t.planEnd);
    if (planD !== null && planD > 0) sumPlanForWeights += planD;

    const composeTitle =
      partKey === "residential" && residentialStageIndex < RESIDENTIAL_AGGREGATE_STAGE_TITLES.length
        ? RESIDENTIAL_AGGREGATE_STAGE_TITLES[residentialStageIndex]!
        : t.name;
    const weightShortLabel =
      partKey === "residential" && residentialStageIndex < RESIDENTIAL_WEIGHT_LABELS.length
        ? RESIDENTIAL_WEIGHT_LABELS[residentialStageIndex]!
        : shortWeightLabelForPart(t.name, residentialStageIndex);
    residentialStageIndex += 1;

    const c = Math.max(0, Math.min(100, Number(t.completion) || 0));
    stages.push({
      composeTitle,
      weightShortLabel,
      completion: c,
      planDays: planD,
      weightPercent: null,
    });

    if (planD !== null && planD > 0) {
      weightedCompletionSum += c * planD;
      sumPlanForCompletionWeight += planD;
    }

    const d = calculateDeviation(t);
    if (d !== null && planD !== null && planD > 0) {
      weightedDevSum += d * planD;
      sumPlanForDeviationWeight += planD;
    }
  }

  if (sumPlanForWeights > 0) {
    for (const s of stages) {
      if (s.planDays !== null && s.planDays > 0) {
        s.weightPercent = Math.round((s.planDays / sumPlanForWeights) * 1000) / 10;
      }
    }
  }

  const totalPercent =
    sumPlanForCompletionWeight > 0
      ? Math.round((weightedCompletionSum / sumPlanForCompletionWeight) * 10) / 10
      : null;

  const totalDeviation =
    sumPlanForDeviationWeight > 0
      ? weightedDevSum / sumPlanForDeviationWeight
      : null;

  return { totalPercent, totalDeviation, stages };
}

/** Цвет этапа только по отклонению корневой работы (как у карточек % выполнения). */
function stageAccentFromTotalDeviation(totalDeviation: number | null): string {
  if (totalDeviation === null) return "#64748b";
  const status = getProjectStatus(totalDeviation);
  if (status === "success") return COLORS.green;
  if (status === "warning") return COLORS.yellow;
  return COLORS.red;
}

function trafficStatusForTask(task: GPRTask): {
  status: Traffic;
  planDays: number | null;
  factDays: number | null;
  deviationDays: number | null;
} {
  const planDays = daysInclusive(task.planStart, task.planEnd);
  if (planDays === null) return { status: "gray", planDays: null, factDays: null, deviationDays: null };
  const factDays = daysInclusive(task.factStart, task.factEnd);
  const deviationDays = calculateDeviation(task);
  if (deviationDays === null) return { status: "gray", planDays, factDays, deviationDays: null };
  const st = getStatusByDeviation(deviationDays);
  return { status: st as Traffic, planDays, factDays, deviationDays };
}

function kpiCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: keyof typeof COLORS;
}) {
  return (
    <div className="rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-slate-300">{label}</div>
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: COLORS[color] }}
          aria-hidden
        />
      </div>
      <div className="mt-2 text-3xl font-bold text-slate-50 tabular-nums">{value}</div>
    </div>
  );
}

function getProjectCompletion(tasks: GPRTask[]) {
  const all = flattenTasks(tasks);
  if (all.length === 0) return 0;
  const avg = all.reduce((sum, task) => sum + task.completion, 0) / all.length;
  return Math.round(avg);
}

export function GPRAnalytics({
  tasks,
  mode,
  activePartId,
  planFactDataSource = "tasks",
}: {
  tasks: GPRTask[];
  mode: "edit" | "view";
  /** Часть проекта для графика «ГПР — ТМЦ» (только ТМЦ этой части). */
  activePartId: number;
  /** Источник данных для «План vs Факт»: таблица ГПР или `kvartaly_gpr_quarterly.json`. */
  planFactDataSource?: "tasks" | "kvartaly";
}) {
  const pathname = usePathname();
  const isPresentationRoute = pathname.startsWith("/presentation");
  const activeProjectPart = partIdToProjectPartKey(activePartId);
  const activePartLabel =
    PROJECT_PARTS.find((p) => p.id === activePartId)?.name ?? "Часть проекта";

  /** Только задачи выбранной части (жилой дом / автостоянка) — ГПР, donut, «План vs Факт». */
  const tasksForActivePart = useMemo(
    () => tasks.filter((t) => t.partId === activePartId),
    [tasks, activePartId],
  );

  const partProgressAggregate = useMemo(
    () =>
      computePartAggregate(
        tasksForActivePart,
        AGGREGATE_ROOT_CODES_BY_PART[activeProjectPart],
        activeProjectPart,
      ),
    [tasksForActivePart, activeProjectPart],
  );
  const orderedStageRoots = useMemo(() => {
    const codes = AGGREGATE_ROOT_CODES_BY_PART[activeProjectPart];
    return codes
      .map((code) =>
        tasksForActivePart.find(
          (t) =>
            t.code.trim() === code && (t.level ?? t.code.split(".").length - 1) === 1,
        ),
      )
      .filter((t): t is GPRTask => t != null);
  }, [tasksForActivePart, activeProjectPart]);

  /** Сид + localStorage (как в TMCSection), затем жёсткая фильтрация по части проекта для графика. */
  const tmcItemsForPart = useMemo(() => {
    if (typeof window === "undefined") {
      return getTmcData(activeProjectPart);
    }
    try {
      const raw = window.localStorage.getItem("gordo_tmc_snapshot");
      const merged = mergeTmcSnapshotWithSeed(raw ? (JSON.parse(raw) as unknown) : undefined);
      return filterTmcByProjectPart(merged, activeProjectPart);
    } catch {
      return getTmcData(activeProjectPart);
    }
  }, [activeProjectPart]);
  const metrics = getProjectStats(tasksForActivePart);
  const projectCompletion = getProjectCompletion(tasksForActivePart);
  const flatTasks = flattenTasks(tasksForActivePart);
  const kvartalyAllFlat = useMemo(
    () =>
      planFactDataSource === "kvartaly" ? flattenTasks(kvartalyRowsToGprTasksForAllParts()) : [],
    [planFactDataSource],
  );
  const residentialKvartalyTasks = useMemo(
    () => kvartalyAllFlat.filter((t) => t.partId === PROJECT_PART_KEY_TO_ID.residential),
    [kvartalyAllFlat],
  );
  const parkingKvartalyTasks = useMemo(
    () => kvartalyAllFlat.filter((t) => t.partId === PROJECT_PART_KEY_TO_ID.parking),
    [kvartalyAllFlat],
  );
  const projectStatus = getStatusByDeviation(metrics.avgDeviation);
  const todayIso = new Date().toISOString().slice(0, 10);
  const [activeGroup, setActiveGroup] = useState<GroupKey | null>(null);
  const [planFactFilter, setPlanFactFilter] = useState<PlanFactChartFilter>({ filterType: "all" });
  const [planFactKvartalyGranularity, setPlanFactKvartalyGranularity] =
    useState<PlanFactKvartalyGranularity>("overview");
  const [tenderRevision, setTenderRevision] = useState(0);

  useEffect(() => {
    const bump = () => setTenderRevision((x) => x + 1);
    window.addEventListener("gordo-tenders-saved", bump);
    return () => window.removeEventListener("gordo-tenders-saved", bump);
  }, []);

  useEffect(() => {
    setActiveGroup(null);
  }, [activeProjectPart]);

  useEffect(() => {
    setPlanFactFilter({ filterType: "all" });
  }, [activePartId]);

  useEffect(() => {
    setPlanFactKvartalyGranularity("overview");
  }, [activePartId]);

  const residentialKvartalyForChart = useMemo(() => {
    if (planFactDataSource !== "kvartaly") return [];
    if (planFactKvartalyGranularity === "aggregated") {
      return aggregateToMainProcesses(residentialKvartalyTasks);
    }
    return residentialKvartalyTasks;
  }, [planFactDataSource, planFactKvartalyGranularity, residentialKvartalyTasks]);

  const parkingKvartalyForChart = useMemo(() => {
    if (planFactDataSource !== "kvartaly") return [];
    if (planFactKvartalyGranularity === "aggregated") {
      return aggregateToMainProcesses(parkingKvartalyTasks);
    }
    return parkingKvartalyTasks;
  }, [planFactDataSource, planFactKvartalyGranularity, parkingKvartalyTasks]);

  const planFactFlatTasks = useMemo(() => {
    if (planFactDataSource === "kvartaly") {
      return activePartId === PROJECT_PART_KEY_TO_ID.parking
        ? parkingKvartalyForChart
        : residentialKvartalyForChart;
    }
    return flattenTasks(tasksForActivePart);
  }, [
    planFactDataSource,
    activePartId,
    parkingKvartalyForChart,
    residentialKvartalyForChart,
    tasksForActivePart,
  ]);

  const tendersForActivePart: Tender[] = useMemo(() => {
    void tenderRevision;
    const merged =
      typeof window !== "undefined"
        ? mergeTenderSnapshotWithSeed(readTenderSnapshotFromStorage())
        : mergeTenderSnapshotWithSeed(undefined);
    return merged.filter((t) => t.partId === activePartId);
  }, [activePartId, tenderRevision]);

  const planFactFilteredTasks = useMemo(() => {
    if (planFactDataSource === "kvartaly") return planFactFlatTasks;
    const args = periodFilterToArgs(planFactFilter);
    if (!args) return planFactFlatTasks;
    return filterByPeriod(planFactFlatTasks, args.filterType, args.value);
  }, [planFactDataSource, planFactFlatTasks, planFactFilter]);

  const quarterlyBucketsAll = useMemo((): QuarterlyAggregateBucket[] => {
    if (planFactDataSource !== "kvartaly") return [];
    return computeQuarterlyAggregatesFromTasks(planFactFlatTasks);
  }, [planFactDataSource, planFactFlatTasks]);

  const kvartalyGanttEnabled = planFactDataSource === "kvartaly";
  const mRes = useKvartalyGanttModel(
    residentialKvartalyForChart,
    planFactFilter,
    kvartalyGanttEnabled && activePartId === PROJECT_PART_KEY_TO_ID.residential,
    planFactKvartalyGranularity,
  );
  const mPark = useKvartalyGanttModel(
    parkingKvartalyForChart,
    planFactFilter,
    kvartalyGanttEnabled && activePartId === PROJECT_PART_KEY_TO_ID.parking,
    planFactKvartalyGranularity,
  );

  const kvartalyActiveModel =
    activePartId === PROJECT_PART_KEY_TO_ID.parking ? mPark : mRes;

  const timelineYearsAvailable = useMemo(
    () => distinctYearsFromBuckets(quarterlyBucketsAll),
    [quarterlyBucketsAll],
  );

  /** Задачи с полными интервалами план/факт — режим `tasks` (ось X — работы). */
  const planFactChartRows = useMemo((): PlanFactDurationRow[] => {
    if (planFactDataSource === "kvartaly") return [];
    const codeUses = new Map<string, number>();
    for (const task of planFactFilteredTasks) {
      const c = task.code.trim();
      codeUses.set(c, (codeUses.get(c) ?? 0) + 1);
    }
    const rows = planFactFilteredTasks
      .map((task) => {
        const plan = daysInclusive(task.planStart, task.planEnd);
        const fact =
          task.factStart && task.factEnd ? daysInclusive(task.factStart, task.factEnd) : null;
        if (plan === null || fact === null) return null;
        if (!Number.isFinite(plan) || !Number.isFinite(fact)) return null;
        if (plan <= 0 || fact <= 0) return null;
        const durationDev = fact - plan;
        const short = shortGprCodeForAxis(task.code);
        const dupCode = (codeUses.get(task.code.trim()) ?? 0) > 1;
        const xLabel =
          dupCode && task.kvartalyQuarter ? `${short} (${task.kvartalyQuarter})` : short;
        return {
          task,
          plan,
          fact,
          durationDev,
          xLabel,
        };
      })
      .filter((r): r is PlanFactDurationRow => r != null);
    rows.sort((a, b) => {
      const byStage = planRootStageCode(a.task.code).localeCompare(planRootStageCode(b.task.code), undefined, {
        numeric: true,
      });
      if (byStage !== 0) return byStage;
      return a.task.code.localeCompare(b.task.code, undefined, { numeric: true });
    });
    return rows;
  }, [planFactDataSource, planFactFilteredTasks]);

  const planFactSummary = useMemo(() => {
    if (planFactDataSource === "kvartaly") {
      return kvartalyActiveModel.planFactSummary;
    }
    if (planFactChartRows.length === 0) return null;
    const avg =
      planFactChartRows.reduce((s, r) => s + r.durationDev, 0) / planFactChartRows.length;
    const severeLate = planFactChartRows.filter((r) => r.durationDev > 14).length;
    return { avg, severeLate };
  }, [planFactDataSource, kvartalyActiveModel.planFactSummary, planFactChartRows]);

  const traffic = useMemo(() => {
    const counts = { green: 0, yellow: 0, red: 0, gray: 0 };
    const rows: TrafficRow[] = flatTasks.map((t) => ({ task: t, ...trafficStatusForTask(t) }));
    for (const r of rows) counts[r.status] += 1;
    return { counts, rows };
  }, [flatTasks]);

  const {
    totalPercent: aggTotalPercent,
    totalDeviation: aggTotalDeviation,
    stages: aggregateStages,
  } = partProgressAggregate;

  const aggregateProblemSignals = useMemo(
    () => computeTmcProblemSignals(tasksForActivePart, tmcItemsForPart, todayIso),
    [tasksForActivePart, tmcItemsForPart, todayIso],
  );

  const [aggregatePopoverOpen, setAggregatePopoverOpen] = useState(false);
  const [aggregatePopoverPos, setAggregatePopoverPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [aggregatePopoverEntered, setAggregatePopoverEntered] = useState(false);
  const aggregateCardRef = useRef<HTMLButtonElement>(null);
  const aggregatePopoverRef = useRef<HTMLDivElement>(null);
  const [aggregatePortalMounted, setAggregatePortalMounted] = useState(false);

  useEffect(() => {
    setAggregatePortalMounted(true);
  }, []);

  useEffect(() => {
    if (!aggregatePopoverOpen) return;
    setAggregatePopoverEntered(false);
    const id = requestAnimationFrame(() => setAggregatePopoverEntered(true));
    return () => cancelAnimationFrame(id);
  }, [aggregatePopoverOpen]);

  useEffect(() => {
    if (!aggregatePopoverOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (aggregateCardRef.current?.contains(t)) return;
      if (aggregatePopoverRef.current?.contains(t)) return;
      setAggregatePopoverOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAggregatePopoverOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [aggregatePopoverOpen]);

  useEffect(() => {
    if (!aggregatePopoverOpen) return;
    const place = () => {
      const el = aggregateCardRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const w = Math.min(360, window.innerWidth - 24);
      const left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12));
      setAggregatePopoverPos({ top: r.bottom + 8, left });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [aggregatePopoverOpen]);

  const statusDistributionGroups = useMemo(() => {
    const m: Record<Traffic, TrafficRow[]> = { green: [], yellow: [], red: [], gray: [] };
    for (const r of traffic.rows) m[r.status].push(r);
    m.green.sort((a, b) => (a.deviationDays ?? 0) - (b.deviationDays ?? 0));
    m.yellow.sort((a, b) => (b.deviationDays ?? 0) - (a.deviationDays ?? 0));
    m.red.sort((a, b) => (b.deviationDays ?? 0) - (a.deviationDays ?? 0));
    m.gray.sort((a, b) => a.task.name.localeCompare(b.task.name, "ru"));
    return m;
  }, [traffic.rows]);

  const statusDonutData = useMemo((): StatusDonutSlice[] => {
    const slice = (status: Traffic, name: string, fill: string): StatusDonutSlice => {
      const rows = statusDistributionGroups[status];
      return {
        status,
        name,
        value: rows.length,
        fill,
        items: rows.map(formatStatusDonutItemLine),
      };
    };
    return [
      slice("green", "В срок", "url(#greenGrad)"),
      slice("yellow", "Риск", "url(#yellowGrad)"),
      slice("red", "Отставание", "url(#redGrad)"),
      slice("gray", "Нет данных", "url(#grayGrad)"),
    ];
  }, [statusDistributionGroups]);

  /** Риск проекта (%) по долям в срок / риск / отставание; «Нет данных» не входит в total. */
  const statusDistributionProjectRisk = useMemo(() => {
    const green = traffic.counts.green;
    const yellow = traffic.counts.yellow;
    const red = traffic.counts.red;
    const total = green + yellow + red;
    if (total === 0) {
      return {
        mainText: "—",
        mainColor: "#cbd5e1",
        textGlow: "0 0 10px rgba(148, 163, 184, 0.22)",
      };
    }
    const riskScore = Math.round(((yellow * 0.5 + red * 1.0) / total) * 100);
    if (riskScore <= 20) {
      return {
        mainText: `${riskScore}%`,
        mainColor: COLORS.green,
        textGlow: "0 0 10px rgba(34, 197, 94, 0.28)",
      };
    }
    if (riskScore <= 50) {
      return {
        mainText: `${riskScore}%`,
        mainColor: "#f59e0b",
        textGlow: "0 0 10px rgba(245, 158, 11, 0.35)",
      };
    }
    return {
      mainText: `${riskScore}%`,
      mainColor: COLORS.red,
      textGlow: "0 0 10px rgba(239, 68, 68, 0.3)",
    };
  }, [traffic.counts.green, traffic.counts.yellow, traffic.counts.red]);

  const tasksWithoutFactForStatusDistribution = useMemo(
    () => tasksForActivePart.some((t) => !t.factEnd),
    [tasksForActivePart],
  );

  const hasScheduleDeviationsForStatusDistribution = useMemo(
    () => traffic.rows.some((r) => r.deviationDays !== null && r.deviationDays > 0),
    [traffic.rows],
  );

  const hasTmcDelaysForStatusDistribution =
    aggregateProblemSignals.notPurchased || aggregateProblemSignals.overdueDelivery;

  const tenderRiskForStatusDistribution = useMemo(() => {
    const stages = new Set<string>();
    for (const t of tendersForActivePart) {
      const s = getGprStageFromTenderCode(t.code);
      if (s) stages.add(s);
    }
    let delayed = 0;
    let risk = 0;
    for (const s of stages) {
      const ins = buildTenderStageInsight(tendersForActivePart, s);
      delayed += ins.delayed;
      risk += ins.risk;
    }
    return { delayed, risk };
  }, [tendersForActivePart]);

  const statusDistributionReasons = useMemo(
    () =>
      [
        hasTmcDelaysForStatusDistribution ? "Есть просрочки по ТМЦ" : null,
        hasScheduleDeviationsForStatusDistribution ? "Есть отклонения по срокам" : null,
        tasksWithoutFactForStatusDistribution ? "Есть задачи без факта" : null,
        tenderRiskForStatusDistribution.delayed > 0
          ? `Задержка тендеров по договору (${tenderRiskForStatusDistribution.delayed})`
          : null,
        tenderRiskForStatusDistribution.risk > 0 && tenderRiskForStatusDistribution.delayed === 0
          ? `Риск по тендерам (1–14 дн.): ${tenderRiskForStatusDistribution.risk}`
          : null,
      ].filter((x): x is string => x != null),
    [
      hasTmcDelaysForStatusDistribution,
      hasScheduleDeviationsForStatusDistribution,
      tasksWithoutFactForStatusDistribution,
      tenderRiskForStatusDistribution.delayed,
      tenderRiskForStatusDistribution.risk,
    ],
  );

  const primaryStatusDistributionProblem = useMemo(() => {
    const red = traffic.rows.filter((r) => r.status === "red");
    if (red.length > 0) {
      const w = red.reduce((a, b) =>
        (a.deviationDays ?? 0) >= (b.deviationDays ?? 0) ? a : b,
      );
      const g = inferGroup(w.task);
      const stageTitle = gprStageDisplayTitle(tasksForActivePart, g);
      return `отставание на этапе «${stageTitle}»`;
    }
    const yellow = traffic.rows.filter((r) => r.status === "yellow");
    if (yellow.length > 0) {
      const w = yellow.reduce((a, b) =>
        (a.deviationDays ?? 0) >= (b.deviationDays ?? 0) ? a : b,
      );
      const g = inferGroup(w.task);
      const stageTitle = gprStageDisplayTitle(tasksForActivePart, g);
      return `риски сроков на этапе «${stageTitle}»`;
    }
    if (hasTmcDelaysForStatusDistribution) return "просрочки и дефицит по ТМЦ";
    if (tasksWithoutFactForStatusDistribution) return "задачи без фактического завершения по срокам";
    return "критических проблем не выявлено";
  }, [
    traffic.rows,
    tasksForActivePart,
    hasTmcDelaysForStatusDistribution,
    tasksWithoutFactForStatusDistribution,
  ]);

  const [statusDistributionPopoverOpen, setStatusDistributionPopoverOpen] = useState(false);
  const [statusDistributionPopoverPos, setStatusDistributionPopoverPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [statusDistributionPopoverEntered, setStatusDistributionPopoverEntered] = useState(false);
  const statusDistributionCardRef = useRef<HTMLButtonElement>(null);
  const statusDistributionPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!statusDistributionPopoverOpen) return;
    setStatusDistributionPopoverEntered(false);
    const id = requestAnimationFrame(() => setStatusDistributionPopoverEntered(true));
    return () => cancelAnimationFrame(id);
  }, [statusDistributionPopoverOpen]);

  useEffect(() => {
    if (!statusDistributionPopoverOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (statusDistributionCardRef.current?.contains(t)) return;
      if (statusDistributionPopoverRef.current?.contains(t)) return;
      setStatusDistributionPopoverOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStatusDistributionPopoverOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [statusDistributionPopoverOpen]);

  useEffect(() => {
    if (!statusDistributionPopoverOpen) return;
    const place = () => {
      const el = statusDistributionCardRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const w = Math.min(400, window.innerWidth - 24);
      const left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12));
      const estimatedH = Math.min(560, Math.max(320, window.innerHeight * 0.78));
      const gap = 8;
      const canPlaceBelow = r.bottom + gap + estimatedH <= window.innerHeight - 12;
      const top = canPlaceBelow
        ? r.bottom + gap
        : Math.max(12, Math.min(window.innerHeight - estimatedH - 12, r.top - gap - estimatedH));
      setStatusDistributionPopoverPos({ top, left });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [statusDistributionPopoverOpen]);

  const scheduleLagForAggregate =
    aggTotalDeviation !== null && aggTotalDeviation > 0;
  const aggregatePopoverExplanation = useMemo(
    () =>
      buildAggregateProgressPopoverExplanation(
        activeProjectPart,
        aggregateStages,
        {
          notPurchased: aggregateProblemSignals.notPurchased,
          overdueDelivery: aggregateProblemSignals.overdueDelivery,
        },
        scheduleLagForAggregate,
      ),
    [
      activeProjectPart,
      aggregateStages,
      aggregateProblemSignals.notPurchased,
      aggregateProblemSignals.overdueDelivery,
      scheduleLagForAggregate,
    ],
  );
  const deviationUiAgg =
    aggTotalDeviation === null ? null : getStatusByDeviation(aggTotalDeviation);
  const statusAgg: Traffic =
    aggTotalDeviation === null ? "gray" : (deviationUiAgg as Traffic);
  const accentAgg = stageAccentFromTotalDeviation(aggTotalDeviation);
  const aggPctDisplay =
    aggTotalPercent === null
      ? "—"
      : `${aggTotalPercent % 1 === 0 ? String(Math.round(aggTotalPercent)) : aggTotalPercent.toFixed(1)}%`;
  const aggBarPct =
    aggTotalPercent === null ? 0 : Math.max(0, Math.min(100, aggTotalPercent));

  const handleAggregateCardClick = () => {
    if (aggregatePopoverOpen) {
      setAggregatePopoverOpen(false);
      return;
    }
    setStatusDistributionPopoverOpen(false);
    const el = aggregateCardRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const w = Math.min(360, window.innerWidth - 24);
      const left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12));
      setAggregatePopoverPos({ top: r.bottom + 8, left });
    }
    setAggregatePopoverOpen(true);
  };

  const handleStatusDistributionClick = () => {
    if (statusDistributionPopoverOpen) {
      setStatusDistributionPopoverOpen(false);
      return;
    }
    setAggregatePopoverOpen(false);
    const el = statusDistributionCardRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const w = Math.min(400, window.innerWidth - 24);
      const left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12));
      const estimatedH = Math.min(560, Math.max(320, window.innerHeight * 0.78));
      const gap = 8;
      const canPlaceBelow = r.bottom + gap + estimatedH <= window.innerHeight - 12;
      const top = canPlaceBelow
        ? r.bottom + gap
        : Math.max(12, Math.min(window.innerHeight - estimatedH - 12, r.top - gap - estimatedH));
      setStatusDistributionPopoverPos({ top, left });
    }
    setStatusDistributionPopoverOpen(true);
  };

  const aggregateLagDaysRounded =
    aggTotalDeviation !== null && aggTotalDeviation > 0
      ? Math.round(aggTotalDeviation)
      : null;
  const aggregateProblemsList = [
    aggregateProblemSignals.notPurchased ? "Не закуплен материал (из ТМЦ)" : null,
    aggregateLagDaysRounded !== null
      ? `Есть отставание (+${aggregateLagDaysRounded} дн.)`
      : null,
    aggregateProblemSignals.overdueDelivery ? "Заблокировано" : null,
    tenderRiskForStatusDistribution.delayed > 0 || tenderRiskForStatusDistribution.risk > 0
      ? "Влияние тендеров: по кодам этапов есть отклонения дат договоров от плана"
      : null,
  ].filter((x): x is string => x != null);

  if (mode === "edit") {
    return (
      <section className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <div className="rounded bg-slate-50 p-3">
              <p className="text-slate-500">Всего задач</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{metrics.total}</p>
            </div>
            <div className="rounded bg-slate-50 p-3">
              <p className="text-slate-500">Завершено</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{metrics.completed}</p>
            </div>
            <div className="rounded bg-slate-50 p-3">
              <p className="text-slate-500">Просрочено</p>
              <p className="mt-1 text-xl font-semibold text-rose-600">{metrics.overdue}</p>
            </div>
            <div className="rounded bg-slate-50 p-3">
              <p className="text-slate-500">Ср. отклонение</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">
                {metrics.avgDeviation > 0 ? "+" : ""}
                {metrics.avgDeviation} дн.
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="top-cards">
        {orderedStageRoots.map((task) => {
          const deviation = calculateDeviation(task);
          const deviationLabel =
            deviation === null ? "—" : deviation > 0 ? `+${deviation}` : `${deviation}`;
          const progress = task.completion || 0;
          const isNoData = progress === 0;
          const deviationUi = deviation === null ? null : getStatusByDeviation(deviation);
          const status: Traffic =
            isNoData || deviation === null ? "gray" : (deviationUi as Traffic);
          const accent =
            status === "green"
              ? COLORS.green
              : status === "yellow"
                ? COLORS.yellow
                : status === "red"
                  ? COLORS.red
                  : "#64748b";
          return (
            <div
              key={task.id}
              data-traffic-card={status}
              className="top-card card relative w-full overflow-hidden p-6"
            >
              <div>
                <div className="text-base font-semibold text-[#E6EDF3]">{task.name}</div>
                <div className="mt-3 flex items-end justify-between gap-4">
                  <div>
                    <div className="text-sm text-[#E6EDF3]/85">% выполнения</div>
                    <div className="mt-1 text-[34px] font-bold tabular-nums leading-none text-[#E6EDF3]">
                      {task.completion}%
                    </div>
                  </div>
                  <div className="text-right text-sm text-[#E6EDF3]/85">
                    <div className="text-xs text-[#E6EDF3]/70">Отклонение</div>
                    <div
                      className="mt-1 text-lg font-semibold tabular-nums"
                      style={{
                        color:
                          deviationUi === null
                            ? COLORS.gray
                            : deviationUi === "green"
                              ? COLORS.green
                              : deviationUi === "yellow"
                                ? COLORS.yellow
                                : COLORS.red,
                      }}
                    >
                      {deviationLabel} дн.
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="h-1.5 w-full rounded-full bg-white/10">
                    <div
                      className="h-1.5 rounded-full"
                      style={{
                        width: `${Math.max(0, Math.min(100, task.completion))}%`,
                        backgroundColor: accent,
                      }}
                      aria-hidden
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <button
          key="part-aggregate"
          type="button"
          ref={aggregateCardRef}
          onClick={handleAggregateCardClick}
          aria-expanded={aggregatePopoverOpen}
          aria-haspopup="dialog"
          title="Нажмите для пояснения расчёта"
          data-traffic-card={statusAgg}
          className="top-card card relative w-full cursor-pointer overflow-hidden p-6 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          <div>
            <div className="text-base font-semibold text-[#E6EDF3]">
              {PART_SHORT_TITLE[activeProjectPart]}
            </div>
            <div className="mt-1 text-xs font-medium text-[#E6EDF3]/75">Общий прогресс</div>
            <div className="mt-3 text-[34px] font-bold tabular-nums leading-none text-[#E6EDF3]">
              {aggPctDisplay}
            </div>
            <div className="mt-4">
              <div className="h-1.5 w-full rounded-full bg-white/10">
                <div
                  className="h-1.5 rounded-full"
                  style={{
                    width: `${aggBarPct}%`,
                    backgroundColor: accentAgg,
                  }}
                  aria-hidden
                />
              </div>
            </div>
          </div>
        </button>
        {aggregatePortalMounted &&
          aggregatePopoverOpen &&
          aggregatePopoverPos &&
          createPortal(
            <div
              ref={aggregatePopoverRef}
              role="dialog"
              aria-label="Пояснение: общий прогресс"
              className={`fixed z-[200] w-[min(360px,calc(100vw-24px))] max-h-[min(520px,85vh)] overflow-y-auto rounded-xl border border-slate-500/45 bg-[#1e293b] p-[14px] shadow-2xl shadow-black/50 transition-all duration-200 ease-out ${
                aggregatePopoverEntered ? "opacity-100 scale-100" : "opacity-0 scale-[0.98]"
              }`}
              style={{
                top: aggregatePopoverPos.top,
                left: aggregatePopoverPos.left,
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="border-b border-white/10 pb-3">
                <div className="text-sm font-semibold text-slate-100">
                  Общий прогресс: {aggPctDisplay}
                </div>
              </div>

              <div className="mt-3 space-y-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Состав
                  </div>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-snug text-slate-300 marker:text-slate-500">
                    {aggregateStages.map((s, i) => (
                      <li key={`agg-stage-${i}`}>
                        {s.composeTitle} — {Math.round(s.completion)}%
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Пояснение
                  </div>
                  <div className="mt-2 space-y-2 text-xs leading-relaxed text-slate-300">
                    {aggregatePopoverExplanation.map((paragraph, i) => (
                      <p key={`agg-expl-${i}`}>{paragraph}</p>
                    ))}
                  </div>
                </div>

                {aggregateProblemsList.length > 0 ? (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Проблемы
                    </div>
                    <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-snug text-slate-300 marker:text-slate-500">
                      {aggregateProblemsList.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )}
      </div>

      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-slate-700/60 bg-[#1e293b] p-6 shadow-sm">
          <div>
            <div className="flex flex-col gap-2">
              <div className="flex min-h-[3rem] flex-row flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                <h3 className="min-w-0 text-lg font-semibold leading-snug text-slate-50">План vs Факт</h3>
                <PlanFactProjectStatusLabel status={projectStatus} />
              </div>
              <p className="text-sm leading-snug text-[#E6EDF3]">
                {planFactDataSource === "kvartaly"
                  ? `Сводка по проекту: план и факт во времени (${activePartLabel}).`
                  : `План и факт по длительности работ, дни (${activePartLabel}).`}
              </p>
            </div>
            {planFactSummary ? (
              <div className="mt-3 border-t border-slate-600/40 pt-3 text-xs text-slate-300">
                {(() => {
                  const avg = planFactSummary.avg;
                  const firstLabel =
                    planFactDataSource === "kvartaly" && planFactKvartalyGranularity === "overview"
                      ? "Отклонение от графика"
                      : planFactDataSource === "kvartaly"
                        ? planFactKvartalyGranularity === "aggregated"
                          ? "Среднее отклонение длительности по видимым процессам (факт − план)"
                          : "Среднее отклонение длительности по видимым работам (факт − план)"
                        : "Среднее отклонение (факт − план)";
                  let primaryLine: string;
                  let primaryColor: string;
                  if (avg < 0) {
                    primaryLine = `Опережение: ${Math.abs(avg).toFixed(1)} дн.`;
                    primaryColor = COLORS.green;
                  } else if (avg > 0) {
                    primaryLine = `Отставание: ${avg.toFixed(1)} дн.`;
                    primaryColor = COLORS.red;
                  } else {
                    primaryLine = "В срок";
                    primaryColor = "#e2e8f0";
                  }
                  return (
                    <>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium leading-snug text-slate-100">{firstLabel}</span>
                        <span
                          className="value text-sm font-semibold leading-snug tabular-nums"
                          style={{ color: primaryColor }}
                        >
                          {primaryLine}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-col gap-1">
                        <span className="font-medium leading-snug text-slate-100">
                          {`Критические отклонения (>14 дн.)`}
                        </span>
                        <span
                          className={`font-semibold tabular-nums ${planFactSummary.severeLate > 0 ? "text-red-400" : "text-slate-100"}`}
                        >
                          {planFactSummary.severeLate}
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : null}
          </div>

          {planFactDataSource === "kvartaly" ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Уровень</span>
              <button
                type="button"
                className={filterChipClass(planFactKvartalyGranularity === "overview")}
                onClick={() => setPlanFactKvartalyGranularity("overview")}
              >
                Обобщенно
              </button>
              <button
                type="button"
                className={filterChipClass(planFactKvartalyGranularity === "aggregated")}
                onClick={() => setPlanFactKvartalyGranularity("aggregated")}
              >
                Укрупнённо
              </button>
              <button
                type="button"
                className={filterChipClass(planFactKvartalyGranularity === "detailed")}
                onClick={() => setPlanFactKvartalyGranularity("detailed")}
              >
                Детально
              </button>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Период</span>
            <button
              type="button"
              className={filterChipClass(planFactFilter.filterType === "all")}
              onClick={() => setPlanFactFilter({ filterType: "all" })}
            >
              Все
            </button>
            {planFactDataSource === "kvartaly" ? (
              <>
                {timelineYearsAvailable.map((y) => {
                  const active = planFactFilter.filterType === "year" && planFactFilter.value === y;
                  return (
                    <button
                      key={y}
                      type="button"
                      className={filterChipClass(active)}
                      onClick={() => setPlanFactFilter({ filterType: "year", value: y })}
                    >
                      {y}
                    </button>
                  );
                })}
                {quarterlyBucketsAll.map((b) => {
                  const active =
                    planFactFilter.filterType === "timelineQuarter" && planFactFilter.key === b.quarter_key;
                  return (
                    <button
                      key={b.quarter_key}
                      type="button"
                      title={b.quarter_key}
                      className={filterChipClass(active)}
                      onClick={() => setPlanFactFilter({ filterType: "timelineQuarter", key: b.quarter_key })}
                    >
                      {b.quarter_label}
                    </button>
                  );
                })}
              </>
            ) : (
              <>
                {QUARTER_FILTER_BUTTONS.map((q) => {
                  const active = planFactFilter.filterType === "quarter" && planFactFilter.value === q.value;
                  return (
                    <button
                      key={q.label}
                      type="button"
                      title={q.range}
                      className={filterChipClass(active)}
                      onClick={() => setPlanFactFilter({ filterType: "quarter", value: q.value })}
                    >
                      {q.label}{" "}
                      <span className="text-[10px] font-normal text-slate-400">({q.range})</span>
                    </button>
                  );
                })}
                {MONTH_FILTER_BUTTONS.map((m) => {
                  const active = planFactFilter.filterType === "month" && planFactFilter.value === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      className={filterChipClass(active)}
                      onClick={() => setPlanFactFilter({ filterType: "month", value: m.value })}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </>
            )}
          </div>

          {planFactDataSource === "kvartaly" && planFactFilter.filterType === "year" ? (
            <p className="mt-3 text-xs font-medium text-slate-400">
              Окно: {planFactFilter.value} год. Показаны работы, чей план пересекается с годом; полосы обрезаны по
              границам года.
            </p>
          ) : null}
          {planFactDataSource === "kvartaly" && planFactFilter.filterType === "timelineQuarter" ? (
            <p className="mt-3 text-xs font-medium text-slate-400">
              Окно: квартал {formatQuarterDisplayLabel(planFactFilter.key)}. Работы с планом, пересекающим квартал.
            </p>
          ) : null}
          {planFactDataSource === "tasks" && planFactFilter.filterType !== "all" ? (
            <p className="mt-3 text-xs font-medium text-slate-400">
              Показаны работы, пересекающие выбранный период
            </p>
          ) : null}

          <div
            className={`mt-4 w-full ${planFactDataSource === "kvartaly" ? "" : "h-[320px]"}`}
          >
            {planFactDataSource === "kvartaly" ? (
              kvartalyAllFlat.length === 0 ? (
                <div className="flex min-h-[280px] w-full items-center justify-center rounded-lg border border-slate-700/50 bg-slate-900/30 px-4 text-center text-sm text-slate-400">
                  Нет строк в kvartaly_gpr_quarterly.json с корректными плановыми датами.
                </div>
              ) : planFactFlatTasks.length === 0 ? (
                <div className="flex min-h-[280px] w-full items-center justify-center rounded-lg border border-slate-700/50 bg-slate-900/30 px-4 text-center text-sm text-slate-400">
                  Нет данных поквартального файла для выбранного объекта («{activePartLabel}»).
                </div>
              ) : (
                <div
                  key={`kvartaly-gantt-${planFactKvartalyGranularity}-${activePartId}-${[...kvartalyActiveModel.ganttRows].map((r) => r.id).sort().join(":")}`}
                  className="w-full"
                  style={{
                    minHeight: planFactKvartalyGranularity === "overview" ? 220 : 280,
                    height: Math.min(
                      1200,
                      Math.max(
                        planFactKvartalyGranularity === "overview" ? 220 : 280,
                        kvartalyActiveModel.ganttRows.length * 24 + 140,
                      ),
                    ),
                  }}
                >
                  <KvartalyGanttChartPanel model={kvartalyActiveModel} />
                </div>
              )
            ) : planFactChartRows.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-lg border border-slate-700/50 bg-slate-900/30 px-4 text-center text-sm text-slate-400">
                {planFactFilter.filterType === "all"
                  ? "Нет задач с парами дат план/факт для расчёта длительности (дни)."
                  : "Нет работ с план/факт, у которых плановый интервал пересекается с выбранным периодом."}
              </div>
            ) : (
              (() => {
                const labels = planFactChartRows.map((r) => r.xLabel);
                const planArr = planFactChartRows.map((r) => r.plan);
                const factArr = planFactChartRows.map((r) => r.fact);
                const maxVal = Math.max(...planFactChartRows.flatMap((r) => [r.plan, r.fact]), 1);
                const yMax = Math.max(60, Math.ceil(maxVal / 20) * 20);

                const factPointColor = (i: number) => {
                  const row = planFactChartRows[i];
                  if (!row) return "#94a3b8";
                  return row.fact <= row.plan ? "#22c55e" : "#ef4444";
                };

                const PLAN_LINE = "rgba(148, 163, 184, 0.6)";
                const PLAN_POINT = "rgba(148, 163, 184, 0.45)";
                const PLAN_POINT_BORDER = "rgba(148, 163, 184, 0.35)";

                const planLineLegendMarker = "#94a3b8";
                const factLineLegendMarker = "#22c55e";

                return (
                  <div className="flex h-full w-full min-h-0 min-w-0 flex-col">
                    <div className="min-h-0 min-w-0 flex-1">
                      <Chart
                    type="line"
                    data={{
                      labels,
                      datasets: [
                        {
                          label: "План",
                          data: planArr,
                          order: 0,
                          borderColor: PLAN_LINE,
                          backgroundColor: "transparent",
                          borderWidth: 2,
                          tension: 0,
                          pointRadius: 2,
                          pointHoverRadius: 4,
                          pointBackgroundColor: PLAN_POINT,
                          pointBorderColor: PLAN_POINT_BORDER,
                          pointBorderWidth: 1,
                          fill: false,
                        },
                        {
                          label: "Факт",
                          data: factArr,
                          order: 1,
                          borderWidth: 3,
                          tension: 0,
                          segment: {
                            borderColor: (ctx: { p1DataIndex: number }) =>
                              factPointColor(ctx.p1DataIndex),
                          },
                          borderColor: "#22c55e",
                          backgroundColor: "transparent",
                          pointRadius: 5,
                          pointHoverRadius: 7,
                          pointBackgroundColor: (ctx: { dataIndex?: number }) =>
                            factPointColor(ctx.dataIndex ?? 0),
                          pointBorderColor: "rgba(255,255,255,0.5)",
                          pointBorderWidth: 1,
                          fill: false,
                        },
                      ],
                    } as any}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      layout: { padding: { top: 10, right: 10, left: 4, bottom: 4 } },
                      interaction: { mode: "index", intersect: false },
                      elements: {
                        line: { borderJoinStyle: "round" as const },
                        point: { hoverBorderWidth: 2 },
                      },
                      plugins: {
                        legend: {
                          display: false,
                        },
                        tooltip: {
                          enabled: true,
                          backgroundColor: "rgba(15,23,42,0.94)",
                          borderColor: "rgba(148,163,184,0.35)",
                          borderWidth: 1,
                          titleColor: "#f8fafc",
                          bodyColor: "#e2e8f0",
                          padding: 10,
                          callbacks: {
                            title: (tooltipItems: { dataIndex?: number }[]) => {
                              const idx = tooltipItems[0]?.dataIndex;
                              if (typeof idx !== "number") return "";
                              const row = planFactChartRows[idx];
                              return row ? row.task.name.trim() : "";
                            },
                            label: (ctx: { datasetIndex?: number; parsed: { y?: number | null } }) => {
                              const y = ctx.parsed.y;
                              if (y == null || typeof y !== "number") return "";
                              if (ctx.datasetIndex === 0) return `План: ${y} дн.`;
                              if (ctx.datasetIndex === 1) return `Факт: ${y} дн.`;
                              return "";
                            },
                            afterBody: (tooltipItems: { dataIndex?: number }[]) => {
                              const idx = tooltipItems[0]?.dataIndex;
                              if (typeof idx !== "number") return [];
                              const row = planFactChartRows[idx];
                              if (!row) return [];
                              const dev = row.durationDev;
                              return [`Отклонение: ${dev > 0 ? "+" : ""}${dev} дн.`];
                            },
                          },
                        },
                      },
                      scales: {
                        x: {
                          grid: { display: false },
                          ticks: {
                            color: "#94a3b8",
                            maxRotation: 0,
                            minRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 12,
                            font: { size: 10 },
                          },
                        },
                        y: {
                          min: 0,
                          max: yMax,
                          grid: { color: "rgba(148,163,184,0.14)" },
                          border: { display: false },
                          title: {
                            display: true,
                            text: "Длительность, дни",
                            color: "#cbd5e1",
                            font: { size: 12, weight: "bold" },
                          },
                          ticks: {
                            color: "#94a3b8",
                            stepSize: 20,
                          },
                        },
                      },
                    } as any}
                      />
                    </div>
                    <div className="w-full shrink-0 pt-2">
                      <AnalyticsLegendList>
                        <AnalyticsLegendItem markerColor={planLineLegendMarker} label="План" />
                        <AnalyticsLegendItem markerColor={factLineLegendMarker} label="Факт" />
                      </AnalyticsLegendList>
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        </div>

        <>
          <button
            type="button"
            ref={statusDistributionCardRef}
            onClick={handleStatusDistributionClick}
            aria-expanded={statusDistributionPopoverOpen}
            aria-haspopup="dialog"
            title="Нажмите для детализации по задачам"
            className="flex h-full w-full cursor-pointer flex-col rounded-2xl border border-slate-700/60 bg-[#1e293b] p-6 text-left shadow-sm transition-colors hover:bg-slate-800/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f172a]"
          >
            <div className="flex flex-col gap-2">
              <div className="flex min-h-[3rem] flex-row flex-wrap items-baseline">
                <h3 className="text-lg font-semibold leading-snug text-slate-50">Распределение статусов</h3>
              </div>
              <p className="text-xs leading-snug text-slate-300">
                Зеленые — факт ≤ план, желтые — отклонение до 14 дн., красные — более 14 дн.
              </p>
            </div>
            <div className="relative mt-4 h-[220px] w-full">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                  <defs>
                    <linearGradient id="greenGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#16a34a" />
                      <stop offset="100%" stopColor="#22c55e" />
                    </linearGradient>
                    <linearGradient id="yellowGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#d97706" />
                      <stop offset="100%" stopColor="#f59e0b" />
                    </linearGradient>
                    <linearGradient id="redGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#dc2626" />
                      <stop offset="100%" stopColor="#ef4444" />
                    </linearGradient>
                    <linearGradient id="grayGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#6b7280" />
                      <stop offset="100%" stopColor="#9ca3af" />
                    </linearGradient>
                  </defs>
                  <Tooltip content={StatusDistributionPieTooltip} />
                  <Pie
                    data={statusDonutData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="45%"
                    innerRadius={52}
                    outerRadius={78}
                    paddingAngle={2}
                    stroke="rgba(255,255,255,0.18)"
                  >
                    {statusDonutData.map((entry) => (
                      <Cell key={entry.status} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              {/*
                Recharts 3: центр KPI — HTML поверх графика (Label+center в v3 не работает в Pie).
                Позиция = Pie margin 10 и cy 45% от внутренней высоты.
              */}
              <div
                className="pointer-events-none absolute left-1/2 flex flex-col items-center justify-center text-center"
                style={{
                  top: "calc(10px + (100% - 20px) * 0.45)",
                  transform: "translate(-50%, -50%)",
                }}
              >
                <div
                  aria-hidden
                  className="absolute left-1/2 top-1/2 aspect-square rounded-full"
                  style={{
                    width: "min(100px, 26%)",
                    minWidth: 76,
                    maxWidth: 104,
                    transform: "translate(-50%, -50%)",
                    backgroundColor: "rgba(255,255,255,0.04)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    boxShadow: "0 0 32px rgba(255,255,255,0.06)",
                  }}
                />
                {/*
                  Единый SVG-якорь (как <text x y textAnchor middle dominantBaseline middle>):
                  центр между строками — маленький dy у процента (-6), затем dy 18 у подписи.
                */}
                <svg
                  className="relative z-[1] cursor-help font-sans pointer-events-auto"
                  width={120}
                  height={72}
                  viewBox="0 0 120 72"
                  overflow="visible"
                  role="img"
                  aria-label={STATUS_DISTRIBUTION_RISK_EXPLANATION}
                >
                  <text
                    x={60}
                    y={36}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{
                      fontFamily:
                        "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
                    }}
                  >
                    <title>{STATUS_DISTRIBUTION_RISK_EXPLANATION}</title>
                    <tspan
                      x={60}
                      dy={-6}
                      fontSize={32}
                      fontWeight={700}
                      style={{
                        fill: statusDistributionProjectRisk.mainColor,
                        fontVariantNumeric: "tabular-nums",
                        textShadow: statusDistributionProjectRisk.textGlow,
                      }}
                    >
                      {statusDistributionProjectRisk.mainText}
                    </tspan>
                    <tspan
                      x={60}
                      dy={18}
                      fontSize={12}
                      fontWeight={500}
                      style={{ fill: "#A3B3C7" }}
                    >
                      Риск проекта
                    </tspan>
                  </text>
                </svg>
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-slate-400">{STATUS_DISTRIBUTION_RISK_EXPLANATION}</p>
            <div className="mt-4 w-full">
              <AnalyticsLegendList>
                <AnalyticsLegendItem
                  markerColor={COLORS.green}
                  label="В срок"
                  value={traffic.counts.green}
                />
                <AnalyticsLegendItem
                  markerColor={COLORS.yellow}
                  label="Риск"
                  value={traffic.counts.yellow}
                />
                <AnalyticsLegendItem
                  markerColor={COLORS.red}
                  label="Отставание"
                  value={traffic.counts.red}
                />
                <AnalyticsLegendItem
                  markerColor={COLORS.gray}
                  label="Нет данных"
                  value={traffic.counts.gray}
                />
              </AnalyticsLegendList>
            </div>
          </button>
          {aggregatePortalMounted &&
            statusDistributionPopoverOpen &&
            statusDistributionPopoverPos &&
            createPortal(
              <div
                ref={statusDistributionPopoverRef}
                role="dialog"
                aria-label="Распределение статусов: детализация"
                className={`fixed z-[200] w-[min(400px,calc(100vw-24px))] rounded-xl border border-slate-500/45 bg-[#1e293b] shadow-2xl shadow-black/50 transition-all duration-200 ease-out ${
                  statusDistributionPopoverEntered ? "scale-100 opacity-100" : "scale-[0.98] opacity-0"
                }`}
                style={{
                  top: statusDistributionPopoverPos.top,
                  left: statusDistributionPopoverPos.left,
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="border-b border-white/10 p-[14px] pb-3">
                  <div className="text-sm font-semibold text-slate-100">Распределение статусов</div>
                </div>
                <div className="max-h-[min(480px,78vh)] space-y-4 overflow-y-auto p-[14px] pt-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-100">
                      🟢 В срок ({traffic.counts.green}):
                    </div>
                    {statusDistributionGroups.green.length > 0 ? (
                      <StatusDistributionTaskChunk
                        rows={statusDistributionGroups.green}
                        status="green"
                        showDeviation
                      />
                    ) : (
                      <p className="mt-1 text-[11px] text-slate-500">Нет задач в этой категории</p>
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-100">
                      🟡 Риск ({traffic.counts.yellow}):
                    </div>
                    {statusDistributionGroups.yellow.length > 0 ? (
                      <StatusDistributionTaskChunk
                        rows={statusDistributionGroups.yellow}
                        status="yellow"
                        showDeviation
                      />
                    ) : (
                      <p className="mt-1 text-[11px] text-slate-500">Нет задач в этой категории</p>
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-100">
                      🔴 Отставание ({traffic.counts.red}):
                    </div>
                    {statusDistributionGroups.red.length > 0 ? (
                      <StatusDistributionTaskChunk
                        rows={statusDistributionGroups.red}
                        status="red"
                        showDeviation
                      />
                    ) : (
                      <p className="mt-1 text-[11px] text-slate-500">Нет задач в этой категории</p>
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-100">
                      ⚪ Нет данных ({traffic.counts.gray})
                    </div>
                    {statusDistributionGroups.gray.length > 0 ? (
                      <StatusDistributionTaskChunk
                        rows={statusDistributionGroups.gray}
                        status="gray"
                        showDeviation={false}
                      />
                    ) : (
                      <p className="mt-1 text-[11px] text-slate-500">Нет задач в этой категории</p>
                    )}
                  </div>
                </div>
                {statusDistributionReasons.length > 0 ? (
                  <div className="border-t border-white/10 px-[14px] pb-3 pt-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Причины
                    </div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-[11px] text-slate-300 marker:text-slate-500">
                      {statusDistributionReasons.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <p className="border-t border-white/10 p-[14px] pt-3 text-xs leading-relaxed text-slate-400">
                  Основная проблема:{" "}
                  <span className="font-medium text-slate-200">{primaryStatusDistributionProblem}</span>
                </p>
              </div>,
              document.body,
            )}
        </>
      </div>

      {!isPresentationRoute && (
        <div className="rounded-2xl border border-slate-700/60 bg-[#1e293b] p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-50">Этапы / задачи</h3>
          <p className="mt-2 text-xs text-slate-300">
            Слева — статус (светофор). Серый — нет фактических дат.
          </p>

          <div className="mt-4 space-y-2">
            {traffic.rows
              .slice()
              .sort(
                (a: TrafficRow, b: TrafficRow) => (b.deviationDays ?? -999) - (a.deviationDays ?? -999),
              )
              .slice(0, 12)
              .map(({ task, status, planDays, factDays, deviationDays }: TrafficRow) => {
                return (
                  <div
                    key={task.id}
                    data-traffic-card={status}
                    className="flex items-center justify-between gap-4 overflow-hidden p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 break-words text-sm font-semibold leading-snug text-[#E6EDF3]">
                        {task.code} — {task.name}
                      </div>
                      <div className="mt-1 text-xs text-[#E6EDF3]/80">
                        План: {planDays ?? "—"} дн. • Факт: {factDays ?? "—"} дн.
                        {" • "}
                        Откл.:{" "}
                        <span
                          className="font-semibold tabular-nums"
                          style={{
                            color:
                              status === "red"
                                ? COLORS.red
                                : status === "yellow"
                                  ? COLORS.yellow
                                  : status === "green"
                                    ? COLORS.green
                                    : COLORS.gray,
                          }}
                        >
                          {deviationDays === null ? "—" : deviationDays > 0 ? `+${deviationDays}` : deviationDays}
                        </span>
                        {" • "}
                        Период: {fmt(task.planStart)} — {fmt(task.planEnd)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs text-[#E6EDF3]/85">
                      {status === "gray"
                        ? "нет данных"
                        : status === "green"
                          ? "в срок"
                          : status === "yellow"
                            ? "риск"
                            : "отставание"}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-700/60 bg-[#1e293b] p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-50">Отклонения по этапам</h3>
        <p className="mt-2 text-xs text-slate-300">
          Положительное значение — отставание \(Факт дольше Плана\), отрицательное — опережение.
        </p>
        {(() => {
          const MAX = 14;
          const allowedGroupKeys = gprStageGroupKeysForProjectPart(activeProjectPart);

          const devRows = flatTasks
            .filter((t) => (t.level ?? t.code.split(".").length - 1) > 1)
            .map((t) => {
              const deviation = calculateDeviation(t);
              const planDuration = daysInclusive(t.planStart, t.planEnd);
              const factDuration = t.factStart && t.factEnd ? daysInclusive(t.factStart, t.factEnd) : null;
              const group = inferGroup(t);
              return { task: t, deviation, planDuration, factDuration, group };
            });

          const groupCards = allowedGroupKeys
            .map((g) => {
              const rows = devRows.filter((r) => r.group === g);
              const withDev = rows.filter((r) => r.deviation !== null) as Array<
                (typeof rows)[number] & { deviation: number }
              >;
              const avg = withDev.length
                ? withDev.reduce((sum, r) => sum + r.deviation, 0) / withDev.length
                : 0;
              const critical = withDev.filter((r) => getStatusByDeviation(r.deviation) === "red").length;
              const label = gprStageDisplayTitle(tasksForActivePart, g);
              return {
                key: g,
                label,
                rows,
                avg,
                critical,
                withDevCount: withDev.length,
              };
            })
            .filter((card) => card.rows.length > 0);

          const active = activeGroup ? groupCards.find((g) => g.key === activeGroup) ?? null : null;

          const toggleGroup = (group: GroupKey) => {
            setActiveGroup((prev) => (prev === group ? null : group));
          };

          return (
            <div className="mt-4 space-y-4">
              {groupCards.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {groupCards.map((g) => {
                    const activeCard = activeGroup === g.key;
                    const stageCardTone: "green" | "red" | "gray" =
                      g.withDevCount === 0 || g.avg === 0 ? "gray" : g.avg > 0 ? "red" : "green";
                    const avgColor =
                      g.withDevCount === 0 || g.avg === 0
                        ? "#e2e8f0"
                        : g.avg > 0
                          ? COLORS.red
                          : COLORS.green;
                    const avgText =
                      g.withDevCount === 0
                        ? "—"
                        : `${g.avg > 0 ? "+" : ""}${g.avg.toFixed(1)} дн.`;
                    const iconIsLate = g.withDevCount > 0 && g.avg > 0;
                    const iconShellClass = iconIsLate
                      ? "text-[#ef4444] bg-[rgba(239,68,68,0.12)] shadow-[0_0_20px_rgba(239,68,68,0.25)]"
                      : "text-[#22c55e] bg-[rgba(34,197,94,0.12)] shadow-[0_0_20px_rgba(34,197,94,0.25)]";
                    return (
                      <button
                        key={g.key}
                        type="button"
                        onClick={() => toggleGroup(g.key)}
                        aria-pressed={activeCard}
                        data-stage-deviation-card={stageCardTone}
                        className={`relative w-full rounded-2xl pt-4 pb-5 pl-[72px] pr-5 text-left transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1e293b] ${
                          activeCard ? "scale-[1.02]" : ""
                        }`}
                      >
                        <span
                          className={`absolute left-4 top-4 z-10 flex h-12 w-12 items-center justify-center rounded-full ring-1 ring-white/25 ${iconShellClass}`}
                          aria-hidden
                        >
                          <StageDeviationStageIcon groupKey={g.key} />
                        </span>
                        <div className="relative min-w-0">
                          <div
                            className="stage-title text-sm font-semibold leading-snug text-slate-100"
                            title={g.label}
                          >
                            {g.label}
                          </div>
                          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-0">
                            <div className="min-w-0 flex-1">
                              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                Среднее отклонение
                              </div>
                              <div
                                className="value mt-1 text-2xl font-bold leading-tight tabular-nums"
                                style={{ color: avgColor }}
                              >
                                {avgText}
                              </div>
                            </div>
                            <div
                              className="hidden w-px shrink-0 bg-white/10 sm:mx-5 sm:block sm:self-stretch"
                              aria-hidden
                            />
                            <div className="h-px w-full bg-white/10 sm:hidden" aria-hidden />
                            <div className="min-w-0 flex-1">
                              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                Критические отклонения
                              </div>
                              <div className="mt-1 text-xl font-semibold tabular-nums text-slate-200">
                                {g.critical}
                                <span className="text-base font-normal text-slate-500">
                                  {" "}
                                  / {g.withDevCount}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {active ? (
                <div className="rounded-xl border border-slate-700/60 bg-slate-900/25 p-4">
                  <div
                    className="stage-title mb-3 text-sm font-semibold leading-snug text-slate-100"
                    title={active.label}
                  >
                    {active.label}
                  </div>
                  <div>
                    <div className="relative z-10 rounded-xl border border-slate-700/60 bg-slate-900/30 px-4 py-3">
                      <div className="relative h-6 text-[11px] text-slate-400">
                        <span className="absolute left-0 -translate-x-0">-14д</span>
                        <span className="absolute left-1/4 -translate-x-1/2">-7д</span>
                        <span className="absolute left-1/2 -translate-x-1/2 text-slate-200">0</span>
                        <span className="absolute left-3/4 -translate-x-1/2">+7д</span>
                        <span className="absolute right-0 translate-x-0">+14д</span>
                      </div>
                    </div>

                    <div className="relative z-10 mt-3 space-y-3">
                      {active.rows.map((r, i) => {
                        const deviation = r.deviation;
                        const status =
                          deviation === null ? "gray" : getStatusByDeviation(deviation);
                        const color =
                          status === "green"
                            ? COLORS.green
                            : status === "yellow"
                              ? COLORS.yellow
                              : status === "red"
                                ? COLORS.red
                                : COLORS.gray;
                        const raw = deviation ?? 0;
                        const normalized = raw > MAX ? MAX : raw < -MAX ? -MAX : raw;
                        const percent = normalized / MAX; // -1..1
                        const dotLeftPct = 50 + percent * 50;
                        const minLeft = Math.min(50, dotLeftPct);
                        const width = Math.abs(dotLeftPct - 50);
                        const clipped = Math.abs(raw) > MAX;
                        const clipMark = !clipped ? "" : raw > 0 ? " →" : " ←";
                        return (
                          <div
                            key={`dev-line-${active.key}-${r.task.id}-${i}`}
                            className="grid grid-cols-12 items-start gap-3 rounded-xl border border-slate-700/60 bg-slate-900/20 p-3"
                          >
                            <div className="col-span-12 min-w-0 text-sm font-semibold leading-snug text-slate-100 md:col-span-3 line-clamp-2 break-words">
                              {r.task.name}
                            </div>
                            <div className="col-span-12 md:col-span-7">
                              <div className="relative h-7 w-full max-w-[800px] overflow-visible px-6">
                                <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 border-t border-white/10" />
                                <div className="absolute left-1/2 top-1/2 h-4 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded bg-white/30" />
                                <div
                                  className="absolute top-1/2 h-px -translate-y-1/2"
                                  style={{
                                    left: `${minLeft}%`,
                                    width: `${width}%`,
                                    backgroundColor: color,
                                  }}
                                />
                                <div
                                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
                                  style={{
                                    left: `${dotLeftPct}%`,
                                    backgroundColor: color,
                                    boxShadow: `0 0 12px ${color}`,
                                  }}
                                />
                              </div>
                            </div>
                            <div className="col-span-12 text-right text-sm text-slate-200 md:col-span-2">
                              <div className="font-semibold tabular-nums" style={{ color }}>
                                {deviation === null
                                  ? "—"
                                  : `${deviation > 0 ? `+${deviation}` : deviation} дн${clipMark}`}
                              </div>
                              <div className="text-xs text-slate-400">
                                {r.factDuration ?? "—"} / {r.planDuration ?? "—"} дн
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })()}
      </div>

      <GPRTmcDependencyChart
        tasks={tasksForActivePart}
        tmcItems={tmcItemsForPart}
        activeProjectPart={activeProjectPart}
      />
      <GPRTenderDependencyChart
        tasks={tasksForActivePart}
        tenders={tendersForActivePart}
        activeProjectPart={activeProjectPart}
      />
      <GPRForecastChart
        tasks={tasksForActivePart}
        tmcItems={tmcItemsForPart}
        tenders={tendersForActivePart}
        activeProjectPart={activeProjectPart}
      />
    </section>
  );
}
