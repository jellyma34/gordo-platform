import type { SalesPlanAveragePriceApartmentByRoomType } from "@/lib/averagePricePerSqm/buildSalesPlanAveragePriceApartmentByRoomType";
import type { SalesPlanAveragePriceByObjectType } from "@/lib/averagePricePerSqm/buildSalesPlanAveragePriceByObjectType";
import type { ApartmentRoomTypeFilterKey } from "@/lib/roomTypeNormalized";
import type { SalesPlanObjectTypeKey } from "@/lib/salesPlanByObjectType";
import type { SalesPlanAveragePriceObjectSlice } from "@/lib/averagePricePerSqm/buildSalesPlanAveragePriceByObjectType";

export type SalesPlanAveragePriceFilter = {
  objectType: SalesPlanObjectTypeKey;
  roomType: ApartmentRoomTypeFilterKey | null;
};

export type ResolveAveragePriceActiveSliceArgs = {
  salesPlanByObjectType: SalesPlanAveragePriceByObjectType;
  apartmentByRoomType: SalesPlanAveragePriceApartmentByRoomType["byRoomType"];
  filter: SalesPlanAveragePriceFilter;
};

export function resolveAveragePriceActiveSlice({
  salesPlanByObjectType,
  apartmentByRoomType,
  filter,
}: ResolveAveragePriceActiveSliceArgs): SalesPlanAveragePriceObjectSlice {
  if (filter.objectType === "apartments") {
    const roomKey = filter.roomType ?? "all";
    return apartmentByRoomType[roomKey] ?? salesPlanByObjectType.apartments;
  }
  return salesPlanByObjectType[filter.objectType];
}
