"use client";

import { useRef } from "react";
import { EditLayout } from "@/components/EditLayout";
import { useAppMode } from "@/components/mode/ModeProvider";
import { ReportPdfButton } from "@/components/reports/ReportPdfButton";
import { TendersPresentation } from "@/components/tenders/TendersPresentation";
import { TendersTable, type TendersTableHandle } from "@/components/tenders/TendersTable";
import { type ConstructionObjectScope, PROJECT_PARTS } from "@/lib/gprUtils";

export function TendersSection({
  activePartScope,
  onChangePartScope,
  hidePresentationPartStrip,
}: {
  activePartScope: ConstructionObjectScope;
  onChangePartScope: (scope: ConstructionObjectScope) => void;
  hidePresentationPartStrip?: boolean;
}) {
  const { mode } = useAppMode();
  const tableRef = useRef<TendersTableHandle>(null);
  const editPartId: 1 | 2 = activePartScope === "project" ? 1 : activePartScope;

  if (mode === "presentation") {
    return (
      <>
        <TendersPresentation
          activePartScope={activePartScope}
          onChangePartScope={onChangePartScope}
          hidePartTabs={hidePresentationPartStrip}
        />
        <ReportPdfButton section="tenders" surface="dark" />
      </>
    );
  }

  const partTabs = (
    <div className="mb-4 flex flex-wrap gap-2">
      {PROJECT_PARTS.map((part) => {
        const active = activePartScope === part.id;
        return (
          <button
            key={part.id}
            type="button"
            onClick={() => onChangePartScope(part.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {part.name}
          </button>
        );
      })}
    </div>
  );

  return (
    <EditLayout
      title="Закупка услуг (тендеры)"
      subtitle="Реестр тендеров по этапам ГПР: план и факт договоров, стоимость, связь с частью проекта."
      onSave={() => tableRef.current?.save()}
      onCancel={() => tableRef.current?.cancel()}
    >
      {partTabs}
      <TendersTable ref={tableRef} embedded activePartId={editPartId} />
    </EditLayout>
  );
}
