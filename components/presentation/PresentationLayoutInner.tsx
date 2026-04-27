"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";

import { PresentationBody } from "@/components/presentation/PresentationBody";
import { PresentationChrome } from "@/components/presentation/PresentationChrome";

type Props = {
  children: ReactNode;
};

/**
 * Оболочка презентации; подключается из `PresentationRouteShell` с `dynamic(..., { ssr: false })`,
 * чтобы `usePathname` в Chrome/Body не выполнялся при SSR (см. ошибки контекста маршрутизации).
 */
export function PresentationLayoutInner({ children }: Props) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.debug("[PresentationLayoutInner] mounted (client)");
    }
  }, []);

  return (
    <PresentationChrome>
      <PresentationBody>{children}</PresentationBody>
    </PresentationChrome>
  );
}
