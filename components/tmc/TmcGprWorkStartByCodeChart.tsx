"use client";

import { useMemo, useState } from "react";
import {
  AnalyticsLegendItem,
  AnalyticsLegendList,
} from "@/components/construction/AnalyticsLegendItem";
import {
  PLAN_FACT_GPR_CHART_LABELS_COLUMN_MAX_PX,
  PLAN_FACT_GPR_CHART_ROW_DIVIDER_COLOR,
  PLAN_FACT_GPR_CHART_X_AXIS_HEIGHT_PX,
} from "@/lib/planFactWorkTypeTimeline";
import {
  classifyContractProvisionStatus,
  classifyRequestProvisionStatus,
  formatTmcIsoRu,
  type GprTmcWorkLifecycleRow,
  type TmcContractProvisionStatus,
  type TmcRequestProvisionStatus,
} from "@/lib/tmcProcurementAnalytics";

/** Режим TMC-линии: заявки, договоры или оба (legacy). */
export type TmcSupplyChartMode = "request" | "contract" | "full";

const ROW_HEIGHT_PX = 88;
const LANE_HEIGHT_PX = 26;
const MARKER_SIZE_PX = 12;
const DAY_MS = 1000 * 60 * 60 * 24;
const LABELS_COLUMN_PX = PLAN_FACT_GPR_CHART_LABELS_COLUMN_MAX_PX;
const DOMAIN_PAD_MONTHS = 1;
const X_AXIS_HEIGHT_PX = Math.max(PLAN_FACT_GPR_CHART_X_AXIS_HEIGHT_PX, 40);

const RU_MONTH_SHORT = [
  "Янв",
  "Фев",
  "Мар",
  "Апр",
  "Май",
  "Июн",
  "Июл",
  "Авг",
  "Сен",
  "Окт",
  "Ноя",
  "Дек",
] as const;

const COLORS = {
  plan: "rgba(148, 163, 184, 0.45)",
  planMarker: "#94a3b8",
  factStart: "#22d3ee",
  deadline: "#f59e0b",
  requestOnTime: "#22c55e",
  requestLate: "#ef4444",
  requestMissing: "#ef4444",
  requestPending: "#94a3b8",
  contractPlan: "#a855f7",
  contractOnTime: "#22c55e",
  contractLate: "#f59e0b",
  contractMissing: "#ef4444",
  track: "rgba(148, 163, 184, 0.18)",
  card: "#1e293b",
  grid: "rgba(148,163,184,0.12)",
  today: "rgba(125, 211, 252, 0.45)",
  gprOverdue: "rgba(239, 68, 68, 0.55)",
} as const;

type LaneId = "tmc" | "gpr";

type TimelineEventKind =
  | "deadline"
  | "requestFact"
  | "contractPlan"
  | "contractFact"
  | "planStart"
  | "factStart"
  | "missingSubmit"
  | "missingContract";

type TimelineEvent = {
  kind: TimelineEventKind;
  lane: LaneId;
  ms: number;
  iso: string | null;
  color: string;
  label: string;
};

type HoverState = {
  rowKey: string;
  lane: LaneId | null;
  event: TimelineEvent | null;
};

function gridTemplateColumns(): string {
  return `${LABELS_COLUMN_PX}px minmax(0, 1fr)`;
}

function formatGridMonthFullYear(d: Date): string {
  return `${RU_MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

function toPct(ms: number, domainMin: number, domainMax: number): number {
  const span = Math.max(domainMax - domainMin, DAY_MS);
  return ((ms - domainMin) / span) * 100;
}

function toPctClamped(ms: number, domainMin: number, domainMax: number): number {
  return toPct(Math.min(Math.max(ms, domainMin), domainMax), domainMin, domainMax);
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

function formatReportDateRu(reportDate: Date): string {
  const dd = String(reportDate.getDate()).padStart(2, "0");
  const mm = String(reportDate.getMonth() + 1).padStart(2, "0");
  const yyyy = String(reportDate.getFullYear());
  return `${dd}.${mm}.${yyyy}`;
}

function addCalendarMonthsMs(ms: number, months: number): number {
  const d = new Date(ms);
  return new Date(
    d.getFullYear(),
    d.getMonth() + months,
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds(),
  ).getTime();
}

function startOfMonthMs(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0).getTime();
}

function endOfMonthExclusiveMs(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0).getTime();
}

function buildDataDomain(
  todayMs: number,
  dataValues: number[],
): { min: number; max: number; todayMs: number } | null {
  const all = [...dataValues, todayMs];
  if (all.length === 0) return null;
  const dataMin = Math.min(...all);
  const dataMax = Math.max(...all);
  const paddedMin = addCalendarMonthsMs(dataMin, -DOMAIN_PAD_MONTHS);
  const paddedMax = addCalendarMonthsMs(dataMax, DOMAIN_PAD_MONTHS);
  return {
    min: startOfMonthMs(paddedMin),
    max: endOfMonthExclusiveMs(paddedMax),
    todayMs,
  };
}

function buildMonthGridLines(domainMin: number, domainMax: number): number[] {
  const lines: number[] = [];
  let cursor = domainMin;
  let guard = 0;
  while (cursor < domainMax && guard < 96) {
    lines.push(cursor);
    const d = new Date(cursor);
    cursor = new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0).getTime();
    guard += 1;
  }
  lines.push(domainMax);
  return lines;
}

type MonthAxisLabel = { ms: number; label: string };

/** Каждый календарный месяц — полная подпись «Июл 2025». */
function buildMonthAxisLabels(domainMin: number, domainMax: number): MonthAxisLabel[] {
  const starts: number[] = [];
  let cursor = domainMin;
  let guard = 0;
  while (cursor < domainMax && guard < 96) {
    starts.push(cursor);
    const d = new Date(cursor);
    cursor = new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0).getTime();
    guard += 1;
  }
  const labels: MonthAxisLabel[] = [];
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i]!;
    const next = i + 1 < starts.length ? starts[i + 1]! : domainMax;
    const mid = start + (next - start) / 2;
    labels.push({ ms: mid, label: formatGridMonthFullYear(new Date(start)) });
  }
  return labels;
}

function collectDomainValues(rows: GprTmcWorkLifecycleRow[], mode: TmcSupplyChartMode): number[] {
  const values: number[] = [];
  for (const row of rows) {
    if (mode === "request" || mode === "full") {
      if (row.requestDeadlineMs != null) values.push(row.requestDeadlineMs);
      if (row.requestFactMs != null) values.push(row.requestFactMs);
    }
    if (mode === "contract" || mode === "full") {
      if (row.contractPlanMs != null) values.push(row.contractPlanMs);
      if (row.contractFactMs != null) values.push(row.contractFactMs);
    }
    if (row.planStartMs != null) values.push(row.planStartMs);
    if (row.factStartMs != null) values.push(row.factStartMs);
  }
  return values;
}

function buildRequestTmcLaneEvents(
  row: GprTmcWorkLifecycleRow,
  reqStatus: TmcRequestProvisionStatus,
  todayMs: number,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  if (row.requestDeadlineMs != null && row.requestDeadlineIso) {
    events.push({
      kind: "deadline",
      lane: "tmc",
      ms: row.requestDeadlineMs,
      iso: row.requestDeadlineIso,
      color: COLORS.deadline,
      label: "Крайний срок подачи заявки",
    });
  }
  if (row.requestFactMs != null && row.requestFactIso) {
    events.push({
      kind: "requestFact",
      lane: "tmc",
      ms: row.requestFactMs,
      iso: row.requestFactIso,
      color: reqStatus === "on_time" ? COLORS.requestOnTime : COLORS.requestLate,
      label: "Факт подачи заявки",
    });
  } else if (reqStatus === "missing" && row.requestDeadlineMs != null) {
    events.push({
      kind: "missingSubmit",
      lane: "tmc",
      ms: todayMs,
      iso: null,
      color: COLORS.requestMissing,
      label: "Не подано",
    });
  }
  events.sort((a, b) => a.ms - b.ms || a.kind.localeCompare(b.kind));
  return events;
}

function buildContractTmcLaneEvents(
  row: GprTmcWorkLifecycleRow,
  conStatus: TmcContractProvisionStatus,
  todayMs: number,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  if (row.contractPlanMs != null && row.contractPlanIso) {
    const sameDate =
      row.contractFactIso &&
      row.contractPlanIso.slice(0, 10) === row.contractFactIso.slice(0, 10);
    if (!sameDate || !row.contractFactIso) {
      events.push({
        kind: "contractPlan",
        lane: "tmc",
        ms: row.contractPlanMs,
        iso: row.contractPlanIso,
        color: COLORS.contractPlan,
        label: "Плановая дата договора",
      });
    }
  }
  if (row.contractFactMs != null && row.contractFactIso) {
    events.push({
      kind: "contractFact",
      lane: "tmc",
      ms: row.contractFactMs,
      iso: row.contractFactIso,
      color: conStatus === "on_time" ? COLORS.contractOnTime : COLORS.contractLate,
      label: "Фактическая дата договора",
    });
  } else if (conStatus === "missing" && row.contractPlanMs != null) {
    events.push({
      kind: "missingContract",
      lane: "tmc",
      ms: todayMs,
      iso: null,
      color: COLORS.contractMissing,
      label: "Не заключён",
    });
  }
  events.sort((a, b) => a.ms - b.ms || a.kind.localeCompare(b.kind));
  return events;
}

function buildFullTmcLaneEvents(
  row: GprTmcWorkLifecycleRow,
  reqStatus: TmcRequestProvisionStatus,
  conStatus: TmcContractProvisionStatus,
  todayMs: number,
): TimelineEvent[] {
  return [
    ...buildRequestTmcLaneEvents(row, reqStatus, todayMs),
    ...buildContractTmcLaneEvents(row, conStatus, todayMs),
  ].sort((a, b) => a.ms - b.ms || a.kind.localeCompare(b.kind));
}

function buildGprLaneEvents(row: GprTmcWorkLifecycleRow): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  if (row.planStartMs != null && row.planStartIso) {
    events.push({
      kind: "planStart",
      lane: "gpr",
      ms: row.planStartMs,
      iso: row.planStartIso,
      color: COLORS.planMarker,
      label: "План начала работ",
    });
  }
  if (row.factStartMs != null && row.factStartIso) {
    events.push({
      kind: "factStart",
      lane: "gpr",
      ms: row.factStartMs,
      iso: row.factStartIso,
      color: COLORS.factStart,
      label: "Факт начала работ",
    });
  }
  events.sort((a, b) => a.ms - b.ms || a.kind.localeCompare(b.kind));
  return events;
}

function FullTmcLaneSegments({
  row,
  events,
  domainMin,
  domainMax,
  reqStatus,
  conStatus,
  todayMs,
}: {
  row: GprTmcWorkLifecycleRow;
  events: TimelineEvent[];
  domainMin: number;
  domainMax: number;
  reqStatus: TmcRequestProvisionStatus;
  conStatus: TmcContractProvisionStatus;
  todayMs: number;
}) {
  return (
    <>
      <RequestTmcLaneSegments
        row={row}
        events={events}
        domainMin={domainMin}
        domainMax={domainMax}
        reqStatus={reqStatus}
        todayMs={todayMs}
      />
      <ContractTmcLaneSegments
        row={row}
        events={events}
        domainMin={domainMin}
        domainMax={domainMax}
        conStatus={conStatus}
        todayMs={todayMs}
      />
    </>
  );
}

function TmcLaneTooltip({
  row,
  reqLabel,
  conLabel,
  mode,
  event,
}: {
  row: GprTmcWorkLifecycleRow;
  reqLabel: string;
  conLabel: string;
  mode: TmcSupplyChartMode;
  event: TimelineEvent | null;
}) {
  return (
    <div
      className="pointer-events-none absolute left-[min(100%,12rem)] top-full z-30 mt-1 w-[260px] rounded-lg border px-3 py-2 text-xs shadow-lg"
      style={{
        background: COLORS.card,
        borderColor: "rgba(148,163,184,0.35)",
        color: "#e2e8f0",
      }}
    >
      <div className="font-semibold tabular-nums text-slate-100">{row.code}</div>
      <div className="mt-0.5 text-slate-400">{row.tmcNames || "—"}</div>
      {mode === "request" || mode === "full" ? (
        <div className="mt-2 space-y-0.5 border-t border-slate-600/50 pt-2 tabular-nums text-slate-300">
          <div>
            Крайний срок:{" "}
            <span className="text-white">{formatTmcIsoRu(row.requestDeadlineIso)}</span>
          </div>
          <div>
            Факт подачи:{" "}
            <span className="text-white">
              {row.requestFactIso ? formatTmcIsoRu(row.requestFactIso) : "—"}
            </span>
          </div>
          <div>
            Статус: <span className="font-semibold text-white">{reqLabel}</span>
          </div>
        </div>
      ) : null}
      {mode === "contract" || mode === "full" ? (
        <div className="mt-2 space-y-0.5 border-t border-slate-600/50 pt-2 tabular-nums text-slate-300">
          <div>
            План договора:{" "}
            <span className="text-white">{formatTmcIsoRu(row.contractPlanIso)}</span>
          </div>
          <div>
            Факт договора:{" "}
            <span className="text-white">
              {row.contractFactIso ? formatTmcIsoRu(row.contractFactIso) : "—"}
            </span>
          </div>
          <div>
            Статус: <span className="font-semibold text-white">{conLabel}</span>
          </div>
        </div>
      ) : null}
      {event && !event.iso ? (
        <div className="mt-1 text-rose-300">{event.label}</div>
      ) : null}
    </div>
  );
}

function GprLaneTooltip({ row }: { row: GprTmcWorkLifecycleRow }) {
  return (
    <div
      className="pointer-events-none absolute left-[min(100%,12rem)] top-full z-30 mt-1 w-[260px] rounded-lg border px-3 py-2 text-xs shadow-lg"
      style={{
        background: COLORS.card,
        borderColor: "rgba(148,163,184,0.35)",
        color: "#e2e8f0",
      }}
    >
      <div className="font-semibold tabular-nums text-slate-100">{row.code}</div>
      <div className="mt-0.5 text-slate-400">{row.workName || "—"}</div>
      <div className="mt-2 space-y-0.5 border-t border-slate-600/50 pt-2 tabular-nums text-slate-300">
        <div>
          План начала:{" "}
          <span className="text-white">{formatTmcIsoRu(row.planStartIso)}</span>
        </div>
        <div>
          Факт начала:{" "}
          <span className="text-white">{formatTmcIsoRu(row.factStartIso)}</span>
        </div>
      </div>
    </div>
  );
}

function RequestTmcLaneSegments({
  row,
  events,
  domainMin,
  domainMax,
  reqStatus,
  todayMs,
}: {
  row: GprTmcWorkLifecycleRow;
  events: TimelineEvent[];
  domainMin: number;
  domainMax: number;
  reqStatus: TmcRequestProvisionStatus;
  todayMs: number;
}) {
  const pct = (ms: number) => toPctClamped(ms, domainMin, domainMax);
  const spanLeft = events.length ? pct(events[0]!.ms) : 0;
  const spanRight = events.length ? pct(events[events.length - 1]!.ms) : 0;

  const orderBar =
    row.requestDeadlineMs != null && row.requestFactMs != null
      ? {
          left: Math.min(pct(row.requestDeadlineMs), pct(row.requestFactMs)),
          right: Math.max(pct(row.requestDeadlineMs), pct(row.requestFactMs)),
          color: reqStatus === "on_time" ? COLORS.requestOnTime : COLORS.requestLate,
        }
      : null;

  const missingBar =
    reqStatus === "missing" && row.requestDeadlineMs != null
      ? {
          left: Math.min(pct(row.requestDeadlineMs), pct(todayMs)),
          right: Math.max(pct(row.requestDeadlineMs), pct(todayMs)),
        }
      : null;

  const pendingBar =
    reqStatus === "pending" && row.requestDeadlineMs != null
      ? {
          left: Math.max(pct(row.requestDeadlineMs) - 2.5, 0),
          right: pct(row.requestDeadlineMs),
        }
      : null;

  return (
    <>
      {events.length > 0 ? (
        <div
          className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-sm"
          style={{
            left: `${spanLeft}%`,
            width: `${Math.max(spanRight - spanLeft, 0.35)}%`,
            backgroundColor: COLORS.track,
          }}
        />
      ) : null}
      {orderBar && orderBar.right > orderBar.left ? (
        <div
          className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-sm"
          style={{
            left: `${orderBar.left}%`,
            width: `${orderBar.right - orderBar.left}%`,
            backgroundColor: orderBar.color,
            opacity: 0.88,
          }}
        />
      ) : null}
      {missingBar && missingBar.right > missingBar.left ? (
        <div
          className="absolute top-1/2 h-2 -translate-y-1/2 rounded-sm"
          style={{
            left: `${missingBar.left}%`,
            width: `${missingBar.right - missingBar.left}%`,
            backgroundColor: COLORS.gprOverdue,
          }}
        />
      ) : null}
      {pendingBar && pendingBar.right > pendingBar.left ? (
        <div
          className="absolute top-1/2 h-2 -translate-y-1/2 rounded-sm"
          style={{
            left: `${pendingBar.left}%`,
            width: `${pendingBar.right - pendingBar.left}%`,
            backgroundColor: "rgba(148, 163, 184, 0.35)",
          }}
        />
      ) : null}
    </>
  );
}

function ContractTmcLaneSegments({
  row,
  events,
  domainMin,
  domainMax,
  conStatus,
  todayMs,
}: {
  row: GprTmcWorkLifecycleRow;
  events: TimelineEvent[];
  domainMin: number;
  domainMax: number;
  conStatus: TmcContractProvisionStatus;
  todayMs: number;
}) {
  const pct = (ms: number) => toPctClamped(ms, domainMin, domainMax);
  const spanLeft = events.length ? pct(events[0]!.ms) : 0;
  const spanRight = events.length ? pct(events[events.length - 1]!.ms) : 0;

  const contractBar =
    row.contractPlanMs != null && row.contractFactMs != null
      ? {
          left: Math.min(pct(row.contractPlanMs), pct(row.contractFactMs)),
          right: Math.max(pct(row.contractPlanMs), pct(row.contractFactMs)),
          color: conStatus === "on_time" ? COLORS.contractOnTime : COLORS.contractLate,
        }
      : null;

  const missingBar =
    conStatus === "missing" && row.contractPlanMs != null
      ? {
          left: Math.min(pct(row.contractPlanMs), pct(todayMs)),
          right: Math.max(pct(row.contractPlanMs), pct(todayMs)),
        }
      : null;

  const pendingBar =
    conStatus === "pending" && row.contractPlanMs != null
      ? {
          left: Math.max(pct(row.contractPlanMs) - 2.5, 0),
          right: pct(row.contractPlanMs),
        }
      : null;

  return (
    <>
      {events.length > 0 ? (
        <div
          className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-sm"
          style={{
            left: `${spanLeft}%`,
            width: `${Math.max(spanRight - spanLeft, 0.35)}%`,
            backgroundColor: COLORS.track,
          }}
        />
      ) : null}
      {contractBar && contractBar.right > contractBar.left ? (
        <div
          className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-sm"
          style={{
            left: `${contractBar.left}%`,
            width: `${contractBar.right - contractBar.left}%`,
            backgroundColor: contractBar.color,
            opacity: 0.88,
          }}
        />
      ) : null}
      {missingBar && missingBar.right > missingBar.left ? (
        <div
          className="absolute top-1/2 h-2 -translate-y-1/2 rounded-sm"
          style={{
            left: `${missingBar.left}%`,
            width: `${missingBar.right - missingBar.left}%`,
            backgroundColor: COLORS.gprOverdue,
          }}
        />
      ) : null}
      {pendingBar && pendingBar.right > pendingBar.left ? (
        <div
          className="absolute top-1/2 h-2 -translate-y-1/2 rounded-sm"
          style={{
            left: `${pendingBar.left}%`,
            width: `${pendingBar.right - pendingBar.left}%`,
            backgroundColor: "rgba(148, 163, 184, 0.35)",
          }}
        />
      ) : null}
    </>
  );
}

function GprLaneSegments({
  row,
  events,
  domainMin,
  domainMax,
  todayMs,
}: {
  row: GprTmcWorkLifecycleRow;
  events: TimelineEvent[];
  domainMin: number;
  domainMax: number;
  todayMs: number;
}) {
  const pct = (ms: number) => toPctClamped(ms, domainMin, domainMax);
  const spanLeft = events.length ? pct(events[0]!.ms) : 0;
  const spanRight = events.length ? pct(events[events.length - 1]!.ms) : 0;

  const startFactBar =
    row.planStartMs != null && row.factStartMs != null
      ? {
          left: Math.min(pct(row.planStartMs), pct(row.factStartMs)),
          right: Math.max(pct(row.planStartMs), pct(row.factStartMs)),
        }
      : null;

  const overdueBar =
    !row.factStartMs && row.planStartMs != null && row.planStartMs < todayMs
      ? {
          left: Math.min(pct(row.planStartMs), pct(todayMs)),
          right: Math.max(pct(row.planStartMs), pct(todayMs)),
        }
      : null;

  return (
    <>
      {events.length > 0 ? (
        <div
          className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-sm"
          style={{
            left: `${spanLeft}%`,
            width: `${Math.max(spanRight - spanLeft, 0.35)}%`,
            backgroundColor: COLORS.track,
          }}
        />
      ) : null}
      {startFactBar && startFactBar.right > startFactBar.left ? (
        <div
          className="absolute top-1/2 h-2 -translate-y-1/2 rounded-sm"
          style={{
            left: `${startFactBar.left}%`,
            width: `${startFactBar.right - startFactBar.left}%`,
            backgroundColor: COLORS.factStart,
            opacity: 0.85,
          }}
        />
      ) : null}
      {overdueBar && overdueBar.right > overdueBar.left ? (
        <div
          className="absolute top-1/2 h-2 -translate-y-1/2 rounded-sm"
          style={{
            left: `${overdueBar.left}%`,
            width: `${overdueBar.right - overdueBar.left}%`,
            backgroundColor: COLORS.gprOverdue,
          }}
        />
      ) : null}
      {!row.factStartMs && row.planStartMs != null && !overdueBar ? (
        <div
          className="absolute top-1/2 h-2 -translate-y-1/2 rounded-sm"
          style={{
            left: `${Math.max(pct(row.planStartMs) - 1, 0)}%`,
            width: "2%",
            backgroundColor: COLORS.plan,
          }}
        />
      ) : null}
    </>
  );
}

function LaneMarkers({
  events,
  domainMin,
  domainMax,
  rowKey,
  lane,
  onHover,
}: {
  events: TimelineEvent[];
  domainMin: number;
  domainMax: number;
  rowKey: string;
  lane: LaneId;
  onHover: (next: HoverState | null) => void;
}) {
  return (
    <>
      {events.map((ev) => (
        <button
          key={`${ev.lane}-${ev.kind}-${ev.ms}`}
          type="button"
          className={`absolute top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 border-2 border-slate-950 shadow-sm outline-none ${
            ev.kind === "missingSubmit" || ev.kind === "missingContract"
              ? "rotate-45 rounded-sm"
              : ev.kind === "contractPlan" || ev.kind === "planStart"
                ? "rotate-45 rounded-sm"
                : "rounded-full"
          }`}
          style={{
            left: `${toPctClamped(ev.ms, domainMin, domainMax)}%`,
            backgroundColor: ev.color,
            width: MARKER_SIZE_PX,
            height: MARKER_SIZE_PX,
          }}
          aria-label={
            ev.iso ? `${ev.label}: ${formatTmcIsoRu(ev.iso)}` : ev.label
          }
          onMouseEnter={() => onHover({ rowKey, lane, event: ev })}
          onFocus={() => onHover({ rowKey, lane, event: ev })}
        />
      ))}
    </>
  );
}

function TimelineRow({
  row,
  domainMin,
  domainMax,
  todayMs,
  columns,
  hover,
  onHover,
  mode,
  reportDate,
}: {
  row: GprTmcWorkLifecycleRow;
  domainMin: number;
  domainMax: number;
  todayMs: number;
  columns: string;
  hover: HoverState | null;
  onHover: (next: HoverState | null) => void;
  mode: TmcSupplyChartMode;
  reportDate: Date;
}) {
  const req = useMemo(
    () => classifyRequestProvisionStatus(row.requestDeadlineIso, row.requestFactIso, reportDate),
    [row, reportDate],
  );
  const con = useMemo(
    () =>
      classifyContractProvisionStatus(
        row.contractPlanIso,
        row.contractFactIso,
        row.contractDeviationDays,
        reportDate,
      ),
    [row, reportDate],
  );

  const tmcEvents = useMemo(() => {
    if (mode === "request") return buildRequestTmcLaneEvents(row, req.status, todayMs);
    if (mode === "contract") return buildContractTmcLaneEvents(row, con.status, todayMs);
    return buildFullTmcLaneEvents(row, req.status, con.status, todayMs);
  }, [row, req.status, con.status, todayMs, mode]);

  const gprEvents = useMemo(() => buildGprLaneEvents(row), [row]);
  const active = hover?.rowKey === row.rowKey;

  return (
    <div
      className="relative z-[1] grid"
      style={{
        gridTemplateColumns: columns,
        height: ROW_HEIGHT_PX,
        borderBottom: `1px solid ${PLAN_FACT_GPR_CHART_ROW_DIVIDER_COLOR}`,
      }}
      onMouseLeave={() => onHover(null)}
    >
      <div
        className="flex items-center overflow-hidden border-r border-slate-600/35 pr-2 text-[11px] leading-snug text-slate-300"
        title={[row.code, row.tmcNames].filter(Boolean).join(" · ")}
      >
        <div className="min-w-0 w-full">
          <div className="truncate font-mono tabular-nums text-slate-200">{row.code}</div>
          <div className="mt-0.5 line-clamp-2 break-words text-[10px] text-slate-400">
            {row.tmcNames || "—"}
          </div>
        </div>
      </div>

      <div className="relative min-w-0">
        <div className="flex h-full min-w-0 flex-col justify-center gap-1 py-1">
          <div
            className="relative min-w-0 pl-7"
            style={{ height: LANE_HEIGHT_PX }}
            onMouseEnter={() => onHover({ rowKey: row.rowKey, lane: "tmc", event: null })}
          >
            <span className="pointer-events-none absolute left-0 top-1/2 z-[3] -translate-y-1/2 text-[9px] font-semibold uppercase tracking-wide text-amber-200/85">
              ТМЦ
            </span>
            <div className="relative h-full w-full min-w-0">
              {mode === "contract" ? (
                <ContractTmcLaneSegments
                  row={row}
                  events={tmcEvents}
                  domainMin={domainMin}
                  domainMax={domainMax}
                  conStatus={con.status}
                  todayMs={todayMs}
                />
              ) : mode === "full" ? (
                <FullTmcLaneSegments
                  row={row}
                  events={tmcEvents}
                  domainMin={domainMin}
                  domainMax={domainMax}
                  reqStatus={req.status}
                  conStatus={con.status}
                  todayMs={todayMs}
                />
              ) : (
                <RequestTmcLaneSegments
                  row={row}
                  events={tmcEvents}
                  domainMin={domainMin}
                  domainMax={domainMax}
                  reqStatus={req.status}
                  todayMs={todayMs}
                />
              )}
              <LaneMarkers
                events={tmcEvents}
                domainMin={domainMin}
                domainMax={domainMax}
                rowKey={row.rowKey}
                lane="tmc"
                onHover={onHover}
              />
            </div>
          </div>

          <div
            className="relative min-w-0 pl-7"
            style={{ height: LANE_HEIGHT_PX }}
            onMouseEnter={() => onHover({ rowKey: row.rowKey, lane: "gpr", event: null })}
          >
            <span className="pointer-events-none absolute left-0 top-1/2 z-[3] -translate-y-1/2 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
              ГПР
            </span>
            <div className="relative h-full w-full min-w-0">
              <GprLaneSegments
                row={row}
                events={gprEvents}
                domainMin={domainMin}
                domainMax={domainMax}
                todayMs={todayMs}
              />
              <LaneMarkers
                events={gprEvents}
                domainMin={domainMin}
                domainMax={domainMax}
                rowKey={row.rowKey}
                lane="gpr"
                onHover={onHover}
              />
            </div>
          </div>
        </div>
        {active && hover?.lane === "tmc" ? (
          <TmcLaneTooltip
            row={row}
            reqLabel={req.label}
            conLabel={con.label}
            mode={mode}
            event={hover.event}
          />
        ) : null}
        {active && hover?.lane === "gpr" ? <GprLaneTooltip row={row} /> : null}
      </div>
    </div>
  );
}

export function TmcGprWorkStartByCodeChart({
  rows,
  reportDate,
  mode = "full",
}: {
  rows: GprTmcWorkLifecycleRow[];
  reportDate: Date;
  mode?: TmcSupplyChartMode;
}) {
  const [hover, setHover] = useState<HoverState | null>(null);
  const columns = useMemo(() => gridTemplateColumns(), []);
  const todayMs = useMemo(() => reportDateNoonMs(reportDate), [reportDate]);
  const todayLabel = useMemo(() => formatReportDateRu(reportDate), [reportDate]);

  const domain = useMemo(() => {
    const values = collectDomainValues(rows, mode);
    if (values.length === 0) return null;
    return buildDataDomain(todayMs, values);
  }, [rows, todayMs, mode]);

  const monthGridLines = useMemo(
    () => (domain ? buildMonthGridLines(domain.min, domain.max) : []),
    [domain],
  );

  const monthLabels = useMemo(
    () => (domain ? buildMonthAxisLabels(domain.min, domain.max) : []),
    [domain],
  );

  const todayPct = domain ? toPctClamped(todayMs, domain.min, domain.max) : 0;

  if (!domain || rows.length === 0) {
    return (
      <div className="flex h-[160px] items-center justify-center text-sm text-slate-500">
        Нет данных для таймлайна ТМЦ → ГПР
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col" data-tmc-supply-chart={mode}>
      <div className="grid w-full min-w-0" style={{ gridTemplateColumns: columns }}>
        <div
          className="flex items-end border-b border-r border-slate-600/35 px-2 pb-1"
          style={{
            height: X_AXIS_HEIGHT_PX,
            borderBottomColor: PLAN_FACT_GPR_CHART_ROW_DIVIDER_COLOR,
          }}
        >
          <span className="text-[10px] leading-none text-slate-500">ID / Наименование ТМЦ</span>
        </div>
        <div
          className="relative w-full min-w-0 overflow-hidden border-b border-slate-600/35"
          style={{
            height: X_AXIS_HEIGHT_PX,
            borderBottomColor: PLAN_FACT_GPR_CHART_ROW_DIVIDER_COLOR,
          }}
        >
          {monthLabels.map((tick) => (
            <span
              key={`label-${tick.ms}`}
              className="absolute bottom-1 -translate-x-1/2 whitespace-nowrap text-[9px] leading-none text-slate-400"
              style={{ left: `${toPct(tick.ms, domain.min, domain.max)}%` }}
            >
              {tick.label}
            </span>
          ))}
          <div
            className="pointer-events-none absolute bottom-0 top-0 z-[1] w-px"
            style={{ left: `${todayPct}%`, backgroundColor: COLORS.today }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute top-0 z-[2] -translate-x-1/2 text-center"
            style={{ left: `${todayPct}%` }}
          >
            <div className="text-[8px] font-semibold uppercase tracking-wide text-sky-300/80">
              Сегодня
            </div>
            <div className="text-[8px] tabular-nums text-sky-200/70">{todayLabel}</div>
          </div>
        </div>
      </div>

      <div
        className="relative w-full min-w-0 rounded-lg border border-slate-600/30 bg-slate-900/40"
        style={{ minHeight: Math.max(rows.length * ROW_HEIGHT_PX, 120) }}
      >
        <div
          className="pointer-events-none absolute inset-0 z-0 grid"
          style={{ gridTemplateColumns: columns }}
          aria-hidden
        >
          <div className="border-r border-slate-600/35" />
          <div className="relative w-full min-w-0">
            {monthGridLines.map((ms, index) => {
              const atEnd = index === monthGridLines.length - 1;
              const leftPct = toPct(ms, domain.min, domain.max);
              return (
                <div
                  key={`grid-${ms}`}
                  className="absolute bottom-0 top-0 w-px"
                  style={{
                    left: atEnd ? undefined : `${leftPct}%`,
                    right: atEnd ? 0 : undefined,
                    backgroundColor: COLORS.grid,
                  }}
                />
              );
            })}
            <div
              className="absolute bottom-0 top-0 z-[1] w-px"
              style={{ left: `${todayPct}%`, backgroundColor: COLORS.today }}
            />
          </div>
        </div>

        {rows.map((row) => (
          <TimelineRow
            key={row.rowKey}
            row={row}
            domainMin={domain.min}
            domainMax={domain.max}
            todayMs={todayMs}
            columns={columns}
            hover={hover}
            onHover={setHover}
            mode={mode}
            reportDate={reportDate}
          />
        ))}
      </div>
    </div>
  );
}

export function TmcGprWorkStartByCodeLegend({ mode = "full" }: { mode?: TmcSupplyChartMode }) {
  if (mode === "request") {
    return (
      <div className="space-y-2">
        <AnalyticsLegendList>
          <span className="mr-2 text-[10px] font-semibold uppercase tracking-wide text-amber-200/80">
            ТМЦ
          </span>
          <AnalyticsLegendItem markerColor={COLORS.deadline} label="Крайний срок заявки" />
          <AnalyticsLegendItem markerColor={COLORS.requestOnTime} label="Факт подачи (в срок)" />
          <AnalyticsLegendItem markerColor={COLORS.requestLate} label="Факт подачи (с опозданием)" />
        </AnalyticsLegendList>
        <AnalyticsLegendList>
          <span className="mr-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            ГПР
          </span>
          <AnalyticsLegendItem markerColor={COLORS.plan} label="План начала работы" />
          <AnalyticsLegendItem markerColor={COLORS.factStart} label="Факт начала работы" />
          <AnalyticsLegendItem markerColor={COLORS.today} label="Сегодня" />
        </AnalyticsLegendList>
      </div>
    );
  }

  if (mode === "contract") {
    return (
      <div className="space-y-2">
        <AnalyticsLegendList>
          <span className="mr-2 text-[10px] font-semibold uppercase tracking-wide text-amber-200/80">
            ТМЦ
          </span>
          <AnalyticsLegendItem markerColor={COLORS.contractPlan} label="Плановая дата договора" />
          <AnalyticsLegendItem markerColor={COLORS.contractOnTime} label="Факт договора (в срок)" />
          <AnalyticsLegendItem markerColor={COLORS.contractLate} label="Факт договора (с опозданием)" />
        </AnalyticsLegendList>
        <AnalyticsLegendList>
          <span className="mr-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            ГПР
          </span>
          <AnalyticsLegendItem markerColor={COLORS.plan} label="План начала работы" />
          <AnalyticsLegendItem markerColor={COLORS.factStart} label="Факт начала работы" />
          <AnalyticsLegendItem markerColor={COLORS.today} label="Сегодня" />
        </AnalyticsLegendList>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <AnalyticsLegendList>
        <span className="mr-2 text-[10px] font-semibold uppercase tracking-wide text-amber-200/80">
          ТМЦ
        </span>
        <AnalyticsLegendItem markerColor={COLORS.deadline} label="Крайний срок заказа" />
        <AnalyticsLegendItem markerColor={COLORS.requestOnTime} label="Факт подачи заказа" />
        <AnalyticsLegendItem markerColor={COLORS.contractPlan} label="План договора" />
        <AnalyticsLegendItem markerColor={COLORS.contractOnTime} label="Факт договора" />
      </AnalyticsLegendList>
      <AnalyticsLegendList>
        <span className="mr-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          ГПР
        </span>
        <AnalyticsLegendItem markerColor={COLORS.planMarker} label="План начала работы" />
        <AnalyticsLegendItem markerColor={COLORS.factStart} label="Факт начала работы" />
      </AnalyticsLegendList>
    </div>
  );
}
