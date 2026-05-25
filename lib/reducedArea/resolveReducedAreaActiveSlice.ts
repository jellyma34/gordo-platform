import type { SalesPlanReducedAreaApartmentByRoomType } from "@/lib/reducedArea/buildSalesPlanReducedAreaApartmentByRoomType";
import type {
  SalesPlanReducedAreaByObjectType,
  SalesPlanReducedAreaObjectSlice,
} from "@/lib/reducedArea/buildSalesPlanReducedAreaByObjectType";
import type { ApartmentRoomTypeFilterKey } from "@/lib/roomTypeNormalized";
import type { SalesPlanObjectTypeKey } from "@/lib/salesPlanByObjectType";

export type SalesPlanReducedAreaFilter = {
  objectType: SalesPlanObjectTypeKey;
  roomType: ApartmentRoomTypeFilterKey | null;
};

export type ResolveReducedAreaActiveSliceArgs = {
  salesPlanByObjectType: SalesPlanReducedAreaByObjectType;
  apartmentByRoomType: SalesPlanReducedAreaApartmentByRoomType["byRoomType"];
  filter: SalesPlanReducedAreaFilter;
};

export function resolveReducedAreaActiveSlice({
  salesPlanByObjectType,
  apartmentByRoomType,
  filter,
}: ResolveReducedAreaActiveSliceArgs): SalesPlanReducedAreaObjectSlice {
  if (filter.objectType === "apartments") {
    const roomKey = filter.roomType ?? "all";
    return apartmentByRoomType[roomKey] ?? salesPlanByObjectType.apartments;
  }
  return salesPlanByObjectType[filter.objectType];
}
