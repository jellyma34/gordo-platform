"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppMode } from "@/components/mode/ModeProvider";
import { ConstructionEditErrorBoundary } from "@/components/construction/ConstructionEditErrorBoundary";
import { ConstructionWorkspace } from "@/components/navigation/ConstructionWorkspace";

export default function EditConstructionPage() {
  const { setMode } = useAppMode();
  const router = useRouter();

  useEffect(() => {
    setMode("edit");
  }, [setMode]);

  return (
    <ConstructionEditErrorBoundary>
      <ConstructionWorkspace modeLabel="Редактирование" onBackToBlocks={() => router.push("/edit")} />
    </ConstructionEditErrorBoundary>
  );
}

