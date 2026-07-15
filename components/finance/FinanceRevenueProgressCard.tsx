"use client";

import { TrendingUp } from "lucide-react";

import {
  FINANCE_KPI_COLORS,
  FinanceKpiDivider,
  FinanceKpiIconBadge,
  FinanceKpiLabel,
  financePct1,
  financeRubKpiAmount,
  financeRubKpiAmountMln,
} from "@/components/finance/FinancePresentationKpiPrimitives";
import type { FinanceExecutionPresentationSnapshot } from "@/lib/financeExecutionAnalytics";

const MONEY_VALUE_CLASS = "text-emerald-400";
const MISSING_VALUE_CLASS = "text-slate-400";

const REVENUE_CATEGORY_ORDER = ["apartments", "parking", "storage", "admin"] as const;

function clampProgressWidth(percent: number | null): number {
  if (percent == null || !Number.isFinite(percent)) return 0;
  return Math.max(0, Math.min(100, percent));
}

function categoryPlanExecutionPercent(factRub: number, planRub: number | null | undefined): number | null {
  if (planRub == null || planRub <= 0) return null;
  return Math.round((factRub / planRub) * 1000) / 10;
}

function categoryShareOfTotalPlanPercent(factRub: number, totalPlanRub: number | null): number {
  if (totalPlanRub == null || totalPlanRub <= 0) return 0;
  return (factRub / totalPlanRub) * 100;
}

function sortRevenueSegments<T extends { id: string }>(segments: T[]): T[] {
  return [...segments].sort((left, right) => {
    const leftIndex = REVENUE_CATEGORY_ORDER.indexOf(left.id as (typeof REVENUE_CATEGORY_ORDER)[number]);
    const rightIndex = REVENUE_CATEGORY_ORDER.indexOf(right.id as (typeof REVENUE_CATEGORY_ORDER)[number]);
    const leftOrder = leftIndex >= 0 ? leftIndex : REVENUE_CATEGORY_ORDER.length;
    const rightOrder = rightIndex >= 0 ? rightIndex : REVENUE_CATEGORY_ORDER.length;
    return leftOrder - rightOrder;
  });
}

function formatFactPlanMln(factRub: number, planRub: number | null | undefined): string {
  if (planRub != null && planRub > 0) {
    return `${financeRubKpiAmountMln(factRub)} / ${financeRubKpiAmountMln(planRub)}`;
  }
  return financeRubKpiAmountMln(factRub);
}

type FinanceProgressTrackProps = {
  percent: number | null;
  fillColor: string;
  heightClass?: string;
  showPercentInside?: boolean;
  animate?: boolean;
};

function FinanceProgressTrack({
  percent,
  fillColor,
  heightClass = "h-3.5",
  showPercentInside = false,
  animate = true,
}: FinanceProgressTrackProps) {
  const width = clampProgressWidth(percent);
  const fillGlow = { boxShadow: `0 0 14px ${fillColor}88` };

  return (
    <div
      className={`relative w-full overflow-hidden rounded-full bg-slate-900/70 ring-1 ring-inset ring-slate-600/35 ${heightClass}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={width}
    >
      <div
        className={`h-full rounded-full ${animate ? "transition-[width] duration-700 ease-out" : ""}`}
        style={{
          width: `${width}%`,
          backgroundColor: fillColor,
          ...fillGlow,
        }}
      />
      {showPercentInside && percent != null ? (
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[11px] font-bold tabular-nums tracking-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]">
          {financePct1(percent)}
        </span>
      ) : null}
    </div>
  );
}

type StackedPlanSegment = {
  id: string;
  valueRub: number;
  color: string;
};

type FinanceStackedPlanProgressTrackProps = {
  segments: StackedPlanSegment[];
  totalPlanRub: number;
  completionPct: number | null;
  heightClass?: string;
  animate?: boolean;
};

/** Составная полоса: каждый сегмент = factCategory / totalPlan. */
function FinanceStackedPlanProgressTrack({
  segments,
  totalPlanRub,
  completionPct,
  heightClass = "h-4",
  animate = true,
}: FinanceStackedPlanProgressTrackProps) {
  const filledSegments = segments.filter((segment) => segment.valueRub > 0);
  const ariaValue = completionPct ?? clampProgressWidth(
    filledSegments.reduce(
      (sum, segment) => sum + categoryShareOfTotalPlanPercent(segment.valueRub, totalPlanRub),
      0,
    ),
  );

  return (
    <div
      className={`relative w-full overflow-hidden rounded-full bg-slate-800/90 ring-1 ring-inset ring-slate-600/35 ${heightClass}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ariaValue * 10) / 10}
      aria-label="Структура выполнения плана по категориям"
    >
      <div className={`flex h-full ${animate ? "transition-[width] duration-700 ease-out" : ""}`}>
        {filledSegments.map((segment) => {
          const widthPct = categoryShareOfTotalPlanPercent(segment.valueRub, totalPlanRub);
          if (widthPct <= 0) return null;

          return (
            <div
              key={segment.id}
              className="h-full shrink-0"
              style={{
                width: `${widthPct}%`,
                backgroundColor: segment.color,
                boxShadow: `inset 0 -1px 0 rgba(0,0,0,0.12), 0 0 10px ${segment.color}55`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function FinanceRevenueCategorySkeleton() {
  return (
    <div className="space-y-2.5 animate-pulse">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="space-y-1.5">
          <div className="h-2.5 w-24 rounded bg-slate-700/50" />
          <div className="h-2 w-full rounded-full bg-slate-800/80" />
        </div>
      ))}
    </div>
  );
}

type Props = {
  presentation: FinanceExecutionPresentationSnapshot;
};

export function FinanceRevenueProgressCard({ presentation }: Props) {
  const { factRub, planRub, completionPct } = presentation.revenuePlanExecution;
  const salesChart = presentation.salesChart;
  const factTotalRub = factRub ?? salesChart?.factTotalRub ?? null;

  const remainingRub =
    planRub != null && factRub != null ? Math.max(0, planRub - factRub) : null;

  const activeSegments = sortRevenueSegments(
    salesChart?.segments.filter((segment) => segment.valueRub > 0) ?? [],
  );

  const hasCategoryData = activeSegments.length > 0 && factTotalRub != null && factTotalRub > 0;
  const canShowStackedPlanBar = hasCategoryData && planRub != null && planRub > 0;

  const mainValueClass = factRub == null ? MISSING_VALUE_CLASS : MONEY_VALUE_CLASS;
  const mainGlow =
    factRub != null ? { textShadow: `0 0 22px ${FINANCE_KPI_COLORS.green}66` } : undefined;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-start gap-3">
        <FinanceKpiIconBadge tone="green">
          <TrendingUp className="h-5 w-5" strokeWidth={2} />
        </FinanceKpiIconBadge>
        <div className="min-w-0 flex-1">
          <FinanceKpiLabel>ДОХОДЫ</FinanceKpiLabel>
          <div className="mt-1.5 tabular-nums tracking-tight">
            <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
              Фактический доход
            </div>
            <div className={`mt-1 text-4xl font-extrabold ${mainValueClass}`} style={mainGlow}>
              {factRub != null ? financeRubKpiAmount(factRub) : "—"}
            </div>
            <div className="mt-1 text-xs tabular-nums text-slate-400">
              План:{" "}
              <span className="font-medium text-slate-300">
                {planRub != null ? financeRubKpiAmount(planRub) : "—"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-auto space-y-3 pt-3">
        <FinanceKpiDivider />

        <div className="space-y-2">
          <div className="flex items-end justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Выполнение плана
              </span>
              {completionPct != null ? (
                <>
                  <span
                    className="mb-0.5 min-w-[12px] flex-1 border-b border-dotted border-slate-600/45"
                    aria-hidden
                  />
                  <span className="shrink-0 text-[10px] font-bold tabular-nums text-emerald-400">
                    {financePct1(completionPct)}
                  </span>
                </>
              ) : null}
            </div>
            <span className="shrink-0 text-right text-[10px] tabular-nums text-slate-400">
              Осталось:{" "}
              <span className="font-semibold text-slate-300">
                {remainingRub != null ? financeRubKpiAmount(remainingRub) : "—"}
              </span>
            </span>
          </div>
          {canShowStackedPlanBar ? (
            <FinanceStackedPlanProgressTrack
              segments={activeSegments.map((segment) => ({
                id: segment.id,
                valueRub: segment.valueRub,
                color: segment.color,
              }))}
              totalPlanRub={planRub}
              completionPct={completionPct}
              heightClass="h-4"
            />
          ) : (
            <FinanceProgressTrack
              percent={completionPct}
              fillColor={FINANCE_KPI_COLORS.green}
              heightClass="h-4"
            />
          )}
        </div>

        <FinanceKpiDivider />

        {hasCategoryData ? (
          <ul className="space-y-2">
            {activeSegments.map((segment) => {
              const progressPct = categoryPlanExecutionPercent(segment.valueRub, segment.planRub);
              const displayLabel = segment.legendLabel ?? segment.label;

              return (
                <li key={segment.id} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor: segment.color,
                        boxShadow: `0 0 8px ${segment.color}aa`,
                      }}
                      aria-hidden
                    />
                    <span className="min-w-0 truncate text-[10px] font-medium text-slate-300">
                      {displayLabel}
                    </span>
                    <span className="ml-auto shrink-0 text-right tabular-nums text-[10px] font-semibold text-white">
                      {formatFactPlanMln(segment.valueRub, segment.planRub)}
                    </span>
                  </div>
                  <FinanceProgressTrack
                    percent={progressPct}
                    fillColor={segment.color}
                    heightClass="h-2"
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <FinanceRevenueCategorySkeleton />
        )}
      </div>
    </div>
  );
}
