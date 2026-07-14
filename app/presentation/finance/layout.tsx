import type { ReactNode } from "react";

import { ConstructionAppShell } from "@/components/construction/ConstructionAppShell";
import { ConstructionLayoutChromeProvider } from "@/components/construction/constructionLayoutChromeContext";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <ConstructionLayoutChromeProvider>
      <ConstructionAppShell>{children}</ConstructionAppShell>
    </ConstructionLayoutChromeProvider>
  );
}
