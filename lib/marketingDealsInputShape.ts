/**
 * Разбор «сырой» формы выгрузки сделок (общий код для клиента и API).
 * Не помечено "use client" — можно импортировать из route handlers.
 */

export type DealExportRowShape = Record<string, unknown>;

/** Разбор ответа API / JSON выгрузки: массив сделок или `{ data: [...] }`. */
export function parseDealsEnvelope(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json != null && typeof json === "object" && "data" in json && Array.isArray((json as { data: unknown }).data)) {
    return (json as { data: unknown[] }).data;
  }
  return [];
}

export function flattenDealsInput(data: unknown): DealExportRowShape[] {
  if (Array.isArray(data)) return data as DealExportRowShape[];
  if (data != null && typeof data === "object" && !Array.isArray(data)) {
    const o = data as Record<string, unknown>;
    const keys = Object.keys(o).sort((a, b) => a.localeCompare(b));
    const rows: DealExportRowShape[] = [];
    for (const k of keys) {
      const v = o[k];
      if (Array.isArray(v)) {
        for (const item of v) rows.push(item as DealExportRowShape);
      }
    }
    return rows;
  }
  return [];
}

/** Из произвольного JSON — массив элементов как в выгрузке (до нормализации). */
export function dealsRawRowsFromJson(json: unknown): unknown[] {
  let rows = parseDealsEnvelope(json);
  if (rows.length === 0) rows = flattenDealsInput(json);
  return rows;
}
