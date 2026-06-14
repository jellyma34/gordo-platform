"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const authGateLoading = () => (
  <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
    Загрузка…
  </div>
);

const AuthGateClient = dynamic(
  () => import("./AuthGate").then((m) => ({ default: m.AuthGate })),
  { ssr: false, loading: authGateLoading },
);

/**
 * Обёртка: `usePathname` / `useRouter` внутри AuthGate не участвуют в SSR, что снимает
 * редкие 500 / `_app` при смене чанков в dev.
 */
export function AuthGateRoot({ children }: { children: ReactNode }) {
  return <AuthGateClient>{children}</AuthGateClient>;
}
