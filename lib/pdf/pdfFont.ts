import type { jsPDF } from "jspdf";

export const PDF_FONT_FALLBACK = "helvetica";

const ROBOTO_REGULAR_VFS = "Roboto-Regular.ttf";
const ROBOTO_BOLD_VFS = "Roboto-Bold.ttf";
const ROBOTO_FAMILY = "Roboto";

const LOCAL_FONT_PATHS = {
  regular: "/fonts/Roboto-Regular.ttf",
  bold: "/fonts/Roboto-Bold.ttf",
} as const;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function applyHelveticaFallback(pdf: jsPDF): string {
  console.warn("[PDF] Roboto not found. Fallback to Helvetica.");
  console.log("[PDF] Font fallback: Helvetica");
  pdf.setFont(PDF_FONT_FALLBACK, "normal");
  return PDF_FONT_FALLBACK;
}

/** Loads Roboto from /public/fonts; never throws — falls back to Helvetica. */
export async function setupPdfUtf8Font(pdf: jsPDF): Promise<string> {
  try {
    const [regularRes, boldRes] = await Promise.all([
      fetch(LOCAL_FONT_PATHS.regular),
      fetch(LOCAL_FONT_PATHS.bold),
    ]);

    if (!regularRes.ok || !boldRes.ok) {
      return applyHelveticaFallback(pdf);
    }

    const [regularBuf, boldBuf] = await Promise.all([
      regularRes.arrayBuffer(),
      boldRes.arrayBuffer(),
    ]);

    const regularBytes = new Uint8Array(regularBuf);
    const boldBytes = new Uint8Array(boldBuf);
    if (regularBytes.length < 1000 || boldBytes.length < 1000) {
      return applyHelveticaFallback(pdf);
    }

    pdf.addFileToVFS(ROBOTO_REGULAR_VFS, bytesToBase64(regularBytes));
    pdf.addFont(ROBOTO_REGULAR_VFS, ROBOTO_FAMILY, "normal");
    pdf.addFileToVFS(ROBOTO_BOLD_VFS, bytesToBase64(boldBytes));
    pdf.addFont(ROBOTO_BOLD_VFS, ROBOTO_FAMILY, "bold");

    pdf.setFont(ROBOTO_FAMILY, "normal");
    console.log("[PDF] Font loaded: Roboto");
    return ROBOTO_FAMILY;
  } catch {
    return applyHelveticaFallback(pdf);
  }
}
