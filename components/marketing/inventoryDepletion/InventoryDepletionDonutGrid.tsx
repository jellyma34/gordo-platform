"use client";

import { InventoryDepletionDonutCard } from "@/components/marketing/inventoryDepletion/InventoryDepletionDonutCard";
import type { InventoryDepletionDonutSlice } from "@/lib/inventoryDepletionFromDeals";

type Props = {
  donuts: readonly InventoryDepletionDonutSlice[];
  presDark: boolean;
};

export function InventoryDepletionDonutGrid({ donuts, presDark }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      {donuts.map((slice) => (
        <InventoryDepletionDonutCard key={slice.id} slice={slice} presDark={presDark} />
      ))}
    </div>
  );
}
