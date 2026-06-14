import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
import { matchesNormalizedDealSegment, resolveNormalizedDealRowSegment } from "@/lib/normalizeDealSegment";
import {
  apartmentPlanKpiDedupKey,
  isApartmentKpiDealSoldStatus,
  normalizeDealStatusForKpi,
} from "@/lib/apartmentPlanFactsFromDeals";
import {
  APARTMENT_PLAN_TYPE_KPI_ORDER,
  inferApartmentPlanTypeKeyFromDeal,
  matchApartmentPlanTypeKey,
  selectPlanSliceForApartmentTypeKpi,
  type ApartmentPlanTypeKey,
} from "@/lib/apartmentPlanTypeKpi";
import { normalizeMatchKey } from "@/lib/planDataSource/normalize";
import { formatMonthKeyShortRuYY, normalizeMonthKey } from "@/lib/normalizeMonthKey";
import { selectPlanSliceForParkingKpi } from "@/lib/parkingPlanAnalytics";
import { resolveApartmentsPlanProjectVolume } from "@/lib/planDataSource/selectPlanForKpi";
import { selectPlanSliceForStorageKpi } from "@/lib/storagePlanAnalytics";
import {
  buildSqmDynamicsMonthRange,
  resolveSqmDynamicsMonthKey,
} from "@/lib/sqmPriceDynamicsFromDeals";
import type { BiApartmentsSummarySlice } from "@/lib/planDataSource/apartmentPlanKpiEntity";
import type { ApartmentPlanCsvNormalizedRow } from "@/lib/planDataSource/types";
import type { ApartmentPlanCsvParseDiagnostics } from "@/lib/planDataSource/types";

export type InventoryDepletionSegmentId = "all-apartments" | ApartmentPlanTypeKey | "parking" | "storage";

export type InventoryDepletionSegmentMeta = {
  id: InventoryDepletionSegmentId;
  label: string;
  soldColor: string;
  remainderMuted: string;
};

export const INVENTORY_DEPLETION_SEGMENT_ORDER: readonly InventoryDepletionSegmentMeta[] = [
  { id: "all-apartments", label: "Все квартиры", soldColor: "#6366F1", remainderMuted: "rgba(99, 102, 241, 0.22)" },
  { id: "apt-1", label: "1-комнатные", soldColor: "#F59E0B", remainderMuted: "rgba(245, 158, 11, 0.22)" },
  { id: "apt-2", label: "2-комнатные", soldColor: "#10B981", remainderMuted: "rgba(16, 185, 129, 0.22)" },
  { id: "apt-3", label: "3-комнатные", soldColor: "#2563EB", remainderMuted: "rgba(37, 99, 235, 0.22)" },
  { id: "apt-4", label: "4-комнатные+", soldColor: "#9333EA", remainderMuted: "rgba(147, 51, 234, 0.22)" },
  { id: "parking", label: "Машино-места", soldColor: "#8B5CF6", remainderMuted: "rgba(139, 92, 246, 0.22)" },
  { id: "storage", label: "Кладовые", soldColor: "#0F172A", remainderMuted: "rgba(15, 23, 42, 0.12)" },
] as const;

export type InventoryDepletionDonutSlice = {
  id: InventoryDepletionSegmentId;
  label: string;
  soldColor: string;
  remainderMuted: string;
  initialSupply: number;
  sold: number;
  remaining: number;
  depletionPct: number | null;
  pieData: { name: string; value: number; fill: string }[];
};

export type InventoryDepletionDynamicsPoint = {
  monthKey: string;
  labelShort: string;
} & Record<`${InventoryDepletionSegmentId}Remaining`, number>;

export type InventoryDepletionDebug = {
  dealsLoaded: number;
  matchedSales: number;
  rejectedNegative: number;
  rejectedNoMonth: number;
  rejectedSegment: number;
  apartmentsWithoutRoomType: number;
  uniqueDealTypes: string[];
  uniqueStatusLabels: string[];
  uniqueTypeLabels: string[];
  sampleInitialSupply: Record<InventoryDepletionSegmentId, number>;
  sampleSold: Record<InventoryDepletionSegmentId, number>;
};

export type InventoryDepletionBundle = {
  hasPlan: boolean;
  hasSales: boolean;
  timelineMonthKeys: string[];
  donuts: InventoryDepletionDonutSlice[];
  dynamics: InventoryDepletionDynamicsPoint[];
  debug: InventoryDepletionDebug;
};

function defaultPeriodKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function planOpts(
  objectId: string,
  objects: readonly { id: string; name: string }[],
  csvType?: ApartmentPlanCsvParseDiagnostics["csvType"],
) {
  return {
    period: "month" as const,
    currentPeriodKey: defaultPeriodKey(),
    objectId,
    objects,
    csvType,
  };
}

/** Исходный ассортимент по сегментам из CSV плана KPI (как в блоках «Структура продаж»). */
export function resolveInventoryInitialSupply(args: {
  planRows: readonly ApartmentPlanCsvNormalizedRow[] | null | undefined;
  biApartmentsSummary?: BiApartmentsSummarySlice | null;
  objectId: string;
  objects: readonly { id: string; name: string }[];
  csvType?: ApartmentPlanCsvParseDiagnostics["csvType"];
}): Record<InventoryDepletionSegmentId, number> {
  const rows = args.planRows ?? [];
  const opts = planOpts(args.objectId, args.objects, args.csvType);
  const byType: Record<ApartmentPlanTypeKey, number> = {
    "apt-1": 0,
    "apt-2": 0,
    "apt-3": 0,
    "apt-4": 0,
  };

  if (rows.length > 0) {
    for (const meta of APARTMENT_PLAN_TYPE_KPI_ORDER) {
      const slice = selectPlanSliceForApartmentTypeKpi(rows, meta.key, opts);
      byType[meta.key] = slice?.totalVolume ?? 0;
    }
  }

  const sumTypes = byType["apt-1"] + byType["apt-2"] + byType["apt-3"] + byType["apt-4"];
  const allFromSummary =
    rows.length > 0
      ? resolveApartmentsPlanProjectVolume(rows, {
          objectId: args.objectId,
          objects: args.objects,
          biApartmentsSummary: args.biApartmentsSummary ?? null,
        })
      : 0;
  const allApartments = allFromSummary > 0 ? allFromSummary : sumTypes;

  const parkingSlice = rows.length > 0 ? selectPlanSliceForParkingKpi(rows, opts) : null;
  const storageSlice = rows.length > 0 ? selectPlanSliceForStorageKpi(rows, opts) : null;

  return {
    "all-apartments": Math.max(0, Math.round(allApartments)),
    "apt-1": Math.max(0, Math.round(byType["apt-1"])),
    "apt-2": Math.max(0, Math.round(byType["apt-2"])),
    "apt-3": Math.max(0, Math.round(byType["apt-3"])),
    "apt-4": Math.max(0, Math.round(byType["apt-4"])),
    parking: Math.max(0, Math.round(parkingSlice?.totalVolume ?? 0)),
    storage: Math.max(0, Math.round(storageSlice?.totalVolume ?? 0)),
  };
}

type MonthCounts = Map<string, number>;

function emptyMonthCounts(): MonthCounts {
  return new Map();
}

function bumpMonth(map: MonthCounts, monthKey: string, delta = 1): void {
  map.set(monthKey, (map.get(monthKey) ?? 0) + delta);
}

function hasNegativeSaleIndicators(blob: string): boolean {
  return (
    blob.includes("отказ") ||
    blob.includes("расторж") ||
    blob.includes("отмен") ||
    blob.includes("аннулир") ||
    blob.includes("отклон") ||
    (blob.includes("бронь") && !blob.includes("дду") && !/(продан|дду|ddu|заключ|подписан)/.test(blob))
  );
}

/** Месяц сделки — как в «Сделки» / `buildDealsSegmentMonthAnalytics`: `monthKey`, затем дата. */
export function resolveInventoryDepletionMonthKey(row: NormalizedDealRow): string | null {
  const mk = String(row.monthKey ?? "").trim();
  if (/^\d{4}-\d{2}$/.test(mk)) return mk;
  const norm = normalizeMonthKey(mk);
  if (norm && /^\d{4}-\d{2}$/.test(norm)) return norm;
  return resolveSqmDynamicsMonthKey(row);
}

/**
 * Комнатность: `estate_rooms`, подписи JSON («1к», «1-комнатная», …), как в KPI.
 */
export function inferInventoryDepletionApartmentType(row: NormalizedDealRow): ApartmentPlanTypeKey | null {
  const fromDeal = inferApartmentPlanTypeKeyFromDeal(row);
  if (fromDeal) return fromDeal;

  const hints = [
    row.objectParams.type,
    row.typeLabel,
    row.dealTypeLabel,
    row.objectLabel,
    row.objectUnitLabel,
    row.normalizedType,
  ]
    .filter((s) => s != null && String(s).trim() !== "")
    .join(" ");
  const norm = normalizeMatchKey(hints);
  const blob = `${norm} ${hints}`.toLowerCase().replace(/ё/g, "е");

  if (/\b1\s*к\b|1к\b|1-room|одноком|студи/i.test(blob)) return "apt-1";
  if (/\b2\s*к\b|2к\b|2-room|двухкомн/i.test(blob)) return "apt-2";
  if (/\b3\s*к\b|3к\b|3-room|трехкомн|трёхкомн/i.test(blob)) return "apt-3";
  if (/\b4\s*к\b|4к\+|4-room|четырехкомн|4\s*ком/i.test(blob)) return "apt-4";

  return matchApartmentPlanTypeKey(norm, hints);
}

/**
 * Учёт сделки в выбытии: тот же поток, что «Сделки» / динамика ₽/м² — без лишнего статус-фильтра;
 * исключаем только явный отказ / расторжение / «бронь» без ДДУ.
 */
export function isInventoryDepletionCountedDeal(row: NormalizedDealRow): boolean {
  const seg = resolveNormalizedDealRowSegment(row);
  if (seg !== "apartment" && seg !== "parking" && seg !== "storage") {
    return false;
  }
  if (!resolveInventoryDepletionMonthKey(row)) return false;
  if (isApartmentKpiDealSoldStatus(row.statusLabel, row.dealKindLabel)) return true;
  const blob = normalizeDealStatusForKpi(row.statusLabel, row.dealKindLabel);
  if (hasNegativeSaleIndicators(blob)) return false;
  return true;
}

function inventoryDepletionTimelineFromDeals(rows: readonly NormalizedDealRow[]): string[] {
  const months: string[] = [];
  for (const r of rows) {
    const mk = resolveInventoryDepletionMonthKey(r);
    if (mk) months.push(mk);
  }
  if (months.length === 0) return [];
  months.sort();
  return buildSqmDynamicsMonthRange(months[0]!, months[months.length - 1]!);
}

/**
 * Продажи из JSON: квартиры — уникальные лоты (первая сделка), паркинг/кладовые — сделки из выгрузки.
 */
export function inventoryDepletionSalesFromDeals(rows: readonly NormalizedDealRow[]): {
  soldTotal: Record<InventoryDepletionSegmentId, number>;
  soldByMonth: Record<InventoryDepletionSegmentId, MonthCounts>;
  debug: Omit<
    InventoryDepletionDebug,
    "dealsLoaded" | "uniqueDealTypes" | "uniqueStatusLabels" | "uniqueTypeLabels" | "sampleInitialSupply" | "sampleSold"
  >;
} {
  const soldTotal: Record<InventoryDepletionSegmentId, number> = {
    "all-apartments": 0,
    "apt-1": 0,
    "apt-2": 0,
    "apt-3": 0,
    "apt-4": 0,
    parking: 0,
    storage: 0,
  };
  const soldByMonth: Record<InventoryDepletionSegmentId, MonthCounts> = {
    "all-apartments": emptyMonthCounts(),
    "apt-1": emptyMonthCounts(),
    "apt-2": emptyMonthCounts(),
    "apt-3": emptyMonthCounts(),
    "apt-4": emptyMonthCounts(),
    parking: emptyMonthCounts(),
    storage: emptyMonthCounts(),
  };

  let rejectedNegative = 0;
  let rejectedNoMonth = 0;
  let rejectedSegment = 0;
  let apartmentsWithoutRoomType = 0;

  const apartmentRows = rows.filter((r) => matchesNormalizedDealSegment(r, "apartment"));
  for (const r of apartmentRows) {
    if (!resolveInventoryDepletionMonthKey(r)) rejectedNoMonth += 1;
    else if (!isInventoryDepletionCountedDeal(r)) rejectedNegative += 1;
  }

  const aptFirstFinal = new Map<string, { monthKey: string; typeKey: ApartmentPlanTypeKey | null }>();
  for (const r of [...apartmentRows]
    .filter((r) => isInventoryDepletionCountedDeal(r) && resolveInventoryDepletionMonthKey(r))
    .sort((a, b) => {
      const d = a.dealDateMs - b.dealDateMs;
      return d !== 0 ? d : apartmentPlanKpiDedupKey(a).localeCompare(apartmentPlanKpiDedupKey(b));
    })) {
    const k = apartmentPlanKpiDedupKey(r);
    if (aptFirstFinal.has(k)) continue;
    aptFirstFinal.set(k, {
      monthKey: resolveInventoryDepletionMonthKey(r)!,
      typeKey: inferInventoryDepletionApartmentType(r),
    });
  }

  for (const { monthKey, typeKey } of aptFirstFinal.values()) {
    soldTotal["all-apartments"] += 1;
    bumpMonth(soldByMonth["all-apartments"], monthKey);
    if (typeKey) {
      soldTotal[typeKey] += 1;
      bumpMonth(soldByMonth[typeKey], monthKey);
    } else {
      apartmentsWithoutRoomType += 1;
    }
  }

  for (const r of rows) {
    const seg = resolveNormalizedDealRowSegment(r);
    if (seg !== "apartment" && seg !== "parking" && seg !== "storage") {
      rejectedSegment += 1;
    }
  }

  for (const r of rows) {
    const segmentKey = resolveNormalizedDealRowSegment(r);
    if (segmentKey !== "parking" && segmentKey !== "storage") continue;
    const mk = resolveInventoryDepletionMonthKey(r);
    if (!mk) {
      rejectedNoMonth += 1;
      continue;
    }
    if (!isInventoryDepletionCountedDeal(r)) {
      rejectedNegative += 1;
      continue;
    }
    soldTotal[segmentKey] += 1;
    bumpMonth(soldByMonth[segmentKey], mk);
  }

  const matchedSales =
    soldTotal["all-apartments"] + soldTotal.parking + soldTotal.storage;

  return {
    soldTotal,
    soldByMonth,
    debug: {
      matchedSales,
      rejectedNegative,
      rejectedNoMonth,
      rejectedSegment,
      apartmentsWithoutRoomType,
    },
  };
}

function buildDonutSlice(
  meta: InventoryDepletionSegmentMeta,
  initialSupply: number,
  sold: number,
): InventoryDepletionDonutSlice {
  const remaining = Math.max(0, initialSupply - sold);
  const depletionPct = initialSupply > 0 ? Math.round((sold / initialSupply) * 1000) / 10 : null;
  const pieData =
    sold <= 0 && remaining <= 0
      ? [{ name: "Остаток", value: 1, fill: meta.remainderMuted }]
      : [
          ...(sold > 0 ? [{ name: "Продано", value: sold, fill: meta.soldColor }] : []),
          ...(remaining > 0 ? [{ name: "Остаток", value: remaining, fill: meta.remainderMuted }] : []),
        ];
  return {
    id: meta.id,
    label: meta.label,
    soldColor: meta.soldColor,
    remainderMuted: meta.remainderMuted,
    initialSupply,
    sold,
    remaining,
    depletionPct,
    pieData,
  };
}

function cumulativeSoldUntil(monthCounts: MonthCounts, throughMonthKey: string): number {
  let sum = 0;
  for (const [mk, n] of monthCounts) {
    if (mk <= throughMonthKey) sum += n;
  }
  return sum;
}

export function buildInventoryDepletionBundle(args: {
  planRows: readonly ApartmentPlanCsvNormalizedRow[] | null | undefined;
  biApartmentsSummary?: BiApartmentsSummarySlice | null;
  objectId: string;
  objects: readonly { id: string; name: string }[];
  csvType?: ApartmentPlanCsvParseDiagnostics["csvType"];
  dealRows: readonly NormalizedDealRow[];
}): InventoryDepletionBundle {
  const initial = resolveInventoryInitialSupply({
    planRows: args.planRows,
    biApartmentsSummary: args.biApartmentsSummary,
    objectId: args.objectId,
    objects: args.objects,
    csvType: args.csvType,
  });
  const { soldTotal, soldByMonth, debug: salesDebug } = inventoryDepletionSalesFromDeals(args.dealRows);

  const hasPlan = Object.values(initial).some((v) => v > 0);
  const hasSales = Object.values(soldTotal).some((v) => v > 0);

  const timelineFromDeals = inventoryDepletionTimelineFromDeals(args.dealRows);
  const timelineMonthKeys =
    timelineFromDeals.length > 0
      ? timelineFromDeals
      : hasSales
        ? buildSqmDynamicsMonthRange(defaultPeriodKey(), defaultPeriodKey())
        : [];

  const debug: InventoryDepletionDebug = {
    dealsLoaded: args.dealRows.length,
    matchedSales: salesDebug.matchedSales,
    rejectedNegative: salesDebug.rejectedNegative,
    rejectedNoMonth: salesDebug.rejectedNoMonth,
    rejectedSegment: salesDebug.rejectedSegment,
    apartmentsWithoutRoomType: salesDebug.apartmentsWithoutRoomType,
    uniqueDealTypes: [...new Set(args.dealRows.map((r) => r.dealType))],
    uniqueStatusLabels: [...new Set(args.dealRows.map((r) => r.statusLabel).filter(Boolean))].slice(0, 12),
    uniqueTypeLabels: [...new Set(args.dealRows.map((r) => r.typeLabel).filter(Boolean))].slice(0, 12),
    sampleInitialSupply: initial,
    sampleSold: soldTotal,
  };

  const dynamics: InventoryDepletionDynamicsPoint[] = timelineMonthKeys.map((monthKey) => {
    const point: InventoryDepletionDynamicsPoint = {
      monthKey,
      labelShort: formatMonthKeyShortRuYY(monthKey),
      "all-apartmentsRemaining": 0,
      "apt-1Remaining": 0,
      "apt-2Remaining": 0,
      "apt-3Remaining": 0,
      "apt-4Remaining": 0,
      parkingRemaining: 0,
      storageRemaining: 0,
    };
    for (const meta of INVENTORY_DEPLETION_SEGMENT_ORDER) {
      const init = initial[meta.id];
      const cum = cumulativeSoldUntil(soldByMonth[meta.id], monthKey);
      const key = `${meta.id}Remaining` as keyof InventoryDepletionDynamicsPoint;
      (point as Record<string, number>)[key] = Math.max(0, init - cum);
    }
    return point;
  });

  const donuts = INVENTORY_DEPLETION_SEGMENT_ORDER.map((meta) =>
    buildDonutSlice(meta, initial[meta.id], soldTotal[meta.id]),
  );

  return { hasPlan, hasSales, timelineMonthKeys, donuts, dynamics, debug };
}

export function inventoryDepletionBundleHasSales(bundle: InventoryDepletionBundle): boolean {
  return bundle.hasSales;
}
