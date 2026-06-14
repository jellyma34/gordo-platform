import { buildSalesPlanProjectValueByObjectType } from "@/lib/projectCost/buildSalesPlanProjectValueByObjectType";
import type { MarketingProjectValueCsvStoredV1 } from "@/lib/marketingProjectValueCsv";
import { projectValueProjectVolumeRail } from "@/lib/projectValuePeriodKpi";
import type { ProjectValueNormalizedRow } from "@/lib/planDataSource/projectValue/types";

function projectValueRowVolumeRub(row: ProjectValueNormalizedRow): number {
  const rub =
    row.csvFormat === "project_value"
      ? row.charter > 0
        ? row.charter
        : row.projectCost
      : row.projectCost;
  return Number.isFinite(rub) && rub > 0 ? rub : 0;
}

function projectValueGrandTotalRubFromRows(rows: readonly ProjectValueNormalizedRow[]): number | null {
  for (const row of rows) {
    const n = row.segmentNorm.toLowerCase();
    if (n !== "итого" && n !== "всего") continue;
    const rub = projectValueRowVolumeRub(row);
    if (rub > 0) return rub;
  }
  return null;
}

/**
 * Общий объём проекта для «из …» в карточке «По проекту» (Структура продаж).
 * Источник: CSV project_value («Стоимость проекта»), без фильтра по месяцу и без факта сделок.
 */
export function resolveSalesStructureProjectVolumeTotalRub(
  doc: MarketingProjectValueCsvStoredV1 | null | undefined,
): number | null {
  if (!doc?.rows?.length) return null;

  const fromItogo = projectValueGrandTotalRubFromRows(doc.rows);
  if (fromItogo != null) return fromItogo;

  const byObjectType = buildSalesPlanProjectValueByObjectType({
    doc,
    dealRows: [],
    periodGran: "month",
    currentPeriodKey: "2000-01",
    dealFactsBySegment: {
      apartments: null,
      parking: null,
      storage: null,
      commercial: null,
    },
  });

  const rail = projectValueProjectVolumeRail(byObjectType.all.kpiData);
  if (rail != null) return rail.rub;

  const plan = byObjectType.all.cardsData.totalProjectPlan;
  return plan != null && plan > 0 ? plan : null;
}
