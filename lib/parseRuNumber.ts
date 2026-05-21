/**
 * Числа из RU Excel/CSV: пробелы тысяч, запятая, знак %.
 */
export function parseRuNumber(value: unknown): number | null {
  const s = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s/g, "")
    .replace(/%/g, "")
    .replace(",", ".");
  if (!s || s === "-" || s === "—") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
