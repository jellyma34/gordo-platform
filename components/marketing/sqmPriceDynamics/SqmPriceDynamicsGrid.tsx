"use client";

import { SqmPriceDynamicsChart } from "@/components/marketing/sqmPriceDynamics/SqmPriceDynamicsChart";
import type { SqmPriceDynamicsSeriesModel } from "@/lib/sqmPriceDynamicsFromDeals";

type Props = {
  rows: SqmPriceDynamicsSeriesModel[];
  timelineMonthKeys: readonly string[];
  presDark: boolean;
};

export function SqmPriceDynamicsGrid({ rows, timelineMonthKeys, presDark }: Props) {
  return (
    <div className="sqm-dynamics-stack flex w-full min-w-0 flex-col gap-6">
      {rows.map((row) => (
        <SqmPriceDynamicsChart
          key={row.key}
          series={row}
          timelineMonthKeys={timelineMonthKeys}
          presDark={presDark}
        />
      ))}
    </div>
  );
}
