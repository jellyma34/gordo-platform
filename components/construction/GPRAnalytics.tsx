"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  calculateDeviation,
  filterByPeriod,
  filterGprTasksByObjectScope,
  filterZhDomPlanFactTasksTo205Branch,
  flattenTasks,
  formatGprScheduleDeviationDisplayDays,
  getActualProgressPercent,
  getPlannedProgressPercent,
  getProjectStats,
  getStatusByDeviation,
  getStatusByGprProgressDelta,
  gprTaskScheduleDeviationDisplayDays,
  gprWbsLevelFromCode,
  matchesGprCodeBranch,
  normalizeGprCodeFinal,
  partIdToProjectPartKey,
  planFactEndDeviationDays,
  planRootStageCode,
  PROJECT_PART_KEY_TO_ID,
  PROJECT_PARTS,
  resolveGprTaskEffectivePartId,
  type ConstructionObjectScope,
  type GPRTask,
  type PlanFactPeriodFilterType,
  type ProjectPartKey,
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
import {
  gprStageDisplayTitle,
  gprStageGroupKeysForProjectPart,
  gprStageGroupKeysProjectWide,
  type ForecastPart,
} from "@/lib/gprTmcDependency";
import { useAuth } from "@/components/auth/AuthProvider";
import { listTendersFromDb, listTmcFromDb } from "@/lib/constructionApi";
import { isGprLocalStorageMode } from "@/lib/gprStorageMode";
import { getGprProjectId } from "@/lib/gprImportPersistence";
import { loadPersistedTenderItems } from "@/lib/tenderImportPersistence";
import { loadPersistedTmcItems } from "@/lib/tmcImportPersistence";
import { tmcFactReferenceDate, tmcPlanReferenceDate, type TMCItem } from "@/lib/tmcData";
import {
  buildTenderStageInsight,
  getGprStageFromTenderCode,
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
import {
  buildPlanFactWorkTypeChartModel,
  formatPlanEndMonthYearOnly,
  formatPlanFactGridMonthLabel,
  type PlanFactTasksBarLevel,
} from "@/lib/planFactWorkTypeTimeline";
import { ganttFactColorForScheduleToday } from "@/lib/gprScheduleDelayToday";
import { kvartalyRowsToGprTasksForAllParts } from "@/lib/kvartalyGpr";
import { getProjectStatus } from "@/utils/status";
import { formatDate, resolveGprReportAsOf, toLocalYmd } from "@/lib/gprReportDate";
import {
  computeGprStageFactCompletionPercent,
  computeGprStageCompletionInsight,
  getGprStageWorkItems,
} from "@/lib/gprStageCompletion";
import { GprStageKpiCard } from "@/components/construction/GprStageKpiCard";
import {
  aggregateRootCodesForPart,
  DEFAULT_AGGREGATE_ROOT_CODES_PROJECT,
  findGprCsvRootTask,
  resolveStageCardRootTasks,
} from "@/lib/gprAggregateRoots";
import { buildGprScheduleDeviationInsight } from "@/lib/gprScheduleDeviationInsight";
import {
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/charting/rechartsClient";
import { Chart } from "@/components/charting/reactChartjsChart";

/** Полный нормализованный шифр для подписи строк (включая подзадачи `2.05.01.1`, без усечения до `2.05.XX`). */
function gprFullCodeForChartAxis(code: string): string {
  const n = normalizeGprCodeFinal(code);
  return n || code.trim();
}

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

type PlanFactMonthTodayLineOpts = { x: number | null };

/** Вертикаль «Сегодня» на шкале в месяцах (плавающие bar по видам работ). */
const planFactMonthTodayLinePlugin: Plugin<"bar"> = {
  id: "planFactMonthToday",
  beforeDatasetsDraw(chart) {
    const opts = (chart.options.plugins as { planFactMonthToday?: PlanFactMonthTodayLineOpts } | undefined)
      ?.planFactMonthToday;
    if (!opts || opts.x == null || !Number.isFinite(opts.x) || !chart.scales.x) return;

    const xScale = chart.scales.x;
    const x = xScale.getPixelForValue(opts.x);
    const { ctx, chartArea } = chart;
    if (!Number.isFinite(x) || x < chartArea.left || x > chartArea.right) return;

    const label = "Сегодня";
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
  planFactMonthTodayLinePlugin,
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

const delayFromPlanStartIfNotStarted = (planStartIso: string | null | undefined, asOf: Date = new Date()) => {
  const startMs = isoMs(planStartIso);
  if (startMs === null) return null;
  const todayMs = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate()).getTime();
  if (todayMs < startMs) return null;
  return Math.round((todayMs - startMs) / MS_PER_DAY_CHART);
};

function addDaysFromOrigin(origin: Date, serialDays: number): Date {
  return new Date(origin.getTime() + serialDays * MS_PER_DAY_CHART);
}

function localTodayDate(): Date {
  const iso = localTodayIso();
  const [yy, mm, dd] = iso.split("-").map((s) => Number(s));
  return new Date(yy, (mm ?? 1) - 1, dd ?? 1);
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
    const sa = a.planStart?.trim()
      ? new Date(`${a.planStart}T00:00:00`).getTime()
      : NaN;
    const sb = b.planStart?.trim()
      ? new Date(`${b.planStart}T00:00:00`).getTime()
      : NaN;
    if (!Number.isFinite(sa) && !Number.isFinite(sb)) {
      return a.code.localeCompare(b.code, undefined, { numeric: true });
    }
    if (!Number.isFinite(sa)) return 1;
    if (!Number.isFinite(sb)) return -1;
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

/** Диагностика «Распределение статусов»: только edit/dev, не презентация (см. presentationAnalyticsSkin). */
const SHOW_STATUS_DISTRIBUTION_DEBUG =
  process.env.NEXT_PUBLIC_GPR_STATUS_DEBUG === "1" ||
  process.env.NEXT_PUBLIC_GPR_SCOPE_DEBUG === "1" ||
  process.env.NODE_ENV === "development";

/** Диагностика источника данных виджетов ГПР: только edit/dev, не презентация. */
const SHOW_GPR_SCOPE_DEBUG =
  SHOW_STATUS_DISTRIBUTION_DEBUG ||
  process.env.NEXT_PUBLIC_GPR_PARKING_DEBUG === "1";

type GprScopeDebugData = {
  activeTab: string;
  totalInDb: number;
  usedInWidgets: number;
  usedInPlanFact: number;
  usedInGpr: number;
  usedInStatus: number;
  sourceLabel: string;
  planFactSource: string;
  wrongPartInPlanFact: number;
  calculatedPercent: number | null;
  barLevel: string;
  cardRootCodes: string[];
  wbsSamples: Array<{
    code: string;
    wbsLevel: number;
    partId: number;
    objectSource: string;
    inTopCards: boolean;
  }>;
};

function GprScopeDebugPanel({ debug }: { debug: GprScopeDebugData }) {
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 px-4 py-3 text-xs text-amber-100/90">
      <p className="font-semibold text-amber-200">Debug · {debug.activeTab}</p>
      <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        <p>Активная вкладка: {debug.activeTab}</p>
        <p>Всего задач в БД: {debug.totalInDb}</p>
        <p>Использовано в План vs Факт: {debug.usedInPlanFact}</p>
        <p>Использовано в виджетах (статусы/ГПР): {debug.usedInWidgets}</p>
        <p>Источник: {debug.sourceLabel}</p>
        <p>Источник План vs Факт: {debug.planFactSource}</p>
        <p>Использовано в ГПР (rollup): {debug.usedInGpr}</p>
        <p>Использовано в статусах: {debug.usedInStatus}</p>
        <p>
          Рассчитанный %:{" "}
          {debug.calculatedPercent === null ? "—" : `${debug.calculatedPercent}%`}
        </p>
        {debug.wrongPartInPlanFact > 0 ? (
          <p className="text-red-300">
            Чужих partId в План vs Факт: {debug.wrongPartInPlanFact}
          </p>
        ) : null}
        <p>Режим WBS: {debug.barLevel}</p>
        <p>Корни карточек: {debug.cardRootCodes.join(", ") || "—"}</p>
      </div>
      {debug.wbsSamples.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <p className="mb-1 font-medium text-amber-200/90">WBS · План vs Факт (первые строки)</p>
          <table className="w-full min-w-[480px] text-left text-[10px]">
            <thead>
              <tr className="text-amber-200/70">
                <th className="pr-2">Уровень</th>
                <th className="pr-2">Код</th>
                <th className="pr-2">partId</th>
                <th className="pr-2">Объект</th>
                <th>Карточка</th>
              </tr>
            </thead>
            <tbody>
              {debug.wbsSamples.map((row) => (
                <tr key={`${row.code}-${row.partId}`} className="border-t border-amber-500/20">
                  <td className="py-0.5 pr-2 tabular-nums">{row.wbsLevel}</td>
                  <td className="py-0.5 pr-2 font-mono">{row.code}</td>
                  <td className="py-0.5 pr-2 tabular-nums">{row.partId}</td>
                  <td className="py-0.5 pr-2">{row.objectSource}</td>
                  <td className="py-0.5">{row.inTopCards ? "да" : "нет"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

type StatusDistributionDebugStats = {
  scopeLabel: string;
  activeScope: ConstructionObjectScope;
  total: number;
  partIds: number[];
  rawPartIds: number[];
  green: number;
  yellow: number;
  red: number;
  gray: number;
};

function StatusDistributionDebugPanel({ stats }: { stats: StatusDistributionDebugStats }) {
  return (
    <div className="mt-3 rounded-lg border border-sky-500/35 bg-sky-950/25 px-3 py-2 text-[11px] leading-relaxed text-sky-100/90">
      <p className="font-semibold text-sky-200">Распределение статусов · debug</p>
      <p>Вкладка: {stats.scopeLabel} (scope={String(stats.activeScope)})</p>
      <p>Всего задач: {stats.total}</p>
      <p>Эффективные partId: {stats.partIds.length ? stats.partIds.join(", ") : "—"}</p>
      <p>Сырые partId (поле task.partId): {stats.rawPartIds.length ? stats.rawPartIds.join(", ") : "—"}</p>
      <p>
        Зелёные: {stats.green} · Жёлтые: {stats.yellow} · Красные: {stats.red} · Нет данных: {stats.gray}
      </p>
    </div>
  );
}

/** Корневые этапы для агрегата и порядка карточек по части проекта (значения по умолчанию). */
const AGGREGATE_ROOT_CODES_BY_PART: Record<ProjectPartKey, readonly string[]> = {
  residential: ["2.04", "2.05"],
  parking: ["2.06", "2.07"],
};

const AGGREGATE_ROOT_CODES_PROJECT = DEFAULT_AGGREGATE_ROOT_CODES_PROJECT;

const PART_SHORT_TITLE: Record<ProjectPartKey, string> = {
  residential: "Жилой дом",
  parking: "Автостоянка",
};

const PART_SHORT_TITLE_OR_PROJECT: Record<ProjectPartKey | "project", string> = {
  ...PART_SHORT_TITLE,
  project: "Проект",
};

/** Подписи для блока «Состав» (жилой дом) — совпадают с корневыми этапами 2.04 / 2.05. */
const RESIDENTIAL_AGGREGATE_STAGE_TITLES: readonly [string, string] = [
  "Подготовка территории строительства",
  "Строительство зданий и сооружений",
];
const RESIDENTIAL_WEIGHT_LABELS: readonly [string, string] = ["Подготовка", "Строительство"];

/** Источник веса для взвешенного «Выполнение ГПР» (сумма нормированных весов = 1). */
type AggregateWeightBasis = "plannedWorkVolume" | "contractValue" | "planDuration" | "imputedUnit";

type AggregateStageBreakdown = {
  code: string;
  composeTitle: string;
  weightShortLabel: string;
  completion: number;
  planDays: number | null;
  /** Сырой вес до нормировки (объём / стоимость / дни / 1 при явной догрузке). */
  rawWeight: number;
  /** Доля в общем весе, % (сумма по этапам = 100%). */
  weightPercent: number | null;
  /** Вклад этапа в общий %: вес × выполнение (п.п., для отладки и подсказки). */
  contributionPercent: number | null;
  weightBasis: AggregateWeightBasis;
  /** Явная догрузка веса (не «тихий» пропуск данных). */
  imputation: "none" | "equalAll" | "unitForMissingSource";
};

const AGGREGATE_WEIGHT_BASIS_RU: Record<AggregateWeightBasis, string> = {
  plannedWorkVolume: "объём работ (план)",
  contractValue: "стоимость по договору",
  planDuration: "длительность плана (дн.)",
  imputedUnit: "равный единичный вес (нет объёма/стоимости/плана)",
};

const AGGREGATE_PROGRESS_TOOLTIP =
  "Взвешенное выполнение ГПР по корневым этапам: Σ(весᵢ × фактᵢ). Факт — rollup дочерних работ этапа (листья WBS) или поле completion корня. Вес: объём → стоимость → длительность плана.";

const AGGREGATE_STAGE_CONTRIBUTION_TOOLTIP =
  "Факт выполнения по каждому корневому этапу (% из таблицы ГПР; на графиках — те же значения по этапам)";

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
      const planRef = tmcPlanReferenceDate(item);
      const factRef = tmcFactReferenceDate(item);
      const planMs = planRef ? new Date(`${planRef}T00:00:00`).getTime() : NaN;
      const factMs = factRef ? new Date(`${factRef}T00:00:00`).getTime() : null;
      if (!factRef && Number.isFinite(planMs) && planMs < todayMs) notPurchased = true;
      if (factMs !== null && Number.isFinite(planMs) && factMs > planMs) overdueDelivery = true;
    }
  }
  return { notPurchased, overdueDelivery };
}

/** Разница в п.п. между этапами, при которой показываем короткое пояснение в поповере. */
const AGGREGATE_POPOVER_STAGE_GAP_PTS = 15;

function buildAggregateProgressPopoverExplanation(
  partKey: ProjectPartKey | "project",
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
        partKey === "residential" || partKey === "project"
          ? "Прогресс снижен из-за отставания на этапе подготовки территории."
          : "Прогресс снижен из-за отставания по первому корневому этапу относительно второго.";
      return scheduleLag
        ? [line, "Дополнительно зафиксировано отставание по срокам относительно плана."]
        : [line];
    }
    if (build + AGGREGATE_POPOVER_STAGE_GAP_PTS <= prep) {
      const line =
        partKey === "residential" || partKey === "project"
          ? "Прогресс снижен из-за того, что этап строительства выполнен значительно меньше по сравнению с подготовкой."
          : "Выполнение ГПР в большей степени ограничено вторым корневым этапом: он заметно отстаёт от первого.";
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

function formatDeviationForStatusDistributionPopover(_status: Traffic, deviationDays: number | null): string {
  return formatGprScheduleDeviationDisplayDays(deviationDays);
}

/** Склонение «день / дня / дней» для подсказок. */
function russianDaysWord(n: number): string {
  const a = Math.abs(Math.round(n));
  const mod10 = a % 10;
  const mod100 = a % 100;
  if (mod100 >= 11 && mod100 <= 14) return "дней";
  if (mod10 === 1) return "день";
  if (mod10 >= 2 && mod10 <= 4) return "дня";
  return "дней";
}

/** Верхняя граница шкалы отклонений по модулю (динамически по данным группы). */
function stageDeviationScaleMax(rows: { deviation: number | null }[]): number {
  const abs = rows
    .map((r) => r.deviation)
    .filter((d): d is number => d !== null)
    .map((d) => Math.abs(d));
  if (abs.length === 0) return 20;
  const peak = Math.max(...abs, 1);
  if (peak <= 20) return 20;
  if (peak <= 60) return Math.ceil(peak / 10) * 10;
  if (peak <= 200) return Math.ceil(peak / 25) * 25;
  return Math.ceil(peak / 50) * 50;
}

function formatStageDeviationScaleTick(n: number): string {
  if (n === 0) return "0";
  return n > 0 ? `+${n}` : `${n}`;
}

function stageDeviationStatusColor(status: Traffic | "green" | "yellow" | "red" | "gray"): string {
  if (status === "green") return COLORS.green;
  if (status === "yellow") return COLORS.yellow;
  if (status === "red") return COLORS.red;
  return COLORS.gray;
}

function stageDeviationRowTooltip(
  deviation: number | null,
  factDuration: number | null,
  planDuration: number | null,
  clipped: boolean,
): string {
  const lines: string[] = [];
  if (deviation !== null) {
    const abs = Math.abs(Math.round(deviation));
    const sign = deviation > 0 ? "+" : deviation < 0 ? "−" : "";
    lines.push(`Отклонение: ${sign}${abs} ${russianDaysWord(abs)}`);
  } else {
    lines.push("Отклонение: нет данных");
  }
  if (factDuration != null) {
    lines.push(`Факт: ${factDuration} ${russianDaysWord(factDuration)}`);
  } else {
    lines.push("Факт: —");
  }
  if (planDuration != null) {
    lines.push(`План: ${planDuration} ${russianDaysWord(planDuration)}`);
  } else {
    lines.push("План: —");
  }
  if (clipped) {
    lines.push("Значение выходит за пределы отображаемой шкалы.");
  }
  return lines.join("\n");
}

function StageDeviationTaskHoverCard({
  task,
  asOf,
  pointer,
  tmcItems,
}: {
  task: GPRTask;
  asOf: Date;
  pointer: { x: number; y: number };
  tmcItems: TMCItem[];
}) {
  const insight = useMemo(
    () => buildGprScheduleDeviationInsight(task, asOf, { tmcItems }),
    [task, asOf, tmcItems],
  );
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(() => ({ top: pointer.y + 14, left: pointer.x + 14 }));

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const margin = 12;
    const rect = el.getBoundingClientRect();
    let top = pointer.y + 14;
    let left = pointer.x + 14;
    if (left + rect.width > window.innerWidth - margin) {
      left = Math.max(margin, pointer.x - rect.width - 14);
    }
    if (top + rect.height > window.innerHeight - margin) {
      top = Math.max(margin, pointer.y - rect.height - 14);
    }
    setPos({ top, left });
  }, [pointer.x, pointer.y, insight]);

  return createPortal(
    <div
      ref={cardRef}
      role="tooltip"
      className="pointer-events-none fixed z-[250] w-[min(320px,calc(100vw-24px))] rounded-xl border border-slate-500/45 bg-[#1e293b] p-3.5 shadow-2xl shadow-black/50"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="text-sm font-semibold leading-snug text-slate-100">{task.name}</div>
      <div className="my-2.5 border-t border-white/10" aria-hidden />
      <div className="space-y-2.5 text-[11px] leading-snug">
        <div>
          <div className="font-semibold uppercase tracking-wide text-slate-500">План</div>
          <div className="mt-1 text-slate-300">
            <div>Начало: {insight.planStartLabel}</div>
            <div>Окончание: {insight.planEndLabel}</div>
          </div>
        </div>
        <div>
          <div className="font-semibold uppercase tracking-wide text-slate-500">Факт</div>
          <div className="mt-1 text-slate-300">
            <div>Начало: {insight.factStartLabel}</div>
            <div>Окончание: {insight.factEndLabel}</div>
          </div>
        </div>
        <div className="border-t border-white/10 pt-2.5">
          <div className="text-slate-200">
            <span className="text-slate-400">{insight.deviationHeading}: </span>
            <span className="font-semibold tabular-nums">{insight.deviationLabel}</span>
          </div>
          <div className="mt-1 text-slate-300">
            <span className="text-slate-400">Статус: </span>
            <span className="font-medium text-slate-100">{insight.badge.label}</span>
          </div>
        </div>
        {insight.reasonLines.length > 0 ? (
          <div className="border-t border-white/10 pt-2.5">
            <div className="font-semibold text-slate-400">Причина отклонения:</div>
            <ul className="mt-1.5 space-y-1 text-slate-300">
              {insight.reasonLines.map((line) => (
                <li key={line}>• {line}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function StageDeviationScaleRow({
  task,
  asOf,
  tmcItems,
  deviation,
  endDelay,
  factDuration,
  planDuration,
  scaleMax,
}: {
  task: GPRTask;
  asOf: Date;
  tmcItems: TMCItem[];
  deviation: number | null;
  endDelay: number | null;
  factDuration: number | null;
  planDuration: number | null;
  scaleMax: number;
}) {
  const taskName = task.name.trim() || "—";
  const insight = useMemo(
    () => buildGprScheduleDeviationInsight(task, asOf, { tmcItems }),
    [task, asOf, tmcItems],
  );
  const [hoverPointer, setHoverPointer] = useState<{ x: number; y: number } | null>(null);
  const [portalMounted, setPortalMounted] = useState(false);

  useEffect(() => {
    setPortalMounted(true);
  }, []);
  const status: Traffic = endDelay === null ? "gray" : (getStatusByDeviation(endDelay) as Traffic);
  const color = stageDeviationStatusColor(status);
  const raw = deviation ?? 0;
  const clipped = deviation !== null && Math.abs(raw) > scaleMax;
  const normalized =
    deviation === null ? 0 : raw > scaleMax ? scaleMax : raw < -scaleMax ? -scaleMax : raw;
  const percent = scaleMax > 0 ? normalized / scaleMax : 0;
  const dotLeftPct = 50 + percent * 50;
  const minLeft = Math.min(50, dotLeftPct);
  const barWidth = Math.abs(dotLeftPct - 50);
  const deviationLabel =
    deviation === null
      ? "—"
      : `${formatGprScheduleDeviationDisplayDays(deviation)}${clipped ? " →" : ""}`;

  return (
    <div className="grid grid-cols-12 items-start gap-3 rounded-xl border border-slate-700/60 bg-slate-900/20 p-3 transition-colors hover:border-slate-600/70 hover:bg-slate-900/30">
      <div className="col-span-12 min-w-0 md:col-span-4">
        <span
          className="block cursor-help break-words text-sm font-semibold leading-snug text-slate-100 underline decoration-slate-600/80 decoration-dotted underline-offset-[3px] hover:text-sky-100"
          onMouseEnter={(e) => setHoverPointer({ x: e.clientX, y: e.clientY })}
          onMouseMove={(e) => setHoverPointer({ x: e.clientX, y: e.clientY })}
          onMouseLeave={() => setHoverPointer(null)}
          onFocus={(e) => setHoverPointer({ x: e.clientX, y: e.clientY })}
          onBlur={() => setHoverPointer(null)}
          tabIndex={0}
          role="button"
          aria-label={`${taskName}: подробности по срокам`}
        >
          {taskName}
        </span>
        <div className="mt-2 space-y-1.5">
          <span className={insight.badge.className}>
            <span aria-hidden>{insight.badge.icon}</span>
            {insight.badge.label}
          </span>
          <div className="space-y-0.5 text-[11px] leading-snug text-slate-400">
            <div>
              <span className="text-slate-500">План: </span>
              <span className="tabular-nums text-slate-300">{insight.planRangeInline}</span>
            </div>
            <div>
              <span className="text-slate-500">Факт: </span>
              <span className="tabular-nums text-slate-300">{insight.factRangeInline}</span>
            </div>
          </div>
        </div>
        {portalMounted && hoverPointer ? (
          <StageDeviationTaskHoverCard
            task={task}
            asOf={asOf}
            pointer={hoverPointer}
            tmcItems={tmcItems}
          />
        ) : null}
      </div>
      <div
        className="col-span-12 md:col-span-5"
        title={stageDeviationRowTooltip(deviation, factDuration, planDuration, clipped)}
      >
        <div className="relative h-10 w-full max-w-full overflow-visible px-2 sm:px-4">
          <div className="absolute left-0 right-0 top-[calc(50%+6px)] -translate-y-1/2 border-t border-white/10" />
          <div className="absolute left-1/2 top-[calc(50%+6px)] h-4 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded bg-white/30" />
          {deviation !== null ? (
            <>
              <div
                className="absolute top-[calc(50%+6px)] h-px -translate-y-1/2"
                style={{
                  left: `${minLeft}%`,
                  width: `${barWidth}%`,
                  backgroundColor: color,
                }}
              />
              <div
                className="absolute top-[calc(50%+6px)] -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${dotLeftPct}%` }}
              >
                <span
                  className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap text-xs font-bold tabular-nums leading-none"
                  style={{ color }}
                >
                  {deviationLabel}
                </span>
                <span
                  className="block h-3 w-3 rounded-full"
                  style={{
                    backgroundColor: color,
                    boxShadow: `0 0 12px ${color}`,
                  }}
                  aria-hidden
                />
              </div>
            </>
          ) : (
            <span className="absolute left-1/2 top-[calc(50%+6px)] -translate-x-1/2 -translate-y-1/2 text-xs font-semibold tabular-nums text-slate-500">
              —
            </span>
          )}
        </div>
      </div>
      <div className="col-span-12 space-y-0.5 text-right text-xs leading-snug md:col-span-3">
        <div className="tabular-nums text-slate-200">
          <span className="text-slate-500">Факт: </span>
          {factDuration != null ? `${factDuration} дн.` : "—"}
        </div>
        <div className="tabular-nums text-slate-400">
          <span className="text-slate-500">План: </span>
          {planDuration != null ? `${planDuration} дн.` : "—"}
        </div>
      </div>
    </div>
  );
}

function StatusDistributionTaskChunk({
  rows,
  status,
  showDeviation,
  showAll = false,
  maxItems = STATUS_DISTRIBUTION_POPOVER_MAX_TASKS,
}: {
  rows: TrafficRow[];
  status: Traffic;
  showDeviation: boolean;
  /** Показать все задачи (панель под диаграммой в презентации). */
  showAll?: boolean;
  maxItems?: number;
}) {
  const shown = showAll ? rows : rows.slice(0, maxItems);
  const rest = showAll ? 0 : rows.length - shown.length;
  return (
    <>
      <ul className="mt-1.5 space-y-1 text-[11px] leading-snug text-slate-300">
        {shown.map((r) => (
          <li key={r.task.globalTaskId ?? r.task.id}>
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

const STATUS_DISTRIBUTION_SEGMENT_META: Record<
  Traffic,
  { label: string; emoji: string; showDeviation: boolean }
> = {
  green: { label: "В срок", emoji: "🟢", showDeviation: true },
  yellow: { label: "Риск", emoji: "🟡", showDeviation: true },
  red: { label: "Отставание", emoji: "🔴", showDeviation: true },
  gray: { label: "Нет данных", emoji: "⚪", showDeviation: false },
};

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
      const endDel = projectOverviewEndDelayDays(agg.planEnd, agg.factEnd);
      if (endDel === null) return null;
      return { avg: endDel, severeLate: endDel > 14 ? 1 : 0 };
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

function KvartalyGanttChartPanel({ model, gprAsOf }: { model: KvartalyGanttModel; gprAsOf: Date }) {
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
        truncateAxisLabel(`${gprFullCodeForChartAxis(t.code)} — ${t.name.trim()}`, 72),
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
        if (t.factStart?.trim() && t.factEnd?.trim()) {
          const r = clampSerialRange(t.factStart, t.factEnd, origin, maxSerial);
          return r ? ([r[0], r[1]] as [number, number]) : null;
        }
        // Нет факта: если срок старта уже наступил, рисуем "полосу отставания" plan_start -> today.
        const ps = t.planStart?.trim();
        if (!ps) return null;
        const today = localTodayDate();
        const planStart = new Date(`${ps}T00:00:00`);
        if (Number.isNaN(planStart.getTime()) || today < planStart) return null;
        const lag = clampSerialRange(ps, localTodayIso(), origin, maxSerial);
        return lag ? ([lag[0], lag[1]] as [number, number]) : null;
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
                if (!task.factStart || !task.factEnd) return "Факт: не начато";
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
                  if (!task.factStart && !task.factEnd) {
                    const startDelay = delayFromPlanStartIfNotStarted(task.planStart);
                    if (startDelay !== null) {
                      lines.push(`Отставание: ${startDelay} дней от плановой даты начала`);
                    }
                  }
                  const pl = getPlannedProgressPercent(task, gprAsOf);
                  const fc = getActualProgressPercent(task);
                  const dev = calculateDeviation(task, gprAsOf);
                  if (pl !== null) {
                    lines.push(`План на ${formatDate(gprAsOf)}: ${pl}%`);
                    lines.push(`Факт: ${fc}%`);
                  }
                  if (dev !== null) {
                    if (dev < 0) {
                      lines.push(`Отставание готовности: ${Math.abs(dev)} п.п.`);
                    } else if (dev > 0) {
                      lines.push(`Опережение готовности: ${dev} п.п.`);
                    } else {
                      lines.push(`По плану готовности (0 п.п.)`);
                    }
                  }
                  const scheduleDev = gprTaskScheduleDeviationDisplayDays(task, gprAsOf);
                  if (scheduleDev !== null) {
                    lines.push(`Отклонение по сроку: ${formatGprScheduleDeviationDisplayDays(scheduleDev)}`);
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

function resolveAggregateRawWeight(
  t: GPRTask,
  planD: number | null,
): { raw: number; basis: AggregateWeightBasis; imputation: AggregateStageBreakdown["imputation"] } {
  const vol = t.plannedWorkVolume;
  if (typeof vol === "number" && Number.isFinite(vol) && vol > 0) {
    return { raw: vol, basis: "plannedWorkVolume", imputation: "none" };
  }
  const rub = t.contractValue;
  if (typeof rub === "number" && Number.isFinite(rub) && rub > 0) {
    return { raw: rub, basis: "contractValue", imputation: "none" };
  }
  if (planD !== null && planD > 0) {
    return { raw: planD, basis: "planDuration", imputation: "none" };
  }
  return { raw: 0, basis: "imputedUnit", imputation: "unitForMissingSource" };
}

function tasksUnderRootCode(taskList: GPRTask[], rootCode: string): GPRTask[] {
  const root = normalizeGprCodeFinal(rootCode);
  if (!root) return [];
  return taskList.filter((t) => {
    const c = normalizeGprCodeFinal(t.code);
    return c.startsWith(`${root}.`);
  });
}

function isLeafAmong(task: GPRTask, group: GPRTask[]): boolean {
  const nc = normalizeGprCodeFinal(task.code);
  if (!nc) return false;
  return !group.some((t) => {
    const oc = normalizeGprCodeFinal(t.code);
    return oc !== nc && oc.startsWith(`${nc}.`);
  });
}

/**
 * Если у корневой строки нет собственного веса, пробуем агрегировать его по дочерним листьям.
 * Приоритет базы такой же, как у платформы: объём → стоимость → длительность.
 */
function aggregateRootWeightFromDescendantLeaves(
  taskList: GPRTask[],
  rootTask: GPRTask,
): { raw: number; basis: AggregateWeightBasis; imputation: AggregateStageBreakdown["imputation"] } | null {
  const descendants = tasksUnderRootCode(taskList, rootTask.code);
  if (descendants.length === 0) return null;
  const leaves = descendants.filter((t) => isLeafAmong(t, descendants));
  const base = leaves.length > 0 ? leaves : descendants;

  const sumVol = base.reduce((acc, t) => {
    const v = t.plannedWorkVolume;
    return acc + (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
  }, 0);
  if (sumVol > 0) return { raw: sumVol, basis: "plannedWorkVolume", imputation: "none" };

  const sumCost = base.reduce((acc, t) => {
    const c = t.contractValue;
    return acc + (typeof c === "number" && Number.isFinite(c) && c > 0 ? c : 0);
  }, 0);
  if (sumCost > 0) return { raw: sumCost, basis: "contractValue", imputation: "none" };

  const sumPlanD = base.reduce((acc, t) => {
    const d = daysInclusive(t.planStart, t.planEnd);
    return acc + (d !== null && d > 0 ? d : 0);
  }, 0);
  if (sumPlanD > 0) return { raw: sumPlanD, basis: "planDuration", imputation: "none" };

  return null;
}

/**
 * Общий % по части: sum_i(progress_i × w_i), где w_i нормированы к 1.
 * Вес: plannedWorkVolume → contractValue → длительность плана; при нуле — явная догрузка 1, при полном нуле — 1/n.
 * totalDeviation: то же w_i, средневзвешенное отклонение (только этапы с ненулевым w и известным d).
 * Ошибки расчёта не рвут рендер: пустой безопасный результат + лог в development.
 */
function computePartAggregate(
  tasks: GPRTask[],
  rootCodes: readonly string[],
  partKey: ProjectPartKey | "project",
  asOf: Date,
): {
  totalPercent: number | null;
  totalDeviation: number | null;
  stages: AggregateStageBreakdown[];
} {
  try {
    return computePartAggregateCore(tasks, rootCodes, partKey, asOf);
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      const list = Array.isArray(tasks) ? tasks : [];
      console.error("[GPR] computePartAggregate failed:", err, {
        tasksLength: list.length,
        rootCodes: rootCodes?.length ?? 0,
        partKey,
      });
    }
    return { totalPercent: null, totalDeviation: null, stages: [] };
  }
}

function computePartAggregateCore(
  tasks: GPRTask[],
  rootCodes: readonly string[],
  partKey: ProjectPartKey | "project",
  asOf: Date,
): {
  totalPercent: number | null;
  totalDeviation: number | null;
  stages: AggregateStageBreakdown[];
} {
  const taskList = Array.isArray(tasks) ? tasks : [];
  const codes = Array.isArray(rootCodes) ? rootCodes : [];
  const asOfSafe = asOf instanceof Date && !Number.isNaN(asOf.getTime()) ? asOf : new Date();

  type Row = {
    t: GPRTask;
    code: string;
    composeTitle: string;
    weightShortLabel: string;
    c: number;
    planD: number | null;
    hasDescendants: boolean;
    rw: { raw: number; basis: AggregateWeightBasis; imputation: AggregateStageBreakdown["imputation"] };
  };
  const rows: Row[] = [];
  let residentialStageIndex = 0;
  for (const code of codes) {
    const codeStr = String(code ?? "").trim();
    if (!codeStr) continue;
    const t = findGprCsvRootTask(taskList, codeStr);
    if (!t) continue;
    const planD = daysInclusive(t.planStart, t.planEnd);
    const nameSafe = String(t.name ?? t.code ?? "").trim() || codeStr;
    const composeTitle =
      partKey === "residential" && residentialStageIndex < RESIDENTIAL_AGGREGATE_STAGE_TITLES.length
        ? RESIDENTIAL_AGGREGATE_STAGE_TITLES[residentialStageIndex]!
        : partKey === "project" && residentialStageIndex < 2
          ? RESIDENTIAL_AGGREGATE_STAGE_TITLES[residentialStageIndex]!
          : nameSafe;
    const weightShortLabel =
      partKey === "residential" && residentialStageIndex < RESIDENTIAL_WEIGHT_LABELS.length
        ? RESIDENTIAL_WEIGHT_LABELS[residentialStageIndex]!
        : partKey === "project" && residentialStageIndex < 2
          ? RESIDENTIAL_WEIGHT_LABELS[residentialStageIndex]!
          : partKey === "project" && residentialStageIndex < 4
            ? residentialStageIndex === 2
              ? "Сети"
              : "Благоустройство"
            : shortWeightLabelForPart(nameSafe, residentialStageIndex);
    residentialStageIndex += 1;
    const c = computeGprStageFactCompletionPercent(taskList, t, asOfSafe);
    const descendants = tasksUnderRootCode(taskList, codeStr);
    const hasDescendants = descendants.length > 0;
    let rw = resolveAggregateRawWeight(t, planD);
    if (rw.raw <= 0 && hasDescendants) {
      const rolled = aggregateRootWeightFromDescendantLeaves(taskList, t);
      if (rolled) rw = rolled;
    }
    rows.push({ t, code: codeStr, composeTitle, weightShortLabel, c, planD, hasDescendants, rw });
  }

  if (rows.length === 0) {
    return { totalPercent: null, totalDeviation: null, stages: [] };
  }

  let raws = rows.map((r) => r.rw.raw);
  const allZero = raws.every((x) => !Number.isFinite(x) || x <= 0);
  if (allZero) {
    raws = raws.map(() => 1);
    for (let i = 0; i < rows.length; i += 1) {
      if (rows[i]!.hasDescendants) {
        raws[i] = 0;
        rows[i]!.rw = { raw: 0, basis: rows[i]!.rw.basis, imputation: rows[i]!.rw.imputation };
      } else {
        raws[i] = 1;
        rows[i]!.rw = { raw: 1, basis: "imputedUnit", imputation: "equalAll" };
      }
    }
  } else {
    for (let i = 0; i < raws.length; i += 1) {
      if (!Number.isFinite(raws[i]) || raws[i]! <= 0) {
        if (rows[i]!.hasDescendants) {
          raws[i] = 0;
        } else {
          raws[i] = 1;
          rows[i]!.rw = { raw: 1, basis: "imputedUnit", imputation: "unitForMissingSource" };
        }
      }
    }
  }

  const sumRaw = raws.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  const norm = raws.map((w) => (sumRaw > 0 && Number.isFinite(w) ? w / sumRaw : 0));

  const stages: AggregateStageBreakdown[] = rows.map((r, i) => {
    const w = norm[i] ?? 0;
    const contribution = Math.round(w * r.c * 10) / 10;
    return {
      code: r.code,
      composeTitle: r.composeTitle,
      weightShortLabel: r.weightShortLabel,
      completion: r.c,
      planDays: r.planD,
      rawWeight: raws[i]!,
      weightPercent: sumRaw > 0 ? Math.round(w * 1000) / 10 : null,
      contributionPercent: sumRaw > 0 ? contribution : null,
      weightBasis: r.rw.basis,
      imputation: r.rw.imputation,
    };
  });

  let totalPercent: number | null =
    sumRaw > 0
      ? Math.round(
          rows.reduce((acc, r, i) => acc + (norm[i] ?? 0) * r.c, 0) * 10,
        ) / 10
      : null;
  if (totalPercent !== null && !Number.isFinite(totalPercent)) {
    totalPercent = null;
  }

  let weightedDevSum = 0;
  let sumWDev = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const w = norm[i] ?? 0;
    const d = calculateDeviation(rows[i]!.t, asOfSafe);
    if (d === null || !Number.isFinite(d) || w <= 0) continue;
    weightedDevSum += d * w;
    sumWDev += w;
  }
  let totalDeviation: number | null = sumWDev > 0 ? weightedDevSum / sumWDev : null;
  if (totalDeviation !== null && !Number.isFinite(totalDeviation)) {
    totalDeviation = null;
  }

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

function aggregateProgressStatusFromDistribution(counts: {
  green: number;
  yellow: number;
  red: number;
  gray: number;
}): { status: Traffic; label: "В срок" | "Риск" | "Отставание" | "Нет данных"; riskScore: number | null } {
  const total = counts.green + counts.yellow + counts.red;
  if (total === 0) return { status: "gray", label: "Нет данных", riskScore: null };
  const riskScore = (counts.red * 1 + counts.yellow * 0.5) / total;
  if (riskScore <= 0.2) return { status: "green", label: "В срок", riskScore };
  if (riskScore <= 0.5) return { status: "yellow", label: "Риск", riskScore };
  return { status: "red", label: "Отставание", riskScore };
}

function trafficStatusForTask(task: GPRTask, asOf: Date): {
  status: Traffic;
  planDays: number | null;
  factDays: number | null;
  deviationDays: number | null;
} {
  const planDays = daysInclusive(task.planStart, task.planEnd);
  if (planDays === null) return { status: "gray", planDays: null, factDays: null, deviationDays: null };
  const factDays = daysInclusive(task.factStart, task.factEnd);
  const endDelay = planFactEndDeviationDays(task.planEnd, task.factEnd, asOf);
  const deviationDays = endDelay === null ? null : -endDelay;
  if (deviationDays === null) return { status: "gray", planDays, factDays, deviationDays: null };
  const st = getStatusByDeviation(endDelay);
  return { status: st as Traffic, planDays, factDays, deviationDays };
}

type GprDonutStatusKey = "on_time" | "risk" | "overdue" | "completed_late" | "not_started";

function isGprWorkItemCompleted(task: GPRTask): boolean {
  return Boolean(task.factEnd?.trim()) || getActualProgressPercent(task) >= 100;
}

/** Статус этапа для donut KPI-карточки (отдельно от светофора в средних метриках). */
function gprStageWorkItemDonutStatus(task: GPRTask, asOf: Date): GprDonutStatusKey {
  const planDays = daysInclusive(task.planStart, task.planEnd);
  if (planDays === null) return "not_started";

  if (isGprWorkItemCompleted(task)) {
    const endDelay = planFactEndDeviationDays(task.planEnd, task.factEnd, asOf);
    if (endDelay === null) return "not_started";
    if (endDelay > 0) return "completed_late";
    return "on_time";
  }

  const endDelay = planFactEndDeviationDays(task.planEnd, task.factEnd, asOf);
  if (endDelay === null) return "not_started";
  const st = getStatusByDeviation(endDelay);
  if (st === "green") return "on_time";
  if (st === "yellow") return "risk";
  return "overdue";
}

function computeGprStageStatusBreakdown(
  allTasks: GPRTask[],
  rootTask: GPRTask,
  asOf: Date,
  stageInsight: ReturnType<typeof computeGprStageCompletionInsight>,
) {
  const workItems = getGprStageWorkItems(allTasks, rootTask);
  const counts = { green: 0, yellow: 0, red: 0, gray: 0 };
  const donutCounts = {
    on_time: 0,
    risk: 0,
    overdue: 0,
    completed_late: 0,
    not_started: 0,
  };
  for (const t of workItems) {
    const { status } = trafficStatusForTask(t, asOf);
    counts[status] += 1;
    donutCounts[gprStageWorkItemDonutStatus(t, asOf)] += 1;
  }
  const total = stageInsight.workTotal;
  const completed = stageInsight.workCompleted;
  const problematic =
    donutCounts.risk + donutCounts.overdue + donutCounts.completed_late;
  const withStatus =
    donutCounts.on_time +
    donutCounts.risk +
    donutCounts.overdue +
    donutCounts.completed_late;
  return {
    completedStages: completed,
    totalStages: total,
    onTimeCount: counts.green,
    atRiskCount: counts.yellow,
    overdueCount: counts.red,
    notStartedCount: counts.gray,
    completedSharePct: total > 0 ? Math.round((completed / total) * 1000) / 10 : 0,
    donutOnTimeCount: donutCounts.on_time,
    donutRiskCount: donutCounts.risk,
    donutOverdueCount: donutCounts.overdue,
    donutCompletedLateCount: donutCounts.completed_late,
    donutNotStartedCount: donutCounts.not_started,
    problematicSharePct:
      withStatus > 0 ? Math.round((problematic / withStatus) * 1000) / 10 : 0,
  };
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

function GprTopKpiCardLayout({
  title,
  leftLabel,
  leftValue,
  leftMeta,
  rightLabel,
  rightValue,
  bottomLabel,
  bottomValue,
  bottomValueColorClassName,
  leftValueTitle,
  progressBarWidth,
  progressBarColor,
}: {
  title: string;
  leftLabel: string;
  leftValue: string;
  leftMeta?: string;
  rightLabel: string;
  rightValue: string;
  bottomLabel: string;
  bottomValue: string;
  bottomValueColorClassName?: string;
  leftValueTitle?: string;
  progressBarWidth: number;
  progressBarColor: string;
}) {
  return (
    <div className="grid h-full grid-rows-[auto_1fr_auto_auto] gap-3">
      <div className="text-base font-semibold leading-snug text-slate-50">{title}</div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
        <div className="min-w-0">
          <div className="text-xs leading-snug text-[#E6EDF3]/85" title={leftValueTitle}>
            {leftLabel}
          </div>
          <div
            className="mt-1 text-[30px] font-bold tabular-nums leading-none text-[#E6EDF3]"
            title={leftValueTitle}
          >
            {leftValue}
          </div>
          {leftMeta ? (
            <div className="mt-0.5 min-h-[0.875rem] text-[10px] leading-snug text-[#E6EDF3]/55">
              {leftMeta}
            </div>
          ) : null}
        </div>
        <div className="shrink-0 text-right text-sm text-[#E6EDF3]/85">
          <div className="text-xs leading-snug text-[#E6EDF3]/70">{rightLabel}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums leading-none text-[#E6EDF3]">
            {rightValue}
          </div>
        </div>
      </div>
      <div className="min-h-[2.5rem] text-right text-sm text-[#E6EDF3]/85">
        <div className="text-xs leading-snug text-[#E6EDF3]/70">{bottomLabel}</div>
        <div
          className={`mt-1 text-lg font-semibold tabular-nums leading-none ${bottomValueColorClassName ?? "text-[#E6EDF3]"}`}
        >
          {bottomValue}
        </div>
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/10">
        <div
          className="h-1.5 rounded-full"
          style={{
            width: `${progressBarWidth}%`,
            backgroundColor: progressBarColor,
          }}
          aria-hidden
        />
      </div>
    </div>
  );
}

export function GPRAnalytics({
  tasks,
  allTasks,
  mode,
  activePartScope,
  planFactDataSource = "tasks",
  reportDate,
}: {
  tasks: GPRTask[];
  /** Полный список задач проекта (все partId) — для диагностики «всего в БД». */
  allTasks?: GPRTask[];
  mode: "edit" | "view";
  /** Часть проекта или агрегат «Проект» для графиков и ТМЦ. */
  activePartScope: ConstructionObjectScope;
  /** Источник данных для «План vs Факт»: таблица ГПР или `kvartaly_gpr_quarterly.json`. */
  planFactDataSource?: "tasks" | "kvartaly";
  /** Дата отчёта для плана/факта (п.п.); иначе «сегодня». */
  reportDate?: Date | string | null;
}) {
  /** Слайд презентации (и /construction в режиме «презентация»): без всплывающих popover; детали статусов — под диаграммой по клику. */
  const presentationAnalyticsSkin = mode === "view";
  const dependencyAnalyticDepth = presentationAnalyticsSkin ? "presentation" : "work";
  const isProjectWide = activePartScope === "project";
  const activeProjectPart = partIdToProjectPartKey(
    activePartScope === "project" ? 1 : activePartScope,
  );
  const aggregatePartKey: ProjectPartKey | "project" = isProjectWide ? "project" : activeProjectPart;
  const chartPart: ForecastPart = isProjectWide ? "project" : activeProjectPart;
  const activePartLabel = isProjectWide
    ? "Проект"
    : (PROJECT_PARTS.find((p) => p.id === activePartScope)?.name ?? "Часть проекта");

  const { token, hydrated } = useAuth();
  const constructionLocalMode = isGprLocalStorageMode();
  const gprProjectId = useMemo(() => getGprProjectId(), []);
  const [allTmc, setAllTmc] = useState<TMCItem[]>([]);
  const [allTenders, setAllTenders] = useState<Tender[]>([]);

  const gprReportAsOf = useMemo(() => resolveGprReportAsOf(reportDate), [reportDate]);
  const gprReportDateLabel = useMemo(() => formatDate(gprReportAsOf), [gprReportAsOf]);
  const gprReportYmd = useMemo(() => toLocalYmd(gprReportAsOf), [gprReportAsOf]);

  const fullTaskList = useMemo(
    () => (Array.isArray(allTasks) && allTasks.length > 0 ? allTasks : tasks),
    [allTasks, tasks],
  );

  /** Задачи выбранного объекта или все части при «Проект» (из полного списка, с эффективным partId). */
  const tasksForActivePart = useMemo(
    () => filterGprTasksByObjectScope(fullTaskList, activePartScope),
    [fullTaskList, activePartScope],
  );

  /** Источник «Распределение статусов» — тот же набор, что и tasksForActivePart. */
  const statusDistributionTasks = tasksForActivePart;

  /** Корневые шифры агрегата с учётом фактической структуры CSV (2.04/2.05 vs 2.06/2.07). */
  const aggregateRootCodes = useMemo(
    () =>
      isProjectWide
        ? AGGREGATE_ROOT_CODES_PROJECT
        : aggregateRootCodesForPart(activeProjectPart, tasksForActivePart),
    [isProjectWide, activeProjectPart, tasksForActivePart],
  );

  /**
   * «План vs Факт» по вкладкам объекта — только импорт CSV / БД (`partId`).
   * Kvartaly допустим только на агрегате «Проект» (если явно задан).
   */
  const effectivePlanFactDataSource = useMemo((): "tasks" | "kvartaly" => {
    if (!isProjectWide) return "tasks";
    return planFactDataSource;
  }, [planFactDataSource, isProjectWide]);

  const statusDistributionScopeLabel = PART_SHORT_TITLE_OR_PROJECT[aggregatePartKey];
  const statusDistributionTitle = `Распределение статусов — ${statusDistributionScopeLabel}`;
  const statusDistributionRiskCenterLabel = isProjectWide ? "Риск проекта" : "Риск";
  const statusDistributionRiskExplanation = isProjectWide
    ? "Процент риска по всему проекту на основе распределения статусов задач: жёлтые — умеренный риск, красные — критический."
    : `Процент риска по задачам «${statusDistributionScopeLabel}»: жёлтые — умеренный риск, красные — критический.`;

  /**
   * Данные для «План vs факт»: ветки WBS выбранного объекта (2.04/2.05 для ЖД, 2.06/2.07 или 2.04/2.05 для стоянки).
   */
  const tasksForPlanFactAnalytics = useMemo(() => {
    if (isProjectWide) return tasksForActivePart;
    if (activePartScope === PROJECT_PART_KEY_TO_ID.residential) {
      return tasksForActivePart.filter(
        (t) => matchesGprCodeBranch(t.code, "2.04") || matchesGprCodeBranch(t.code, "2.05"),
      );
    }
    if (activePartScope === PROJECT_PART_KEY_TO_ID.parking) {
      return tasksForActivePart.filter(
        (t) =>
          matchesGprCodeBranch(t.code, "2.06") ||
          matchesGprCodeBranch(t.code, "2.07") ||
          matchesGprCodeBranch(t.code, "2.04") ||
          matchesGprCodeBranch(t.code, "2.05"),
      );
    }
    return tasksForActivePart;
  }, [tasksForActivePart, activePartScope, isProjectWide]);

  const partProgressAggregate = useMemo(
    () =>
      computePartAggregate(
        tasksForActivePart,
        aggregateRootCodes,
        aggregatePartKey,
        gprReportAsOf,
      ),
    [tasksForActivePart, aggregateRootCodes, aggregatePartKey, gprReportAsOf],
  );
  const orderedStageRoots = useMemo(
    () => resolveStageCardRootTasks(tasksForActivePart, aggregateRootCodes),
    [tasksForActivePart, aggregateRootCodes],
  );

  /** Реестр ТМЦ из БД; фильтрация по части проекта для графика. */
  const tmcItemsForPart = useMemo(() => {
    if (isProjectWide) {
      return allTmc;
    }
    return allTmc.filter((x) => x.projectPart === activeProjectPart);
  }, [isProjectWide, activeProjectPart, allTmc]);
  const metrics = useMemo(
    () => getProjectStats(tasksForActivePart, gprReportAsOf),
    [tasksForActivePart, gprReportAsOf],
  );
  const flatTasks = flattenTasks(tasksForActivePart);

  /** Всего этапов ГПР объекта «Жилой дом» (сумма workTotal по корневым этапам 2.04 / 2.05). */
  const residentialZhDomGprStageTotal = useMemo(() => {
    const residentialTasks = filterGprTasksByObjectScope(
      fullTaskList.length > 0 ? fullTaskList : tasks,
      PROJECT_PART_KEY_TO_ID.residential,
    );
    if (residentialTasks.length === 0) return 0;
    const residentialFlat = flattenTasks(residentialTasks);
    const rootCodes = aggregateRootCodesForPart("residential", residentialFlat);
    const roots = resolveStageCardRootTasks(residentialFlat, rootCodes);
    let total = 0;
    for (const root of roots) {
      total += computeGprStageCompletionInsight(residentialFlat, root, gprReportAsOf).workTotal;
    }
    return total;
  }, [fullTaskList, tasks, gprReportAsOf]);

  const kvartalyAllFlat = useMemo(
    () =>
      effectivePlanFactDataSource === "kvartaly"
        ? flattenTasks(kvartalyRowsToGprTasksForAllParts())
        : [],
    [effectivePlanFactDataSource],
  );
  const residentialKvartalyTasks = useMemo(() => {
    const partResidential = kvartalyAllFlat.filter((t) => t.partId === PROJECT_PART_KEY_TO_ID.residential);
    if (activePartScope === PROJECT_PART_KEY_TO_ID.residential) {
      return filterZhDomPlanFactTasksTo205Branch(partResidential);
    }
    return partResidential;
  }, [kvartalyAllFlat, activePartScope]);
  const parkingKvartalyTasks = useMemo(
    () => kvartalyAllFlat.filter((t) => t.partId === PROJECT_PART_KEY_TO_ID.parking),
    [kvartalyAllFlat],
  );
  const [activeGroup, setActiveGroup] = useState<GroupKey | null>(null);
  const [planFactFilter, setPlanFactFilter] = useState<PlanFactChartFilter>({ filterType: "all" });
  const [planFactKvartalyGranularity, setPlanFactKvartalyGranularity] =
    useState<PlanFactKvartalyGranularity>("overview");
  /** Режим bar-chart при источнике «таблица задач» для ЖД / проекта: листья или только «2.05.XX». */
  const [planFactTasksBarLevel, setPlanFactTasksBarLevel] = useState<PlanFactTasksBarLevel>("detailed");
  const [tenderRevision, setTenderRevision] = useState(0);

  const reloadDependencies = useCallback(async () => {
    if (constructionLocalMode) {
      try {
        const [tmcResult, tenderResult] = await Promise.all([
          loadPersistedTmcItems(gprProjectId),
          loadPersistedTenderItems(gprProjectId),
        ]);
        setAllTmc(tmcResult.items);
        setAllTenders(tenderResult.tenders);
      } catch (e) {
        console.error(e);
      }
      return;
    }
    if (!token) return;
    try {
      const [tmcRows, tenderRows] = await Promise.all([listTmcFromDb(token), listTendersFromDb(token)]);
      setAllTmc(tmcRows);
      setAllTenders(tenderRows);
    } catch (e) {
      console.error(e);
    }
  }, [constructionLocalMode, gprProjectId, token]);

  useEffect(() => {
    const bump = () => setTenderRevision((x) => x + 1);
    window.addEventListener("gordo-tenders-saved", bump);
    window.addEventListener("gordo-tmc-saved", bump);
    return () => {
      window.removeEventListener("gordo-tenders-saved", bump);
      window.removeEventListener("gordo-tmc-saved", bump);
    };
  }, []);

  useEffect(() => {
    if (constructionLocalMode) {
      void reloadDependencies();
      return;
    }
    if (!hydrated || !token) return;
    void reloadDependencies();
  }, [constructionLocalMode, hydrated, token, reloadDependencies, tenderRevision]);

  useEffect(() => {
    setActiveGroup(null);
  }, [activePartScope]);

  useEffect(() => {
    setPlanFactFilter({ filterType: "all" });
  }, [activePartScope]);

  useEffect(() => {
    setPlanFactKvartalyGranularity("overview");
  }, [activePartScope]);

  useEffect(() => {
    setPlanFactTasksBarLevel("detailed");
  }, [activePartScope]);

  const residentialKvartalyForChart = useMemo(() => {
    if (effectivePlanFactDataSource !== "kvartaly") return [];
    if (planFactKvartalyGranularity === "aggregated") {
      return aggregateToMainProcesses(residentialKvartalyTasks);
    }
    return residentialKvartalyTasks;
  }, [effectivePlanFactDataSource, planFactKvartalyGranularity, residentialKvartalyTasks]);

  const parkingKvartalyForChart = useMemo(() => {
    if (effectivePlanFactDataSource !== "kvartaly") return [];
    if (planFactKvartalyGranularity === "aggregated") {
      return aggregateToMainProcesses(parkingKvartalyTasks);
    }
    return parkingKvartalyTasks;
  }, [effectivePlanFactDataSource, planFactKvartalyGranularity, parkingKvartalyTasks]);

  const projectKvartalyForChart = useMemo(
    () => [...residentialKvartalyForChart, ...parkingKvartalyForChart],
    [residentialKvartalyForChart, parkingKvartalyForChart],
  );

  const planFactFlatTasks = useMemo(() => {
    if (effectivePlanFactDataSource === "kvartaly") {
      if (isProjectWide) {
        return projectKvartalyForChart;
      }
      return activePartScope === PROJECT_PART_KEY_TO_ID.parking
        ? parkingKvartalyForChart
        : residentialKvartalyForChart;
    }
    return flattenTasks(tasksForPlanFactAnalytics).filter(
      (t) => isProjectWide || t.partId === activePartScope,
    );
  }, [
    effectivePlanFactDataSource,
    isProjectWide,
    activePartScope,
    projectKvartalyForChart,
    parkingKvartalyForChart,
    residentialKvartalyForChart,
    tasksForPlanFactAnalytics,
  ]);

  const tendersForActivePart: Tender[] = useMemo(() => {
    return allTenders.filter((t) => isProjectWide || t.partId === activePartScope);
  }, [activePartScope, isProjectWide, allTenders]);

  const planFactFilteredTasks = useMemo(() => {
    if (effectivePlanFactDataSource === "kvartaly") return planFactFlatTasks;
    const args = periodFilterToArgs(planFactFilter);
    if (!args) return planFactFlatTasks;
    return filterByPeriod(planFactFlatTasks, args.filterType, args.value);
  }, [effectivePlanFactDataSource, planFactFlatTasks, planFactFilter]);

  const quarterlyBucketsAll = useMemo((): QuarterlyAggregateBucket[] => {
    if (effectivePlanFactDataSource !== "kvartaly") return [];
    return computeQuarterlyAggregatesFromTasks(planFactFlatTasks);
  }, [effectivePlanFactDataSource, planFactFlatTasks]);

  const kvartalyGanttEnabled = effectivePlanFactDataSource === "kvartaly";
  const mRes = useKvartalyGanttModel(
    residentialKvartalyForChart,
    planFactFilter,
    kvartalyGanttEnabled && !isProjectWide && activePartScope === PROJECT_PART_KEY_TO_ID.residential,
    planFactKvartalyGranularity,
  );
  const mPark = useKvartalyGanttModel(
    parkingKvartalyForChart,
    planFactFilter,
    kvartalyGanttEnabled && !isProjectWide && activePartScope === PROJECT_PART_KEY_TO_ID.parking,
    planFactKvartalyGranularity,
  );
  const mProjectKv = useKvartalyGanttModel(
    projectKvartalyForChart,
    planFactFilter,
    kvartalyGanttEnabled && isProjectWide,
    planFactKvartalyGranularity,
  );

  const kvartalyActiveModel = isProjectWide
    ? mProjectKv
    : activePartScope === PROJECT_PART_KEY_TO_ID.parking
      ? mPark
      : mRes;

  const timelineYearsAvailable = useMemo(
    () => distinctYearsFromBuckets(quarterlyBucketsAll),
    [quarterlyBucketsAll],
  );

  /** Плановая дата окончания (часть проекта) — одна строка, без сравнений. */
  const planFactPlannedEndLine = useMemo(() => {
    const b =
      effectivePlanFactDataSource === "kvartaly"
        ? aggregateWorksToProjectPlanFactBounds(planFactFlatTasks)
        : aggregateWorksToProjectPlanFactBounds(tasksForPlanFactAnalytics);
    if (!b?.planEnd) return null;
    return formatPlanEndMonthYearOnly(b.planEnd);
  }, [effectivePlanFactDataSource, planFactFlatTasks, tasksForPlanFactAnalytics]);

  const planFactWorkTypeChartModel = useMemo(() => {
    if (effectivePlanFactDataSource !== "tasks") return null;
    const workTypePart = isProjectWide ? "project" : activeProjectPart;
    return buildPlanFactWorkTypeChartModel(
      planFactFilteredTasks,
      workTypePart,
      gprReportYmd,
      planFactTasksBarLevel,
    );
  }, [
    effectivePlanFactDataSource,
    planFactFilteredTasks,
    isProjectWide,
    activeProjectPart,
    gprReportYmd,
    planFactTasksBarLevel,
  ]);

  const showPlanFactTasksBarLevel = effectivePlanFactDataSource === "tasks";

  const planFactTasksChartHeightPx = useMemo(() => {
    if (effectivePlanFactDataSource !== "tasks" || !planFactWorkTypeChartModel) return null;
    const n = planFactWorkTypeChartModel.labels.length;
    return Math.min(1200, Math.max(280, n * 22 + 140));
  }, [effectivePlanFactDataSource, planFactWorkTypeChartModel]);

  const traffic = useMemo(() => {
    const counts = { green: 0, yellow: 0, red: 0, gray: 0 };
    const rows: TrafficRow[] = statusDistributionTasks.map((t) => ({
      task: t,
      ...trafficStatusForTask(t, gprReportAsOf),
    }));
    for (const r of rows) counts[r.status] += 1;
    return { counts, rows };
  }, [statusDistributionTasks, gprReportAsOf]);

  const statusDistributionDebugStats = useMemo((): StatusDistributionDebugStats | null => {
    if (!SHOW_STATUS_DISTRIBUTION_DEBUG || presentationAnalyticsSkin) return null;
    const effectivePartIds = new Set(statusDistributionTasks.map((t) => resolveGprTaskEffectivePartId(t)));
    const rawPartIds = new Set(
      statusDistributionTasks.map((t) => (Number.isFinite(Number(t.partId)) ? Number(t.partId) : 0)),
    );
    return {
      scopeLabel: statusDistributionScopeLabel,
      activeScope: activePartScope,
      total: statusDistributionTasks.length,
      partIds: [...effectivePartIds].sort((a, b) => a - b),
      rawPartIds: [...rawPartIds].filter((id) => id > 0).sort((a, b) => a - b),
      green: traffic.counts.green,
      yellow: traffic.counts.yellow,
      red: traffic.counts.red,
      gray: traffic.counts.gray,
    };
  }, [
    statusDistributionTasks,
    statusDistributionScopeLabel,
    activePartScope,
    presentationAnalyticsSkin,
    traffic.counts.green,
    traffic.counts.yellow,
    traffic.counts.red,
    traffic.counts.gray,
  ]);

  const parkingGprDebug = useMemo(() => {
    if (!SHOW_GPR_SCOPE_DEBUG || presentationAnalyticsSkin) return null;

    const dbTasksForScope = isProjectWide
      ? fullTaskList.filter((t) => !t.missingFromImport)
      : fullTaskList.filter((t) => t.partId === activePartScope && !t.missingFromImport);

    const wrongPartInPlanFact = isProjectWide
      ? 0
      : planFactFilteredTasks.filter((t) => t.partId !== activePartScope).length;

    const cardRootCodes = new Set(orderedStageRoots.map((t) => normalizeGprCodeFinal(t.code)));

    const gprParticipantIds = new Set<string>();
    for (const code of aggregateRootCodes) {
      const root = findGprCsvRootTask(tasksForActivePart, code);
      if (!root) continue;
      gprParticipantIds.add(root.id);
      const norm = normalizeGprCodeFinal(code);
      for (const t of tasksForActivePart) {
        const c = normalizeGprCodeFinal(t.code);
        if (c === norm || c.startsWith(`${norm}.`)) gprParticipantIds.add(t.id);
      }
    }

    const wbsSamples = planFactFilteredTasks.slice(0, 12).map((t) => ({
      code: normalizeGprCodeFinal(t.code),
      wbsLevel: gprWbsLevelFromCode(t.code, t.level),
      partId: t.partId,
      objectSource: t.objectType?.slice(0, 40) ?? `partId=${t.partId}`,
      inTopCards: cardRootCodes.has(normalizeGprCodeFinal(t.code)),
    }));

    let activeTasks = 0;
    let completedTasks = 0;
    for (const t of flatTasks) {
      const c = t.completion ?? 0;
      if (t.factStart?.trim() || c > 0) activeTasks += 1;
      if (t.factEnd?.trim() || c >= 100) completedTasks += 1;
    }

    const sourceLabel = isProjectWide ? "partId=1+2 (Проект)" : `partId=${activePartScope}`;

    return {
      activeTab: activePartLabel,
      totalInDb: dbTasksForScope.length,
      usedInWidgets: tasksForActivePart.length,
      usedInPlanFact: planFactFilteredTasks.length,
      usedInGpr: gprParticipantIds.size,
      usedInStatus: statusDistributionTasks.length,
      sourceLabel,
      planFactSource: effectivePlanFactDataSource,
      wrongPartInPlanFact,
      activeTasks,
      completedTasks,
      calculatedPercent: partProgressAggregate.totalPercent,
      aggregateCodes: aggregateRootCodes.join(", "),
      resolvedRoots: orderedStageRoots.length,
      cardRootCodes: [...cardRootCodes],
      barLevel: planFactTasksBarLevel,
      wbsSamples,
    };
  }, [
    activePartLabel,
    isProjectWide,
    activePartScope,
    fullTaskList,
    planFactFilteredTasks,
    tasksForActivePart,
    aggregateRootCodes,
    flatTasks,
    statusDistributionTasks,
    effectivePlanFactDataSource,
    partProgressAggregate.totalPercent,
    orderedStageRoots,
    planFactTasksBarLevel,
    presentationAnalyticsSkin,
  ]);

  useEffect(() => {
    if (!parkingGprDebug) return;
    const d = parkingGprDebug;
    const lines = [
      `Активная вкладка: ${d.activeTab}`,
      `Всего задач в БД: ${d.totalInDb}`,
      `Использовано в План vs Факт: ${d.usedInPlanFact}`,
      `Использовано в виджетах (статусы/ГПР): ${d.usedInWidgets}`,
      `Источник: ${d.sourceLabel}`,
      `Источник План vs Факт: ${d.planFactSource}`,
    ];
    if (d.wrongPartInPlanFact > 0) {
      lines.push(`⚠ Чужих partId в План vs Факт: ${d.wrongPartInPlanFact}`);
    }
    lines.push(`Режим WBS: ${d.barLevel}`);
    lines.push(`Корни карточек: ${d.cardRootCodes.join(", ") || "—"}`);
    console.info(`[GPR scope debug]\n${lines.join("\n")}`, d);
  }, [parkingGprDebug]);

  const {
    totalPercent: aggTotalPercent,
    totalDeviation: aggTotalDeviation,
    stages: aggregateStages,
  } = partProgressAggregate;

  const aggregateProblemSignals = useMemo(
    () => computeTmcProblemSignals(tasksForActivePart, tmcItemsForPart, gprReportYmd),
    [tasksForActivePart, tmcItemsForPart, gprReportYmd],
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
    m.green.sort((a, b) => (b.deviationDays ?? 0) - (a.deviationDays ?? 0));
    m.yellow.sort((a, b) => (a.deviationDays ?? 0) - (b.deviationDays ?? 0));
    m.red.sort((a, b) => (a.deviationDays ?? 0) - (b.deviationDays ?? 0));
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
    () => traffic.rows.some((r) => r.deviationDays !== null && r.deviationDays < 0),
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
        (a.deviationDays ?? 0) <= (b.deviationDays ?? 0) ? a : b,
      );
      const g = inferGroup(w.task);
      const stageTitle = gprStageDisplayTitle(tasksForActivePart, g);
      return `отставание на этапе «${stageTitle}»`;
    }
    const yellow = traffic.rows.filter((r) => r.status === "yellow");
    if (yellow.length > 0) {
      const w = yellow.reduce((a, b) =>
        (a.deviationDays ?? 0) <= (b.deviationDays ?? 0) ? a : b,
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
  const [statusDistributionSelectedSegment, setStatusDistributionSelectedSegment] =
    useState<Traffic | null>(null);
  const statusDistributionCardRef = useRef<HTMLButtonElement>(null);
  const statusDistributionPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStatusDistributionSelectedSegment(null);
  }, [activePartScope]);

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
        aggregatePartKey,
        aggregateStages,
        {
          notPurchased: aggregateProblemSignals.notPurchased,
          overdueDelivery: aggregateProblemSignals.overdueDelivery,
        },
        scheduleLagForAggregate,
      ),
    [
      aggregatePartKey,
      aggregateStages,
      aggregateProblemSignals.notPurchased,
      aggregateProblemSignals.overdueDelivery,
      scheduleLagForAggregate,
    ],
  );
  const aggregateProgressStatus = useMemo(
    () => aggregateProgressStatusFromDistribution(traffic.counts),
    [traffic.counts],
  );
  const statusAgg: Traffic = aggregateProgressStatus.status;
  const accentAgg =
    statusAgg === "green"
      ? COLORS.green
      : statusAgg === "yellow"
        ? COLORS.yellow
        : statusAgg === "red"
          ? COLORS.red
          : COLORS.gray;
  /** Одно число для подписи и ширины полосы (без двойного округления). */
  const aggregateTotalProgressUi = useMemo(() => {
    if (aggTotalPercent === null || !Number.isFinite(Number(aggTotalPercent))) {
      return { display: "—" as const, widthPct: 0 };
    }
    const clamped = Math.max(0, Math.min(100, Number(aggTotalPercent)));
    const progress = Math.round(clamped * 10) / 10;
    const isInt = Math.abs(progress - Math.round(progress)) < 1e-6;
    const display = isInt ? `${Math.round(progress)}%` : `${progress.toFixed(1)}%`;
    return { display, widthPct: progress };
  }, [aggTotalPercent]);

  /** «64% / 28%» — округлённые % выполнения по корневым этапам (как в карточках слева). */
  const aggregateStagesKpiLine = useMemo(() => {
    if (!aggregateStages.length) return "—";
    return aggregateStages.map((s) => `${Math.round(s.completion)}%`).join(" / ");
  }, [aggregateStages]);

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

  const handleStatusDistributionSegmentClick = (status: Traffic) => {
    setStatusDistributionSelectedSegment((prev) => (prev === status ? null : status));
  };

  const aggregateLagDaysRounded =
    aggTotalDeviation !== null && aggTotalDeviation > 0
      ? Math.round(aggTotalDeviation)
      : null;
  const aggregateDeviationUi =
    aggTotalDeviation === null ? null : getStatusByGprProgressDelta(aggTotalDeviation);
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

  const aggregateProgressCardMain = (
    <GprTopKpiCardLayout
      title={PART_SHORT_TITLE_OR_PROJECT[aggregatePartKey] ?? (isProjectWide ? "Проект" : "Часть проекта")}
      leftLabel="Выполнение ГПР"
      leftValue={aggregateTotalProgressUi.display}
      leftMeta=""
      rightLabel="По этапам"
      rightValue={aggregateStagesKpiLine}
      bottomLabel="Отклонение готовности, п.п."
      bottomValue={
        aggTotalDeviation === null
          ? "—"
          : `${aggTotalDeviation > 0 ? "+" : aggTotalDeviation < 0 ? "−" : ""}${Math.abs(
              Math.round(aggTotalDeviation * 10) / 10,
            )}%`
      }
      bottomValueColorClassName={
        aggregateDeviationUi === null
          ? "text-slate-400"
          : aggregateDeviationUi === "green"
            ? "text-emerald-400"
            : aggregateDeviationUi === "yellow"
              ? "text-amber-300"
              : "text-rose-400"
      }
      leftValueTitle={AGGREGATE_PROGRESS_TOOLTIP}
      progressBarWidth={aggregateTotalProgressUi.widthPct}
      progressBarColor={accentAgg}
    />
  );

  /**
   * Аггрегированное распределение статусов и счётчиков выполнения по всем корневым этапам
   * активной части (для жилого дома — 2.04 + 2.05). Используется тот же самый бэкенд расчёта,
   * что и в карточках 2.04 / 2.05; формулы НЕ менялись — только агрегируем по корням.
   */
  const aggregateStageBreakdown = useMemo(() => {
    let workCompleted = 0;
    let workTotal = 0;
    let trafficGreen = 0;
    let trafficYellow = 0;
    let trafficRed = 0;
    let donutOnTime = 0;
    let donutRisk = 0;
    let donutOverdue = 0;
    let donutCompletedLate = 0;
    let donutNotStarted = 0;
    for (const root of orderedStageRoots) {
      const insight = computeGprStageCompletionInsight(flatTasks, root, gprReportAsOf);
      const bd = computeGprStageStatusBreakdown(flatTasks, root, gprReportAsOf, insight);
      workCompleted += bd.completedStages;
      workTotal += bd.totalStages;
      trafficGreen += bd.onTimeCount;
      trafficYellow += bd.atRiskCount;
      trafficRed += bd.overdueCount;
      donutOnTime += bd.donutOnTimeCount;
      donutRisk += bd.donutRiskCount;
      donutOverdue += bd.donutOverdueCount;
      donutCompletedLate += bd.donutCompletedLateCount;
      donutNotStarted += bd.donutNotStartedCount;
    }
    const completedSharePct =
      workTotal > 0 ? Math.round((workCompleted / workTotal) * 1000) / 10 : 0;
    return {
      workCompleted,
      workTotal,
      trafficGreen,
      trafficYellow,
      trafficRed,
      donutOnTime,
      donutRisk,
      donutOverdue,
      donutCompletedLate,
      donutNotStarted,
      completedSharePct,
    };
  }, [orderedStageRoots, flatTasks, gprReportAsOf]);

  /**
   * Плановая агрегированная готовность жилого дома (или активной части) на текущую дату.
   * Считается как взвешенная сумма stageInsight.planPercent по тем же корневым этапам и тем же
   * весам, что использует aggregateTotalProgressUi для факта (см. computePartAggregate / aggregateStages).
   * Это та же модель плановой готовности, которую отрисовывают карточки 2.04 и 2.05 — никаких
   * новых формул, только взвешенное агрегирование уже существующего значения.
   */
  const aggregatePlannedPercent = useMemo<number | null>(() => {
    if (!aggregateStages.length) return null;
    let weightedSum = 0;
    let weightSum = 0;
    for (const stage of aggregateStages) {
      const wPercent = stage.weightPercent;
      if (wPercent === null || !Number.isFinite(wPercent) || wPercent <= 0) continue;
      const root = orderedStageRoots.find(
        (r) => normalizeGprCodeFinal(r.code) === normalizeGprCodeFinal(stage.code),
      );
      if (!root) continue;
      const insight = computeGprStageCompletionInsight(flatTasks, root, gprReportAsOf);
      const planPct = insight.planPercent;
      if (planPct === null || !Number.isFinite(planPct)) continue;
      const w = wPercent / 100;
      weightedSum += w * planPct;
      weightSum += w;
    }
    if (weightSum <= 0) return null;
    return Math.round((weightedSum / weightSum) * 10) / 10;
  }, [aggregateStages, orderedStageRoots, flatTasks, gprReportAsOf]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (aggregatePlannedPercent !== null) return;
    if (!aggregateStages.length) return;
    const sources = aggregateStages.map((stage) => {
      const root = orderedStageRoots.find(
        (r) => normalizeGprCodeFinal(r.code) === normalizeGprCodeFinal(stage.code),
      );
      const planPct = root
        ? computeGprStageCompletionInsight(flatTasks, root, gprReportAsOf).planPercent
        : null;
      return {
        code: stage.code,
        title: stage.composeTitle,
        weightPercent: stage.weightPercent,
        planPercent: planPct,
      };
    });
    console.warn(
      "[GPR aggregate] planPercent отсутствует — не удалось взвешенно агрегировать план для карточки «Жилой дом».",
      {
        factSource: "aggregateTotalProgressUi.display ← computePartAggregate.totalPercent (взвешенный rollup листьев)",
        planSource: "Σ wᵢ × stageInsight.planPercent (та же модель плановой готовности, что в карточках 2.04 / 2.05)",
        aggTotalPercent,
        aggTotalDeviation,
        gprReportAsOf,
        stages: sources,
      },
    );
  }, [
    aggregatePlannedPercent,
    aggregateStages,
    orderedStageRoots,
    flatTasks,
    gprReportAsOf,
    aggTotalPercent,
    aggTotalDeviation,
  ]);

  const aggregatePlanClamped =
    aggregatePlannedPercent === null
      ? null
      : Math.max(0, Math.min(100, Math.round(aggregatePlannedPercent * 10) / 10));
  const aggregatePlanDisplay =
    aggregatePlanClamped === null
      ? "—"
      : Math.abs(aggregatePlanClamped - Math.round(aggregatePlanClamped)) < 1e-6
        ? `${Math.round(aggregatePlanClamped)}%`
        : `${aggregatePlanClamped.toFixed(1)}%`;
  const aggregateDeviationDeltaPp =
    aggTotalDeviation === null ? null : Math.round(aggTotalDeviation * 10) / 10;
  const aggregateDeviationDisplay =
    aggregateDeviationDeltaPp === null
      ? "—"
      : aggregateDeviationDeltaPp < 0
        ? `−${Math.abs(aggregateDeviationDeltaPp)}`
        : aggregateDeviationDeltaPp > 0
          ? `+${aggregateDeviationDeltaPp}`
          : "0";

  if (mode === "edit") {
    return (
      <section className="min-w-0 space-y-4 overflow-x-clip">
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
              <p className="text-slate-500">Среднее отклонение готовности на {gprReportDateLabel}</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">
                {metrics.avgDeviation > 0 ? "+" : ""}
                {metrics.avgDeviation} %
              </p>
            </div>
          </div>
        </div>
        {parkingGprDebug ? <GprScopeDebugPanel debug={parkingGprDebug} /> : null}
      </section>
    );
  }

  return (
    <section className="min-w-0 space-y-4 overflow-x-clip">
      <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-3">
        {orderedStageRoots.map((task) => {
          const stageInsight = computeGprStageCompletionInsight(flatTasks, task, gprReportAsOf);
          const statusBreakdown = computeGprStageStatusBreakdown(
            flatTasks,
            task,
            gprReportAsOf,
            stageInsight,
          );
          const plannedPercent = stageInsight.planPercent;
          const progressDeltaPp =
            plannedPercent === null ? null : Math.round((stageInsight.factPercent - plannedPercent) * 10) / 10;
          const deviationLabel =
            progressDeltaPp === null
              ? "—"
              : progressDeltaPp < 0
                ? `−${Math.abs(progressDeltaPp)}`
                : progressDeltaPp > 0
                  ? `+${progressDeltaPp}`
                  : "0";
          const progressClamped = Math.max(
            0,
            Math.min(100, Math.round(stageInsight.factPercent * 10) / 10),
          );
          const planClamped =
            plannedPercent === null
              ? null
              : Math.max(0, Math.min(100, Math.round(plannedPercent * 10) / 10));
          const progressDisplay =
            Math.abs(progressClamped - Math.round(progressClamped)) < 1e-6
              ? `${Math.round(progressClamped)}%`
              : `${progressClamped.toFixed(1)}%`;
          const planDisplay =
            planClamped === null
              ? "—"
              : Math.abs(planClamped - Math.round(planClamped)) < 1e-6
                ? `${Math.round(planClamped)}%`
                : `${planClamped.toFixed(1)}%`;
          const isNoData =
            progressClamped === 0 &&
            stageInsight.workInProgress === 0 &&
            stageInsight.workCompleted === 0 &&
            stageInsight.workWithFactDates === 0;
          const deviationUi = progressDeltaPp === null ? null : getStatusByGprProgressDelta(progressDeltaPp);
          const status: Traffic =
            isNoData || progressDeltaPp === null ? "gray" : (deviationUi as Traffic);
          const isPrepTerritoryStageCard =
            normalizeGprCodeFinal(task.code) === "2.04" ||
            task.name.trim() === "Подготовка территории строительства";
          const isBuildingConstructionStageCard =
            normalizeGprCodeFinal(task.code) === "2.05" ||
            task.name.trim() === "Строительство зданий и сооружений";
          const isResidentialCompactStageCard =
            isPrepTerritoryStageCard || isBuildingConstructionStageCard;
          const residentialZhDomCompletedSharePct =
            isResidentialCompactStageCard && residentialZhDomGprStageTotal > 0
              ? Math.round(
                  (statusBreakdown.completedStages / residentialZhDomGprStageTotal) * 1000,
                ) / 10
              : statusBreakdown.completedSharePct;
          return (
            <GprStageKpiCard
              key={task.globalTaskId ?? task.id}
              title={task.name}
              status={status}
              metricsVariant={isResidentialCompactStageCard ? "compact" : "full"}
              donutStatusVariant={
                isBuildingConstructionStageCard ? "trafficKpi" : "workItem"
              }
              factLabel="Факт выполнения"
              factValue={isNoData ? "—" : progressDisplay}
              factTitle={stageInsight.tooltipText}
              planLabel="Плановая готовность"
              planValue={planDisplay}
              deviationLabel="Отклонение готовности, п.п."
              deviationValue={`${deviationLabel}%`}
              deviationDeltaPp={progressDeltaPp}
              completedStages={statusBreakdown.completedStages}
              totalStages={statusBreakdown.totalStages}
              onTimeCount={statusBreakdown.onTimeCount}
              atRiskCount={statusBreakdown.atRiskCount}
              overdueCount={statusBreakdown.overdueCount}
              completedSharePct={residentialZhDomCompletedSharePct}
              donutOnTimeCount={statusBreakdown.donutOnTimeCount}
              donutRiskCount={statusBreakdown.donutRiskCount}
              donutOverdueCount={statusBreakdown.donutOverdueCount}
              donutCompletedLateCount={statusBreakdown.donutCompletedLateCount}
              donutNotStartedCount={statusBreakdown.donutNotStartedCount}
              problematicSharePct={statusBreakdown.problematicSharePct}
            />
          );
        })}

        <GprStageKpiCard
          key="part-aggregate"
          title={PART_SHORT_TITLE_OR_PROJECT[aggregatePartKey] ?? (isProjectWide ? "Проект" : "Часть проекта")}
          status={statusAgg}
          metricsVariant="compact"
          donutStatusVariant="trafficKpi"
          factLabel="Факт выполнения"
          factValue={aggregateTotalProgressUi.display}
          factTitle={AGGREGATE_PROGRESS_TOOLTIP}
          planLabel="Плановая готовность"
          planValue={aggregatePlanDisplay}
          deviationLabel="Отклонение готовности, п.п."
          deviationValue={`${aggregateDeviationDisplay}%`}
          deviationDeltaPp={aggregateDeviationDeltaPp}
          completedStages={aggregateStageBreakdown.workCompleted}
          totalStages={aggregateStageBreakdown.workTotal}
          onTimeCount={aggregateStageBreakdown.trafficGreen}
          atRiskCount={aggregateStageBreakdown.trafficYellow}
          overdueCount={aggregateStageBreakdown.trafficRed}
          completedSharePct={aggregateStageBreakdown.completedSharePct}
          donutOnTimeCount={aggregateStageBreakdown.donutOnTime}
          donutRiskCount={aggregateStageBreakdown.donutRisk}
          donutOverdueCount={aggregateStageBreakdown.donutOverdue}
          donutCompletedLateCount={aggregateStageBreakdown.donutCompletedLate}
          donutNotStartedCount={aggregateStageBreakdown.donutNotStarted}
          problematicSharePct={0}
        />
      </div>

      <div className="grid grid-cols-1 min-w-0">
        <div className="min-w-0 rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4 shadow-sm sm:p-6">
          <div>
            <div className="flex flex-col gap-2">
              <h3 className="min-w-0 text-lg font-semibold leading-snug text-slate-50">Динамика выполнения ГПР</h3>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            {showPlanFactTasksBarLevel ? (
              <label className="flex min-w-[170px] flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Уровень</span>
                <select
                  value={planFactTasksBarLevel}
                  onChange={(e) => setPlanFactTasksBarLevel(e.target.value as PlanFactTasksBarLevel)}
                  className="h-8 rounded-lg border border-slate-600/70 bg-slate-900/60 px-2.5 text-xs text-slate-100"
                >
                  <option value="simplified">Упрощённо (2.04 / 2.05)</option>
                  <option value="detailed">Детально (2.05.XX / 2.04.XX)</option>
                  <option value="full">Полная детализация (листья WBS)</option>
                </select>
              </label>
            ) : null}
            {effectivePlanFactDataSource === "kvartaly" ? (
              <label className="flex min-w-[170px] flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Уровень</span>
                <select
                  value={planFactKvartalyGranularity}
                  onChange={(e) => setPlanFactKvartalyGranularity(e.target.value as PlanFactKvartalyGranularity)}
                  className="h-8 rounded-lg border border-slate-600/70 bg-slate-900/60 px-2.5 text-xs text-slate-100"
                >
                  <option value="overview">Обобщенно</option>
                  <option value="aggregated">Укрупнённо</option>
                  <option value="detailed">Детально</option>
                </select>
              </label>
            ) : null}

            <label className="flex min-w-[230px] flex-1 flex-col gap-1 sm:flex-none">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Период</span>
              <select
                value={
                  planFactFilter.filterType === "all"
                    ? "all"
                    : planFactFilter.filterType === "year"
                      ? `year:${planFactFilter.value}`
                      : planFactFilter.filterType === "timelineQuarter"
                        ? `timelineQuarter:${planFactFilter.key}`
                        : planFactFilter.filterType === "quarter"
                          ? `quarter:${planFactFilter.value}`
                          : `month:${planFactFilter.value}`
                }
                onChange={(e) => {
                  const selected = e.target.value;
                  if (selected === "all") {
                    setPlanFactFilter({ filterType: "all" });
                    return;
                  }
                  const [kind, raw] = selected.split(":", 2);
                  if (kind === "year") {
                    const y = Number(raw);
                    if (Number.isFinite(y)) setPlanFactFilter({ filterType: "year", value: y });
                    return;
                  }
                  if (kind === "timelineQuarter" && raw) {
                    setPlanFactFilter({ filterType: "timelineQuarter", key: raw });
                    return;
                  }
                  if (kind === "quarter") {
                    const q = Number(raw);
                    if (Number.isFinite(q)) setPlanFactFilter({ filterType: "quarter", value: q });
                    return;
                  }
                  if (kind === "month") {
                    const m = Number(raw);
                    if (Number.isFinite(m)) setPlanFactFilter({ filterType: "month", value: m });
                  }
                }}
                className="h-8 rounded-lg border border-slate-600/70 bg-slate-900/60 px-2.5 text-xs text-slate-100"
              >
                <option value="all">Все</option>
                {effectivePlanFactDataSource === "kvartaly"
                  ? [
                      ...timelineYearsAvailable.map((y) => (
                        <option key={`year-${y}`} value={`year:${y}`}>
                          {y}
                        </option>
                      )),
                      ...quarterlyBucketsAll.map((b) => (
                        <option key={`tq-${b.quarter_key}`} value={`timelineQuarter:${b.quarter_key}`}>
                          {b.quarter_label}
                        </option>
                      )),
                    ]
                  : [
                      ...QUARTER_FILTER_BUTTONS.map((q) => (
                        <option key={`q-${q.value}`} value={`quarter:${q.value}`}>
                          {q.label} ({q.range})
                        </option>
                      )),
                      ...MONTH_FILTER_BUTTONS.map((m) => (
                        <option key={`m-${m.value}`} value={`month:${m.value}`}>
                          {m.label}
                        </option>
                      )),
                    ]}
              </select>
            </label>
          </div>

          {effectivePlanFactDataSource === "kvartaly" && planFactFilter.filterType === "year" ? (
            <p className="mt-3 text-xs font-medium text-slate-400">
              Окно: {planFactFilter.value} год. Показаны работы, чей план пересекается с годом; полосы обрезаны по
              границам года.
            </p>
          ) : null}
          {effectivePlanFactDataSource === "kvartaly" && planFactFilter.filterType === "timelineQuarter" ? (
            <p className="mt-3 text-xs font-medium text-slate-400">
              Окно: квартал {formatQuarterDisplayLabel(planFactFilter.key)}. Работы с планом, пересекающим квартал.
            </p>
          ) : null}
          {effectivePlanFactDataSource === "tasks" && planFactFilter.filterType !== "all" ? (
            <p className="mt-3 text-xs font-medium text-slate-400">
              Показаны работы, пересекающие выбранный период
            </p>
          ) : null}

          <div
            className={`mt-4 w-full min-w-0 ${
              effectivePlanFactDataSource === "kvartaly"
                ? "overflow-hidden"
                : planFactTasksChartHeightPx != null
                  ? "max-h-[min(85vh,1200px)] overflow-x-hidden overflow-y-auto"
                  : "h-[240px] overflow-hidden sm:h-[300px] md:h-[320px]"
            }`}
            style={
              planFactTasksChartHeightPx != null
                ? { height: planFactTasksChartHeightPx, minHeight: 280 }
                : undefined
            }
          >
            {effectivePlanFactDataSource === "kvartaly" ? (
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
                  key={`kvartaly-gantt-${planFactKvartalyGranularity}-${String(activePartScope)}-${[...(kvartalyActiveModel.ganttRows ?? [])].map((r) => r.id).sort().join(":")}`}
                  className="w-full min-w-0 max-h-[min(85vh,1200px)] overflow-y-auto overflow-x-hidden"
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
                  <KvartalyGanttChartPanel model={kvartalyActiveModel} gprAsOf={gprReportAsOf} />
                </div>
              )
            ) : planFactWorkTypeChartModel == null || planFactWorkTypeChartModel.labels.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-lg border border-slate-700/50 bg-slate-900/30 px-4 text-center text-sm text-slate-400">
                {planFactFilter.filterType === "all"
                  ? "Нет задач с шифром 2.05 (жилой дом) или 2.06 / 2.07 (стоянка) для диаграммы, либо данные не загружены."
                  : "В выбранном периоде нет задач (учтены и строки без плановых дат)."}
              </div>
            ) : (
              (() => {
                const m = planFactWorkTypeChartModel;
                const { originMonth } = m;
                const xTickLabel = (v: string | number) => {
                  const t = Number(v);
                  if (!Number.isFinite(t)) return "";
                  const d = new Date(
                    originMonth.getFullYear(),
                    originMonth.getMonth() + Math.floor(t + 0.0001),
                    1,
                  );
                  return formatPlanFactGridMonthLabel(d);
                };
                const planLegend = m.planColors[0] ?? "#94a3b8";
                const factLegend = pickGanttFactLegendColor(m.factColors, m.factRanges);
                return (
                  <div className="flex h-full w-full min-h-0 min-w-0 flex-col">
                    <div className="min-h-0 min-w-0 flex-1">
                      <Chart
                        type="bar"
                        data={
                          {
                            labels: m.labels,
                            datasets: [
                              {
                                label: "План",
                                data: m.planRanges,
                                backgroundColor: m.planColors,
                                borderColor: m.planColors,
                                borderWidth: 0,
                                borderRadius: 4,
                                maxBarThickness: 18,
                                order: 1,
                              },
                              {
                                label: "Факт",
                                data: m.factRanges,
                                backgroundColor: m.factColors,
                                borderColor: m.factColors,
                                borderWidth: 0,
                                borderRadius: 4,
                                maxBarThickness: 18,
                                order: 0,
                              },
                            ],
                          } as any
                        }
                        options={
                          {
                            indexAxis: "y",
                            responsive: true,
                            maintainAspectRatio: false,
                            layout: { padding: { top: 20, right: 10, left: 4, bottom: 8 } },
                            interaction: { mode: "nearest", axis: "y", intersect: true },
                            plugins: {
                              legend: { display: false },
                              planFactMonthToday: { x: m.todayX },
                              tooltip: {
                                enabled: true,
                                backgroundColor: "rgba(15,23,42,0.94)",
                                borderColor: "rgba(148,163,184,0.35)",
                                borderWidth: 1,
                                titleColor: "#f8fafc",
                                bodyColor: "#e2e8f0",
                                padding: 10,
                                callbacks: {
                                  title: (items: { dataIndex?: number }[]) => {
                                    const i = items[0]?.dataIndex;
                                    if (typeof i !== "number" || i < 0) return "";
                                    return m.labels[i] ?? "";
                                  },
                                  label: (ctx: { datasetIndex?: number; dataIndex?: number }) => {
                                    const i = ctx.dataIndex ?? 0;
                                    const d = m.rowDetails[i];
                                    if (!d) return "";
                                    if (d.hasDates === false) {
                                      return ctx.datasetIndex === 0 ? "План: нет данных" : "Факт: нет данных";
                                    }
                                    if (ctx.datasetIndex === 0) {
                                      return `План: ${fmt(d.planStart)} — ${fmt(d.planEnd)}`;
                                    }
                                    if (d.factStart && d.factEnd) {
                                      return `Факт: ${fmt(d.factStart)} — ${fmt(d.factEnd)}`;
                                    }
                                    return "Факт: нет данных";
                                  },
                                },
                              },
                            },
                            scales: {
                              x: {
                                type: "linear",
                                min: m.xMin,
                                max: m.xMax,
                                grid: { color: "rgba(148,163,184,0.12)" },
                                border: { display: false },
                                ticks: {
                                  color: "#94a3b8",
                                  stepSize: 1,
                                  maxRotation: 0,
                                  font: { size: 10 },
                                  callback: xTickLabel,
                                },
                                title: {
                                  display: true,
                                  text: "Сроки (мес.)",
                                  color: "#94a3b8",
                                  font: { size: 11 },
                                },
                              },
                              y: {
                                grid: { display: false },
                                border: { display: false },
                                ticks: { color: "#cbd5e1", font: { size: 11 } },
                              },
                            },
                          } as any
                        }
                      />
                    </div>
                    <div className="w-full shrink-0 pt-2">
                      <AnalyticsLegendList>
                        <AnalyticsLegendItem markerColor={planLegend} label="План" />
                        <AnalyticsLegendItem markerColor={factLegend} label="Факт" />
                      </AnalyticsLegendList>
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        </div>

      </div>

      {!presentationAnalyticsSkin && (
        <div className="min-w-0 rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4 shadow-sm sm:p-6">
          <h3 className="text-lg font-semibold text-slate-50">Этапы / задачи</h3>
          <p className="mt-2 text-xs text-slate-300">
            Слева — статус (светофор). Серый — нет фактических дат.
          </p>

          <div className="mt-4 space-y-2">
            {traffic.rows
              .slice()
              .sort(
                (a: TrafficRow, b: TrafficRow) => (a.deviationDays ?? 999) - (b.deviationDays ?? 999),
              )
              .slice(0, 12)
              .map(({ task, status, planDays, factDays, deviationDays }: TrafficRow) => {
                return (
                  <div
                    key={task.globalTaskId ?? task.id}
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
                        Откл. (дн.):{" "}
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
                          {deviationDays === null
                            ? "—"
                            : formatGprScheduleDeviationDisplayDays(deviationDays)}
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
          Среднее отклонение от графика (дни) на {gprReportDateLabel}: отрицательное значение — отставание,
          положительное — опережение.
        </p>
        {(() => {
          const allowedGroupKeys = isProjectWide
            ? gprStageGroupKeysProjectWide()
            : gprStageGroupKeysForProjectPart(activeProjectPart);

          const devRows = flatTasks
            .filter((t) => (t.level ?? t.code.split(".").length - 1) > 1)
            .map((t) => {
              const endDelay = planFactEndDeviationDays(t.planEnd, t.factEnd, gprReportAsOf);
              const deviation = gprTaskScheduleDeviationDisplayDays(t, gprReportAsOf);
              const planDuration = daysInclusive(t.planStart, t.planEnd);
              const factDuration = t.factStart && t.factEnd ? daysInclusive(t.factStart, t.factEnd) : null;
              const group = inferGroup(t);
              return { task: t, deviation, endDelay, planDuration, factDuration, group };
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
              const critical = withDev.filter(
                (r) => r.endDelay !== null && getStatusByDeviation(r.endDelay) === "red",
              ).length;
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
                      g.withDevCount === 0 || g.avg === 0 ? "gray" : g.avg < 0 ? "red" : "green";
                    const avgColor =
                      g.withDevCount === 0 || g.avg === 0
                        ? "#e2e8f0"
                        : g.avg < 0
                          ? COLORS.red
                          : COLORS.green;
                    const avgText =
                      g.withDevCount === 0
                        ? "—"
                        : formatGprScheduleDeviationDisplayDays(g.avg, { decimals: true });
                    const iconIsLate = g.withDevCount > 0 && g.avg < 0;
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
                  {(() => {
                    const scaleMax = stageDeviationScaleMax(active.rows);
                    const half = scaleMax / 2;
                    return (
                  <div>
                    <div className="relative z-10 rounded-xl border border-slate-700/60 bg-slate-900/30 px-4 py-3">
                      <div className="relative h-6 text-[11px] tabular-nums text-slate-400">
                        <span className="absolute left-0">{formatStageDeviationScaleTick(-scaleMax)}</span>
                        <span className="absolute left-1/4 -translate-x-1/2">
                          {formatStageDeviationScaleTick(-half)}
                        </span>
                        <span className="absolute left-1/2 -translate-x-1/2 font-medium text-slate-200">0</span>
                        <span className="absolute left-3/4 -translate-x-1/2">
                          {formatStageDeviationScaleTick(half)}
                        </span>
                        <span className="absolute right-0">{formatStageDeviationScaleTick(scaleMax)}</span>
                      </div>
                      <p className="mt-1 text-center text-[10px] text-slate-500">
                        дни · шкала ±{scaleMax} от нуля (отставание ← · опережение →)
                      </p>
                    </div>

                    <div className="relative z-10 mt-3 space-y-3">
                      {active.rows.map((r, i) => (
                        <StageDeviationScaleRow
                          key={`dev-line-${active.key}-${r.task.id}-${i}`}
                          task={r.task}
                          asOf={gprReportAsOf}
                          tmcItems={tmcItemsForPart}
                          deviation={r.deviation}
                          endDelay={r.endDelay}
                          factDuration={r.factDuration}
                          planDuration={r.planDuration}
                          scaleMax={scaleMax}
                        />
                      ))}
                    </div>
                  </div>
                    );
                  })()}
                </div>
              ) : null}
            </div>
          );
        })()}
      </div>

      <GPRTmcDependencyChart
        tasks={tasksForActivePart}
        tmcItems={tmcItemsForPart}
        activeProjectPart={chartPart}
        analyticDepth={dependencyAnalyticDepth}
        reportAsOfIso={gprReportYmd}
        reportDateLabel={gprReportDateLabel}
      />
      <GPRTenderDependencyChart
        tasks={tasksForActivePart}
        tenders={tendersForActivePart}
        activeProjectPart={chartPart}
        analyticDepth={dependencyAnalyticDepth}
        reportAsOfIso={gprReportYmd}
        reportDateLabel={gprReportDateLabel}
      />
      <GPRForecastChart
        tasks={tasksForActivePart}
        tmcItems={tmcItemsForPart}
        tenders={tendersForActivePart}
        activeProjectPart={chartPart}
      />
    </section>
  );
}
