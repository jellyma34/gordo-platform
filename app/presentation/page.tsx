"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useAppMode } from "@/components/mode/ModeProvider";

export default function PresentationEntry() {
  const { setMode } = useAppMode();

  useEffect(() => {
    setMode("presentation");
  }, [setMode]);

  const blocks = [
    {
      title: "Строительство",
      description: "ГПР, тендеры и закупка ТМЦ — аналитика и контроль графика работ.",
      href: "/presentation/construction",
    },
    {
      title: "Маркетинг",
      description: "Показатели и направления маркетинга (в разработке).",
      href: "/presentation/marketing",
    },
    {
      title: "Финансы",
      description: "Экономика проекта и финансовые показатели (в разработке).",
      href: "/presentation/finance",
    },
  ] as const;

  return (
    <div className="presentation-wrapper">
      <div className="presentation-content">
        <h1 className="presentation-subtitle text-lg font-medium leading-relaxed text-slate-300 md:text-xl">
          Выберите раздел для анализа
        </h1>

        <section className="presentation-section-grid" aria-label="Разделы платформы">
          {blocks.map((block) => (
            <Link key={block.href} href={block.href} className="section-card group">
              <div className="flex flex-1 flex-col">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-semibold tracking-tight text-white md:text-2xl">
                      {block.title}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">
                      {block.description}
                    </p>
                  </div>
                  <span
                    className="shrink-0 text-xl font-light text-slate-500 transition-colors group-hover:text-sky-400/90"
                    aria-hidden
                  >
                    →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}
