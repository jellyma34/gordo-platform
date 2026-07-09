import { gprMockData } from "@/lib/gprMockData";
import {
  collectGprProjectKpiArticleWorks,
  computeGprKpiArticleWorksBreakdown,
  computeGprStageNotStartedOnTimeKpi,
  computeGprTasksCompletionDeviation,
  computeGprTasksFactCompletionPercent,
  computeGprTasksPlanCompletionPercent,
  filterGprTasksForKpiAnalytics,
} from "@/lib/gprStageCompletion";
import {
  computeTenderBudgetFinancialResult,
  computeTenderKpiDonutDistributions,
} from "@/lib/tenderPresentationAnalytics";
import {
  computeTmcKpiDonutDistributions,
  computeTmcProcurementFinancialResult,
  enrichTmcItems,
} from "@/lib/tmcPresentationAnalytics";
import type { Tender } from "@/lib/tenderData";
import type { TMCItem } from "@/lib/tmcData";
import {
  getProjectStats,
  getStatusByGprProgressDelta,
} from "@/lib/gprUtils";
import { marketingMockData } from "@/lib/marketingMockData";
import type { GPRTask } from "@/lib/gprUtils";

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

export type HomeConstructionProjectKpi = {
  status: StatusTone;
  factValue: string;
  planValue: string;
  deviationValue: string;
  deviationDeltaPp: number | null;
  completedStages: number;
  totalStages: number;
  onTimeCount: number;
  atRiskCount: number;
  overdueCount: number;
  completedSharePct: number;
  completedShareNumerator: number;
  completedShareDenominator: number;
  donutOnTimeCount: number;
  donutRiskCount: number;
  donutOverdueCount: number;
  donutCompletedLateCount: number;
  donutNotStartedCount: number;
  businessCompletedCount: number;
  businessInProgressCount: number;
  businessLateCount: number;
  businessOverdueCount: number;
  businessNotStartedCount: number;
  dashboardStatusNotStartedOnTimeCount: number;
  dashboardBottomKpi?: { label: string; primaryText: string };
};

export type HomeTenderBudgetKpi = {
  title: string;
  mainRub: number;
  economyRub: number;
  overrunRub: number;
  deviationPct: number;
  concludedPlanRub: number;
  budgetDeviationSegments: ReturnType<typeof computeTenderKpiDonutDistributions>["budgetDeviation"];
  budgetBlockTenderCount: number;
  glowColor: string;
  waveColor: string;
  gradient: string;
  badgeTone: "green" | "yellow" | "red";
};

export type HomeTmcPurchasedDeviationKpi = {
  title: string;
  mainRub: number;
  economyRub: number;
  overrunRub: number;
  purchasedPlanRub: number;
  deviationPct: number;
  budgetDeviationSegments: ReturnType<typeof computeTmcKpiDonutDistributions>["budgetDeviation"];
  glowColor: string;
  waveColor: string;
  gradient: string;
  badgeTone: "green" | "amber" | "red";
};

export type HomeMarketingProjectKpi = {
  title: string;
  soldUnits: number;
  totalUnits: number;
  projectRevenueRub: number;
  factReceiptsRub: number;
  avgPricePerSqmRub: number;
};

function formatGprPercentValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  const body = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1).replace(".", ",");
  return `${body}%`;
}

function formatGprDeviationPercentValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  const absBody = Math.abs(rounded)
    .toFixed(1)
    .replace(".", ",")
    .replace(/,0$/, "");
  if (rounded > 0) return `+${absBody}%`;
  if (rounded < 0) return `−${absBody}%`;
  return "0%";
}

/** Данные мини-версии KPI «Проект» (ГПР) для карточки «Строительство» на хабе. */
export function buildHomeConstructionProjectKpi(
  asOf: Date = new Date(),
  gprTasks: GPRTask[] = gprMockData,
): HomeConstructionProjectKpi {
  const projectWorks = collectGprProjectKpiArticleWorks(filterGprTasksForKpiAnalytics(gprTasks));
  const breakdown = computeGprKpiArticleWorksBreakdown(projectWorks, asOf);
  const factPercent = computeGprTasksFactCompletionPercent(projectWorks, asOf);
  const planPercent = computeGprTasksPlanCompletionPercent(projectWorks, asOf);
  const deviationPp = computeGprTasksCompletionDeviation(projectWorks, asOf);
  const status: StatusTone = getStatusByGprProgressDelta(deviationPp ?? 0);
  const notStartedOnTimeKpi = computeGprStageNotStartedOnTimeKpi(projectWorks, asOf);

  return {
    status,
    factValue: formatGprPercentValue(factPercent),
    planValue: formatGprPercentValue(planPercent),
    deviationValue: formatGprDeviationPercentValue(deviationPp),
    deviationDeltaPp: deviationPp,
    completedStages: breakdown.completedStages,
    totalStages: breakdown.totalStages,
    onTimeCount: breakdown.onTimeCount,
    atRiskCount: breakdown.atRiskCount,
    overdueCount: breakdown.overdueCount,
    completedSharePct: breakdown.completedSharePct,
    completedShareNumerator: breakdown.completedStages,
    completedShareDenominator: breakdown.totalStages,
    donutOnTimeCount: breakdown.donutOnTimeCount,
    donutRiskCount: breakdown.donutRiskCount,
    donutOverdueCount: breakdown.donutOverdueCount,
    donutCompletedLateCount: breakdown.donutCompletedLateCount,
    donutNotStartedCount: breakdown.donutNotStartedCount,
    businessCompletedCount: breakdown.businessCompletedCount,
    businessInProgressCount: breakdown.businessInProgressCount,
    businessLateCount: breakdown.businessLateCount,
    businessOverdueCount: breakdown.businessOverdueCount,
    businessNotStartedCount: breakdown.businessNotStartedCount,
    dashboardStatusNotStartedOnTimeCount: notStartedOnTimeKpi.notStartedOnTimeCount,
    dashboardBottomKpi: {
      label: "Отклонение готовности",
      primaryText: formatGprDeviationPercentValue(deviationPp),
    },
  };
}

export type HomeDashboardSnapshot = {
  asOfIso: string;
  project: HomeProjectStatus;
  constructionProjectKpi: HomeConstructionProjectKpi;
  tenderBudgetKpi: HomeTenderBudgetKpi;
  tmcPurchasedDeviationKpi: HomeTmcPurchasedDeviationKpi;
  marketingProjectKpi: HomeMarketingProjectKpi;
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
export function getHomeDashboardSnapshot(
  asOf: Date = new Date(),
  gprTasks: GPRTask[] = gprMockData,
  tenders: Tender[] = [],
  tmcItems: TMCItem[] = [],
): HomeDashboardSnapshot {
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

  const stats = getProjectStats(filterGprTasksForKpiAnalytics(gprTasks));
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

  const tenderFinancial = computeTenderBudgetFinancialResult(tenders);
  const tenderDonut = computeTenderKpiDonutDistributions(tenders, asOf);
  const tenderBudgetCardTone =
    tenderFinancial.deviationRub < 0 ? "green" : tenderFinancial.deviationRub > 0 ? "red" : "yellow";
  const tenderBudgetCardVisual = (() => {
    if (tenderBudgetCardTone === "green") {
      return {
        glowColor: "#22c55e",
        waveColor: "#22c55e",
        gradient:
          "linear-gradient(145deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.92) 55%, rgba(21,128,61,0.14) 100%)",
      };
    }
    if (tenderBudgetCardTone === "red") {
      return {
        glowColor: "#ef4444",
        waveColor: "#ef4444",
        gradient:
          "linear-gradient(145deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.92) 55%, rgba(127,29,29,0.16) 100%)",
      };
    }
    return {
      glowColor: "#f59e0b",
      waveColor: "#f59e0b",
      gradient:
        "linear-gradient(145deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.92) 55%, rgba(146,64,14,0.16) 100%)",
    };
  })();
  const enrichedTmcItems = enrichTmcItems(tmcItems, asOf);
  const tmcFinancial = computeTmcProcurementFinancialResult(enrichedTmcItems);
  const tmcDonut = computeTmcKpiDonutDistributions(enrichedTmcItems, undefined, asOf, tenders);
  const tmcPurchasedCardTone =
    tmcFinancial.deviationRub < 0 ? "green" : tmcFinancial.deviationRub > 0 ? "red" : "amber";
  const tmcPurchasedCardVisual = (() => {
    if (tmcPurchasedCardTone === "green") {
      return {
        glowColor: "#22c55e",
        waveColor: "#22c55e",
        gradient:
          "linear-gradient(145deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.92) 55%, rgba(21,128,61,0.14) 100%)",
      };
    }
    if (tmcPurchasedCardTone === "red") {
      return {
        glowColor: "#ef4444",
        waveColor: "#ef4444",
        gradient:
          "linear-gradient(145deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.92) 55%, rgba(127,29,29,0.16) 100%)",
      };
    }
    return {
      glowColor: "#f59e0b",
      waveColor: "#f59e0b",
      gradient:
        "linear-gradient(145deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.92) 55%, rgba(180,83,9,0.12) 100%)",
    };
  })();
  // Dashboard uses the same "По проекту" KPI values as marketing presentation card.
  const soldUnits = 30;
  const totalUnits = 169;
  const projectRevenueRub = 350_000_000;
  const factReceiptsRub = 100_447_641;
  const avgPricePerSqmRub = 231_037;

  return {
    asOfIso: asOf.toISOString(),
    project,
    constructionProjectKpi: buildHomeConstructionProjectKpi(asOf, gprTasks),
    tenderBudgetKpi: {
      title: "ОТКЛОНЕНИЕ ОТ ТЕНДЕРНОГО БЮДЖЕТА",
      mainRub: tenderFinancial.deviationRub,
      economyRub: tenderFinancial.economyRub,
      overrunRub: tenderFinancial.overrunRub,
      deviationPct: tenderFinancial.deviationPct,
      concludedPlanRub: tenderFinancial.concludedPlanRub,
      budgetDeviationSegments: tenderDonut.budgetDeviation,
      budgetBlockTenderCount: tenderDonut.budgetBlockTenderCount,
      glowColor: tenderBudgetCardVisual.glowColor,
      waveColor: tenderBudgetCardVisual.waveColor,
      gradient: tenderBudgetCardVisual.gradient,
      badgeTone: tenderBudgetCardTone,
    },
    tmcPurchasedDeviationKpi: {
      title: "ОТКЛОНЕНИЕ ОТ ЗАКУПЛЕННОГО",
      mainRub: tmcFinancial.deviationRub,
      economyRub: tmcFinancial.economyRub,
      overrunRub: tmcFinancial.overrunRub,
      purchasedPlanRub: tmcFinancial.purchasedPlanRub,
      deviationPct: tmcFinancial.deviationPct,
      budgetDeviationSegments: tmcDonut.budgetDeviation,
      glowColor: tmcPurchasedCardVisual.glowColor,
      waveColor: tmcPurchasedCardVisual.waveColor,
      gradient: tmcPurchasedCardVisual.gradient,
      badgeTone: tmcPurchasedCardTone,
    },
    marketingProjectKpi: {
      title: "По проекту",
      soldUnits,
      totalUnits,
      projectRevenueRub,
      factReceiptsRub,
      avgPricePerSqmRub,
    },
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
