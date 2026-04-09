"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAppMode } from "@/components/mode/ModeProvider";
import { MarketingWorkspace } from "@/components/marketing/MarketingWorkspace";

export default function PresentationMarketingPage() {
  const { setMode } = useAppMode();
  const router = useRouter();

  useEffect(() => {
    setMode("presentation");
  }, [setMode]);

  return (
    <MarketingWorkspace
      presentation
      modeLabel="Презентация"
      onBackToBlocks={() => router.push("/presentation")}
    />
  );
}
