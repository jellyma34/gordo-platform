/** Разбор CSV квартир (Excel RU): `;` или `,`, UTF-8 / cp1251 на стороне загрузки. */

export type ParseApartmentsCsvOk = {
  ok: true;
  rows: string[][];
  headers: string[];
  uploadedAt: string;
  filename: string;
  warnings: string[];
};

export type ParseApartmentsCsvFail = {
  ok: false;
  error: string;
  warnings?: string[];
};

export type ParseApartmentsCsvResult = ParseApartmentsCsvOk | ParseApartmentsCsvFail;

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text.replace(/^\uFEFF/, "");
}

function stripCell(cell: string): string {
  let s = cell.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1).replace(/""/g, '"');
  }
  return s.trim();
}

function sniffDelimiter(text: string): string {
  const lines = stripBom(text).split(/\r?\n/).slice(0, 48);
  let commas = 0;
  let semis = 0;
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    commas += (t.match(/,/g) ?? []).length;
    semis += (t.match(/;/g) ?? []).length;
  }
  return semis >= commas ? ";" : ",";
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === delimiter) {
      out.push(stripCell(cur));
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(stripCell(cur));
  return out;
}

/**
 * Прочитать CSV квартир: заголовки + строки данных (без строки заголовка в `rows`).
 */
export function parseApartmentsCsv(text: string, filename = "upload.csv"): ParseApartmentsCsvResult {
  const normalized = stripBom(text);
  const rawLines = normalized.split(/\r?\n/);
  const nonEmpty = rawLines.filter((l) => l.trim() !== "");
  if (nonEmpty.length === 0) {
    return { ok: false, error: "Файл пуст или не содержит данных." };
  }

  const delimiter = sniffDelimiter(normalized);
  const table = nonEmpty.map((line) => splitCsvLine(line, delimiter));
  const headers = (table[0] ?? []).map((h) => h.trim());
  const rows = table.slice(1);

  const warnings: string[] = [];
  if (headers.every((h) => !h)) {
    return { ok: false, error: "Не удалось определить строку заголовков CSV." };
  }
  if (rows.length === 0) {
    warnings.push("В файле только строка заголовков, данных нет.");
  }

  return {
    ok: true,
    rows,
    headers,
    uploadedAt: new Date().toISOString(),
    filename: filename.trim() || "upload.csv",
    warnings,
  };
}
