import type { SalesPlanDduRevenueObjectSlice } from "@/lib/dduRevenue/buildSalesPlanDduRevenueByObjectType";
import type { SalesPlanDduRevenueApartmentByRoomType } from "@/lib/dduRevenue/buildSalesPlanDduRevenueApartmentByRoomType";
import type { ApartmentRoomTypeFilterKey } from "@/lib/roomTypeNormalized";
import type { SalesPlanObjectTypeKey } from "@/lib/salesPlanByObjectType";

/** Вложенный фильтр: тип объекта → комнатность (только для квартир). */
export type SalesPlanDduRevenueFilter = {
  objectType: SalesPlanObjectTypeKey;
  roomType: ApartmentRoomTypeFilterKey | null;
};

export type ResolveDduRevenueActiveSliceArgs = {
  salesPlanByObjectType: Record<SalesPlanObjectTypeKey, SalesPlanDduRevenueObjectSlice>;
  apartmentByRoomType: SalesPlanDduRevenueApartmentByRoomType["byRoomType"];
  filter: SalesPlanDduRevenueFilter;
};

export function resolveDduRevenueActiveSlice({
  salesPlanByObjectType,
  apartmentByRoomType,
  filter,
}: ResolveDduRevenueActiveSliceArgs): SalesPlanDduRevenueObjectSlice {
  if (filter.objectType === "apartments") {
    const roomKey = filter.roomType ?? "all";
    return apartmentByRoomType[roomKey] ?? salesPlanByObjectType.apartments;
  }
  return salesPlanByObjectType[filter.objectType];
}
