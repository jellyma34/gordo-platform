"use client";

import type { ReactNode } from "react";

import { ConstructionAppSidebar } from "@/components/construction/ConstructionAppSidebar";

export function ConstructionAppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 items-stretch overflow-hidden">
      <ConstructionAppSidebar />
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">
        {children}
      </main>
    </div>
  );
}
