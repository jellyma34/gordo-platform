/**
 * Диагностика отсечения факта + SVG-превью графика рассрочки.
 * Запуск: npx tsx scripts/render-installment-forecast-preview.ts
 */
import fs from "fs";
import path from "path";

import {
  buildInstallmentForecastChartData,
  resolveInstallmentFactThroughPeriodKey,
} from "@/lib/buildInstallmentForecastChartData";
import { periodKeyToRuChartLabel } from "@/lib/buildCashflowSeries";
import {
  formatInstallmentPlatformDateLabel,
  resolveInstallmentTodayLineCategoryPixelX,
  resolveInstallmentTodayLineModel,
  resolvePlatformCurrentDateYmd,
} from "@/lib/installmentForecastChartTodayLine";
import { parseInstallmentForecastCsv } from "@/lib/parseInstallmentForecastCsv";

const OUT = path.join(process.cwd(), "tmp", "installment-forecast-screenshots");

/** Отчётный месяц маркетинга (mock): analytics.planAnalytics.month.currentPeriodKey */
const MARKETING_REPORTING_PERIOD_KEY = "2026-04";
const MARKETING_PERIOD: "month" | "quarter" = "month";

/** Текущая дата платформы для превью (локальная «сегодня»). */
const CURRENT_DATE = resolvePlatformCurrentDateYmd();

const DEMO_FACT: Record<string, number> = {
  "2026-04": 15_000_000,
  "2026-05": 18_500_000,
  "2026-06": 22_400_000,
  "2026-07": 19_200_000,
  "2026-08": 26_100_000,
  "2026-09": 21_800_000,
  "2026-10": 24_500_000,
  "2026-11": 20_000_000,
  "2026-12": 18_000_000,
};

function svgTodayLine(
  points: ReturnType<typeof buildInstallmentForecastChartData>["chartPoints"],
  pad: { l: number; t: number },
  innerW: number,
  innerH: number,
  currentDateYmd: string,
): string {
  const todayLine = resolveInstallmentTodayLineModel(points, currentDateYmd);
  if (!todayLine) return "";
  const xi = resolveInstallmentTodayLineCategoryPixelX(
    points.length,
    todayLine.monthIndex,
    pad.l,
    innerW,
    todayLine.dayFractionInMonth,
  );
  const yTop = pad.t;
  const yBottom = pad.t + innerH;
  return `
  <line x1="${xi.toFixed(1)}" y1="${yTop}" x2="${xi.toFixed(1)}" y2="${yBottom}" stroke="rgba(163,179,199,0.52)" stroke-width="1.5" stroke-dasharray="4 5"/>
  <text x="${xi.toFixed(1)}" y="${yTop - 6}" text-anchor="middle" font-size="10" font-weight="600" fill="rgba(71,85,105,0.95)">${todayLine.dateLabel}</text>`;
}

function svgMonthly(
  points: ReturnType<typeof buildInstallmentForecastChartData>["chartPoints"],
  title: string,
  currentDateYmd: string,
): string {
  const W = 960;
  const H = 340;
  const pad = { l: 56, r: 16, t: 36, b: 48 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const n = points.length;
  const maxY =
    Math.max(
      ...points.map((p) => Math.max(p.amountUnit, p.factAmountUnit ?? 0)),
      1,
    ) * 1.12;

  const x = (i: number) => pad.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => pad.t + innerH - (v / maxY) * innerH;

  const forecastPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.amountUnit).toFixed(1)}`)
    .join(" ");
  const areaPath = `${forecastPath} L ${x(n - 1).toFixed(1)} ${(pad.t + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(pad.t + innerH).toFixed(1)} Z`;

  const factSegments: string[] = [];
  let seg: string[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (p.factAmountUnit == null) {
      if (seg.length) {
        factSegments.push(`M ${seg.join(" L ")}`);
        seg = [];
      }
      continue;
    }
    seg.push(`${x(i).toFixed(1)},${y(p.factAmountUnit).toFixed(1)}`);
  }
  if (seg.length) factSegments.push(`M ${seg.join(" L ")}`);

  const monthLabels = points
    .map(
      (p, i) =>
        `<text x="${x(i)}" y="${H - 12}" text-anchor="middle" font-size="10" fill="#64748b">${p.label}</text>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="100%" height="100%" fill="#fff" rx="12"/>
  <text x="20" y="22" font-size="13" font-weight="600" fill="#0f172a">${title}</text>
  <circle cx="720" cy="18" r="5" fill="#2563eb"/><text x="732" y="22" font-size="11" fill="#334155">Прогноз</text>
  <circle cx="810" cy="18" r="5" fill="#22c55e"/><text x="822" y="22" font-size="11" fill="#334155">Факт</text>
  <path d="${areaPath}" fill="url(#g)" opacity="0.35"/>
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#3b82f6" stop-opacity="0.05"/></linearGradient></defs>
  <path d="${forecastPath}" fill="none" stroke="#3b82f6" stroke-width="2"/>
  ${factSegments.map((d) => `<path d="${d}" fill="none" stroke="#22c55e" stroke-width="2.5"/>`).join("")}
  ${svgTodayLine(points, pad, innerW, innerH, currentDateYmd)}
  ${monthLabels}
</svg>`;
}

function svgCumulative(
  points: ReturnType<typeof buildInstallmentForecastChartData>["chartPoints"],
  title: string,
  currentDateYmd: string,
): string {
  const W = 960;
  const H = 340;
  const pad = { l: 56, r: 16, t: 36, b: 48 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const n = points.length;
  const maxY =
    Math.max(
      ...points.map((p) => Math.max(p.cumulativeUnit, p.factCumulativeUnit ?? 0)),
      1,
    ) * 1.08;

  const x = (i: number) => pad.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => pad.t + innerH - (v / maxY) * innerH;

  const forecastPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.cumulativeUnit).toFixed(1)}`)
    .join(" ");

  const factSegments: string[] = [];
  let seg: string[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (p.factCumulativeUnit == null) {
      if (seg.length) {
        factSegments.push(`M ${seg.join(" L ")}`);
        seg = [];
      }
      continue;
    }
    seg.push(`${x(i).toFixed(1)},${y(p.factCumulativeUnit).toFixed(1)}`);
  }
  if (seg.length) factSegments.push(`M ${seg.join(" L ")}`);

  const monthLabels = points
    .map(
      (p, i) =>
        `<text x="${x(i)}" y="${H - 12}" text-anchor="middle" font-size="10" fill="#64748b">${p.label}</text>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="100%" height="100%" fill="#fff" rx="12"/>
  <text x="20" y="22" font-size="13" font-weight="600" fill="#0f172a">${title}</text>
  <circle cx="720" cy="18" r="5" fill="#2563eb"/><text x="732" y="22" font-size="11" fill="#334155">Прогноз</text>
  <circle cx="810" cy="18" r="5" fill="#22c55e"/><text x="822" y="22" font-size="11" fill="#334155">Факт</text>
  <path d="${forecastPath}" fill="none" stroke="#2563eb" stroke-width="2.5"/>
  ${factSegments.map((d) => `<path d="${d}" fill="none" stroke="#22c55e" stroke-width="2.5"/>`).join("")}
  ${svgTodayLine(points, pad, innerW, innerH, currentDateYmd)}
  ${monthLabels}
</svg>`;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const csv = fs.readFileSync("public/data/analytics/installment-forecast.csv", "utf8");
  const parsed = parseInstallmentForecastCsv(csv);
  if (!parsed.ok) throw new Error(parsed.error);

  const factThrough = resolveInstallmentFactThroughPeriodKey(
    MARKETING_REPORTING_PERIOD_KEY,
    MARKETING_PERIOD,
  );

  const { chartPoints } = buildInstallmentForecastChartData(parsed.rows, {
    factByPeriodKey: DEMO_FACT,
    factThroughPeriodKey: factThrough,
  });

  const todayLine = resolveInstallmentTodayLineModel(chartPoints, CURRENT_DATE);
  const linePixelX =
    todayLine != null
      ? resolveInstallmentTodayLineCategoryPixelX(
          chartPoints.length,
          todayLine.monthIndex,
          56,
          960 - 56 - 16,
          todayLine.dayFractionInMonth,
        )
      : null;

  const beforeCutoff = chartPoints
    .filter((p) => factThrough == null || p.periodKey <= factThrough)
    .map((p) => ({
      periodKey: p.periodKey,
      label: p.label,
      factAmount: p.factAmount,
      factCumulative: p.factCumulative,
    }));

  const afterCutoff = chartPoints
    .filter((p) => factThrough != null && p.periodKey > factThrough)
    .map((p) => ({
      periodKey: p.periodKey,
      label: p.label,
      factAmount: p.factAmount,
      factCumulative: p.factCumulative,
    }));

  console.log("=== ОТСЕЧЕНИЕ ФАКТА (РАССРОЧКА) ===");
  console.log("reportMonth (отчётный месяц маркетинга):", MARKETING_REPORTING_PERIOD_KEY, "→", periodKeyToRuChartLabel(MARKETING_REPORTING_PERIOD_KEY));
  console.log("factThroughPeriodKey:", factThrough);
  console.log("\n=== ЛИНИЯ ТЕКУЩЕЙ ДАТЫ ПЛАТФОРМЫ ===");
  console.log("currentDate:", CURRENT_DATE);
  console.log("reportMonth:", MARKETING_REPORTING_PERIOD_KEY);
  console.log("Подпись линии:", formatInstallmentPlatformDateLabel(CURRENT_DATE));
  console.log("Месяц на оси X:", todayLine?.monthPeriodKey ?? "— (вне диапазона)", todayLine ? `→ ${periodKeyToRuChartLabel(todayLine.monthPeriodKey)}` : "");
  console.log("Координата линии (x px, SVG-превью):", linePixelX?.toFixed(1) ?? "—");
  console.log("dayFractionInMonth:", todayLine?.dayFractionInMonth ?? "—");
  console.log("Модель линии:", todayLine);
  console.log("\nФакт ДО отсечения (включительно):", JSON.stringify(beforeCutoff, null, 2));
  console.log("\nФакт ПОСЛЕ отсечения (null):", JSON.stringify(afterCutoff, null, 2));

  const cutoffLabel = factThrough ? periodKeyToRuChartLabel(factThrough) : "—";
  const dateLabel = formatInstallmentPlatformDateLabel(CURRENT_DATE);
  fs.writeFileSync(
    path.join(OUT, "monthly.svg"),
    svgMonthly(
      chartPoints,
      `Прогноз (рассрочки) — Помесячно · линия: ${dateLabel} · отсечение факта: ${cutoffLabel}`,
      CURRENT_DATE,
    ),
  );
  fs.writeFileSync(
    path.join(OUT, "cumulative.svg"),
    svgCumulative(
      chartPoints,
      `Прогноз (рассрочки) — Накопительно · линия: ${dateLabel} · отсечение: ${cutoffLabel}`,
      CURRENT_DATE,
    ),
  );

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Installment forecast</title></head><body style="font-family:system-ui;padding:24px;background:#f8fafc">${fs.readFileSync(path.join(OUT, "monthly.svg"), "utf8")}<br/><br/>${fs.readFileSync(path.join(OUT, "cumulative.svg"), "utf8")}</body></html>`;
  fs.writeFileSync(path.join(OUT, "preview.html"), html);
  console.log("\nPreview:", path.join(OUT, "preview.html"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
