"use client";

import type { FinanceExecutionImport, FinanceExecutionKpi } from "@/lib/financeBudgetExecutionData";
import { financeExecutionKpiHasData } from "@/lib/financeBudgetExecutionData";

type KpiRow = {
  label: string;
  value: string;
  isPercent?: boolean;
};

function rub(value: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(Math.round(value))} ₽`;
}

function pct(value: number): string {
  return `${value.toFixed(2).replace(".", ",")}%`;
}

function buildKpiRows(kpi: FinanceExecutionKpi): KpiRow[] {
  return [
    { label: "Итого (доход)", value: kpi.revenue != null ? rub(kpi.revenue) : "—" },
    { label: "Выручка", value: kpi.turnover != null ? rub(kpi.turnover) : "—" },
    { label: "Затраты", value: kpi.expenses != null ? rub(kpi.expenses) : "—" },
    {
      label: "% (затраты, оплата банку)",
      value: kpi.expenseBankPercent != null ? pct(kpi.expenseBankPercent) : "—",
      isPercent: true,
    },
    { label: "EBIT", value: kpi.ebit != null ? rub(kpi.ebit) : "—" },
    {
      label: "Рентабельность по EBIT",
      value: kpi.ebitMargin != null ? pct(kpi.ebitMargin) : "—",
      isPercent: true,
    },
    { label: "Прибыль до НО", value: kpi.profitBeforeTax != null ? rub(kpi.profitBeforeTax) : "—" },
    {
      label: "Рентабельность по прибыли",
      value: kpi.profitMargin != null ? pct(kpi.profitMargin) : "—",
      isPercent: true,
    },
  ];
}

type Props = {
  snapshot: FinanceExecutionImport;
};

export function FinanceExecutionImportPanel({ snapshot }: Props) {
  const rows = buildKpiRows(snapshot.kpi);
  const hasData = financeExecutionKpiHasData(snapshot.kpi);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Исполнение бюджета — KPI
        </h3>
      </div>

      {!hasData ? (
        <p className="px-3 py-8 text-center text-sm text-slate-500">
          Нет данных исполнения бюджета. Импортируйте CSV «Исполнение бюджета».
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => (
            <li
              key={row.label}
              className="flex items-center justify-between gap-4 px-3 py-3 text-sm"
            >
              <span className="min-w-0 font-medium text-slate-700">{row.label}</span>
              <span
                className={`shrink-0 tabular-nums ${
                  row.value === "—"
                    ? "text-slate-400"
                    : row.isPercent
                      ? "font-semibold text-sky-600"
                      : "font-semibold text-slate-900"
                }`}
              >
                {row.value}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
