"use client";

import { useId, useMemo, useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "@/components/charting/rechartsClient";
import { financePct1, financeRubKpiAmountMln } from "@/components/finance/FinancePresentationKpiPrimitives";
import {
  KPI_DONUT_INNER_RADIUS_RATIO,
  KPI_DONUT_OUTER_RADIUS_RATIO,
  type KpiDonutSegment,
} from "@/components/tmc/KpiDonutChart";

const CHART_SIZE = 140;

export type FinanceDonutSegment = KpiDonutSegment & {
  legendLabel?: string;
};

function pctShare(value: number, total: number): string {
  if (total <= 0) return "0%";
  return `${(Math.round((value / total) * 1000) / 10).toFixed(1).replace(".", ",")}%`;
}

type Props = {
  segments: FinanceDonutSegment[];
  centerPercent: number | null;
  centerSublabelTop: string;
  centerSublabelBottom: string;
  centerValueColor?: string;
};

/** Donut KPI «Расходы»: центр — %, легенда на всю ширину под диаграммой. */
export function FinanceExecutionDonutChart({
  segments,
  centerPercent,
  centerSublabelTop,
  centerSublabelBottom,
  centerValueColor = "#f8fafc",
}: Props) {
  const gradPrefix = useId().replace(/:/g, "");
  const [activeLabel, setActiveLabel] = useState<string | null>(null);

  const activeSegments = useMemo(
    () => segments.filter((segment) => segment.value > 0),
    [segments],
  );

  const segmentSum = useMemo(
    () => activeSegments.reduce((sum, segment) => sum + segment.value, 0),
    [activeSegments],
  );

  const chartData = useMemo(
    () =>
      activeSegments.map((segment, index) => ({
        ...segment,
        gradId: `${gradPrefix}-${index}`,
      })),
    [activeSegments, gradPrefix],
  );

  const activeIndex = activeLabel
    ? chartData.findIndex((segment) => segment.label === activeLabel)
    : -1;

  const centerPercentText =
    centerPercent != null ? financePct1(centerPercent) : "—";

  if (activeSegments.length === 0 || segmentSum <= 0) {
    return (
      <div
        className="mx-auto flex items-center justify-center rounded-xl border border-dashed border-slate-600/40 bg-slate-900/25 px-3"
        style={{ width: CHART_SIZE, height: CHART_SIZE }}
      >
        <span className="text-center text-[10px] font-medium leading-snug text-slate-500">
          Нет данных для распределения
        </span>
      </div>
    );
  }

  return (
    <div className="w-full" onMouseLeave={() => setActiveLabel(null)}>
      <div className="flex justify-center">
        <div
          className="relative shrink-0"
          style={{ width: CHART_SIZE, height: CHART_SIZE }}
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
                  const row = payload[0]?.payload as FinanceDonutSegment;
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
                        Сумма:{" "}
                        <span className="font-medium text-white">
                          {financeRubKpiAmountMln(row.value)}
                        </span>
                      </div>
                      <div className="tabular-nums text-slate-300">
                        Доля:{" "}
                        <span className="font-medium text-white">{pctShare(row.value, segmentSum)}</span>
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
                innerRadius={`${KPI_DONUT_INNER_RADIUS_RATIO * 100}%`}
                outerRadius={`${KPI_DONUT_OUTER_RADIUS_RATIO * 100}%`}
                paddingAngle={chartData.length > 1 ? 2 : 0}
                stroke="rgba(255,255,255,0.12)"
                strokeWidth={1}
                activeIndex={activeIndex >= 0 ? activeIndex : undefined}
                isAnimationActive
                animationBegin={0}
                animationDuration={650}
                animationEasing="ease-out"
                onMouseEnter={(_, index) => {
                  setActiveLabel(chartData[index]?.label ?? null);
                }}
              >
                {chartData.map((entry) => {
                  const isActive = activeLabel === entry.label;
                  const isDimmed = activeLabel != null && !isActive;
                  return (
                    <Cell
                      key={entry.label}
                      fill={`url(#${entry.gradId})`}
                      opacity={isDimmed ? 0.42 : 1}
                      style={{
                        filter: isActive
                          ? `drop-shadow(0 0 12px ${entry.color}cc)`
                          : `drop-shadow(0 0 6px ${entry.color}66)`,
                        transition: "opacity 180ms ease, filter 180ms ease",
                      }}
                    />
                  );
                })}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
            <div className="text-center leading-none">
              <div
                className="text-xl font-extrabold tabular-nums tracking-tight"
                style={{ color: centerValueColor }}
              >
                {centerPercentText}
              </div>
              <div className="mt-1 text-[9px] font-medium uppercase leading-[1.15] tracking-wide text-slate-400">
                {centerSublabelTop}
                <br />
                {centerSublabelBottom}
              </div>
            </div>
          </div>
        </div>
      </div>

      <ul className="mt-2 w-full space-y-1">
        {activeSegments.map((segment) => {
          const isActive = activeLabel === segment.label;
          const isDimmed = activeLabel != null && !isActive;
          const displayLabel = segment.legendLabel ?? segment.label;

          return (
            <li key={segment.label}>
              <button
                type="button"
                className={`flex w-full min-w-0 items-center gap-2 rounded-md px-0.5 py-0.5 text-left transition-all ${
                  isActive ? "bg-white/10 ring-1 ring-white/15" : ""
                } ${isDimmed ? "opacity-45" : "opacity-100"}`}
                onMouseEnter={() => setActiveLabel(segment.label)}
                onFocus={() => setActiveLabel(segment.label)}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor: segment.color,
                    boxShadow: `0 0 10px ${segment.color}cc`,
                  }}
                  aria-hidden
                />
                <span
                  className="min-w-0 shrink truncate text-[10px] font-medium text-slate-300"
                  title={segment.label}
                >
                  {displayLabel}
                </span>
                <span
                  className="mx-1 min-w-[1rem] flex-1 border-b border-dotted border-slate-600/70"
                  aria-hidden
                />
                <span className="shrink-0 tabular-nums text-[10px] font-semibold text-white">
                  {financeRubKpiAmountMln(segment.value)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
