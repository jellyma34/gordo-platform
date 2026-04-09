import type { SalesCategoryBreakdownRow, SalesRadarCategoryRow, SalesMetricBlock } from "@/lib/marketingSalesReportData";

export type ExecStatus = "green" | "yellow" | "red";

/** Статус по фактическому % выполнения накопительного плана. */
export function execStatusFromPercent(percentComplete: number): ExecStatus {
  if (percentComplete > 100) return "green";
  if (percentComplete >= 90) return "yellow";
  return "red";
}

export type DiagnosticRow = SalesCategoryBreakdownRow & {
  status: ExecStatus;
};

/** Хуже всего сверху: по возрастанию % выполнения, затем по отклонению (сильнее минус — выше). */
export function buildDiagnosticRows(categories: SalesCategoryBreakdownRow[]): DiagnosticRow[] {
  return [...categories]
    .map((c) => ({
      ...c,
      status: execStatusFromPercent(c.percentComplete),
    }))
    .sort((a, b) => {
      const byPct = a.percentComplete - b.percentComplete;
      if (byPct !== 0) return byPct;
      return a.deviation - b.deviation;
    });
}

export type StructureRow = {
  id: string;
  name: string;
  planSharePct: number;
  factSharePct: number;
};

export function buildStructureRows(categories: SalesCategoryBreakdownRow[]): StructureRow[] {
  const planSum = categories.reduce((s, c) => s + c.planCumulative, 0);
  const factSum = categories.reduce((s, c) => s + c.factCumulative, 0);
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    planSharePct: planSum > 0 ? (c.planCumulative / planSum) * 100 : 0,
    factSharePct: factSum > 0 ? (c.factCumulative / factSum) * 100 : 0,
  }));
}

export type SalesInsightBullet = { tone: "risk" | "ok" | "neutral"; text: string };

export function buildSalesInsights(
  categories: SalesCategoryBreakdownRow[],
  radarCategories: SalesRadarCategoryRow[],
  revenue: SalesMetricBlock,
): SalesInsightBullet[] {
  const sorted = [...categories].sort((a, b) => a.percentComplete - b.percentComplete);
  const worst = sorted[0];
  const bestOver = categories.filter((c) => c.percentComplete > 100).sort((a, b) => b.percentComplete - a.percentComplete);
  const dragging = categories.filter((c) => c.percentComplete < 90).sort((a, b) => a.percentComplete - b.percentComplete);

  const out: SalesInsightBullet[] = [];

  if (worst && worst.percentComplete < 100) {
    out.push({
      tone: "risk",
      text: `Основное отставание: «${worst.name}» — ${worst.percentComplete.toFixed(1)}% к плану (−${formatRubShort(Math.abs(worst.deviation))}).`,
    });
  }

  if (bestOver.length) {
    const names = bestOver.slice(0, 2).map((c) => `«${c.name}» (${c.percentComplete.toFixed(0)}%)`);
    out.push({
      tone: "ok",
      text: `Перевыполнение: ${names.join(", ")}${bestOver.length > 2 ? " и др." : ""}.`,
    });
  }

  if (dragging.length) {
    const names = dragging.map((c) => `«${c.name}»`);
    out.push({
      tone: "risk",
      text: `Тянут вниз общий результат (ниже 90%): ${names.join(", ")}.`,
    });
  }

  const radarWorst = [...radarCategories]
    .map((r) => ({
      name: r.name,
      pct: r.planCumulative > 0 ? (r.factCumulative / r.planCumulative) * 100 : 0,
    }))
    .sort((a, b) => a.pct - b.pct)[0];
  if (radarWorst && radarWorst.pct < 90 && !out.some((x) => x.text.includes(radarWorst.name))) {
    out.push({
      tone: "neutral",
      text: `По сегментам (радар) сильнее всего просел сегмент «${radarWorst.name}» (${radarWorst.pct.toFixed(1)}%).`,
    });
  }

  if (revenue.percentComplete >= 100) {
    out.unshift({
      tone: "ok",
      text: `Накопительный план по выручке выполнен на ${revenue.percentComplete.toFixed(1)}%.`,
    });
  } else if (revenue.percentComplete >= 90) {
    out.unshift({
      tone: "neutral",
      text: `Выручка в «зоне контроля»: ${revenue.percentComplete.toFixed(1)}% к накопительному плану.`,
    });
  } else {
    out.unshift({
      tone: "risk",
      text: `Выручка ниже плана: ${revenue.percentComplete.toFixed(1)}% к накопительному плану.`,
    });
  }

  return out.slice(0, 6);
}

function formatRubShort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${Math.round(n / 1_000_000)} млн ₽`;
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(n);
}
