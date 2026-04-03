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
    ctx.strokeStyle = "rgba(226, 232, 240, 0.45)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillStyle = "#e2e8f0";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("Сегодня", x, chartArea.top + 17);
    ctx.restore();
  },
};

ChartJS.register(gprForecastTodayPlugin);
