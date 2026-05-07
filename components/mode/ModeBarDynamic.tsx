"use client";

import dynamic from "next/dynamic";

const ModeBar = dynamic(
  () => import("./ModeBar").then((m) => ({ default: m.ModeBar })),
  { ssr: false, loading: () => null },
);

/**
 * Панель режима подключается только на клиенте: `usePathname` / `useSearchParams` внутри не участвуют в SSR-дереве
 * (см. краши вида `Cannot read properties of undefined (reading '/_app')` при отсутствии контекста маршрутизации).
 */
export function ModeBarDynamic() {
  return <ModeBar />;
}
