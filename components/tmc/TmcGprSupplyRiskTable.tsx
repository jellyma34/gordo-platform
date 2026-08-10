"use client";

import { useMemo, useState } from "react";
import {
  formatDaysBufferLabel,
  formatTmcIsoRu,
  supplyRiskLevelTooltipLabel,
  type TmcGprSupplyRiskLevel,
  type TmcGprSupplyRiskRow,
} from "@/lib/tmcProcurementAnalytics";

const COL_GPR_PX = 128;
const COL_MATERIAL_PX = 140;
const COL_RESULT_PX = 108;
const ROW_HEIGHT_PX = 48;
const BAR_H_PX = 5;
const MARKER_PX = 8;
const DAY_MS = 86400000;
const DEFAULT_TOP_N = 10;

const COLORS = {
  deadline: "#f59e0b",
  factOk: "#22c55e",
  factBad: "#ef4444",
  planGpr: "#6366f1",
  track: "rgba(148, 163, 184, 0.2)",
  fillOk: "rgba(34, 197, 94, 0.55)",
  fillBad: "rgba(239, 68, 68, 0.65)",
  fillWait: "rgba(148, 163, 184, 0.35)",
  today: "rgba(163, 179, 199, 0.45)",
  card: "#1e293b",
} as const;

function gridColumns(): string {
  return `${COL_GPR_PX}px ${COL_MATERIAL_PX}px minmax(0, 1fr) ${COL_RESULT_PX}px`;
}

function reportDateNoonMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0).getTime();
}

function truncateMaterial(name: string, max = 36): string {
  const t = name.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function rowPct(ms: number, min: number, max: number): number {
  const span = Math.max(max - min, DAY_MS);
  return Math.max(0, Math.min(100, ((ms - min) / span) * 100));
}

function rowDomain(row: TmcGprSupplyRiskRow, todayMs: number): { min: number; max: number } | null {
  const plan = row.planGprStartMs;
  if (plan == null) return null;
  const deadline = row.deadlineRequestMs ?? plan - 45 * DAY_MS;
  // Масштаб строки: контрольный срок → начало ГПР (с padding для маркеров)
  let min = deadline;
  let max = plan;
  if (max <= min) {
    min -= 7 * DAY_MS;
    max += 7 * DAY_MS;
  }
  // Расширяем влево, если «сегодня» или факт раньше дедлайна
  min = Math.min(min, todayMs, row.factSupplyMs ?? todayMs);
  return { min, max };
}

function riskEmoji(level: TmcGprSupplyRiskLevel): string {
  if (level === "disruption") return "🔴";
  if (level === "risk") return "🟠";
  if (level === "secured") return "🟢";
  return "⚪";
}

function resultTone(level: TmcGprSupplyRiskLevel): string {
  if (level === "disruption") return "text-rose-400";
  if (level === "risk") return "text-amber-400";
  if (level === "secured") return "text-emerald-400";
  return "text-slate-400";
}

function bufferTone(level: TmcGprSupplyRiskLevel, days: number | null): string {
  if (days != null && days < 0) return "text-rose-400";
  if (level === "disruption") return "text-rose-400";
  if (level === "risk") return "text-amber-400";
  if (level === "secured") return "text-emerald-400";
  return "text-slate-400";
}

function SupplyBar({
  row,
  todayMs,
}: {
  row: TmcGprSupplyRiskRow;
  todayMs: number;
}) {
  const domain = useMemo(() => rowDomain(row, todayMs), [row, todayMs]);
  if (!domain) return null;

  const { min, max } = domain;
  const dl = row.deadlineRequestMs;
  const fact = row.factRequestIso ? row.factSupplyMs : null;
  const plan = row.planGprStartMs!;
  const pct = (ms: number) => rowPct(ms, min, max);

  const segments: { left: number; width: number; color: string }[] = [];

  if (dl != null) {
    if (!row.factRequestIso && row.riskLevel !== "waiting") {
      const end = Math.min(todayMs, max);
      if (end > dl) {
        segments.push({
          left: pct(dl),
          width: pct(end) - pct(dl),
          color: COLORS.fillBad,
        });
      }
    } else if (fact != null) {
      const color =
        row.riskLevel === "disruption" || row.riskLevel === "risk"
          ? COLORS.fillBad
          : COLORS.fillOk;
      segments.push({ left: pct(dl), width: pct(fact) - pct(dl), color });
    } else if (row.riskLevel === "waiting") {
      segments.push({
        left: pct(Math.min(todayMs, dl)),
        width: pct(dl) - pct(Math.min(todayMs, dl)),
        color: COLORS.fillWait,
      });
    }
  }

  const todayInRange = todayMs >= min && todayMs <= max;
  const todayPct = todayInRange ? pct(todayMs) : null;

  return (
    <div className="relative h-[18px] w-full">
      <div
        className="absolute top-1/2 h-[3px] w-full -translate-y-1/2 rounded-full"
        style={{ backgroundColor: COLORS.track }}
      />
      {segments.map((s, i) =>
        s.width > 0.2 ? (
          <div
            key={i}
            className="absolute top-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${s.left}%`,
              width: `${s.width}%`,
              height: BAR_H_PX,
              backgroundColor: s.color,
            }}
          />
        ) : null,
      )}
      {todayPct != null ? (
        <div
          className="absolute bottom-0 top-0 z-[1] border-l border-dashed"
          style={{ left: `${todayPct}%`, borderColor: COLORS.today }}
          aria-hidden
        />
      ) : null}
      {dl != null ? (
        <div
          className="absolute top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-950/80"
          style={{
            left: `${pct(dl)}%`,
            width: MARKER_PX,
            height: MARKER_PX,
            backgroundColor: COLORS.deadline,
          }}
        />
      ) : null}
      {fact != null ? (
        <div
          className="absolute top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-950/80"
          style={{
            left: `${pct(fact)}%`,
            width: MARKER_PX,
            height: MARKER_PX,
            backgroundColor:
              row.riskLevel === "secured" ? COLORS.factOk : COLORS.factBad,
          }}
        />
      ) : null}
      <div
        className="absolute top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] border border-slate-950/80"
        style={{
          left: `${pct(plan)}%`,
          width: MARKER_PX,
          height: MARKER_PX,
          backgroundColor: COLORS.planGpr,
        }}
      />
    </div>
  );
}

function RowTooltip({ row }: { row: TmcGprSupplyRiskRow }) {
  return (
    <div
      className="pointer-events-none absolute left-1 top-full z-40 mt-1 w-[270px] rounded-md border px-2.5 py-2 text-[11px] shadow-lg"
      style={{ background: COLORS.card, borderColor: "rgba(148,163,184,0.3)", color: "#e2e8f0" }}
    >
      <div className="font-semibold text-slate-100">
        {row.gprCode} — {row.gprName}
      </div>
      <div className="mt-1 text-slate-400">ТМЦ: {row.materialName}</div>
      <div className="mt-1.5 space-y-0.5 border-t border-slate-600/40 pt-1.5 tabular-nums">
        <div>
          Крайний срок заявки:{" "}
          <span className="text-white">{formatTmcIsoRu(row.deadlineRequestIso)}</span>
        </div>
        <div>
          Факт заявки:{" "}
          <span className="text-white">
            {row.factRequestIso ? formatTmcIsoRu(row.factRequestIso) : "—"}
          </span>
        </div>
        <div>
          План договора:{" "}
          <span className="text-white">{formatTmcIsoRu(row.contractPlanIso)}</span>
        </div>
        <div>
          Факт договора:{" "}
          <span className="text-white">{formatTmcIsoRu(row.contractFactIso)}</span>
        </div>
        <div>
          План начала ГПР:{" "}
          <span className="text-white">{formatTmcIsoRu(row.planGprStartIso)}</span>
        </div>
        <div>
          Факт начала ГПР:{" "}
          <span className="text-white">{formatTmcIsoRu(row.factGprStartIso)}</span>
        </div>
        <div>
          Расчётный запас:{" "}
          <span className="text-white">{formatDaysBufferLabel(row.daysBuffer)}</span>
        </div>
        <div>
          Вывод:{" "}
          <span className="font-semibold text-white">
            {supplyRiskLevelTooltipLabel(row.riskLevel)}
          </span>
        </div>
        <div className="text-slate-400">{row.riskReason}</div>
      </div>
    </div>
  );
}

function RiskRow({
  row,
  todayMs,
  columns,
  hoverKey,
  onHover,
}: {
  row: TmcGprSupplyRiskRow;
  todayMs: number;
  columns: string;
  hoverKey: string | null;
  onHover: (k: string | null) => void;
}) {
  const active = hoverKey === row.rowKey;

  return (
    <div
      className="relative z-[1] grid border-b border-slate-600/25"
      style={{ gridTemplateColumns: columns, height: ROW_HEIGHT_PX }}
      onMouseEnter={() => onHover(row.rowKey)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="flex items-center overflow-hidden border-r border-slate-600/25 px-2">
        <div className="min-w-0">
          <div className="truncate font-mono text-[11px] font-semibold text-slate-100">
            {row.gprCode}
          </div>
          <div className="truncate text-[10px] text-slate-500">{row.gprName}</div>
        </div>
      </div>

      <div
        className="flex items-center overflow-hidden border-r border-slate-600/25 px-2"
        title={row.materialName}
      >
        <span className="truncate text-[10px] text-slate-300">
          {truncateMaterial(row.materialName)}
        </span>
      </div>

      <div className="relative flex items-center border-r border-slate-600/25 px-2">
        <SupplyBar row={row} todayMs={todayMs} />
        {active ? <RowTooltip row={row} /> : null}
      </div>

      <div className="flex flex-col justify-center px-2 leading-tight">
        <span className={`text-[10px] font-semibold ${resultTone(row.riskLevel)}`}>
          {riskEmoji(row.riskLevel)} {row.riskLabel}
        </span>
        <span
          className={`text-[10px] font-bold tabular-nums ${bufferTone(row.riskLevel, row.daysBuffer)}`}
        >
          {formatDaysBufferLabel(row.daysBuffer)}
        </span>
      </div>
    </div>
  );
}

export function TmcGprSupplyRiskTable({
  rows,
  reportDate,
  showAll,
}: {
  rows: TmcGprSupplyRiskRow[];
  reportDate: Date;
  showAll: boolean;
}) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const columns = useMemo(() => gridColumns(), []);
  const todayMs = useMemo(() => reportDateNoonMs(reportDate), [reportDate]);

  const visibleRows = useMemo(
    () => (showAll ? rows : rows.slice(0, DEFAULT_TOP_N)),
    [rows, showAll],
  );

  if (rows.length === 0) {
    return (
      <div className="flex h-[100px] items-center justify-center text-sm text-slate-500">
        Нет данных — проверьте связь ТМЦ с кодами работ ГПР
      </div>
    );
  }

  return (
    <div className="w-full min-w-0" data-tmc-supply-risk-table>
      <div className="grid w-full min-w-0 border-b border-slate-600/30" style={{ gridTemplateColumns: columns }}>
        <div className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Работа ГПР
        </div>
        <div className="border-l border-slate-600/25 px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Ключевой ТМЦ
        </div>
        <div className="border-l border-slate-600/25 px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Обеспечение до ГПР
        </div>
        <div className="border-l border-slate-600/25 px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Результат
        </div>
      </div>

      <div
        className="relative w-full min-w-0 rounded-lg border border-slate-600/25 bg-slate-900/35"
        style={{ minHeight: Math.max(visibleRows.length * ROW_HEIGHT_PX, 60) }}
      >
        {visibleRows.map((row) => (
          <RiskRow
            key={row.rowKey}
            row={row}
            todayMs={todayMs}
            columns={columns}
            hoverKey={hoverKey}
            onHover={setHoverKey}
          />
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-[9px] text-slate-500">
        <span>● Крайний срок</span>
        <span>● Факт обеспечения</span>
        <span>◆ Начало ГПР</span>
        <span>| Сегодня</span>
      </div>
    </div>
  );
}
