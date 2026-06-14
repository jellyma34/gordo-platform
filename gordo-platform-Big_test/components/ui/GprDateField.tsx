"use client";

import { RuDateInput } from "@/components/ui/RuDateInput";

const DEFAULT_FIELD_CLASS =
  "h-8 w-full min-w-[130px] shrink-0 rounded-lg border border-slate-300 bg-white px-[10px] py-[6px] text-xs text-slate-900";

export type GprDateFieldProps = {
  value: string | null | undefined;
  onIso: (iso: string) => void;
  title: string;
  fieldClassName?: string;
  clearButtonClassName?: string;
};

export function GprDateField({
  value,
  onIso,
  title,
  fieldClassName = DEFAULT_FIELD_CLASS,
  clearButtonClassName = "h-8 shrink-0 rounded border border-slate-300 bg-white px-2 text-xs text-slate-600 hover:bg-slate-50",
}: GprDateFieldProps) {
  return (
    <div className="flex items-center gap-1">
      <RuDateInput
        value={value ?? ""}
        onChange={onIso}
        allowEmpty
        className={`${fieldClassName} min-w-0 flex-1`}
        title={title}
      />
      <button
        type="button"
        className={clearButtonClassName}
        title="Очистить дату"
        onClick={() => onIso("")}
      >
        ✕
      </button>
    </div>
  );
}
