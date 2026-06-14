export type ReducedAreaObjectType = "apartments" | "parking" | "storage" | "commercial" | "all";

export type ReducedAreaRoomType = "all" | "1" | "2" | "3" | "4";

export type ReducedAreaNormalizedRow = {
  segmentNorm: string;
  monthKey: string;
  planProject: number;
  planMonth: number;
  planCumulative: number;
  factMonth: number;
  factCumulative: number;
};

export type ReducedAreaEntitySummary = {
  planMonth: number;
  planCumulative: number;
  planProject: number;
  factMonth: number;
  factCumulative: number;
  rawLabel: string;
};

export type ReducedAreaProjectColumnKind = "reduced_area" | "object_area" | "plan_project";

export type ReducedAreaCsvParseDiagnostics = {
  rawHeaders: string[];
  columnMapping: Record<string, string> | null;
  delimiter: string | null;
  csvType: "legacy_wide_table" | "reduced_area_wide_table" | "unknown";
  monthKeyUsed?: string;
  importedRootRows: number;
  projectColumnKind?: ReducedAreaProjectColumnKind;
};

export type ReducedAreaCsvParseResult =
  | {
      ok: true;
      rows: ReducedAreaNormalizedRow[];
      warnings: string[];
      diagnostics: ReducedAreaCsvParseDiagnostics;
      apartmentsSummary: ReducedAreaEntitySummary | null;
      parkingSummary?: ReducedAreaEntitySummary | null;
      storageSummary?: ReducedAreaEntitySummary | null;
      projectColumnKind: ReducedAreaProjectColumnKind;
    }
  | {
      ok: false;
      error: string;
      warnings: string[];
      diagnostics: ReducedAreaCsvParseDiagnostics;
    };

export type ParseReducedAreaCsvOptions = {
  dashboardPeriodKey: string;
  period: "month" | "quarter";
  reportAsOfYmd: string;
  fileName?: string;
};
