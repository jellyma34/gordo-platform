/** Канонический project_id для ЖК Верба · 1 очередь (общий SoT в PostgreSQL). */
export const CANONICAL_DEFAULT_PROJECT_ID = "verba-phase-1";

const LEGACY_DEFAULTS = new Set(["", "default", "DEFAULT"]);

export function normalizeProjectId(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s || LEGACY_DEFAULTS.has(s)) return CANONICAL_DEFAULT_PROJECT_ID;
  const cleaned = s
    .replace(/[^a-zA-Z0-9\u0400-\u04FF_.-]/g, "_")
    .slice(0, 128);
  return cleaned.length > 0 ? cleaned : CANONICAL_DEFAULT_PROJECT_ID;
}
