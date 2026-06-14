import type { ProjectValueEntitySummary, ProjectValueNormalizedRow } from "@/lib/planDataSource/projectValue/types";

export function makeProjectValueCsvRow(args: {
  segmentNorm: string;
  monthKey: string;
  charter: number;
  currentPlan: number;
  priceIncrease: number;
  reportMarkup: number;
}): ProjectValueNormalizedRow {
  const charter = Math.max(0, args.charter);
  const currentPlan = Math.max(0, args.currentPlan);
  const priceIncrease = args.priceIncrease;
  const reportMarkup = Math.max(0, args.reportMarkup);
  return {
    segmentNorm: args.segmentNorm,
    monthKey: args.monthKey,
    csvFormat: "project_value",
    charter,
    currentPlan,
    priceIncrease,
    reportMarkup,
    projectCost: charter,
    planMonth: charter,
    planCumulative: 0,
    factMonth: currentPlan,
    factCumulative: priceIncrease,
  };
}

export function makeLegacyProjectValueRow(args: {
  segmentNorm: string;
  monthKey: string;
  projectCost: number;
  planMonth: number;
  planCumulative: number;
  factMonth: number;
  factCumulative: number;
}): ProjectValueNormalizedRow {
  const projectCost = Math.max(0, args.projectCost);
  const planMonth = Math.max(0, args.planMonth);
  const planCumulative = Math.max(0, args.planCumulative);
  const factMonth = Math.max(0, args.factMonth);
  const factCumulative = Math.max(0, args.factCumulative);
  return {
    segmentNorm: args.segmentNorm,
    monthKey: args.monthKey,
    csvFormat: "legacy",
    charter: projectCost,
    currentPlan: factMonth,
    priceIncrease: planCumulative,
    reportMarkup: factCumulative,
    projectCost,
    planMonth,
    planCumulative,
    factMonth,
    factCumulative,
  };
}

export function projectValueSummaryFromRow(
  row: ProjectValueNormalizedRow,
  rawLabel: string,
): ProjectValueEntitySummary {
  return {
    csvFormat: row.csvFormat,
    charter: row.charter,
    currentPlan: row.currentPlan,
    priceIncrease: row.priceIncrease,
    reportMarkup: row.reportMarkup,
    projectCost: row.projectCost,
    planMonth: row.planMonth,
    planCumulative: row.planCumulative,
    factMonth: row.factMonth,
    factCumulative: row.factCumulative,
    rawLabel,
  };
}

/** Старые документы localStorage без новых полей. */
export function normalizeProjectValueRow(row: ProjectValueNormalizedRow): ProjectValueNormalizedRow {
  if (row.csvFormat === "project_value") {
    return {
      ...row,
      charter: row.charter ?? row.projectCost ?? 0,
      currentPlan: row.currentPlan ?? row.factMonth ?? 0,
      priceIncrease: row.priceIncrease ?? row.planCumulative ?? 0,
      reportMarkup: row.reportMarkup ?? 0,
      projectCost: row.projectCost ?? row.charter ?? 0,
      planMonth: row.planMonth ?? row.charter ?? 0,
      factMonth: row.factMonth ?? row.currentPlan ?? 0,
      factCumulative: row.factCumulative ?? row.priceIncrease ?? 0,
    };
  }
  if (row.csvFormat === "legacy") {
    return row;
  }
  const projectCost = row.projectCost ?? 0;
  const planMonth = row.planMonth ?? 0;
  const planCumulative = row.planCumulative ?? 0;
  const factMonth = row.factMonth ?? 0;
  const factCumulative = row.factCumulative ?? 0;
  return makeLegacyProjectValueRow({
    segmentNorm: row.segmentNorm,
    monthKey: row.monthKey,
    projectCost,
    planMonth,
    planCumulative,
    factMonth,
    factCumulative,
  });
}
