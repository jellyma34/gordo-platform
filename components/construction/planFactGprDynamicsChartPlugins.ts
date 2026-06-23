import type { BarElement, Chart as ChartJS, Plugin } from "chart.js";

export type PlanFactMonthTodayLineOpts = { x: number | null };

export type PlanFactFactPercentLabelOpts = {
  labels: string[];
  factRanges: Array<[number, number] | null>;
};

const TODAY_LABEL_TOP_OFFSET_PX = 4;
const TODAY_OVERLAP_GAP_PX = 30;

function barSpan(el: BarElement): { left: number; right: number; center: number } {
  const left = Math.min(el.base, el.x);
  const right = Math.max(el.base, el.x);
  return { left, right, center: (left + right) / 2 };
}

/** Вертикаль «Сегодня» — подпись над полосами и процентами. */
export const planFactMonthTodayLinePlugin: Plugin<"bar"> = {
  id: "planFactMonthToday",
  beforeDatasetsDraw(chart: ChartJS<"bar">) {
    const opts = (chart.options.plugins as { planFactMonthToday?: PlanFactMonthTodayLineOpts } | undefined)
      ?.planFactMonthToday;
    if (!opts || opts.x == null || !Number.isFinite(opts.x) || !chart.scales.x) return;

    const xScale = chart.scales.x;
    const x = xScale.getPixelForValue(opts.x);
    const { ctx, chartArea } = chart;
    if (!Number.isFinite(x) || x < chartArea.left || x > chartArea.right) return;

    const label = "Сегодня";
    const xi = Math.round(x) + 0.5;
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = "rgba(163, 179, 199, 0.52)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 5]);
    ctx.moveTo(xi, chartArea.top);
    ctx.lineTo(xi, chartArea.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = "600 10px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    const textY = chartArea.top - TODAY_LABEL_TOP_OFFSET_PX;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(15, 23, 42, 0.88)";
    ctx.lineWidth = 3;
    ctx.strokeText(label, x, textY);
    ctx.fillStyle = "rgba(226, 232, 240, 0.92)";
    ctx.fillText(label, x, textY);
    ctx.restore();
  },
};

/** Подпись % факта — по центру фактической полосы, без пересечения с «Сегодня». */
export const planFactFactPercentLabelPlugin: Plugin<"bar"> = {
  id: "planFactFactPercentLabels",
  afterDatasetsDraw(chart: ChartJS<"bar">) {
    const opts = (
      chart.options.plugins as { planFactFactPercentLabels?: PlanFactFactPercentLabelOpts } | undefined
    )?.planFactFactPercentLabels;
    if (!opts?.labels?.length) return;

    const todayOpts = (
      chart.options.plugins as { planFactMonthToday?: PlanFactMonthTodayLineOpts } | undefined
    )?.planFactMonthToday;
    let todayPixel: number | null = null;
    if (todayOpts?.x != null && Number.isFinite(todayOpts.x) && chart.scales.x) {
      todayPixel = chart.scales.x.getPixelForValue(todayOpts.x);
    }

    const { ctx, chartArea } = chart;
    const factMeta = chart.getDatasetMeta(1);
    const planMeta = chart.getDatasetMeta(0);

    ctx.save();
    ctx.font = "600 10px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.textBaseline = "middle";

    for (let i = 0; i < opts.labels.length; i++) {
      const text = opts.labels[i];
      if (!text) continue;

      const factEl = factMeta.data[i] as BarElement | undefined;
      const planEl = planMeta.data[i] as BarElement | undefined;
      let xPos: number;
      let yPos: number;
      const hasFactBar = Boolean(factEl && opts.factRanges[i] && Number.isFinite(factEl.y));

      if (hasFactBar && factEl) {
        const span = barSpan(factEl);
        xPos = span.center;
        yPos = factEl.y;
      } else if (planEl && Number.isFinite(planEl.y)) {
        const span = barSpan(planEl);
        xPos = span.center;
        yPos = planEl.y;
      } else {
        continue;
      }

      if (todayPixel != null && Number.isFinite(todayPixel)) {
        if (Math.abs(xPos - todayPixel) < TODAY_OVERLAP_GAP_PX) {
          const refEl = hasFactBar && factEl ? factEl : planEl;
          if (refEl) {
            const span = barSpan(refEl);
            const width = span.right - span.left;
            if (width > TODAY_OVERLAP_GAP_PX * 2.5) {
              xPos =
                todayPixel <= span.center
                  ? span.left + width * 0.38
                  : span.right - width * 0.38;
            } else {
              xPos =
                todayPixel <= span.center
                  ? todayPixel + TODAY_OVERLAP_GAP_PX
                  : todayPixel - TODAY_OVERLAP_GAP_PX;
            }
          }
        }
      }

      xPos = Math.max(chartArea.left + 6, Math.min(chartArea.right - 6, xPos));

      const isDash = text === "—";
      ctx.textAlign = "center";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(15, 23, 42, 0.88)";
      ctx.lineWidth = 3;
      ctx.strokeText(text, xPos, yPos);
      ctx.fillStyle = isDash ? "rgba(148, 163, 184, 0.85)" : "rgba(248, 250, 252, 0.95)";
      ctx.fillText(text, xPos, yPos);
    }
    ctx.restore();
  },
};
