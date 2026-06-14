import { formatCompactMoneyAxis } from "@/lib/salesPlanChartFormat";

function trimRuDecimalZeros(s: string): string {
  if (!s.includes(",")) return s;
  return s.replace(/,(0+)$/, "").replace(/,$/, "");
}

function formatCompactCurrencyCore(rub: number, includeCurrencySymbol: boolean): string {
  const sign = rub < 0 ? "−" : "";
  const abs = Math.abs(rub);
  const currencySuffix = includeCurrencySymbol ? " ₽" : "";

  if (abs >= 1_000_000) {
    return `${formatCompactMoneyAxis(rub)}${currencySuffix}`;
  }

  if (abs >= 1_000) {
    const tys = abs / 1_000;
    const nearlyInt = Math.abs(tys - Math.round(tys)) < 1e-6;
    const core = nearlyInt
      ? String(Math.round(tys))
      : trimRuDecimalZeros(tys.toFixed(1).replace(".", ","));
    return `${sign}${core} тыс${currencySuffix}`;
  }

  const core = trimRuDecimalZeros(abs.toFixed(0));
  return `${sign}${core}${currencySuffix}`;
}

function formatCompactCurrencyPartsCore(
  rub: number | null | undefined,
  includeCurrencySymbol: boolean,
): { value: string; unit: string } | { value: "—" } {
  const full = formatCompactCurrencyCore(
    rub == null || !Number.isFinite(rub) ? NaN : rub,
    includeCurrencySymbol,
  );
  if (rub == null || !Number.isFinite(rub)) return { value: "—" };

  const scalePattern = includeCurrencySymbol
    ? /^([−]?\d[\d\s,]*)\s+(млрд|млн|тыс)\s+₽$/
    : /^([−]?\d[\d\s,]*)\s+(млрд|млн|тыс)$/;
  const m = full.match(scalePattern);
  if (m) {
    return {
      value: m[1]!.trim(),
      unit: includeCurrencySymbol ? `${m[2]} ₽` : m[2]!,
    };
  }

  if (includeCurrencySymbol) {
    const plain = full.replace(/\s*₽$/, "").trim();
    return { value: plain, unit: "₽" };
  }

  return { value: full.trim() };
}

/**
 * Компактная сумма в рублях: «125,4 млн ₽», «1,25 млрд ₽», «875 тыс ₽».
 * Без длинных целых, USD и scientific notation.
 */
export function formatCompactCurrencyRu(rub: number | null | undefined): string {
  if (rub == null || !Number.isFinite(rub)) return "—";
  return formatCompactCurrencyCore(rub, true);
}

/**
 * Компактная сумма без символа валюты: «125,4 млн», «1,25 млрд», «875 тыс», «0».
 * Те же правила округления и единиц, что у {@link formatCompactCurrencyRu}.
 */
export function formatCompactNumberWithoutCurrency(rub: number | null | undefined): string {
  if (rub == null || !Number.isFinite(rub)) return "—";
  return formatCompactCurrencyCore(rub, false);
}

/** Число и единица отдельно (для подписей над столбиками KPI). */
export function formatCompactCurrencyRuParts(
  rub: number | null | undefined,
): { value: string; unit: string } | { value: "—" } {
  return formatCompactCurrencyPartsCore(rub, true);
}

/** Число и масштаб отдельно, без «₽» (блок «Продажи по заключенным ДДУ»). */
export function formatCompactNumberWithoutCurrencyParts(
  rub: number | null | undefined,
): { value: string; unit: string } | { value: "—" } {
  return formatCompactCurrencyPartsCore(rub, false);
}
