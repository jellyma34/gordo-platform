"use client";

import { useMemo, useState } from "react";
import {
  AnalyticsLegendItem,
  AnalyticsLegendList,
} from "@/components/construction/AnalyticsLegendItem";
import {
  PLAN_FACT_GPR_CHART_LABELS_COLUMN_MAX_PX,
  PLAN_FACT_GPR_CHART_ROW_DIVIDER_COLOR,
} from "@/lib/planFactWorkTypeTimeline";
import { formatTmcIsoRu, type TmcGprRiskRow } from "@/lib/tmcProcurementAnalytics";

const ROW_HEIGHT_PX = 48;
const LABELS_COLUMN_PX = PLAN_FACT_GPR_CHART_LABELS_COLUMN_MAX_PX;
const SCALE_MIN = -180;
const SCALE_MAX = 180;
const RIGHT_COLUMN_PX = 160;

const COLORS = {
  red: "#ef4444",
  orange: "#f59e0b",
  green: "#22c55e",
  today: "rgba(125, 211, 252, 0.75)",
  grid: "rgba(148,163,184,0.12)",
  card: "#1e293b",
} as const;

type HoverState = { rowKey: string } | null;

function bufferToPct(bufferDays: number): number {
  const clamped = Math.max(SCALE_MIN, Math.min(SCALE_MAX, bufferDays));
  return ((clamped - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;
}

function riskColor(level: TmcGprRiskRow["riskLevel"]): string {
  if (level === "red") return COLORS.red;
  if (level === "orange") return COLORS.orange;
  return COLORS.green;
}

function formatDaysLabel(days: number | null): string {
  if (days == null) return "—";
  const abs = Math.abs(days);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  let word = "дней";
  if (mod100 < 11 || mod100 > 14) {
    if (mod10 === 1) word = "день";
    else if (mod10 >= 2 && mod10 <= 4) word = "дня";
  }
  const sign = days > 0 ? "+" : days < 0 ? "−" : "";
  return days === 0 ? "0 дней" : `${sign}${abs} ${word}`;
}

function RiskTooltip({ row }: { row: TmcGprRiskRow }) {
  return (
    <div
      className="pointer-events-none absolute left-[min(100%,10rem)] top-full z-30 mt-1 w-[280px] rounded-lg border px-3 py-2 text-xs shadow-lg"
      style={{
        background: COLORS.card,
        borderColor: "rgba(148,163,184,0.35)",
        color: "#e2e8f0",
      }}
    >
      <div className="font-semibold tabular-nums text-slate-100">{row.code}</div>
      <div className="mt-0.5 text-slate-400">{row.tmcNames || "—"}</div>
      <div className="mt-2 space-y-0.5 border-t border-slate-600/50 pt-2 tabular-nums text-slate-300">
        <div>
          План начала ГПР:{" "}
          <span className="text-white">{formatTmcIsoRu(row.planStartIso)}</span>
        </div>
        <div>
          Статус обеспечения:{" "}
          <span className="text-white">{row.supplyStatusLabel}</span>
        </div>
        <div>
          Потенциальный сдвиг:{" "}
          <span className="font-semibold text-white">{formatDaysLabel(row.bufferDays)}</span>
        </div>
        <div className="text-slate-400">{row.riskReason}</div>
      </div>
    </div>
  );
}

function RiskRow({
  row,
  columns,
  hover,
  onHover,
}: {
  row: TmcGprRiskRow;
  columns: string;
  hover: HoverState;
  onHover: (next: HoverState) => void;
}) {
  const markerPct = bufferToPct(row.bufferDays);
  const active = hover?.rowKey === row.rowKey;
  const color = riskColor(row.riskLevel);

  return (
    <div
      className="relative z-[1] grid"
      style={{
        gridTemplateColumns: columns,
        height: ROW_HEIGHT_PX,
        borderBottom: `1px solid ${PLAN_FACT_GPR_CHART_ROW_DIVIDER_COLOR}`,
      }}
      onMouseEnter={() => onHover({ rowKey: row.rowKey })}
      onMouseLeave={() => onHover(null)}
    >
      <div className="flex items-center overflow-hidden border-r border-slate-600/35 pr-2 text-[11px] leading-snug text-slate-300">
        <div className="min-w-0 w-full">
          <div className="truncate font-mono tabular-nums text-slate-200">{row.code}</div>
          <div className="mt-0.5 line-clamp-1 text-[10px] text-slate-400">
            {row.tmcNames || "—"}
          </div>
        </div>
      </div>

      <div className="relative min-w-0 border-r border-slate-600/35">
        <div className="relative h-full w-full px-1">
          <div
            className="absolute top-1/2 h-0.5 w-full -translate-y-1/2 rounded"
            style={{ backgroundColor: "rgba(148,163,184,0.2)" }}
          />
          <div
            className="absolute bottom-0 top-0 z-[1] w-px -translate-x-1/2"
            style={{
              left: `${bufferToPct(0)}%`,
              backgroundColor: COLORS.today,
            }}
          />
          <div
            className="absolute top-1/2 z-[2] h-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${markerPct}%`,
              width: 10,
              backgroundColor: color,
              boxShadow: `0 0 0 2px rgba(15,23,42,0.9)`,
            }}
          />
          {row.bufferDays < 0 ? (
            <div
              className="absolute top-1/2 h-1 -translate-y-1/2 rounded"
              style={{
                left: `${markerPct}%`,
                width: `${bufferToPct(0) - markerPct}%`,
                backgroundColor: `${color}88`,
              }}
            />
          ) : null}
        </div>
        {active ? <RiskTooltip row={row} /> : null}
      </div>

      <div className="flex flex-col justify-center px-2 text-[10px] tabular-nums text-slate-300">
        <div className="text-slate-400">План начала ГПР</div>
        <div className="font-medium text-slate-100">{formatTmcIsoRu(row.planStartIso)}</div>
        <div className="mt-0.5 text-slate-400">Потенциальный сдвиг</div>
        <div className="font-semibold" style={{ color }}>
          {formatDaysLabel(row.bufferDays)}
        </div>
      </div>
    </div>
  );
}

export function TmcGprRiskChart({ rows }: { rows: TmcGprRiskRow[] }) {
  const [hover, setHover] = useState<HoverState>(null);
  const columns = useMemo(
    () => `${LABELS_COLUMN_PX}px minmax(0, 1fr) ${RIGHT_COLUMN_PX}px`,
    [],
  );

  const tickLabels = [-180, -120, -60, 0, 60, 120, 180];

  if (rows.length === 0) {
    return (
      <div className="flex h-[100px] items-center justify-center text-sm text-slate-500">
        Нет позиций с существенным риском срыва ГПР
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col" data-tmc-gpr-risk-chart>
      <div className="grid w-full min-w-0" style={{ gridTemplateColumns: columns }}>
        <div className="border-b border-r border-slate-600/35 px-2 py-1 text-[10px] text-slate-500">
          ID / Наименование ТМЦ
        </div>
        <div className="relative border-b border-r border-slate-600/35 px-1 py-1">
          <div className="relative h-6 w-full">
            {tickLabels.map((tick) => (
              <span
                key={tick}
                className={`absolute top-0 -translate-x-1/2 text-[9px] tabular-nums ${
                  tick === 0 ? "font-bold text-sky-300" : "text-slate-500"
                }`}
                style={{ left: `${bufferToPct(tick)}%` }}
              >
                {tick === 0 ? "СЕГОДНЯ" : tick > 0 ? `+${tick}` : tick}
              </span>
            ))}
          </div>
        </div>
        <div className="border-b border-slate-600/35 px-2 py-1 text-[10px] text-slate-500">
          План / сдвиг
        </div>
      </div>

      <div
        className="relative w-full min-w-0 rounded-lg border border-slate-600/30 bg-slate-900/40"
        style={{ minHeight: Math.max(rows.length * ROW_HEIGHT_PX, 80) }}
      >
        <div
          className="pointer-events-none absolute inset-0 z-0 grid"
          style={{ gridTemplateColumns: columns }}
          aria-hidden
        >
          <div className="border-r border-slate-600/35" />
          <div className="relative border-r border-slate-600/35">
            {tickLabels.map((tick) => (
              <div
                key={`grid-${tick}`}
                className="absolute bottom-0 top-0 w-px"
                style={{
                  left: `${bufferToPct(tick)}%`,
                  backgroundColor: tick === 0 ? COLORS.today : COLORS.grid,
                }}
              />
            ))}
          </div>
          <div />
        </div>

        {rows.map((row) => (
          <RiskRow
            key={row.rowKey}
            row={row}
            columns={columns}
            hover={hover}
            onHover={setHover}
          />
        ))}
      </div>
    </div>
  );
}

export function TmcGprRiskLegend() {
  return (
    <AnalyticsLegendList>
      <AnalyticsLegendItem markerColor={COLORS.red} label="Дефицит времени / срыв" />
      <AnalyticsLegendItem markerColor={COLORS.orange} label="Малый запас" />
      <AnalyticsLegendItem markerColor={COLORS.today} label="Сегодня (0)" />
    </AnalyticsLegendList>
  );
}
