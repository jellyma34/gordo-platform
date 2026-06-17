"use client";

import { useId, useMemo } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "@/components/charting/rechartsClient";

export type KpiDonutSegment = {
  label: string;
  value: number;
  color: string;
};

type KpiDonutChartProps = {
  segments: KpiDonutSegment[];
  /**
   * База для расчёта доли % в подписях и tooltip.
   * По умолчанию — сумма значений сегментов (круг = 100% внутри блока).
   */
  percentBase?: number;
  /** Высота диаграммы, px (по умолчанию 96). */
  chartHeight?: number;
  /** Показывать долю % в легенде справа. */
  showLegendPercent?: boolean;
  /** Показывать в легенде сегменты с нулевым значением. */
  showZeroInLegend?: boolean;
  /** Крупное значение в центре donut. */
  centerValue?: string;
  /** Подпись под значением в центре. */
  centerSublabel?: string;
  /** Цвет центрального значения. */
  centerValueColor?: string;
  /** Tooltip в формате «Причина / Количество ТМЦ / Доля». */
  reasonTooltip?: boolean;
};

function pct1(value: number, total: number): string {
  if (total <= 0) return "0%";
  return `${(Math.round((value / total) * 1000) / 10).toFixed(1).replace(".", ",")}%`;
}

/** Компактная donut-диаграмма KPI с легендой справа. */
export function KpiDonutChart({
  segments,
  percentBase,
  chartHeight = 96,
  showLegendPercent = false,
  showZeroInLegend = false,
  centerValue,
  centerSublabel,
  centerValueColor = "#f8fafc",
  reasonTooltip = false,
}: KpiDonutChartProps) {
  const gradPrefix = useId().replace(/:/g, "");

  const activeSegments = useMemo(
    () => segments.filter((seg) => seg.value > 0),
    [segments],
  );

  const legendSegments = useMemo(
    () => (showZeroInLegend ? segments : activeSegments),
    [showZeroInLegend, segments, activeSegments],
  );

  const segmentSum = useMemo(
    () => activeSegments.reduce((s, seg) => s + seg.value, 0),
    [activeSegments],
  );

  const labelBase = percentBase != null && percentBase > 0 ? percentBase : segmentSum;

  const chartData = useMemo(
    () =>
      activeSegments.map((seg, index) => ({
        ...seg,
        gradId: `${gradPrefix}-${index}`,
        sharePct: segmentSum > 0 ? Math.round((seg.value / segmentSum) * 1000) / 10 : 0,
      })),
    [activeSegments, gradPrefix, segmentSum],
  );

  const hasData = activeSegments.length > 0 && segmentSum > 0;

  if (!hasData) {
    return (
      <div className="space-y-2">
        <div
          className="flex items-center justify-center rounded-xl border border-dashed border-slate-600/40 bg-slate-900/25 px-3"
          style={{ minHeight: chartHeight }}
        >
          <span className="text-center text-[10px] font-medium leading-snug text-slate-500">
            Нет данных для распределения
          </span>
        </div>
        {showZeroInLegend && legendSegments.length > 0 ? (
          <ul className="min-w-0 space-y-1.5">
            {legendSegments.map((seg) => (
              <li key={seg.label} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor: seg.color,
                      boxShadow: `0 0 10px ${seg.color}cc`,
                    }}
                    aria-hidden
                  />
                  <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                    {seg.label}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-base font-semibold text-white">
                  {seg.value}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0" style={{ width: chartHeight, height: chartHeight }}>
          {centerValue ? (
            <div className="pointer-events-none absolute inset-0 z-[1] flex flex-col items-center justify-center text-center">
              <span
                className="text-lg font-extrabold tabular-nums leading-none tracking-tight"
                style={{ color: centerValueColor }}
              >
                {centerValue}
              </span>
              {centerSublabel ? (
                <span className="mt-1 max-w-[4.5rem] text-[9px] font-medium uppercase leading-tight tracking-wide text-slate-400">
                  {centerSublabel}
                </span>
              ) : null}
            </div>
          ) : null}
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <defs>
                {chartData.map((entry) => (
                  <linearGradient
                    key={entry.gradId}
                    id={entry.gradId}
                    x1="0%"
                    y1="100%"
                    x2="100%"
                    y2="0%"
                  >
                    <stop offset="0%" stopColor={entry.color} stopOpacity={0.55} />
                    <stop offset="100%" stopColor={entry.color} stopOpacity={0.92} />
                  </linearGradient>
                ))}
              </defs>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as KpiDonutSegment & { sharePct: number };
                  if (!row) return null;
                  return (
                    <div
                      className="rounded-lg border border-slate-600/50 px-3 py-2 text-xs shadow-lg backdrop-blur-md"
                      style={{
                        background: "rgba(15, 23, 42, 0.92)",
                        boxShadow: `0 8px 24px rgba(0,0,0,0.45), 0 0 16px ${row.color}33`,
                      }}
                    >
                      {reasonTooltip ? (
                        <>
                          <div className="text-slate-400">
                            Причина:{" "}
                            <span className="font-semibold text-slate-100">{row.label}</span>
                          </div>
                          <div className="mt-1 tabular-nums text-slate-300">
                            Количество:{" "}
                            <span className="font-medium text-white">
                              {row.value} ТМЦ
                            </span>
                          </div>
                          <div className="tabular-nums text-slate-300">
                            Доля:{" "}
                            <span className="font-medium text-white">{pct1(row.value, labelBase)}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="font-semibold text-slate-100">{row.label}</div>
                          <div className="mt-1 tabular-nums text-slate-300">
                            Количество:{" "}
                            <span className="font-medium text-white">{row.value}</span>
                          </div>
                          <div className="tabular-nums text-slate-300">
                            Доля:{" "}
                            <span className="font-medium text-white">{pct1(row.value, labelBase)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  );
                }}
              />
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius="58%"
                outerRadius="88%"
                paddingAngle={chartData.length > 1 ? 2 : 0}
                stroke="rgba(255,255,255,0.12)"
                strokeWidth={1}
                isAnimationActive
                animationBegin={0}
                animationDuration={650}
                animationEasing="ease-out"
              >
                {chartData.map((entry) => (
                  <Cell
                    key={entry.label}
                    fill={`url(#${entry.gradId})`}
                    style={{
                      filter: `drop-shadow(0 0 6px ${entry.color}66)`,
                    }}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        <ul className="min-w-0 flex-1 space-y-1.5">
          {legendSegments.map((seg) => (
            <li
              key={seg.label}
              className="flex items-center justify-between gap-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor: seg.color,
                    boxShadow: `0 0 10px ${seg.color}cc`,
                  }}
                  aria-hidden
                />
                <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                  {seg.label}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-base font-semibold text-white">
                {seg.value}
                {showLegendPercent ? (
                  <span className="ml-1.5 text-sm font-medium text-slate-300/65">
                    {pct1(seg.value, labelBase)}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
