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
    ? "min-h-screen w-full min-w-0 overflow-x-clip bg-[#F5F7FB]"
    : "min-h-screen w-full min-w-0 overflow-x-clip bg-gradient-to-b from-[#0b1220] to-[#0f172a]";

  const marketingHeaderBg = scrolled
    ? "border-b border-[#E5E7EB] bg-[rgba(255,255,255,0.85)] backdrop-blur-[8px]"
    : "border-b border-[#E5E7EB] bg-[rgba(255,255,255,0.7)] backdrop-blur-[8px]";

  const navMarketing = (segment: "construction" | "marketing" | "finance") => {
    const active =
      segment === "construction"
        ? pathname.startsWith("/presentation/construction")
        : segment === "marketing"
          ? pathname.startsWith("/presentation/marketing")
          : pathname.startsWith("/presentation/finance");
    if (active) {
      return "rounded-lg border border-[#C7D2FE] bg-[#EEF2FF] px-3 py-2 text-sm font-medium text-[#2563EB]";
    }
    return "rounded-lg border border-[#D1D5DB] bg-transparent px-3 py-2 text-sm font-medium text-[#374151] transition-colors hover:bg-[#F3F4F6]";
  };

  const navDarkIdle = "rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10";

  const userMenuMarketing =
    "[&_a]:rounded-lg [&_a]:border [&_a]:border-[#D1D5DB] [&_a]:bg-transparent [&_a]:px-3 [&_a]:py-2 [&_a]:text-sm [&_a]:font-medium [&_a]:text-[#374151] [&_a]:hover:bg-[#F3F4F6] [&_button]:rounded-lg [&_button]:border [&_button]:border-[#D1D5DB] [&_button]:bg-transparent [&_button]:px-3 [&_button]:py-2 [&_button]:text-sm [&_button]:font-medium [&_button]:text-[#374151] [&_button]:hover:bg-[#F3F4F6]";

  return (
    <div className={shellClass}>
      {isMarketingLight ? (
        <header className={`sticky top-0 z-40 transition-[background-color] duration-200 ${marketingHeaderBg}`}>
          <div className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-6">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-3">
              <Link href="/presentation" className="text-sm font-semibold tracking-tight text-[#111827] hover:text-[#1F2937]">
                Презентация проекта
              </Link>
              <span className="text-[#9CA3AF]">/</span>
              <nav className="flex flex-wrap items-center gap-2 text-sm">
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

            <div className="flex flex-wrap items-center gap-2">
              <UserMenu className={userMenuMarketing} />
              <Link
                href="/edit"
                className="rounded-lg border border-[#D1D5DB] bg-transparent px-3 py-2 text-sm font-medium text-[#374151] transition-colors hover:bg-[#F3F4F6]"
              >
                В рабочий режим
              </Link>
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
      )}

      {children}
    </div>
  );
}
