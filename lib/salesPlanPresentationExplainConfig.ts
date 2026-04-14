/**
 * Конфиг соответствия блоков презентации «План продаж» и аналитических рядов.
 * Используется страницей пояснений и документацией; расчёты — в buildSalesPlanPresentationExplain.
 */

export type SalesPlanPresentationExplainChartId =
  | "salesTempo"
  | "structure"
  | "upsell"
  | "rootCauseDeviation";

export const SALES_PLAN_PRESENTATION_EXPLAIN_CHARTS: Record<
  SalesPlanPresentationExplainChartId,
  {
    id: SalesPlanPresentationExplainChartId;
    /** Ключи полей / сущностей рабочего режима и отчёта */
    sources: string[];
    /** Краткая запись формул для UI */
    formulas: string[];
  }
> = {
  salesTempo: {
    id: "salesTempo",
    sources: [
      "marketingMockData.salesPlan.month[].deals → plan_month (после merge)",
      "marketingMockData.salesFact.month[].deals → fact_month",
      "Агрегаты: Σ plan, Σ fact по горизонту; monthFact / planPerMonth",
    ],
    formulas: [
      "Помесячно: deviation = fact_month − plan_month",
      "Норма месяца: planPerMonth = Σ plan / N месяцев",
      "Скользящий факт: actualPerMonth = Σ fact за прошедшие месяцы / прошедшие месяцы",
      "Индикатор темпа (карточка): actualPerMonth / planPerMonth",
      "Сводно по столбцам: Σ fact / Σ plan (отношение объёмов за периоды на графике)",
    ],
  },
  structure: {
    id: "structure",
    sources: [
      "report.radarCategories[] — planCumulative / factCumulative по линейкам (₽), с масштабом сценария",
      "report.categories (apartments) — для «4+» и сверки",
      "report.salesData.revenue / units — средние чеки для экв. шт.",
    ],
    formulas: [
      "По категории: deltaRub = factRub − planRub",
      "Экв. шт.: planUnits = planRub / (planRevenue/planUnits_total), factUnits аналогично по факту",
      "Выполнение % = factUnits / planUnits × 100",
      "Доли: planShare_i = planUnits_i / Σ planUnits; deltaShare = factShare − planShare",
    ],
  },
  rootCauseDeviation: {
    id: "rootCauseDeviation",
    sources: [
      "report.rootCauseWaterfall.drivers[] — базовые вклады драйверов (₽), масштабируются к rev.deviationCumulative",
      "report.series.month|quarter — накопительное отклонение выручки по периодам (тренд)",
      "Те же расчёты, что в блоке «Разложение отклонения» презентации",
    ],
    formulas: [
      "Δ выручки проекта = factCumulative − planCumulative (накопит.)",
      "Водопад: runningEnd_i = runningStart_i + impact_i; impact_i — вклад драйвера i в ₽",
      "Топ структуры: сортировка линеек по Δ ₽ (как в таблице структуры)",
    ],
  },
  upsell: {
    id: "upsell",
    sources: [
      "report.upsellDiagnostic.apartmentDealsPlan / apartmentDealsFact — база квартир",
      "report.upsellDiagnostic.categories[] — planRevenueRub, actualRevenueRub, plannedConversionPct, actualConversionPct",
    ],
    formulas: [
      "Вес строки w_i = planRevenueRub_i / Σ planRevenueRub",
      "Сводная конверсия план: Σ (plannedConversionPct_i × w_i)",
      "Сводная конверсия факт: Σ (actualConversionPct_i × w_i)",
      "Выполнение плана upsell в ₽: totalActual / totalPlan × 100",
      "Интерпретация «upsell / база»: конверсии считаются к сделкам по квартирам (доля доп. продаж от базы)",
    ],
  },
};
