import type { DealDrilldownSegmentRow, SalesFactRow, SalesRevenueRow } from "@/lib/marketingMockData";

export type DealsDynamicsChartRow = {
  periodKey: string;
  label: string;
  deals: number;
  revenue: number;
  /** null если deals = 0 */
  avgCheck: number | null;
  deltaDeals: number | null;
  deltaRevenue: number | null;
  deltaAvgCheck: number | null;
  /** ΔRevenue ≈ volPart + mixPart; volPart = ΔDeals × AvgCheck_prev */
  volPart: number | null;
  /** mixPart = Deals_prev × ΔAvgCheck */
  mixPart: number | null;
};

export function dealsDeltaTone(d: number | null): "up" | "down" | "flat" {
  if (d == null || d === 0) return "flat";
  return d > 0 ? "up" : "down";
}

export function buildDealsDynamicsSeries(
  factRows: Pick<SalesFactRow, "periodKey" | "label" | "deals">[],
  revenueRows: Pick<SalesRevenueRow, "periodKey" | "revenueRub">[],
): DealsDynamicsChartRow[] {
  const revByKey = new Map(revenueRows.map((r) => [r.periodKey, r.revenueRub]));
  const base = factRows
    .map((f) => {
      const revenue = revByKey.get(f.periodKey) ?? 0;
      const deals = f.deals;
      const avgCheck = deals > 0 ? revenue / deals : null;
      return { periodKey: f.periodKey, label: f.label, deals, revenue, avgCheck };
    })
    .sort((a, b) => a.periodKey.localeCompare(b.periodKey));

  return base.map((row, i) => {
    const prev = i > 0 ? base[i - 1]! : null;
    const prevAvgCheck = prev && prev.deals > 0 ? prev.revenue / prev.deals : null;
    const deltaDeals = prev ? row.deals - prev.deals : null;
    const deltaRevenue = prev ? row.revenue - prev.revenue : null;
    const deltaAvgCheck =
      prevAvgCheck != null && row.deals > 0 ? row.revenue / row.deals - prevAvgCheck : null;

    let volPart: number | null = null;
    let mixPart: number | null = null;
    if (prev != null && deltaDeals != null && deltaAvgCheck != null && prevAvgCheck != null) {
      volPart = deltaDeals * prevAvgCheck;
      mixPart = prev.deals * deltaAvgCheck;
    }

    return {
      periodKey: row.periodKey,
      label: row.label,
      deals: row.deals,
      revenue: row.revenue,
      avgCheck: row.avgCheck,
      deltaDeals,
      deltaRevenue,
      deltaAvgCheck,
      volPart,
      mixPart,
    };
  });
}

export function deltaToneClasses(
  t: "up" | "down" | "flat",
  presentation: boolean,
): { text: string; fill: string } {
  if (t === "up")
    return {
      text: presentation ? "text-emerald-300" : "text-emerald-700",
      fill: presentation ? "#6ee7b7" : "#059669",
    };
  if (t === "down")
    return {
      text: presentation ? "text-rose-300" : "text-rose-700",
      fill: presentation ? "#fda4af" : "#e11d48",
    };
  return {
    text: presentation ? "text-slate-400" : "text-slate-500",
    fill: presentation ? "#64748b" : "#94a3b8",
  };
}

/** Нормализованные типы: студии (вкл. коммерция в моке), 1к, 2к, 3к. */
export type TypeBucketKey = "studio" | "k1" | "k2" | "k3";

const BUCKET_LABEL: Record<TypeBucketKey, string> = {
  studio: "Студии",
  k1: "1к",
  k2: "2к",
  k3: "3к",
};

function mapSegmentKeyToBucket(key: string): TypeBucketKey {
  const k = key.toLowerCase();
  if (k === "st" || k === "studio" || k === "com") return "studio";
  if (k === "1k") return "k1";
  if (k === "2k") return "k2";
  if (k === "3k") return "k3";
  return "studio";
}

export function buildTypeBuckets(apartmentTypes: DealDrilldownSegmentRow[]): {
  buckets: { key: TypeBucketKey; label: string; deals: number; revenueRub: number }[];
  sumDeals: number;
  sumRevenue: number;
} {
  const acc: Record<TypeBucketKey, { deals: number; revenueRub: number }> = {
    studio: { deals: 0, revenueRub: 0 },
    k1: { deals: 0, revenueRub: 0 },
    k2: { deals: 0, revenueRub: 0 },
    k3: { deals: 0, revenueRub: 0 },
  };
  for (const row of apartmentTypes) {
    const b = mapSegmentKeyToBucket(row.key);
    acc[b].deals += row.deals;
    acc[b].revenueRub += row.revenueRub;
  }
  const order: TypeBucketKey[] = ["studio", "k1", "k2", "k3"];
  const buckets = order.map((key) => ({
    key,
    label: BUCKET_LABEL[key],
    deals: acc[key].deals,
    revenueRub: acc[key].revenueRub,
  }));
  return {
    buckets,
    sumDeals: buckets.reduce((s, b) => s + b.deals, 0),
    sumRevenue: buckets.reduce((s, b) => s + b.revenueRub, 0),
  };
}

/** Сценарии причинности для подписей в UI. */
export function interpretDynamicsNarrative(row: DealsDynamicsChartRow): string[] {
  const lines: string[] = [];
  const dr = row.deltaRevenue;
  const dd = row.deltaDeals;
  const da = row.deltaAvgCheck;
  const { volPart, mixPart } = row;
  if (dr == null) return lines;

  if (dr > 0 && dd != null && dd < 0 && da != null && da > 0) {
    lines.push("Выручка растёт за счёт среднего чека при меньшем числе сделок.");
  } else if (dr < 0 && dd != null && dd > 0 && da != null && da < 0) {
    lines.push("Выручка падает при росте сделок — давит снижение среднего чека (структура или цена).");
  } else if (dr > 0 && dd != null && dd > 0 && da != null && da < 0) {
    lines.push("Сделок больше, средний чек ниже: выручка удерживается за счёт объёма.");
  } else if (dr < 0 && dd != null && dd < 0 && da != null && da > 0) {
    lines.push("Средний чек вырос, но не компенсировал падение числа сделок.");
  }

  if (volPart != null && mixPart != null && Math.abs(dr) > 1) {
    const av = Math.abs(volPart);
    const am = Math.abs(mixPart);
    const tot = av + am;
    if (tot > 1) {
      if (av >= am * 1.2) lines.push("Доминирует вклад объёма сделок (Δ сделок × чек прошлого периода).");
      else if (am >= av * 1.2) lines.push("Доминирует вклад среднего чека (сделок прошлого периода × Δ чек).");
      else lines.push("Объём и средний чек дают сопоставимый вклад в Δ выручки.");
    }
  }

  if (dd != null && dd < 0) lines.push("Поток сделок слабее — проверить лиды и конверсию воронки.");
  if (da != null && da < 0) lines.push("Средний чек ниже — возможен сдвиг в более дешёвые типы.");
  if (da != null && da > 0) lines.push("Средний чек выше — больше доля дорогих форматов или рост цены.");

  return [...new Set(lines)];
}

/**
 * Краткая интерпретация разложения Δ выручки ≈ (ΔDeals×AvgCheck_prev) + (Deals_prev×ΔAvgCheck).
 * Формулировки про снижение — по ТЗ блока «Выручка + сделки»; про рост — зеркально.
 */
export function interpretRevenueDecompositionFactorSentence(row: DealsDynamicsChartRow): string | null {
  const dr = row.deltaRevenue;
  const vol = row.volPart;
  const mix = row.mixPart;
  if (dr == null || vol == null || mix == null) return null;
  const absV = Math.abs(vol);
  const absM = Math.abs(mix);

  if (dr < 0) {
    if (vol < 0 && mix < 0) {
      return "Снижение вызвано одновременно падением объема и чека";
    }
    if (absV > absM) {
      return "Снижение связано с падением количества сделок";
    }
    if (absM > absV) {
      return "Снижение связано с уменьшением среднего чека";
    }
    return "Снижение выручки — сопоставимый вклад объёма сделок и среднего чека";
  }

  if (dr > 0) {
    if (vol > 0 && mix > 0) {
      return "Рост обеспечен одновременно объёмом сделок и средним чеком";
    }
    if (absV > absM) {
      return "Рост связан с увеличением числа сделок";
    }
    if (absM > absV) {
      return "Рост связан с ростом среднего чека";
    }
    return "Рост выручки — сопоставимый вклад объёма сделок и среднего чека";
  }

  return "Выручка без изменений к предыдущему периоду";
}

export type DealsDynamicsEnrichedRow = DealsDynamicsChartRow & {
  typeStructure: {
    buckets: {
      key: TypeBucketKey;
      label: string;
      deals: number;
      revenueRub: number;
      shareDealsPct: number;
      shareRevPct: number;
      avgPrice: number | null;
    }[];
    sumDeals: number;
    sumRevenue: number;
    matchesOfficialDeals: boolean;
    matchesOfficialRevenue: boolean;
  } | null;
  funnel: { leads: number; conversionPct: number } | null;
  narrative: string[];
};

export function enrichDealsDynamicsRow(
  row: DealsDynamicsChartRow,
  apartmentTypes: DealDrilldownSegmentRow[] | undefined,
  leads: number | undefined,
): DealsDynamicsEnrichedRow {
  const narrative = interpretDynamicsNarrative(row);
  let funnel: DealsDynamicsEnrichedRow["funnel"] = null;
  if (leads != null && leads > 0) {
    funnel = { leads, conversionPct: (row.deals / leads) * 100 };
  }

  let typeStructure: DealsDynamicsEnrichedRow["typeStructure"] = null;
  if (apartmentTypes && apartmentTypes.length > 0) {
    const { buckets: raw, sumDeals, sumRevenue } = buildTypeBuckets(apartmentTypes);
    const denomD = sumDeals > 0 ? sumDeals : row.deals;
    const denomR = sumRevenue > 0 ? sumRevenue : row.revenue;
    const buckets = raw.map((b) => ({
      ...b,
      shareDealsPct: denomD > 0 ? (b.deals / denomD) * 100 : 0,
      shareRevPct: denomR > 0 ? (b.revenueRub / denomR) * 100 : 0,
      avgPrice: b.deals > 0 ? b.revenueRub / b.deals : null,
    }));
    typeStructure = {
      buckets,
      sumDeals,
      sumRevenue,
      matchesOfficialDeals: Math.abs(sumDeals - row.deals) < 0.5,
      matchesOfficialRevenue: Math.abs(sumRevenue - row.revenue) <= Math.max(500_000, row.revenue * 0.002),
    };
  }

  return { ...row, typeStructure, funnel, narrative };
}

/** 100%-стек: доли сделок по типам для Recharts (сумма ~100). */
export function buildStackedShareChartRows(enriched: DealsDynamicsEnrichedRow[]): Array<{
  label: string;
  periodKey: string;
  studio: number;
  k1: number;
  k2: number;
  k3: number;
  totalDeals: number;
  studioDeals: number;
  k1Deals: number;
  k2Deals: number;
  k3Deals: number;
  hasTypeBreakdown: boolean;
}> {
  return enriched.map((r) => {
    if (!r.typeStructure || r.typeStructure.sumDeals <= 0) {
      return {
        label: r.label,
        periodKey: r.periodKey,
        studio: 0,
        k1: 0,
        k2: 0,
        k3: 0,
        totalDeals: r.deals,
        studioDeals: 0,
        k1Deals: 0,
        k2Deals: 0,
        k3Deals: 0,
        hasTypeBreakdown: false,
      };
    }
    const { buckets, sumDeals } = r.typeStructure;
    const dealsOf = (k: TypeBucketKey) => buckets.find((b) => b.key === k)?.deals ?? 0;
    const pct = (k: TypeBucketKey) => {
      const d = dealsOf(k);
      return (d / sumDeals) * 100;
    };
    return {
      label: r.label,
      periodKey: r.periodKey,
      studio: pct("studio"),
      k1: pct("k1"),
      k2: pct("k2"),
      k3: pct("k3"),
      totalDeals: r.deals,
      studioDeals: dealsOf("studio"),
      k1Deals: dealsOf("k1"),
      k2Deals: dealsOf("k2"),
      k3Deals: dealsOf("k3"),
      hasTypeBreakdown: true,
    };
  });
}

/** Доли вклада объёма и «чека» в |Δ выручки| (для полосок «Причина изменения»). */
export function volumePriceMixWeights(row: DealsDynamicsChartRow): { volumePct: number; pricePct: number } | null {
  if (row.volPart == null || row.mixPart == null || row.deltaRevenue == null) return null;
  const a = Math.abs(row.volPart);
  const b = Math.abs(row.mixPart);
  if (a + b < 1) return null;
  return { volumePct: (a / (a + b)) * 100, pricePct: (b / (a + b)) * 100 };
}
