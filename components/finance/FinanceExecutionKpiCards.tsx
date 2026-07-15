"use client";

import { useEffect } from "react";
import { CircleDollarSign, TrendingDown, TrendingUp } from "lucide-react";

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
import { KpiDonutChart } from "@/components/tmc/KpiDonutChart";
import type { FinanceExecutionPresentationSnapshot } from "@/lib/financeExecutionAnalytics";

const MONEY_VALUE_CLASS = "text-emerald-400";
const PERCENT_VALUE_CLASS = "text-sky-400";
const MISSING_VALUE_CLASS = "text-slate-400";

const formatRubValue = (value: number) => financeRubKpiAmount(value);
const LOG_PREFIX = "[finance-execution-charts]";

function formatMoney(value: number | null): string {
  if (value == null) return "—";
  return `${financeRubKpiAmount(value)} ₽`;
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

type Props = {
  presentation: FinanceExecutionPresentationSnapshot;
};

export function FinanceExecutionKpiCards({ presentation }: Props) {
  const hasSalesDonut = presentation.salesDonutSegments.some((segment) => segment.value > 0);
  const hasExpenseDonut = presentation.expenseDonutSegments.some((segment) => segment.value > 0);

  useEffect(() => {
    if (!presentation.hasData) return;
    console.log(`${LOG_PREFIX} KpiDonutChart props (Доходы):`, {
      hasSalesDonut,
      segments: presentation.salesDonutSegments,
      chartHeight: 108,
    });
    console.log(`${LOG_PREFIX} KpiDonutChart props (Расходы):`, {
      hasExpenseDonut,
      segments: presentation.expenseDonutSegments,
      chartHeight: 108,
    });
  }, [
    hasExpenseDonut,
    hasSalesDonut,
    presentation.expenseDonutSegments,
    presentation.hasData,
    presentation.salesDonutSegments,
  ]);

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
        <div className="flex items-start gap-3">
          <FinanceKpiIconBadge tone="green">
            <TrendingUp className="h-5 w-5" strokeWidth={2} />
          </FinanceKpiIconBadge>
          <div className="min-w-0 flex-1">
            <FinanceKpiLabel>ДОХОДЫ</FinanceKpiLabel>
            <FinanceExecutionMainKpi
              caption="Итого (Доход)"
              value={formatMoney(presentation.revenue)}
              valueClassName={valueClassForMoney(presentation.revenue)}
              glowColor={FINANCE_KPI_COLORS.green}
            />
          </div>
        </div>

        {hasSalesDonut ? (
          <div className="mt-auto space-y-1.5">
            <FinanceKpiDivider />
            <div className="pt-3">
              <KpiDonutChart
                segments={presentation.salesDonutSegments}
                chartHeight={108}
                large
                fullLegendLabels
                formatValue={formatRubValue}
                tooltipValueLabel="Сумма"
              />
            </div>
            <FinanceKpiSplitMoneyBlock
              label="Факт"
              factRub={presentation.revenuePlanExecution.factRub}
              planRub={presentation.revenuePlanExecution.planRub}
              accentColor={FINANCE_KPI_COLORS.green}
              completionPct={presentation.revenuePlanExecution.completionPct}
              completionLabel="Выполнение плана"
            />
          </div>
        ) : null}
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
          <div className="mt-auto space-y-1.5">
            <FinanceKpiDivider />
            <div className="pt-3">
              <KpiDonutChart
                segments={presentation.expenseDonutSegments}
                chartHeight={108}
                large
                fullLegendLabels
                formatValue={formatRubValue}
                tooltipValueLabel="Сумма"
              />
            </div>
            <FinanceKpiSplitMoneyBlock
              label="Законтрактовано"
              factRub={presentation.expenseBudgetUtilization.contractedRub}
              planRub={presentation.expenseBudgetUtilization.projectTotalRub}
              accentColor={FINANCE_KPI_COLORS.red}
              completionPct={presentation.expenseBudgetUtilization.utilizationPct}
              completionLabel="Освоение бюджета"
            />
          </div>
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
