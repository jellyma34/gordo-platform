"use client";

import type { ReactNode } from "react";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { UserMenu } from "@/components/auth/UserMenu";
import { ConstructionPresentationBreadcrumb } from "@/components/presentation/ConstructionPresentationBreadcrumb";
import { Logo } from "@/components/presentation/PresentationHeaderLogo";
import {
  resolvePresentationProjectName,
  resolvePresentationProjectPhase,
  type PresentationProjectSource,
} from "@/lib/presentationProjectName";

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
  const isConstructionPres = pathname.startsWith("/presentation/construction");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!isMarketingLight) return;
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isMarketingLight]);

  /** Локально для /presentation: убирает «серый хвост» #f8fafc у body при 100dvh, без правок globals.css. */
  useEffect(() => {
    const elHtml = document.documentElement;
    const elBody = document.body;
    const prevHtml = elHtml.style.backgroundColor;
    const prevBody = elBody.style.backgroundColor;
    const prevHtmlH = elHtml.style.height;
    const prevBodyH = elBody.style.minHeight;
    const bg = isMarketingLight ? "#f5f7fb" : "#0b1220";
    elHtml.style.backgroundColor = bg;
    elBody.style.backgroundColor = bg;
    elHtml.style.height = "100%";
    elBody.style.minHeight = "100%";
    elHtml.classList.add("presentation-active");
    elBody.classList.add("presentation-active");
    return () => {
      elHtml.style.backgroundColor = prevHtml;
      elBody.style.backgroundColor = prevBody;
      elHtml.style.height = prevHtmlH;
      elBody.style.minHeight = prevBodyH;
      elHtml.classList.remove("presentation-active");
      elBody.classList.remove("presentation-active");
    };
  }, [isMarketingLight]);

  const shellClass = isMarketingLight
    ? "presentation-shell flex h-[100dvh] min-h-0 max-h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-[#F5F7FB]"
    : "presentation-shell flex h-[100dvh] min-h-0 max-h-[100dvh] w-full min-w-0 flex-col overflow-x-clip overflow-hidden bg-gradient-to-b from-[#0b1220] to-[#0f172a]";

  const marketingHeaderBg = scrolled
    ? "bg-white/90"
    : "bg-white/85";

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

  /** Когда появятся данные проекта (API / контекст), задать объект с полем `name`. */
  const project: PresentationProjectSource | null = null;
  const projectName = resolvePresentationProjectName(project);
  const projectPhase = resolvePresentationProjectPhase(project);

  return (
    <div
      className={shellClass}
      data-presentation={isMarketingLight ? "marketing" : "dark"}
    >
      {isMarketingLight ? (
        <header
          className={`sticky top-0 z-40 m-0 mb-0 min-h-[3.5rem] shrink-0 border-0 border-b-0 py-2 shadow-none ring-0 transition-[background-color] duration-200 [box-shadow:none] ${marketingHeaderBg}`}
        >
          <div className="mx-auto flex min-h-[3.25rem] w-full min-w-0 max-w-[1400px] flex-wrap items-center justify-between gap-3 pl-5 pr-4 sm:gap-5 sm:pl-6 sm:pr-6">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 sm:gap-5">
              <Link
                href="/presentation"
                className="inline-flex max-w-full shrink-0 items-center text-[#111827] hover:text-[#1F2937]"
              >
                <h1 className="m-0 font-medium leading-[1] tracking-tight [font-size:unset]">
                  <div className="project-title">
                    <Logo className="project-logo" />
                    <div className="min-w-0">
                      <span className="project-title-text block">{projectName}</span>
                      <span
                        className={`mt-0.5 block text-sm leading-tight ${
                          isMarketingLight ? "text-gray-400" : "text-slate-400"
                        }`}
                      >
                        {projectPhase}
                      </span>
                    </div>
                  </div>
                </h1>
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
        <header
          className={`sticky top-0 z-40 m-0 mb-0 shrink-0 border-0 bg-[#0b1220] bg-gradient-to-b from-[#0b1220] to-[#0a0f1a] shadow-none ring-0 [box-shadow:none] ${
            isConstructionPres ? "border-b border-white/[0.06]" : "border-b-0"
          }`}
        >
          <div className="mx-auto w-full min-w-0 max-w-[1400px] px-4 sm:px-5">
            <div
              className={`flex flex-wrap items-center justify-between gap-3 ${
                isConstructionPres ? "min-h-0 py-2.5" : "min-h-[3.25rem] py-2.5 sm:py-3"
              }`}
            >
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 sm:gap-5">
                <Link
                  href="/presentation"
                  className="inline-flex max-w-full shrink-0 items-center text-slate-100 hover:text-white"
                >
                  <h1 className="m-0 font-medium leading-[1] tracking-tight [font-size:unset]">
                    <div className="project-title">
                      <Logo className="project-logo" />
                      <div className="min-w-0">
                        <span className="project-title-text block text-slate-100">{projectName}</span>
                        <span className="mt-0.5 block text-sm leading-tight text-slate-400">{projectPhase}</span>
                      </div>
                    </div>
                  </h1>
                </Link>
                <nav
                  className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm sm:gap-2"
                  aria-label="Разделы презентации"
                >
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

              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <UserMenu theme="dark" className="gap-2 sm:gap-3" />
                <Link
                  href="/edit"
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm leading-snug text-slate-200 hover:bg-white/10"
                >
                  В рабочий режим
                </Link>
              </div>
            </div>
            {isConstructionPres ? (
              <div className="pb-2.5 pt-0.5">
                <Suspense
                  fallback={<div className="h-4 w-full max-w-xl animate-pulse rounded bg-white/[0.04]" aria-hidden />}
                >
                  <ConstructionPresentationBreadcrumb project={project} />
                </Suspense>
              </div>
            ) : null}
          </div>
        </header>
      )}

      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col self-stretch overflow-hidden border-0 bg-transparent p-0 shadow-none [box-shadow:none]">
        {children}
      </div>
    </div>
  );
}
