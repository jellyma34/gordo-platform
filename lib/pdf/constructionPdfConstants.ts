export type ConstructionSectionType = "gpr" | "tenders" | "tmc";

export const CONSTRUCTION_PDF_ROOT_ATTR = "data-construction-pdf-root";
export const PDF_CHART_BLOCK_ATTR = "data-pdf-chart-block";
export const PDF_SECTION_TITLE_ATTR = "data-pdf-section-title";
export const PDF_CHART_META_ATTR = "data-pdf-chart-meta";
export const PDF_KPI_LINE_ATTR = "data-pdf-kpi-line";
export const PDF_KPI_LINES_ATTR = "data-pdf-kpi-lines";
export const PDF_KPI_CAPTURE_ATTR = "data-pdf-kpi-capture";
export const PDF_REPORT_PERIOD_ATTR = "data-pdf-report-period";
export const PDF_SUMMARY_JSON_ATTR = "data-pdf-summary";
export const PDF_FINAL_JSON_ATTR = "data-pdf-final";

export const CONSTRUCTION_SECTION_REPORT_LABEL: Record<ConstructionSectionType, string> = {
  gpr: "ГПР",
  tenders: "Тендеры",
  tmc: "ТМЦ",
};

export const CONSTRUCTION_PROJECT_NAME = "ЖК Верба";
export const CONSTRUCTION_PROJECT_PHASE = "1 очередь строительства";
export const CONSTRUCTION_COMPANY_NAME = "ГОРДО Девелопмент";
