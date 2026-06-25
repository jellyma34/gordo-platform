"use client";

import { useRef } from "react";
import { EditLayout } from "@/components/EditLayout";
import { useAppMode } from "@/components/mode/ModeProvider";
import { ReportPdfButton } from "@/components/reports/ReportPdfButton";
import { SuppliersBlock } from "@/components/tmc/SuppliersBlock";
import { TmcPresentation } from "@/components/tmc/TmcPresentation";
import { TmcTable, type TmcTableHandle } from "@/components/tmc/TmcTable";
import { PROJECT_PARTS, type ConstructionObjectScope } from "@/lib/gprUtils";

function TMCSectionPartTabs({
  activePartScope,
  onChangePartScope,
}: {
  activePartScope: ConstructionObjectScope;
  onChangePartScope: (scope: ConstructionObjectScope) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {PROJECT_PARTS.map((part) => {
        const active = activePartScope === part.id;
        return (
          <button
            key={part.id}
            type="button"
            onClick={() => onChangePartScope(part.id as ConstructionObjectScope)}
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
}

export function TMCSection({
  activePartScope,
  onChangePartScope,
  hidePresentationPartStrip,
}: {
  activePartScope: ConstructionObjectScope;
  onChangePartScope: (scope: ConstructionObjectScope) => void;
  hidePresentationPartStrip?: boolean;
}) {
  const { mode } = useAppMode();
  const tmcRef = useRef<TmcTableHandle>(null);
  const editPartId: 1 | 2 = activePartScope === "project" ? 1 : activePartScope;

  if (mode !== "presentation") {
    return (
      <EditLayout
        title="Закупка ТМЦ"
        subtitle="Позиции по части проекта (жилой дом / автостоянка); график ГПР—ТМЦ использует те же данные."
        onSave={() => tmcRef.current?.save()}
        onCancel={() => tmcRef.current?.cancel()}
      >
        <TMCSectionPartTabs activePartScope={activePartScope} onChangePartScope={onChangePartScope} />
        <TmcTable ref={tmcRef} embedded activePartId={editPartId} />
        <SuppliersBlock activePartId={editPartId} />
        <TmcPresentation
          activePartScope={activePartScope}
          showGprDeficitImpactBlock
          blockFilter="gprDeficitImpactOnly"
        />
      </EditLayout>
    );
  }

  return (
    <>
      <TmcPresentation activePartScope={activePartScope} />
      <ReportPdfButton section="tmc" surface="dark" />
    </>
  );
}
