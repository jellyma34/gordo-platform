"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";

import { FinanceExecutionKpiCards } from "@/components/finance/FinanceExecutionKpiCards";
import { segmentedControlTabClass } from "@/components/marketing/marketingSegmentedControlClasses";
import {
  TmcDynamicsChartLegend,
  TmcProcurementDynamicsChart,
  type TmcDynamicsChartLabels,
  type TmcProcurementChartMode,
} from "@/components/tmc/TmcProcurementDynamicsChart";
import {
  FINANCE_OPERATING_PAYMENTS_MISSING_MESSAGE,
  getPaymentChart,
} from "@/lib/financeBudgetAnalytics";
import type { FinanceBudgetImportMeta, FinanceBudgetLine } from "@/lib/financeBudgetData";
import {
  emptyFinanceExecutionImport,
  type FinanceExecutionImport,
} from "@/lib/financeBudgetExecutionData";
import { getFinanceExecutionPresentation } from "@/lib/financeExecutionAnalytics";
import {
  FINANCE_BUDGET_EXECUTION_SAVED_EVENT,
  FINANCE_BUDGET_SAVED_EVENT,
  getGprProjectId,
  loadPersistedFinanceBudget,
  loadPersistedFinanceBudgetExecution,
} from "@/lib/financeImportPersistence";
import { fillTmcMonthlyProcurementTimeline } from "@/lib/tmcPresentationAnalytics";

const FINANCE_OPERATING_PAYMENTS_LABELS: TmcDynamicsChartLabels = {
  planTooltip: "План бюджета",
  factTooltip: "Факт бюджета",
  legendPlan: "План бюджета (пунктир)",
  legendFact: "Факт бюджета",
};

export function FinancePresentation() {
  const projectId = useMemo(() => getGprProjectId(), []);
  const chartGradId = useId().replace(/:/g, "");
  const today = useMemo(() => new Date(), []);

  const [lines, setLines] = useState<FinanceBudgetLine[]>([]);
  const [importMeta, setImportMeta] = useState<FinanceBudgetImportMeta | undefined>(undefined);
  const [executionSnapshot, setExecutionSnapshot] = useState<FinanceExecutionImport>(
    emptyFinanceExecutionImport(),
  );
  const [chartMode, setChartMode] = useState<TmcProcurementChartMode>("monthly");
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(async () => {
    const [budgetLoaded, executionLoaded] = await Promise.all([
      loadPersistedFinanceBudget(projectId),
      loadPersistedFinanceBudgetExecution(projectId),
    ]);
    setLines(budgetLoaded.snapshot.lines);
    setImportMeta(budgetLoaded.snapshot.importMeta);
    setExecutionSnapshot(executionLoaded.snapshot);
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload, reloadToken]);

  useEffect(() => {
    const onBudgetSaved = () => setReloadToken((t) => t + 1);
    const onExecutionSaved = () => setReloadToken((t) => t + 1);
    window.addEventListener(FINANCE_BUDGET_SAVED_EVENT, onBudgetSaved);
    window.addEventListener(FINANCE_BUDGET_EXECUTION_SAVED_EVENT, onExecutionSaved);
    return () => {
      window.removeEventListener(FINANCE_BUDGET_SAVED_EVENT, onBudgetSaved);
      window.removeEventListener(FINANCE_BUDGET_EXECUTION_SAVED_EVENT, onExecutionSaved);
    };
  }, []);

  const budgetInput = useMemo(() => ({ lines, importMeta }), [lines, importMeta]);
  const executionPresentation = useMemo(
    () => getFinanceExecutionPresentation({ snapshot: executionSnapshot }),
    [executionSnapshot],
  );
  const paymentChart = useMemo(() => getPaymentChart(budgetInput, today), [budgetInput, today]);

  const chartTimeline = useMemo(() => {
    if (
      !paymentChart.hasOperatingPaymentsLine ||
      paymentChart.monthlySeries.length === 0 ||
      !paymentChart.chartStartMonth
    ) {
      return [];
    }
    return fillTmcMonthlyProcurementTimeline(
      paymentChart.monthlySeries,
      today,
      paymentChart.chartStartMonth,
    );
  }, [paymentChart, today]);

  const chartData = useMemo(
    () =>
      chartTimeline.map((point) => ({
        label: point.label,
        plan: chartMode === "monthly" ? point.planMln : point.planCumMln,
        fact: paymentChart.hasFactSeries
          ? chartMode === "monthly"
            ? point.factMln
            : point.factCumMln
          : null,
      })),
    [chartTimeline, chartMode, paymentChart.hasFactSeries],
  );

  const planOnlyChart = !paymentChart.hasFactSeries;

  return (
    <section className="space-y-4">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-slate-50">Экономика и финансы</h2>
      </div>

      <FinanceExecutionKpiCards presentation={executionPresentation} />

      <div
        className="rounded-2xl border border-slate-600/45 bg-[#1e293b] p-6 shadow-[0_18px_48px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/[0.06]"
        style={{
          background: "linear-gradient(160deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.95) 100%)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-50">Платежи по основным видам деятельности</h3>
          <div className="inline-flex rounded-lg border border-slate-600/70 bg-slate-900/50 p-0.5">
            {(
              [
                { id: "monthly" as const, label: "Помесячно" },
                { id: "cumulative" as const, label: "Нарастающим итогом" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setChartMode(m.id)}
                className={segmentedControlTabClass(chartMode === m.id, "dark")}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 h-[320px] w-full">
          {!paymentChart.hasOperatingPaymentsLine ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-slate-500">
              {FINANCE_OPERATING_PAYMENTS_MISSING_MESSAGE}
            </div>
          ) : chartTimeline.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-slate-500">
              {FINANCE_OPERATING_PAYMENTS_MISSING_MESSAGE}
            </div>
          ) : (
            <TmcProcurementDynamicsChart
              chartData={chartData}
              chartGradId={chartGradId}
              mode={chartMode}
              valueUnit="mln"
              labels={FINANCE_OPERATING_PAYMENTS_LABELS}
              planOnly={planOnlyChart}
            />
          )}
        </div>

        <div className="mt-3 border-t border-slate-700/40 pt-3">
          <TmcDynamicsChartLegend labels={FINANCE_OPERATING_PAYMENTS_LABELS} planOnly={planOnlyChart} />
        </div>
      </div>
    </section>
  );
}
