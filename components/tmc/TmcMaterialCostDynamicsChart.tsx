"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/charting/rechartsClient";
import { AnalyticsLegendItem, AnalyticsLegendList } from "@/components/construction/AnalyticsLegendItem";
import { createTmcMaterialXAxisTick } from "@/components/tmc/TmcMaterialXAxisTick";
import type { TmcMaterialCostDynamicsRow } from "@/lib/tmcPresentationAnalytics";
import { tmcMaterialAxisLineCount } from "@/lib/tmcMaterialAxisLabels";

const COLORS = {
  green: "#22c55e",
  factLabel: "#86efac",
  plan: "#94a3b8",
  planFill: "rgba(148,163,184,0.88)",
} as const;

const CHART_HEIGHT = 360;

type ChartRow = TmcMaterialCostDynamicsRow & {
  plan: number;
  fact: number;
  label: string;
};

function roundPriceRub(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

function priceRub(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = roundPriceRub(value);
  const formatted = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(rounded);
  if (rounded < 0) return `−${formatted} ₽`;
  return `${formatted} ₽`;
}

function formatBarTopLabel(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  const rounded = roundPriceRub(n);
  if (rounded < 0) {
    return `−${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.abs(rounded))}`;
  }
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(rounded);
}

function pctSigned1(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  const formatted = Math.abs(rounded).toFixed(1).replace(".", ",");
  if (rounded < 0) return `−${formatted}%`;
  if (rounded > 0) return `+${formatted}%`;
  return `${formatted}%`;
}

function buildBarYDomain(rows: ChartRow[]): [number, number] {
  let max = 0;
  for (const row of rows) {
    max = Math.max(max, row.plan, row.fact);
  }
  return [0, max > 0 ? Math.ceil(max * 1.14) : 1];
}

function TmcMaterialCostTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: ChartRow }>;
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const row = payload[0].payload;

  return (
    <div className="rounded-lg border border-slate-600/50 bg-[#1e293b] px-3 py-2.5 text-xs shadow-lg">
      <div className="font-semibold text-slate-100">{row.name}</div>
      <div className="mt-2 space-y-1 tabular-nums text-slate-300">
        <div>Плановая цена: {priceRub(row.planUnitPrice)}</div>
        <div>Фактическая цена: {priceRub(row.factUnitPrice)}</div>
        <div>Отклонение: {priceRub(row.deviationRub)}</div>
        <div>Отклонение %: {pctSigned1(row.deviationPct)}</div>
      </div>
    </div>
  );
}

export function TmcMaterialCostDynamicsChart({ rows }: { rows: TmcMaterialCostDynamicsRow[] }) {
  const chartData = useMemo<ChartRow[]>(
    () =>
      rows.map((row) => ({
        ...row,
        label: row.name,
        plan: roundPriceRub(row.planUnitPrice),
        fact: roundPriceRub(row.factUnitPrice),
      })),
    [rows],
  );

  const xTickAngle = chartData.length > 6 ? -32 : 0;
  const xTickAnchor = chartData.length > 6 ? ("end" as const) : ("middle" as const);
  const materialXTick = useMemo(
    () => createTmcMaterialXAxisTick({ angle: xTickAngle, textAnchor: xTickAnchor }),
    [xTickAngle, xTickAnchor],
  );

  const yDomain = useMemo(() => buildBarYDomain(chartData), [chartData]);

  const hasPlottablePrices = useMemo(
    () => chartData.some((row) => row.plan > 0),
    [chartData],
  );

  const xAxisHeight = useMemo(() => {
    const maxLines = chartData.reduce(
      (max, row) => Math.max(max, tmcMaterialAxisLineCount(row.name)),
      1,
    );
    const angled = chartData.length > 6;
    if (angled) return maxLines > 1 ? 88 : 72;
    return maxLines > 1 ? 56 : 40;
  }, [chartData]);

  const barCategoryGap = chartData.length > 8 ? "22%" : chartData.length > 4 ? "18%" : "14%";

  if (chartData.length === 0) {
    return (
      <div className="flex h-[320px] items-center justify-center text-sm text-slate-500">
        Нет данных для построения динамики стоимости
      </div>
    );
  }

  if (!hasPlottablePrices) {
    return (
      <div className="flex h-[320px] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-slate-400">
        <p>Не удалось построить график: отсутствуют цены закупки за единицу.</p>
        <p className="text-xs text-slate-500">
          Проверьте колонки «Цена закупки за ед. (руб.)» — План / Факт в импорте ТМЦ.
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col">
      <div className="h-[360px] w-full min-w-0">
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <BarChart
            data={chartData}
            margin={{ top: 32, right: 16, left: 4, bottom: 8 }}
            barCategoryGap={barCategoryGap}
            barGap={4}
          >
            <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="4 4" vertical={false} />
            <XAxis
              type="category"
              dataKey="label"
              interval={0}
              tickLine={false}
              axisLine={{ stroke: "rgba(148,163,184,0.25)" }}
              tick={materialXTick}
              height={xAxisHeight}
            />
            <YAxis
              type="number"
              domain={yDomain}
              width={72}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickFormatter={(v) =>
                `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(Number(v)))} ₽`
              }
              axisLine={{ stroke: "rgba(148,163,184,0.25)" }}
              tickLine={false}
              label={{
                value: "Стоимость за единицу, ₽",
                angle: -90,
                position: "insideLeft",
                fill: "#64748b",
                fontSize: 10,
                dx: -4,
              }}
            />
            <Tooltip cursor={{ fill: "rgba(148,163,184,0.06)" }} content={<TmcMaterialCostTooltip />} />
            <Bar
              dataKey="plan"
              name="План"
              fill={COLORS.planFill}
              stroke="#ffffff"
              strokeWidth={1}
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="plan"
                position="top"
                fill={COLORS.plan}
                fontSize={10}
                fontWeight={500}
                className="tabular-nums"
                formatter={formatBarTopLabel}
              />
            </Bar>
            <Bar
              dataKey="fact"
              name="Факт"
              fill={COLORS.green}
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="fact"
                position="top"
                fill={COLORS.factLabel}
                fontSize={10}
                fontWeight={700}
                className="tabular-nums"
                formatter={formatBarTopLabel}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 border-t border-slate-700/40 pt-3">
        <AnalyticsLegendList>
          <AnalyticsLegendItem markerColor={COLORS.plan} label="Плановая цена за единицу" />
          <AnalyticsLegendItem markerColor={COLORS.green} label="Фактическая цена за единицу" />
        </AnalyticsLegendList>
      </div>
    </div>
  );
}
