const DEFAULT_MAX_LINE1 = 22;
const DEFAULT_MAX_LINE2 = 26;

function truncateWithEllipsis(text: string, maxLen: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

/**
 * Две строки для подписи оси: перенос по словам, при переполнении — «…» на 2-й строке.
 */
export function splitTmcMaterialAxisLabel(
  text: string,
  maxLine1 = DEFAULT_MAX_LINE1,
  maxLine2 = DEFAULT_MAX_LINE2,
): string[] {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) return [""];
  if (normalized.length <= maxLine1) return [normalized];

  const words = normalized.split(" ");
  if (words.length >= 2) {
    let line1Words: string[] = [];
    for (const word of words) {
      const candidate = [...line1Words, word].join(" ");
      if (candidate.length > maxLine1 + 1 && line1Words.length > 0) break;
      line1Words.push(word);
    }

    if (line1Words.length > 0 && line1Words.length < words.length) {
      const line1 = truncateWithEllipsis(line1Words.join(" "), maxLine1);
      const line2 = truncateWithEllipsis(words.slice(line1Words.length).join(" "), maxLine2);
      return line2 ? [line1, line2] : [line1];
    }
  }

  const line1 = truncateWithEllipsis(normalized.slice(0, maxLine1), maxLine1);
  const line2 = truncateWithEllipsis(normalized.slice(maxLine1), maxLine2);
  return line2 ? [line1, line2] : [line1];
}

export function tmcMaterialAxisLineCount(text: string): number {
  return splitTmcMaterialAxisLabel(text).length;
}

/** Chart.js 4.5: tick callback — string или string[] (не массив в data.labels). */
export function formatTmcMaterialAxisTickLabel(label: string): string | string[] {
  const lines = splitTmcMaterialAxisLabel(label);
  if (lines.length <= 1) return lines[0] ?? "";
  return lines;
}

export const TMC_MATERIAL_AXIS_TICK_FONT_SIZE = 10;
export const TMC_MATERIAL_AXIS_TICK_LINE_HEIGHT = 12;
