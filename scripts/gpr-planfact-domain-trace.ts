/**
 * Домен шкалы X «Динамика выполнения ГПР».
 * npx tsx scripts/gpr-planfact-domain-trace.ts
 */
import fs from "fs";
import path from "path";

import { decodeCsvBytesWithBestEncoding } from "../lib/csvTextEncoding";
import { mergeGprTasksFromReportCsv } from "../lib/gprTasksMergeFromReportCsv";
import {
  buildPlanFactWorkTypeChartModel,
  collectPlanFactGprChartTimelineDomainDates,
  type PlanFactTasksBarLevel,
} from "../lib/planFactWorkTypeTimeline";
import {
  filterGprTasksByObjectScope,
  filterZhDomPlanFactTasksTo205Branch,
  flattenTasks,
  parseDateSafe,
} from "../lib/gprUtils";
import seed from "../data/gpr-import-default.json";

const ROOT = process.cwd();
const csvPath = path.join(ROOT, "data", "Исполнение ГПР_май.csv");
const todayIso = "2026-05-31";

function isoMinMax(dates: string[]): { min: string | null; max: string | null } {
  const parsed = dates
    .map((s) => parseDateSafe(s))
    .filter((s): s is string => Boolean(s))
    .map((s) => new Date(`${s}T12:00:00`))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (parsed.length === 0) return { min: null, max: null };
  const min = new Date(Math.min(...parsed.map((d) => d.getTime())));
  const max = new Date(Math.max(...parsed.map((d) => d.getTime())));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { min: fmt(min), max: fmt(max) };
}

const text = decodeCsvBytesWithBestEncoding(new Uint8Array(fs.readFileSync(csvPath)));
const csvPart1 = mergeGprTasksFromReportCsv([], text, { forcedPartId: 1 }).tasks;
const jsonTasks = (seed as { tasks: unknown[] }).tasks;

for (const label of ["JSON", "CSV"]) {
  const scoped = filterGprTasksByObjectScope(
    (label === "JSON" ? jsonTasks : csvPart1) as Parameters<typeof filterGprTasksByObjectScope>[0],
    1,
  );
  const planFactSource = filterZhDomPlanFactTasksTo205Branch(scoped);
  const flat = flattenTasks(planFactSource).filter((t) => t.partId === 1);
  const domainDates = collectPlanFactGprChartTimelineDomainDates(flat, "residential");
  const bounds = isoMinMax(domainDates);

  console.log(`\n=== ${label} — domain dates (residential) ===`);
  console.log("domain date count:", domainDates.length);
  console.log("plan/fact min:", bounds.min);
  console.log("plan/fact max:", bounds.max);

  for (const barLevel of ["detailed", "full"] as PlanFactTasksBarLevel[]) {
    const model = buildPlanFactWorkTypeChartModel(flat, "residential", todayIso, barLevel, flat);
    if (!model) {
      console.log(`[${barLevel}] model=null`);
      continue;
    }
    const origin = model.originMonth.toISOString().slice(0, 10);
    console.log(`[${barLevel}] xMin=${model.xMin} xMax=${model.xMax.toFixed(2)} todayX=${model.todayX?.toFixed(2) ?? "null"} originMonth=${origin}`);
    const planBars = model.planRanges.filter((r) => r != null && r[1] - r[0] > 0.2).length;
    const factBars = model.factRanges.filter((r) => r != null).length;
    console.log(`[${barLevel}] plan bars (wide): ${planBars}/${model.labels.length}, factRanges: ${factBars}/${model.labels.length}`);
  }
}
