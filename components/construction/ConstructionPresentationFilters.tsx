"use client";

import { segmentedControlTabClass } from "@/components/marketing/marketingSegmentedControlClasses";
import type { ConstructionObjectScope } from "@/lib/gprUtils";

const OBJECT_SEGMENTS: { id: ConstructionObjectScope; label: string }[] = [
  { id: 1, label: "Жилой дом" },
  { id: 2, label: "Автостоянка" },
  { id: "project", label: "Проект" },
];

type Props = {
  activePartScope: ConstructionObjectScope;
  onPartScopeChange: (scope: ConstructionObjectScope) => void;
};

export function ConstructionPresentationFilters({ activePartScope, onPartScopeChange }: Props) {
  return (
    <div className="inline-flex flex-wrap items-center gap-3">
      <div
        className="inline-flex max-w-full flex-nowrap overflow-x-auto rounded-lg border border-slate-600/70 bg-slate-900/50 p-0.5"
        role="group"
        aria-label="Часть проекта"
      >
        {OBJECT_SEGMENTS.map((o) => (
          <button
            key={o.id === "project" ? "project" : String(o.id)}
            type="button"
            onClick={() => onPartScopeChange(o.id)}
            className={segmentedControlTabClass(activePartScope === o.id, "dark")}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
