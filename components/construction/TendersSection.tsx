"use client";

import { useRef } from "react";
import { EditLayout } from "@/components/EditLayout";
import { useAppMode } from "@/components/mode/ModeProvider";
import { TendersPresentation } from "@/components/tenders/TendersPresentation";
import { TendersTable, type TendersTableHandle } from "@/components/tenders/TendersTable";
import { PROJECT_PARTS } from "@/lib/gprUtils";

export function TendersSection({
  activePartId,
  onChangePart,
}: {
  activePartId: number;
  onChangePart: (partId: number) => void;
}) {
  const { mode } = useAppMode();
  const tableRef = useRef<TendersTableHandle>(null);

  if (mode === "presentation") {
    return <TendersPresentation activePartId={activePartId} onChangePart={onChangePart} />;
  }

  const partTabs = (
    <div className="mb-4 flex flex-wrap gap-2">
      {PROJECT_PARTS.map((part) => {
        const active = activePartId === part.id;
        return (
          <button
            key={part.id}
            type="button"
            onClick={() => onChangePart(part.id)}
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
      <TendersTable ref={tableRef} embedded activePartId={activePartId} />
    </EditLayout>
  );
}
