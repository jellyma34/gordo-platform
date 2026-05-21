import { formatCompactMoneyAxis } from "@/lib/salesPlanChartFormat";

function trimRuDecimalZeros(s: string): string {
  if (!s.includes(",")) return s;
  return s.replace(/,(0+)$/, "").replace(/,$/, "");
}

/**
 * Компактная сумма в рублях: «125,4 млн ₽», «1,25 млрд ₽», «875 тыс ₽».
 * Без длинных целых, USD и scientific notation.
 */
export function formatCompactCurrencyRu(rub: number | null | undefined): string {
  if (rub == null || !Number.isFinite(rub)) return "—";
  const sign = rub < 0 ? "−" : "";
  const abs = Math.abs(rub);

  if (abs >= 1_000_000) {
    return `${formatCompactMoneyAxis(rub)} ₽`;
  }

  if (abs >= 1_000) {
    const tys = abs / 1_000;
    const nearlyInt = Math.abs(tys - Math.round(tys)) < 1e-6;
    const core = nearlyInt
      ? String(Math.round(tys))
      : trimRuDecimalZeros(tys.toFixed(1).replace(".", ","));
    return `${sign}${core} тыс ₽`;
  }

  const core = trimRuDecimalZeros(abs.toFixed(0));
  return `${sign}${core} ₽`;
}

/** Число и единица отдельно (для подписей над столбиками KPI). */
export function formatCompactCurrencyRuParts(
  rub: number | null | undefined,
): { value: string; unit: string } | { value: "—" } {
  const full = formatCompactCurrencyRu(rub);
  if (full === "—") return { value: "—" };
  const m = full.match(/^([−]?\d[\d\s,]*)\s+(млрд|млн|тыс)\s+₽$/);
  if (m) {
    return { value: m[1]!.trim(), unit: `${m[2]} ₽` };
  }
  const plain = full.replace(/\s*₽$/, "").trim();
  return { value: plain, unit: "₽" };
}
