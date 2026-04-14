"use client";

import Link from "next/link";

import type { SalesPlanPresentationExplainBlock } from "@/lib/buildSalesPlanPresentationExplain";
import { SalesPlanExplainInteractiveSection } from "@/components/marketing/SalesPlanExplainInteractiveSection";

type Props = {
  backHref: string;
  blocks: SalesPlanPresentationExplainBlock[];
  introLead: string;
  metaLine?: string | null;
  /** Переход к слайдам презентации с сохранением контекста (query). */
  presentationHref?: string | null;
};

const card =
  "rounded-2xl border border-slate-600/50 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-950/95 p-4 shadow-lg ring-1 ring-white/5 sm:p-5";

export function SalesPlanPresentationExplainView({
  backHref,
  blocks,
  introLead,
  metaLine,
  presentationHref,
}: Props) {
  return (
    <main className="min-h-screen bg-[#0f172a] px-3 py-6 text-slate-100 sm:px-4 md:px-6">
      <div className="mx-auto w-full max-w-[900px] space-y-6">
        <header className={`${card}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-sky-300/90">Маркетинг → План продаж</p>
              <h1 className="mt-1 text-xl font-bold text-white sm:text-2xl">Пояснение к презентации</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">{introLead}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Link
                href={backHref}
                className="rounded-lg border border-slate-600 bg-slate-950/80 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
              >
                ← Назад
              </Link>
              {presentationHref ? (
                <Link
                  href={presentationHref}
                  className="rounded-lg border border-amber-400/60 bg-amber-500/15 px-3 py-2 text-sm font-semibold text-amber-100 shadow-sm hover:bg-amber-500/25"
                >
                  Режим презентации →
                </Link>
              ) : null}
            </div>
          </div>
          {metaLine ? (
            <p className="mt-3 text-xs text-slate-500">
              <span className="text-slate-300">{metaLine}</span>
            </p>
          ) : null}
        </header>

        {blocks.map((b) => (
          <article key={b.id} className={card}>
            <h2 className="text-lg font-bold text-white">{b.title}</h2>

            <section className="mt-4">
              <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Источники данных</h3>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-300">
                {b.dataSources.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </section>

            <section className="mt-4">
              <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Формулы</h3>
              <ol className="mt-2 list-inside list-decimal space-y-1.5 font-mono text-xs text-slate-400">
                {b.formulaLines.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ol>
            </section>

            <section className="mt-4 rounded-xl border border-slate-700/60 bg-slate-950/50 p-3">
              <h3 className="text-[10px] font-bold uppercase tracking-wide text-emerald-400/90">Числа (текущий срез)</h3>
              <ul className="mt-2 space-y-1.5 font-mono text-[11px] leading-relaxed text-slate-300">
                {b.calculationLines.map((line, i) => (
                  <li key={`${b.id}-calc-${i}`} className="border-l-2 border-emerald-500/30 pl-2">
                    {line}
                  </li>
                ))}
              </ul>
              {b.interactive ? <SalesPlanExplainInteractiveSection block={b} /> : null}
            </section>

            <section className="mt-4 border-t border-slate-700/50 pt-4">
              <h3 className="text-[10px] font-bold uppercase tracking-wide text-sky-400">Как считается</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{b.howSection}</p>
            </section>

            <section className="mt-4">
              <h3 className="text-[10px] font-bold uppercase tracking-wide text-amber-300/90">Почему такой результат</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{b.whySection}</p>
            </section>
          </article>
        ))}
      </div>
    </main>
  );
}
