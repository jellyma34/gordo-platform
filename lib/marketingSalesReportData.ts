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

/** Точка ряда для графика «план / факт» (накопительно по периодам). */
export type SalesSeriesPoint = {
  periodKey: string;
  label: string;
  revenue: { planCumulative: number; factCumulative: number };
  units: { planCumulative: number; factCumulative: number };
  area: { planCumulative: number; factCumulative: number };
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
  comments: SalesDeviationComment[];
  /** Дата актуальности отчёта (ISO). */
  asOf: string;
  projectName?: string;
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
  series: {
    month: [
      {
        periodKey: "2026-01",
        label: "янв. 26",
        revenue: { planCumulative: 380_000_000, factCumulative: 352_000_000 },
        units: { planCumulative: 26, factCumulative: 24 },
        area: { planCumulative: 1540, factCumulative: 1428 },
      },
      {
        periodKey: "2026-02",
        label: "фев. 26",
        revenue: { planCumulative: 780_000_000, factCumulative: 698_000_000 },
        units: { planCumulative: 52, factCumulative: 46 },
        area: { planCumulative: 3080, factCumulative: 2736 },
      },
      {
        periodKey: "2026-03",
        label: "мар. 26",
        revenue: { planCumulative: 1_265_000_000, factCumulative: 1_088_000_000 },
        units: { planCumulative: 84, factCumulative: 71 },
        area: { planCumulative: 4980, factCumulative: 4188 },
      },
    ],
    quarter: [
      {
        periodKey: "2025-Q4",
        label: "Q4 2025",
        revenue: { planCumulative: 920_000_000, factCumulative: 895_000_000 },
        units: { planCumulative: 62, factCumulative: 60 },
        area: { planCumulative: 3660, factCumulative: 3540 },
      },
      {
        periodKey: "2026-Q1",
        label: "Q1 2026",
        revenue: { planCumulative: 1_265_000_000, factCumulative: 1_088_000_000 },
        units: { planCumulative: 84, factCumulative: 71 },
        area: { planCumulative: 4980, factCumulative: 4188 },
      },
    ],
  },
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
