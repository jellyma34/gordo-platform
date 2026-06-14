/** Режим хранения данных строительства (ГПР / ТМЦ / тендеры) на клиенте. */
export type GprStorageMode = "local" | "postgres";

/** @alias GprStorageMode */
export type ConstructionStorageMode = GprStorageMode;

function readStorageEnv(): string {
  const construction = (process.env.NEXT_PUBLIC_CONSTRUCTION_STORAGE ?? "").trim().toLowerCase();
  if (construction) return construction;
  return (process.env.NEXT_PUBLIC_GPR_STORAGE ?? "").trim().toLowerCase();
}

/**
 * `postgres` — FastAPI + PostgreSQL (Railway / production, по умолчанию).
 * `local` — Next API + localStorage + mock fallback (локальный dev без БД).
 *
 * Задаётся через `NEXT_PUBLIC_CONSTRUCTION_STORAGE=local|postgres`
 * или `NEXT_PUBLIC_GPR_STORAGE=local|postgres` (обратная совместимость).
 */
export function getGprStorageMode(): GprStorageMode {
  const raw = readStorageEnv();
  if (raw === "local") return "local";
  return "postgres";
}

/** @alias getGprStorageMode */
export const getConstructionStorageMode = getGprStorageMode;

export function isGprLocalStorageMode(): boolean {
  return getGprStorageMode() === "local";
}

/** @alias isGprLocalStorageMode */
export const isConstructionLocalStorageMode = isGprLocalStorageMode;
