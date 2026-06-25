"use client";

import { useLayoutEffect, useMemo } from "react";
import {
  AnalyticsLegendItem,
  AnalyticsLegendList,
} from "@/components/construction/AnalyticsLegendItem";
import {
  auditPlanFactChartModel,
  computePlanFactGprChartLayout,
  logPlanFactChartColorDiagnostic,
  planFactGprBarSpanPct,
  planFactGprXAxisMonthTicks,
  planFactGprXPositionPct,
  PLAN_FACT_GPR_CHART_LABELS_COLUMN_MAX_PX,
  PLAN_FACT_GPR_CHART_LABELS_COLUMN_MIN_PX,
  PLAN_FACT_GPR_CHART_ROW_DIVIDER_COLOR,
  PLAN_FACT_GPR_CHART_ROW_HEIGHT_PX,
  PLAN_FACT_GPR_CHART_ROWS_PER_STAGE,
  PLAN_FACT_GPR_CHART_X_AXIS_HEIGHT_PX,
  type PlanFactWorkTypeChartModel,
} from "@/lib/planFactWorkTypeTimeline";

const DATE_FMT = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" });

function fmtDate(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return DATE_FMT.format(date);
}

const GANTT_FACT_LEGEND_GRAY = "rgba(148, 163, 184, 0.5)";

function ganttFactColorRankForLegend(color: string): number {
  const t = color.trim();
  if (t === "#22c55e") return 4;
  if (t === "#ef4444") return 3;
  if (t === "#f59e0b") return 2;
  return 1;
}

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

function buildStageTooltip(
  model: PlanFactWorkTypeChartModel,
  index: number,
  buildTooltip?: (model: PlanFactWorkTypeChartModel, index: number) => string,
): string {
  if (buildTooltip) return buildTooltip(model, index);
  const label = model.labels[index] ?? "";
  const d = model.rowDetails[index];
  if (!d) return label;
  if (d.hasDates === false) {
    return `${label}\nПлан: нет данных\nФакт: нет данных`;
  }
  const factPct = model.factCompletionLabels[index] ?? "—";
  const planLine = `План: ${fmtDate(d.planStart)} — ${fmtDate(d.planEnd)}`;
  if (d.factStart && d.factEnd) {
    return `${label}\n${planLine}\nФакт: ${fmtDate(d.factStart)} — ${fmtDate(d.factEnd)}\nВыполнение: ${factPct}`;
  }
  return `${label}\n${planLine}\nФакт: нет данных • Выполнение: ${factPct}`;
}

function parseFactPercent(label: string): number | null {
  const text = label.trim();
  if (!text || text === "—") return null;
  const value = Number.parseFloat(text.replace("%", "").replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function buildPlanFactGprGridTemplateColumns(): string {
  return `minmax(${PLAN_FACT_GPR_CHART_LABELS_COLUMN_MIN_PX}px, min(38%, ${PLAN_FACT_GPR_CHART_LABELS_COLUMN_MAX_PX}px)) minmax(0, 1fr)`;
}

function PlanFactGprXAxis({
  model,
  todayLeftPct,
}: {
  model: PlanFactWorkTypeChartModel;
  todayLeftPct: number | null;
}) {
  const ticks = useMemo(
    () => planFactGprXAxisMonthTicks(model.originMonth, model.xMin, model.xMax),
    [model.originMonth, model.xMin, model.xMax],
  );

  return (
    <div
      className="relative h-full w-full min-w-0"
      style={{ height: PLAN_FACT_GPR_CHART_X_AXIS_HEIGHT_PX }}
    >
      {ticks.map((tick) => (
        <span
          key={tick.value}
          className="absolute bottom-1 -translate-x-1/2 whitespace-nowrap text-[10px] leading-none text-slate-400"
          style={{
            left: `${planFactGprXPositionPct(tick.value, model.xMin, model.xMax)}%`,
          }}
        >
          {tick.label}
        </span>
      ))}
      {todayLeftPct != null ? (
        <span
          className="absolute top-0.5 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold leading-none text-slate-200"
          style={{ left: `${todayLeftPct}%` }}
        >
          Сегодня
        </span>
      ) : null}
    </div>
  );
}

function PlanFactGprChartGridOverlay({
  model,
  todayLeftPct,
}: {
  model: PlanFactWorkTypeChartModel;
  todayLeftPct: number | null;
}) {
  const ticks = useMemo(
    () => planFactGprXAxisMonthTicks(model.originMonth, model.xMin, model.xMax),
    [model.originMonth, model.xMin, model.xMax],
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
      {ticks.map((tick) => (
        <div
          key={tick.value}
          className="absolute bottom-0 top-0 w-px"
          style={{
            left: `${planFactGprXPositionPct(tick.value, model.xMin, model.xMax)}%`,
            backgroundColor: "rgba(148,163,184,0.12)",
          }}
        />
      ))}
      {todayLeftPct != null ? (
        <div
          className="absolute bottom-0 top-0 w-0 border-l-[1.5px] border-dashed"
          style={{
            left: `${todayLeftPct}%`,
            borderColor: "rgba(163, 179, 199, 0.52)",
          }}
        />
      ) : null}
    </div>
  );
}

function PlanFactGprSingleBar({
  span,
  color,
  percentLabel,
  todayLeftPct,
}: {
  span: { leftPct: number; widthPct: number } | null;
  color: string;
  percentLabel?: string | null;
  todayLeftPct: number | null;
}) {
  const showPercent = Boolean(percentLabel?.trim());
  let percentLeftPct = span ? span.leftPct + span.widthPct : 0;
  let percentAlign: "right" | "center" = "right";

  if (showPercent && span && todayLeftPct != null) {
    const factRightPct = span.leftPct + span.widthPct;
    const factCenterPct = span.leftPct + span.widthPct / 2;
    const overlapThresholdPct = 3;
    if (Math.abs(factRightPct - todayLeftPct) < overlapThresholdPct) {
      if (span.widthPct > overlapThresholdPct * 2.5) {
        percentLeftPct =
          todayLeftPct <= factCenterPct
            ? span.leftPct + span.widthPct * 0.38
            : span.leftPct + span.widthPct * 0.62;
      } else {
        percentLeftPct =
          todayLeftPct <= factCenterPct
            ? todayLeftPct + overlapThresholdPct
            : todayLeftPct - overlapThresholdPct;
      }
      percentAlign = "center";
    }
  }

  return (
    <div className="relative z-[1] flex h-full w-full min-w-0 items-center px-1">
      <div className="relative h-3 w-full min-w-0">
        {span ? (
          <div
            className="absolute inset-y-0 rounded"
            style={{
              left: `${span.leftPct}%`,
              width: `${span.widthPct}%`,
              backgroundColor: color,
            }}
          />
        ) : null}
        {showPercent && span ? (
          <span
            className="pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] font-semibold leading-none text-slate-50"
            style={{
              left: `${percentLeftPct}%`,
              transform:
                percentAlign === "center"
                  ? "translate(-50%, -50%)"
                  : "translate(calc(-100% - 6px), -50%)",
            }}
          >
            {percentLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function PlanFactGprStageGroup({
  index,
  label,
  model,
  todayLeftPct,
  gridTemplateColumns,
  buildTooltip,
  showZeroFactPercent = false,
}: {
  index: number;
  label: string;
  model: PlanFactWorkTypeChartModel;
  todayLeftPct: number | null;
  gridTemplateColumns: string;
  buildTooltip?: (model: PlanFactWorkTypeChartModel, index: number) => string;
  showZeroFactPercent?: boolean;
}) {
  const planRange = model.planRanges[index] ?? null;
  const factRange = model.factRanges[index] ?? null;
  const planSpan = planFactGprBarSpanPct(planRange, model.xMin, model.xMax);
  const factSpan = planFactGprBarSpanPct(factRange, model.xMin, model.xMax);
  const planColor = model.planColors[index] ?? "rgba(148, 163, 184, 0.5)";
  const factColor = model.factColors[index] ?? GANTT_FACT_LEGEND_GRAY;
  const factPctRaw = model.factCompletionLabels[index]?.trim() ?? "";
  const factPercent = parseFactPercent(factPctRaw);
  const showFact =
    factPercent != null && (factPercent > 0 || (showZeroFactPercent && factPercent <= 0));
  const displayedFactSpan =
    showFact && factSpan
      ? factSpan
      : showFact && showZeroFactPercent && factPercent === 0 && planSpan
        ? { leftPct: planSpan.leftPct, widthPct: Math.max(1.5, planSpan.widthPct * 0.06) }
        : null;
  const factPercentLabel = showFact ? factPctRaw : null;

  const groupHeight = PLAN_FACT_GPR_CHART_ROWS_PER_STAGE * PLAN_FACT_GPR_CHART_ROW_HEIGHT_PX;
  const tooltip = buildStageTooltip(model, index, buildTooltip);

  return (
    <div
      className="relative z-[1] grid border-b border-slate-600/35"
      style={{
        gridTemplateColumns,
        gridTemplateRows: `repeat(${PLAN_FACT_GPR_CHART_ROWS_PER_STAGE}, ${PLAN_FACT_GPR_CHART_ROW_HEIGHT_PX}px)`,
        height: groupHeight,
        borderBottomColor: PLAN_FACT_GPR_CHART_ROW_DIVIDER_COLOR,
      }}
      title={tooltip}
    >
      <div
        className="flex items-center overflow-hidden border-r border-slate-600/35 pr-2 text-[11px] leading-snug text-slate-300"
        style={{ gridRow: `1 / span ${PLAN_FACT_GPR_CHART_ROWS_PER_STAGE}` }}
        title={label}
      >
        <span className="line-clamp-2 w-full break-words">{label}</span>
      </div>

      <PlanFactGprSingleBar span={planSpan} color={planColor} todayLeftPct={todayLeftPct} />

      <PlanFactGprSingleBar
        span={displayedFactSpan}
        color={factColor}
        percentLabel={factPercentLabel}
        todayLeftPct={todayLeftPct}
      />
    </div>
  );
}

export function PlanFactGprDynamicsChartPanel({
  model,
  buildTooltip,
  planLegendLabel = "План",
  factLegendLabel = "Факт",
  showZeroFactPercent = false,
}: {
  model: PlanFactWorkTypeChartModel;
  buildTooltip?: (model: PlanFactWorkTypeChartModel, index: number) => string;
  planLegendLabel?: string;
  factLegendLabel?: string;
  /** Показывать фактическую строку при 0% (серый маркер и подпись). */
  showZeroFactPercent?: boolean;
}) {
  const stageCount = model.labels.length;
  const chartLayout = useMemo(() => computePlanFactGprChartLayout(stageCount), [stageCount]);
  const audit = useMemo(() => auditPlanFactChartModel(model), [model]);
  const gridTemplateColumns = useMemo(() => buildPlanFactGprGridTemplateColumns(), []);

  const todayLeftPct =
    model.todayX != null && Number.isFinite(model.todayX)
      ? planFactGprXPositionPct(model.todayX, model.xMin, model.xMax)
      : null;

  useLayoutEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    console.info("[PlanFactGprDynamicsChart] data audit", audit);
    logPlanFactChartColorDiagnostic(model);
  }, [audit, model]);

  const planLegend = model.planColors[0] ?? "#94a3b8";
  const factLegend = pickGanttFactLegendColor(model.factColors, model.factRanges);

  return (
    <div
      className="flex w-full min-w-0 flex-col"
      style={{ height: chartLayout.scrollContentHeightPx }}
    >
      <div
        className="grid w-full min-w-0"
        style={{
          gridTemplateColumns,
          height: chartLayout.chartBodyHeightPx,
        }}
      >
        <div
          className="border-b border-r border-slate-600/35"
          style={{
            height: PLAN_FACT_GPR_CHART_X_AXIS_HEIGHT_PX,
            borderBottomColor: PLAN_FACT_GPR_CHART_ROW_DIVIDER_COLOR,
          }}
        />

        <div
          className="relative min-w-0 border-b border-slate-600/35"
          style={{
            height: PLAN_FACT_GPR_CHART_X_AXIS_HEIGHT_PX,
            borderBottomColor: PLAN_FACT_GPR_CHART_ROW_DIVIDER_COLOR,
          }}
        >
          <PlanFactGprXAxis model={model} todayLeftPct={todayLeftPct} />
        </div>

        <div
          className="relative col-span-2 min-w-0"
          style={{
            gridColumn: "1 / -1",
            height: chartLayout.visualRowCount * PLAN_FACT_GPR_CHART_ROW_HEIGHT_PX,
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 grid"
            style={{ gridTemplateColumns }}
            aria-hidden
          >
            <div />
            <div className="relative min-w-0">
              <PlanFactGprChartGridOverlay model={model} todayLeftPct={todayLeftPct} />
            </div>
          </div>

          {model.labels.map((label, index) => (
            <PlanFactGprStageGroup
              key={`${index}::${label}`}
              index={index}
              label={label}
              model={model}
              todayLeftPct={todayLeftPct}
              gridTemplateColumns={gridTemplateColumns}
              buildTooltip={buildTooltip}
              showZeroFactPercent={showZeroFactPercent}
            />
          ))}
        </div>
      </div>

      <div className="w-full shrink-0 pt-2">
        <AnalyticsLegendList>
          <AnalyticsLegendItem markerColor={planLegend} label={planLegendLabel} />
          <AnalyticsLegendItem markerColor={factLegend} label={factLegendLabel} />
        </AnalyticsLegendList>
      </div>
    </div>
  );
}
