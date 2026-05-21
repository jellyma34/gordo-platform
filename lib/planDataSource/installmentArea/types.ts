export type InstallmentAreaCsvNormalizedRow = {
  segmentNorm: string;
  monthKey: string;
  projectArea: number;
  planMonthArea: number;
  planCumulativeArea: number;
  factMonthArea: number;
  factCumulativeArea: number;
};

export type InstallmentAreaApartmentsSummary = {
  planMonthArea: number;
  planCumulativeArea: number;
  projectArea: number;
  factMonthArea: number;
  factCumulativeArea: number;
  rawLabel: string;
};

export type InstallmentAreaCsvParseDiagnostics = {
  rawHeaders: string[];
  columnMapping: Record<string, string> | null;
  delimiter: string | null;
  csvType: "legacy_wide_table" | "legacy_area_wide_table" | "unknown";
  monthKeyUsed?: string;
  importedRootRows: number;
};

export type InstallmentAreaCsvParseResult =
  | {
      ok: true;
      rows: InstallmentAreaCsvNormalizedRow[];
      warnings: string[];
      diagnostics: InstallmentAreaCsvParseDiagnostics;
      apartmentsSummary: InstallmentAreaApartmentsSummary | null;
    }
  | {
      ok: false;
      error: string;
      warnings: string[];
      diagnostics: InstallmentAreaCsvParseDiagnostics;
    };

export type ParseInstallmentAreaCsvOptions = {
  dashboardPeriodKey: string;
  period: "month" | "quarter";
  reportAsOfYmd: string;
  fileName?: string;
};
