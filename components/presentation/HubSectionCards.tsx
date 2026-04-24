"use client";

import Link from "next/link";

export type HubBlock = {
  title: string;
  description: string;
  href: string;
  /** Карточка входа «Маркетинг → План продаж»: фон building.jpg через `.marketing-plan-card` */
  marketingPlanEntry?: boolean;
};

type Props = {
  blocks: readonly HubBlock[];
  /** Общая сетка: те же классы, что на `/presentation`, чтобы фон/overlay совпадали */
  gridClassName?: string;
};

/**
 * Карточки выбора раздела. Обычные: `section-card` + слои в globals.css.
 * Вход «План продаж»: изолированный класс `marketing-plan-card` (тот же хаб, без затрагивания строительства).
 */
export function HubSectionCards({ blocks, gridClassName = "hub-section-grid" }: Props) {
  return (
    <section className={gridClassName} aria-label="Разделы платформы">
      {blocks.map((block) => (
        <Link
          key={block.href}
          href={block.href}
          className="group block overflow-hidden rounded-xl border border-slate-200/20 shadow text-inherit no-underline transition hover:-translate-y-1 hover:border-sky-500/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500/50"
        >
          {block.marketingPlanEntry ? (
            <div className="marketing-plan-card min-h-[180px]">
              <div className="card-content">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">{block.title}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{block.description}</p>
                  </div>
                  <span
                    className="shrink-0 text-xl font-light text-slate-400 transition-colors group-hover:text-sky-600"
                    aria-hidden
                  >
                    →
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="section-card">
              <div className="section-card-bg" aria-hidden />
              <div className="section-card-overlay" aria-hidden />
              <div className="card-content">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">{block.title}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{block.description}</p>
                  </div>
                  <span
                    className="shrink-0 text-xl font-light text-slate-400 transition-colors group-hover:text-sky-600"
                    aria-hidden
                  >
                    →
                  </span>
                </div>
              </div>
            </div>
          )}
        </Link>
      ))}
    </section>
  );
}
