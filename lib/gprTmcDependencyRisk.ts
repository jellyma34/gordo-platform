import {
  GPR_DEP_KPI_THRESHOLD_DAYS,
  GPR_PROGRESS_DELTA_CRITICAL_PP,
} from "@/lib/gprConstructionDeviationConstants";
import type { GprTmcDependencyPoint } from "@/lib/gprTmcDependency";

export type TmcDependencyRiskLevel = "high" | "medium" | "low";

export type TmcDependencyRiskFactor = {
  id: string;
  stageTitle: string;
  label: string;
};

export type TmcDependencyRiskAssessment = {
  level: TmcDependencyRiskLevel;
  factors: TmcDependencyRiskFactor[];
};

const TMC_DEFICIT_HIGH_PP = 10;
const TMC_DEFICIT_MEDIUM_PP = 5;

function tmcDeficitPp(factGpr: number | null, tmcSupply: number | null): number | null {
  if (factGpr === null || tmcSupply === null) return null;
  return Math.max(0, factGpr - tmcSupply);
}

/** Сбор факторов риска срыва с учётом ТМЦ, срока и готовности. */
export function collectTmcDependencyRiskFactors(
  series: GprTmcDependencyPoint[],
): TmcDependencyRiskFactor[] {
  const out: TmcDependencyRiskFactor[] = [];

  for (const row of series) {
    const title = row.stageTitle;

    if (row.impact === "block") {
      out.push({
        id: `${row.groupKey}-tmc-block`,
        stageTitle: title,
        label: `Обеспеченность ТМЦ ${row.tmcSupply ?? 0}% (< 50%)`,
      });
    } else if (row.impact === "risk") {
      out.push({
        id: `${row.groupKey}-tmc-low`,
        stageTitle: title,
        label: `Обеспеченность ТМЦ ${row.tmcSupply ?? 0}% (50–79%)`,
      });
    }

    const deficit = tmcDeficitPp(row.factGpr, row.tmcSupply);
    if (deficit !== null && deficit >= TMC_DEFICIT_MEDIUM_PP) {
      out.push({
        id: `${row.groupKey}-tmc-gap`,
        stageTitle: title,
        label: `Дефицит ТМЦ относительно факта ГПР: факт ${row.factGpr}% > ТМЦ ${row.tmcSupply}% (${deficit} п.п.)`,
      });
    }

    if (row.deviationDays !== null && row.deviationDays <= -GPR_DEP_KPI_THRESHOLD_DAYS) {
      out.push({
        id: `${row.groupKey}-schedule`,
        stageTitle: title,
        label: `Отставание по сроку: ${row.deviationDays} дн. (порог −${GPR_DEP_KPI_THRESHOLD_DAYS} дн.)`,
      });
    } else if (
      row.deviationDays !== null &&
      row.deviationDays < 0 &&
      row.deviationDays > -GPR_DEP_KPI_THRESHOLD_DAYS
    ) {
      out.push({
        id: `${row.groupKey}-schedule-warn`,
        stageTitle: title,
        label: `Умеренное отставание по сроку: ${row.deviationDays} дн.`,
      });
    }

    if (
      row.progressDeltaPp !== null &&
      row.progressDeltaPp < -GPR_PROGRESS_DELTA_CRITICAL_PP
    ) {
      out.push({
        id: `${row.groupKey}-progress`,
        stageTitle: title,
        label: `Отставание готовности: ${row.progressDeltaPp} п.п. (порог −${GPR_PROGRESS_DELTA_CRITICAL_PP} п.п.)`,
      });
    }
  }

  return out;
}

function allTmcFullyCoversFact(series: GprTmcDependencyPoint[]): boolean {
  const withTmc = series.filter((s) => s.tmcSupply !== null);
  if (withTmc.length === 0) return false;
  return withTmc.every(
    (s) =>
      s.tmcSupply! >= 100 ||
      (s.factGpr !== null && s.tmcSupply! >= s.factGpr),
  );
}

/**
 * Итоговый риск срыва для блока «ГПР — ТМЦ».
 * При обеспеченности 100% (и без дефицита к факту) не повышаем до «высокий» только из‑за готовности.
 */
export function assessTmcDependencyRisk(
  series: GprTmcDependencyPoint[],
): TmcDependencyRiskAssessment {
  const factors = collectTmcDependencyRiskFactors(series);
  const tmcCoversAll = allTmcFullyCoversFact(series);

  const hasBlock = factors.some((f) => f.id.endsWith("-tmc-block"));
  const hasLargeDeficit = series.some((s) => {
    const d = tmcDeficitPp(s.factGpr, s.tmcSupply);
    return d !== null && d >= TMC_DEFICIT_HIGH_PP;
  });
  const hasCriticalSchedule = factors.some((f) => f.id.endsWith("-schedule"));
  const hasCriticalProgress = factors.some((f) => f.id.endsWith("-progress"));
  const hasTmcLow = factors.some((f) => f.id.endsWith("-tmc-low"));
  const hasAnyFactor = factors.length > 0;

  if (hasBlock || hasLargeDeficit) {
    return { level: "high", factors };
  }

  if (hasCriticalSchedule && !tmcCoversAll) {
    return { level: "high", factors };
  }

  if (hasCriticalSchedule && tmcCoversAll) {
    return { level: "medium", factors };
  }

  if (hasCriticalProgress && !tmcCoversAll) {
    return { level: "high", factors };
  }

  if (tmcCoversAll) {
    if (hasCriticalProgress || hasTmcLow) {
      return { level: "medium", factors };
    }
    if (factors.some((f) => f.id.endsWith("-schedule-warn") || f.id.endsWith("-tmc-gap"))) {
      return { level: "medium", factors };
    }
    return { level: "low", factors };
  }

  if (hasCriticalProgress || hasTmcLow || hasAnyFactor) {
    return { level: "medium", factors };
  }

  return { level: "low", factors };
}

export function buildTmcDependencyRiskExplanation(
  assessment: TmcDependencyRiskAssessment,
  reportDateLabel: string,
): string {
  const on = reportDateLabel ? ` на ${reportDateLabel}` : "";
  const { level, factors } = assessment;

  const intro =
    level === "high"
      ? `Риск срыва высокий${on}:`
      : level === "medium"
        ? `Риск срыва средний${on}:`
        : factors.length === 0
          ? `Риск срыва низкий${on}: обеспеченность ТМЦ и сроки в норме.`
          : `Риск срыва низкий${on} с факторами наблюдения:`;

  if (factors.length === 0) {
    return `${intro} по этапам нет блокирующих отклонений по ТМЦ и срокам.`;
  }

  const lines = factors.map((f) => `• ${f.stageTitle}: ${f.label}`);
  return [intro, ...lines].join("\n");
}
