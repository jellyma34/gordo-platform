import { compactCsvHeader, repairCsvHeaderLabel } from "@/lib/csvHeaderNormalize";
import { compactNorm, normalizeApartmentPlanHeader } from "@/lib/planDataSource/apartmentPlanCsvColumns";
import { detectLegacyWideTableCsv, resolveColumnarPlanHeaders } from "@/lib/planDataSource/legacyWideTableCsv";

export const LEGACY_REVENUE_COLUMN_ALIASES = {
  name: ["наименование"],
  planProject: ["план проекта"],
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
    "факт в отчет. месяце по заключен. дду",
    "факт в отчет месяце по заключен. дду",
    "факт в отчёт. месяце по заключен. дду",
    "факт в отчётный месяц по заключен. дду",
  ],
  factCumulative: [
    "факт накопительно по заключен. дду",
    "факт накопит. по заключен. дду",
    "факт накопительно по заключен",
  ],
} as const;

export type DduRevenueHeaderMap = {
  segment: string;
  planProject: string;
  planMonth: string;
  planCumulative: string;
  factMonth: string;
  factCumulative: string;
};

type HeaderRow = { index: number; original: string; norm: string; compact: string };

const PLAN_PROJECT_COMPACT = compactCsvHeader("план проекта");

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

function isPlanProjectHeader(h: HeaderRow): boolean {
  if (h.compact === PLAN_PROJECT_COMPACT || h.compact.startsWith("планпроект")) return true;
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
  return h.norm.includes("месяц") || h.norm.includes("отчет") || h.norm.includes("отчёт") || h.norm.includes("дду");
}

function isFactCumulativeHeader(h: HeaderRow): boolean {
  if (!h.norm.includes("факт")) return false;
  return h.norm.includes("накопит") || h.norm.includes("дду");
}

export function scoreLegacyRevenueWideTableColumns(metaFields: string[]): {
  hasName: boolean;
  hasPlanProject: boolean;
  hasPlanMonth: boolean;
  hasPlanCum: boolean;
  matched: number;
} {
  const headers = headerRows(metaFields);
  const hasName = headers.some((h) => isNameHeader(h) || matchesAlias(h, LEGACY_REVENUE_COLUMN_ALIASES.name));
  const hasPlanProject = headers.some(
    (h) => isPlanProjectHeader(h) || matchesAlias(h, LEGACY_REVENUE_COLUMN_ALIASES.planProject),
  );
  const hasPlanMonth = headers.some(
    (h) => isPlanMonthHeader(h) || matchesAlias(h, LEGACY_REVENUE_COLUMN_ALIASES.planMonth),
  );
  const hasPlanCum = headers.some(
    (h) => isPlanCumulativeHeader(h) || matchesAlias(h, LEGACY_REVENUE_COLUMN_ALIASES.planCumulative),
  );
  const matched = [hasName, hasPlanProject, hasPlanMonth, hasPlanCum].filter(Boolean).length;
  return { hasName, hasPlanProject, hasPlanMonth, hasPlanCum, matched };
}

export function detectLegacyRevenueWideTableCsv(metaFields: string[]): boolean {
  if (detectLegacyWideTableCsv(metaFields)) return true;
  const { hasName, hasPlanCum, matched } = scoreLegacyRevenueWideTableColumns(metaFields);
  return hasName && hasPlanCum && matched >= 3;
}

function resolveRevenueFactHeaders(metaFields: string[]): { factMonth: string; factCumulative: string } {
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
    factMonth: pick(isFactMonthHeader, LEGACY_REVENUE_COLUMN_ALIASES.factMonth),
    factCumulative: pick(isFactCumulativeHeader, LEGACY_REVENUE_COLUMN_ALIASES.factCumulative),
  };
}

export function resolveLegacyRevenueWideHeaders(
  metaFields: string[],
): { map: DduRevenueHeaderMap } | { error: string } {
  if (detectLegacyWideTableCsv(metaFields)) {
    const plan = resolveColumnarPlanHeaders(metaFields);
    if ("error" in plan) return plan;
    const fact = resolveRevenueFactHeaders(metaFields);
    return {
      map: {
        segment: plan.map.segment,
        planProject: plan.map.planProject,
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

  const segment = pick(isNameHeader, LEGACY_REVENUE_COLUMN_ALIASES.name);
  const planProject = pick(isPlanProjectHeader, LEGACY_REVENUE_COLUMN_ALIASES.planProject);
  const planMonth = pick(isPlanMonthHeader, LEGACY_REVENUE_COLUMN_ALIASES.planMonth);
  const planCumulative = pick(isPlanCumulativeHeader, LEGACY_REVENUE_COLUMN_ALIASES.planCumulative);
  const factMonth = pick(isFactMonthHeader, LEGACY_REVENUE_COLUMN_ALIASES.factMonth);
  const factCumulative = pick(isFactCumulativeHeader, LEGACY_REVENUE_COLUMN_ALIASES.factCumulative);

  if (!segment || !planProject || !planMonth || !planCumulative) {
    return {
      error: `Не найдены колонки («Наименование», «План проекта», план на отчётный месяц, план накопит. итогом). Заголовки: ${headers.map((h) => h.original).join(" · ")}`,
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
  };
}

export function legacyRevenueColumnMappingForDiagnostics(map: DduRevenueHeaderMap): Record<string, string> {
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

export function dduRevenueCsvTypeLabel(
  metaFields: string[],
): "legacy_wide_table" | "legacy_revenue_wide_table" | "unknown" {
  if (detectLegacyWideTableCsv(metaFields)) return "legacy_wide_table";
  if (detectLegacyRevenueWideTableCsv(metaFields)) return "legacy_revenue_wide_table";
  return "unknown";
}
