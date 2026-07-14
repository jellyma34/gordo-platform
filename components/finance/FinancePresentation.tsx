"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Wallet } from "lucide-react";

import {
  FINANCE_KPI_COLORS,
  FinanceKpiAmountBlock,
  FinanceKpiIconBadge,
  FinanceKpiLabel,
  FinanceKpiMetricBlock,
  FinancePremiumKpiCard,
  financePct1,
  financeRubKpiAmount,
} from "@/components/finance/FinancePresentationKpiPrimitives";
import { segmentedControlTabClass } from "@/components/marketing/marketingSegmentedControlClasses";
import {
  TmcDynamicsChartLegend,
  TmcProcurementDynamicsChart,
  type TmcDynamicsChartLabels,
  type TmcProcurementChartMode,
} from "@/components/tmc/TmcProcurementDynamicsChart";
import type { FinanceBudgetImportMeta, FinanceBudgetLine } from "@/lib/financeBudgetData";
import {
  FINANCE_BUDGET_SAVED_EVENT,
  getGprProjectId,
  loadPersistedFinanceBudget,
} from "@/lib/financeImportPersistence";
import {
  buildFinanceOperatingPaymentsMonthlySeries,
  computeFinanceProjectBudgetKpi,
  FINANCE_OPERATING_PAYMENTS_MISSING_MESSAGE,
  financeOperatingPaymentsChartStartMonth,
  hasFinanceOperatingPaymentsFactSeries,
  hasFinanceOperatingPaymentsLine,
  logFinanceBudgetSourceDiagnostics,
} from "@/lib/financePresentationAnalytics";
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
  const [chartMode, setChartMode] = useState<TmcProcurementChartMode>("monthly");
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(async () => {
    const loaded = await loadPersistedFinanceBudget(projectId);
    setLines(loaded.snapshot.lines);
    setImportMeta(loaded.snapshot.importMeta);
    const source = loaded.snapshot.lines.length === 0 ? "empty" : "localStorage";
    logFinanceBudgetSourceDiagnostics(loaded.snapshot.lines, source, loaded.snapshot.importMeta);
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload, reloadToken]);

  useEffect(() => {
    const onSaved = () => setReloadToken((t) => t + 1);
    window.addEventListener(FINANCE_BUDGET_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(FINANCE_BUDGET_SAVED_EVENT, onSaved);
  }, []);

  const kpi = useMemo(() => computeFinanceProjectBudgetKpi(lines), [lines]);
  const hasOperatingLine = useMemo(() => hasFinanceOperatingPaymentsLine(lines), [lines]);
  const hasFactSeries = useMemo(() => hasFinanceOperatingPaymentsFactSeries(lines), [lines]);

  const monthlySeries = useMemo(
    () => buildFinanceOperatingPaymentsMonthlySeries(lines, today, importMeta),
    [lines, today, importMeta],
  );

  const chartStartMonth = useMemo(
    () => financeOperatingPaymentsChartStartMonth(lines, importMeta),
    [lines, importMeta],
  );

  const chartTimeline = useMemo(() => {
    if (!hasOperatingLine || monthlySeries.length === 0 || !chartStartMonth) return [];
    return fillTmcMonthlyProcurementTimeline(monthlySeries, today, chartStartMonth);
  }, [monthlySeries, today, chartStartMonth, hasOperatingLine]);

  const chartData = useMemo(
    () =>
      chartTimeline.map((point) => ({
        label: point.label,
        plan: chartMode === "monthly" ? point.planMln : point.planCumMln,
        fact: hasFactSeries
          ? chartMode === "monthly"
            ? point.factMln
            : point.factCumMln
          : null,
      })),
    [chartTimeline, chartMode, hasFactSeries],
  );

  const planOnlyChart = !hasFactSeries;

  return (
    <section className="space-y-4">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-slate-50">Экономика и финансы</h2>
      </div>

      <div className="grid grid-cols-1 gap-5">
        <FinancePremiumKpiCard
          glowColor={FINANCE_KPI_COLORS.blue}
          gradient="linear-gradient(145deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.92) 55%, rgba(30,58,138,0.14) 100%)"
          waveColor={FINANCE_KPI_COLORS.blue}
        >
          <div className="flex items-start gap-3">
            <FinanceKpiIconBadge tone="blue">
              <Wallet className="h-5 w-5" strokeWidth={2} />
            </FinanceKpiIconBadge>
            <div className="min-w-0 flex-1">
              <FinanceKpiLabel>БЮДЖЕТ ПРОЕКТА</FinanceKpiLabel>
              <div className="mt-1.5 tabular-nums tracking-tight">
                <span className="text-4xl font-extrabold text-white">
                  {financeRubKpiAmount(kpi.totalBudgetRub)} ₽
                </span>
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-1 flex-col justify-evenly">
            <FinanceKpiAmountBlock
              label="ПЛАН ПОСТУПЛЕНИЙ"
              amountRub={kpi.operatingPaymentsPlanRub}
              accentColor={FINANCE_KPI_COLORS.blue}
              showRubSuffix
            />
            <FinanceKpiMetricBlock
              label="ФАКТ ПОСТУПЛЕНИЙ"
              value={
                kpi.operatingPaymentsFactRub != null
                  ? `${financeRubKpiAmount(kpi.operatingPaymentsFactRub)} ₽`
                  : "—"
              }
              tier="primary"
              accentColor={FINANCE_KPI_COLORS.blue}
              sectionPt="pt-5"
            />
            <FinanceKpiMetricBlock
              label="ВЫПОЛНЕНИЕ БЮДЖЕТА"
              value={financePct1(kpi.budgetExecutionPct)}
              tier="primary"
              accentColor={FINANCE_KPI_COLORS.blue}
              sectionPt="pt-5"
            />
          </div>
        </FinancePremiumKpiCard>
      </div>

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
          {!hasOperatingLine ? (
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
