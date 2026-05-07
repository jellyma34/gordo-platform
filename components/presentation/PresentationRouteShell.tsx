"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";

const PresentationLayoutInner = dynamic(
  () =>
    import("@/components/presentation/PresentationLayoutInner").then((m) => ({
      default: m.PresentationLayoutInner,
    })),
  {
    ssr: false,
    loading: () => (
      <div
        className="presentation-shell flex h-[100dvh] min-h-0 max-h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-gradient-to-b from-[#0b1220] to-[#0f172a]"
        aria-busy
      >
        <div className="sticky top-0 z-40 h-14 shrink-0 border-b border-white/5 bg-[#0b1220] bg-gradient-to-b from-[#0b1220] to-[#0a0f1a]" />
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-slate-500">Загрузка…</div>
      </div>
    ),
  },
);

/**
 * Корневой слой для `app/presentation/layout.tsx`: весь chrome с хуками навигации только на клиенте.
 */
export function PresentationRouteShell({ children }: { children: ReactNode }) {
  return <PresentationLayoutInner>{children}</PresentationLayoutInner>;
}
