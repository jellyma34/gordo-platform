export type TotalAreaObjectType = "apartments" | "parking" | "storage" | "commercial" | "all";

export type TotalAreaRoomType = "all" | "1" | "2" | "3" | "4";

export type TotalAreaNormalizedRow = {
  segmentNorm: string;
  monthKey: string;
  planProject: number;
  planMonth: number;
  planCumulative: number;
  factMonth: number;
  factCumulative: number;
};

export type TotalAreaEntitySummary = {
  planMonth: number;
  planCumulative: number;
  planProject: number;
  factMonth: number;
  factCumulative: number;
  rawLabel: string;
};

export type TotalAreaProjectColumnKind = "total_area" | "object_area" | "plan_project";

export type TotalAreaCsvParseDiagnostics = {
  rawHeaders: string[];
  columnMapping: Record<string, string> | null;
  delimiter: string | null;
  csvType: "legacy_wide_table" | "total_area_wide_table" | "unknown";
  monthKeyUsed?: string;
  importedRootRows: number;
  projectColumnKind?: TotalAreaProjectColumnKind;
};

export type TotalAreaCsvParseResult =
  | {
      ok: true;
      rows: TotalAreaNormalizedRow[];
      warnings: string[];
      diagnostics: TotalAreaCsvParseDiagnostics;
      apartmentsSummary: TotalAreaEntitySummary | null;
      parkingSummary?: TotalAreaEntitySummary | null;
      storageSummary?: TotalAreaEntitySummary | null;
      projectColumnKind: TotalAreaProjectColumnKind;
    }
  | {
      ok: false;
      error: string;
      warnings: string[];
      diagnostics: TotalAreaCsvParseDiagnostics;
    };

export type ParseTotalAreaCsvOptions = {
  dashboardPeriodKey: string;
  period: "month" | "quarter";
  reportAsOfYmd: string;
  fileName?: string;
};
