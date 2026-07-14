"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Тело презентации: для маркетинга задаёт высоту и overflow так, чтобы скролл был только у контента справа.
 */
export function PresentationBody({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const isMarketing = pathname.startsWith("/presentation/marketing");
  const isConstruction = pathname.startsWith("/presentation/construction");
  const isFinance = pathname.startsWith("/presentation/finance");

  const base =
    "flex w-full min-h-0 min-w-0 flex-1 flex-col border-0 bg-transparent shadow-none ring-0 [box-shadow:none] outline-none";

  if (isMarketing || isConstruction || isFinance) {
    return <main className={`${base} overflow-hidden px-3 py-0 sm:px-6`}>{children}</main>;
  }

  return (
    <main
      className={`${base} overflow-y-auto overflow-x-hidden overscroll-y-contain px-3 py-0 sm:px-6`}
    >
      {children}
    </main>
  );
}
