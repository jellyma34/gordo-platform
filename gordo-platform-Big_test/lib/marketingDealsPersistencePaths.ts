import path from "path";

export const MARKETING_DEALS_DATA_DIR = path.join(process.cwd(), "data");
export const MARKETING_DEALS_CURRENT_FILE = path.join(MARKETING_DEALS_DATA_DIR, "marketing-deals-current.json");
export const MARKETING_DEALS_VERSIONS_FILE = path.join(MARKETING_DEALS_DATA_DIR, "marketing-deals-versions.json");
export const MARKETING_DEALS_SNAPS_DIR = path.join(MARKETING_DEALS_DATA_DIR, "marketing-deals-snaps");

export type MarketingDealsCurrentFileBody = {
  updatedAt: string;
  payload: unknown;
};

export type MarketingDealVersionMeta = {
  id: string;
  savedAt: string;
  mode: "replace" | "append";
  rowCount: number;
};

export type MarketingDealsVersionsFileBody = {
  entries: MarketingDealVersionMeta[];
};

export const MARKETING_DEALS_VERSION_HISTORY_MAX = 25;
