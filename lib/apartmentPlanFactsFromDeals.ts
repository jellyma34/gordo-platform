import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
import { DEALS_LABEL_UNSPECIFIED } from "@/components/marketing/DealsSection";
import { normalizeMonthKey } from "@/lib/normalizeMonthKey";
import { quarterKeyToMonthKeys } from "@/lib/planDataSource/selectPlanForKpi";

/** Отладка: дедупликация сделок → уникальные квартиры для KPI. */
export type ApartmentPlanKpiDealFactDebug = {
  factSource: "system_json";
  dealsLoaded: number;
  uniqueSoldApartments: number;
  factRowsConsidered: number;
  duplicateDealRowsRemoved: number;
  selectedMonth: string;
  endMonthKey: string;
  apartmentRowsInFeed: number;
  statusRejected: number;
};

export type ApartmentPlanKpiDealFacts = {
  factMonth: number;
  factCumulative: number;
  debug: ApartmentPlanKpiDealFactDebug | null;
};

function canonicalMonthKey(row: NormalizedDealRow): string | null {
  const mk = normalizeMonthKey(row.monthKey) ?? normalizeMonthKey(row.dealDate);
  if (mk && /^\d{4}-\d{2}$/.test(mk)) return mk;
  const head = String(row.dealDate ?? "").trim().slice(0, 7);
  return /^\d{4}-\d{2}$/.test(head) ? head : null;
}

/** Ключ дедупликации: номер/ID лота; иначе — «слабый» ключ по дате и сумме. */
export function apartmentPlanKpiDedupKey(r: NormalizedDealRow): string {
  const unit = r.objectUnitLabel?.trim().toLowerCase() ?? "";
  if (unit) return `u:${r.objectLabel}::${unit}`;
  const client = r.clientLabel?.trim().toLowerCase() ?? "";
  return `f:${r.objectLabel}::${r.dealDateMs}::${r.sumRub}::${client}`;
}

/** Нормализация статуса / вида сделки для сопоставления (Продано, ДДУ, sold, successful …). */
export function normalizeDealStatusForKpi(statusLabel: string, dealKindLabel?: string): string {
  const parts = [statusLabel, dealKindLabel ?? ""]
    .map((s) =>
      String(s ?? "")
        .toLowerCase()
        .replace(/\u00a0/g, " ")
        .replace(/ё/g, "е")
        .trim(),
    )
    .filter(Boolean);
  return parts.join(" ");
}

const STATUS_UNSPECIFIED = new Set([
  "",
  "не указан",
  "не указано",
  "unspecified",
  "unknown",
  "—",
  "-",
  "n/a",
  "na",
]);

function isStatusLabelUnspecified(statusLabel: string): boolean {
  const s = String(statusLabel ?? "")
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/ё/g, "е")
    .trim();
  if (STATUS_UNSPECIFIED.has(s)) return true;
  if (s === DEALS_LABEL_UNSPECIFIED.toLowerCase().replace(/ё/g, "е")) return true;
  return false;
}

function hasSoldIndicators(blob: string): boolean {
  return (
    blob.includes("продано") ||
    blob.includes("продана") ||
    blob.includes("продан") ||
    blob.includes("продаж") ||
    blob.includes("sold") ||
    blob.includes("successful") ||
    blob.includes("success") ||
    blob.includes("успеш") ||
    blob.includes("дду") ||
    blob.includes("ddu") ||
    blob.includes("заключ") ||
    blob.includes("подписан") ||
    blob.includes("реализован") ||
    blob.includes("заверш") ||
    blob.includes("closed") ||
    blob.includes("won") ||
    blob.includes("complete")
  );
}

function hasNegativeSaleIndicators(blob: string): boolean {
  return (
    blob.includes("отказ") ||
    blob.includes("расторж") ||
    blob.includes("отмен") ||
    blob.includes("аннулир") ||
    blob.includes("отклон") ||
    (blob.includes("бронь") && !blob.includes("дду") && !hasSoldIndicators(blob))
  );
}

/**
 * Сделка учитывается в факте KPI квартир: статус/вид «продано», «ДДУ», successful и т.п.
 * При пустом статусе в выгрузке — опора на deal_kind (ДДУ, договор).
 */
export function isApartmentKpiDealSoldStatus(statusLabel: string, dealKindLabel = ""): boolean {
  const blob = normalizeDealStatusForKpi(statusLabel, dealKindLabel);
  if (!blob) return false;
  if (hasNegativeSaleIndicators(blob)) return false;
  if (hasSoldIndicators(blob)) return true;
  if (isStatusLabelUnspecified(statusLabel)) {
    const kind = normalizeDealStatusForKpi("", dealKindLabel);
    if (kind.length > 0 && hasSoldIndicators(kind)) return true;
    // Выгрузка без status/deal_kind: не бронь/отказ — считаем закрытой продажей (как в блоке штук).
    if (isStatusLabelUnspecified(dealKindLabel)) {
      return !hasNegativeSaleIndicators(kind);
    }
  }
  return false;
}

function resolveKpiMonthWindow(
  period: "month" | "quarter",
  currentPeriodKey: string,
): { endMonthKey: string; monthKeysInPeriod: Set<string> } {
  if (period === "quarter") {
    const months = quarterKeyToMonthKeys(currentPeriodKey);
    if (months?.length) {
      return {
        endMonthKey: months[months.length - 1]!,
        monthKeysInPeriod: new Set(months),
      };
    }
  }
  const mk = normalizeMonthKey(currentPeriodKey) ?? currentPeriodKey;
  return {
    endMonthKey: mk,
    monthKeysInPeriod: new Set([mk]),
  };
}

/**
 * Факт KPI «квартиры» из JSON сделок (не из CSV).
 * Накопительно: уникальные квартиры с monthKey ≤ конец периода; месяц: первая сделка в месяцах периода.
 */
export function apartmentPlanFactsFromDealsForKpi(
  rows: readonly NormalizedDealRow[],
  opts: { period: "month" | "quarter"; currentPeriodKey: string },
): ApartmentPlanKpiDealFacts {
  const { endMonthKey, monthKeysInPeriod } = resolveKpiMonthWindow(opts.period, opts.currentPeriodKey);
  const selectedMonth =
    opts.period === "month" ? endMonthKey : [...monthKeysInPeriod].sort().join(", ") || endMonthKey;

  const apartmentRows = rows.filter((r) => r.dealType === "apartment");
  let statusRejected = 0;

  const candidates = apartmentRows.filter((r) => {
    if (!isApartmentKpiDealSoldStatus(r.statusLabel, r.dealKindLabel)) {
      statusRejected += 1;
      return false;
    }
    return canonicalMonthKey(r) != null;
  });

  const sorted = [...candidates].sort((a, b) => {
    const d = a.dealDateMs - b.dealDateMs;
    return d !== 0 ? d : apartmentPlanKpiDedupKey(a).localeCompare(apartmentPlanKpiDedupKey(b));
  });

  let duplicateDealRowsRemoved = 0;
  const firstByKey = new Map<string, { monthKey: string }>();

  for (const r of sorted) {
    const mk = canonicalMonthKey(r)!;
    const k = apartmentPlanKpiDedupKey(r);
    if (firstByKey.has(k)) {
      duplicateDealRowsRemoved += 1;
      continue;
    }
    firstByKey.set(k, { monthKey: mk });
  }

  const uniqueList = [...firstByKey.values()];
  const factCumulative = uniqueList.filter((u) => u.monthKey <= endMonthKey).length;
  const factMonth = uniqueList.filter((u) => monthKeysInPeriod.has(u.monthKey)).length;

  return {
    factMonth,
    factCumulative,
    debug: {
      factSource: "system_json",
      dealsLoaded: rows.length,
      uniqueSoldApartments: factCumulative,
      factRowsConsidered: candidates.length,
      duplicateDealRowsRemoved,
      selectedMonth,
      endMonthKey,
      apartmentRowsInFeed: apartmentRows.length,
      statusRejected,
    },
  };
}
