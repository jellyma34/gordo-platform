import type { jsPDF } from "jspdf";

import { setupPdfUtf8Font } from "@/lib/pdf/pdfFont";
import { captureElementToCanvas } from "@/utils/exportPdf";
import { waitForRenderComplete } from "@/utils/pdf/chartSnapshotUtils";
import {
  CONSTRUCTION_COMPANY_NAME,
  CONSTRUCTION_PDF_ROOT_ATTR,
  CONSTRUCTION_PROJECT_NAME,
  CONSTRUCTION_PROJECT_PHASE,
  CONSTRUCTION_SECTION_REPORT_LABEL,
  PDF_CHART_BLOCK_ATTR,
  PDF_CHART_META_ATTR,
  PDF_FINAL_JSON_ATTR,
  PDF_KPI_CAPTURE_ATTR,
  PDF_KPI_LINE_ATTR,
  PDF_REPORT_PERIOD_ATTR,
  PDF_SECTION_TITLE_ATTR,
  PDF_SUMMARY_JSON_ATTR,
  type ConstructionSectionType,
} from "@/lib/pdf/constructionPdfConstants";

const PDF_MARGIN_MM = 10;
const CHART_CAPTURE_BG = "#ffffff";

type PdfTable = {
  headers: string[];
  rows: Array<Array<string | number | null>>;
};

type PdfChartMeta = {
  /** Краткое описание графика (1–2 предложения). */
  description?: string;
  /** Источник данных: "Импорт ТМЦ" / "Импорт тендеров" / "Импорт ГПР" */
  source?: string;
  /** Период, который относится именно к этому графику. */
  period?: string;
  /** Таблица исходных данных под графиком. */
  table?: PdfTable;
};

type PdfKeyValueRow = { label: string; value: string };

export type SectionPdfChartBlock = {
  title: string;
  element: HTMLElement;
  meta?: PdfChartMeta;
};

export type SectionPdfExportInput = {
  sectionType: ConstructionSectionType;
  sectionTitle: string;
  reportPeriodLabel?: string;
  kpiLines: string[];
  kpiCaptureElement: HTMLElement | null;
  summaryRows?: PdfKeyValueRow[];
  finalRows?: PdfKeyValueRow[];
  charts: SectionPdfChartBlock[];
  generatedAt?: Date;
};

async function loadPdfLibs() {
  const { jsPDF } = await import("jspdf");
  return { jsPDF };
}

function formatRuDateTime(d: Date): string {
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function constructionSectionFileName(
  sectionType: ConstructionSectionType,
  date = new Date(),
): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const label = CONSTRUCTION_SECTION_REPORT_LABEL[sectionType];
  return `ЖК_Верба_${label}_${y}-${m}-${d}.pdf`;
}

export function collectSectionPdfFromDom(
  sectionType: ConstructionSectionType,
): SectionPdfExportInput | null {
  const root = document.querySelector(`[${CONSTRUCTION_PDF_ROOT_ATTR}="${sectionType}"]`);
  if (!(root instanceof HTMLElement)) return null;

  const reportPeriodLabel = root.getAttribute(PDF_REPORT_PERIOD_ATTR)?.trim() || undefined;

  const kpiLines = [...root.querySelectorAll(`[${PDF_KPI_LINE_ATTR}]`)]
    .map((el) => el.textContent?.trim() ?? "")
    .filter(Boolean);

  const kpiCapture = root.querySelector(`[${PDF_KPI_CAPTURE_ATTR}]`);
  const kpiCaptureElement = kpiCapture instanceof HTMLElement ? kpiCapture : null;

  const summaryRaw = root.getAttribute(PDF_SUMMARY_JSON_ATTR);
  const summaryRows =
    summaryRaw && summaryRaw.trim().length > 0 ? (JSON.parse(decodeURIComponent(summaryRaw)) as PdfKeyValueRow[]) : undefined;

  const finalRaw = root.getAttribute(PDF_FINAL_JSON_ATTR);
  const finalRows =
    finalRaw && finalRaw.trim().length > 0 ? (JSON.parse(decodeURIComponent(finalRaw)) as PdfKeyValueRow[]) : undefined;

  const chartElements = [...root.querySelectorAll(`[${PDF_CHART_BLOCK_ATTR}]`)].filter(
    (el): el is HTMLElement => el instanceof HTMLElement,
  );

  const charts: SectionPdfChartBlock[] = chartElements.map((element) => {
    const title = element.getAttribute(PDF_SECTION_TITLE_ATTR)?.trim() || "График";
    const rawMeta = element.getAttribute(PDF_CHART_META_ATTR);
    const meta =
      rawMeta && rawMeta.trim().length > 0 ? (JSON.parse(decodeURIComponent(rawMeta)) as PdfChartMeta) : undefined;
    return { title, element, meta };
  });

  return {
    sectionType,
    sectionTitle: CONSTRUCTION_SECTION_REPORT_LABEL[sectionType],
    reportPeriodLabel,
    kpiLines,
    kpiCaptureElement,
    summaryRows,
    finalRows,
    charts,
    generatedAt: new Date(),
  };
}

function addConstructionCoverPage(pdf: jsPDF, input: SectionPdfExportInput) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = PDF_MARGIN_MM;
  const generatedAt = input.generatedAt ?? new Date();
  let y = margin + 6;

  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, pageWidth, pdf.internal.pageSize.getHeight(), "F");

  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(18);
  pdf.text(CONSTRUCTION_COMPANY_NAME, margin, y);
  y += 10;

  pdf.setFontSize(14);
  pdf.text(CONSTRUCTION_PROJECT_NAME, margin, y);
  y += 8;

  pdf.setFontSize(11);
  pdf.setTextColor(71, 85, 105);
  pdf.text(CONSTRUCTION_PROJECT_PHASE, margin, y);
  y += 14;

  pdf.setDrawColor(226, 232, 240);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 12;

  pdf.setFontSize(12);
  pdf.setTextColor(30, 41, 59);
  pdf.text(`Отчёт по разделу: ${input.sectionTitle}`, margin, y);
  y += 8;

  pdf.setFontSize(10);
  pdf.setTextColor(51, 65, 85);
  pdf.text(`Дата формирования: ${formatRuDateTime(generatedAt)}`, margin, y);
  y += 7;

  pdf.setFontSize(10);
  pdf.setTextColor(51, 65, 85);
  pdf.text(`Отчётный период: ${input.reportPeriodLabel ?? "—"}`, margin, y);
}

function parseKpiLinesToKeyValue(lines: string[]): PdfKeyValueRow[] {
  const rows: PdfKeyValueRow[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx > 0) {
      rows.push({ label: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() });
    } else {
      rows.push({ label: line, value: "" });
    }
  }
  return rows;
}

function drawSimpleTable(
  pdf: jsPDF,
  rows: PdfKeyValueRow[],
  opts: { title: string; startNewPage: boolean; fontFamily: string },
) {
  if (rows.length === 0) return;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PDF_MARGIN_MM * 2;
  const col1 = Math.round(contentWidth * 0.58);
  const col2 = contentWidth - col1;

  if (opts.startNewPage) pdf.addPage();

  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, pageWidth, pageHeight, "F");

  let y = PDF_MARGIN_MM + 2;
  pdf.setFont(opts.fontFamily, "bold");
  pdf.setFontSize(15);
  pdf.setTextColor(15, 23, 42);
  pdf.text(opts.title, PDF_MARGIN_MM, y + 6);
  y += 14;

  // header line
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.4);
  pdf.line(PDF_MARGIN_MM, y, pageWidth - PDF_MARGIN_MM, y);
  y += 4;

  pdf.setFont(opts.fontFamily, "normal");
  pdf.setFontSize(10.5);
  pdf.setTextColor(30, 41, 59);

  for (const r of rows) {
    const leftLines = pdf.splitTextToSize(r.label, col1) as string[];
    const rightLines = pdf.splitTextToSize(r.value || "—", col2) as string[];
    const rowHeight = Math.max(leftLines.length, rightLines.length) * 5.2;

    if (y + rowHeight + 10 > pageHeight - PDF_MARGIN_MM) {
      pdf.addPage();
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pageWidth, pageHeight, "F");
      y = PDF_MARGIN_MM + 2;
    }

    pdf.text(leftLines, PDF_MARGIN_MM, y);
    pdf.text(rightLines, PDF_MARGIN_MM + col1 + 3, y);
    y += rowHeight;

    pdf.setDrawColor(241, 245, 249);
    pdf.line(PDF_MARGIN_MM, y + 1.2, pageWidth - PDF_MARGIN_MM, y + 1.2);
    y += 5;
  }
}

function drawDataTable(
  pdf: jsPDF,
  table: PdfTable,
  opts: { title: string; startNewPage: boolean; fontFamily: string },
): void {
  if (!table.headers.length || !table.rows.length) return;

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PDF_MARGIN_MM * 2;

  if (opts.startNewPage) pdf.addPage();
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, pageWidth, pageHeight, "F");

  let y = PDF_MARGIN_MM + 2;
  pdf.setFont(opts.fontFamily, "bold");
  pdf.setFontSize(14);
  pdf.setTextColor(15, 23, 42);
  pdf.text(opts.title, PDF_MARGIN_MM, y + 6);
  y += 14;

  const cols = table.headers.length;
  const colGap = 2.2;
  const colWidth = (contentWidth - colGap * (cols - 1)) / cols;
  const rowLineHeight = 5.1;

  const drawRow = (cells: string[], isHeader: boolean) => {
    const linesPerCell = cells.map((c) => pdf.splitTextToSize(c, colWidth) as string[]);
    const rowLines = Math.max(...linesPerCell.map((l) => l.length));
    const height = rowLines * rowLineHeight + 2.5;

    if (y + height + 12 > pageHeight - PDF_MARGIN_MM) {
      pdf.addPage();
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pageWidth, pageHeight, "F");
      y = PDF_MARGIN_MM + 2;
    }

    if (isHeader) {
      pdf.setFont(opts.fontFamily, "bold");
      pdf.setTextColor(30, 41, 59);
    } else {
      pdf.setFont(opts.fontFamily, "normal");
      pdf.setTextColor(30, 41, 59);
    }

    for (let i = 0; i < cols; i += 1) {
      const x = PDF_MARGIN_MM + i * (colWidth + colGap);
      pdf.text(linesPerCell[i] ?? [""], x, y);
    }

    y += height;
    pdf.setDrawColor(241, 245, 249);
    pdf.setLineWidth(0.3);
    pdf.line(PDF_MARGIN_MM, y, pageWidth - PDF_MARGIN_MM, y);
    y += 4;
  };

  drawRow(table.headers.map((h) => h || "—"), true);
  for (const r of table.rows) {
    const cells = r.map((v) => (v == null ? "—" : String(v)));
    while (cells.length < cols) cells.push("—");
    drawRow(cells.slice(0, cols), false);
  }
}

function addCanvasBlockPages(
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  startNewPage: boolean,
  title?: string,
  clearPage = true,
): void {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PDF_MARGIN_MM * 2;
  const contentHeight = pageHeight - PDF_MARGIN_MM * 2;
  const titleReserve = title ? 10 : 0;
  const usableHeight = contentHeight - titleReserve;

  let imgWidth = contentWidth;
  let imgHeight = (canvas.height * imgWidth) / canvas.width;

  if (imgHeight > usableHeight) {
    const scale = usableHeight / imgHeight;
    imgWidth *= scale;
    imgHeight *= scale;
  }

  const imgData = canvas.toDataURL("image/jpeg", 0.92);

  if (startNewPage) pdf.addPage();

  if (clearPage) {
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");
  }

  let y = PDF_MARGIN_MM;
  if (title) {
    pdf.setFontSize(12);
    pdf.setTextColor(15, 23, 42);
    const lines = pdf.splitTextToSize(title, contentWidth) as string[];
    pdf.text(lines, PDF_MARGIN_MM, y + 4);
    y += titleReserve;
  }

  pdf.addImage(imgData, "JPEG", PDF_MARGIN_MM, y, imgWidth, imgHeight);
}

async function captureBlockCanvas(element: HTMLElement): Promise<HTMLCanvasElement> {
  element.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
  await new Promise((r) => setTimeout(r, 250));
  await waitForRenderComplete(element);
  return captureElementToCanvas(element, {
    scale: 2.5,
    backgroundColor: CHART_CAPTURE_BG,
  });
}

function drawChartBlock(
  pdf: jsPDF,
  chart: SectionPdfChartBlock,
  fontFamily: string,
) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PDF_MARGIN_MM * 2;
  let y = PDF_MARGIN_MM + 2;

  pdf.addPage();
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, pageWidth, pageHeight, "F");

  pdf.setFont(fontFamily, "bold");
  pdf.setFontSize(14);
  pdf.setTextColor(15, 23, 42);
  pdf.text(chart.title, PDF_MARGIN_MM, y + 6);
  y += 12;

  pdf.setFont(fontFamily, "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(51, 65, 85);
  if (chart.meta?.description) {
    const descLines = pdf.splitTextToSize(chart.meta.description, contentWidth) as string[];
    pdf.text(descLines, PDF_MARGIN_MM, y);
    y += descLines.length * 5.2 + 4;
  } else {
    y += 2;
  }

  return { y, pageWidth, pageHeight, contentWidth };
}

function addFooterToAllPages(pdf: jsPDF, sectionTitle: string, fontFamily: string) {
  const total = pdf.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    pdf.setPage(page);
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    pdf.setFont(fontFamily, "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(100, 116, 139);
    const text = `${CONSTRUCTION_PROJECT_NAME} | ${sectionTitle} | Страница ${page} из ${total}`;
    pdf.text(text, PDF_MARGIN_MM, pageHeight - 6);
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.3);
    pdf.line(PDF_MARGIN_MM, pageHeight - 10, pageWidth - PDF_MARGIN_MM, pageHeight - 10);
  }
}

export async function exportSectionPdf(input: SectionPdfExportInput): Promise<void> {
  const { jsPDF } = await loadPdfLibs();
  const fileName = constructionSectionFileName(input.sectionType, input.generatedAt);

  console.log(`[PDF] Start export: ${input.sectionType.toUpperCase()}`);
  console.log(`[PDF] Charts found: ${input.charts.length}`);

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const prevScroll = window.scrollY;
  window.scrollTo(0, 0);

  try {
    const fontFamily = await setupPdfUtf8Font(pdf);
    addConstructionCoverPage(pdf, input);

    const summaryRows =
      input.summaryRows && input.summaryRows.length > 0
        ? input.summaryRows
        : parseKpiLinesToKeyValue(input.kpiLines);
    drawSimpleTable(pdf, summaryRows, { title: "Сводка", startNewPage: true, fontFamily });

    for (const chart of input.charts) {
      drawChartBlock(pdf, chart, fontFamily);
      const canvas = await captureBlockCanvas(chart.element);
      // capture image (fits page; never split chart mid-page)
      addCanvasBlockPages(pdf, canvas, false, undefined, false);

      // Table under chart (new page for readability)
      const table = chart.meta?.table;
      if (table && table.headers.length > 0 && table.rows.length > 0) {
        drawDataTable(pdf, table, {
          title: "Таблица исходных данных",
          startNewPage: true,
          fontFamily,
        });
      }

      // Service info
      const source = chart.meta?.source ?? "—";
      const period = chart.meta?.period ?? input.reportPeriodLabel ?? "—";
      pdf.addPage();
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight(), "F");
      pdf.setFont(fontFamily, "bold");
      pdf.setFontSize(13);
      pdf.setTextColor(15, 23, 42);
      pdf.text("Служебная информация", PDF_MARGIN_MM, PDF_MARGIN_MM + 8);
      pdf.setFont(fontFamily, "normal");
      pdf.setFontSize(10.5);
      pdf.setTextColor(30, 41, 59);
      pdf.text(`Источник данных: ${source}`, PDF_MARGIN_MM, PDF_MARGIN_MM + 20);
      pdf.text(`Период: ${period}`, PDF_MARGIN_MM, PDF_MARGIN_MM + 28);
    }

    const finalRows = input.finalRows && input.finalRows.length > 0 ? input.finalRows : [];
    if (finalRows.length > 0) {
      drawSimpleTable(pdf, finalRows, { title: "ИТОГИ", startNewPage: true, fontFamily });
    }

    addFooterToAllPages(pdf, input.sectionTitle, fontFamily);
    pdf.save(fileName);
    console.log("[PDF] Export complete");
  } finally {
    window.scrollTo(0, prevScroll);
  }
}

export async function exportConstructionSectionPdf(
  sectionType: ConstructionSectionType,
): Promise<void> {
  const payload = collectSectionPdfFromDom(sectionType);
  if (!payload) {
    throw new Error(`Раздел «${CONSTRUCTION_SECTION_REPORT_LABEL[sectionType]}» не найден на странице`);
  }
  if (payload.kpiLines.length === 0 && !payload.kpiCaptureElement && payload.charts.length === 0) {
    throw new Error("Нет данных для формирования PDF-отчёта");
  }
  await exportSectionPdf(payload);
}
