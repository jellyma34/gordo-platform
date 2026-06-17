"use client";

import { useMemo } from "react";
import {
  computeTmcKpiDonutDistributions,
  type TmcEnrichedItem,
  type TmcKpiDonutDistributions,
} from "@/lib/tmcPresentationAnalytics";
import type { Tender } from "@/lib/tenderData";

/** Memo-хук: все KPI donut-распределения за один проход по массиву ТМЦ. */
export function useTmcKpiDonutSegments(
  items: TmcEnrichedItem[],
  tenders: Tender[] = [],
  today: Date = new Date(),
): TmcKpiDonutDistributions {
  return useMemo(
    () =>
      computeTmcKpiDonutDistributions(
        items,
        {
          logDeliveryDiagnostic: true,
          logProblemDiagnostic: true,
          logBudgetDiagnostic: true,
        },
        today,
        tenders,
      ),
    [items, tenders, today],
  );
}
