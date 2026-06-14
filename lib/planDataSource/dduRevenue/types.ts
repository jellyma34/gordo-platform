export type DduRevenueNormalizedRow = {
  segmentNorm: string;
  monthKey: string;
  planProject: number;
  planMonth: number;
  planCumulative: number;
  factMonth: number;
  factCumulative: number;
};

export type DduRevenueEntitySummary = {
  planMonth: number;
  planCumulative: number;
  planProject: number;
  factMonth: number;
  factCumulative: number;
  rawLabel: string;
};

export type DduRevenueCsvParseDiagnostics = {
  rawHeaders: string[];
  columnMapping: Record<string, string> | null;
  delimiter: string | null;
  csvType: "legacy_wide_table" | "legacy_revenue_wide_table" | "unknown";
  monthKeyUsed?: string;
  importedRootRows: number;
};

export type DduRevenueCsvParseResult =
  | {
      ok: true;
      rows: DduRevenueNormalizedRow[];
      warnings: string[];
      diagnostics: DduRevenueCsvParseDiagnostics;
      apartmentsSummary: DduRevenueEntitySummary | null;
      parkingSummary?: DduRevenueEntitySummary | null;
      storageSummary?: DduRevenueEntitySummary | null;
    }
  | {
      ok: false;
      error: string;
      warnings: string[];
      diagnostics: DduRevenueCsvParseDiagnostics;
    };

export type ParseDduRevenueCsvOptions = {
  dashboardPeriodKey: string;
  period: "month" | "quarter";
  reportAsOfYmd: string;
  fileName?: string;
};
