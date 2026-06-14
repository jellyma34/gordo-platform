import { normalizeCsvHeaderLabel } from "@/lib/marketingInvestorsCsv";

/** Разбор CSV кладовых (Excel RU): `;` или `,`, UTF-8 / cp1251 на стороне загрузки. */

export type ParseStoragesCsvOk = {
  ok: true;
  rows: string[][];
  headers: string[];
  uploadedAt: string;
  filename: string;
  warnings: string[];
};

export type ParseStoragesCsvFail = {
  ok: false;
  error: string;
  warnings?: string[];
};

export type ParseStoragesCsvResult = ParseStoragesCsvOk | ParseStoragesCsvFail;

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

function isSkippableStoragesRow(row: string[]): boolean {
  if (row.length === 0) return true;
  if (row.every((c) => !c.trim())) return true;
  const c0 = normalizeCsvHeaderLabel(row[0] ?? "");
  const rowText = row.map((c) => normalizeCsvHeaderLabel(c)).join(" ");
  if (c0.includes("итого") || rowText.includes("итого")) return true;
  if (c0.includes("расторж") || rowText.includes("расторж")) return true;
  if (c0 === "id" || c0 === "№") return true;
  return false;
}

/** Строка заголовков реестра кладовых. */
function isStoragesRegistryHeaderLine(line: string): boolean {
  const n = normalizeCsvHeaderLabel(line);
  return (
    n.includes("кладов") ||
    n.includes("storage") ||
    n.includes("келлер") ||
    (n.includes("стоим") && n.includes("клад"))
  );
}

/**
 * Прочитать CSV кладовых: заголовки + строки данных (без строки заголовка в `rows`).
 */
export function parseStoragesCsv(text: string, filename = "upload.csv"): ParseStoragesCsvResult {
  const normalized = stripBom(text);
  const rawLines = normalized.split(/\r?\n/);
  const nonEmpty = rawLines.filter((l) => l.trim() !== "");
  if (nonEmpty.length === 0) {
    return { ok: false, error: "Файл пуст или не содержит данных." };
  }

  const delimiter = sniffDelimiter(normalized);
  const table = nonEmpty.map((line) => splitCsvLine(line, delimiter));

  let headerLineIdx = 0;
  for (let i = 0; i < nonEmpty.length; i++) {
    if (isStoragesRegistryHeaderLine(nonEmpty[i] ?? "")) {
      headerLineIdx = i;
      break;
    }
  }

  const headers = (table[headerLineIdx] ?? []).map((h) => h.trim());
  const rows = table.slice(headerLineIdx + 1).filter((row) => {
    if (isSkippableStoragesRow(row)) return false;
    const c0 = (row[0] ?? "").trim().toLowerCase();
    if (c0 === "id" || c0 === "год" || c0 === "year") return false;
    return true;
  });

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
