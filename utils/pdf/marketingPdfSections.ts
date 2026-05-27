import type { AnalyticsChartMode } from "@/components/marketing/analytics/AnalyticsChartModeToggle";
import {
  APARTMENT_ROOM_TYPE_TAB_ORDER,
  apartmentRoomTypeConfig,
  type ApartmentRoomTypeFilterKey,
} from "@/lib/roomTypeNormalized";
import {
  SALES_PLAN_OBJECT_TYPE_REGISTRY,
  SALES_PLAN_OBJECT_TYPE_TAB_ORDER,
  type SalesPlanObjectTypeKey,
} from "@/lib/salesPlanByObjectType";

export const MARKETING_PDF_CHART_MODES: readonly AnalyticsChartMode[] = ["monthly", "cumulative"];

export const MARKETING_PDF_CHART_MODE_LABELS: Record<AnalyticsChartMode, string> = {
  monthly: "Помесячно",
  cumulative: "Нарастающим итогом",
};

export type MarketingPdfObjectSegmentVariant = {
  objectType: SalesPlanObjectTypeKey;
  roomType?: ApartmentRoomTypeFilterKey;
  segmentLabel: string;
};

/** All object-type tabs; for apartments optionally expands room-type sub-tabs. */
export function buildMarketingPdfObjectSegmentVariants(options?: {
  includeRoomTypes?: boolean;
}): MarketingPdfObjectSegmentVariant[] {
  const includeRoomTypes = options?.includeRoomTypes ?? false;
  const out: MarketingPdfObjectSegmentVariant[] = [];

  for (const objectType of SALES_PLAN_OBJECT_TYPE_TAB_ORDER) {
    if (objectType === "apartments" && includeRoomTypes) {
      for (const roomType of APARTMENT_ROOM_TYPE_TAB_ORDER) {
        const roomLabel =
          roomType === "all"
            ? "Все комнатности"
            : apartmentRoomTypeConfig(roomType)?.shortTabLabel ?? roomType;
        out.push({
          objectType,
          roomType,
          segmentLabel: `${SALES_PLAN_OBJECT_TYPE_REGISTRY.apartments.label} · ${roomLabel}`,
        });
      }
    } else {
      out.push({
        objectType,
        segmentLabel: SALES_PLAN_OBJECT_TYPE_REGISTRY[objectType].label,
      });
    }
  }

  return out;
}

export type MarketingPdfSectionMeta = {
  sectionTitle: string;
  segmentLabel?: string;
  modeLabel?: string;
  monthLabel?: string;
};

export function formatMarketingPdfSectionMeta(meta: MarketingPdfSectionMeta): string {
  const parts = [meta.sectionTitle];
  if (meta.segmentLabel) parts.push(`Сегмент: ${meta.segmentLabel}`);
  if (meta.modeLabel) parts.push(`Режим: ${meta.modeLabel}`);
  if (meta.monthLabel) parts.push(`Месяц: ${meta.monthLabel}`);
  return parts.join(" · ");
}

/** Stable keys for memoized chart snapshots in PDF queue. */
export function marketingPdfSnapshotKey(parts: readonly (string | number | null | undefined)[]): string {
  return parts.map((p) => (p == null || p === "" ? "_" : String(p))).join("|");
}
