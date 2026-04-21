import type { ReactNode } from "react";

import { PresentationChrome } from "@/components/presentation/PresentationChrome";

export default function PresentationLayout({ children }: { children: ReactNode }) {
  return (
    <PresentationChrome>
      <main className="w-full min-w-0 bg-transparent px-3 py-4 sm:px-6 sm:py-6">{children}</main>
    </PresentationChrome>
  );
}
