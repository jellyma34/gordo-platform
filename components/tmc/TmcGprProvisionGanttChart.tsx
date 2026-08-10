"use client";

import { useMemo, useState } from "react";
import {
  AnalyticsLegendItem,
  AnalyticsLegendList,
} from "@/components/construction/AnalyticsLegendItem";
import {
  formatPlanFactGridMonthLabel,
  PLAN_FACT_GPR_CHART_LABELS_COLUMN_MAX_PX,
  PLAN_FACT_GPR_CHART_LABELS_COLUMN_MIN_PX,
  PLAN_FACT_GPR_CHART_ROW_DIVIDER_COLOR,
  PLAN_FACT_GPR_CHART_X_AXIS_HEIGHT_PX,
  planFactGprXPositionPct,
} from "@/lib/planFactWorkTypeTimeline";
import {
  classifyContractProvisionStatus,
  classifyRequestProvisionStatus,
  formatTmcIsoRu,
  type GprTmcWorkLifecycleRow,
} from "@/lib/tmcProcurementAnalytics";

export type TmcProvisionGanttVariant = "request" | "contract";

/** Одна позиция = одна строка ~56px с двумя тонкими линиями. */
const ROW_HEIGHT_PX = 56;
const LANE_TRACK_H_PX = 14;
const BAR_H_PX = 4;
const MARKER_PX = 7;
const DOMAIN_PAD_MONTHS = 1;
const DAY_MS = 86400000;

const COLORS = {
  deadline: "#f59e0b",
  tmcOnTime: "#22c55e",
  tmcLate: "#ef4444",
  tmcPending: "rgba(148, 163, 184, 0.28)",
  tmcOverdue: "rgba(239, 68, 68, 0.75)",
  contractPlan: "#a855f7",
  contractOnTime: "#22c55e",
  contractLate: "#f59e0b",
  gprPlan: "rgba(148, 163, 184, 0.45)",
  gprFact: "#22c55e",
  gprRisk: "#ef4444",
  grid: "rgba(148,163,184,0.1)",
  today: "rgba(163, 179, 199, 0.45)",
  card: "#1e293b",
} as const;

type BarSpan = { leftPct: number; widthPct: number; color: string };
type EndpointMarker = { pct: number; color: string };

type LaneVisual = { bars: BarSpan[]; markers: EndpointMarker[] };

function gridTemplateColumns(): string {
  return `minmax(${PLAN_FACT_GPR_CHART_LABELS_COLUMN_MIN_PX}px, min(38%, ${PLAN_FACT_GPR_CHART_LABELS_COLUMN_MAX_PX}px)) minmax(0, 1fr)`;
}

function reportDateNoonMs(reportDate: Date): number {
  return new Date(
    reportDate.getFullYear(),
    reportDate.getMonth(),
    reportDate.getDate(),
    12,
    0,
    0,
    0,
  ).getTime();
}

function startOfMonthMs(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0).getTime();
}

function addMonthsMs(ms: number, months: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth() + months, 1, 0, 0, 0, 0).getTime();
}

function endOfMonthExclusiveMs(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0).getTime();
}

function toPct(ms: number, domainMin: number, domainMax: number): number {
  return planFactGprXPositionPct(ms, domainMin, domainMax);
}

function barBetween(
  aMs: number,
  bMs: number,
  domainMin: number,
  domainMax: number,
  color: string,
): BarSpan | null {
  const leftPct = toPct(Math.min(aMs, bMs), domainMin, domainMax);
  const rightPct = toPct(Math.max(aMs, bMs), domainMin, domainMax);
  const widthPct = rightPct - leftPct;
  if (widthPct <= 0.04) return null;
  return { leftPct, widthPct, color };
}

function markerAt(ms: number, domainMin: number, domainMax: number, color: string): EndpointMarker {
  return { pct: toPct(ms, domainMin, domainMax), color };
}

function buildMonthTicks(domainMin: number, domainMax: number): Array<{ ms: number; label: string }> {
  const ticks: Array<{ ms: number; label: string }> = [];
  let cursor = domainMin;
  let guard = 0;
  while (cursor < domainMax && guard < 120) {
    ticks.push({ ms: cursor, label: formatPlanFactGridMonthLabel(new Date(cursor)) });
    cursor = addMonthsMs(cursor, 1);
    guard += 1;
  }
  return ticks;
}

function collectDomainMs(
  rows: GprTmcWorkLifecycleRow[],
  variant: TmcProvisionGanttVariant,
  todayMs: number,
): number[] {
  const values: number[] = [todayMs];
  for (const row of rows) {
    if (variant === "request") {
      if (row.requestDeadlineMs != null) values.push(row.requestDeadlineMs);
      if (row.requestFactMs != null) values.push(row.requestFactMs);
    } else {
      if (row.contractPlanMs != null) values.push(row.contractPlanMs);
      if (row.contractFactMs != null) values.push(row.contractFactMs);
    }
    if (row.planStartMs != null) values.push(row.planStartMs);
    if (row.factStartMs != null) values.push(row.factStartMs);
  }
  return values;
}

function buildDomain(rows: GprTmcWorkLifecycleRow[], variant: TmcProvisionGanttVariant, todayMs: number) {
  const raw = collectDomainMs(rows, variant, todayMs);
  if (raw.length === 0) return null;
  const dataMin = Math.min(...raw);
  const dataMax = Math.max(...raw);
  return {
    min: startOfMonthMs(addMonthsMs(dataMin, -DOMAIN_PAD_MONTHS)),
    max: endOfMonthExclusiveMs(addMonthsMs(dataMax, DOMAIN_PAD_MONTHS)),
    todayMs,
  };
}

function buildTmcRequestLane(
  row: GprTmcWorkLifecycleRow,
  reportDate: Date,
  domainMin: number,
  domainMax: number,
): LaneVisual {
  const bars: BarSpan[] = [];
  const markers: EndpointMarker[] = [];
  const todayMs = reportDateNoonMs(reportDate);
  const req = classifyRequestProvisionStatus(row.requestDeadlineIso, row.requestFactIso, reportDate);

  if (row.requestDeadlineMs == null) return { bars, markers };

  const dl = row.requestDeadlineMs;
  markers.push(markerAt(dl, domainMin, domainMax, COLORS.deadline));

  if (req.status === "pending") {
    const lead = barBetween(todayMs < dl ? todayMs : domainMin, dl, domainMin, domainMax, COLORS.tmcPending);
    if (lead) bars.push(lead);
    return { bars, markers };
  }

  if (req.status === "missing") {
    const end = Math.min(todayMs, domainMax);
    if (end > dl) {
      const ob = barBetween(dl, end, domainMin, domainMax, COLORS.tmcOverdue);
      if (ob) bars.push(ob);
    }
    return { bars, markers };
  }

  if (row.requestFactMs != null) {
    const fact = row.requestFactMs;
    const color = req.status === "on_time" ? COLORS.tmcOnTime : COLORS.tmcLate;
    const conn = barBetween(dl, fact, domainMin, domainMax, color);
    if (conn) bars.push(conn);
    markers.push(markerAt(fact, domainMin, domainMax, color));
  }

  return { bars, markers };
}

function buildTmcContractLane(
  row: GprTmcWorkLifecycleRow,
  reportDate: Date,
  domainMin: number,
  domainMax: number,
): LaneVisual {
  const bars: BarSpan[] = [];
  const markers: EndpointMarker[] = [];
  const todayMs = reportDateNoonMs(reportDate);
  const con = classifyContractProvisionStatus(
    row.contractPlanIso,
    row.contractFactIso,
    row.contractDeviationDays,
    reportDate,
  );

  if (row.contractPlanMs == null) return { bars, markers };

  const pl = row.contractPlanMs;
  markers.push(markerAt(pl, domainMin, domainMax, COLORS.contractPlan));

  if (con.status === "pending") {
    const lead = barBetween(todayMs < pl ? todayMs : domainMin, pl, domainMin, domainMax, COLORS.tmcPending);
    if (lead) bars.push(lead);
    return { bars, markers };
  }

  if (con.status === "missing") {
    const end = Math.min(todayMs, domainMax);
    if (end > pl) {
      const ob = barBetween(pl, end, domainMin, domainMax, COLORS.tmcOverdue);
      if (ob) bars.push(ob);
    }
    return { bars, markers };
  }

  if (row.contractFactMs != null) {
    const fact = row.contractFactMs;
    const color = con.status === "on_time" ? COLORS.contractOnTime : COLORS.contractLate;
    const conn = barBetween(pl, fact, domainMin, domainMax, color);
    if (conn) bars.push(conn);
    markers.push(markerAt(fact, domainMin, domainMax, color));
  }

  return { bars, markers };
}

function buildGprLane(
  row: GprTmcWorkLifecycleRow,
  reportDate: Date,
  domainMin: number,
  domainMax: number,
): LaneVisual {
  const bars: BarSpan[] = [];
  const markers: EndpointMarker[] = [];
  const todayMs = reportDateNoonMs(reportDate);

  if (row.planStartMs == null) return { bars, markers };

  const plan = row.planStartMs;
  const planLead = barBetween(domainMin, plan, domainMin, domainMax, COLORS.gprPlan);
  if (planLead) bars.push(planLead);

  if (row.factStartMs != null) {
    const fact = row.factStartMs;
    markers.push(markerAt(fact, domainMin, domainMax, COLORS.gprFact));
    return { bars, markers };
  }

  if (plan < todayMs) {
    markers.push(markerAt(plan, domainMin, domainMax, COLORS.gprRisk));
  }

  return { bars, markers };
}

function ThinLaneTrack({ visual }: { visual: LaneVisual }) {
  return (
    <div className="relative w-full" style={{ height: LANE_TRACK_H_PX }}>
      <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-slate-700/30" />
      {visual.bars.map((bar, i) => (
        <div
          key={`b-${i}`}
          className="absolute rounded-full"
          style={{
            left: `${bar.leftPct}%`,
            width: `${bar.widthPct}%`,
            height: BAR_H_PX,
            top: "50%",
            transform: "translateY(-50%)",
            backgroundColor: bar.color,
          }}
        />
      ))}
      {visual.markers.map((m, i) => (
        <div
          key={`m-${i}`}
          className="absolute top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-950/80"
          style={{
            left: `${m.pct}%`,
            width: MARKER_PX,
            height: MARKER_PX,
            backgroundColor: m.color,
          }}
        />
      ))}
    </div>
  );
}

function RowTooltip({
  row,
  variant,
  reportDate,
}: {
  row: GprTmcWorkLifecycleRow;
  variant: TmcProvisionGanttVariant;
  reportDate: Date;
}) {
  const req = classifyRequestProvisionStatus(row.requestDeadlineIso, row.requestFactIso, reportDate);
  const con = classifyContractProvisionStatus(
    row.contractPlanIso,
    row.contractFactIso,
    row.contractDeviationDays,
    reportDate,
  );

  return (
    <div
      className="pointer-events-none absolute left-2 top-full z-30 mt-1 w-[240px] rounded-md border px-2.5 py-2 text-[11px] shadow-lg"
      style={{ background: COLORS.card, borderColor: "rgba(148,163,184,0.3)", color: "#e2e8f0" }}
    >
      <div className="font-semibold tabular-nums text-slate-100">{row.code}</div>
      <div className="truncate text-slate-400">{row.tmcNames || "—"}</div>
      <div className="mt-1.5 space-y-0.5 border-t border-slate-600/40 pt-1.5 tabular-nums text-slate-300">
        {variant === "request" ? (
          <>
            <div>
              Крайний срок:{" "}
              <span className="text-white">{formatTmcIsoRu(row.requestDeadlineIso)}</span>
            </div>
            <div>
              Факт заявки:{" "}
              <span className="text-white">
                {row.requestFactIso ? formatTmcIsoRu(row.requestFactIso) : "Не подано"}
              </span>
            </div>
            <div>
              Статус: <span className="text-white">{req.label}</span>
            </div>
          </>
        ) : (
          <>
            <div>
              План договора:{" "}
              <span className="text-white">{formatTmcIsoRu(row.contractPlanIso)}</span>
            </div>
            <div>
              Факт договора:{" "}
              <span className="text-white">
                {row.contractFactIso ? formatTmcIsoRu(row.contractFactIso) : "Не заключён"}
              </span>
            </div>
            <div>
              Статус: <span className="text-white">{con.label}</span>
            </div>
          </>
        )}
        <div>
          План начала ГПР:{" "}
          <span className="text-white">{formatTmcIsoRu(row.planStartIso)}</span>
        </div>
        <div>
          Факт начала ГПР:{" "}
          <span className="text-white">{formatTmcIsoRu(row.factStartIso)}</span>
        </div>
      </div>
    </div>
  );
}

function ProvisionRow({
  row,
  variant,
  reportDate,
  domainMin,
  domainMax,
  columns,
  hoverKey,
  onHover,
}: {
  row: GprTmcWorkLifecycleRow;
  variant: TmcProvisionGanttVariant;
  reportDate: Date;
  domainMin: number;
  domainMax: number;
  columns: string;
  hoverKey: string | null;
  onHover: (key: string | null) => void;
}) {
  const tmcVisual = useMemo(
    () =>
      variant === "request"
        ? buildTmcRequestLane(row, reportDate, domainMin, domainMax)
        : buildTmcContractLane(row, reportDate, domainMin, domainMax),
    [row, variant, reportDate, domainMin, domainMax],
  );
  const gprVisual = useMemo(
    () => buildGprLane(row, reportDate, domainMin, domainMax),
    [row, reportDate, domainMin, domainMax],
  );

  const active = hoverKey === row.rowKey;

  return (
    <div
      className="relative z-[1] grid border-b border-slate-600/30"
      style={{
        gridTemplateColumns: columns,
        height: ROW_HEIGHT_PX,
        borderBottomColor: PLAN_FACT_GPR_CHART_ROW_DIVIDER_COLOR,
      }}
      onMouseEnter={() => onHover(row.rowKey)}
      onMouseLeave={() => onHover(null)}
    >
      <div
        className="flex items-center overflow-hidden border-r border-slate-600/35 px-2"
        title={[row.code, row.tmcNames].filter(Boolean).join(" · ")}
      >
        <div className="min-w-0 w-full">
          <div className="truncate font-mono text-[11px] font-semibold tabular-nums text-slate-100">
            {row.code}
          </div>
          <div className="truncate text-[10px] text-slate-400">{row.tmcNames || "—"}</div>
        </div>
      </div>

      <div className="relative flex min-w-0 flex-col justify-center gap-1 px-1 py-2">
        <ThinLaneTrack visual={tmcVisual} />
        <ThinLaneTrack visual={gprVisual} />
        {active ? <RowTooltip row={row} variant={variant} reportDate={reportDate} /> : null}
      </div>
    </div>
  );
}

export function TmcGprProvisionGanttChart({
  rows,
  reportDate,
  variant,
}: {
  rows: GprTmcWorkLifecycleRow[];
  reportDate: Date;
  variant: TmcProvisionGanttVariant;
}) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const columns = useMemo(() => gridTemplateColumns(), []);
  const todayMs = useMemo(() => reportDateNoonMs(reportDate), [reportDate]);

  const domain = useMemo(() => buildDomain(rows, variant, todayMs), [rows, variant, todayMs]);
  const monthTicks = useMemo(
    () => (domain ? buildMonthTicks(domain.min, domain.max) : []),
    [domain],
  );
  const todayPct = domain ? toPct(domain.todayMs, domain.min, domain.max) : null;

  if (!domain || rows.length === 0) {
    return (
      <div className="flex h-[120px] items-center justify-center text-sm text-slate-500">
        Нет данных для графика
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col" data-tmc-provision-gantt={variant}>
      <div className="grid w-full min-w-0" style={{ gridTemplateColumns: columns }}>
        <div
          className="flex items-end border-b border-r border-slate-600/35 px-2 pb-1"
          style={{
            height: PLAN_FACT_GPR_CHART_X_AXIS_HEIGHT_PX,
            borderBottomColor: PLAN_FACT_GPR_CHART_ROW_DIVIDER_COLOR,
          }}
        >
          <span className="text-[10px] leading-none text-slate-500">ID / Наименование ТМЦ</span>
        </div>
        <div
          className="relative w-full min-w-0 border-b border-slate-600/35"
          style={{
            height: PLAN_FACT_GPR_CHART_X_AXIS_HEIGHT_PX,
            borderBottomColor: PLAN_FACT_GPR_CHART_ROW_DIVIDER_COLOR,
          }}
        >
          {monthTicks.map((tick) => {
            const nextMs = addMonthsMs(tick.ms, 1);
            const mid = tick.ms + (Math.min(nextMs, domain.max) - tick.ms) / 2;
            return (
              <span
                key={tick.ms}
                className="absolute bottom-1 -translate-x-1/2 whitespace-nowrap text-[9px] leading-none text-slate-500"
                style={{ left: `${toPct(mid, domain.min, domain.max)}%` }}
              >
                {tick.label}
              </span>
            );
          })}
          {todayPct != null ? (
            <span
              className="pointer-events-none absolute top-1 -translate-x-1/2 whitespace-nowrap text-[8px] font-medium leading-none text-slate-400"
              style={{ left: `${todayPct}%` }}
            >
              Сегодня
            </span>
          ) : null}
        </div>
      </div>

      <div
        className="relative w-full min-w-0 rounded-lg border border-slate-600/25 bg-slate-900/35"
        style={{ minHeight: Math.max(rows.length * ROW_HEIGHT_PX, 80) }}
      >
        <div
          className="pointer-events-none absolute inset-0 z-0 grid"
          style={{ gridTemplateColumns: columns }}
          aria-hidden
        >
          <div className="border-r border-slate-600/35" />
          <div className="relative w-full min-w-0">
            {monthTicks.map((tick) => (
              <div
                key={`g-${tick.ms}`}
                className="absolute bottom-0 top-0 w-px"
                style={{
                  left: `${toPct(tick.ms, domain.min, domain.max)}%`,
                  backgroundColor: COLORS.grid,
                }}
              />
            ))}
            <div className="absolute bottom-0 top-0 w-px" style={{ right: 0, backgroundColor: COLORS.grid }} />
            {todayPct != null ? (
              <div
                className="absolute bottom-0 top-0 z-[1] border-l border-dashed"
                style={{ left: `${todayPct}%`, borderColor: COLORS.today }}
              />
            ) : null}
          </div>
        </div>

        {rows.map((row) => (
          <ProvisionRow
            key={row.rowKey}
            row={row}
            variant={variant}
            reportDate={reportDate}
            domainMin={domain.min}
            domainMax={domain.max}
            columns={columns}
            hoverKey={hoverKey}
            onHover={setHoverKey}
          />
        ))}
      </div>
    </div>
  );
}

export function TmcGprProvisionGanttLegend({ variant }: { variant: TmcProvisionGanttVariant }) {
  if (variant === "contract") {
    return (
      <AnalyticsLegendList>
        <AnalyticsLegendItem markerColor={COLORS.contractPlan} label="План договора" />
        <AnalyticsLegendItem markerColor={COLORS.contractOnTime} label="Факт договора" />
        <AnalyticsLegendItem markerColor={COLORS.gprPlan} label="План ГПР" />
        <AnalyticsLegendItem markerColor={COLORS.gprFact} label="Факт ГПР" />
        <AnalyticsLegendItem markerColor={COLORS.tmcOverdue} label="Просрочка" />
        <AnalyticsLegendItem markerColor={COLORS.today} label="Сегодня" />
      </AnalyticsLegendList>
    );
  }

  return (
    <AnalyticsLegendList>
      <AnalyticsLegendItem markerColor={COLORS.deadline} label="Крайний срок заявки" />
      <AnalyticsLegendItem markerColor={COLORS.tmcOnTime} label="Факт заявки" />
      <AnalyticsLegendItem markerColor={COLORS.gprPlan} label="План ГПР" />
      <AnalyticsLegendItem markerColor={COLORS.gprFact} label="Факт ГПР" />
      <AnalyticsLegendItem markerColor={COLORS.tmcOverdue} label="Просрочка" />
      <AnalyticsLegendItem markerColor={COLORS.today} label="Сегодня" />
    </AnalyticsLegendList>
  );
}
