const numRu = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const numRu1 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1, minimumFractionDigits: 0 });

/** Стоимость в компактном виде: «13,5 млн ₽» при |x| ≥ 1 млн, иначе полные ₽ с разрядами. */
export function formatDealObjectTotalCompactRub(rub: number): string {
  if (!Number.isFinite(rub)) return "—";
  const abs = Math.abs(rub);
  if (abs >= 1_000_000) {
    const mln = rub / 1_000_000;
    const nearlyInt = Math.abs(mln - Math.round(mln)) < 1e-6;
    const s = nearlyInt ? numRu.format(Math.round(mln)) : numRu1.format(mln);
    return `${s} млн ₽`;
  }
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(rub);
}

/** Площадь: «58,2 м²». */
export function formatDealObjectAreaSqm(area: number | null): string {
  if (area == null || !Number.isFinite(area) || area <= 0) return "—";
  const nearlyInt = Math.abs(area - Math.round(area)) < 1e-6;
  const s = nearlyInt ? numRu.format(Math.round(area)) : numRu1.format(area);
  return `${s} м²`;
}

/**
 * Цена за м²: «232 тыс ₽/м²» при типичных значениях ≥ 10 000 ₽/м²;
 * от 1 млн ₽/м² — «1,2 млн ₽/м²»; малые значения — полные ₽/м².
 */
export function formatDealPricePerM2CompactRub(rubPerM2: number | null): string {
  if (rubPerM2 == null || !Number.isFinite(rubPerM2) || rubPerM2 <= 0) return "—";
  const abs = Math.abs(rubPerM2);
  if (abs >= 1_000_000) {
    const mln = rubPerM2 / 1_000_000;
    const nearlyInt = Math.abs(mln - Math.round(mln)) < 1e-6;
    const s = nearlyInt ? numRu.format(Math.round(mln)) : numRu1.format(mln);
    return `${s} млн ₽/м²`;
  }
  if (abs >= 10_000) {
    const t = Math.round(rubPerM2 / 1000);
    return `${numRu.format(t)} тыс ₽/м²`;
  }
  return `${numRu.format(Math.round(rubPerM2))} ₽/м²`;
}
