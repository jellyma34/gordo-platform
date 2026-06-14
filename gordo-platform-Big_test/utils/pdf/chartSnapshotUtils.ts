const DEFAULT_CHART_WAIT_MS = 12_000;
const CHART_POLL_MS = 80;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function svgLooksReady(svg: SVGSVGElement): boolean {
  const rect = svg.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return false;
  const hasGeometry = svg.querySelector("path, line, rect, circle, polyline, polygon");
  return Boolean(hasGeometry);
}

/** Wait until Recharts SVG nodes inside root have non-zero size and geometry. */
export async function waitForChartsInElement(
  root: HTMLElement,
  timeoutMs = DEFAULT_CHART_WAIT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const svgs = [...root.querySelectorAll("svg.recharts-surface, svg")].filter(
      (n): n is SVGSVGElement => n instanceof SVGSVGElement,
    );

    if (svgs.length === 0) {
      await sleep(CHART_POLL_MS);
      continue;
    }

    const ready = svgs.every(svgLooksReady);
    if (ready) {
      await sleep(120);
      return;
    }

    await sleep(CHART_POLL_MS);
  }
}

/** Fonts, images, charts, layout — call before html2canvas capture. */
export async function waitForRenderComplete(root: HTMLElement, timeoutMs = DEFAULT_CHART_WAIT_MS): Promise<void> {
  if (typeof document !== "undefined" && "fonts" in document) {
    try {
      await document.fonts.ready;
    } catch {
      /* ignore */
    }
  }

  const images = [...root.querySelectorAll("img")];
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  );

  await waitForChartsInElement(root, timeoutMs);
  await sleep(60);
}
