/**
 * Разбор текста, извлечённого из PDF ГПР: коды вида 2.05.01.1 и наименования работ.
 */

export type GprWorkItem = {
  code: string;
  name: string;
  /** Уровень по правилу ГПР: число сегментов в коде (code.split(".").length). */
  level: number;
};

/** Нормализация кода: убираем завершающие точки и пробелы. */
export function normalizeGprCode(fragment: string): string {
  return fragment.replace(/\.+$/g, "").trim();
}

/**
 * Отступ строки в выпадающем списке: level 1 → pl-2, 2 → pl-4, 3 → pl-6.
 */
export function gprWorkRowPaddingClass(level: number): string {
  if (level <= 1) return "pl-2";
  if (level === 2) return "pl-4";
  if (level === 3) return "pl-6";
  if (level === 4) return "pl-8";
  return "pl-10";
}

const CODE_ONLY = /^(\d+(?:\.\d+)*)\.?\s*$/;
/** Код и название в одной ячейке: «2.05.01.1. Устройство котлована» */
const CODE_NAME_SAME_CELL = /^(\d+(?:\.\d+)*)\.\s+(.+)$/;

function stripTrailingPlanDate(name: string): string {
  return name.replace(/\s+\d{2}\.\d{2}\.\d{4}[\s\S]*$/u, "").trim();
}

function parseLine(line: string): Omit<GprWorkItem, "level"> | null {
  const trimmed = line.trim();
  if (!trimmed || !/^\d/.test(trimmed)) return null;

  const parts = trimmed.split("\t").map((p) => p.trim());
  const cell0 = parts[0] ?? "";

  const onlyCode = cell0.match(CODE_ONLY);
  if (onlyCode && parts.length >= 2 && parts[1]) {
    const code = normalizeGprCode(onlyCode[1]!);
    const name = stripTrailingPlanDate(parts[1]!);
    if (!name) return null;
    return { code, name };
  }

  const same = cell0.match(CODE_NAME_SAME_CELL);
  if (same) {
    const code = normalizeGprCode(same[1]!);
    const name = stripTrailingPlanDate(same[2]!);
    if (!name) return null;
    return { code, name };
  }

  return null;
}

function itemLevel(code: string): number {
  return code.split(".").length;
}

function dedupeByCode(items: GprWorkItem[]): GprWorkItem[] {
  const seen = new Set<string>();
  const out: GprWorkItem[] = [];
  for (const it of items) {
    if (seen.has(it.code)) continue;
    seen.add(it.code);
    out.push(it);
  }
  return out;
}

/**
 * Извлекает виды работ из сырого текста PDF (или вставленного экспорта).
 */
export function parseGprWorksFromText(text: string): GprWorkItem[] {
  const lines = text.split(/\r?\n/);
  const out: GprWorkItem[] = [];

  const pushParsed = (raw: Omit<GprWorkItem, "level">) => {
    const item: GprWorkItem = {
      ...raw,
      level: itemLevel(raw.code),
    };
    out.push(item);
  };

  for (const line of lines) {
    const parsed = parseLine(line);
    if (parsed) {
      pushParsed(parsed);
      continue;
    }

    const t = line.trim();
    if (!t) continue;

    /** Продолжение наименования с новой строки PDF (не заголовки вроде «Жилой дом»). */
    const looksLikeNameContinuation = /^[а-яёa-z(]/u.test(t);
    if (!/^\d/.test(t) && looksLikeNameContinuation) {
      const last = out[out.length - 1];
      if (last) {
        const add = stripTrailingPlanDate(t.replace(/^[\s‐-]+/u, ""));
        if (add) last.name = `${last.name} ${add}`.trim();
      }
    }
  }

  return dedupeByCode(out);
}
