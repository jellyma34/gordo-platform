import { compactNorm, normalizeApartmentPlanHeader } from "@/lib/planDataSource/apartmentPlanCsvColumns";
import { repairCsvHeaderLabel } from "@/lib/csvHeaderNormalize";
import type { RuCsvHeaderMatcher } from "@/lib/planDataSource/ruPlanCsvParse";

export type ProjectValueCsvHeaderMap = {
  segment: string;
  charter: string;
  currentPlan: string;
  priceIncrease: string;
  reportMarkup: string;
};

type HeaderRow = { index: number; original: string; norm: string; compact: string };

function headerRows(metaFields: string[]): HeaderRow[] {
  return metaFields
    .map((h, index) => {
      const original = repairCsvHeaderLabel(String(h ?? ""));
      const norm = normalizeApartmentPlanHeader(original);
      return { index, original, norm, compact: compactNorm(original) };
    })
    .filter((h) => h.original !== "");
}

function normHas(h: HeaderRow, ...parts: string[]): boolean {
  for (const p of parts) {
    const np = normalizeApartmentPlanHeader(p);
    const cp = compactNorm(p);
    if (h.norm.includes(np) || h.compact.includes(cp)) return true;
  }
  return false;
}

/** CSV «Устав / Текущ. план продаж / …» (Excel RU, `;`, cp1251). */
export function detectProjectValueCsv(metaFields: string[]): boolean {
  const headers = headerRows(metaFields);
  if (!headers.length) return false;
  const hasName = headers.some((h) => h.norm.includes("наименован") || h.compact === "наименование");
  const hasCharter = headers.some((h) => normHas(h, "устав"));
  const hasCurrentPlan = headers.some(
    (h) =>
      normHas(h, "текущ. план продаж", "текущ план продаж", "текущий план продаж") ||
      (h.norm.includes("текущ") && h.norm.includes("план") && h.norm.includes("продаж")),
  );
  return hasName && hasCharter && hasCurrentPlan;
}

export function resolveProjectValueCsvHeaders(
  metaFields: string[],
): { map: ProjectValueCsvHeaderMap } | { error: string } {
  const headers = headerRows(metaFields);
  if (!headers.length) return { error: "Не удалось прочитать заголовок CSV." };

  const used = new Set<number>();
  const pick = (pred: (h: HeaderRow) => boolean): string | null => {
    for (const h of headers) {
      if (used.has(h.index)) continue;
      if (pred(h)) {
        used.add(h.index);
        return h.original;
      }
    }
    return null;
  };

  const segment = pick((h) => h.norm.includes("наименован") || h.compact === "наименование");
  const charter = pick((h) => normHas(h, "устав"));
  const currentPlan = pick(
    (h) =>
      normHas(h, "текущ. план продаж", "текущ план продаж", "текущий план продаж") ||
      (h.norm.includes("текущ") && h.norm.includes("план") && h.norm.includes("продаж")),
  );
  const priceIncrease = pick(
    (h) =>
      normHas(h, "увеличение стоимости объекта", "увеличение стоимости") ||
      (h.norm.includes("увеличен") && h.norm.includes("стоимост")),
  );
  const reportMarkup = pick(
    (h) =>
      normHas(h, "в отчет. месяце наценили на", "в отчет месяце наценили на", "наценили на") ||
      (h.norm.includes("наценил") && h.norm.includes("месяц")),
  );

  if (!segment || !charter || !currentPlan) {
    return {
      error: `Не найдены колонки («Наименование», «Устав», «Текущ. план продаж»). Заголовки: ${headers.map((h) => h.original).join(" · ")}`,
    };
  }

  return {
    map: {
      segment,
      charter,
      currentPlan,
      priceIncrease: priceIncrease ?? "",
      reportMarkup: reportMarkup ?? "",
    },
  };
}

export function projectValueCsvColumnMappingForDiagnostics(map: ProjectValueCsvHeaderMap): Record<string, string> {
  return {
    segment: map.segment,
    charter: map.charter,
    current_plan: map.currentPlan,
    price_increase: map.priceIncrease || "(нет в CSV)",
    report_markup: map.reportMarkup || "(нет в CSV)",
    month: "(из периода дашборда / имени файла)",
  };
}

export const ruProjectValueCsvHeaderMatcher: RuCsvHeaderMatcher = (norms) => {
  const synthetic = norms.map((n) => repairCsvHeaderLabel(n));
  return detectProjectValueCsv(synthetic);
};
