"use client";

import { useSearchParams } from "next/navigation";

import {
  resolvePresentationProjectName,
  type PresentationProjectSource,
} from "@/lib/presentationProjectName";

function sectionCrumb(section: string | null): string {
  if (section === "tenders") return "Тендеры";
  if (section === "tmc") return "ТМЦ";
  if (section === "gpr") return "ГПР";
  return "ГПР";
}

/**
 * Строка хлебных крошек для /presentation/construction (данные из query `section`).
 */
export function ConstructionPresentationBreadcrumb({ project }: { project?: PresentationProjectSource | null }) {
  const searchParams = useSearchParams();
  const section = searchParams.get("section");
  const projectName = resolvePresentationProjectName(project ?? null);

  return (
    <p className="m-0 max-w-full text-xs leading-snug text-slate-400">
      <span className="text-slate-300">{projectName}</span>
      <span className="text-slate-600"> → </span>
      <span className="text-slate-400">Строительство</span>
      <span className="text-slate-600"> → </span>
      <span className="text-slate-200">{sectionCrumb(section)}</span>
    </p>
  );
}
