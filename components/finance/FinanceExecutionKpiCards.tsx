"use client";

import { CircleDollarSign, TrendingDown } from "lucide-react";

import {
  FinanceExecutionDonutChart,
  type FinanceDonutSegment,
} from "@/components/finance/FinanceExecutionDonutChart";
import { FinanceRevenueProgressCard } from "@/components/finance/FinanceRevenueProgressCard";
import {
  FINANCE_KPI_COLORS,
  FinanceKpiDivider,
  FinanceKpiIconBadge,
  FinanceKpiLabel,
  FinanceKpiMetricBlock,
  FinanceKpiSplitMoneyBlock,
  FinancePremiumKpiCard,
  financePct1,
  financeRubKpiAmount,
} from "@/components/finance/FinancePresentationKpiPrimitives";
import type { FinanceExecutionPresentationSnapshot } from "@/lib/financeExecutionAnalytics";

const MONEY_VALUE_CLASS = "text-emerald-400";
const PERCENT_VALUE_CLASS = "text-sky-400";
const MISSING_VALUE_CLASS = "text-slate-400";

function formatMoney(value: number | null): string {
  if (value == null) return "—";
  return financeRubKpiAmount(value);
}

function formatPercent(value: number | null): string {
  return financePct1(value);
}

function valueClassForMoney(value: number | null): string {
  return value == null ? MISSING_VALUE_CLASS : MONEY_VALUE_CLASS;
}

function valueClassForPercent(value: number | null): string {
  return value == null ? MISSING_VALUE_CLASS : PERCENT_VALUE_CLASS;
}

type FinanceExecutionMainKpiProps = {
  caption: string;
  value: string;
  valueClassName: string;
  glowColor: string;
};

function FinanceExecutionMainKpi({
  caption,
  value,
  valueClassName,
  glowColor,
}: FinanceExecutionMainKpiProps) {
  const glowStyle =
    valueClassName === MONEY_VALUE_CLASS
      ? { textShadow: `0 0 22px ${glowColor}66` }
      : undefined;

  return (
    <div className="mt-1.5 tabular-nums tracking-tight">
      <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{caption}</div>
      <div className={`mt-1 text-4xl font-extrabold ${valueClassName}`} style={glowStyle}>
        {value}
      </div>
    </div>
  );
}

type FinanceExecutionChartCardSectionProps = {
  segments: FinanceDonutSegment[];
  centerPercent: number | null;
  centerSublabelTop: string;
  centerSublabelBottom: string;
  centerValueColor: string;
  splitLabel?: string;
  factRub?: number | null;
  planRub?: number | null;
  accentColor?: string;
  completionPct?: number | null;
  completionLabel?: string;
  showCompletionLine?: boolean;
};

function FinanceExecutionChartCardSection({
  segments,
  centerPercent,
  centerSublabelTop,
  centerSublabelBottom,
  centerValueColor,
  splitLabel = "Факт",
  factRub,
  planRub,
  accentColor = FINANCE_KPI_COLORS.red,
  completionPct,
  completionLabel = "Выполнение",
  showCompletionLine = true,
}: FinanceExecutionChartCardSectionProps) {
  return (
    <div className="mt-auto">
      <FinanceKpiDivider />
      <div className="pt-2">
        <FinanceExecutionDonutChart
          segments={segments}
          centerPercent={centerPercent}
          centerSublabelTop={centerSublabelTop}
          centerSublabelBottom={centerSublabelBottom}
          centerValueColor={centerValueColor}
        />
      </div>
      <FinanceKpiSplitMoneyBlock
        label={splitLabel}
        factRub={factRub ?? null}
        planRub={planRub ?? null}
        accentColor={accentColor}
        completionPct={showCompletionLine ? completionPct : undefined}
        completionLabel={completionLabel}
        compact
      />
    </div>
  );
}

type Props = {
  presentation: FinanceExecutionPresentationSnapshot;
};

export function FinanceExecutionKpiCards({ presentation }: Props) {
  const hasExpenseDonut = presentation.expenseDonutSegments.some((segment) => segment.value > 0);

  if (!presentation.hasData) {
    return (
      <div className="rounded-[20px] border border-slate-600/45 bg-[#1e293b] p-8 text-center text-sm text-slate-500">
        Нет данных исполнения бюджета. Импортируйте CSV «Исполнение бюджета» в режиме редактирования.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <FinancePremiumKpiCard
        glowColor={FINANCE_KPI_COLORS.green}
        gradient="linear-gradient(145deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.92) 55%, rgba(21,128,61,0.14) 100%)"
        waveColor={FINANCE_KPI_COLORS.green}
      >
        <FinanceRevenueProgressCard presentation={presentation} />
      </FinancePremiumKpiCard>

      <FinancePremiumKpiCard
        glowColor={FINANCE_KPI_COLORS.red}
        gradient="linear-gradient(145deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.92) 55%, rgba(127,29,29,0.16) 100%)"
        waveColor={FINANCE_KPI_COLORS.red}
        waveOpacity={0.25}
      >
        <div className="flex items-start gap-3">
          <FinanceKpiIconBadge tone="red">
            <TrendingDown className="h-5 w-5" strokeWidth={2} />
          </FinanceKpiIconBadge>
          <div className="min-w-0 flex-1">
            <FinanceKpiLabel>РАСХОДЫ</FinanceKpiLabel>
            <FinanceExecutionMainKpi
              caption="Затраты"
              value={formatMoney(presentation.expenses)}
              valueClassName={valueClassForMoney(presentation.expenses)}
              glowColor={FINANCE_KPI_COLORS.red}
            />
          </div>
        </div>

        {hasExpenseDonut ? (
          <FinanceExecutionChartCardSection
            segments={presentation.expenseDonutSegments}
            centerPercent={presentation.expenseBudgetUtilization.utilizationPct}
            centerSublabelTop="Освоение"
            centerSublabelBottom="бюджета"
            centerValueColor="#f8fafc"
            splitLabel="Законтрактовано"
            factRub={presentation.expenseBudgetUtilization.contractedRub}
            planRub={presentation.expenseBudgetUtilization.projectTotalRub}
            accentColor={FINANCE_KPI_COLORS.red}
            completionPct={presentation.expenseBudgetUtilization.utilizationPct}
            completionLabel="Освоение бюджета"
          />
        ) : null}
      </FinancePremiumKpiCard>

      <FinancePremiumKpiCard
        glowColor={FINANCE_KPI_COLORS.teal}
        gradient="linear-gradient(145deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.92) 55%, rgba(20,184,166,0.16) 100%)"
        waveColor={FINANCE_KPI_COLORS.teal}
      >
        <div className="flex items-start gap-3">
          <FinanceKpiIconBadge tone="teal">
            <CircleDollarSign className="h-5 w-5" strokeWidth={2} />
          </FinanceKpiIconBadge>
          <div className="min-w-0 flex-1">
            <FinanceKpiLabel>ОБЩАЯ ПРИБЫЛЬ</FinanceKpiLabel>
          </div>
        </div>

        <div className="mt-2 flex flex-1 flex-col justify-evenly">
          <FinanceKpiMetricBlock
            label="EBIT"
            value={formatMoney(presentation.ebit)}
            tier="primary"
            accentColor={FINANCE_KPI_COLORS.teal}
            valueClassName={valueClassForMoney(presentation.ebit)}
            sectionPt="pt-5"
          />
          <FinanceKpiMetricBlock
            label="Прибыль до НО"
            value={formatMoney(presentation.profitBeforeTax)}
            tier="primary"
            accentColor={FINANCE_KPI_COLORS.teal}
            valueClassName={valueClassForMoney(presentation.profitBeforeTax)}
            sectionPt="pt-5"
          />
          <FinanceKpiMetricBlock
            label="Рентабельность EBIT"
            value={formatPercent(presentation.ebitMargin)}
            tier="primary"
            accentColor={FINANCE_KPI_COLORS.teal}
            valueClassName={valueClassForPercent(presentation.ebitMargin)}
            sectionPt="pt-5"
          />
          <FinanceKpiMetricBlock
            label="Рентабельность прибыли"
            value={formatPercent(presentation.profitMargin)}
            tier="primary"
            accentColor={FINANCE_KPI_COLORS.teal}
            valueClassName={valueClassForPercent(presentation.profitMargin)}
            sectionPt="pt-5"
          />
        </div>
      </FinancePremiumKpiCard>
    </div>
  );
}
