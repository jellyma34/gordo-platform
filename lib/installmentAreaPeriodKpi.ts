import type { InstallmentAreaKpiPlanSlice } from "@/lib/planDataSource/installmentArea/installmentAreaPlanSlice";
import { dec1Fmt } from "@/lib/salesPlanChartFormat";

export type InstallmentAreaPeriodKpiUiData =
  | ({
      hasCsvPlan: true;
    } & InstallmentAreaKpiPlanSlice)
  | {
      hasCsvPlan: false;
      factMonthArea: number;
      factCumulativeArea: number;
    };

export function formatInstallmentAreaSqmValue(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return dec1Fmt.format(n);
}

export function formatInstallmentAreaSqmParts(
  n: number | null | undefined,
): { value: string; unit: string } | { value: "—" } {
  const value = formatInstallmentAreaSqmValue(n);
  if (value === "—") return { value: "—" };
  return { value, unit: "кв.м" };
}

export function formatInstallmentAreaSqm(n: number | null | undefined): string {
  const parts = formatInstallmentAreaSqmParts(n);
  if (parts.value === "—") return "—";
  return `${parts.value} ${parts.unit}`;
}

export function installmentAreaExecutionPercent(
  numerator: number,
  planDenominator: number | null | undefined,
): number | null {
  if (planDenominator == null || !Number.isFinite(planDenominator) || planDenominator <= 0) return null;
  if (!Number.isFinite(numerator)) return null;
  return (numerator / planDenominator) * 100;
}

export function installmentAreaVolumePercent(
  factCumulativeArea: number,
  totalProjectArea: number | null | undefined,
  hasCsvPlan: boolean,
): number | null {
  if (!hasCsvPlan) return null;
  return installmentAreaExecutionPercent(factCumulativeArea, totalProjectArea);
}

export type ApartmentKpiHue = "green" | "yellow" | "red";

export function installmentAreaKpiHue(pct: number | null): ApartmentKpiHue {
  if (pct == null) return "yellow";
  if (pct >= 100) return "green";
  if (pct >= 85) return "yellow";
  return "red";
}

export function installmentAreaProgressWidthPercent(pct: number | null): number {
  if (pct == null) return 0;
  return Math.min(100, Math.max(0, pct));
}

export function installmentAreaPeriodKpiHasData(data: InstallmentAreaPeriodKpiUiData | null | undefined): boolean {
  if (!data) return false;
  if (data.hasCsvPlan) {
    return data.planCumulativeArea > 0 || data.planMonthArea > 0 || data.projectArea > 0;
  }
  return data.factCumulativeArea > 0 || data.factMonthArea > 0;
}
