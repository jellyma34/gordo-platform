"use client";

import Link from "next/link";

import type { StatusTone } from "@/lib/homeDashboardSnapshot";

const statusDotClass: Record<StatusTone, string> = {
  green: "bg-emerald-400",
  yellow: "bg-amber-400",
  red: "bg-rose-500",
};

const statusTitle: Record<StatusTone, string> = {
  green: "В норме",
  yellow: "Внимание",
  red: "Требует внимания",
};

export type HubBlock = {
  title: string;
  /** Одна строка */
  description: string;
  href: string;
  status: StatusTone;
};

type Props = {
  blocks: readonly HubBlock[];
  gridClassName?: string;
};

/**
 * Навигационные карточки разделов: клик по всей области ведёт в маршрут (Link), без KPI внутри.
 */
export function HubSectionCards({ blocks, gridClassName = "hub-section-grid" }: Props) {
  return (
    <section className={gridClassName} aria-label="Разделы платформы">
      {blocks.map((block) => (
        <Link
          key={block.href}
          href={block.href}
          scroll
          className={[
            "group relative block cursor-pointer overflow-hidden rounded-xl no-underline",
            "border border-slate-600/40 bg-slate-900/90 p-4 shadow-md ring-0",
            "transition duration-200 ease-out will-change-transform",
            "hover:z-[1] hover:scale-[1.02] hover:border-slate-500/60 hover:bg-slate-900",
            "hover:shadow-lg hover:shadow-cyan-500/20",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500/60",
            "md:p-5",
          ].join(" ")}
          aria-label={`Перейти: ${block.title}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusDotClass[block.status]}`}
                  title={statusTitle[block.status]}
                  aria-hidden
                />
                <h2 className="text-lg font-semibold tracking-tight text-slate-50 md:text-xl">{block.title}</h2>
              </div>
              <p className="mt-2 line-clamp-1 text-sm leading-snug text-slate-400">{block.description}</p>
            </div>
            <span
              className="shrink-0 pt-0.5 text-xl font-light text-slate-500 transition-colors group-hover:text-cyan-400"
              aria-hidden
            >
              →
            </span>
          </div>
        </Link>
      ))}
    </section>
  );
}
