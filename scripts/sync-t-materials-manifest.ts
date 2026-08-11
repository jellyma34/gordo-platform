import fs from "fs";
import path from "path";

import { buildTmcMaterialImageManifest } from "../lib/tmcMaterialImages";

const MATERIALS_DIR = path.join(process.cwd(), "public", "images", "t_materials");
const OUT_FILE = path.join(process.cwd(), "lib", "tmcMaterialImagesManifest.generated.ts");

function main(): void {
  const filenames = fs.existsSync(MATERIALS_DIR)
    ? fs.readdirSync(MATERIALS_DIR).filter((name) => !name.startsWith("."))
    : [];

  const manifest = buildTmcMaterialImageManifest(filenames);

  const content = `/**
 * AUTO-GENERATED — do not edit manually.
 * Regenerate: npx tsx scripts/sync-t-materials-manifest.ts
 * Source: public/images/t_materials/
 */
export const TMC_MATERIAL_IMAGE_MANIFEST: Readonly<Record<string, string>> = ${JSON.stringify(manifest, null, 2)} as const;

export const TMC_MATERIAL_IMAGE_FILENAMES: readonly string[] = ${JSON.stringify(filenames, null, 2)} as const;
`;

  fs.writeFileSync(OUT_FILE, content, "utf8");
  console.log(`[t_materials manifest] ${filenames.length} files → ${Object.keys(manifest).length} keys`);
  console.log(`Written: ${OUT_FILE}`);
}

main();
