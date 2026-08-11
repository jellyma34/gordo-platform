"use client";

import { useId, useMemo } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "@/components/charting/rechartsClient";
import {
  KPI_DONUT_INNER_RADIUS_RATIO,
  KPI_DONUT_OUTER_RADIUS_RATIO,
} from "@/components/tmc/KpiDonutChart";
import type { TmcContractDeviationSegment } from "@/lib/tmcContractDynamicsAnalytics";

/**
 * Диаметр donut относительно правой колонки (~250px).
 * Целевой масштаб на desktop: ~220–240px (главный элемент правой части).
 */
const DONUT_SIZE_CSS = "clamp(200px, 96%, 240px)";

function formatPct1(value: number, total: number): string {
  if (total <= 0) return "0,0%";
  return `${(Math.round((value / total) * 1000) / 10).toFixed(1).replace(".", ",")}%`;
}

function compactDeviationLabel(label: string): string {
  if (label.startsWith("В срок")) return "В срок";
  return label;
}

function DeviationLegendItem({
  segment,
  total,
}: {
  segment: TmcContractDeviationSegment;
  total: number;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1 text-[11px] leading-tight">
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: segment.color }}
        aria-hidden
      />
      <span className="min-w-0 truncate text-slate-400">{compactDeviationLabel(segment.label)}</span>
      <span className="ml-auto shrink-0 whitespace-nowrap tabular-nums text-slate-300">
        {segment.count}{" "}
        <span className="text-slate-500">· {formatPct1(segment.count, total)}</span>
      </span>
    </div>
  );
}

export function TmcContractDeviationCompactPanel({
  segments,
  factConcludedCount,
  onTimeOverallPct,
  eligibleCount,
}: {
  segments: TmcContractDeviationSegment[];
  factConcludedCount: number;
  onTimeOverallPct: number | null;
  /** Договоры с плановой датой (знаменатель donut). */
  eligibleCount?: number;
}) {
  const gradPrefix = useId().replace(/:/g, "");
  const legendTotal =
    eligibleCount != null && eligibleCount > 0
      ? eligibleCount
      : segments.reduce((s, x) => s + x.count, 0);

  const chartData = useMemo(() => {
    const source = segments.filter((s) => s.count > 0);
    return source.map((seg, index) => ({
      ...seg,
      gradId: `${gradPrefix}-${index}`,
    }));
  }, [segments, gradPrefix]);

  if (legendTotal === 0 && factConcludedCount === 0) {
    return (
      <div className="flex min-h-[120px] items-center justify-center px-2 text-center text-xs text-slate-500">
        Нет договоров с определённой плановой датой
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-[250px] flex-col items-center">
      <div
        className="relative mx-auto aspect-square w-full max-w-[240px] shrink-0"
        style={{ width: DONUT_SIZE_CSS, height: DONUT_SIZE_CSS }}
      >
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
                const row = payload[0]?.payload as TmcContractDeviationSegment;
                if (!row) return null;
                return (
                  <div
                    className="rounded-md border border-slate-600/50 px-2 py-1.5 text-[10px] shadow-lg"
                    style={{ background: "rgba(15, 23, 42, 0.95)", color: "#e2e8f0" }}
                  >
                    <div className="font-medium text-slate-100">{row.label}</div>
                    <div className="tabular-nums text-slate-300">
                      {row.count} договоров · {formatPct1(row.count, legendTotal)}
                    </div>
                  </div>
                );
              }}
            />
            <Pie
              data={chartData.length > 0 ? chartData : [{ label: "—", count: 1, color: "#334155", gradId: `${gradPrefix}-empty` }]}
              dataKey="count"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={`${KPI_DONUT_INNER_RADIUS_RATIO * 100}%`}
              outerRadius={`${KPI_DONUT_OUTER_RADIUS_RATIO * 100}%`}
              paddingAngle={chartData.length > 1 ? 2 : 0}
              stroke="rgba(255,255,255,0.12)"
              strokeWidth={1}
              isAnimationActive={false}
            >
              {(chartData.length > 0 ? chartData : [{ gradId: `${gradPrefix}-empty`, color: "#334155" }]).map(
                (entry) => (
                  <Cell
                    key={entry.gradId}
                    fill={
                      chartData.length > 0
                        ? `url(#${entry.gradId})`
                        : entry.color
                    }
                  />
                ),
              )}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center leading-none">
            <div className="text-4xl font-extrabold tabular-nums tracking-tight text-white">
              {factConcludedCount}
            </div>
            <div className="mt-1 text-[11px] font-medium uppercase leading-tight tracking-wide text-slate-500">
              договоров
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2 grid w-full grid-cols-2 gap-x-1.5 gap-y-0.5 border-t border-slate-700/35 pt-2">
        {segments.map((seg) => (
          <DeviationLegendItem key={seg.bucket} segment={seg} total={legendTotal} />
        ))}
      </div>

      {onTimeOverallPct != null ? (
        <div className="mt-2 w-full rounded border border-sky-500/20 bg-sky-500/8 px-1.5 py-1 text-center text-[10px] leading-snug text-sky-200/90">
          {onTimeOverallPct}% договоров в срок
        </div>
      ) : null}
    </div>
  );
}
