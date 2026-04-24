"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Тело презентации: для маркетинга задаёт высоту и overflow так, чтобы скролл был только у контента справа.
 */
export function PresentationBody({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const isMarketing = pathname.startsWith("/presentation/marketing");

  const base =
    "flex w-full min-h-0 min-w-0 flex-1 flex-col border-0 bg-transparent px-3 py-0 shadow-none ring-0 [box-shadow:none] outline-none sm:px-6";
  const marketing = "overflow-hidden";
  const mainScroll = isMarketing ? "" : "overflow-y-auto overflow-x-hidden overscroll-y-contain";

  return <main className={isMarketing ? `${base} ${marketing}` : `${base} ${mainScroll}`}>{children}</main>;
}
