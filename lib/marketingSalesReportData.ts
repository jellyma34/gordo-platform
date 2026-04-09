/**
 * Структура отчёта продаж (готова к подмене ответом API).
 * salesData: units | area | revenue | avgPrice — каждый блок с полным набором KPI.
 */

export type SalesMetricBlock = {
  planProject: number;
  planMonth: number;
  planCumulative: number;
  factMonth: number;
  factCumulative: number;
  deviationMonth: number;
  deviationCumulative: number;
  /** % выполнения к накопительному плану (факт / план * 100). */
  percentComplete: number;
  /** Доля накопительного плана в плане проекта (план накопит. / план проекта * 100). */
  percentOfTotal: number;
};

export type SalesDataCube = {
  units: SalesMetricBlock;
  area: SalesMetricBlock;
  revenue: SalesMetricBlock;
  avgPrice: SalesMetricBlock;
};

export type SalesCategoryId = "apartments" | "parking" | "storages" | "commercial";

export type SalesCategoryBreakdownRow = {
  id: SalesCategoryId;
  name: string;
  planCumulative: number;
  factCumulative: number;
  deviation: number;
  percentComplete: number;
};

export type SalesDeviationComment = {
  id: string;
  text: string;
  categoryId?: SalesCategoryId;
};

/** Категория для radar: выручка накопительно (руб.) — % = fact / plan * 100. */
export type SalesRadarCategoryRow = {
  id: string;
  /** Подпись на оси (краткая). */
  axisLabel: string;
  /** Полное название для tooltip. */
  name: string;
  planCumulative: number;
  factCumulative: number;
};

/** Срез метрики в точке ряда: план, факт и накопительный прогноз. */
export type SalesSeriesMetricSlice = {
  planCumulative: number;
  factCumulative: number;
  /** Накопительный прогноз (модель) на эту дату. */
  forecastCumulative: number;
};

/** Точка ряда для графика «план / факт / прогноз» (накопительно по периодам). */
export type SalesSeriesPoint = {
  periodKey: string;
  label: string;
  revenue: SalesSeriesMetricSlice;
  units: SalesSeriesMetricSlice;
  area: SalesSeriesMetricSlice;
};

/** Аналитический контекст для блока «План продаж» (по гранулярности ряда). */
export type SalesPlanGranularityAnalytics = {
  /** Ключ периода, в котором зафиксирована отчётная дата (вертикаль на графике). */
  currentPeriodKey: string;
  /** Прогноз % выполнения накопительного плана к концу горизонта при текущем темпе. */
  forecastPercentComplete: number;
  runRate: {
    /** Средняя выручка в месяц (эквивалент; для квартала — /3 для отображения как «в мес.»). */
    avgMonthlyRevenueRub: number;
    /** Прогноз накопительной выручки к концу горизонта (последняя точка прогноза). */
    forecastCumulativeEndRub: number;
    /** План накопительно на конец горизонта. */
    horizonPlanCumulativeRub: number;
  };
};

/**
 * Ответ API / тело отчёта: корень с полем `salesData` (куб metrics) + ряды и разбивки.
 * Пример: `{ salesData: { units, area, revenue, avgPrice }, series, categories, comments }`
 */
export type SalesReportPayload = {
  /** Куб KPI: units, area, revenue (основной), avgPrice — каждый блок с planProject…percentOfTotal. */
  salesData: SalesDataCube;
  /** Ряд для графика по месяцам / кварталам. */
  series: {
    month: SalesSeriesPoint[];
    quarter: SalesSeriesPoint[];
  };
  categories: SalesCategoryBreakdownRow[];
  /** Структура выполнения плана по типам (паучья диаграмма). */
  radarCategories: SalesRadarCategoryRow[];
  comments: SalesDeviationComment[];
  /** Дата актуальности отчёта (ISO). */
  asOf: string;
  projectName?: string;
  /** Прогноз, run rate, метка «текущего» периода на графике. */
  planAnalytics: {
    month: SalesPlanGranularityAnalytics;
    quarter: SalesPlanGranularityAnalytics;
  };
};

export const marketingSalesReportMock: SalesReportPayload = {
  projectName: "ЖК Гордо",
  asOf: "2026-03-31",
  salesData: {
    revenue: {
      planProject: 4_850_000_000,
      planMonth: 420_000_000,
      planCumulative: 1_265_000_000,
      factMonth: 355_000_000,
      factCumulative: 1_088_000_000,
      deviationMonth: -65_000_000,
      deviationCumulative: -177_000_000,
      percentComplete: 86.0,
      percentOfTotal: 26.1,
    },
    units: {
      planProject: 312,
      planMonth: 28,
      planCumulative: 84,
      factMonth: 22,
      factCumulative: 71,
      deviationMonth: -6,
      deviationCumulative: -13,
      percentComplete: 84.5,
      percentOfTotal: 26.9,
    },
    area: {
      planProject: 18_420,
      planMonth: 1650,
      planCumulative: 4980,
      factMonth: 1288,
      factCumulative: 4188,
      deviationMonth: -362,
      deviationCumulative: -792,
      percentComplete: 84.1,
      percentOfTotal: 27.0,
    },
    avgPrice: {
      planProject: 155_448,
      planMonth: 161_290,
      planCumulative: 150_595,
      factMonth: 161_364,
      factCumulative: 153_239,
      deviationMonth: 74,
      deviationCumulative: 2644,
      percentComplete: 101.8,
      percentOfTotal: 97.2,
    },
  },
  planAnalytics: {
    month: {
      currentPeriodKey: "2026-03",
      forecastPercentComplete: 84.2,
      runRate: {
        avgMonthlyRevenueRub: 362_000_000,
        forecastCumulativeEndRub: 1_175_000_000,
        horizonPlanCumulativeRub: 1_265_000_000,
      },
    },
    quarter: {
      currentPeriodKey: "2026-Q1",
      forecastPercentComplete: 84.2,
      runRate: {
        avgMonthlyRevenueRub: 362_000_000,
        forecastCumulativeEndRub: 1_175_000_000,
        horizonPlanCumulativeRub: 1_265_000_000,
      },
    },
  },
  series: {
    month: [
      {
        periodKey: "2026-01",
        label: "янв. 26",
        revenue: {
          planCumulative: 380_000_000,
          factCumulative: 352_000_000,
          forecastCumulative: 365_000_000,
        },
        units: {
          planCumulative: 26,
          factCumulative: 24,
          forecastCumulative: 25,
        },
        area: {
          planCumulative: 1540,
          factCumulative: 1428,
          forecastCumulative: 1480,
        },
      },
      {
        periodKey: "2026-02",
        label: "фев. 26",
        revenue: {
          planCumulative: 780_000_000,
          factCumulative: 698_000_000,
          forecastCumulative: 735_000_000,
        },
        units: {
          planCumulative: 52,
          factCumulative: 46,
          forecastCumulative: 49,
        },
        area: {
          planCumulative: 3080,
          factCumulative: 2736,
          forecastCumulative: 2890,
        },
      },
      {
        periodKey: "2026-03",
        label: "мар. 26",
        revenue: {
          planCumulative: 1_265_000_000,
          factCumulative: 1_088_000_000,
          forecastCumulative: 1_175_000_000,
        },
        units: {
          planCumulative: 84,
          factCumulative: 71,
          forecastCumulative: 77,
        },
        area: {
          planCumulative: 4980,
          factCumulative: 4188,
          forecastCumulative: 4550,
        },
      },
    ],
    quarter: [
      {
        periodKey: "2025-Q4",
        label: "Q4 2025",
        revenue: {
          planCumulative: 920_000_000,
          factCumulative: 895_000_000,
          forecastCumulative: 905_000_000,
        },
        units: {
          planCumulative: 62,
          factCumulative: 60,
          forecastCumulative: 61,
        },
        area: {
          planCumulative: 3660,
          factCumulative: 3540,
          forecastCumulative: 3580,
        },
      },
      {
        periodKey: "2026-Q1",
        label: "Q1 2026",
        revenue: {
          planCumulative: 1_265_000_000,
          factCumulative: 1_088_000_000,
          forecastCumulative: 1_175_000_000,
        },
        units: {
          planCumulative: 84,
          factCumulative: 71,
          forecastCumulative: 77,
        },
        area: {
          planCumulative: 4980,
          factCumulative: 4188,
          forecastCumulative: 4550,
        },
      },
    ],
  },
  radarCategories: [
    {
      id: "apt-1",
      axisLabel: "1-к",
      name: "1-комнатные квартиры",
      planCumulative: 320_000_000,
      factCumulative: 298_000_000,
    },
    {
      id: "apt-2",
      axisLabel: "2-к",
      name: "2-комнатные квартиры",
      planCumulative: 410_000_000,
      factCumulative: 352_000_000,
    },
    {
      id: "apt-3",
      axisLabel: "3-к",
      name: "3-комнатные квартиры",
      planCumulative: 180_000_000,
      factCumulative: 168_000_000,
    },
    {
      id: "parking-r",
      axisLabel: "Парк.",
      name: "Парковки",
      planCumulative: 125_000_000,
      factCumulative: 118_000_000,
    },
    {
      id: "storage-r",
      axisLabel: "Клад.",
      name: "Кладовые",
      planCumulative: 48_000_000,
      factCumulative: 52_000_000,
    },
    {
      id: "commercial-r",
      axisLabel: "Комм.",
      name: "Коммерческие помещения",
      planCumulative: 112_000_000,
      factCumulative: 56_000_000,
    },
  ],
  categories: [
    {
      id: "apartments",
      name: "Квартиры",
      planCumulative: 980_000_000,
      factCumulative: 862_000_000,
      deviation: -118_000_000,
      percentComplete: 88.0,
    },
    {
      id: "parking",
      name: "Парковки",
      planCumulative: 125_000_000,
      factCumulative: 118_000_000,
      deviation: -7_000_000,
      percentComplete: 94.4,
    },
    {
      id: "storages",
      name: "Кладовые",
      planCumulative: 48_000_000,
      factCumulative: 52_000_000,
      deviation: 4_000_000,
      percentComplete: 108.3,
    },
    {
      id: "commercial",
      name: "Коммерция",
      planCumulative: 112_000_000,
      factCumulative: 56_000_000,
      deviation: -56_000_000,
      percentComplete: 50.0,
    },
  ],
  comments: [
    {
      id: "c1",
      text: "Отставание по квартирам: концентрация спроса на типовых планировках; удорожание ипотечного плеча.",
      categoryId: "apartments",
    },
    {
      id: "c2",
      text: "Коммерция: задержка согласований арендаторов по двум якорным площадям.",
      categoryId: "commercial",
    },
    {
      id: "c3",
      text: "Паркинг: небольшое отставание из-за привязки к этапу выдачи ключей по корпусу Б.",
      categoryId: "parking",
    },
    {
      id: "c4",
      text: "Общий фон: сезонное проседание трафика лидов в феврале (маркетинговый отчёт).",
    },
  ],
};
