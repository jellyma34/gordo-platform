import { compactCsvHeader, repairCsvHeaderLabel } from "@/lib/csvHeaderNormalize";
import { compactNorm, normalizeApartmentPlanHeader } from "@/lib/planDataSource/apartmentPlanCsvColumns";
import { detectLegacyWideTableCsv, resolveColumnarPlanHeaders } from "@/lib/planDataSource/legacyWideTableCsv";

export const LEGACY_PROJECT_VALUE_COLUMN_ALIASES = {
  name: ["наименование"],
  projectCost: ["стоимость проекта", "план проекта"],
  planMonth: [
    "план на отчет. месяц",
    "план на отчет месяц",
    "план на отчёт. месяц",
    "план на отчётный месяц",
  ],
  planCumulative: [
    "план накопит. итогом",
    "план накопит итогом",
    "план накопительно итогом",
    "план накопительно",
  ],
  factMonth: [
    "факт в отчет. месяце",
    "факт в отчет месяце",
    "факт в отчёт. месяце",
    "факт в отчётный месяц",
    "факт в отчет. месяце по заключен. дду",
  ],
  factCumulative: [
    "факт накопительно",
    "факт накопит. итогом",
    "факт накопительно по заключен. дду",
  ],
} as const;

export type ProjectValueHeaderMap = {
  segment: string;
  projectCost: string;
  planMonth: string;
  planCumulative: string;
  factMonth: string;
  factCumulative: string;
};

type HeaderRow = { index: number; original: string; norm: string; compact: string };

const PROJECT_COST_COMPACT = compactCsvHeader("стоимость проекта");

function headerRows(metaFields: string[]): HeaderRow[] {
  return metaFields
    .map((h, index) => {
      const original = repairCsvHeaderLabel(String(h ?? ""));
      const norm = normalizeApartmentPlanHeader(original);
      return { index, original, norm, compact: compactNorm(original) };
    })
    .filter((h) => h.original !== "");
}

function matchesAlias(header: HeaderRow, aliases: readonly string[]): boolean {
  for (const alias of aliases) {
    const ac = compactNorm(alias);
    if (!ac) continue;
    if (header.compact === ac) return true;
    if (header.norm === normalizeApartmentPlanHeader(alias)) return true;
    if (header.compact.includes(ac) || ac.includes(header.compact)) return true;
    const an = normalizeApartmentPlanHeader(alias);
    if (header.norm.includes(an) || an.includes(header.norm)) return true;
  }
  return false;
}

function isNameHeader(h: HeaderRow): boolean {
  return h.norm.includes("наименован") || h.compact === "наименование";
}

function isProjectCostHeader(h: HeaderRow): boolean {
  if (h.compact === PROJECT_COST_COMPACT || h.compact.startsWith("стоимостьпроект")) return true;
  if (h.norm.includes("стоимость") && h.norm.includes("проект")) return true;
  return (
    h.norm.includes("план") &&
    (h.norm.includes("проект") || h.compact.includes("проект")) &&
    !h.norm.includes("накопит") &&
    !h.norm.includes("отчет") &&
    !h.norm.includes("отчёт")
  );
}

function isPlanMonthHeader(h: HeaderRow): boolean {
  if (h.norm.includes("факт")) return false;
  if (h.norm.includes("откл")) return false;
  if (h.norm.includes("%")) return false;
  return (
    h.norm.includes("план") &&
    !h.norm.includes("накопит") &&
    (h.norm.includes("отчет") || h.norm.includes("отчёт") || h.norm.includes("месяц"))
  );
}

function isPlanCumulativeHeader(h: HeaderRow): boolean {
  if (h.norm.includes("факт")) return false;
  if (h.norm.includes("откл")) return false;
  if (h.norm.includes("%")) return false;
  return h.norm.includes("план") && h.norm.includes("накопит");
}

function isFactMonthHeader(h: HeaderRow): boolean {
  if (!h.norm.includes("факт")) return false;
  if (h.norm.includes("накопит")) return false;
  return h.norm.includes("месяц") || h.norm.includes("отчет") || h.norm.includes("отчёт");
}

function isFactCumulativeHeader(h: HeaderRow): boolean {
  if (!h.norm.includes("факт")) return false;
  return h.norm.includes("накопит");
}

export function scoreLegacyProjectValueWideTableColumns(metaFields: string[]): {
  hasName: boolean;
  hasProjectCost: boolean;
  hasPlanMonth: boolean;
  hasPlanCum: boolean;
  matched: number;
} {
  const headers = headerRows(metaFields);
  const hasName = headers.some((h) => isNameHeader(h) || matchesAlias(h, LEGACY_PROJECT_VALUE_COLUMN_ALIASES.name));
  const hasProjectCost = headers.some(
    (h) => isProjectCostHeader(h) || matchesAlias(h, LEGACY_PROJECT_VALUE_COLUMN_ALIASES.projectCost),
  );
  const hasPlanMonth = headers.some(
    (h) => isPlanMonthHeader(h) || matchesAlias(h, LEGACY_PROJECT_VALUE_COLUMN_ALIASES.planMonth),
  );
  const hasPlanCum = headers.some(
    (h) => isPlanCumulativeHeader(h) || matchesAlias(h, LEGACY_PROJECT_VALUE_COLUMN_ALIASES.planCumulative),
  );
  const matched = [hasName, hasProjectCost, hasPlanMonth, hasPlanCum].filter(Boolean).length;
  return { hasName, hasProjectCost, hasPlanMonth, hasPlanCum, matched };
}

export function detectLegacyProjectValueWideTableCsv(metaFields: string[]): boolean {
  const { hasName, hasProjectCost, hasPlanCum, matched } = scoreLegacyProjectValueWideTableColumns(metaFields);
  if (hasName && hasProjectCost && hasPlanCum && matched >= 3) return true;
  if (detectLegacyWideTableCsv(metaFields)) return true;
  return false;
}

function resolveProjectValueFactHeaders(metaFields: string[]): { factMonth: string; factCumulative: string } {
  const headers = headerRows(metaFields);
  const used = new Set<number>();
  const pick = (pred: (h: HeaderRow) => boolean, aliases: readonly string[]): string => {
    for (const h of headers) {
      if (used.has(h.index)) continue;
      if (pred(h) || matchesAlias(h, aliases)) {
        used.add(h.index);
        return h.original;
      }
    }
    return "";
  };
  return {
    factMonth: pick(isFactMonthHeader, LEGACY_PROJECT_VALUE_COLUMN_ALIASES.factMonth),
    factCumulative: pick(isFactCumulativeHeader, LEGACY_PROJECT_VALUE_COLUMN_ALIASES.factCumulative),
  };
}

export function resolveLegacyProjectValueWideHeaders(
  metaFields: string[],
): { map: ProjectValueHeaderMap } | { error: string } {
  if (detectLegacyWideTableCsv(metaFields)) {
    const plan = resolveColumnarPlanHeaders(metaFields);
    if ("error" in plan) return plan;
    const fact = resolveProjectValueFactHeaders(metaFields);
    const headers = headerRows(metaFields);
    const costCol =
      headers.find((h) => isProjectCostHeader(h) || matchesAlias(h, LEGACY_PROJECT_VALUE_COLUMN_ALIASES.projectCost))
        ?.original ?? plan.map.planProject;
    return {
      map: {
        segment: plan.map.segment,
        projectCost: costCol,
        planMonth: plan.map.planMonth,
        planCumulative: plan.map.planCumulative,
        factMonth: fact.factMonth,
        factCumulative: fact.factCumulative,
      },
    };
  }

  const headers = headerRows(metaFields);
  if (!headers.length) return { error: "Не удалось прочитать заголовок CSV." };

  const used = new Set<number>();
  const pick = (pred: (h: HeaderRow) => boolean, aliases: readonly string[]): string | null => {
    for (const h of headers) {
      if (used.has(h.index)) continue;
      if (pred(h) || matchesAlias(h, aliases)) {
        used.add(h.index);
        return h.original;
      }
    }
    return null;
  };

  const segment = pick(isNameHeader, LEGACY_PROJECT_VALUE_COLUMN_ALIASES.name);
  const projectCost = pick(isProjectCostHeader, LEGACY_PROJECT_VALUE_COLUMN_ALIASES.projectCost);
  const planMonth = pick(isPlanMonthHeader, LEGACY_PROJECT_VALUE_COLUMN_ALIASES.planMonth);
  const planCumulative = pick(isPlanCumulativeHeader, LEGACY_PROJECT_VALUE_COLUMN_ALIASES.planCumulative);
  const factMonth = pick(isFactMonthHeader, LEGACY_PROJECT_VALUE_COLUMN_ALIASES.factMonth);
  const factCumulative = pick(isFactCumulativeHeader, LEGACY_PROJECT_VALUE_COLUMN_ALIASES.factCumulative);

  if (!segment || !projectCost || !planMonth || !planCumulative) {
    return {
      error: `Не найдены колонки («Наименование», «Стоимость проекта», план на отчётный месяц, план накопит. итогом). Заголовки: ${headers.map((h) => h.original).join(" · ")}`,
    };
  }

  return {
    map: {
      segment,
      projectCost,
      planMonth,
      planCumulative,
      factMonth: factMonth ?? "",
      factCumulative: factCumulative ?? "",
    },
  };
}

export function legacyProjectValueColumnMappingForDiagnostics(map: ProjectValueHeaderMap): Record<string, string> {
  return {
    segment: map.segment,
    project_cost: map.projectCost,
    plan_month: map.planMonth,
    plan_cumulative: map.planCumulative,
    fact_month: map.factMonth || "(нет в CSV)",
    fact_cumulative: map.factCumulative || "(нет в CSV)",
    month: "(из периода дашборда / имени файла)",
  };
}

export function projectValueCsvTypeLabel(
  metaFields: string[],
): "legacy_wide_table" | "legacy_project_value_wide_table" | "unknown" {
  if (detectLegacyWideTableCsv(metaFields)) return "legacy_wide_table";
  if (detectLegacyProjectValueWideTableCsv(metaFields)) return "legacy_project_value_wide_table";
  return "unknown";
}
