"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { UserMenu } from "@/components/auth/UserMenu";

type Props = {
  children: ReactNode;
};

/**
 * Оболочка /presentation/*: тёмный chrome по умолчанию;
 * для /presentation/marketing/* — светлая стеклянная шапка и фон страницы (без изменения других разделов).
 */
export function PresentationChrome({ children }: Props) {
  const pathname = usePathname() ?? "";
  const isMarketingLight = pathname.startsWith("/presentation/marketing");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!isMarketingLight) return;
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isMarketingLight]);

  const shellClass = isMarketingLight
    ? "flex h-screen max-h-screen w-full min-w-0 flex-col overflow-hidden bg-[#F5F7FB]"
    : "min-h-screen w-full min-w-0 overflow-x-clip bg-gradient-to-b from-[#0b1220] to-[#0f172a]";

  const marketingHeaderBg = scrolled
    ? "border-b border-slate-200/40 bg-white/55 backdrop-blur-[12px]"
    : "border-b border-slate-200/30 bg-white/40 backdrop-blur-[12px]";

  const navMarketing = (segment: "construction" | "marketing" | "finance") => {
    const active =
      segment === "construction"
        ? pathname.startsWith("/presentation/construction")
        : segment === "marketing"
          ? pathname.startsWith("/presentation/marketing")
          : pathname.startsWith("/presentation/finance");
    if (active) {
      return "rounded-xl bg-blue-500/10 px-3 py-1.5 text-sm font-medium text-blue-600";
    }
    return "rounded-xl px-3 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100";
  };

  const navDarkIdle = "rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10";

  return (
    <div className={shellClass}>
      {isMarketingLight ? (
        <header
          className={`sticky top-0 z-40 min-h-[3.5rem] shrink-0 py-2 transition-[background-color] duration-200 ${marketingHeaderBg}`}
        >
          <div className="mx-auto flex min-h-[3.25rem] w-full min-w-0 max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 sm:gap-5 sm:px-8">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 sm:gap-5">
              <Link
                href="/presentation"
                className="shrink-0 text-sm font-semibold tracking-tight text-[#111827] hover:text-[#1F2937]"
              >
                Презентация проекта
              </Link>
              <nav className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm sm:gap-2">
                <Link href="/presentation/construction" className={navMarketing("construction")}>
                  Строительство
                </Link>
                <Link href="/presentation/marketing/sales-plan" className={navMarketing("marketing")}>
                  Маркетинг
                </Link>
                <Link href="/presentation/finance" className={navMarketing("finance")}>
                  Финансы
                </Link>
              </nav>
            </div>

            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <UserMenu theme="marketing" className="gap-3 sm:gap-4" />
            </div>
          </div>
        </header>
      ) : (
        <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#0b1220] bg-gradient-to-b from-[#0b1220] to-[#0a0f1a] backdrop-blur-sm">
          <div className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-6">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-3">
              <Link href="/presentation" className="text-sm font-semibold tracking-tight text-slate-100 hover:text-white">
                Презентация проекта
              </Link>
              <span className="text-slate-500">/</span>
              <nav className="flex flex-wrap items-center gap-2 text-sm">
                <Link href="/presentation/construction" className={navDarkIdle}>
                  Строительство
                </Link>
                <Link href="/presentation/marketing/sales-plan" className={navDarkIdle}>
                  Маркетинг
                </Link>
                <Link href="/presentation/finance" className={navDarkIdle}>
                  Финансы
                </Link>
              </nav>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <UserMenu theme="dark" />
              <Link
                href="/edit"
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
              >
                В рабочий режим
              </Link>
            </div>
          </div>
        </header>
      )}

      {isMarketingLight ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
      ) : (
        children
      )}
    </div>
  );
}
