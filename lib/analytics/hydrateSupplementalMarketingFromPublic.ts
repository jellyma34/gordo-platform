"use client";

/**
 * @deprecated Имя сохранено для совместимости импортов.
 * Загрузка идёт через server storage API (+ fallback static CSV).
 */
export {
  hydrateSupplementalMarketingDatasets as hydrateSupplementalMarketingFromPublic,
} from "@/lib/analytics/hydrateMarketingFromServer";

export type { SupplementalMarketingPublicDatasets } from "@/lib/analytics/hydrateSupplementalMarketingTypes";
