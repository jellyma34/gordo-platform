/**
 * Эвристики категории объекта по тексту выгрузки (имя объекта, category_name и т.д.).
 * Значение `null` — классифицировать нельзя; тогда верхний уровень ставит fallback «прочее».
 */
export type InferredDealProductSegment = "apartment" | "parking" | "storage" | "commercial";

function normalizeDealHintPlainText(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Возвращает сегмент с максимальным score; tie-break по приоритету специфичности. */
export function inferDealProductSegmentFromText(raw: string): InferredDealProductSegment | null {
  const t = normalizeDealHintPlainText(raw);
  if (!t) return null;

  let apartment = 0;
  let parking = 0;
  let storage = 0;
  let commercial = 0;

  if (
    /\bкладов(ая|ые|ых|ых)?\b|\bскладчик\b|\bstorageroom\b|\bstorage\b(?!\s*room)|клад\b(?!\w)/i.test(
      t,
    )
  )
    storage += 6;

  if (
    /\bпаркинг\b|\bparking\b|\bcar\s*-?\s*space\b|\bмашино[-\s]?мест|\bмото[-\s]?мест\b|\bbaйк\s*мест\b|\bпт\s*мест\b|\bгараж(?!ное)\b(?!\w)/i.test(
      t,
    )
  )
    parking += 6;

  if (/\bмм\b|м\s*\.\s*м\.|\bмотомест\b|машиномест/i.test(t)) parking += 5;

  if (
    /\bкоммерц|\bнеторгов|\bcowork\b|\bcommercial\b|\boffice\b(?:\s|$)|\bмагазин\b|\bторгов(?:ое|ые|ые|ых)\s+пом|\bобщепит\b|\bофисн/i.test(
      t,
    )
  )
    commercial += 6;

  if (/\bквартир|\bапарт|\b\d+\s*[-‑]?\s*комн|\bкомнат|\bкомн\b|студия|студ\w/i.test(t)) apartment += 5;

  const entries: Array<{ k: InferredDealProductSegment; v: number }> = [
    { k: "apartment", v: apartment },
    { k: "parking", v: parking },
    { k: "storage", v: storage },
    { k: "commercial", v: commercial },
  ];
  entries.sort((a, b) => b.v - a.v);
  const best = entries[0]!;
  if (best.v < 4) return null;
  const second = entries[1]?.v ?? 0;
  if (best.v === second) {
    const order: InferredDealProductSegment[] = ["parking", "storage", "commercial", "apartment"];
    const candidates = entries.filter((e) => e.v === best.v).map((e) => e.k);
    for (const o of order) {
      if (candidates.includes(o)) return o;
    }
    return candidates[0] ?? null;
  }
  return best.k;
}
