"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppMode } from "@/components/mode/ModeProvider";
import { ConstructionWorkspace } from "@/components/navigation/ConstructionWorkspace";

export default function EditConstructionPage() {
  const { setMode } = useAppMode();
  const router = useRouter();

  useEffect(() => {
    setMode("edit");
  }, [setMode]);

  return (
    <ConstructionWorkspace modeLabel="Редактирование" onBackToBlocks={() => router.push("/edit")} />
  );
}

