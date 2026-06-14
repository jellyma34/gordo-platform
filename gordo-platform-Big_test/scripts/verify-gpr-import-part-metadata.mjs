import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const { decodeCsvBytesWithBestEncoding } = await import("../lib/csvTextEncoding.ts");
const { mergeGprTasksFromReportCsv } = await import("../lib/gprTasksMergeFromReportCsv.ts");
const { filterGprTasksByObjectScope, resolveGprTaskEffectivePartId, matchesGprCodeBranch } =
  await import("../lib/gprUtils.ts");
const { buildPlanFactWorkTypeChartModel } = await import("../lib/planFactWorkTypeTimeline.ts");

const csvPath = path.join(root, "data", "gpr-report-sample.csv");
const text = decodeCsvBytesWithBestEncoding(new Uint8Array(fs.readFileSync(csvPath)));

for (const forcedPartId of [1, 2]) {
  const { tasks, stats } = mergeGprTasksFromReportCsv([], text, { forcedPartId });
  const label = forcedPartId === 1 ? "Жилой дом" : "Автостоянка";
  const scoped = filterGprTasksByObjectScope(tasks, forcedPartId);
  const residential = tasks.filter((t) => t.projectPartKey === "residential").length;
  const parking = tasks.filter((t) => t.projectPartKey === "parking").length;
  const sample = tasks[0];
  const pf = scoped.filter(
    (t) =>
      matchesGprCodeBranch(t.code, "2.04") ||
      matchesGprCodeBranch(t.code, "2.05") ||
      matchesGprCodeBranch(t.code, "2.06") ||
      matchesGprCodeBranch(t.code, "2.07"),
  );
  const flat = pf.filter((t) => t.partId === forcedPartId);
  const model = buildPlanFactWorkTypeChartModel(
    flat,
    forcedPartId === 1 ? "residential" : "parking",
    "2026-06-08",
    "detailed",
  );
  console.log(`--- ${label} (forcedPartId=${forcedPartId}) ---`);
  console.log(`parsed=${stats.parsedRowCount} merged=${tasks.length} scoped=${scoped.length}`);
  console.log(`projectPartKey residential=${residential} parking=${parking}`);
  console.log("sample:", {
    code: sample?.code,
    objectType: sample?.objectType,
    projectPartKey: sample?.projectPartKey,
    planFactScope: sample?.planFactScope,
    partId: sample?.partId,
    effectivePartId: sample ? resolveGprTaskEffectivePartId(sample) : null,
  });
  console.log(`presentation chart rows (detailed)=${model?.labels?.length ?? 0}`);
}
