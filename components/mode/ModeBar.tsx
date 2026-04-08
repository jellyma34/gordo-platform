"use client";

import { usePathname, useRouter } from "next/navigation";
import { UserMenu } from "@/components/auth/UserMenu";
import { useAppMode, type AppMode } from "./ModeProvider";

function modeLabel(mode: AppMode) {
  return mode === "presentation" ? "Презентация" : "Редактирование";
}

export function ModeBar() {
  const { mode, setMode } = useAppMode();
  const router = useRouter();
  const pathname = usePathname();

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

  return (
    <div className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-wrap items-center justify-between gap-2 px-3 py-3 sm:gap-3">
        <div className="text-sm text-slate-700">
          Режим: <span className="font-semibold text-slate-900">{modeLabel(mode)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setMode("presentation");
              router.push(`/presentation${restPath}`);
            }}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              mode === "presentation"
                ? "bg-slate-900 text-white shadow"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Презентация
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("edit");
              router.push(`/edit${restPath}`);
            }}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              mode === "edit"
                ? "bg-slate-900 text-white shadow"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Редактирование
          </button>
          <UserMenu />
        </div>
      </div>
    </div>
  );
}

