"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/charting/rechartsClient";
import { AnalyticsLegendItem, AnalyticsLegendList } from "@/components/construction/AnalyticsLegendItem";
import { createTmcMaterialXAxisTick } from "@/components/tmc/TmcMaterialXAxisTick";
import { segmentedControlTabClass } from "@/components/marketing/marketingSegmentedControlClasses";
import type {
  TmcMaterialPriceChangeRanking,
  TmcMaterialPriceChangeRow,
  TmcPriceIndexPeriod,
} from "@/lib/tmcPresentationAnalytics";
import { tmcMaterialAxisLineCount } from "@/lib/tmcMaterialAxisLabels";

const COLORS = {
  increase: "#ef4444",
  decrease: "#22c55e",
  grid: "rgba(148,163,184,0.12)",
  axis: "#94a3b8",
  card: "#1e293b",
} as const;

const TMC_LABEL_MIN = 0.05;

type ChartRow = TmcMaterialPriceChangeRow & {
  label: string;
};

function pctSigned1(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  const formatted = Math.abs(rounded).toFixed(1).replace(".", ",");
  if (rounded < 0) return `−${formatted}%`;
  if (rounded > 0) return `+${formatted}%`;
  return `${formatted}%`;
}

function buildSymmetricXDomain(rows: ChartRow[]): [number, number] {
  let maxAbs = 0;
  for (const row of rows) {
    maxAbs = Math.max(maxAbs, Math.abs(row.changePct));
  }
  const limit = Math.max(20, Math.ceil(maxAbs * 1.15));
  return [-limit, limit];
}

function formatBarLabel(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) < TMC_LABEL_MIN) return "";
  return pctSigned1(n);
}

type BarLabelProps = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: unknown;
};

function RankingBarLabel(props: BarLabelProps) {
  const x = typeof props.x === "number" ? props.x : Number(props.x);
  const y = typeof props.y === "number" ? props.y : Number(props.y);
  const width = typeof props.width === "number" ? props.width : Number(props.width);
  const height = typeof props.height === "number" ? props.height : Number(props.height);
  const text = formatBarLabel(props.value);
  if (!text || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width)) {
    return null;
  }

  const value = Number(props.value);
  const isPositive = value >= 0;
  const cx = isPositive ? x + width + 6 : x + width - 6;

  return (
    <text
      x={cx}
      y={y + height / 2}
      textAnchor={isPositive ? "start" : "end"}
      dominantBaseline="central"
      fill={isPositive ? "#fca5a5" : "#86efac"}
      fontSize={10}
      fontWeight={700}
      className="tabular-nums pointer-events-none"
    >
      {text}
    </text>
  );
}

function RankingTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: ChartRow }>;
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const row = payload[0].payload;

  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-lg"
      style={{
        background: COLORS.card,
        borderColor: "rgba(148,163,184,0.35)",
        color: "#e2e8f0",
      }}
    >
      <div className="font-semibold text-slate-100">{row.name}</div>
      <div className="mt-1 tabular-nums text-slate-300">
        Изменение цены:{" "}
        <span
          className={`font-medium ${row.changePct >= 0 ? "text-red-300" : "text-emerald-300"}`}
        >
          {pctSigned1(row.changePct)}
        </span>
      </div>
    </div>
  );
}

function RankingKpiBlock({ ranking }: { ranking: TmcMaterialPriceChangeRanking }) {
  return (
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-slate-600/40 bg-slate-900/35 px-4 py-3">
        <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
          Максимальный рост
        </div>
        <div className="mt-1 text-lg font-semibold tabular-nums text-red-400">
          {ranking.maxGrowthPct > 0 ? pctSigned1(ranking.maxGrowthPct) : "—"}
        </div>
        <div className="mt-1 text-xs text-slate-400">Материал: {ranking.maxGrowthMaterial}</div>
      </div>
      <div className="rounded-xl border border-slate-600/40 bg-slate-900/35 px-4 py-3">
        <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
          Максимальное снижение
        </div>
        <div className="mt-1 text-lg font-semibold tabular-nums text-emerald-400">
          {ranking.maxDeclinePct < 0 ? pctSigned1(ranking.maxDeclinePct) : "—"}
        </div>
        <div className="mt-1 text-xs text-slate-400">Материал: {ranking.maxDeclineMaterial}</div>
      </div>
      <div className="rounded-xl border border-slate-600/40 bg-slate-900/35 px-4 py-3">
        <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
          Среднее изменение
        </div>
        <div
          className={`mt-1 text-lg font-semibold tabular-nums ${
            ranking.avgChangePct < 0
              ? "text-emerald-400"
              : ranking.avgChangePct > 0
                ? "text-red-400"
                : "text-slate-100"
          }`}
        >
          {pctSigned1(ranking.avgChangePct)}
        </div>
      </div>
    </div>
  );
}

export function TmcMaterialPriceChangeRankingView({
  ranking,
  period,
  onPeriodChange,
}: {
  ranking: TmcMaterialPriceChangeRanking;
  period: TmcPriceIndexPeriod;
  onPeriodChange: (period: TmcPriceIndexPeriod) => void;
}) {
  const chartData = useMemo<ChartRow[]>(
    () =>
      [...ranking.rows]
        .map((row) => ({
          ...row,
          label: row.shortLabel,
        }))
        .reverse(),
    [ranking.rows],
  );

  const xDomain = useMemo(() => buildSymmetricXDomain(chartData), [chartData]);
  const yAxisWidth = useMemo(() => {
    const maxLines = chartData.reduce(
      (max, row) => Math.max(max, tmcMaterialAxisLineCount(row.name)),
      1,
    );
    return maxLines > 1 ? 148 : 128;
  }, [chartData]);

  const materialYTick = useMemo(
    () => createTmcMaterialXAxisTick({ fontSize: 10, fill: COLORS.axis }),
    [],
  );

  const chartHeight = Math.max(300, chartData.length * 38 + 72);

  if (!ranking.hasSignificantChange || chartData.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex justify-end">
          <PeriodSwitcher period={period} onPeriodChange={onPeriodChange} />
        </div>
        <div className="flex h-[280px] items-center justify-center rounded-xl border border-slate-700/35 bg-slate-900/25 px-6 text-center text-sm text-slate-400">
          Существенных изменений стоимости ТМЦ не выявлено
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col">
      <div className="mb-3 flex justify-end">
        <PeriodSwitcher period={period} onPeriodChange={onPeriodChange} />
      </div>
      <RankingKpiBlock ranking={ranking} />

      <div className="mt-2 w-full min-w-0" style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ top: 8, right: 52, left: 4, bottom: 8 }}
            barCategoryGap="22%"
          >
            <CartesianGrid stroke={COLORS.grid} strokeDasharray="4 4" horizontal={false} />
            <XAxis
              type="number"
              domain={xDomain}
              tick={{ fill: COLORS.axis, fontSize: 11 }}
              tickFormatter={(v) => `${Math.round(Number(v))}%`}
              axisLine={{ stroke: "rgba(148,163,184,0.25)" }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={yAxisWidth}
              tickLine={false}
              axisLine={{ stroke: "rgba(148,163,184,0.25)" }}
              tick={materialYTick}
            />
            <ReferenceLine
              x={0}
              stroke="rgba(148,163,184,0.55)"
              strokeWidth={1.5}
            />
            <Tooltip cursor={{ fill: "rgba(148,163,184,0.06)" }} content={<RankingTooltip />} />
            <Bar dataKey="changePct" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
              {chartData.map((row) => (
                <Cell
                  key={row.name}
                  fill={row.changePct >= 0 ? COLORS.increase : COLORS.decrease}
                />
              ))}
              <LabelList dataKey="changePct" content={RankingBarLabel} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 border-t border-slate-700/40 pt-3">
        <AnalyticsLegendList>
          <AnalyticsLegendItem markerColor={COLORS.increase} label="Рост цены" />
          <AnalyticsLegendItem markerColor={COLORS.decrease} label="Снижение цены" />
        </AnalyticsLegendList>
      </div>
    </div>
  );
}

function PeriodSwitcher({
  period,
  onPeriodChange,
}: {
  period: TmcPriceIndexPeriod;
  onPeriodChange: (period: TmcPriceIndexPeriod) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-slate-600/70 bg-slate-900/50 p-0.5">
      {(
        [
          { id: "whole" as const, label: "За весь период" },
          { id: "lastMonth" as const, label: "Последний месяц" },
        ] as const
      ).map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onPeriodChange(item.id)}
          className={segmentedControlTabClass(period === item.id, "dark")}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
