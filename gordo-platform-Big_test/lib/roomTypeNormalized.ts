import type { ApartmentPlanTypeKey } from "@/lib/apartmentPlanTypeKpi";
import { matchApartmentPlanTypeKey } from "@/lib/apartmentPlanTypeKpi";

/**
 * Нормализованная комнатность квартир (расширяемый реестр).
 * Новые типы добавляются в {@link APARTMENT_ROOM_TYPE_REGISTRY} с `enabled: true`.
 */
export type RoomTypeNormalized =
  | "1-room"
  | "2-room"
  | "3-room"
  | "4-room"
  | "studio"
  | "5-room"
  | "euro"
  | "penthouse";

/** Фильтр комнатности в UI: агрегат или конкретный тип. */
export type ApartmentRoomTypeFilterKey = "all" | RoomTypeNormalized;

export type ApartmentRoomTypeConfig = {
  id: RoomTypeNormalized;
  label: string;
  shortTabLabel: string;
  /** Связь с legacy `ApartmentPlanTypeKey` (CSV / сделки). */
  planTypeKey: ApartmentPlanTypeKey | null;
  enabled: boolean;
  /** Доп. паттерны поверх {@link matchApartmentPlanTypeKey}. */
  patterns: readonly RegExp[];
};

function roomMatchBlob(segmentNorm: string, rawLabel: string): string {
  return `${segmentNorm} ${rawLabel}`.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

const RE_1 = [
  /\b1\s*к\b/,
  /\b1к\b/,
  /1\s*[-–]?\s*ком/,
  /1\s*комнат/,
  /1\s*br\b/i,
  /однокомн/,
] as const;

const RE_2 = [/2\s*[-–]?\s*ком/, /2\s*комнат/, /2\s*br\b/i, /двухкомн/, /\b2\s*к\b/, /\b2к\b/] as const;
const RE_3 = [/3\s*[-–]?\s*ком/, /3\s*комнат/, /3\s*br\b/i, /трехкомн/, /трёхкомн/, /\b3\s*к\b/, /\b3к\b/] as const;
const RE_4 = [
  /4\s*[-–]?\s*ком/,
  /4\s*\+/,
  /4\s*комнат/,
  /4\s*br\b/i,
  /и\s+более/,
  /четырехкомн/,
  /\b4\s*к\b/,
  /\b4к\b/,
] as const;

/** Реестр комнатности — единый источник для парсинга CSV и UI-вкладок. */
export const APARTMENT_ROOM_TYPE_REGISTRY: readonly ApartmentRoomTypeConfig[] = [
  {
    id: "1-room",
    label: "1-комнатные",
    shortTabLabel: "1-комн",
    planTypeKey: "apt-1",
    enabled: true,
    patterns: RE_1,
  },
  {
    id: "2-room",
    label: "2-комнатные",
    shortTabLabel: "2-комн",
    planTypeKey: "apt-2",
    enabled: true,
    patterns: RE_2,
  },
  {
    id: "3-room",
    label: "3-комнатные",
    shortTabLabel: "3-комн",
    planTypeKey: "apt-3",
    enabled: true,
    patterns: RE_3,
  },
  {
    id: "4-room",
    label: "4-комнатные",
    shortTabLabel: "4-комн",
    planTypeKey: "apt-4",
    enabled: true,
    patterns: RE_4,
  },
  {
    id: "studio",
    label: "Студии",
    shortTabLabel: "Студия",
    planTypeKey: "apt-1",
    enabled: false,
    patterns: [/\bстуди/i, /\bstudio\b/i, /\beuro\s*studio/i],
  },
  {
    id: "5-room",
    label: "5-комнатные",
    shortTabLabel: "5-комн",
    planTypeKey: "apt-4",
    enabled: false,
    patterns: [/5\s*[-–]?\s*ком/, /5\s*комнат/, /5\s*br\b/i, /пятикомн/],
  },
  {
    id: "euro",
    label: "Евро",
    shortTabLabel: "Евро",
    planTypeKey: null,
    enabled: false,
    patterns: [/\bевро\s*\d/, /\beuro\s*\d/i, /\bевроформат/i],
  },
  {
    id: "penthouse",
    label: "Пентхаусы",
    shortTabLabel: "Пентхаус",
    planTypeKey: null,
    enabled: false,
    patterns: [/пентхаус/i, /\bpenthouse\b/i],
  },
] as const;

const PLAN_TYPE_TO_ROOM: Record<ApartmentPlanTypeKey, RoomTypeNormalized> = {
  "apt-1": "1-room",
  "apt-2": "2-room",
  "apt-3": "3-room",
  "apt-4": "4-room",
};

export const ENABLED_APARTMENT_ROOM_TYPES = APARTMENT_ROOM_TYPE_REGISTRY.filter((c) => c.enabled);

export const APARTMENT_ROOM_TYPE_TAB_ORDER: readonly ApartmentRoomTypeFilterKey[] = [
  "all",
  ...ENABLED_APARTMENT_ROOM_TYPES.map((c) => c.id),
];

export function apartmentRoomTypeConfig(id: RoomTypeNormalized): ApartmentRoomTypeConfig | undefined {
  return APARTMENT_ROOM_TYPE_REGISTRY.find((c) => c.id === id);
}

export function planTypeKeyToRoomType(key: ApartmentPlanTypeKey): RoomTypeNormalized {
  return PLAN_TYPE_TO_ROOM[key];
}

export function roomTypeToPlanTypeKey(room: RoomTypeNormalized): ApartmentPlanTypeKey | null {
  const cfg = apartmentRoomTypeConfig(room);
  return cfg?.planTypeKey ?? null;
}

/**
 * Unified mapper: CSV segment, подпись сделки, «1к», «1BR», «1-комн» → `RoomTypeNormalized`.
 */
export function roomTypeNormalized(segmentNorm: string, rawLabel = segmentNorm): RoomTypeNormalized | null {
  const blob = roomMatchBlob(segmentNorm, rawLabel);
  if (!blob) return null;

  for (const cfg of ENABLED_APARTMENT_ROOM_TYPES) {
    for (const re of cfg.patterns) {
      if (re.test(blob)) return cfg.id;
    }
  }

  const legacy = matchApartmentPlanTypeKey(segmentNorm, rawLabel);
  if (legacy) return planTypeKeyToRoomType(legacy);

  return null;
}

export function isRoomTypeNormalized(v: string): v is RoomTypeNormalized {
  return APARTMENT_ROOM_TYPE_REGISTRY.some((c) => c.id === v);
}
