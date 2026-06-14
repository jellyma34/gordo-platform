"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppMode } from "@/components/mode/ModeProvider";
import { ConstructionWorkspace } from "@/components/navigation/ConstructionWorkspace";

export default function PresentationConstructionPage() {
  const { setMode } = useAppMode();
  const router = useRouter();

  useEffect(() => {
    setMode("presentation");
  }, [setMode]);

  return (
    <ConstructionWorkspace
      modeLabel="Презентация"
      onBackToBlocks={() => router.push("/presentation")}
    />
  );
}

