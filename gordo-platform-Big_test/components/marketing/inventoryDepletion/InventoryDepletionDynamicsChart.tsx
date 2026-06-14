"use client";

import { useMemo } from "react";

import {
  createMarketingDealsStyleMonthTickRenderer,
  MARKETING_DEALS_STYLE_MONTH_X_AXIS,
} from "@/components/marketing/marketingDealsStyleMonthXAxis";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/charting/rechartsClient";
import {
  INVENTORY_DEPLETION_SEGMENT_ORDER,
  type InventoryDepletionDynamicsPoint,
} from "@/lib/inventoryDepletionFromDeals";

type Props = {
  data: readonly InventoryDepletionDynamicsPoint[];
  timelineMonthKeys: readonly string[];
  presDark: boolean;
};

function DynamicsTooltip({
  active,
  payload,
  presDark,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ name?: string; value?: number; color?: string; payload?: InventoryDepletionDynamicsPoint }>;
  presDark: boolean;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const shell = presDark
    ? "rounded-lg border border-slate-500/40 bg-slate-900/95 px-3 py-2 text-xs text-slate-100 shadow-lg"
    : "rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-md";
  return (
    <div className={shell}>
      <div className="mb-1.5 font-semibold capitalize">{p.labelShort}</div>
      <ul className="space-y-0.5">
        {payload.map((entry) => (
          <li key={String(entry.name)} className="flex items-center justify-between gap-3 tabular-nums">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.name}
            </span>
            <span className="font-medium">{entry.value ?? "—"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function InventoryDepletionDynamicsChart({ data, timelineMonthKeys, presDark }: Props) {
  const axisColor = presDark ? "#94a3b8" : "#64748b";
  const gridStroke = presDark ? "rgba(148,163,184,0.12)" : "rgba(100,116,139,0.15)";

  const monthXTick = useMemo(
    () =>
      createMarketingDealsStyleMonthTickRenderer({
        presDark,
        tickCount: Math.max(1, timelineMonthKeys.length),
        translateYPx: 4,
        labelRotateDeg: timelineMonthKeys.length > 8 ? -35 : 0,
      }),
    [presDark, timelineMonthKeys.length],
  );

  const yMax = useMemo(() => {
    let max = 0;
    for (const row of data) {
      for (const meta of INVENTORY_DEPLETION_SEGMENT_ORDER) {
        const key = `${meta.id}Remaining` as keyof InventoryDepletionDynamicsPoint;
        const v = row[key];
        if (typeof v === "number" && v > max) max = v;
      }
    }
    return Math.max(1, Math.ceil(max * 1.05));
  }, [data]);

  const lines = INVENTORY_DEPLETION_SEGMENT_ORDER.filter((m) => m.id !== "all-apartments");

  return (
    <div className="h-[300px] w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={[...data]} margin={{ top: 10, right: 16, left: 4, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
          <XAxis
            dataKey="labelShort"
            type="category"
            {...MARKETING_DEALS_STYLE_MONTH_X_AXIS}
            tick={monthXTick}
            tickMargin={6}
            height={timelineMonthKeys.length > 8 ? 44 : 32}
            axisLine={{ stroke: gridStroke }}
          />
          <YAxis
            domain={[0, yMax]}
            allowDecimals={false}
            tick={{ fill: axisColor, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={36}
            label={{
              value: "Остаток, шт.",
              angle: -90,
              position: "insideLeft",
              fill: axisColor,
              fontSize: 10,
              dx: 4,
            }}
          />
          <Tooltip content={<DynamicsTooltip presDark={presDark} />} />
          <Legend
            wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
            formatter={(value) => <span style={{ color: axisColor }}>{value}</span>}
          />
          {lines.map((meta) => (
            <Line
              key={meta.id}
              type="monotone"
              dataKey={`${meta.id}Remaining`}
              name={meta.label}
              stroke={meta.soldColor}
              strokeWidth={2}
              dot={{ r: 2.5, fill: meta.soldColor, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
