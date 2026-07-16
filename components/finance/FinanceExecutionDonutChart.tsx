"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
} from "@/components/charting/rechartsClient";
import { financePct1, financeRubKpiAmountMln } from "@/components/finance/FinancePresentationKpiPrimitives";
import {
  KPI_DONUT_INNER_RADIUS_RATIO,
  KPI_DONUT_OUTER_RADIUS_RATIO,
  type KpiDonutSegment,
} from "@/components/tmc/KpiDonutChart";

const DEFAULT_CHART_SIZE = 190;
const TOOLTIP_GAP_PX = 16;
const TOOLTIP_EST_WIDTH = 148;
const TOOLTIP_EST_HEIGHT = 72;

export type FinanceDonutSegment = KpiDonutSegment & {
  legendLabel?: string;
};

function pctShare(value: number, total: number): string {
  if (total <= 0) return "0%";
  return `${(Math.round((value / total) * 1000) / 10).toFixed(1).replace(".", ",")}%`;
}

/** Середина сектора в градусах Recharts (0° = 3 часа, по часовой). */
function sectorMidAngleDeg(
  index: number,
  data: { value: number }[],
  startAngle = 0,
  endAngle = 360,
): number {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0 || index < 0) return -90;

  const sweep = endAngle - startAngle;
  let cursor = startAngle;
  for (let i = 0; i < index; i += 1) {
    cursor += (data[i]!.value / total) * sweep;
  }
  const segmentSweep = (data[index]!.value / total) * sweep;
  return cursor + segmentSweep / 2;
}

/** Tooltip снаружи donut: якорь на внешнем радиусе + отступ, с clamp внутри карточки. */
function externalTooltipPosition(
  midAngleDeg: number,
  chartSize: number,
  tooltipWidth: number,
  tooltipHeight: number,
): { left: number; top: number } {
  const cx = chartSize / 2;
  const cy = chartSize / 2;
  const outerR = KPI_DONUT_OUTER_RADIUS_RATIO * (chartSize / 2);
  const innerR = KPI_DONUT_INNER_RADIUS_RATIO * (chartSize / 2);
  const rad = (midAngleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const anchorDist = outerR + TOOLTIP_GAP_PX;
  let left = cx + cos * (anchorDist + tooltipWidth / 2);
  let top = cy + sin * (anchorDist + tooltipHeight / 2);

  const pad = 4;
  const halfW = tooltipWidth / 2;
  const halfH = tooltipHeight / 2;
  left = Math.max(pad + halfW, Math.min(chartSize - pad - halfW, left));
  top = Math.max(pad + halfH, Math.min(chartSize - pad - halfH, top));

  const dx = left - cx;
  const dy = top - cy;
  const minDist = innerR + halfH * 0.35;
  const dist = Math.hypot(dx, dy);
  if (dist < minDist && dist > 0) {
    const scale = minDist / dist;
    left = cx + dx * scale;
    top = cy + dy * scale;
    left = Math.max(pad + halfW, Math.min(chartSize - pad - halfW, left));
    top = Math.max(pad + halfH, Math.min(chartSize - pad - halfH, top));
  }

  return { left, top };
}

type SectorTooltipProps = {
  segment: FinanceDonutSegment;
  segmentSum: number;
  chartSize: number;
  midAngleDeg: number;
};

function SectorExternalTooltip({
  segment,
  segmentSum,
  chartSize,
  midAngleDeg,
}: SectorTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(() =>
    externalTooltipPosition(
      midAngleDeg,
      chartSize,
      TOOLTIP_EST_WIDTH,
      TOOLTIP_EST_HEIGHT,
    ),
  );

  useLayoutEffect(() => {
    const el = tooltipRef.current;
    const width = el?.offsetWidth ?? TOOLTIP_EST_WIDTH;
    const height = el?.offsetHeight ?? TOOLTIP_EST_HEIGHT;
    setPosition(externalTooltipPosition(midAngleDeg, chartSize, width, height));
  }, [midAngleDeg, chartSize, segment.label]);

  return (
    <div
      ref={tooltipRef}
      className="pointer-events-none absolute z-20 max-w-[min(148px,calc(100%-8px))] rounded-lg border border-slate-600/50 px-3 py-2 text-xs shadow-lg backdrop-blur-md"
      style={{
        left: position.left,
        top: position.top,
        transform: "translate(-50%, -50%)",
        background: "rgba(15, 23, 42, 0.92)",
        boxShadow: `0 8px 24px rgba(0,0,0,0.45), 0 0 16px ${segment.color}33`,
      }}
    >
      <div className="font-semibold leading-snug text-slate-100">
        {segment.legendLabel ?? segment.label}
      </div>
      <div className="mt-1 tabular-nums text-slate-300">
        Сумма:{" "}
        <span className="font-medium text-white">
          {financeRubKpiAmountMln(segment.value)}
        </span>
      </div>
      <div className="tabular-nums text-slate-300">
        Доля:{" "}
        <span className="font-medium text-white">
          {pctShare(segment.value, segmentSum)}
        </span>
      </div>
    </div>
  );
}

type Props = {
  segments: FinanceDonutSegment[];
  centerPercent: number | null;
  centerSublabelTop: string;
  centerSublabelBottom: string;
  centerValueColor?: string;
  /** Размер donut в px (по умолчанию ~190). */
  chartSize?: number;
};

/** Donut KPI «Расходы»: легенда открывается только по клику на сектор/диаграмму. */
export function FinanceExecutionDonutChart({
  segments,
  centerPercent,
  centerSublabelTop,
  centerSublabelBottom,
  centerValueColor = "#f8fafc",
  chartSize = DEFAULT_CHART_SIZE,
}: Props) {
  const gradPrefix = useId().replace(/:/g, "");
  const rootRef = useRef<HTMLDivElement>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);

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

  const highlightLabel = legendOpen ? selectedLabel : hoverLabel;
  const activeIndex = highlightLabel
    ? chartData.findIndex((segment) => segment.label === highlightLabel)
    : -1;
  const hoverIndex = hoverLabel
    ? chartData.findIndex((segment) => segment.label === hoverLabel)
    : -1;
  const hoverSegment = hoverIndex >= 0 ? chartData[hoverIndex] : null;
  const hoverMidAngle =
    hoverIndex >= 0 ? sectorMidAngleDeg(hoverIndex, chartData) : null;

  const centerPercentText =
    centerPercent != null ? financePct1(centerPercent) : "—";

  useEffect(() => {
    if (!legendOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (rootRef.current && target && !rootRef.current.contains(target)) {
        setLegendOpen(false);
        setSelectedLabel(null);
        setHoverLabel(null);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [legendOpen]);

  const openLegendForLabel = (label: string | null) => {
    if (!label) return;
    setSelectedLabel(label);
    setLegendOpen(true);
  };

  const closeLegend = () => {
    setLegendOpen(false);
    setSelectedLabel(null);
    setHoverLabel(null);
  };

  if (activeSegments.length === 0 || segmentSum <= 0) {
    return (
      <div
        className="mx-auto flex items-center justify-center rounded-xl border border-dashed border-slate-600/40 bg-slate-900/25 px-3"
        style={{ width: chartSize, height: chartSize }}
      >
        <span className="text-center text-[10px] font-medium leading-snug text-slate-500">
          Нет данных для распределения
        </span>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="w-full">
      <div className="flex justify-center">
        <div
          className="relative shrink-0 cursor-pointer"
          style={{ width: chartSize, height: chartSize }}
          onClick={() => {
            openLegendForLabel(selectedLabel ?? chartData[0]?.label ?? null);
          }}
          onMouseLeave={() => {
            if (!legendOpen) setHoverLabel(null);
          }}
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
                  setHoverLabel(chartData[index]?.label ?? null);
                }}
                onClick={(_, index) => {
                  openLegendForLabel(chartData[index]?.label ?? null);
                }}
              >
                {chartData.map((entry) => {
                  const isActive = highlightLabel === entry.label;
                  const isDimmed = highlightLabel != null && !isActive;
                  return (
                    <Cell
                      key={entry.label}
                      fill={`url(#${entry.gradId})`}
                      opacity={isDimmed ? 0.42 : 1}
                      style={{
                        cursor: "pointer",
                        filter: isActive
                          ? `drop-shadow(0 0 12px ${entry.color}cc)`
                          : `drop-shadow(0 0 6px ${entry.color}66)`,
                        transition: "opacity 180ms ease, filter 180ms ease",
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        openLegendForLabel(entry.label);
                      }}
                    />
                  );
                })}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          {hoverSegment && hoverMidAngle != null ? (
            <SectorExternalTooltip
              segment={hoverSegment}
              segmentSum={segmentSum}
              chartSize={chartSize}
              midAngleDeg={hoverMidAngle}
            />
          ) : null}

          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
            <div className="text-center leading-none">
              <div
                className="text-2xl font-extrabold tabular-nums tracking-tight"
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

      {legendOpen ? (
        <div className="mt-3 w-full">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Статьи
            </span>
            <button
              type="button"
              className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
              onClick={closeLegend}
            >
              Скрыть
            </button>
          </div>
          <ul className="w-full space-y-1">
            {activeSegments.map((segment) => {
              const isActive = selectedLabel === segment.label;
              const isDimmed = selectedLabel != null && !isActive;
              const displayLabel = segment.legendLabel ?? segment.label;

              return (
                <li key={segment.label}>
                  <button
                    type="button"
                    className={`flex w-full min-w-0 items-center gap-2 rounded-md px-0.5 py-0.5 text-left transition-all ${
                      isActive ? "bg-white/10 ring-1 ring-white/15" : ""
                    } ${isDimmed ? "opacity-45" : "opacity-100"}`}
                    onClick={() => openLegendForLabel(segment.label)}
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
      ) : null}
    </div>
  );
}
