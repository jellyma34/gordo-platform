"use client";

import { SqmPriceDynamicsChart } from "@/components/marketing/sqmPriceDynamics/SqmPriceDynamicsChart";
import type { SqmPriceDynamicsSeriesModel, SqmPriceChartMode } from "@/lib/sqmPriceDynamicsFromDeals";

type Props = {
  rows: SqmPriceDynamicsSeriesModel[];
  timelineMonthKeys: readonly string[];
  presDark: boolean;
  chartMode?: SqmPriceChartMode;
};

export function SqmPriceDynamicsGrid({ rows, timelineMonthKeys, presDark, chartMode = "monthly" }: Props) {
  return (
    <div className="sqm-dynamics-stack flex w-full min-w-0 flex-col gap-4">
      {rows.map((row) => (
        <SqmPriceDynamicsChart
          key={`${row.key}-${chartMode}`}
          series={row}
          timelineMonthKeys={timelineMonthKeys}
          presDark={presDark}
          chartMode={chartMode}
        />
      ))}
    </div>
  );
}
