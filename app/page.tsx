import Link from "next/link";

export default function HomePage() {
  const directions = [
    {
      title: "Строительство",
      description: "Управление графиком работ, закупками услуг и ТМЦ.",
      href: "/construction",
    },
    {
      title: "Маркетинг",
      description: "Планирование маркетинговых инициатив и контроль эффективности.",
      href: "/marketing",
    },
    {
      title: "Экономика и финансы",
      description: "Бюджеты, финансовые показатели и экономический анализ.",
      href: "/finance",
    },
  ] as const;

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Главная панель</h1>
        <p className="mt-2 text-sm text-slate-600">Выберите направление работы.</p>
      </div>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {directions.map((direction) => (
          <article
            key={direction.href}
            className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h2 className="text-lg font-semibold text-slate-900">{direction.title}</h2>
            <p className="mt-2 flex-1 text-sm text-slate-600">{direction.description}</p>
            <Link
              href={direction.href}
              className="mt-4 inline-flex w-fit rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Перейти
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}
