import type { jsPDF } from "jspdf";

export type PdfExportMeta = {
  projectName: string;
  projectPhase?: string;
  reportTitle: string;
  periodLabel: string;
  objectLabel: string;
  generatedAt: Date;
  fileName: string;
};

export type CaptureOptions = {
  scale?: number;
  backgroundColor?: string;
};

const DEFAULT_SCALE = 2;
const PDF_MARGIN_MM = 10;

async function loadPdfLibs() {
  const [html2canvasMod, jspdfMod] = await Promise.all([import("html2canvas"), import("jspdf")]);
  return { html2canvas: html2canvasMod.default, jsPDF: jspdfMod.jsPDF };
}

function formatRuDate(d: Date): string {
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
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

/** Скрывает элементы, не входящие в отчёт, и подготавливает SVG для html2canvas. */
function prepareCloneForCapture(doc: Document, root: HTMLElement) {
  doc.querySelectorAll("[data-pdf-exclude]").forEach((el) => {
    if (el instanceof HTMLElement) el.style.display = "none";
  });

  doc.querySelectorAll(".recharts-tooltip-wrapper, .recharts-active-dot").forEach((el) => {
    if (el instanceof HTMLElement) el.style.display = "none";
  });

  root.querySelectorAll("svg *").forEach((node) => {
    if (!(node instanceof SVGElement)) return;
    const computed = doc.defaultView?.getComputedStyle(node);
    if (!computed) return;
    if (computed.fill && computed.fill !== "none" && !node.getAttribute("fill")) {
      node.setAttribute("fill", computed.fill);
    }
    if (computed.stroke && computed.stroke !== "none" && !node.getAttribute("stroke")) {
      node.setAttribute("stroke", computed.stroke);
    }
    if (computed.strokeWidth && !node.getAttribute("stroke-width")) {
      node.setAttribute("stroke-width", computed.strokeWidth);
    }
  });
}

export async function captureElementToCanvas(
  element: HTMLElement,
  options: CaptureOptions = {},
): Promise<HTMLCanvasElement> {
  const { html2canvas } = await loadPdfLibs();
  const scale = options.scale ?? DEFAULT_SCALE;

  return html2canvas(element, {
    scale,
    backgroundColor: options.backgroundColor ?? "#ffffff",
    logging: false,
    useCORS: true,
    allowTaint: true,
    scrollX: 0,
    scrollY: -window.scrollY,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
    onclone: (clonedDoc, clonedElement) => {
      if (clonedElement instanceof HTMLElement) {
        clonedElement.style.background = "#ffffff";
        clonedElement.style.boxShadow = "none";
      }
      prepareCloneForCapture(clonedDoc, clonedElement as HTMLElement);
    },
  });
}

async function loadLogoPngDataUrl(): Promise<string | null> {
  try {
    const res = await fetch("/images/gordo_logo_rgb_03.svg");
    if (!res.ok) return null;
    const svgText = await res.text();
    const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("logo load failed"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 520;
    canvas.height = 120;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

function addCoverPage(pdf: jsPDF, meta: PdfExportMeta, logoDataUrl: string | null) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = PDF_MARGIN_MM;
  let y = margin + 4;

  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, pageWidth, pdf.internal.pageSize.getHeight(), "F");

  if (logoDataUrl) {
    pdf.addImage(logoDataUrl, "PNG", margin, y, 42, 10);
    y += 14;
  }

  pdf.setTextColor(30, 41, 59);
  pdf.setFontSize(20);
  pdf.text(meta.projectName, margin, y);
  y += 9;

  if (meta.projectPhase) {
    pdf.setFontSize(11);
    pdf.setTextColor(100, 116, 139);
    pdf.text(meta.projectPhase, margin, y);
    y += 8;
  }

  pdf.setDrawColor(226, 232, 240);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 10;

  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(14);
  pdf.text("Маркетинговый отчёт", margin, y);
  y += 8;

  pdf.setFontSize(12);
  pdf.setTextColor(51, 65, 85);
  pdf.text(meta.reportTitle, margin, y);
  y += 12;

  pdf.setFontSize(10);
  pdf.setTextColor(71, 85, 105);
  const lines = [
    `Дата формирования: ${formatRuDateTime(meta.generatedAt)}`,
    `Период аналитики: ${meta.periodLabel}`,
    `Объект / ЖК: ${meta.objectLabel}`,
  ];
  for (const line of lines) {
    pdf.text(line, margin, y);
    y += 6;
  }
}

function addCanvasMultipage(pdf: jsPDF, canvas: HTMLCanvasElement, startNewPage: boolean) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PDF_MARGIN_MM * 2;
  const contentHeight = pageHeight - PDF_MARGIN_MM * 2;

  const imgWidth = contentWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const imgData = canvas.toDataURL("image/jpeg", 0.92);

  let heightLeft = imgHeight;
  let position = PDF_MARGIN_MM;

  if (startNewPage) pdf.addPage();

  pdf.addImage(imgData, "JPEG", PDF_MARGIN_MM, position, imgWidth, imgHeight);
  heightLeft -= contentHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight + PDF_MARGIN_MM;
    pdf.addPage();
    pdf.addImage(imgData, "JPEG", PDF_MARGIN_MM, position, imgWidth, imgHeight);
    heightLeft -= contentHeight;
  }
}

export async function exportElementToPdf(
  element: HTMLElement,
  meta: PdfExportMeta,
  options?: CaptureOptions,
): Promise<void> {
  const { jsPDF } = await loadPdfLibs();
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const logoDataUrl = await loadLogoPngDataUrl();

  addCoverPage(pdf, meta, logoDataUrl);

  const prevScroll = window.scrollY;
  window.scrollTo(0, 0);
  try {
    const canvas = await captureElementToCanvas(element, options);
    addCanvasMultipage(pdf, canvas, true);
    pdf.save(meta.fileName);
  } finally {
    window.scrollTo(0, prevScroll);
  }
}

export function marketingReportFileName(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `marketing-report-${y}-${m}.pdf`;
}

export function marketingPeriodLabel(period: "month" | "quarter"): string {
  return period === "quarter" ? "Квартал" : "Месяц";
}

export { formatRuDate };
