import type { DealExportRow, DealSegmentKey, NormalizedDealRow, NormalizedObjectType } from "@/components/marketing/DealsSection";
import { inferDealProductSegmentFromText } from "@/lib/marketingDealSegmentInference";

export type DealProductSegment = Exclude<NormalizedObjectType, "unknown">;

const SEGMENT_HINT_KEYS = [
  "objectType",
  "object_type",
  "segment",
  "roomType",
  "room_type",
  "product_type",
  "productType",
  "typology",
  "layout",
  "layout_type",
  "layoutType",
  "type",
] as const;

function plainSegmentText(raw: string | null | undefined): string {
  return String(raw ?? "")
    .normalize("NFKD")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е");
}

function pickHintField(root: unknown, key: string): string {
  if (root == null || typeof root !== "object" || Array.isArray(root)) return "";
  const v = (root as Record<string, unknown>)[key];
  if (v == null) return "";
  const s = String(v).trim();
  return s.length > 0 ? s : "";
}

/** Явные коды `category` (CRM) → сегмент. */
export function segmentFromCategorySlugOnly(slug: string): NormalizedObjectType | null {
  if (
    slug === "garage" ||
    slug === "parking" ||
    slug === "parking_place" ||
    slug === "parking_space" ||
    slug === "lot_parking" ||
    slug === "car_space" ||
    slug === "мм" ||
    slug === "mm"
  )
    return "parking";
  if (slug === "storageroom" || slug === "storage") return "storage";
  if (slug === "comm" || slug === "commercial" || slug === "retail" || slug === "office") return "commercial";
  return null;
}

/**
 * Единая нормализация подписи / кода типа объекта из JSON (objectType, segment, category_name, …).
 */
export function normalizeDealSegment(raw: string | null | undefined): DealProductSegment | null {
  const t = plainSegmentText(raw);
  if (!t) return null;

  if (
    t.includes("машино") ||
    t.includes("паркинг") ||
    t.includes("мотомест") ||
    t.includes("мото-мест") ||
    t.includes("гараж") ||
    /\bм\s*\/\s*м\b/.test(t) ||
    t.includes("м/м") ||
    /\bparking\b/.test(t) ||
    /\bcar\s*-?\s*space\b/.test(t)
  ) {
    return "parking";
  }

  if (
    t.includes("клад") ||
    t.includes("келлер") ||
    t.includes("storageroom") ||
    (/\bstorage\b/.test(t) && !t.includes("room type"))
  ) {
    return "storage";
  }

  if (
    t.includes("коммерц") ||
    t.includes("неторгов") ||
    t.includes("commercial") ||
    t.includes("офис") ||
    t.includes("магазин") ||
    t.includes("торгов")
  ) {
    return "commercial";
  }

  if (
    t.includes("квартир") ||
    t.includes("апарт") ||
    t.includes("студия") ||
    /\b\d+\s*[-‑]?\s*комн/.test(t) ||
    /\b\d+\s*к\b/.test(t)
  ) {
    return "apartment";
  }

  if (/\bмм\b/.test(t) && t.length <= 24) return "parking";

  return inferDealProductSegmentFromText(t);
}

/** Текстовые подсказки с верхнего уровня, deal.* и object.* (objectType, segment, roomType, …). */
export function collectDealSegmentHintsFromExportRow(row: DealExportRow): string {
  const parts: string[] = [];

  const pushRoot = (root: unknown) => {
    if (root == null || typeof root !== "object") return;
    for (const k of SEGMENT_HINT_KEYS) {
      const s = pickHintField(root, k);
      if (s) parts.push(s);
    }
  };

  pushRoot(row);
  const deal = row.deal;
  if (deal != null && typeof deal === "object") {
    pushRoot(deal);
    const nested = (deal as Record<string, unknown>).object;
    pushRoot(nested);
  }
  pushRoot(row.object);

  return parts.join(" ");
}

export function pickDealSegmentDebugFields(row: DealExportRow): {
  objectType: string | null;
  segment: string | null;
  roomType: string | null;
} {
  const pick = (key: (typeof SEGMENT_HINT_KEYS)[number]): string | null => {
    const top = pickHintField(row, key);
    if (top) return top;
    const deal = row.deal;
    if (deal != null && typeof deal === "object") {
      const d = pickHintField(deal, key);
      if (d) return d;
      const nested = (deal as Record<string, unknown>).object;
      const n = pickHintField(nested, key);
      if (n) return n;
    }
    const obj = row.object;
    const o = pickHintField(obj, key);
    return o || null;
  };

  return {
    objectType: pick("objectType") ?? pick("object_type"),
    segment: pick("segment"),
    roomType: pick("roomType") ?? pick("room_type"),
  };
}

/** Сегмент нормализованной строки (dealType + повторная проверка подписей). */
export function resolveNormalizedDealRowSegment(row: NormalizedDealRow): DealSegmentKey {
  const catSlug = String(row.objectCategoryCode ?? "")
    .replace(/\s+/g, "_")
    .replace(/-/g, "_")
    .toLowerCase();
  const fromSlug = segmentFromCategorySlugOnly(catSlug);
  if (fromSlug != null) return fromSlug === "unknown" ? "other" : fromSlug;

  const blob = [
    row.typeLabel,
    row.dealTypeLabel,
    row.objectLabel,
    row.objectUnitLabel,
    row.objectParams?.type,
  ]
    .filter((s) => s != null && String(s).trim() !== "")
    .join(" ");

  const fromNorm = normalizeDealSegment(blob);
  if (fromNorm) return fromNorm;

  return row.dealType;
}

export function matchesNormalizedDealSegment(
  row: NormalizedDealRow,
  segment: "apartment" | "parking" | "storage" | "commercial",
): boolean {
  return resolveNormalizedDealRowSegment(row) === segment;
}

/** Dev: уникальные поля типа из сырой выгрузки. */
export function logDealSegmentExportDebug(list: readonly DealExportRow[]): void {
  if (process.env.NODE_ENV !== "development") return;
  console.log("OBJECT TYPES", [...new Set(list.map((x) => pickDealSegmentDebugFields(x).objectType))]);
  console.log("SEGMENTS", [...new Set(list.map((x) => pickDealSegmentDebugFields(x).segment))]);
  console.log("ROOM TYPES", [...new Set(list.map((x) => pickDealSegmentDebugFields(x).roomType))]);
}
