"use client";

import { formatCompactCurrencyRuParts } from "@/lib/formatCompactCurrencyRu";
import { dec1Fmt } from "@/lib/salesPlanChartFormat";
import type { SalesPlanExecutionPeriodSummary } from "@/lib/salesPlanExecution/buildSalesPlanExecutionData";

type Props = {
  summary: SalesPlanExecutionPeriodSummary;
  presDark: boolean;
  presentation: boolean;
};

function SummaryCard({
  title,
  value,
  unit,
  sub,
  valueTone,
  presDark,
  presentation,
}: {
  title: string;
  value: string;
  unit?: string;
  sub?: string;
  valueTone?: "neutral" | "positive" | "negative";
  presDark: boolean;
  presentation: boolean;
}) {
  const shell = presDark
    ? "rounded-xl border border-white/10 bg-slate-900/35 p-3.5 sm:p-4"
    : presentation
      ? "rounded-xl border border-black/[0.05] bg-white/70 p-3.5 shadow-[0_2px_12px_rgba(15,23,42,0.04)] sm:p-4"
      : "rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm sm:p-4";
  const titleCls = presDark ? "text-slate-400" : "text-slate-500";
  const valueCls =
    valueTone === "positive"
      ? presDark
        ? "text-emerald-300"
        : "text-emerald-700"
      : valueTone === "negative"
        ? presDark
          ? "text-rose-300"
          : "text-rose-700"
        : presDark
          ? "text-slate-50"
          : presentation
            ? "text-[#0F172A]"
            : "text-slate-900";

  return (
    <div className={shell}>
      <div className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${titleCls}`}>{title}</div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <span className={`text-xl font-bold tabular-nums tracking-tight sm:text-2xl ${valueCls}`}>{value}</span>
        {unit ? (
          <span className={`text-sm font-semibold tabular-nums ${presDark ? "text-slate-400" : "text-slate-500"}`}>
            {unit}
          </span>
        ) : null}
      </div>
      {sub ? (
        <div className={`mt-1 text-[11px] font-medium ${presDark ? "text-slate-500" : "text-slate-500"}`}>{sub}</div>
      ) : null}
    </div>
  );
}

function formatRubParts(n: number) {
  const p = formatCompactCurrencyRuParts(n);
  if ("unit" in p) return { value: p.value, unit: p.unit };
  return { value: p.value, unit: undefined };
}

export function PlanFactSummary({ summary, presDark, presentation }: Props) {
  const plan = formatRubParts(summary.planRub);
  const fact = formatRubParts(summary.factRub);
  const dev = formatRubParts(summary.deviationRub);
  const devTone: "positive" | "negative" | "neutral" =
    summary.deviationRub > 0 ? "positive" : summary.deviationRub < 0 ? "negative" : "neutral";
  const pct =
    summary.percentComplete != null && Number.isFinite(summary.percentComplete)
      ? `${dec1Fmt.format(summary.percentComplete)}%`
      : "—";
  const pctTone: "positive" | "negative" | "neutral" =
    summary.percentComplete != null && summary.percentComplete >= 100
      ? "positive"
      : summary.percentComplete != null && summary.percentComplete < 85
        ? "negative"
        : "neutral";

  return (
    <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        title="План периода"
        value={plan.value}
        unit={plan.unit}
        sub={summary.periodLabel}
        presDark={presDark}
        presentation={presentation}
      />
      <SummaryCard
        title="Факт периода"
        value={fact.value}
        unit={fact.unit}
        sub={summary.periodLabel}
        presDark={presDark}
        presentation={presentation}
      />
      <SummaryCard
        title="Отклонение"
        value={dev.value.startsWith("−") ? dev.value : summary.deviationRub >= 0 ? `+${dev.value}` : dev.value}
        unit={dev.unit}
        presDark={presDark}
        presentation={presentation}
        valueTone={devTone}
      />
      <SummaryCard
        title="% выполнения"
        value={pct}
        sub="факт / план"
        presDark={presDark}
        presentation={presentation}
        valueTone={pctTone}
      />
    </div>
  );
}
