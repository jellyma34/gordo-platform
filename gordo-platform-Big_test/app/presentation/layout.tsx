import type { ReactNode } from "react";

import { PresentationRouteShell } from "@/components/presentation/PresentationRouteShell";

import "./presentationLayout.css";

export default function PresentationLayout({ children }: { children: ReactNode }) {
  return <PresentationRouteShell>{children}</PresentationRouteShell>;
}
