/**
 * Разбор экспорта отчёта ГПР (разделитель `;`, локаль ru-RU).
 */

export type GprReportCsvRow = {
  rawCode: string;
  code: string;
  name: string;
  planStart: string | null;
  planEnd: string | null;
  factStart: string | null;
  factEnd: string | null;
  completion: number;
};

/** Разбор строки CSV с разделителем `;` и кавычками RFC-style (удвоение "). */
export function splitCsvSemicolon(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && c === ";") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const RU_DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/;

/** DD.MM.YYYY → ISO date или null при пустой ячейке / sentinel Excel. */
export function ruDateCellToIsoOrNull(cell: string | undefined): string | null {
  const raw = cell?.trim();
  if (!raw) return null;
  const m = raw.match(RU_DATE_RE);
  if (!m) return null;
  const dd = m[1]!;
  const mm = m[2]!;
  const yyyy = m[3]!;
  if (yyyy === "1900") return null;
  if (dd === "00" || mm === "00") return null;
  const d = Number(dd);
  const mo = Number(mm);
  const y = Number(yyyy);
  if (!Number.isFinite(d) || !Number.isFinite(mo) || !Number.isFinite(y)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function parseCompletionCell(raw: string | undefined): number {
  if (raw == null) return 0;
  const s = raw.trim().replace(/\s+/g, "").replace(",", ".");
  if (!s) return 0;
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  if (n < 0 || n > 100) return 0;
  return Math.round(n * 100) / 100;
}

function detectPlanStartIdx(lines: string[]): number {
  const subLine =
    lines.find((l) => l.includes("Дата начала") && l.includes("Длительность")) ?? "";
  const sub = splitCsvSemicolon(subLine);
  const idx = sub.findIndex((c) => c.includes("Дата начала"));
  return idx >= 0 ? idx : 10;
}

/** Строка данных: первый столбец — шифр вида «2.05.01.». */
function looksLikeGprCodeCell(cell: string): boolean {
  const t = cell.trim();
  return /^\d+\.\d+/.test(t);
}

/**
 * Извлекает строки отчёта. Ошибки разбора по строке не прерывают весь импорт.
 */
export function parseGprReportCsv(text: string): GprReportCsvRow[] {
  const normalized = text.replace(/^\uFEFF/, "");
  const lines = normalized.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  const planStartIdx = detectPlanStartIdx(lines);
  const progressIdx = planStartIdx + 6;

  const out: GprReportCsvRow[] = [];

  for (const line of lines) {
    try {
      const cols = splitCsvSemicolon(line);
      const rawCode = cols[0]?.trim() ?? "";
      if (!looksLikeGprCodeCell(rawCode)) continue;

      const rawClean = rawCode.replace(/\s+/g, "");
      const codeDigits = rawClean.replace(/[^\d.]/g, "");
      const segments = codeDigits.split(".").filter((p) => p.length > 0);
      if (segments.length < 2) continue;

      const code = segments.join(".");

      let name = (cols[1] ?? "").trim();
      if (!name) name = code;

      const planStart = ruDateCellToIsoOrNull(cols[planStartIdx]);
      const planEnd = ruDateCellToIsoOrNull(cols[planStartIdx + 1]);
      const factStart = ruDateCellToIsoOrNull(cols[planStartIdx + 3]);
      const factEnd = ruDateCellToIsoOrNull(cols[planStartIdx + 4]);

      const completion = parseCompletionCell(cols[progressIdx]);

      out.push({
        rawCode: rawClean,
        code,
        name,
        planStart,
        planEnd,
        factStart,
        factEnd,
        completion,
      });
    } catch {
      /* строка пропущена */
    }
  }

  return dedupeByCodeLastWins(out);
}

function dedupeByCodeLastWins(rows: GprReportCsvRow[]): GprReportCsvRow[] {
  const map = new Map<string, GprReportCsvRow>();
  for (const r of rows) map.set(r.code, r);
  return [...map.values()];
}
