export type RelatedDeviation = {
  section: string;
  deviation_days: number;
  comment: string;
  link: string;
};

const RELATED_BY_GLOBAL_TASK_ID: Record<string, RelatedDeviation[]> = {
  "2.04.01": [
    {
      section: "ТМЦ",
      deviation_days: 7,
      comment: "Смещение графика отгрузок",
      link: "/edit/construction?section=tmc",
    },
  ],
  "2.05.01": [
    {
      section: "Тендеры",
      deviation_days: 12,
      comment: "Задержка поставки",
      link: "/edit/construction?section=tenders",
    },
  ],
  "2.06.01": [
    {
      section: "ТМЦ",
      deviation_days: 7,
      comment: "Смещение графика отгрузок",
      link: "/edit/construction?section=tmc",
    },
  ],
};

export function getRelatedDeviations(globalTaskId: string): RelatedDeviation[] {
  return RELATED_BY_GLOBAL_TASK_ID[globalTaskId] ?? [];
}
