import type { SalesPlanProjectValueApartmentByRoomType } from "@/lib/projectCost/buildSalesPlanProjectValueApartmentByRoomType";
import type { SalesPlanProjectValueObjectSlice } from "@/lib/projectCost/buildSalesPlanProjectValueByObjectType";
import type { ApartmentRoomTypeFilterKey } from "@/lib/roomTypeNormalized";
import type { SalesPlanObjectTypeKey } from "@/lib/salesPlanByObjectType";

export type SalesPlanProjectValueFilter = {
  objectType: SalesPlanObjectTypeKey;
  roomType: ApartmentRoomTypeFilterKey | null;
};

export type ResolveProjectValueActiveSliceArgs = {
  salesPlanByObjectType: Record<SalesPlanObjectTypeKey, SalesPlanProjectValueObjectSlice>;
  apartmentByRoomType: SalesPlanProjectValueApartmentByRoomType["byRoomType"];
  filter: SalesPlanProjectValueFilter;
};

export function resolveProjectValueActiveSlice({
  salesPlanByObjectType,
  apartmentByRoomType,
  filter,
}: ResolveProjectValueActiveSliceArgs): SalesPlanProjectValueObjectSlice {
  if (filter.objectType === "apartments") {
    const roomKey = filter.roomType ?? "all";
    return apartmentByRoomType[roomKey] ?? salesPlanByObjectType.apartments;
  }
  return salesPlanByObjectType[filter.objectType];
}
