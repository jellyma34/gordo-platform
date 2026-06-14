/**
 * Извлечение сущности «покупатель» из JSON сделки: отделение от CRM staff и приоритет name_full / name_first+last.
 * Не импортирует DealsSection (избегание циклов).
 */

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function deepPick(root: unknown, path: string): unknown {
  const parts = path
    .split(".")
    .map((s) => s.trim())
    .filter(Boolean);
  let cur: unknown = root;
  for (const part of parts) {
    if (!isPlainObject(cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

/** Сегменты пути, типичные для сотрудников CRM / посредников (не покупатель квартиры). */
export const STAFF_PATH_SEGMENT_RE =
  /(^|\.)(managers?|agents?|brokers?|realtors?|employees?|responsible|curators?|sales_managers?|salesManagers?|user_name|username|operators?|consultants?|deal_users?|crm_users?|salespersons?|authors?|created_by|createdBy|updated_by|updatedBy|assignees?|assigners?|performers?|handlers?|opened_by|closed_by|handled_by|исполнител|менеджер|агент|брокер|куратор|сотрудник|ответственн|консультант|оператор|риелтор)\b/i;

export function isStaffDominatedPath(path: string): boolean {
  return STAFF_PATH_SEGMENT_RE.test(path);
}

/** Покупательские контейнеры (без корня строки и без целого deal как «мешка» ключей). */
export function collectBuyerEntityRoots(row: unknown): Record<string, unknown>[] {
  const seen = new Set<Record<string, unknown>>();
  const out: Record<string, unknown>[] = [];
  const add = (x: unknown) => {
    if (!isPlainObject(x) || seen.has(x)) return;
    seen.add(x);
    out.push(x);
  };
  if (!isPlainObject(row)) return out;
  const r = row as Record<string, unknown>;
  add(r.buyer);
  add(r.client);
  add(r.customer);
  add(r.person);
  const deal = r.deal;
  if (isPlainObject(deal)) {
    const d = deal as Record<string, unknown>;
    add(d.buyer);
    add(d.client);
    add(d.customer);
    add(d.person);
    add(d.applicant);
    add(d.purchaser);
    add(d.counterparty);
  }
  return out;
}

/** Плоские поля сделки, где часто лежат ФИО частями (без склейки с manager.*). */
function collectDealFlatBuyerScalarSource(row: unknown): Record<string, unknown> | null {
  if (!isPlainObject(row)) return null;
  const deal = (row as Record<string, unknown>).deal;
  return isPlainObject(deal) ? (deal as Record<string, unknown>) : null;
}

function pickFirstKey(src: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    if (!(k in src)) continue;
    const s = strOrNull(src[k]);
    if (s) return s;
  }
  return null;
}

/** PRIORITY 1: единое поле ФИО / подпись клиента. */
const BUYER_NAME_P1_KEYS = [
  "name_full",
  "nameFull",
  "full_name",
  "fullName",
  "buyer_name",
  "buyerName",
  "client_name",
  "clientName",
  "fio",
];

const NAME_LAST_KEYS = ["name_last", "nameLast", "surname", "last_name", "lastName", "family_name", "familyName"];
const NAME_FIRST_KEYS = ["name_first", "nameFirst", "first_name", "firstName", "given_name", "givenName"];
const NAME_MIDDLE_KEYS = ["name_middle", "nameMiddle", "patronymic", "middle_name", "middleName", "patronym"];

/**
 * Русский официальный порядок в списках: Фамилия Имя Отчество.
 */
export function formatRussianBuyerFio(last: string | null, first: string | null, middle: string | null): string | null {
  const parts = [last?.trim(), first?.trim(), middle?.trim()].filter((x): x is string => Boolean(x && x.length > 0));
  if (parts.length === 0) return null;
  return parts.join(" ");
}

export type BuyerNamePickResult = {
  fullName: string;
  sourcePath: string;
  confidenceScore: number;
};

type NameSource = { src: Record<string, unknown>; label: string };

function collectNameSources(row: unknown): NameSource[] {
  const out: NameSource[] = [];
  let i = 0;
  for (const root of collectBuyerEntityRoots(row)) {
    out.push({ src: root, label: `entity[${i}]` });
    i++;
  }
  const dealFlat = collectDealFlatBuyerScalarSource(row);
  if (dealFlat) out.push({ src: dealFlat, label: "deal" });
  if (isPlainObject(row)) {
    const r = row as Record<string, unknown>;
    const hasNameSignal =
      pickFirstKey(r, BUYER_NAME_P1_KEYS) != null ||
      pickFirstKey(r, NAME_FIRST_KEYS) != null ||
      pickFirstKey(r, NAME_LAST_KEYS) != null ||
      pickFirstKey(r, NAME_MIDDLE_KEYS) != null;
    if (hasNameSignal) out.push({ src: r, label: "row" });
  }
  return out;
}

/**
 * PRIORITY 1: name_full / full_name / buyer_name / client_name …
 * PRIORITY 2: name_last + name_first + name_middle в одном объекте-источнике (максимум совпавших частей).
 */
export function pickBuyerPrimaryFullName(row: unknown): BuyerNamePickResult | null {
  const sources = collectNameSources(row);

  for (const { src, label } of sources) {
    const v = pickFirstKey(src, BUYER_NAME_P1_KEYS);
    if (v) {
      return {
        fullName: v.trim(),
        sourcePath: `${label}:${BUYER_NAME_P1_KEYS.find((k) => strOrNull(src[k]) != null) ?? "p1"}`,
        confidenceScore: 100 + (label.startsWith("entity") ? 12 : 8),
      };
    }
  }

  let best: BuyerNamePickResult | null = null;
  for (const { src, label } of sources) {
    const last = pickFirstKey(src, NAME_LAST_KEYS);
    const first = pickFirstKey(src, NAME_FIRST_KEYS);
    const middle = pickFirstKey(src, NAME_MIDDLE_KEYS);
    const assembled = formatRussianBuyerFio(last, first, middle);
    if (!assembled) continue;
    const nParts = [last, first, middle].filter((x) => x != null && String(x).trim() !== "").length;
    const score = 55 + nParts * 12 + (label.startsWith("entity") ? 10 : 6);
    if (!best || score > best.confidenceScore) {
      best = {
        fullName: assembled,
        sourcePath: `${label}:name_last+name_first+name_middle(${nParts}ч)`,
        confidenceScore: score,
      };
    }
  }
  return best;
}

function pickStrFromMerged(src: Record<string, unknown>, keys: string[]): string | null {
  return pickFirstKey(src, keys);
}

/**
 * Строка только из buyer/client/… корней и безопасных dot-path (без staff-сегментов).
 */
export function buyerEntityPickStr(row: unknown, flatKeys: string[], dotPaths: string[]): string | null {
  for (const src of collectBuyerEntityRoots(row)) {
    const s = pickStrFromMerged(src, flatKeys);
    if (s) return s;
  }
  const dealFlat = collectDealFlatBuyerScalarSource(row);
  if (dealFlat) {
    const s = pickStrFromMerged(dealFlat, flatKeys);
    if (s) return s;
  }
  for (const p of dotPaths) {
    if (isStaffDominatedPath(p)) continue;
    const v = deepPick(row, p);
    if (isPlainObject(v)) {
      const inner = pickStrFromMerged(v, flatKeys);
      if (inner) return inner;
    }
    const s = strOrNull(v);
    if (s) return s;
  }
  return null;
}

export function buyerEntityPickNum(row: unknown, flatKeys: string[], dotPaths: string[]): number | null {
  for (const src of collectBuyerEntityRoots(row)) {
    for (const k of flatKeys) {
      if (!(k in src)) continue;
      const n = parseFloat(String(src[k]).replace(/\s/g, "").replace(",", "."));
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  const dealFlat = collectDealFlatBuyerScalarSource(row);
  if (dealFlat) {
    for (const k of flatKeys) {
      if (!(k in dealFlat)) continue;
      const n = parseFloat(String(dealFlat[k]).replace(/\s/g, "").replace(",", "."));
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  for (const p of dotPaths) {
    if (isStaffDominatedPath(p)) continue;
    const v = deepPick(row, p);
    if (isPlainObject(v)) {
      for (const k of flatKeys) {
        if (!(k in v)) continue;
        const n = parseFloat(String((v as Record<string, unknown>)[k]).replace(/\s/g, "").replace(",", "."));
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
    const n = parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export function buyerEntityPickRaw(row: unknown, flatKeys: string[], dotPaths: string[]): unknown {
  for (const src of collectBuyerEntityRoots(row)) {
    for (const k of flatKeys) {
      if (!(k in src)) continue;
      const v = src[k];
      if (v === null || v === undefined) continue;
      if (String(v).trim() === "") continue;
      return v;
    }
  }
  const dealFlat = collectDealFlatBuyerScalarSource(row);
  if (dealFlat) {
    for (const k of flatKeys) {
      if (!(k in dealFlat)) continue;
      const v = dealFlat[k];
      if (v === null || v === undefined) continue;
      if (String(v).trim() === "") continue;
      return v;
    }
  }
  for (const p of dotPaths) {
    if (isStaffDominatedPath(p)) continue;
    const v = deepPick(row, p);
    if (v === null || v === undefined) continue;
    if (String(v).trim() === "") continue;
    return v;
  }
  return null;
}

const DIGITS_RE = /\D/g;

export function buyerIdentityDedupeKey(profile: {
  fullName: string | null;
  phone: string | null;
  email: string | null;
}): string | null {
  const d = (profile.phone ?? "").replace(DIGITS_RE, "");
  if (d.length >= 10) return `p:${d}`;
  const e = profile.email?.trim().toLowerCase();
  if (e && /^[^\s@]{1,64}@[^\s@]+\.[^\s@]+$/i.test(e)) return `e:${e}`;
  const n = profile.fullName?.trim().toLowerCase();
  if (n) return `n:${n}`;
  return null;
}

export function isBuyerFieldDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEBUG_DEAL_BUYER_FIELDS === "1") return true;
  try {
    return window.localStorage.getItem("DEBUG_DEAL_BUYER") === "1" || window.localStorage.getItem("DEBUG_DEAL_BUYER_FIELDS") === "1";
  } catch {
    return false;
  }
}

let __buyerFieldDebugLogged = 0;
const MAX_BUYER_FIELD_DEBUG_ROWS = 12;

/** Временная отладка: кандидат ФИО и оценка (не больше MAX строк за загрузку). */
export function logBuyerFieldCandidateDebug(meta: {
  buyerCandidate: string | null;
  sourcePath: string;
  confidenceScore: number;
}): void {
  if (typeof window === "undefined" || !isBuyerFieldDebugEnabled()) return;
  if (__buyerFieldDebugLogged >= MAX_BUYER_FIELD_DEBUG_ROWS) return;
  __buyerFieldDebugLogged++;
  console.log({
    buyerCandidate: meta.buyerCandidate,
    sourcePath: meta.sourcePath,
    confidenceScore: meta.confidenceScore,
  });
}
