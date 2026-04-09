"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useAppMode } from "@/components/mode/ModeProvider";

export default function EditEntry() {
  const { setMode } = useAppMode();

  useEffect(() => {
    setMode("edit");
  }, [setMode]);

  const blocks = [
    {
      title: "Строительство",
      description: "ГПР, закупка услуг (тендеры) и закупка ТМЦ.",
      href: "/edit/construction",
    },
    {
      title: "Маркетинг",
      description: "План продаж, динамика, воронка и рассрочка ДДУ (mock-данные).",
      href: "/edit/marketing",
    },
    {
      title: "Экономика и финансы",
      description: "Финансовые показатели и экономика проекта (в разработке).",
      href: "/edit/finance",
    },
  ] as const;

  return (
    <main className="mx-auto min-h-[60vh] max-w-7xl space-y-6 bg-slate-50 p-4 md:p-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Редактирование</h1>
        <p className="mt-2 text-sm text-slate-600">Выберите блок платформы.</p>
      </div>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {blocks.map((block) => (
          <Link
            key={block.href}
            href={block.href}
            className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow"
          >
            <h2 className="text-lg font-semibold text-slate-900">{block.title}</h2>
            <p className="mt-2 flex-1 text-sm text-slate-600">{block.description}</p>
            <span className="mt-4 inline-flex w-fit rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
              Перейти
            </span>
          </Link>
        ))}
      </section>
    </main>
  );
}

