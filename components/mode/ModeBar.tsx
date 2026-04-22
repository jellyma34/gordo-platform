"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { UserMenu } from "@/components/auth/UserMenu";
import { SALES_PLAN_SPA } from "@/lib/salesPlanSpaRoutes";
import { useAppMode, type AppMode } from "./ModeProvider";

function modeLabel(mode: AppMode) {
  return mode === "presentation" ? "Презентация" : "Редактирование";
}

function ModeBarInner() {
  const { mode, setMode } = useAppMode();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (pathname === "/login" || pathname?.startsWith("/admin")) return null;

  const isOnModeSelect = pathname === "/";
  if (isOnModeSelect) return null;

  const isPresentation = pathname.startsWith("/presentation");
  if (isPresentation) return null;
  const isEdit = pathname.startsWith("/edit");
  const restPath = isPresentation
    ? pathname.replace("/presentation", "")
    : isEdit
      ? pathname.replace("/edit", "")
      : pathname;

  /** План продаж живёт вне /edit и /presentation; иначе ModeBar собирает неверные URL вида /presentation/marketing/... */
  const isSalesPlanSpa =
    pathname.startsWith("/marketing/sales-plan") || pathname.startsWith("/marketing/plan/edit");

  const constructionExplain =
    pathname === "/construction/explain"
      ? {
          section: searchParams.get("section") ?? "gpr",
          partId: searchParams.get("partId") === "2" ? "2" : "1",
        }
      : null;

  const presentationTarget = (() => {
    if (constructionExplain) {
      return `/presentation/construction?section=${constructionExplain.section}&partId=${constructionExplain.partId}`;
    }
    if (isSalesPlanSpa) {
      if (pathname.startsWith(SALES_PLAN_SPA.presentation)) return pathname;
      return SALES_PLAN_SPA.presentation;
    }
    return `/presentation${restPath}`;
  })();

  const editTarget = (() => {
    if (constructionExplain) {
      return `/edit/construction?section=${constructionExplain.section}&partId=${constructionExplain.partId}`;
    }
    if (isSalesPlanSpa) {
      if (pathname.startsWith(SALES_PLAN_SPA.work)) return pathname;
      return SALES_PLAN_SPA.work;
    }
    return `/edit${restPath}`;
  })();

  /** Эти страницы в корневом layout с тёмным UI — шапка режима должна совпадать с презентацией. */
  const isDarkPresentationChrome =
    pathname === SALES_PLAN_SPA.presentation ||
    pathname === SALES_PLAN_SPA.explain ||
    pathname === "/construction/explain" ||
    pathname?.startsWith("/presentation/marketing/");

  const barShell = isDarkPresentationChrome
    ? "sticky top-0 z-40 border-b border-white/[0.06] bg-[#0b1220] bg-gradient-to-b from-[#0b1220] to-[#0a0f1a] backdrop-blur-sm"
    : "sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur";

  const labelMuted = isDarkPresentationChrome ? "text-slate-300" : "text-slate-700";
  const labelStrong = isDarkPresentationChrome ? "text-slate-50" : "text-slate-900";

  const btnIdle = isDarkPresentationChrome
    ? "bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10"
    : "bg-slate-100 text-slate-700 hover:bg-slate-200";

  const btnActive = isDarkPresentationChrome
    ? "bg-sky-600 text-white shadow border border-sky-500/50"
    : "bg-slate-900 text-white shadow";

  return (
    <div className={barShell}>
      <div className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-wrap items-center justify-between gap-2 px-3 py-3 sm:gap-3">
        <div className={`text-sm ${labelMuted}`}>
          Режим: <span className={`font-semibold ${labelStrong}`}>{modeLabel(mode)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setMode("presentation");
              router.push(presentationTarget);
            }}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              mode === "presentation" ? btnActive : btnIdle
            }`}
          >
            Презентация
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("edit");
              router.push(editTarget);
            }}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              mode === "edit" ? btnActive : btnIdle
            }`}
          >
            Редактирование
          </button>
          <UserMenu theme={isDarkPresentationChrome ? "dark" : "light"} />
        </div>
      </div>
    </div>
  );
}

export function ModeBar() {
  return (
    <Suspense
      fallback={
        <div className="sticky top-0 z-40 h-[52px] border-b border-slate-200 bg-white/80 backdrop-blur" aria-hidden />
      }
    >
      <ModeBarInner />
    </Suspense>
  );
}

