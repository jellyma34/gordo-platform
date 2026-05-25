export type AveragePricePerSqmObjectType = "apartments" | "parking" | "storage" | "commercial" | "all";

export type AveragePricePerSqmRoomType = "all" | "1" | "2" | "3" | "4";

export type AveragePricePerSqmNormalizedRow = {
  segmentNorm: string;
  monthKey: string;
  planProject: number;
  planMonth: number;
  planCumulative: number;
  factMonth: number;
  factCumulative: number;
};

export type AveragePricePerSqmEntitySummary = {
  planMonth: number;
  planCumulative: number;
  planProject: number;
  factMonth: number;
  factCumulative: number;
  rawLabel: string;
};

export type AveragePriceProjectColumnKind = "object" | "sqm" | "plan_project";

export type AveragePricePerSqmCsvParseDiagnostics = {
  rawHeaders: string[];
  columnMapping: Record<string, string> | null;
  delimiter: string | null;
  csvType: "legacy_wide_table" | "average_price_wide_table" | "unknown";
  monthKeyUsed?: string;
  importedRootRows: number;
  projectColumnKind?: AveragePriceProjectColumnKind;
};

export type AveragePricePerSqmCsvParseResult =
  | {
      ok: true;
      rows: AveragePricePerSqmNormalizedRow[];
      warnings: string[];
      diagnostics: AveragePricePerSqmCsvParseDiagnostics;
      apartmentsSummary: AveragePricePerSqmEntitySummary | null;
      parkingSummary?: AveragePricePerSqmEntitySummary | null;
      storageSummary?: AveragePricePerSqmEntitySummary | null;
      projectColumnKind: AveragePriceProjectColumnKind;
    }
  | {
      ok: false;
      error: string;
      warnings: string[];
      diagnostics: AveragePricePerSqmCsvParseDiagnostics;
    };

export type ParseAveragePricePerSqmCsvOptions = {
  dashboardPeriodKey: string;
  period: "month" | "quarter";
  reportAsOfYmd: string;
  fileName?: string;
};
