"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Тело презентации: для маркетинга задаёт высоту и overflow так, чтобы скролл был только у контента справа.
 */
export function PresentationBody({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const isMarketing = pathname.startsWith("/presentation/marketing");

  const base = "w-full min-w-0 bg-transparent px-3 py-4 sm:px-6 sm:py-6";
  const marketing = "flex min-h-0 flex-1 flex-col overflow-hidden";

  return <main className={isMarketing ? `${base} ${marketing}` : base}>{children}</main>;
}
