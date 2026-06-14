"use client";

import { useMemo } from "react";
import {
  computeTenderKpiDonutDistributions,
  type TenderKpiDonutDistributions,
} from "@/lib/tenderPresentationAnalytics";
import type { Tender } from "@/lib/tenderData";

/** Memo-хук: все три KPI donut-распределения за один проход по реестру тендеров. */
export function useTenderKpiDonutSegments(
  tenders: Tender[],
  today: Date = new Date(),
): TenderKpiDonutDistributions {
  return useMemo(
    () => computeTenderKpiDonutDistributions(tenders, today),
    [tenders, today],
  );
}
