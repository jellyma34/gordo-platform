import { Chart as ChartJS, type Plugin } from "chart.js/auto";

export const gprForecastTodayPlugin: Plugin = {
  id: "gprForecastToday",
  afterDatasetsDraw(chart) {
    const plugins = chart.options.plugins as
      | { gprForecastToday?: { todayMs?: number } | boolean }
      | undefined;
    const raw = plugins?.gprForecastToday;
    const opts = typeof raw === "object" && raw !== null ? raw : undefined;
    const todayMs = opts?.todayMs;
    if (todayMs == null || !chart.scales.x) return;

    const { ctx, chartArea } = chart;
    const xScale = chart.scales.x;
    const x = xScale.getPixelForValue(todayMs);
    if (x < chartArea.left || x > chartArea.right) return;

    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("Сегодня", x, chartArea.top - 2);
    ctx.restore();
  },
};

function forecastDatasetIndex(chart: { data: { datasets: { label?: string }[] } }): number {
  return chart.data.datasets.findIndex((d) => d.label === "Прогноз ГПР");
}

/** Свечение линии прогноза — включается через plugins.gprForecastGlow; датасет по label. */
export const gprForecastGlowPlugin: Plugin = {
  id: "gprForecastGlow",
  beforeDatasetDraw(chart, args) {
    const fcIdx = forecastDatasetIndex(chart);
    if (fcIdx < 0 || args.index !== fcIdx) return;
    const c = chart as { $gprGlowActive?: boolean };
    delete c.$gprGlowActive;

    const plugins = chart.options.plugins as { gprForecastGlow?: boolean } | undefined;
    if (!plugins?.gprForecastGlow) return;

    const raw = chart.data.datasets[fcIdx]?.data;
    if (!raw || raw.length < 2) return;
    const p0 = raw[0] as { y?: number };
    const p1 = raw[1] as { y?: number };
    const y0 = p0?.y;
    const y1 = p1?.y;
    if (typeof y0 !== "number" || typeof y1 !== "number") return;

    const drop = y0 - y1;
    let shadowColor: string;
    if (drop <= 0) shadowColor = "rgba(34, 197, 94, 0.55)";
    else if (drop <= 12) shadowColor = "rgba(245, 158, 11, 0.55)";
    else shadowColor = "rgba(239, 68, 68, 0.55)";

    const ctx = chart.ctx;
    ctx.save();
    c.$gprGlowActive = true;
    ctx.shadowBlur = 18;
    ctx.shadowColor = shadowColor;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  },
  afterDatasetDraw(chart, args) {
    const fcIdx = forecastDatasetIndex(chart);
    if (fcIdx < 0 || args.index !== fcIdx) return;
    const c = chart as { $gprGlowActive?: boolean };
    if (!c.$gprGlowActive) return;
    delete c.$gprGlowActive;
    chart.ctx.restore();
  },
};

ChartJS.register(gprForecastTodayPlugin, gprForecastGlowPlugin);
