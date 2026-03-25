"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calculateDeviation,
  durationDays,
  getStatus,
  getStatusLabel,
  toDate,
  type GPRTask,
} from "@/lib/gprUtils";

type FlatTask = GPRTask & { level: number; parentId?: string };

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function flattenTasks(tasks: GPRTask[], level = 0, parentId?: string): FlatTask[] {
  return tasks.flatMap((task) => [
    { ...task, level, parentId },
    ...(task.children ? flattenTasks(task.children, level + 1, task.id) : []),
  ]);
}

function collectExpandableIds(tasks: GPRTask[]): string[] {
  return tasks.flatMap((task) => [
    ...(task.children && task.children.length > 0 ? [task.id] : []),
    ...(task.children ? collectExpandableIds(task.children) : []),
  ]);
}

function formatRange(start?: string, end?: string) {
  if (!start && !end) return "—";
  if (start && end) return `${start} - ${end}`;
  return start ?? end ?? "—";
}

function updateTaskField(
  tasks: GPRTask[],
  id: string,
  field: keyof Pick<
    GPRTask,
    "planStart" | "planEnd" | "factStart" | "factEnd" | "completion" | "comment"
  >,
  value: string | number,
): GPRTask[] {
  return tasks.map((task) => {
    if (task.id === id) {
      return { ...task, [field]: value };
    }
    if (!task.children) return task;
    return { ...task, children: updateTaskField(task.children, id, field, value) };
  });
}

function cloneTasks(tasks: GPRTask[]): GPRTask[] {
  return tasks.map((task) => ({
    ...task,
    children: task.children ? cloneTasks(task.children) : undefined,
  }));
}

export function GPRTable({
  tasks,
  mode,
  onSaveTasks,
}: {
  tasks: GPRTask[];
  mode: "edit" | "view";
  onSaveTasks: (tasks: GPRTask[]) => void;
}) {
  const [draftTasks, setDraftTasks] = useState<GPRTask[]>(() => cloneTasks(tasks));
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(collectExpandableIds(tasks)),
  );

  useEffect(() => {
    setDraftTasks(cloneTasks(tasks));
  }, [tasks]);

  const sourceTasks = mode === "edit" ? draftTasks : tasks;
  const allRows = useMemo(() => flattenTasks(sourceTasks), [sourceTasks]);
  const rowById = useMemo(
    () => new Map(allRows.map((row) => [row.id, row])),
    [allRows],
  );

  const visibleRows = useMemo(() => {
    return allRows.filter((row) => {
      if (!row.parentId) return true;
      let currentParent = row.parentId;
      while (currentParent) {
        if (!expandedIds.has(currentParent)) return false;
        const parent = rowById.get(currentParent);
        currentParent = parent?.parentId;
      }
      return true;
    });
  }, [allRows, expandedIds, rowById]);

  const timeline = useMemo(() => {
    const starts = allRows.map((task) => toDate(task.planStart).getTime());
    const ends = allRows.map((task) =>
      toDate(task.factEnd ?? task.planEnd).getTime(),
    );
    const min = Math.min(...starts);
    const max = Math.max(...ends);
    const span = Math.max(1, Math.round((max - min) / MS_PER_DAY));
    return { min, span };
  }, [allRows]);

  const toggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onInput = (
    id: string,
    field: keyof Pick<
      GPRTask,
      "planStart" | "planEnd" | "factStart" | "factEnd" | "completion" | "comment"
    >,
    value: string,
  ) => {
    const normalizedValue = field === "completion" ? Number(value) || 0 : value;
    setDraftTasks((prev) => updateTaskField(prev, id, field, normalizedValue));
  };

  const saveDraft = () => {
    onSaveTasks(cloneTasks(draftTasks));
  };

  const cancelDraft = () => {
    setDraftTasks(cloneTasks(tasks));
  };

  return (
    <div className="space-y-6">
      {mode === "edit" ? (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={cancelDraft}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Отменить
          </button>
          <button
            type="button"
            onClick={saveDraft}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Сохранить
          </button>
        </div>
      ) : null}

      <div
        className={`overflow-x-auto border border-slate-200 bg-white ${
          mode === "view" ? "rounded-xl shadow-sm" : "rounded-lg"
        }`}
      >
        <table
          className={`w-full border-collapse ${
            mode === "edit" ? "min-w-[1200px]" : "min-w-[860px]"
          }`}
        >
          <thead className="bg-slate-50">
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Код</th>
              <th className="px-4 py-3">Наименование</th>
              {mode === "edit" ? (
                <>
                  <th className="px-4 py-3">План</th>
                  <th className="px-4 py-3">Факт</th>
                  <th className="px-4 py-3">% выполнения</th>
                </>
              ) : (
                <th className="px-4 py-3">% выполнения</th>
              )}
              <th className="px-4 py-3">Отклонение (дней)</th>
              <th className="px-4 py-3">Статус</th>
              {mode === "edit" ? <th className="px-4 py-3">Комментарий</th> : null}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((task) => {
              const hasChildren = Boolean(task.children?.length);
              const deviation = calculateDeviation(task);
              const status = getStatus(task);
              const duration = durationDays(task.planStart, task.planEnd);
              const indent = task.level * 16;

              return (
                <tr key={task.id} className="border-t border-slate-100 text-sm">
                  <td className="px-4 py-3 font-medium text-slate-700">{task.code}</td>
                  <td className="px-4 py-3 text-slate-800">
                    <div
                      className="flex items-center gap-2"
                      style={{ paddingLeft: `${indent}px` }}
                    >
                      {hasChildren ? (
                        <button
                          type="button"
                          onClick={() => toggle(task.id)}
                          className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100"
                          aria-label={
                            expandedIds.has(task.id)
                              ? "Свернуть дочерние задачи"
                              : "Развернуть дочерние задачи"
                          }
                        >
                          {expandedIds.has(task.id) ? "−" : "+"}
                        </button>
                      ) : (
                        <span className="inline-flex h-6 w-6" />
                      )}
                      <span>{task.name}</span>
                    </div>
                  </td>
                  {mode === "edit" ? (
                    <>
                      <td className="px-4 py-3 text-slate-600">
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            value={task.planStart}
                            onChange={(event) =>
                              onInput(task.id, "planStart", event.target.value)
                            }
                            className="rounded border border-slate-300 px-2 py-1 text-xs"
                          />
                          <input
                            value={task.planEnd}
                            onChange={(event) =>
                              onInput(task.id, "planEnd", event.target.value)
                            }
                            className="rounded border border-slate-300 px-2 py-1 text-xs"
                          />
                        </div>
                        <div className="mt-1 text-xs text-slate-500">{duration} дн.</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            value={task.factStart ?? ""}
                            onChange={(event) =>
                              onInput(task.id, "factStart", event.target.value)
                            }
                            placeholder="дата начала"
                            className="rounded border border-slate-300 px-2 py-1 text-xs"
                          />
                          <input
                            value={task.factEnd ?? ""}
                            onChange={(event) =>
                              onInput(task.id, "factEnd", event.target.value)
                            }
                            placeholder="дата окончания"
                            className="rounded border border-slate-300 px-2 py-1 text-xs"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={task.completion}
                          onChange={(event) =>
                            onInput(task.id, "completion", event.target.value)
                          }
                          className="w-20 rounded border border-slate-300 px-2 py-1 text-xs"
                        />
                      </td>
                    </>
                  ) : (
                    <td className="px-4 py-3 text-slate-700">{task.completion}%</td>
                  )}
                  <td
                    className={`px-4 py-3 font-medium ${
                      deviation > 0 ? "text-rose-600" : "text-emerald-600"
                    }`}
                  >
                    {deviation > 0 ? `+${deviation}` : deviation}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
                        status === "green"
                          ? "bg-emerald-100 text-emerald-700"
                          : status === "yellow"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      <span className="h-2 w-2 rounded-full bg-current" />
                      {getStatusLabel(status)}
                    </span>
                  </td>
                  {mode === "edit" ? (
                    <td className="px-4 py-3 text-slate-600">
                      <input
                        value={task.comment ?? ""}
                        onChange={(event) => onInput(task.id, "comment", event.target.value)}
                        className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        className={`border border-slate-200 bg-white p-6 ${
          mode === "view" ? "rounded-xl shadow-sm" : "rounded-lg"
        }`}
      >
        <h3 className="text-lg font-semibold text-slate-900">
          Диаграмма Ганта (упрощенная)
        </h3>
        <div className="mt-4 space-y-3">
          {allRows.map((task) => {
            const planStartOffset = Math.round(
              (toDate(task.planStart).getTime() - timeline.min) / MS_PER_DAY,
            );
            const planWidth = durationDays(task.planStart, task.planEnd);
            const factStartOffset = task.factStart
              ? Math.round((toDate(task.factStart).getTime() - timeline.min) / MS_PER_DAY)
              : planStartOffset;
            const factWidth =
              task.factStart && task.factEnd
                ? durationDays(task.factStart, task.factEnd)
                : 0;

            return (
              <div key={`gantt-${task.id}`}>
                <div className="mb-1 text-xs text-slate-600">
                  {task.code} - {task.name}
                  {mode === "view" ? ` (${formatRange(task.planStart, task.planEnd)})` : ""}
                </div>
                <div className="relative h-7 rounded bg-slate-100">
                  <div
                    className="absolute top-1.5 h-2.5 rounded bg-slate-400/70"
                    style={{
                      left: `${(planStartOffset / timeline.span) * 100}%`,
                      width: `${(planWidth / timeline.span) * 100}%`,
                    }}
                    title="План"
                  />
                  {factWidth > 0 ? (
                    <div
                      className="absolute top-3.5 h-2.5 rounded bg-indigo-500/80"
                      style={{
                        left: `${(factStartOffset / timeline.span) * 100}%`,
                        width: `${(factWidth / timeline.span) * 100}%`,
                      }}
                      title="Факт"
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
