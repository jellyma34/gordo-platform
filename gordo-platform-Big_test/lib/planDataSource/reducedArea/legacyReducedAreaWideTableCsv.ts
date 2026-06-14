import { compactCsvHeader, repairCsvHeaderLabel } from "@/lib/csvHeaderNormalize";
import { compactNorm, normalizeApartmentPlanHeader } from "@/lib/planDataSource/apartmentPlanCsvColumns";
import { detectLegacyWideTableCsv, resolveColumnarPlanHeaders } from "@/lib/planDataSource/legacyWideTableCsv";
import { LEGACY_REVENUE_COLUMN_ALIASES } from "@/lib/planDataSource/dduRevenue/legacyRevenueWideTableCsv";
import type { ReducedAreaProjectColumnKind } from "@/lib/planDataSource/reducedArea/types";

export type ReducedAreaHeaderMap = {
  segment: string;
  planProject: string;
  planMonth: string;
  planCumulative: string;
  factMonth: string;
  factCumulative: string;
};

const REDUCED_AREA_COLUMN_ALIASES = {
  ...LEGACY_REVENUE_COLUMN_ALIASES,
  planProject: [
    "приведенная площадь",
    "привед. площадь",
    "привед площадь",
    "приведенная площадь объекта",
    "площадь объекта",
    "площадь проекта",
    ...LEGACY_REVENUE_COLUMN_ALIASES.planProject,
  ],
  factMonth: [
    "факт в отчет. месяце",
    "факт в отчет месяце",
    "факт в отчёт. месяце",
    "факт в отчётный месяц",
    ...LEGACY_REVENUE_COLUMN_ALIASES.factMonth,
  ],
  factCumulative: [
    "факт накопительно",
    "факт накопит. итогом",
    "факт накопит итогом",
    ...LEGACY_REVENUE_COLUMN_ALIASES.factCumulative,
  ],
} as const;

type HeaderRow = { index: number; original: string; norm: string; compact: string };

const PLAN_PROJECT_COMPACT = compactCsvHeader("план проекта");

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
  return h.norm.includes("месяц") || h.norm.includes("отчет") || h.norm.includes("отчёт") || h.norm.includes("дду");
}

function isFactCumulativeHeader(h: HeaderRow): boolean {
  if (!h.norm.includes("факт")) return false;
  return h.norm.includes("накопит") || h.norm.includes("дду");
}

function headerRows(metaFields: string[]): HeaderRow[] {
  return metaFields
    .map((h, index) => {
      const original = repairCsvHeaderLabel(String(h ?? ""));
      const norm = normalizeApartmentPlanHeader(original);
      return { index, original, norm, compact: compactNorm(original) };
    })
    .filter((h) => h.original !== "");
}

function isNameHeader(h: HeaderRow): boolean {
  return h.norm.includes("наименован") || h.compact === "наименование";
}

function isReducedAreaBenchmarkHeader(h: HeaderRow): boolean {
  if (h.norm.includes("площад") || h.norm.includes("кв") || h.norm.includes("м2") || h.norm.includes("м²")) {
    if (!h.norm.includes("стоим") && !h.norm.includes("цен") && !h.norm.includes("руб")) return true;
  }
  return matchesAlias(h, REDUCED_AREA_COLUMN_ALIASES.planProject);
}

function isPlanProjectHeader(h: HeaderRow): boolean {
  if (isReducedAreaBenchmarkHeader(h)) return true;
  const c = h.compact;
  if (c.startsWith("планпроект") || c === PLAN_PROJECT_COMPACT) return true;
  return (
    h.norm.includes("план") &&
    (h.norm.includes("проект") || h.compact.includes("проект")) &&
    !h.norm.includes("накопит") &&
    !h.norm.includes("отчет") &&
    !h.norm.includes("отчёт")
  );
}

export function projectColumnKindFromHeader(header: string): ReducedAreaProjectColumnKind {
  const norm = normalizeApartmentPlanHeader(header);
  if (norm.includes("объект") && (norm.includes("привед") || norm.includes("площад"))) return "object_area";
  if (norm.includes("привед") && norm.includes("площад")) return "reduced_area";
  if (norm.includes("площад") || norm.includes("м2") || norm.includes("м²") || norm.includes("кв")) {
    return "reduced_area";
  }
  return "plan_project";
}

export function reducedAreaProjectColumnCaption(kind: ReducedAreaProjectColumnKind): string {
  switch (kind) {
    case "object_area":
      return "Приведенная площадь объекта";
    case "reduced_area":
      return "Приведенная площадь";
    default:
      return "План проекта";
  }
}

export function scoreReducedAreaWideTableColumns(metaFields: string[]): {
  hasName: boolean;
  hasBenchmark: boolean;
  hasPlanMonth: boolean;
  hasPlanCum: boolean;
  matched: number;
} {
  const headers = headerRows(metaFields);
  const hasName = headers.some((h) => isNameHeader(h) || matchesAlias(h, REDUCED_AREA_COLUMN_ALIASES.name));
  const hasBenchmark = headers.some(
    (h) => isReducedAreaBenchmarkHeader(h) || isPlanProjectHeader(h) || matchesAlias(h, REDUCED_AREA_COLUMN_ALIASES.planProject),
  );
  const hasPlanMonth = headers.some(
    (h) => isPlanMonthHeader(h) || matchesAlias(h, REDUCED_AREA_COLUMN_ALIASES.planMonth),
  );
  const hasPlanCum = headers.some(
    (h) => isPlanCumulativeHeader(h) || matchesAlias(h, REDUCED_AREA_COLUMN_ALIASES.planCumulative),
  );
  const matched = [hasName, hasBenchmark, hasPlanMonth, hasPlanCum].filter(Boolean).length;
  return { hasName, hasBenchmark, hasPlanMonth, hasPlanCum, matched };
}

export function detectReducedAreaWideTableCsv(metaFields: string[]): boolean {
  if (detectLegacyWideTableCsv(metaFields)) return true;
  const { hasName, hasPlanCum, hasBenchmark, matched } = scoreReducedAreaWideTableColumns(metaFields);
  return hasName && hasPlanCum && hasBenchmark && matched >= 3;
}

function resolveReducedAreaFactHeaders(metaFields: string[]): { factMonth: string; factCumulative: string } {
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
    factMonth: pick(isFactMonthHeader, REDUCED_AREA_COLUMN_ALIASES.factMonth),
    factCumulative: pick(isFactCumulativeHeader, REDUCED_AREA_COLUMN_ALIASES.factCumulative),
  };
}

export function resolveReducedAreaWideHeaders(
  metaFields: string[],
): { map: ReducedAreaHeaderMap; projectColumnKind: ReducedAreaProjectColumnKind } | { error: string } {
  if (detectLegacyWideTableCsv(metaFields)) {
    const plan = resolveColumnarPlanHeaders(metaFields);
    if ("error" in plan) return plan;
    const fact = resolveReducedAreaFactHeaders(metaFields);
    return {
      map: {
        segment: plan.map.segment,
        planProject: plan.map.planProject,
        planMonth: plan.map.planMonth,
        planCumulative: plan.map.planCumulative,
        factMonth: fact.factMonth,
        factCumulative: fact.factCumulative,
      },
      projectColumnKind: projectColumnKindFromHeader(plan.map.planProject),
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

  const segment = pick(isNameHeader, REDUCED_AREA_COLUMN_ALIASES.name);
  const planProject = pick(isPlanProjectHeader, REDUCED_AREA_COLUMN_ALIASES.planProject);
  const planMonth = pick(isPlanMonthHeader, REDUCED_AREA_COLUMN_ALIASES.planMonth);
  const planCumulative = pick(isPlanCumulativeHeader, REDUCED_AREA_COLUMN_ALIASES.planCumulative);
  const factMonth = pick(isFactMonthHeader, REDUCED_AREA_COLUMN_ALIASES.factMonth);
  const factCumulative = pick(isFactCumulativeHeader, REDUCED_AREA_COLUMN_ALIASES.factCumulative);

  if (!segment || !planProject || !planMonth || !planCumulative) {
    return {
      error: `Не найдены колонки («Наименование», «Приведенная площадь» / «Приведенная площадь объекта», план на отчётный месяц, план накопит. итогом). Заголовки: ${headers.map((h) => h.original).join(" · ")}`,
    };
  }

  return {
    map: {
      segment,
      planProject,
      planMonth,
      planCumulative,
      factMonth: factMonth ?? "",
      factCumulative: factCumulative ?? "",
    },
    projectColumnKind: projectColumnKindFromHeader(planProject),
  };
}

export function reducedAreaColumnMappingForDiagnostics(map: ReducedAreaHeaderMap): Record<string, string> {
  return {
    segment: map.segment,
    plan_project: map.planProject,
    plan_month: map.planMonth,
    plan_cumulative: map.planCumulative,
    fact_month: map.factMonth || "(нет в CSV)",
    fact_cumulative: map.factCumulative || "(нет в CSV)",
    month: "(из периода дашборда / имени файла)",
  };
}

export function reducedAreaCsvTypeLabel(
  metaFields: string[],
): "legacy_wide_table" | "reduced_area_wide_table" | "unknown" {
  if (detectLegacyWideTableCsv(metaFields)) return "legacy_wide_table";
  if (detectReducedAreaWideTableCsv(metaFields)) return "reduced_area_wide_table";
  return "unknown";
}
