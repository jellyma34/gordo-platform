/**
 * Режим хранения данных строительства (ГПР / ТМЦ / тендеры).
 *
 * Production и обычный local/dev: `postgres` (FastAPI + PostgreSQL).
 * `local` — только для явных тестов/отладки без БД (не для пользовательского сценария).
 */
export type GprStorageMode = "local" | "postgres";

/** @alias GprStorageMode */
export type ConstructionStorageMode = GprStorageMode;

function readStorageEnv(): string {
  const construction = (process.env.NEXT_PUBLIC_CONSTRUCTION_STORAGE ?? "").trim().toLowerCase();
  if (construction) return construction;
  return (process.env.NEXT_PUBLIC_GPR_STORAGE ?? "").trim().toLowerCase();
}

/**
 * По умолчанию всегда `postgres`.
 * `local` включается только явным `NEXT_PUBLIC_CONSTRUCTION_STORAGE=local`
 * или `NEXT_PUBLIC_GPR_STORAGE=local`.
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
