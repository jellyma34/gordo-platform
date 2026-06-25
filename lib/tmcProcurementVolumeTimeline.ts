import { parseDateSafe } from "@/lib/gprUtils";
import type { PlanFactWorkTypeChartModel, PlanFactWorkTypeRowDetail } from "@/lib/planFactWorkTypeTimeline";
import type { TMCItem } from "@/lib/tmcData";
import {
  computeTmcSupplyVolumeCompletionPercent,
  resolveTmcMaterialBucketKey,
  resolveTmcMaterialGprTooltipLines,
  tmcItemCsvFactCostRub,
  tmcItemCsvPlanCostRub,
  tmcSupplyVolumeCompletionFactColor,
  type TmcVolumeGprStageLine,
} from "@/lib/tmcPresentationAnalytics";

const PLAN_BAR = "rgba(148, 163, 184, 0.5)";
const NO_DATE_PLAN = "rgba(100, 116, 139, 0.55)";
const NO_DATE_FACT = "rgba(71, 85, 105, 0.48)";
const FACT_WEAK = "rgba(148, 163, 184, 0.25)";
const MIN_BAR_SPAN_MONTHS = 0.08;

export type TmcSupplyVolumeRowMeta = {
  name: string;
  unit: string;
  planVolume: number;
  factVolume: number;
  planCostRub: number;
  factCostRub: number;
  completionPercent: number;
  planStart: string | null;
  planEnd: string | null;
  factStart: string | null;
  factEnd: string | null;
  gprStageTooltipLines: TmcVolumeGprStageLine[];
};

export type TmcSupplyVolumeChartBundle = {
  model: PlanFactWorkTypeChartModel;
  rowMeta: TmcSupplyVolumeRowMeta[];
};

function daysInMonth(y: number, m0: number): number {
  return new Date(y, m0 + 1, 0).getDate();
}

function monthFloatFromIso(iso: string, originMonth: Date): number | null {
  const t = iso?.trim();
  if (!t) return null;
  const d = new Date(`${t}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const oy = originMonth.getFullYear();
  const om = originMonth.getMonth();
  let months = (d.getFullYear() - oy) * 12 + (d.getMonth() - om);
  const dim = daysInMonth(d.getFullYear(), d.getMonth());
  months += (d.getDate() - 1) / Math.max(1, dim);
  return months;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function isoDayMs(iso: string | null | undefined): number | null {
  const s = parseDateSafe(iso ?? undefined);
  if (!s) return null;
  const ms = new Date(`${s}T12:00:00`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function minIsoDate(isos: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestMs = Infinity;
  for (const raw of isos) {
    const iso = parseDateSafe(raw ?? undefined);
    if (!iso) continue;
    const ms = isoDayMs(iso);
    if (ms == null || ms >= bestMs) continue;
    bestMs = ms;
    best = iso;
  }
  return best;
}

function maxIsoDate(isos: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const raw of isos) {
    const iso = parseDateSafe(raw ?? undefined);
    if (!iso) continue;
    const ms = isoDayMs(iso);
    if (ms == null || ms <= bestMs) continue;
    bestMs = ms;
    best = iso;
  }
  return best;
}

function ensureMinMonthSpan(start: number, end: number): [number, number] {
  if (end - start < MIN_BAR_SPAN_MONTHS) return [start, start + MIN_BAR_SPAN_MONTHS];
  return [start, end];
}

function tmcSupplyPlanDate(item: TMCItem): string | null {
  return item.supplyPlanDate?.trim() || item.contractPlanDate?.trim() || null;
}

function tmcSupplyFactDate(item: TMCItem): string | null {
  return item.supplyFactDate?.trim() || item.contractFactDate?.trim() || null;
}

function formatTmcAggregatedUnits(units: Set<string>): string {
  const list = [...units].filter(Boolean);
  if (list.length === 0) return "—";
  if (list.length === 1) return list[0]!;
  return list.join(" / ");
}

function formatSupplyVolumePct(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  if (Number.isInteger(rounded)) return `${Math.round(rounded)}%`;
  return `${rounded.toFixed(1).replace(".", ",")}%`;
}

function aggregateTmcSupplyMaterials(items: TMCItem[]): Map<string, TMCItem[]> {
  const buckets = new Map<string, TMCItem[]>();
  for (const item of items) {
    if (!(item.volumePlan > 0)) continue;
    const key = resolveTmcMaterialBucketKey(item);
    const list = buckets.get(key) ?? [];
    list.push(item);
    buckets.set(key, list);
  }
  return buckets;
}

type SupplyTimelineEntry = {
  name: string;
  ps: string | null;
  pe: string | null;
  fs: string | null;
  fe: string | null;
  hasDates: boolean;
  completionPercent: number;
  meta: TmcSupplyVolumeRowMeta;
};

function buildSupplyTimelineEntries(items: TMCItem[]): SupplyTimelineEntry[] {
  const buckets = aggregateTmcSupplyMaterials(items);
  const entries: SupplyTimelineEntry[] = [];

  for (const [name, groupItems] of buckets) {
    const units = new Set<string>();
    let planVolume = 0;
    let factVolume = 0;
    let planCostRub = 0;
    let factCostRub = 0;

    for (const item of groupItems) {
      planVolume += item.volumePlan;
      factVolume += item.volumeFact;
      planCostRub += tmcItemCsvPlanCostRub(item);
      factCostRub += tmcItemCsvFactCostRub(item);
      const unit = item.unit?.trim();
      if (unit) units.add(unit);
    }

    const completionPercent = computeTmcSupplyVolumeCompletionPercent(planVolume, factVolume);
    const planStart = minIsoDate(groupItems.map(tmcSupplyPlanDate));
    const planEnd = maxIsoDate(groupItems.map(tmcSupplyPlanDate));
    const factStart = minIsoDate(groupItems.map(tmcSupplyFactDate));
    const factEnd = maxIsoDate(groupItems.map(tmcSupplyFactDate));

    const psm = isoDayMs(planStart);
    const pem = isoDayMs(planEnd);
    const hasDates = Boolean(planStart && planEnd && psm != null && pem != null && pem >= psm);

    entries.push({
      name,
      ps: planStart,
      pe: planEnd,
      fs: factStart,
      fe: factEnd,
      hasDates,
      completionPercent,
      meta: {
        name,
        unit: formatTmcAggregatedUnits(units),
        planVolume,
        factVolume,
        planCostRub,
        factCostRub,
        completionPercent,
        planStart,
        planEnd,
        factStart,
        factEnd,
        gprStageTooltipLines: resolveTmcMaterialGprTooltipLines(groupItems),
      },
    });
  }

  return entries.sort((a, b) => {
    const pctDiff = a.completionPercent - b.completionPercent;
    if (pctDiff !== 0) return pctDiff;
    return a.name.localeCompare(b.name, "ru");
  });
}

export function buildTmcSupplyVolumeChartBundle(
  items: TMCItem[],
  todayIso: string,
): TmcSupplyVolumeChartBundle | null {
  const entries = buildSupplyTimelineEntries(items);
  if (entries.length === 0) return null;

  const today = new Date(`${todayIso.trim()}T12:00:00`);
  const todayValid = !Number.isNaN(today.getTime()) ? today : new Date();

  const allDates: string[] = [];
  for (const e of entries) {
    if (e.hasDates && e.ps && e.pe) {
      allDates.push(e.ps, e.pe);
      if (e.fs) allDates.push(e.fs);
      if (e.fe) allDates.push(e.fe);
    }
  }

  let originMonth: Date;
  let maxD: Date;

  if (allDates.length > 0) {
    const parsed = allDates
      .map((s) => new Date(`${s.trim()}T12:00:00`))
      .filter((d) => !Number.isNaN(d.getTime()));
    const minD = new Date(Math.min(...parsed.map((d) => d.getTime())));
    maxD = new Date(Math.max(...parsed.map((d) => d.getTime())));
    if (maxD.getTime() < todayValid.getTime()) maxD = todayValid;
    originMonth = startOfMonth(minD);
  } else {
    originMonth = startOfMonth(todayValid);
    maxD = todayValid;
  }

  const todayF = monthFloatFromIso(todayIso, originMonth);

  const labels: string[] = [];
  const planRanges: Array<[number, number] | null> = [];
  const factRanges: Array<[number, number] | null> = [];
  const planColors: string[] = [];
  const factColors: string[] = [];
  const factCompletionLabels: string[] = [];
  const rowDetails: PlanFactWorkTypeRowDetail[] = [];
  const rowMeta: TmcSupplyVolumeRowMeta[] = [];

  for (const e of entries) {
    labels.push(e.name);
    factCompletionLabels.push(formatSupplyVolumePct(e.completionPercent));
    rowMeta.push(e.meta);
    rowDetails.push({
      planStart: e.ps ?? "",
      planEnd: e.pe ?? "",
      factStart: e.fs,
      factEnd: e.fe,
      hasDates: e.hasDates,
    });

    const factColor = tmcSupplyVolumeCompletionFactColor(e.completionPercent);
    const anchor = todayF ?? 0.5;

    if (e.hasDates && e.ps && e.pe) {
      const pfS = monthFloatFromIso(e.ps, originMonth);
      const pfE = monthFloatFromIso(e.pe, originMonth);
      if (pfS != null && pfE != null && pfE >= pfS) {
        const [planStartF, planEndF] = ensureMinMonthSpan(pfS, pfE);
        planRanges.push([planStartF, planEndF]);
        planColors.push(PLAN_BAR);

        if (e.fs) {
          const ffS = monthFloatFromIso(e.fs, originMonth);
          const ffE = monthFloatFromIso(e.fe ?? e.fs, originMonth);
          if (ffS != null && ffE != null && ffE >= ffS) {
            const [factStartF, factEndF] = ensureMinMonthSpan(ffS, ffE);
            factRanges.push([factStartF, factEndF]);
            factColors.push(factColor);
          } else {
            factRanges.push(null);
            factColors.push(FACT_WEAK);
          }
        } else {
          factRanges.push(null);
          factColors.push(FACT_WEAK);
        }
      } else {
        planRanges.push([anchor - 0.1, anchor + 0.1]);
        planColors.push(NO_DATE_PLAN);
        factRanges.push(null);
        factColors.push(NO_DATE_FACT);
      }
    } else {
      planRanges.push([anchor - 0.12, anchor + 0.12]);
      planColors.push(NO_DATE_PLAN);
      factRanges.push(null);
      factColors.push(NO_DATE_FACT);
    }
  }

  const yMax = maxD.getFullYear();
  const mMax = String(maxD.getMonth() + 1).padStart(2, "0");
  const dMax = String(maxD.getDate()).padStart(2, "0");
  let xMax = monthFloatFromIso(`${yMax}-${mMax}-${dMax}`, originMonth) ?? 1;
  if (todayF != null && todayF > xMax) xMax = todayF;
  xMax = Math.max(xMax + 0.25, 0.5);

  const model: PlanFactWorkTypeChartModel = {
    labels,
    planRanges,
    factRanges,
    planColors,
    factColors,
    factCompletionLabels,
    rowDetails,
    originMonth,
    xMin: 0,
    xMax,
    todayX: todayF,
  };

  return { model, rowMeta };
}

function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(n);
}

function fmtQtyWithUnit(n: number, unit: string): string {
  const formatted = fmtQty(n);
  if (formatted === "—") return formatted;
  return unit && unit !== "—" ? `${formatted} ${unit}` : formatted;
}

function fmtRub(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(n))} ₽`;
}

function gprStageTooltipLabel(text: string): string {
  return text.replace(/^•\s*/, "");
}

export function formatTmcSupplyVolumeTooltip(meta: TmcSupplyVolumeRowMeta): string {
  const stageLines = meta.gprStageTooltipLines
    .filter((line) => line.tone !== "part")
    .map((line) => gprStageTooltipLabel(line.text));

  const stagesBlock =
    stageLines.length === 0 ? "Не определены" : stageLines.map((line) => `- ${line}`).join("\n");

  return [
    `Материал:\n${meta.name}`,
    `Плановый объём:\n${fmtQtyWithUnit(meta.planVolume, meta.unit)}`,
    `Фактически поставлено:\n${fmtQtyWithUnit(meta.factVolume, meta.unit)}`,
    `Выполнение:\n${formatSupplyVolumePct(meta.completionPercent)}`,
    `Плановая стоимость:\n${fmtRub(meta.planCostRub)}`,
    `Фактическая стоимость:\n${fmtRub(meta.factCostRub)}`,
    `Этапы ГПР:\n${stagesBlock}`,
  ].join("\n\n");
}
