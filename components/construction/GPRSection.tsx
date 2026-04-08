"use client";

import { useRef } from "react";

import { EditLayout } from "@/components/EditLayout";
import { calculateDeviation, getStatusByDeviation, PROJECT_PARTS, type GPRTask } from "@/lib/gprUtils";
import { GPRAnalytics } from "./GPRAnalytics";
import { GPRTable, type GPRTableHandle } from "./GPRTable";

/** Верхняя полоса из 5 сводных карточек (% выполнения, светофор). Выключено по умолчанию. */
const SHOW_SUMMARY_STATS = false;

type StatusSummary = {
  counts: { green: number; yellow: number; red: number; gray: number };
  completionPct: number;
};

function SummaryStats({ statusSummary }: { statusSummary: StatusSummary }) {
  return (
    <div className="mx-auto mb-6 mt-4 grid w-full min-w-0 max-w-[1400px] grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] md:grid-cols-5">
      <div className="rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-slate-300">% выполнения</div>
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: "#94a3b8" }}
            aria-hidden
          />
        </div>
        <div className="mt-2 text-3xl font-bold text-slate-50 tabular-nums">
          {statusSummary.completionPct}%
        </div>
      </div>
      <div className="rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-slate-300">В срок / раньше</div>
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: "#22c55e" }}
            aria-hidden
          />
        </div>
        <div className="mt-2 text-3xl font-bold text-slate-50 tabular-nums">
          {statusSummary.counts.green}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-slate-300">Риск (≤ 2 дн.)</div>
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: "#f59e0b" }}
            aria-hidden
          />
        </div>
        <div className="mt-2 text-3xl font-bold text-slate-50 tabular-nums">
          {statusSummary.counts.yellow}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-slate-300">Отставание (&gt; 2 дн.)</div>
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: "#ef4444" }}
            aria-hidden
          />
        </div>
        <div className="mt-2 text-3xl font-bold text-slate-50 tabular-nums">
          {statusSummary.counts.red}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-slate-300">Нет данных</div>
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: "#94a3b8" }}
            aria-hidden
          />
        </div>
        <div className="mt-2 text-3xl font-bold text-slate-50 tabular-nums">
          {statusSummary.counts.gray}
        </div>
      </div>
    </div>
  );
}

export function GPRSection({
  tasks,
  mode,
  onSaveTasks,
  activePartId,
  onChangePart,
}: {
  tasks: GPRTask[];
  mode: "edit" | "presentation";
  onSaveTasks: (tasks: GPRTask[]) => void | Promise<void>;
  activePartId: number;
  onChangePart: (partId: number) => void;
}) {
  const tableRef = useRef<GPRTableHandle>(null);

  const statusSummary: StatusSummary | null = SHOW_SUMMARY_STATS
    ? (() => {
        const counts = { green: 0, yellow: 0, red: 0, gray: 0 };
        let completionSum = 0;
        let completionN = 0;

        for (const task of tasks) {
          completionSum += task.completion;
          completionN += 1;

          const deviation = calculateDeviation(task);
          if (deviation === null) {
            counts.gray += 1;
            continue;
          }
          const s = getStatusByDeviation(deviation);
          if (s === "green") counts.green += 1;
          else if (s === "yellow") counts.yellow += 1;
          else counts.red += 1;
        }

        const completionPct = completionN > 0 ? Math.round(completionSum / completionN) : 0;
        return { counts, completionPct };
      })()
    : null;

  if (mode === "edit") {
    return (
      <section className="w-full min-w-0 overflow-x-clip">
        <EditLayout
          title="ГПР (график производства работ)"
          subtitle="Таблица задач: план, факт, контроль и иерархия работ"
          onSave={async () => {
            await tableRef.current?.save();
            await tableRef.current?.refreshHistoryIfOpen();
          }}
          onCancel={() => tableRef.current?.cancel()}
        >
          <GPRTable
            ref={tableRef}
            tasks={tasks}
            onSaveTasks={onSaveTasks}
            activePartId={activePartId}
            onChangePart={onChangePart}
            hideEditToolbar
            embedded
          />
        </EditLayout>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full min-w-0 max-w-[1400px] space-y-6 overflow-x-clip rounded-2xl bg-[#0f172a] p-3 sm:p-4 md:p-6">
      <div className="flex flex-wrap justify-center gap-2">
        {PROJECT_PARTS.map((part) => (
          <button
            key={part.id}
            type="button"
            onClick={() => onChangePart(part.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              activePartId === part.id
                ? "bg-slate-100 text-slate-900"
                : "bg-white/10 text-slate-200 hover:bg-white/20"
            }`}
          >
            {part.name}
          </button>
        ))}
      </div>
      {SHOW_SUMMARY_STATS && statusSummary ? (
        <SummaryStats statusSummary={statusSummary} />
      ) : null}

      <GPRAnalytics
        tasks={tasks}
        mode="view"
        activePartId={activePartId}
        planFactDataSource="kvartaly"
      />
    </section>
  );
}
