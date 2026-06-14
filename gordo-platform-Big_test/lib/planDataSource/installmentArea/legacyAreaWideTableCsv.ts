import { compactCsvHeader, repairCsvHeaderLabel } from "@/lib/csvHeaderNormalize";
import { compactNorm, normalizeApartmentPlanHeader } from "@/lib/planDataSource/apartmentPlanCsvColumns";
import { detectLegacyWideTableCsv, resolveColumnarPlanHeaders } from "@/lib/planDataSource/legacyWideTableCsv";

export const LEGACY_AREA_COLUMN_ALIASES = {
  name: ["наименование"],
  projectArea: ["план проекта", "площадь проекта"],
  planMonth: [
    "план на отчет. месяц",
    "план на отчет месяц",
    "план на отчёт. месяц",
    "план на отчётный месяц",
    "площадь на отчет. месяц",
    "площадь на отчет месяц",
    "площадь на отчёт. месяц",
    "площадь на отчётный месяц",
  ],
  planCumulative: [
    "план накопит. итогом",
    "план накопит итогом",
    "план накопительно итогом",
    "план накопительно",
    "площадь накопит. итогом",
    "площадь накопит итогом",
    "площадь накопительно итогом",
    "площадь накопительно",
  ],
  factMonth: [
    "факт в отчет. месяце по заключен. дду",
    "факт в отчет месяце по заключен. дду",
    "факт в отчёт. месяце по заключен. дду",
    "факт площадь в отчет. месяце",
    "факт площадь в отчет месяце",
    "факт площадь в отчёт. месяце",
    "факт площадь за месяц",
  ],
  factCumulative: [
    "факт накопительно по заключен. дду",
    "факт накопит. по заключен. дду",
    "факт площадь накопительно",
    "факт площадь накопит",
    "факт накопительно по площади",
  ],
} as const;

export type InstallmentAreaHeaderMap = {
  segment: string;
  projectArea: string;
  planMonth: string;
  planCumulative: string;
  factMonth: string;
  factCumulative: string;
};

type HeaderRow = { index: number; original: string; norm: string; compact: string };

const PLAN_PROJECT_COMPACT = compactCsvHeader("план проекта");
const PROJECT_AREA_COMPACT = compactCsvHeader("площадь проекта");

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
    !h.compact.includes("накопит") &&
    !h.norm.includes("отчет") &&
    !h.norm.includes("отчёт")
  );
}

function isProjectAreaHeader(h: HeaderRow): boolean {
  if (isPlanProjectHeader(h)) return true;
  if (h.compact === PROJECT_AREA_COMPACT || h.compact.startsWith("площадьпроект")) return true;
  return h.norm.includes("площад") && h.norm.includes("проект") && !h.norm.includes("накопит");
}

function isPlanMonthHeader(h: HeaderRow): boolean {
  if (h.norm.includes("факт")) return false;
  if (h.norm.includes("откл")) return false;
  if (h.norm.includes("%")) return false;
  if (h.norm.includes("план") && !h.norm.includes("накопит")) {
    return (
      h.norm.includes("отчет") ||
      h.norm.includes("отчёт") ||
      h.norm.includes("месяц") ||
      h.compact.includes("отчет") ||
      h.compact.includes("месяц")
    );
  }
  return (
    h.norm.includes("площад") &&
    (h.norm.includes("отчет") || h.norm.includes("месяц")) &&
    !h.norm.includes("накопит")
  );
}

function isPlanCumulativeHeader(h: HeaderRow): boolean {
  if (h.norm.includes("факт")) return false;
  if (h.norm.includes("откл")) return false;
  if (h.norm.includes("%")) return false;
  if (h.norm.includes("план") && h.norm.includes("накопит")) return true;
  return h.norm.includes("площад") && h.norm.includes("накопит");
}

function isFactMonthHeader(h: HeaderRow): boolean {
  if (!h.norm.includes("факт")) return false;
  if (h.norm.includes("накопит")) return false;
  return (
    h.norm.includes("месяц") ||
    h.norm.includes("отчет") ||
    h.norm.includes("отчёт") ||
    h.norm.includes("дду") ||
    (h.norm.includes("площад") && h.norm.includes("месяц"))
  );
}

function isFactCumulativeHeader(h: HeaderRow): boolean {
  if (!h.norm.includes("факт")) return false;
  return h.norm.includes("накопит") || h.compact.includes("накопит");
}

export function scoreLegacyAreaWideTableColumns(metaFields: string[]): {
  hasName: boolean;
  hasProjectArea: boolean;
  hasPlanMonth: boolean;
  hasPlanCum: boolean;
  hasFactMonth: boolean;
  hasFactCum: boolean;
  matched: number;
} {
  const headers = headerRows(metaFields);
  const hasName = headers.some((h) => isNameHeader(h) || matchesAlias(h, LEGACY_AREA_COLUMN_ALIASES.name));
  const hasProjectArea = headers.some(
    (h) => isProjectAreaHeader(h) || matchesAlias(h, LEGACY_AREA_COLUMN_ALIASES.projectArea),
  );
  const hasPlanMonth = headers.some(
    (h) => isPlanMonthHeader(h) || matchesAlias(h, LEGACY_AREA_COLUMN_ALIASES.planMonth),
  );
  const hasPlanCum = headers.some(
    (h) => isPlanCumulativeHeader(h) || matchesAlias(h, LEGACY_AREA_COLUMN_ALIASES.planCumulative),
  );
  const hasFactMonth = headers.some(
    (h) => isFactMonthHeader(h) || matchesAlias(h, LEGACY_AREA_COLUMN_ALIASES.factMonth),
  );
  const hasFactCum = headers.some(
    (h) => isFactCumulativeHeader(h) || matchesAlias(h, LEGACY_AREA_COLUMN_ALIASES.factCumulative),
  );
  const matched = [hasName, hasProjectArea, hasPlanMonth, hasPlanCum].filter(Boolean).length;
  return { hasName, hasProjectArea, hasPlanMonth, hasPlanCum, hasFactMonth, hasFactCum, matched };
}

/** Legacy wide-table: «План проекта» / «Площадь проекта» + накопительный план. */
export function detectLegacyAreaWideTableCsv(metaFields: string[]): boolean {
  if (detectLegacyWideTableCsv(metaFields)) return true;
  const { hasName, hasPlanCum, matched } = scoreLegacyAreaWideTableColumns(metaFields);
  return hasName && hasPlanCum && matched >= 3;
}

function resolveAreaFactHeaders(metaFields: string[]): { factMonth: string; factCumulative: string } {
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
    factMonth: pick(isFactMonthHeader, LEGACY_AREA_COLUMN_ALIASES.factMonth),
    factCumulative: pick(isFactCumulativeHeader, LEGACY_AREA_COLUMN_ALIASES.factCumulative),
  };
}

export function resolveLegacyAreaWideHeaders(
  metaFields: string[],
): { map: InstallmentAreaHeaderMap } | { error: string } {
  if (detectLegacyWideTableCsv(metaFields)) {
    const plan = resolveColumnarPlanHeaders(metaFields);
    if ("error" in plan) return plan;
    const fact = resolveAreaFactHeaders(metaFields);
    return {
      map: {
        segment: plan.map.segment,
        projectArea: plan.map.planProject,
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

  const segment = pick(isNameHeader, LEGACY_AREA_COLUMN_ALIASES.name);
  const projectArea = pick(isProjectAreaHeader, LEGACY_AREA_COLUMN_ALIASES.projectArea);
  const planMonth = pick(isPlanMonthHeader, LEGACY_AREA_COLUMN_ALIASES.planMonth);
  const planCumulative = pick(isPlanCumulativeHeader, LEGACY_AREA_COLUMN_ALIASES.planCumulative);
  const factMonth = pick(isFactMonthHeader, LEGACY_AREA_COLUMN_ALIASES.factMonth);
  const factCumulative = pick(isFactCumulativeHeader, LEGACY_AREA_COLUMN_ALIASES.factCumulative);

  if (!segment || !projectArea || !planMonth || !planCumulative) {
    return {
      error: `Не найдены колонки площади («Наименование», «План проекта» / «Площадь проекта», план на отчётный месяц, план накопит. итогом). Заголовки: ${headers.map((h) => h.original).join(" · ")}`,
    };
  }

  return {
    map: {
      segment,
      projectArea,
      planMonth,
      planCumulative,
      factMonth: factMonth ?? "",
      factCumulative: factCumulative ?? "",
    },
  };
}

export function legacyAreaColumnMappingForDiagnostics(map: InstallmentAreaHeaderMap): Record<string, string> {
  return {
    segment: map.segment,
    project_area: map.projectArea,
    plan_month_area: map.planMonth,
    plan_cumulative_area: map.planCumulative,
    fact_month_area: map.factMonth || "(нет в CSV)",
    fact_cumulative_area: map.factCumulative || "(нет в CSV)",
    month: "(из периода дашборда / имени файла)",
  };
}

/** Тип CSV для диагностики: то же семейство, что legacy_wide_table продаж. */
export function installmentAreaCsvTypeLabel(metaFields: string[]): "legacy_wide_table" | "legacy_area_wide_table" | "unknown" {
  if (detectLegacyWideTableCsv(metaFields)) return "legacy_wide_table";
  if (detectLegacyAreaWideTableCsv(metaFields)) return "legacy_area_wide_table";
  return "unknown";
}
