import type { ReactNode } from "react";

import { PresentationBody } from "@/components/presentation/PresentationBody";
import { PresentationChrome } from "@/components/presentation/PresentationChrome";

export default function PresentationLayout({ children }: { children: ReactNode }) {
  return (
    <PresentationChrome>
      <PresentationBody>{children}</PresentationBody>
    </PresentationChrome>
  );
}
