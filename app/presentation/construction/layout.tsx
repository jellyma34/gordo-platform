import type { ReactNode } from "react";

import { ConstructionLayoutChromeProvider } from "@/components/construction/constructionLayoutChromeContext";

export default function Layout({ children }: { children: ReactNode }) {
  return <ConstructionLayoutChromeProvider>{children}</ConstructionLayoutChromeProvider>;
}
