import type { AnalyticsChartMode } from "@/components/marketing/analytics/AnalyticsChartModeToggle";
import type { MarketingTab } from "@/components/marketing/marketingTypes";
import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import type { ApartmentRoomTypeFilterKey } from "@/lib/roomTypeNormalized";
import type { SalesPlanObjectTypeKey } from "@/lib/salesPlanByObjectType";

/** Shared props for marketing charts rendered in PDF (forced state, no interactive UI). */
export type MarketingPdfRenderProps = {
  pdfRender?: boolean;
  forcedObjectType?: SalesPlanObjectTypeKey;
  forcedRoomType?: ApartmentRoomTypeFilterKey;
  forcedChartMode?: AnalyticsChartMode;
  forceExpanded?: boolean;
  hideInteractiveControls?: boolean;
};

export type MarketingPdfReportContext = {
  activeTab: MarketingTab;
  period: MarketingPeriodGranularity;
  objectId: string;
  reportTitle: string;
};

export const MARKETING_PDF_BLOCK_ATTR = "data-marketing-pdf-block";
export const MARKETING_PDF_ROOT_ATTR = "data-marketing-pdf-export-root";
