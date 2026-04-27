import { gprMockData } from "@/lib/gprMockData";
import { getProjectStats, getStatusByGprProgressDelta } from "@/lib/gprUtils";
import { marketingMockData } from "@/lib/marketingMockData";

export type StatusTone = "green" | "yellow" | "red";

export type HomeProjectStatus = {
  sales: {
    planPercent: number;
    gapDeals: number;
    factDeals: number;
    planDeals: number;
    needsAttention: boolean;
  };
  construction: {
    /** Средний фактический % по задачам с планом */
    factPercent: number;
    /** Средний плановый % на отчётную дату */
    plannedPercentAtDate: number;
    /** Среднее отклонение факт − план (п.п.) */
    progressDeltaPp: number;
    status: StatusTone;
    needsAttention: boolean;
  };
  finance: {
    statusLabel: string;
    needsAttention: boolean;
  };
};

export type HomeCardKpi = {
  needsAttention: boolean;
  /** Короткие метрики для списка на карточке */
  metrics: {
    label: string;
    value: string;
    accent?: "danger" | "success";
    /** Визуальный индикатор (например статус ГПР) */
    statusTone?: StatusTone;
  }[];
  /** Краткое пояснение (например проблемный месяц) */
  footnote?: string;
};

export type HomeDashboardSnapshot = {
  asOfIso: string;
  project: HomeProjectStatus;
  cards: {
    construction: HomeCardKpi;
    marketing: HomeCardKpi;
    finance: HomeCardKpi;
  };
};

function formatRubShort(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(".", ",")} млрд ₽`;
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)} млн ₽`;
  return `${n.toLocaleString("ru-RU")} ₽`;
}

type MonthDelta = { key: string; label: string; delta: number };

function computeWorstAndBest(monthDeltas: MonthDelta[]): { worst: MonthDelta | null; best: MonthDelta | null } {
  if (monthDeltas.length === 0) return { worst: null, best: null };
  const first = monthDeltas[0];
  const worst = monthDeltas.reduce((acc, m) => (m.delta < acc.delta ? m : acc), first);
  const best = monthDeltas.reduce((acc, m) => (m.delta > acc.delta ? m : acc), first);
  return { worst, best };
}

function buildMarketingFootnote(params: {
  monthDeltas: MonthDelta[];
  worst: MonthDelta | null;
  best: MonthDelta | null;
}): string {
  const { monthDeltas, worst, best } = params;
  if (monthDeltas.length === 0) {
    return "Нет помесячных данных";
  }
  if (worst && worst.delta < 0) {
    return `Проблемный месяц: ${worst.label} (${worst.delta >= 0 ? "+" : ""}${worst.delta} сд.)`;
  }
  if (best && best.delta > 0) {
    return `Максимум к плану: ${best.label} (+${best.delta} сд.)`;
  }
  return `Стабильно по сделкам: ${monthDeltas[0]?.label ?? "—"}`;
}

/**
 * Сводка для хаба: мок-данные маркетинга + ГПР, без сети.
 * Заменяем на API, когда бэкенд готов.
 */
export function getHomeDashboardSnapshot(asOf: Date = new Date()): HomeDashboardSnapshot {
  const planRows = marketingMockData.salesPlan.month;
  const factRows = marketingMockData.salesFact.month;
  const revRows = marketingMockData.salesRevenue.month;

  const byKey = (rows: { periodKey: string; deals?: number; revenueRub?: number }[]) =>
    new Map(rows.map((r) => [r.periodKey, r] as const));

  const pMap = byKey(planRows);
  const fMap = byKey(factRows);
  const rMap = byKey(revRows);

  const keys = [...new Set([...pMap.keys(), ...fMap.keys()])].sort();
  let planDeals = 0;
  let factDeals = 0;
  let revenueYtd = 0;

  const monthDeltas: MonthDelta[] = [];

  for (const key of keys) {
    const p = pMap.get(key);
    const f = fMap.get(key);
    const pr = p?.deals ?? 0;
    const fr = f?.deals ?? 0;
    planDeals += pr;
    factDeals += fr;
    monthDeltas.push({
      key,
      label: p?.label ?? f?.label ?? key,
      delta: fr - pr,
    });
    const r = rMap.get(key);
    if (r?.revenueRub) revenueYtd += r.revenueRub;
  }

  const planPercent = planDeals > 0 ? Math.round((factDeals / planDeals) * 1000) / 10 : 0;
  const gapDeals = factDeals - planDeals;
  const salesNeedsAttention = gapDeals < 0;

  const { worst, best } = computeWorstAndBest(monthDeltas);
  const marketingFootnote = buildMarketingFootnote({ monthDeltas, worst, best });
  const marketingRiskFromMonth = (worst?.delta ?? 0) < -3;

  const stats = getProjectStats(gprMockData);
  const progressDeltaPp = Number.isFinite(stats.avgDeviation) ? stats.avgDeviation : 0;
  const plannedPercentAtDate = stats.avgPlannedPercent ?? 0;
  const factPercent = stats.avgFactPercent ?? 0;
  const cStatus: StatusTone = getStatusByGprProgressDelta(progressDeltaPp);
  const constructionNeedsAttention = cStatus !== "green" || (stats.overdue ?? 0) > 0;

  const inst = marketingMockData.installment;
  const financeNeedsAttention = inst.overdue.count >= 3;
  const financeStatusLabel = financeNeedsAttention
    ? `Просрочка рассрочки: ${inst.overdue.count} ДДУ`
    : "В норме (по поступлениям)";

  const project: HomeProjectStatus = {
    sales: {
      planPercent,
      gapDeals,
      factDeals,
      planDeals,
      needsAttention: salesNeedsAttention,
    },
    construction: {
      factPercent,
      plannedPercentAtDate,
      progressDeltaPp,
      status: cStatus,
      needsAttention: constructionNeedsAttention,
    },
    finance: {
      statusLabel: financeStatusLabel,
      needsAttention: financeNeedsAttention,
    },
  };

  const statusLabelRu: Record<StatusTone, string> = {
    green: "В срок",
    yellow: "Риск",
    red: "Отставание",
  };

  const cards: HomeDashboardSnapshot["cards"] = {
    construction: {
      needsAttention: constructionNeedsAttention,
      metrics: [
        { label: "План (на дату)", value: `${plannedPercentAtDate}%` },
        { label: "Факт", value: `${factPercent}%` },
        {
          label: progressDeltaPp < 0 ? "Отставание" : progressDeltaPp > 0 ? "Опережение" : "К плану",
          value:
            progressDeltaPp === 0
              ? "0 п.п."
              : `${progressDeltaPp > 0 ? "+" : "−"}${Math.abs(progressDeltaPp)} п.п.`,
          accent: cStatus === "red" ? "danger" : cStatus === "yellow" ? "danger" : "success",
        },
        { label: "Статус", value: statusLabelRu[cStatus], statusTone: cStatus },
      ],
    },
    marketing: {
      needsAttention: salesNeedsAttention || marketingRiskFromMonth,
      metrics: [
        { label: "% плана (сумма периодов)", value: `${planPercent}%` },
        {
          label: "Gap (сделки)",
          value: gapDeals >= 0 ? `+${gapDeals}` : `−${Math.abs(gapDeals)}`,
          accent: gapDeals < 0 ? "danger" : "success",
        },
        { label: "Факт / план", value: `${factDeals} / ${planDeals}` },
      ],
      footnote: marketingFootnote,
    },
    finance: {
      needsAttention: financeNeedsAttention,
      metrics: revenueYtd > 0
        ? [
            { label: "Выручка (YTD, мок)", value: formatRubShort(revenueYtd) },
            { label: "Статус модуля", value: "Расширенная аналитика в разработке" },
          ]
        : [
            { label: "Выручка", value: "в разработке" },
            { label: "Примечание", value: "Сводные финансы подключаются к API" },
          ],
    },
  };

  return {
    asOfIso: asOf.toISOString(),
    project,
    cards,
  };
}

/** Индикатор рядом с заголовком навигационной карточки хаба (не KPI внутри карточки). */
export function getHubNavStatusTone(
  snap: HomeDashboardSnapshot,
  section: "construction" | "marketing" | "finance",
): StatusTone {
  switch (section) {
    case "construction":
      return snap.project.construction.status;
    case "marketing": {
      if (snap.project.sales.needsAttention) return "red";
      if (snap.project.sales.planPercent < 100) return "yellow";
      return "green";
    }
    case "finance":
      return snap.project.finance.needsAttention ? "red" : "green";
  }
}
