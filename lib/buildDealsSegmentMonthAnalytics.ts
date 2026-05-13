import {
  DEAL_SEGMENT_LABEL_RU,
  type DealSegmentKey,
  type NormalizedDealRow,
} from "@/components/marketing/DealsSection";

/** Четыре сегмента недвижимости для аналитики «Сделки» (без «Прочее»). */
export const DEALS_ANALYTICS_SEGMENT_KEYS = ["apartment", "parking", "storage", "commercial"] as const;
export type DealsAnalyticsSegmentKey = (typeof DEALS_ANALYTICS_SEGMENT_KEYS)[number];

export const DEALS_SEGMENT_LABELS: Record<DealsAnalyticsSegmentKey, string> = {
  apartment: DEAL_SEGMENT_LABEL_RU.apartment,
  parking: DEAL_SEGMENT_LABEL_RU.parking,
  storage: DEAL_SEGMENT_LABEL_RU.storage,
  commercial: DEAL_SEGMENT_LABEL_RU.commercial,
};

export const DEALS_SEGMENT_ACCENT_HEX: Record<DealsAnalyticsSegmentKey, string> = {
  apartment: "#6366f1",
  parking: "#8b5cf6",
  storage: "#06b6d4",
  commercial: "#f97316",
};

/** Чуть светлее столбца «пик» (читаемость на тёмном и светлом фоне). */
export const DEALS_SEGMENT_PEAK_HEX: Record<DealsAnalyticsSegmentKey, string> = {
  apartment: "#a5b4fc",
  parking: "#c4b5fd",
  storage: "#67e8f9",
  commercial: "#fdba74",
};

export type SegmentMonthPoint = {
  monthKey: string;
  /** Подпись оси: «09.25» */
  labelShort: string;
  /** Тултип / текст: «ноябрь 2025 г.» */
  labelReadable: string;
  deals: number;
  revenueRub: number;
  /**
   * Месяцы после последнего месяца, в котором по данным была хотя бы одна сделка в любом из 4 сегментов.
   * Добивают шкалу до текущего отчётного месяца (нули / плейсхолдер на графике).
   */
  reportingTail: boolean;
};

export type DealsSegmentCardModel = {
  segment: DealsAnalyticsSegmentKey;
  label: string;
  accentHex: string;
  peakAccentHex: string;
  months: SegmentMonthPoint[];
  totalDeals: number;
  totalRevenueRub: number;
  avgCheckRub: number;
  trendLabel: string;
  /** Индекс в `months` максимума сделок (первый при равенстве). */
  peakDealsMonthIndex: number | null;
  /** Индекс в `months` максимума выручки. */
  peakRevenueMonthIndex: number | null;
  /** Подпись для спада или null. */
  declineNote: string | null;
  analyticsWhat: string;
  analyticsWhy: string;
  /** Одна короткая строка для режима презентации (без длинных текстов). */
  presentationInsightLine: string;
};

export type DealsSegmentAnalyticsBundle = {
  /** Единая шкала времени для всех сегментов: от первой активности до max(последняя сделка, текущий отчётный месяц). */
  timelineMonthKeys: string[];
  segments: DealsSegmentCardModel[];
};

function isAnalyticsSegment(d: DealSegmentKey): d is DealsAnalyticsSegmentKey {
  return d !== "other";
}

type MonthCell = { c: number; s: number };

const emptyMonthSlots = (): Record<DealsAnalyticsSegmentKey, MonthCell> => ({
  apartment: { c: 0, s: 0 },
  parking: { c: 0, s: 0 },
  storage: { c: 0, s: 0 },
  commercial: { c: 0, s: 0 },
});

function monthKeyCompact(ym: string): string {
  const [y, m] = ym.split("-");
  if (!y || !m) return ym;
  return `${m}.${y.slice(2)}`;
}

function monthKeyReadable(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
}

/** Следующий YYYY-MM */
function nextMonthKey(ym: string): string {
  const [ys, ms] = ym.split("-");
  let y = Number(ys);
  let mo = Number(ms);
  mo += 1;
  if (mo > 12) {
    mo = 1;
    y += 1;
  }
  return `${y}-${String(mo).padStart(2, "0")}`;
}

/** Все месяцы включительно от from до to (хронологически). */
function enumerateMonthKeys(from: string, to: string): string[] {
  if (from > to) return [];
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = nextMonthKey(cur);
  }
  return out;
}

/** Текущий календарный месяц в формате YYYY-MM (локальное время браузера/Node). */
export function dealsSegmentAnalyticsCurrentMonthKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function maxMonthKey(a: string, b: string): string {
  return a >= b ? a : b;
}

function slotHasActivity(slot: ReturnType<typeof emptyMonthSlots>): boolean {
  return DEALS_ANALYTICS_SEGMENT_KEYS.some((k) => slot[k].c > 0 || slot[k].s > 0);
}

function computeTrendLabel(months: SegmentMonthPoint[]): string {
  if (months.length < 2) return "Недостаточно периодов";
  const a = months[months.length - 2]!;
  const b = months[months.length - 1]!;
  if (a.revenueRub > 0 || b.revenueRub > 0) {
    if (a.revenueRub <= 0 && b.revenueRub > 0) return "Рост выручки";
    if (a.revenueRub > 0) {
      const pct = (b.revenueRub - a.revenueRub) / a.revenueRub;
      if (pct > 0.05) return "Рост выручки";
      if (pct < -0.05) return "Снижение выручки";
    }
  }
  if (a.deals > 0 || b.deals > 0) {
    if (a.deals <= 0 && b.deals > 0) return "Рост числа сделок";
    if (a.deals > 0) {
      const pct = (b.deals - a.deals) / a.deals;
      if (pct > 0.05) return "Рост числа сделок";
      if (pct < -0.05) return "Снижение числа сделок";
    }
  }
  return "Без существенных изменений";
}

function argMaxBy<T>(arr: T[], score: (t: T) => number): number | null {
  if (arr.length === 0) return null;
  let best = 0;
  let bestV = score(arr[0] as T);
  for (let i = 1; i < arr.length; i++) {
    const v = score(arr[i] as T);
    if (v > bestV) {
      bestV = v;
      best = i;
    }
  }
  return bestV > 0 ? best : null;
}

const WHY_COPY: Record<DealsAnalyticsSegmentKey, string> = {
  apartment:
    "Квартиры обычно формируют основной объём выручки и задают ритм плана продаж: отклонения по этому сегменту быстрее всего бьют по прогнозу денег и темпу.",
  parking:
    "Машино-места дополняют жилые сделки и влияют на структуру портфеля и средний чек; их динамика показывает качество дожима и upsell.",
  storage:
    "Кладовые чувствительны к волне основных продаж и промо: полезны для оценки, насколько покупатель доводит сделку до полного комплекта.",
  commercial:
    "Коммерция задаёт отдельный цикл и чек; по ней видно вклад нежилого сегмента в общий результат и баланс микса.",
};

function buildDeclineNote(months: SegmentMonthPoint[], peakDealsIdx: number | null, peakRevIdx: number | null): string | null {
  if (months.length < 3) return null;
  const last = months.length - 1;
  const lastM = months[last]!;
  const peakD = peakDealsIdx != null ? months[peakDealsIdx]!.deals : 0;
  const peakR = peakRevIdx != null ? months[peakRevIdx]!.revenueRub : 0;
  const parts: string[] = [];
  if (peakDealsIdx != null && peakDealsIdx < last && peakD > 0 && lastM.deals < peakD * 0.55) {
    parts.push(
      `после пика по числу сделок (${monthKeyCompact(months[peakDealsIdx]!.monthKey)}) темп ниже`,
    );
  }
  if (peakRevIdx != null && peakRevIdx < last && peakR > 0 && lastM.revenueRub < peakR * 0.55) {
    parts.push(
      `выручка в последнем месяце заметно ниже максимума (${monthKeyCompact(months[peakRevIdx]!.monthKey)})`,
    );
  }
  if (parts.length === 0) return null;
  return `Снижение: ${parts.join("; ")}.`;
}

/** Одна строка для инфографики в презентации: только краткий тренд, без пиков по месяцам. */
function buildPresentationInsightLine(totalDeals: number, trendLabel: string): string {
  if (totalDeals === 0) return "";
  if (trendLabel.includes("Снижение выручки")) return "Снижение выручки";
  if (trendLabel.includes("Снижение числа")) return "Снижение темпа";
  if (trendLabel.includes("Рост выручки")) return "Рост выручки";
  if (trendLabel.includes("Рост числа")) return "Рост сделок";
  if (trendLabel === "Недостаточно периодов") return "";
  return "";
}

function buildAnalyticsWhat(args: {
  segment: DealsAnalyticsSegmentKey;
  label: string;
  months: SegmentMonthPoint[];
  totalDeals: number;
  shareRevPct: number;
  declineNote: string | null;
  timelineFirst: string;
  timelineLast: string;
}): string {
  const {
    segment,
    label,
    months,
    totalDeals,
    shareRevPct,
    declineNote,
    timelineFirst,
    timelineLast,
  } = args;

  if (totalDeals === 0) {
    return `По сегменту «${label}» в выбранном срезе нет зарегистрированных сделок за период с ${monthKeyReadable(timelineFirst)} по ${monthKeyReadable(timelineLast)}.`;
  }

  const sentences: string[] = [];

  if (segment === "apartment" && shareRevPct >= 22) {
    sentences.push(`Квартиры формируют основной объём выручки в этом срезе (около ${Math.round(shareRevPct)}% суммы по четырём сегментам).`);
  } else {
    sentences.push(`«${label}» даёт около ${Math.round(shareRevPct)}% суммарной выручки по квартирам, паркингу, кладовым и коммерции.`);
  }

  if (months.length >= 2) {
    const run = findStrongestRun(months.map((m) => m.deals));
    if (run && run.len >= 2) {
      const a = months[run.start]!;
      const b = months[run.end]!;
      sentences.push(`Самый плотный отрезок по числу сделок подряд — ${monthKeyReadable(a.monthKey)}–${monthKeyReadable(b.monthKey)}.`);
    }
  }

  if (declineNote) {
    sentences.push(declineNote);
  }

  return sentences.join(" ");
}

/** Самый длинный отрезок с ненулевыми значениями (индексы включительно). */
function findStrongestRun(values: number[]): { start: number; end: number; len: number } | null {
  let best: { start: number; end: number; len: number } | null = null;
  let i = 0;
  while (i < values.length) {
    if (values[i] === 0) {
      i++;
      continue;
    }
    const s = i;
    while (i < values.length && values[i]! > 0) i++;
    const e = i - 1;
    const len = e - s + 1;
    if (len >= 2 && (!best || len > best.len)) best = { start: s, end: e, len };
  }
  return best;
}

/**
 * Единая лента месяцев и карточки сегментов: без «пустых» месяцев до старта продаж по проекту (первые реальные сделки),
 * общий диапазон [первый месяц с активностью … max(последний месяц со сделкой, текущий календарный месяц)], пропуски и хвост — нули.
 */
export function buildDealsSegmentAnalyticsBundle(rows: NormalizedDealRow[]): DealsSegmentAnalyticsBundle {
  const perMonth = new Map<string, ReturnType<typeof emptyMonthSlots>>();

  for (const r of rows) {
    if (!isAnalyticsSegment(r.dealType)) continue;
    if (!/^\d{4}-\d{2}$/.test(r.monthKey)) continue;
    const seg = r.dealType;
    let slot = perMonth.get(r.monthKey);
    if (!slot) {
      slot = emptyMonthSlots();
      perMonth.set(r.monthKey, slot);
    }
    slot[seg].c += 1;
    slot[seg].s += Number.isFinite(r.sumRub) ? r.sumRub : 0;
  }

  const rawKeys = [...perMonth.keys()].sort();
  const firstActivity = rawKeys.find((mk) => slotHasActivity(perMonth.get(mk)!));
  const lastDealActivityMonth = [...rawKeys].reverse().find((mk) => slotHasActivity(perMonth.get(mk)!));

  if (!firstActivity || !lastDealActivityMonth) {
    return { timelineMonthKeys: [], segments: [] };
  }

  const timelineEndMonth = maxMonthKey(lastDealActivityMonth, dealsSegmentAnalyticsCurrentMonthKey());
  const timelineMonthKeys = enumerateMonthKeys(firstActivity, timelineEndMonth);

  const segmentTotals = DEALS_ANALYTICS_SEGMENT_KEYS.map((segment) => {
    let td = 0;
    let tr = 0;
    for (const mk of timelineMonthKeys) {
      const cell = perMonth.get(mk)?.[segment] ?? { c: 0, s: 0 };
      td += cell.c;
      tr += cell.s;
    }
    return { segment, totalDeals: td, totalRevenueRub: tr };
  });

  const sumRevAll = segmentTotals.reduce((s, x) => s + x.totalRevenueRub, 0);

  const segments: DealsSegmentCardModel[] = DEALS_ANALYTICS_SEGMENT_KEYS.map((segment) => {
    const months: SegmentMonthPoint[] = timelineMonthKeys.map((mk) => {
      const cell = perMonth.get(mk)?.[segment] ?? { c: 0, s: 0 };
      return {
        monthKey: mk,
        labelShort: monthKeyCompact(mk),
        labelReadable: monthKeyReadable(mk),
        deals: cell.c,
        revenueRub: cell.s,
        reportingTail: mk > lastDealActivityMonth,
      };
    });

    const totalDeals = months.reduce((s, m) => s + m.deals, 0);
    const totalRevenueRub = months.reduce((s, m) => s + m.revenueRub, 0);
    const avgCheckRub = totalDeals > 0 ? totalRevenueRub / totalDeals : 0;
    const trendLabel = totalDeals === 0 ? "Нет сделок" : computeTrendLabel(months);

    const peakDealsMonthIndex = argMaxBy(months, (m) => m.deals);
    const peakRevenueMonthIndex = argMaxBy(months, (m) => m.revenueRub);

    const declineNote =
      totalDeals === 0 ? null : buildDeclineNote(months, peakDealsMonthIndex, peakRevenueMonthIndex);

    const shareRevPct = sumRevAll > 0 ? (totalRevenueRub / sumRevAll) * 100 : 0;

    const analyticsWhat = buildAnalyticsWhat({
      segment,
      label: DEALS_SEGMENT_LABELS[segment],
      months,
      totalDeals,
      shareRevPct,
      declineNote,
      timelineFirst: firstActivity,
      timelineLast: timelineEndMonth,
    });

    const analyticsWhy = WHY_COPY[segment];

    const presentationInsightLine = buildPresentationInsightLine(totalDeals, trendLabel);

    return {
      segment,
      label: DEALS_SEGMENT_LABELS[segment],
      accentHex: DEALS_SEGMENT_ACCENT_HEX[segment],
      peakAccentHex: DEALS_SEGMENT_PEAK_HEX[segment],
      months,
      totalDeals,
      totalRevenueRub,
      avgCheckRub,
      trendLabel,
      peakDealsMonthIndex: peakDealsMonthIndex,
      peakRevenueMonthIndex: peakRevenueMonthIndex,
      declineNote,
      analyticsWhat,
      analyticsWhy,
      presentationInsightLine,
    };
  });

  return { timelineMonthKeys, segments };
}

/** @deprecated Предпочтительнее {@link buildDealsSegmentAnalyticsBundle}. */
export function buildDealsSegmentCardModels(rows: NormalizedDealRow[]): DealsSegmentCardModel[] {
  return buildDealsSegmentAnalyticsBundle(rows).segments;
}
