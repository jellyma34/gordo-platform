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

/** Единая геометрия donut KPI: Recharts Pie innerRadius / outerRadius. */
export const KPI_DONUT_INNER_RADIUS_RATIO = 0.58;
export const KPI_DONUT_OUTER_RADIUS_RATIO = 0.88;

/** Стили центра donut на hub Dashboard — как у GprKpiLargeProgressRing. */
export const KPI_DONUT_HUB_CENTER_VALUE_CLASS =
  "text-[clamp(18px,5.2vw,28px)] font-extrabold tabular-nums tracking-tight text-white";
export const KPI_DONUT_HUB_CENTER_SUBLABEL_CLASS =
  "mt-1 text-[clamp(9px,2.4vw,11px)] font-normal tabular-nums text-slate-500/65";

/** Процент для центра donut: numerator / denominator × 100, формат «XX,X%». */
export function formatKpiDonutCenterPercent(numerator: number, denominator: number): string {
  if (denominator <= 0) return "—";
  const pct = Math.round((numerator / denominator) * 1000) / 10;
  return `${pct.toFixed(1).replace(".", ",")}%`;
}

/** SVG-кольцо с теми же пропорциями, что у KpiDonutChart (stroke по центру пути). */
export function getKpiDonutSvgRingGeometry(viewBoxSize: number): {
  radius: number;
  strokeWidth: number;
} {
  const maxRadius = viewBoxSize / 2;
  const outerRadius = KPI_DONUT_OUTER_RADIUS_RATIO * maxRadius;
  const innerRadius = KPI_DONUT_INNER_RADIUS_RATIO * maxRadius;
  const strokeWidth = outerRadius - innerRadius;
  const radius = (outerRadius + innerRadius) / 2;
  return { radius, strokeWidth };
}

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
  /** Показывать нулевые сегменты в donut (тонкими долями). */
  showZeroInChart?: boolean;
  /** Крупное значение в центре donut. */
  centerValue?: string;
  /** Подпись под значением в центре. */
  centerSublabel?: string;
  /** Цвет центрального значения. */
  centerValueColor?: string;
  /** Переопределить классы центрального значения (для dashboard-карточек). */
  centerValueClassName?: string;
  /** Переопределить классы подписи под значением (для dashboard-карточек). */
  centerSublabelClassName?: string;
  /**
   * Вариант оформления центра.
   * hubDashboard — как GprKpiLargeProgressRing на карточке «Отклонение готовности ГПР».
   */
  centerVariant?: "default" | "hubDashboard";
  /** Tooltip в формате «Причина / Количество ТМЦ / Доля». */
  reasonTooltip?: boolean;
  /** Увеличенный режим для акцентного KPI-блока. */
  large?: boolean;
  /** Позиция легенды относительно donut. */
  legendPosition?: "right" | "bottom";
  /** Число колонок легенды (актуально для legendPosition="bottom"). */
  legendColumns?: number;
  /** Уплотнить легенду: чуть меньше шрифт и интервалы. */
  compactLegend?: boolean;
  /** Показывать подписи легенды без усечения. */
  fullLegendLabels?: boolean;
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
  showZeroInChart = false,
  centerValue,
  centerSublabel,
  centerValueColor = "#f8fafc",
  centerValueClassName,
  centerSublabelClassName,
  centerVariant = "default",
  reasonTooltip = false,
  large = false,
  legendPosition = "right",
  legendColumns = 1,
  compactLegend = false,
  fullLegendLabels = false,
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

  const chartData = useMemo(() => {
    const source = showZeroInChart ? legendSegments : activeSegments;
    const visualTotal = source.reduce((sum, seg) => sum + (seg.value > 0 ? seg.value : 0.001), 0);
    return source.map((seg, index) => {
      const visualValue = seg.value > 0 ? seg.value : 0.001;
      return {
        ...seg,
        gradId: `${gradPrefix}-${index}`,
        visualValue,
        sharePct: segmentSum > 0 ? Math.round((seg.value / segmentSum) * 1000) / 10 : 0,
        visualSharePct: visualTotal > 0 ? Math.round((visualValue / visualTotal) * 1000) / 10 : 0,
      };
    });
  }, [showZeroInChart, legendSegments, activeSegments, gradPrefix, segmentSum]);

  const hasData = showZeroInChart ? legendSegments.length > 0 : activeSegments.length > 0 && segmentSum > 0;

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

  const renderLegendList = (items: typeof legendSegments) => (
    <ul
      className={
        large
          ? compactLegend
            ? "min-w-0 flex-1 space-y-1.5"
            : "min-w-0 flex-1 space-y-2"
          : "min-w-0 flex-1 space-y-1.5"
      }
    >
      {items.map((seg) => (
        <li
          key={seg.label}
          className={
            large
              ? compactLegend
                ? "flex items-center justify-between gap-2"
                : "flex items-center justify-between gap-2.5"
              : "flex items-center justify-between gap-2"
          }
        >
          <span
            className={
              large
                ? compactLegend
                  ? "flex min-w-0 items-center gap-2"
                  : "flex min-w-0 items-center gap-2.5"
                : "flex min-w-0 items-center gap-2"
            }
          >
            <span
              className={large ? "h-2.5 w-2.5 shrink-0 rounded-full" : "h-2 w-2 shrink-0 rounded-full"}
              style={{
                backgroundColor: seg.color,
                boxShadow: `0 0 10px ${seg.color}cc`,
              }}
              aria-hidden
            />
            <span
              className={
                large
                  ? compactLegend
                    ? fullLegendLabels
                      ? "text-[10px] font-semibold uppercase leading-[1.15] tracking-wider text-slate-300"
                      : "truncate text-[10px] font-semibold uppercase tracking-wider text-slate-300"
                    : fullLegendLabels
                      ? "text-[11px] font-semibold uppercase leading-[1.15] tracking-wider text-slate-300"
                      : "truncate text-[11px] font-semibold uppercase tracking-wider text-slate-300"
                  : fullLegendLabels
                    ? "text-[10px] font-semibold uppercase leading-[1.15] tracking-wider text-slate-300"
                    : "truncate text-[10px] font-semibold uppercase tracking-wider text-slate-300"
              }
            >
              {seg.label}
            </span>
          </span>
          <span
            className={
              large
                ? "shrink-0 tabular-nums text-lg font-semibold text-white"
                : "shrink-0 tabular-nums text-base font-semibold text-white"
            }
          >
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
  );

  const isBottomLegend = legendPosition === "bottom";
  const useTwoColumns = isBottomLegend && legendColumns >= 2;
  const leftLegend = useTwoColumns ? legendSegments.slice(0, Math.ceil(legendSegments.length / 2)) : legendSegments;
  const rightLegend = useTwoColumns ? legendSegments.slice(Math.ceil(legendSegments.length / 2)) : [];

  const resolvedCenterValueClassName =
    centerValueClassName ??
    (centerVariant === "hubDashboard"
      ? KPI_DONUT_HUB_CENTER_VALUE_CLASS
      : large
        ? "text-xl font-extrabold tabular-nums leading-none tracking-tight"
        : "text-lg font-extrabold tabular-nums leading-none tracking-tight");

  const resolvedCenterSublabelClassName =
    centerSublabelClassName ??
    (centerVariant === "hubDashboard"
      ? KPI_DONUT_HUB_CENTER_SUBLABEL_CLASS
      : large
        ? "mt-1.5 max-w-[5.2rem] text-[10px] font-medium uppercase leading-tight tracking-wide text-slate-400"
        : "mt-1 max-w-[4.5rem] text-[9px] font-medium uppercase leading-tight tracking-wide text-slate-400");

  return (
    <div className={large ? "space-y-3" : "space-y-2"}>
      <div
        className={
          isBottomLegend
            ? "flex items-center justify-center"
            : large
              ? "flex items-center gap-4"
              : "flex items-center gap-3"
        }
      >
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
                dataKey={showZeroInChart ? "visualValue" : "value"}
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={`${KPI_DONUT_INNER_RADIUS_RATIO * 100}%`}
                outerRadius={`${KPI_DONUT_OUTER_RADIUS_RATIO * 100}%`}
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
          {centerValue ? (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
              <div className="text-center leading-none">
                <div
                  className={resolvedCenterValueClassName}
                  style={centerVariant === "hubDashboard" ? undefined : { color: centerValueColor }}
                >
                  {centerValue}
                </div>
                {centerSublabel ? (
                  <div className={resolvedCenterSublabelClassName}>{centerSublabel}</div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        {!isBottomLegend ? renderLegendList(legendSegments) : null}
      </div>
      {isBottomLegend ? (
        useTwoColumns ? (
          <div className="grid grid-cols-2 gap-x-5">
            <div>{renderLegendList(leftLegend)}</div>
            <div>{renderLegendList(rightLegend)}</div>
          </div>
        ) : (
          renderLegendList(legendSegments)
        )
      ) : null}
    </div>
  );
}
