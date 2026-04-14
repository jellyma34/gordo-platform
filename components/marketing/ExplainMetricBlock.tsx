"use client";

import { FormulaVariablesLegend } from "@/components/marketing/salesPlanCharts";
import type { ExplainMetricContent, ExplainMetricDescription } from "@/lib/buildSalesPlanPresentationExplain";
import type { SalesTempoExplainMetricId } from "@/lib/salesPlanExplainMetricIds";

const descCell =
  "rounded-xl border border-slate-700/55 bg-slate-950/45 p-3";
const descTitle = "text-[10px] font-bold uppercase tracking-wide";
const descBody = "mt-1.5 text-xs leading-relaxed text-slate-300";
const sectionLabel = "text-[10px] font-bold uppercase tracking-wide text-slate-500";
const blockShell =
  "mt-3 rounded-xl border border-white/10 bg-[#0f172a]/70 px-3 py-4 text-[10px] leading-snug text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

/** Полоска под графиком — те же отступы и типографика, что у пояснения KPI в SalesPlanKpiDashboard (explain). */
const chartStripShell =
  "mt-2 rounded-b-xl border border-t-0 border-white/10 bg-[#0f172a]/70 px-3 py-3 text-[10px] leading-snug text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";
const stripHdr = "text-[9px] font-bold uppercase tracking-wide text-slate-500";

export function ExplainMetricDescriptionGrid({ description }: { description: ExplainMetricDescription }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className={descCell}>
        <h4 className={`${descTitle} text-sky-400/90`}>Что это</h4>
        <p className={descBody}>{description.whatItIs}</p>
      </div>
      <div className={descCell}>
        <h4 className={`${descTitle} text-sky-400/90`}>Для чего</h4>
        <p className={descBody}>{description.purpose}</p>
      </div>
      <div className={descCell}>
        <h4 className={`${descTitle} text-amber-300/90`}>Почему важно</h4>
        <p className={descBody}>{description.whyImportant}</p>
      </div>
      <div className={descCell}>
        <h4 className={`${descTitle} text-emerald-400/90`}>Как влияет</h4>
        <p className={descBody}>{description.howItAffects}</p>
      </div>
    </div>
  );
}

function stripVariablesLegend(content: ExplainMetricContent) {
  const variables =
    content.variables.length > 0
      ? content.variables.map((v) => ({
          symbol: v.symbol,
          description: v.value ? `${v.label} — ${v.value}` : v.label,
        }))
      : [{ symbol: "—", description: "Дополнительные обозначения для этого среза не требуются." }];
  return variables;
}

export function ExplainMetricBlock({
  content,
  activeMetricId = null,
}: {
  content: ExplainMetricContent;
  /** Подсветка карточки с тем же metricId (связь с графиком explain «Темп продаж»). */
  activeMetricId?: SalesTempoExplainMetricId | null;
}) {
  const variables = stripVariablesLegend(content);

  const hasDescription = content.description != null;
  const interpretationText = content.interpretation ?? "";
  const detailCards = content.formulaDetailCards ?? [];

  if (!hasDescription && detailCards.length > 0) {
    return (
      <div className={chartStripShell}>
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{content.title}</div>

        <div className="mt-3 grid gap-3">
          {detailCards.map((card, i) => {
            const cardVars =
              card.variables.length > 0
                ? card.variables.map((v) => ({
                    symbol: v.symbol,
                    description: v.value ? `${v.label} — ${v.value}` : v.label,
                  }))
                : [{ symbol: "—", description: "Обозначения для этой формулы не требуются." }];

            const active = activeMetricId != null && card.metricId === activeMetricId;
            return (
              <div
                key={`${content.title}-fd-${i}`}
                className={`${descCell} transition-shadow duration-150 ${
                  active ? "ring-2 ring-sky-400/80 ring-offset-2 ring-offset-[#0f172a] shadow-[0_0_20px_-4px_rgba(56,189,248,0.55)]" : ""
                }`}
              >
                <div className={`${descTitle} text-slate-200`}>{card.name}</div>

                <div className="mt-3">
                  <h4 className={`${descTitle} text-sky-400/90`}>Формула</h4>
                  <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-slate-300">{card.formula}</p>
                </div>

                <div className="mt-3">
                  <h4 className={`${descTitle} text-sky-400/90`}>Обозначения</h4>
                  <div className="mt-1.5">
                    <FormulaVariablesLegend variables={cardVars} presentation />
                  </div>
                </div>

                <div className="mt-3">
                  <h4 className={`${descTitle} text-amber-300/90`}>Как считается</h4>
                  <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-slate-200">{card.calculation}</p>
                </div>

                <div className="mt-3">
                  <h4 className={`${descTitle} text-emerald-400/90`}>Почему эта формула</h4>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{card.whyThisFormula}</p>
                </div>

                <div className="mt-3">
                  <h4 className={`${descTitle} text-violet-300/85`}>Интерпретация</h4>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{card.interpretation}</p>
                </div>
              </div>
            );
          })}
        </div>

        {content.formulaSectionFooter ? (
          <div className="mt-3 border-t border-white/10 pt-2">
            <div className={stripHdr}>Итог</div>
            <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-100">{content.formulaSectionFooter}</p>
          </div>
        ) : null}

        {content.conclusion ? (
          <div className="mt-3 border-t border-white/10 pt-2">
            <div className={stripHdr}>Вывод</div>
            <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-100">{content.conclusion}</p>
          </div>
        ) : null}
      </div>
    );
  }

  if (!hasDescription) {
    return (
      <div className={chartStripShell}>
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{content.title}</div>

        <div className="mt-2">
          <div className={stripHdr}>Формула</div>
          <ol className="mt-1 list-inside list-decimal space-y-1 font-mono text-[10px] leading-relaxed text-slate-400">
            {content.formulaLines.map((line, i) => (
              <li key={`${content.title}-sf-${i}`}>{line}</li>
            ))}
          </ol>
        </div>

        <div className="mt-2">
          <div className={stripHdr}>Обозначения</div>
          <div className="mt-1">
            <FormulaVariablesLegend variables={variables} presentation />
          </div>
        </div>

        <div className="mt-2">
          <div className={stripHdr}>Как считается</div>
          <p className="mt-1 font-mono text-[10px] leading-relaxed text-slate-200">{content.calculation}</p>
        </div>

        <div className="mt-2">
          <div className={stripHdr}>Почему</div>
          <p className="mt-1 leading-relaxed text-slate-300">{content.whyThisResult}</p>
        </div>

        <div className="mt-2">
          <div className={stripHdr}>Интерпретация</div>
          <p className="mt-1 leading-relaxed text-slate-300">{interpretationText}</p>
        </div>

        {content.conclusion ? (
          <div className="mt-3 border-t border-white/10 pt-2">
            <div className={stripHdr}>Вывод</div>
            <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-100">{content.conclusion}</p>
          </div>
        ) : null}
      </div>
    );
  }

  const description = content.description;
  if (!description) return null;

  return (
    <div className={blockShell}>
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{content.title}</div>

      <div className="mt-4">
        <h3 className={sectionLabel}>Описание</h3>
        <div className="mt-2">
          <ExplainMetricDescriptionGrid description={description} />
        </div>
      </div>

      <div className="mt-4 border-t border-slate-600/40 pt-4">
        <h3 className={sectionLabel}>Формула</h3>
        <ol className="mt-2 list-inside list-decimal space-y-1 font-mono text-[10px] leading-relaxed text-slate-400">
          {content.formulaLines.map((line, i) => (
            <li key={`${content.title}-f-${i}`}>{line}</li>
          ))}
        </ol>
      </div>

      <div className="mt-4">
        <h3 className={sectionLabel}>Обозначения</h3>
        <div className="mt-2">
          <FormulaVariablesLegend variables={variables} presentation />
        </div>
      </div>

      <div className="mt-4">
        <h3 className={sectionLabel}>Как считается</h3>
        <p className="mt-2 font-mono text-[10px] leading-relaxed text-slate-200">{content.calculation}</p>
      </div>

      <div className="mt-4">
        <h3 className={sectionLabel}>Почему такой результат</h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-300">{content.whyThisResult}</p>
      </div>

      {content.interpretation ? (
        <div className="mt-4">
          <h3 className={sectionLabel}>Интерпретация</h3>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">{content.interpretation}</p>
        </div>
      ) : null}

      <div className="mt-4 border-t border-white/10 pt-3">
        <h3 className={sectionLabel}>Вывод</h3>
        <p className="mt-2 text-[11px] font-medium leading-relaxed text-slate-100">{content.conclusion ?? ""}</p>
      </div>
    </div>
  );
}
