import { normalizeEntityLabel, normalizeMatchKey } from "@/lib/planDataSource/normalize";

/** Нормализованное имя сегмента для root-row matching. */
export function normalizeEntityRowName(raw: string, segmentNorm?: string): string {
  const base = segmentNorm?.trim() ? segmentNorm : raw;
  return normalizeEntityLabel(base)
    .replace(/[.,;:()[\]{}«»"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactEntityName(name: string): string {
  return name.replace(/\s+/g, "");
}

function matchesEntityKey(name: string, keys: readonly string[]): boolean {
  if (!name) return false;
  const compact = compactEntityName(name);
  return keys.some((k) => {
    if (name === k || compact === compactEntityName(k)) return true;
    if (name.startsWith(`${k} `) || compact.startsWith(k)) return true;
    return false;
  });
}

export const APARTMENT_ROOT_KEYS = ["квартиры", "квартира", "apartments", "apartment"] as const;
export const PARKING_ROOT_KEYS = [
  "парковки",
  "парковка",
  "машиноместа",
  "машино-места",
  "машиноместо",
  "parking",
  "parkinglots",
] as const;
export const STORAGE_ROOT_KEYS = ["кладовые", "кладовка", "кладовки", "storage", "storages"] as const;
export const COMMERCIAL_ROOT_KEYS = [
  "коммерция",
  "коммерческие",
  "коммерческие помещения",
  "commercial",
  "нежилые",
  "нежилое",
] as const;

function isGrandTotalName(name: string, rawLower: string): boolean {
  if (!name) return false;
  if (name === "итого" || name === "всего") return true;
  const compact = compactEntityName(name);
  if (compact === "итого" || compact === "всего") return true;
  if (rawLower === "итого" || rawLower.startsWith("итого ")) return true;
  return false;
}

/** Root-row «Квартиры» (не комнатность, не ИТОГО). */
export function isApartmentRootSummaryRow(segmentNorm: string, rawLabel = segmentNorm): boolean {
  const rawLower = String(rawLabel ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\u00a0/g, " ")
    .trim();
  const name = normalizeEntityRowName(rawLabel, segmentNorm);
  if (isGrandTotalName(name, rawLower)) return false;
  if (normalizeEntityLabel(name) === "квартиры" || matchesEntityKey(name, APARTMENT_ROOT_KEYS)) return true;
  if (/[1-4]\s*[-–]?\s*ком/.test(name)) return false;
  if (name.includes("комнат") && !matchesEntityKey(name, APARTMENT_ROOT_KEYS)) return false;
  return false;
}

export function isParkingRootSummaryRow(segmentNorm: string, rawLabel = segmentNorm): boolean {
  if (isApartmentRootSummaryRow(segmentNorm, rawLabel)) return false;
  const rawLower = String(rawLabel ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .trim();
  const name = normalizeEntityRowName(rawLabel, segmentNorm);
  if (isGrandTotalName(name, rawLower)) return false;
  if (matchesEntityKey(name, PARKING_ROOT_KEYS)) return true;
  if (name.includes("подзем") || name.includes("назем") || name.includes("мото")) return false;
  return false;
}

export function isStorageRootSummaryRow(segmentNorm: string, rawLabel = segmentNorm): boolean {
  if (isApartmentRootSummaryRow(segmentNorm, rawLabel) || isParkingRootSummaryRow(segmentNorm, rawLabel)) {
    return false;
  }
  const rawLower = String(rawLabel ?? "").toLowerCase().replace(/ё/g, "е").trim();
  const name = normalizeEntityRowName(rawLabel, segmentNorm);
  if (isGrandTotalName(name, rawLower)) return false;
  return matchesEntityKey(name, STORAGE_ROOT_KEYS);
}

export function isCommercialRootSummaryRow(segmentNorm: string, rawLabel = segmentNorm): boolean {
  if (
    isApartmentRootSummaryRow(segmentNorm, rawLabel) ||
    isParkingRootSummaryRow(segmentNorm, rawLabel) ||
    isStorageRootSummaryRow(segmentNorm, rawLabel)
  ) {
    return false;
  }
  const rawLower = String(rawLabel ?? "").toLowerCase().replace(/ё/g, "е").trim();
  const name = normalizeEntityRowName(rawLabel, segmentNorm);
  if (isGrandTotalName(name, rawLower)) return false;
  return matchesEntityKey(name, COMMERCIAL_ROOT_KEYS);
}
