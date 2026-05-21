/**
 * Умное сопоставление заголовков CSV плана KPI квартир с каноническими полями.
 * Реальные файлы: RU-названия, регистр, пробелы, BOM обрабатываются на уровне текста и {@link normalizeApartmentPlanHeader}.
 */

import { normalizeCsvHeader } from "@/lib/csvHeaderNormalize";

export type ApartmentPlanCanonicalKey =
  | "segment"
  | "month"
  | "plan_month"
  | "plan_cumulative"
  | "total_volume"
  | "apartment_type";

/** Алиасы: латиница и типичные RU-формулировки от бизнеса / Excel. */
export const COLUMN_ALIASES: Record<Exclude<ApartmentPlanCanonicalKey, "apartment_type">, string[]> = {
  segment: [
    "segment",
    "сегмент",
    "тип",
    "тип квартиры",
    "типквартиры",
    "номенклатура",
    "категория",
    "объект",
    "наименование",
    "наименование сегмента",
    "показатель",
  ],
  month: [
    "month",
    "месяц",
    "период",
    "period",
    "отчетный месяц",
    "отчётный месяц",
    "месяц отчета",
    "месяц отчёта",
    "month_key",
    "дата",
    "год месяц",
  ],
  plan_month: [
    "plan_month",
    "план месяца",
    "план на месяц",
    "план отчетного месяца",
    "план отчётного месяца",
    "план на отчетный месяц",
    "план на отчётный месяц",
    "план по месяцу",
    "план тм",
    "план текущего месяца",
    "план за месяц",
    /** ниже — более общие, сопоставляются после plan_cumulative в порядке канонов */
    "план шт",
    "план шт.",
    "план количество",
    "план продаж",
  ],
  plan_cumulative: [
    "plan_cumulative",
    "накопительный план",
    "план накопительно",
    "план итогом",
    "план накопит",
    "план нарастающим",
    "план нарастающий",
    "план с начала",
    "план ytd",
    "план квартир накопительно",
    "план квартир итогом",
    "итого план",
    "план всего",
    "cumulative plan",
    "plan cum",
    "план cum",
  ],
  total_volume: [
    "total_volume",
    "общий объем",
    "общий объём",
    "всего квартир",
    "объем",
    "объём",
    "количество квартир",
    "кол во квартир",
    "общее количество",
    "лимит",
    "volume",
    "total",
    "всего",
    "шт всего",
    "база",
    "пул",
    "объем плана проекта",
  ],
};

export const APARTMENT_TYPE_ALIASES: string[] = [
  "apartment_type",
  "apartmenttype",
  "тип",
  "тип квартиры",
  "типквартиры",
  "тип_квартиры",
  "type",
  "класс",
  "подтип",
];

function stripBom(s: string): string {
  if (!s) return "";
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s.replace(/^\uFEFF/, "");
}

/**
 * Нормализация заголовка для сравнения: multiline/CRLF/кавычки, lowercase, trim, ё→е.
 */
export function normalizeApartmentPlanHeader(value: unknown): string {
  const base = normalizeCsvHeader(stripBom(String(value ?? "")));
  return base
    .replace(/[\u202f\u2009\u2007\u2008]/g, " ")
    .replace(/[_\-–—]+/g, " ")
    .replace(/[^\p{L}\p{N}\s.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Убрать пробелы для «склейки» сравнения planmonth ↔ plan month */
export function compactNorm(s: string): string {
  return normalizeApartmentPlanHeader(s).replace(/\s/g, "");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const v0 = new Array<number>(bl + 1);
  const v1 = new Array<number>(bl + 1);
  for (let j = 0; j <= bl; j++) v0[j] = j;
  for (let i = 0; i < al; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < bl; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= bl; j++) v0[j] = v1[j];
  }
  return v0[bl];
}

/** 0..100, для коротких подписей заголовков */
function fuzzyScore(headerNorm: string, aliasNorm: string): number {
  if (!headerNorm || !aliasNorm) return 0;
  if (headerNorm === aliasNorm) return 100;
  const hc = compactNorm(headerNorm);
  const ac = compactNorm(aliasNorm);
  if (hc === ac) return 98;
  if (headerNorm.includes(aliasNorm) || aliasNorm.includes(headerNorm)) {
    return 85 - Math.min(15, Math.abs(headerNorm.length - aliasNorm.length));
  }
  if (hc.includes(ac) || ac.includes(hc)) {
    return 82 - Math.min(12, Math.abs(hc.length - ac.length));
  }

  const dist = levenshtein(headerNorm, aliasNorm);
  const maxLen = Math.max(headerNorm.length, aliasNorm.length, 1);
  const ratio = 1 - dist / maxLen;
  if (ratio < 0.55) {
    const ht = new Set(headerNorm.split(" ").filter(Boolean));
    const at = new Set(aliasNorm.split(" ").filter(Boolean));
    if (ht.size && at.size) {
      let inter = 0;
      for (const t of at) if (ht.has(t)) inter++;
      const j = inter / Math.max(ht.size, at.size);
      if (j >= 0.5) return Math.round(55 + j * 35);
    }
    return Math.round(ratio * 50);
  }
  return Math.round(55 + ratio * 40);
}

const REQUIRED_RESOLVE_ORDER: Exclude<ApartmentPlanCanonicalKey, "apartment_type">[] = [
  "segment",
  "month",
  "total_volume",
  "plan_cumulative",
  "plan_month",
];

type HeaderInfo = { index: number; original: string; norm: string };

function bestAliasScore(header: HeaderInfo, aliases: readonly string[]): number {
  let best = 0;
  for (const a of aliases) {
    const an = normalizeApartmentPlanHeader(a);
    if (!an) continue;
    best = Math.max(best, fuzzyScore(header.norm, an));
  }
  return best;
}

export type ResolvedApartmentPlanHeaderMap = {
  segment: string;
  month: string;
  planMonth: string;
  planCumulative: string;
  totalVolume: string;
  apartmentType: string | null;
};

const MIN_SCORE = 52;

/**
 * Сопоставляет оригинальные имена колонок из CSV с полями парсера.
 * Порядок REQUIRED_RESOLVE_ORDER снижает конфликт «план месяца» vs «план накопительно» vs общий «план».
 */
export function resolveApartmentPlanHeaders(metaFields: string[]): { map: ResolvedApartmentPlanHeaderMap } | { error: string } {
  const raw = metaFields.map((h) => String(h ?? "").trim()).filter((h) => h !== "");
  if (!raw.length) {
    return { error: "Не удалось прочитать заголовок CSV." };
  }

  const headers: HeaderInfo[] = raw.map((original, index) => ({
    index,
    original,
    norm: normalizeApartmentPlanHeader(original),
  }));

  const usedHeader = new Set<number>();
  const mapPart: Partial<Record<ApartmentPlanCanonicalKey, string>> = {};

  for (const canonical of REQUIRED_RESOLVE_ORDER) {
    const aliases = COLUMN_ALIASES[canonical];
    let bestI = -1;
    let bestS = MIN_SCORE;
    for (let i = 0; i < headers.length; i++) {
      if (usedHeader.has(i)) continue;
      const s = bestAliasScore(headers[i], aliases);
      if (s > bestS) {
        bestS = s;
        bestI = i;
      }
    }
    if (bestI < 0) {
      const need = REQUIRED_RESOLVE_ORDER.join(", ");
      return {
        error: `В CSV не хватает обязательных колонок (${need}). Распознанные заголовки: ${raw.join(" · ")}.`,
      };
    }
    usedHeader.add(bestI);
    mapPart[canonical] = headers[bestI].original;
  }

  let apartmentTypeHeader: string | null = null;
  let bestAt = -1;
  let bestAtS = MIN_SCORE;
  for (let i = 0; i < headers.length; i++) {
    if (usedHeader.has(i)) continue;
    const s = bestAliasScore(headers[i], APARTMENT_TYPE_ALIASES);
    if (s > bestAtS) {
      bestAtS = s;
      bestAt = i;
    }
  }
  if (bestAt >= 0) {
    usedHeader.add(bestAt);
    apartmentTypeHeader = headers[bestAt].original;
  }

  return {
    map: {
      segment: mapPart.segment!,
      month: mapPart.month!,
      planMonth: mapPart.plan_month!,
      planCumulative: mapPart.plan_cumulative!,
      totalVolume: mapPart.total_volume!,
      apartmentType: apartmentTypeHeader,
    },
  };
}

/** Для панели отладки: канон → оригинальный заголовок файла */
export function columnMappingForDiagnostics(map: ResolvedApartmentPlanHeaderMap): Record<string, string> {
  return {
    segment: map.segment,
    month: map.month,
    plan_month: map.planMonth,
    plan_cumulative: map.planCumulative,
    total_volume: map.totalVolume,
    ...(map.apartmentType ? { apartment_type: map.apartmentType } : {}),
  };
}
