export type InstallmentForecastNormalizedRow = {
  paymentMonth: string;
  amount: number;
  contractId: string;
  objectType: string;
  segment: string;
};

export type InstallmentForecastCsvParseDiagnostics = {
  rawHeaders: string[];
  format: "long" | "wide" | "unknown";
  importedRows: number;
  delimiter: string | null;
};

export type InstallmentForecastCsvParseResult =
  | {
      ok: true;
      rows: InstallmentForecastNormalizedRow[];
      warnings?: string[];
      diagnostics: InstallmentForecastCsvParseDiagnostics;
    }
  | {
      ok: false;
      error: string;
      warnings?: string[];
      diagnostics?: InstallmentForecastCsvParseDiagnostics;
    };
