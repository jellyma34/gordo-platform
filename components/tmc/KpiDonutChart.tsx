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
  /** Высота диаграммы, px (по умолчанию 96). */
  chartHeight?: number;
  /** Показывать долю % в легенде справа. */
  showLegendPercent?: boolean;
};

function pct1(value: number, total: number): string {
  if (total <= 0) return "0%";
  return `${(Math.round((value / total) * 1000) / 10).toFixed(1).replace(".", ",")}%`;
}

/** Компактная donut-диаграмма KPI с легендой справа. */
export function KpiDonutChart({
  segments,
  chartHeight = 96,
  showLegendPercent = false,
}: KpiDonutChartProps) {
  const gradPrefix = useId().replace(/:/g, "");

  const activeSegments = useMemo(
    () => segments.filter((seg) => seg.value > 0),
    [segments],
  );

  const total = useMemo(
    () => activeSegments.reduce((s, seg) => s + seg.value, 0),
    [activeSegments],
  );

  const chartData = useMemo(
    () =>
      activeSegments.map((seg, index) => ({
        ...seg,
        gradId: `${gradPrefix}-${index}`,
        sharePct: total > 0 ? Math.round((seg.value / total) * 1000) / 10 : 0,
      })),
    [activeSegments, gradPrefix, total],
  );

  const hasData = activeSegments.length > 0 && total > 0;

  if (!hasData) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-dashed border-slate-600/40 bg-slate-900/25 px-3"
        style={{ minHeight: chartHeight }}
      >
        <span className="text-center text-[10px] font-medium leading-snug text-slate-500">
          Нет данных для распределения
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0" style={{ width: chartHeight, height: chartHeight }}>
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
                      <div className="font-semibold text-slate-100">{row.label}</div>
                      <div className="mt-1 tabular-nums text-slate-300">
                        Количество:{" "}
                        <span className="font-medium text-white">{row.value}</span>
                      </div>
                      <div className="tabular-nums text-slate-300">
                        Доля:{" "}
                        <span className="font-medium text-white">{pct1(row.value, total)}</span>
                      </div>
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
          {activeSegments.map((seg) => (
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
                    {pct1(seg.value, total)}
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
