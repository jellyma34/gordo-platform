"use client";

export type FormulaVariableEntry = {
  /** Обозначение в формуле (как в учебнике) */
  symbol: string;
  description: string;
};

type FormulaVariablesLegendProps = {
  variables?: FormulaVariableEntry[];
  /** Пояснение для суммы (в списке: «Σ — …») */
  sigmaNote?: string;
  presentation: boolean;
};

/**
 * Справка по переменным сразу под формулой (режим презентации и подсказки KPI).
 */
export function FormulaVariablesLegend({ variables, sigmaNote, presentation }: FormulaVariablesLegendProps) {
  const hasVars = variables != null && variables.length > 0;
  if (!hasVars && !sigmaNote) return null;

  const labelMuted = presentation ? "text-slate-500" : "text-slate-500";
  const itemText = presentation ? "text-slate-400" : "text-slate-600";
  const symClass = presentation ? "font-mono text-[9px] text-slate-300" : "font-mono text-[9px] text-slate-800";

  return (
    <div className={`mt-1.5 ${itemText}`}>
      <div className={`text-[9px] font-medium ${labelMuted}`}>где:</div>
      <ul className="mt-0.5 list-inside list-disc space-y-0.5 pl-0.5 text-[9px] leading-snug">
        {variables?.map((v) => (
          <li key={`${v.symbol}-${v.description.slice(0, 24)}`}>
            <span className={symClass}>{v.symbol}</span>
            {" — "}
            <span>{v.description}</span>
          </li>
        ))}
        {sigmaNote ? (
          <li className="text-[9px] leading-snug text-slate-500">
            <span className={symClass}>Σ</span>
            {" — "}
            {sigmaNote}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
