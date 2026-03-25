"use client";

import type { GPRTask } from "@/lib/gprUtils";
import { GPRAnalytics } from "./GPRAnalytics";
import { GPRTable } from "./GPRTable";

export function GPRSection({
  tasks,
  mode,
  setMode,
  onSaveTasks,
}: {
  tasks: GPRTask[];
  mode: "edit" | "view";
  setMode: (mode: "edit" | "view") => void;
  onSaveTasks: (tasks: GPRTask[]) => void;
}) {
  return (
    <section className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode("edit")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              mode === "edit"
                ? "bg-indigo-600 text-white shadow"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Редактирование
          </button>
          <button
            type="button"
            onClick={() => setMode("view")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              mode === "view"
                ? "bg-indigo-600 text-white shadow"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Презентация
          </button>
        </div>
      </div>

      <div
        className={`border border-slate-200 bg-white p-6 ${
          mode === "view" ? "rounded-xl shadow-sm" : "rounded-lg"
        }`}
      >
        <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">
          ГПР (график производства работ)
        </h1>
      </div>
      <GPRAnalytics tasks={tasks} mode={mode} />
      <div className="mt-8">
        <GPRTable tasks={tasks} mode={mode} onSaveTasks={onSaveTasks} />
      </div>
    </section>
  );
}
