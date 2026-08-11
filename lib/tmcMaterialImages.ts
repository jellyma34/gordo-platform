/**
 * Автоматическое сопоставление названия материала (CSV) с файлами в
 * public/images/t_materials/.
 *
 * Имена файлов = названия материалов (+ расширение). Ручной словарь не используется.
 * Индекс строится из содержимого каталога (manifest) с нормализацией ключей.
 */

export const TMC_MATERIALS_IMAGE_BASE_PATH = "/images/t_materials";

export const TMC_MATERIAL_IMAGE_PLACEHOLDER = "/images/materials/placeholder.svg";

export const TMC_MATERIAL_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;

export type TmcMaterialImageExtension = (typeof TMC_MATERIAL_IMAGE_EXTENSIONS)[number];

/** Нормализация для отображения не меняет — только для поиска файла. */
export function normalizeTmcMaterialImageKeyStandard(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[,;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Компактный ключ: без пробелов (Бетон, Б25 ↔ Бетон Б 25). */
export function normalizeTmcMaterialImageKeyCompact(name: string): string {
  return normalizeTmcMaterialImageKeyStandard(name).replace(/\s+/g, "");
}

/** @deprecated alias для совместимости */
export function normalizeTmcMaterialImageKey(name: string): string {
  return normalizeTmcMaterialImageKeyStandard(name);
}

function parseMaterialImageFilename(filename: string): {
  basename: string;
  extension: TmcMaterialImageExtension;
} | null {
  const match = filename.match(/^(.+)\.([^.]+)$/);
  if (!match) return null;
  const extension = match[2]!.toLowerCase();
  if (!TMC_MATERIAL_IMAGE_EXTENSIONS.includes(extension as TmcMaterialImageExtension)) {
    return null;
  }
  return {
    basename: match[1]!,
    extension: extension as TmcMaterialImageExtension,
  };
}

/**
 * Строит индекс normalizedKey → имя файла (с расширением) из списка файлов каталога.
 */
export function buildTmcMaterialImageManifest(
  filenames: readonly string[],
): Readonly<Record<string, string>> {
  const manifest: Record<string, string> = {};

  for (const filename of filenames) {
    const parsed = parseMaterialImageFilename(filename);
    if (!parsed) continue;

    const keys = new Set([
      normalizeTmcMaterialImageKeyStandard(parsed.basename),
      normalizeTmcMaterialImageKeyCompact(parsed.basename),
    ]);

    for (const key of keys) {
      if (!key) continue;
      manifest[key] = filename;
    }
  }

  return manifest;
}

/** Публичный URL asset из public/images/t_materials (с URL-кодированием имени файла). */
export function tmcMaterialImagePublicUrl(filename: string): string {
  return `${TMC_MATERIALS_IMAGE_BASE_PATH}/${encodeURIComponent(filename)}`;
}

/** Кандидаты URL для материала: manifest → точное имя + расширения → []. */
export function resolveTmcMaterialImageCandidates(
  materialName: string,
  manifest: Readonly<Record<string, string>>,
): string[] {
  const trimmed = materialName.trim();
  if (!trimmed) return [TMC_MATERIAL_IMAGE_PLACEHOLDER];

  const standard = normalizeTmcMaterialImageKeyStandard(trimmed);
  const compact = normalizeTmcMaterialImageKeyCompact(trimmed);

  const manifestHit = manifest[standard] ?? manifest[compact];
  if (manifestHit) {
    return [tmcMaterialImagePublicUrl(manifestHit)];
  }

  const candidates: string[] = [];
  for (const ext of TMC_MATERIAL_IMAGE_EXTENSIONS) {
    candidates.push(tmcMaterialImagePublicUrl(`${trimmed}.${ext}`));
  }
  return candidates;
}

/** Поиск файла по имени материала в списке файлов каталога (Node / тесты). */
export function lookupTmcMaterialImageFile(
  materialName: string,
  filenames: readonly string[],
): string | null {
  const manifest = buildTmcMaterialImageManifest(filenames);
  const candidates = resolveTmcMaterialImageCandidates(materialName, manifest);
  if (candidates.length === 1 && candidates[0] === TMC_MATERIAL_IMAGE_PLACEHOLDER) {
    return null;
  }
  const first = candidates[0];
  if (!first || first === TMC_MATERIAL_IMAGE_PLACEHOLDER) return null;
  const encoded = first.slice(TMC_MATERIALS_IMAGE_BASE_PATH.length + 1);
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

/** Первый URL для img[src] (fallback через onError в UI). */
export function resolveTmcMaterialImageSrc(
  materialName: string,
  manifest: Readonly<Record<string, string>>,
): string {
  const candidates = resolveTmcMaterialImageCandidates(materialName, manifest);
  return candidates[0] ?? TMC_MATERIAL_IMAGE_PLACEHOLDER;
}

/** Следующий URL при ошибке загрузки. */
export function nextTmcMaterialImageCandidate(
  materialName: string,
  currentSrc: string,
  manifest: Readonly<Record<string, string>>,
): string {
  const candidates = resolveTmcMaterialImageCandidates(materialName, manifest);
  const idx = candidates.indexOf(currentSrc);
  if (idx >= 0 && idx + 1 < candidates.length) {
    return candidates[idx + 1]!;
  }
  if (currentSrc !== TMC_MATERIAL_IMAGE_PLACEHOLDER) {
    return TMC_MATERIAL_IMAGE_PLACEHOLDER;
  }
  return TMC_MATERIAL_IMAGE_PLACEHOLDER;
}
