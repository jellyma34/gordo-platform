"use client";

import { useMemo } from "react";
import {
  computeTmcKpiDonutDistributions,
  type TmcEnrichedItem,
  type TmcKpiDonutDistributions,
} from "@/lib/tmcPresentationAnalytics";

/** Memo-хук: все три KPI donut-распределения за один проход по массиву ТМЦ. */
export function useTmcKpiDonutSegments(items: TmcEnrichedItem[]): TmcKpiDonutDistributions {
  return useMemo(
    () =>
      computeTmcKpiDonutDistributions(items, {
        logDeliveryDiagnostic: true,
        logProblemDiagnostic: true,
        logBudgetDiagnostic: true,
      }),
    [items],
  );
}
