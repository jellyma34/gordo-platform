import { captureElementToCanvas, type CaptureOptions, type PdfExportMeta } from "@/utils/exportPdf";
import { waitForRenderComplete } from "@/utils/pdf/chartSnapshotUtils";
import { MARKETING_PDF_BLOCK_ATTR } from "@/utils/pdf/marketingPdfRenderProps";

export type PdfCaptureBlock = {
  element: HTMLElement;
  title?: string;
};

const snapshotCache = new Map<string, HTMLCanvasElement>();

export function clearPdfSnapshotCache(): void {
  snapshotCache.clear();
}

async function captureBlockCanvas(
  block: HTMLElement,
  options: CaptureOptions,
  cacheKey?: string,
): Promise<HTMLCanvasElement> {
  if (cacheKey && snapshotCache.has(cacheKey)) {
    return snapshotCache.get(cacheKey)!;
  }

  await waitForRenderComplete(block);
  const canvas = await captureElementToCanvas(block, options);
  if (cacheKey) snapshotCache.set(cacheKey, canvas);
  return canvas;
}

/** Sequential capture queue — one block at a time to avoid browser OOM. */
export async function runPdfExportQueue<T>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += 1) {
    await worker(items[i]!, i);
  }
}

export function collectMarketingPdfBlocks(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll(`[${MARKETING_PDF_BLOCK_ATTR}]`)].filter(
    (el): el is HTMLElement => el instanceof HTMLElement,
  );
}

export async function prepareMarketingPdfRoot(root: HTMLElement): Promise<PdfCaptureBlock[]> {
  await waitForRenderComplete(root);
  const blocks = collectMarketingPdfBlocks(root);
  return blocks.map((element) => ({
    element,
    title: element.getAttribute("data-pdf-section-title") ?? undefined,
  }));
}

export type ExportMarketingPdfBlocksOptions = CaptureOptions & {
  getBlockCacheKey?: (block: HTMLElement, index: number) => string | undefined;
};

export async function captureMarketingPdfBlockCanvas(
  block: HTMLElement,
  options: CaptureOptions = {},
  cacheKey?: string,
): Promise<HTMLCanvasElement> {
  return captureBlockCanvas(block, options, cacheKey);
}

export { type PdfExportMeta };
