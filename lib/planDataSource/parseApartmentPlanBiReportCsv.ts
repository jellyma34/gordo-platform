import type { ApartmentPlanCsvNormalizedRow } from "@/lib/planDataSource/types";
import type { ParseApartmentPlanCsvOptions } from "@/lib/planDataSource/types";
import { normalizeApartmentPlanHeader } from "@/lib/planDataSource/apartmentPlanCsvColumns";
import {
  isApartmentPlanKpiDetailSegment,
  isBiApartmentsSummaryRow,
  isBiGrandTotalRow,
  isNonApartmentPropertyRow,
  type BiApartmentsSummarySlice,
} from "@/lib/planDataSource/apartmentPlanKpiEntity";
import { normalizeMatchKey } from "@/lib/planDataSource/normalize";
import { quarterKeyToMonthKeys } from "@/lib/planDataSource/selectPlanForKpi";

/** Маркеры заголовков BI-отчёта «Выполнение плана отчётного периода» (колонки факта не используются в KPI). */
const BIO_PLAN_CUM_MARKERS = ["план", "накопит", "итог"];

function normHeaderIncludesAll(n: string, parts: string[]): boolean {
  return parts.every((p) => n.includes(p));
}

/**
 * Автоопределение BI-шаблона: показатели в колонках, строка — сегмент.
 * Факт из CSV не используется; признак факта в заголовках не обязателен.
 */
export function detectApartmentPlanBiReportCsv(metaFields: string[]): boolean {
  const norms = metaFields.map((h) => normalizeApartmentPlanHeader(String(h ?? "")));
  const hasPlanCum = norms.some((n) => normHeaderIncludesAll(n, BIO_PLAN_CUM_MARKERS));
  const hasPlanMonth = norms.some(
    (n) =>
      n.includes("план") &&
      (n.includes("отчет") || n.includes("отчёт")) &&
      n.includes("месяц") &&
      !n.includes("накопит"),
  );
  const hasSegment = norms.some((n) => n.includes("наименован"));
  return hasPlanCum && hasPlanMonth && hasSegment;
}

function asOfToMonthKey(asOf: string): string | null {
  const m = /^(\d{4})-(\d{1,2})-/.exec(String(asOf ?? "").trim());
  if (!m) return null;
  return `${m[1]}-${m[2]!.padStart(2, "0")}`;
}

const FILE_MONTH_RE =
  /(?<![0-9])(20\d{2})[._-](0[1-9]|1[0-2])(?![0-9])|(?<![0-9])(0[1-9]|1[0-2])[._-](20\d{2})(?![0-9])/;

const RU_STEM_TO_MM: Record<string, string> = {
  январ: "01",
  феврал: "02",
  март: "03",
  апрел: "04",
  май: "05",
  мая: "05",
  июн: "06",
  июл: "07",
  август: "08",
  сентябр: "09",
  октябр: "10",
  ноябр: "11",
  декабр: "12",
};

/** Месяц из имени файла: ...2026_05... или ...05_2026... */
export function inferMonthKeyFromFileName(fileName: string): string | null {
  const base = fileName.replace(/\.[^.]+$/i, "").replace(/\s+/g, " ");
  const compact = base.replace(/\s/g, "");
  let m = FILE_MONTH_RE.exec(compact);
  if (m) {
    if (m[1] && m[2]) return `${m[1]}-${m[2]}`;
    if (m[3] && m[4]) return `${m[4]}-${m[3]}`;
  }
  const ru = base.toLowerCase().replace(/ё/g, "е");
  for (const [stem, mm] of Object.entries(RU_STEM_TO_MM)) {
    const re = new RegExp(`${stem}[a-zа-я._-]*?(20\\d{2})`, "i");
    const rm = re.exec(ru);
    if (rm) return `${rm[1]}-${mm}`;
  }
  return null;
}

/**
 * Месяц, которым помечаются строки BI-CSV: файл → дашборд (месяц) → asOf → последний месяц квартала.
 */
export function resolveBiReportMonthKey(opts: ParseApartmentPlanCsvOptions): string | null {
  const fromFile = opts.fileName ? inferMonthKeyFromFileName(opts.fileName) : null;
  if (fromFile) return fromFile;

  if (opts.period === "month") {
    const k = String(opts.dashboardPeriodKey ?? "").trim();
    if (/^\d{4}-\d{2}$/.test(k)) return k;
  }

  if (opts.period === "quarter") {
    const qm = quarterKeyToMonthKeys(opts.dashboardPeriodKey);
    const asOfM = asOfToMonthKey(opts.reportAsOfYmd);
    if (qm?.length && asOfM && qm.includes(asOfM)) return asOfM;
    if (qm?.length) return qm[qm.length - 1]!;
  }

  return asOfToMonthKey(opts.reportAsOfYmd);
}

type BiColumnPick = {
  segment: string;
  planProject: string;
  planMonth: string;
  planCumulative: string;
};

function pickBiColumns(metaFields: string[]): { map: BiColumnPick } | { error: string } {
  const originals = metaFields.map((h) => String(h ?? "").trim());
  const norms = originals.map((h) => normalizeApartmentPlanHeader(h));

  const isSegment = (n: string) => n.includes("наименован") || n === "наименование";
  const isPlanProject = (n: string) =>
    n.includes("план") && n.includes("проект") && !n.includes("накопит") && !n.includes("отчет") && !n.includes("отчёт");
  const isPlanMonth = (n: string) =>
    n.includes("план") && (n.includes("отчет") || n.includes("отчёт")) && n.includes("месяц") && !n.includes("накопит");
  const isPlanCum = (n: string) => normHeaderIncludesAll(n, BIO_PLAN_CUM_MARKERS);

  const pickOne = (pred: (n: string) => boolean): string | null => {
    for (let i = 0; i < norms.length; i++) {
      if (pred(norms[i]!)) return originals[i]!;
    }
    return null;
  };

  const segment = pickOne(isSegment);
  const planProject = pickOne(isPlanProject);
  const planMonth = pickOne(isPlanMonth);
  const planCumulative = pickOne(isPlanCum);

  if (!segment || !planProject || !planMonth || !planCumulative) {
    return {
      error:
        "BI-отчёт: не найдены колонки «Наименование», «План проекта», «План на отчётный месяц», «План накопит. итогом».",
    };
  }

  return {
    map: { segment, planProject, planMonth, planCumulative },
  };
}

export { isBiApartmentsSummaryRow, isBiGrandTotalRow } from "@/lib/planDataSource/apartmentPlanKpiEntity";

function parseNum(raw: unknown): number | null {
  const s = String(raw ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s/g, "")
    .replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export type BiReportParseResult = {
  rows: ApartmentPlanCsvNormalizedRow[];
  warnings: string[];
  columnMapping: Record<string, string>;
  /** Свод «Квартиры»: накопительный план и объём проекта для KPI квартир. */
  apartmentsSummary: BiApartmentsSummarySlice | null;
  /** @deprecated Используйте {@link apartmentsSummary}.planProject */
  summaryPlanProject: number | null;
  importedSegmentRows: number;
  ignoredSummaryRows: number;
};

export function parseApartmentPlanBiReportFromGrid(
  metaFields: string[],
  rowsIn: Record<string, unknown>[],
  monthKey: string,
): { ok: true; result: BiReportParseResult } | { ok: false; error: string } {
  const picked = pickBiColumns(metaFields);
  if ("error" in picked) return { ok: false, error: picked.error };

  const { map } = picked;
  const warnings: string[] = [];
  const out: ApartmentPlanCsvNormalizedRow[] = [];
  let apartmentsSummary: BiApartmentsSummarySlice | null = null;
  let ignoredSummaryRows = 0;
  let importedSegmentRows = 0;

  const columnMapping: Record<string, string> = {
    segment: map.segment,
    total_volume: map.planProject,
    plan_month: map.planMonth,
    plan_cumulative: map.planCumulative,
    month: `(BI: из дашборда/файла → ${monthKey})`,
  };

  for (let i = 0; i < rowsIn.length; i++) {
    const rec = rowsIn[i] ?? {};
    const segRaw = rec[map.segment];
    const segmentNorm = normalizeMatchKey(segRaw);
    const rawLabel = segRaw != null ? String(segRaw) : "";
    if (!segmentNorm) {
      warnings.push(`Строка ${i + 2}: пропущена (пустое наименование).`);
      continue;
    }

    if (isBiGrandTotalRow(segmentNorm, rawLabel)) {
      ignoredSummaryRows += 1;
      continue;
    }

    if (isBiApartmentsSummaryRow(segmentNorm, rawLabel)) {
      ignoredSummaryRows += 1;
      const planM = parseNum(rec[map.planMonth]);
      const planC = parseNum(rec[map.planCumulative]);
      const tv = parseNum(rec[map.planProject]);
      apartmentsSummary = {
        planMonth: Math.max(0, planM ?? 0),
        planCumulative: Math.max(0, planC ?? 0),
        planProject: Math.max(0, tv ?? 0),
        rawLabel: rawLabel.trim() || segmentNorm,
      };
      continue;
    }

    if (isNonApartmentPropertyRow(segmentNorm, rawLabel)) {
      ignoredSummaryRows += 1;
      continue;
    }

    if (!isApartmentPlanKpiDetailSegment(segmentNorm, rawLabel)) {
      warnings.push(`Строка ${i + 2} («${segmentNorm}»): пропущена (не сегмент квартир для KPI).`);
      continue;
    }

    const planM = parseNum(rec[map.planMonth]);
    const planC = parseNum(rec[map.planCumulative]);
    const tv = parseNum(rec[map.planProject]);

    if (planM == null || planC == null) {
      warnings.push(`Строка ${i + 2} («${segmentNorm}»): пропущена (нет чисел в плане месяца / накопительного плана).`);
      continue;
    }

    importedSegmentRows += 1;
    out.push({
      segmentNorm,
      apartmentTypeNorm: null,
      monthKey,
      planMonth: Math.max(0, planM),
      planCumulative: Math.max(0, planC),
      totalVolume: Math.max(0, tv ?? 0),
    });
  }

  if (!out.length && !apartmentsSummary) {
    return {
      ok: false,
      error:
        "Не удалось импортировать KPI квартир из BI-отчёта: нужна строка «Квартиры» и/или сегменты 1–4-ком.",
    };
  }

  const summaryPlanProject = apartmentsSummary?.planProject ?? null;

  return {
    ok: true,
    result: {
      rows: out,
      warnings,
      columnMapping,
      apartmentsSummary,
      summaryPlanProject,
      importedSegmentRows,
      ignoredSummaryRows,
    },
  };
}
