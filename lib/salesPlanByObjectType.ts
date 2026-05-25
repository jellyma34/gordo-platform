import type { DealSegmentKey } from "@/components/marketing/DealsSection";
import { DEAL_SEGMENT_LABEL_RU } from "@/components/marketing/DealsSection";

/**
 * Ключ типа объекта для аналитики плана продаж / ДДУ.
 * Расширяемый реестр — новые категории добавляются в {@link SALES_PLAN_OBJECT_TYPE_REGISTRY}.
 */
export type SalesPlanObjectTypeKey = "all" | "apartments" | "parking" | "storage" | "commercial";

export type SalesPlanObjectTypeDefinition = {
  id: SalesPlanObjectTypeKey;
  label: string;
  /** Сегмент сделок (null для агрегата «Все»). */
  dealSegment: DealSegmentKey | null;
  /** Иллюстрация в KPI «План проекта». */
  illustrationSegment: DealSegmentKey;
};

/** Порядок вкладок в UI. */
export const SALES_PLAN_OBJECT_TYPE_TAB_ORDER: readonly SalesPlanObjectTypeKey[] = [
  "all",
  "apartments",
  "parking",
  "storage",
  "commercial",
];

const APARTMENTS: SalesPlanObjectTypeDefinition = {
  id: "apartments",
  label: DEAL_SEGMENT_LABEL_RU.apartment,
  dealSegment: "apartment",
  illustrationSegment: "apartment",
};

const PARKING: SalesPlanObjectTypeDefinition = {
  id: "parking",
  label: DEAL_SEGMENT_LABEL_RU.parking,
  dealSegment: "parking",
  illustrationSegment: "parking",
};

const STORAGE: SalesPlanObjectTypeDefinition = {
  id: "storage",
  label: DEAL_SEGMENT_LABEL_RU.storage,
  dealSegment: "storage",
  illustrationSegment: "storage",
};

const COMMERCIAL: SalesPlanObjectTypeDefinition = {
  id: "commercial",
  label: DEAL_SEGMENT_LABEL_RU.commercial,
  dealSegment: "commercial",
  illustrationSegment: "commercial",
};

/** Сегменты с собственными KPI (без «Все»). */
export const SALES_PLAN_OBJECT_TYPE_SEGMENT_ORDER: readonly Exclude<SalesPlanObjectTypeKey, "all">[] = [
  "apartments",
  "parking",
  "storage",
  "commercial",
];

export const SALES_PLAN_OBJECT_TYPE_REGISTRY: Record<SalesPlanObjectTypeKey, SalesPlanObjectTypeDefinition> = {
  all: {
    id: "all",
    label: "Все",
    dealSegment: null,
    illustrationSegment: "apartment",
  },
  apartments: APARTMENTS,
  parking: PARKING,
  storage: STORAGE,
  commercial: COMMERCIAL,
};

export function salesPlanObjectTypeDefinition(key: SalesPlanObjectTypeKey): SalesPlanObjectTypeDefinition {
  return SALES_PLAN_OBJECT_TYPE_REGISTRY[key];
}

export function isSalesPlanObjectTypeKey(v: string): v is SalesPlanObjectTypeKey {
  return v in SALES_PLAN_OBJECT_TYPE_REGISTRY;
}
