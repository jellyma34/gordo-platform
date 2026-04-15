import type { ReactNode } from "react";
import Link from "next/link";

import { UserMenu } from "@/components/auth/UserMenu";

export default function PresentationLayout({ children }: { children: ReactNode }) {
  return (
       <div className="min-h-screen w-full min-w-0 overflow-x-clip bg-gradient-to-b from-[#0b1220] to-[#0f172a]">
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#0b1220] bg-gradient-to-b from-[#0b1220] to-[#0a0f1a] backdrop-blur-sm">
        <div className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-6">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-3">
            <Link
              href="/presentation"
              className="text-sm font-semibold tracking-tight text-slate-100 hover:text-white"
            >
              Презентация проекта
            </Link>
            <span className="text-slate-500">/</span>
            <nav className="flex flex-wrap items-center gap-2 text-sm">
              <Link
                href="/presentation/construction"
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-slate-200 hover:bg-white/10"
              >
                Строительство
              </Link>
              <Link
                href="/presentation/marketing/sales-plan"
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-slate-200 hover:bg-white/10"
              >
                Маркетинг
              </Link>
              <Link
                href="/presentation/finance"
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-slate-200 hover:bg-white/10"
              >
                Финансы
              </Link>
            </nav>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <UserMenu className="[&_a]:border-white/10 [&_a]:bg-white/5 [&_a]:text-slate-200 [&_a]:hover:bg-white/10 [&_button]:border-white/10 [&_button]:bg-white/5 [&_button]:text-slate-200 [&_button]:hover:bg-white/10" />
            <Link
              href="/edit"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
            >
              В рабочий режим
            </Link>
          </div>
        </div>
      </header>

      <main className="w-full min-w-0 bg-transparent px-3 py-4 sm:px-6 sm:py-6">{children}</main>
    </div>
  );
}

