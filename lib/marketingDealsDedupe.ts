/**
 * Дедупликация сырых строк выгрузки сделок при append-импорте.
 * Поздняя запись с тем же ключом перекрывает раннюю.
 */

function dealRowDedupeKey(row: unknown): string {
  if (row == null || typeof row !== "object") return `raw:${String(row)}`;
  const r = row as Record<string, unknown>;

  const topId = r.id;
  if (topId != null && String(topId).trim() !== "") return `estate:${topId}`;

  const deal = r.deal;
  if (deal != null && typeof deal === "object") {
    const d = deal as Record<string, unknown>;
    const dealId = d.id;
    if (dealId != null && String(dealId).trim() !== "") return `deal:${dealId}`;

    const agreement = d.agreement_number ?? d.agreementNumber;
    const dateRaw = d.deal_date ?? d.date ?? d.close_date;
    if (agreement != null && dateRaw != null) {
      return `agr:${String(agreement).trim()}::${String(dateRaw).trim()}`;
    }
  }

  return `hash:${JSON.stringify(row).slice(0, 240)}`;
}

/** Уникальные строки; при коллизии сохраняется последняя. */
export function dedupeDealExportRows(rows: readonly unknown[]): unknown[] {
  const byKey = new Map<string, unknown>();
  for (const row of rows) {
    byKey.set(dealRowDedupeKey(row), row);
  }
  return [...byKey.values()];
}
