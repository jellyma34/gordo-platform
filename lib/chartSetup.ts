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
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = "600 12px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
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

    const raw = chart.data.datasets[fcIdx]?.data as { y?: number }[] | undefined;
    if (!raw || raw.length < 2) return;

    const pluginsOpts = chart.options.plugins as
      | { gprForecastPlanLagPp?: number; gprForecastFactNow?: number }
      | undefined;
    const lag = pluginsOpts?.gprForecastPlanLagPp;
    const yLast = raw[raw.length - 1]?.y;
    if (typeof yLast !== "number") return;

    let shadowColor: string;
    if (typeof lag === "number") {
      if (lag <= 0) shadowColor = "rgba(34, 197, 94, 0.55)";
      else if (lag <= 12) shadowColor = "rgba(245, 158, 11, 0.55)";
      else shadowColor = "rgba(239, 68, 68, 0.55)";
    } else {
      const factNow = pluginsOpts?.gprForecastFactNow;
      if (typeof factNow === "number") {
        const cumDrop = factNow - yLast;
        if (cumDrop <= 0) shadowColor = "rgba(34, 197, 94, 0.55)";
        else if (cumDrop <= 12) shadowColor = "rgba(245, 158, 11, 0.55)";
        else shadowColor = "rgba(239, 68, 68, 0.55)";
      } else {
        shadowColor = "rgba(148, 163, 184, 0.45)";
      }
    }

    const ctx = chart.ctx;
    ctx.save();
    c.$gprGlowActive = true;
    ctx.shadowBlur = 16;
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

/** Свечение линии факта (датасет «Факт ГПР») — plugins.gprFactGlow. */
export const gprFactGlowPlugin: Plugin = {
  id: "gprFactGlow",
  beforeDatasetDraw(chart, args) {
    const c = chart as { $factGlowActive?: boolean };
    delete c.$factGlowActive;

    const plugins = chart.options.plugins as { gprFactGlow?: boolean } | undefined;
    if (!plugins?.gprFactGlow) return;
    if (chart.data.datasets[args.index]?.label !== "Факт ГПР") return;

    const ctx = chart.ctx;
    ctx.save();
    c.$factGlowActive = true;
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#22c55e";
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  },
  afterDatasetDraw(chart, args) {
    const c = chart as { $factGlowActive?: boolean };
    if (!c.$factGlowActive) return;
    if (chart.data.datasets[args.index]?.label !== "Факт ГПР") return;
    delete c.$factGlowActive;
    chart.ctx.restore();
  },
};

ChartJS.register(gprForecastTodayPlugin, gprForecastGlowPlugin, gprFactGlowPlugin);
