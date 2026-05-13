/**
 * Единый канонический ключ месяца для фильтров и графиков: `YYYY-MM`.
 * Сводит разные строки из выгрузок/UI к одному формату перед сравнением.
 */

function pad2(n: number): string {
  return n >= 10 ? String(n) : `0${n}`;
}

function isValidYm(y: number, m: number): boolean {
  return Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12;
}

/** Двухзначный год → полный (00–69 → 2000–2069, иначе 19xx). */
function expandTwoDigitYear(yy: number): number {
  if (!Number.isFinite(yy) || yy < 0 || yy > 99) return NaN;
  return yy >= 70 ? 1900 + yy : 2000 + yy;
}

/** Номер месяца по русскому названию / приставке (январь, мар., марта …). */
function monthIndexFromRussianName(raw: string): number | null {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
  if (!s) return null;

  if (s.startsWith("январ")) return 1;
  if (s.startsWith("феврал")) return 2;
  if (s.startsWith("март") || s.startsWith("марта")) return 3;
  if (s.startsWith("мар")) return 3;
  if (s.startsWith("апрел")) return 4;
  if (s.startsWith("мая") || s.startsWith("май")) return 5;
  if (s.startsWith("ма") && !s.startsWith("март")) return 5;
  if (s.startsWith("июн")) return 6;
  if (s.startsWith("июл")) return 7;
  if (s.startsWith("август") || s.startsWith("авг")) return 8;
  if (s.startsWith("сентябр") || s.startsWith("сент")) return 9;
  if (s.startsWith("октябр") || s.startsWith("окт")) return 10;
  if (s.startsWith("ноябр") || s.startsWith("нояб")) return 11;
  if (s.startsWith("декабр") || s.startsWith("дек")) return 12;

  return null;
}

/**
 * Приводит строку месяца к `YYYY-MM` или возвращает `null`, если распознать нельзя.
 *
 * Примеры:
 * - `"2026-03"` → `"2026-03"`
 * - `"2026-3"` → `"2026-03"`
 * - `"2026-03-15"` / дата `YYYY-MM-DD` → `"2026-03"`
 * - `"03.2026"` → `"2026-03"`
 * - `"15.03.2026"` → `"2026-03"`
 * - `"март 2026"`, `"мар. 2026"`, `"мар. 26"` → `"2026-03"`
 */
export function normalizeMonthKey(input: string | null | undefined): string | null {
  if (input == null) return null;
  const s0 = String(input).trim();
  if (!s0) return null;
  const s = s0.replace(/^['"]|['"]$/g, "");

  let m: RegExpExecArray | null;

  m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    if (isValidYm(y, mo)) return `${y}-${pad2(mo)}`;
    return null;
  }

  m = /^(\d{1,2})\.(\d{4})$/.exec(s);
  if (m) {
    const mo = Number(m[1]);
    const y = Number(m[2]);
    if (isValidYm(y, mo)) return `${y}-${pad2(mo)}`;
    return null;
  }

  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (m) {
    const y = Number(m[3]);
    const mo = Number(m[2]);
    if (isValidYm(y, mo)) return `${y}-${pad2(mo)}`;
    return null;
  }

  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const mo = Number(m[1]);
    const y = Number(m[3]);
    if (isValidYm(y, mo)) return `${y}-${pad2(mo)}`;
    return null;
  }

  // Русское название + год (4 или 2 цифры)
  const ruYear4 = /\b(19\d{2}|20\d{2})\b/.exec(s);
  if (ruYear4) {
    const y = Number(ruYear4[1]);
    const beforeYear = s.slice(0, ruYear4.index).trim();
    const mi = monthIndexFromRussianName(beforeYear);
    if (mi != null && Number.isFinite(y)) return `${y}-${pad2(mi)}`;
  }
  const ruYear2 = /\b(\d{2})\b(?!\d)/.exec(s);
  if (ruYear2 && /[а-яё]/i.test(s)) {
    const yy = Number(ruYear2[1]);
    const y = expandTwoDigitYear(yy);
    const before = s.slice(0, ruYear2.index).trim();
    const mi = monthIndexFromRussianName(before);
    if (mi != null && Number.isFinite(y)) return `${y}-${pad2(mi)}`;
  }

  return null;
}
