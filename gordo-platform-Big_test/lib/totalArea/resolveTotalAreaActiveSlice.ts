import type { SalesPlanTotalAreaApartmentByRoomType } from "@/lib/totalArea/buildSalesPlanTotalAreaApartmentByRoomType";
import type {
  SalesPlanTotalAreaByObjectType,
  SalesPlanTotalAreaObjectSlice,
} from "@/lib/totalArea/buildSalesPlanTotalAreaByObjectType";
import type { ApartmentRoomTypeFilterKey } from "@/lib/roomTypeNormalized";
import type { SalesPlanObjectTypeKey } from "@/lib/salesPlanByObjectType";

export type SalesPlanTotalAreaFilter = {
  objectType: SalesPlanObjectTypeKey;
  roomType: ApartmentRoomTypeFilterKey | null;
};

export type ResolveTotalAreaActiveSliceArgs = {
  salesPlanByObjectType: SalesPlanTotalAreaByObjectType;
  apartmentByRoomType: SalesPlanTotalAreaApartmentByRoomType["byRoomType"];
  filter: SalesPlanTotalAreaFilter;
};

export function resolveTotalAreaActiveSlice({
  salesPlanByObjectType,
  apartmentByRoomType,
  filter,
}: ResolveTotalAreaActiveSliceArgs): SalesPlanTotalAreaObjectSlice {
  if (filter.objectType === "apartments") {
    const roomKey = filter.roomType ?? "all";
    return apartmentByRoomType[roomKey] ?? salesPlanByObjectType.apartments;
  }
  return salesPlanByObjectType[filter.objectType];
}
