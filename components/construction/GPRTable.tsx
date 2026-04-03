"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  calculateDeviation,
  durationDays,
  getStatus,
  getStatusByDeviation,
  getStatusLabel,
  partIdToProjectPartKey,
  type GPRTask,
} from "@/lib/gprUtils";
import { getRelatedDeviations, type RelatedDeviation } from "@/lib/gprRelatedDeviations";
import type { GprWorkCatalogItem } from "@/lib/gprWorkCatalog";
import { getTmcData } from "@/lib/tmcData";
import { GPRWorkTypeCombobox } from "@/components/construction/GPRWorkTypeCombobox";

type FlatTask = GPRTask & { level: number; parentId?: string };

function flattenTasks(tasks: GPRTask[]): FlatTask[] {
  const stack: FlatTask[] = [];
  return tasks.map((task) => {
    const level = Math.max(1, task.level ?? task.code.split(".").length - 1);
    while (stack.length >= level) stack.pop();
    const parent = stack[level - 2];
    const row: FlatTask = { ...task, level, parentId: parent?.id };
    stack.push(row);
    return row;
  });
}

function formatShortDate(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`);
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" }).format(date);
}

function collectExpandableIds(tasks: GPRTask[]): string[] {
  return tasks
    .filter((task) => tasks.some((candidate) => candidate.code.startsWith(`${task.code}.`)))
    .map((task) => task.id);
}

function formatRange(start?: string | null, end?: string | null) {
  if (!start && !end) return "—";
  if (start && end) return `${start} - ${end}`;
  return start ?? end ?? "—";
}

const COLORS = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
  gray: "#6b7280",
  plan: "#94a3b8",
} as const;

function deviationHex(deviation: number | null | undefined): string {
  if (deviation === null || deviation === undefined) return COLORS.gray;
  const s = getStatusByDeviation(deviation);
  return s === "green" ? COLORS.green : s === "yellow" ? COLORS.yellow : COLORS.red;
}

function statusPillStyle(status: ReturnType<typeof getStatus>): CSSProperties {
  const c =
    status === "blocked"
      ? "#dc2626"
      : status === "green"
      ? COLORS.green
      : status === "yellow"
        ? COLORS.yellow
        : status === "red"
          ? COLORS.red
          : COLORS.gray;
  return { backgroundColor: `${c}22`, color: c };
}

const INPUT_ROW =
  "h-8 w-full min-w-[130px] shrink-0 rounded-lg border border-slate-300 bg-white px-[10px] py-[6px] text-xs text-slate-900";

const XL_TASK_GRID_TEMPLATE =
  "grid-cols-1 gap-4 xl:grid-cols-[minmax(0,26rem)_minmax(0,11rem)_minmax(0,11rem)_minmax(0,14rem)_auto] xl:gap-x-5 xl:items-start";

type ReasonRouteType = "material" | "tender" | "work";

const SECTION_BY_REASON_TYPE: Record<ReasonRouteType, "tmc" | "tenders" | "gpr"> = {
  material: "tmc",
  tender: "tenders",
  work: "gpr",
};

function buildConstructionSectionHref(
  basePath: string,
  reasonType: ReasonRouteType,
  params?: Record<string, string | null | undefined>,
): string {
  const qp = new URLSearchParams();
  qp.set("section", SECTION_BY_REASON_TYPE[reasonType]);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (!v) continue;
    qp.set(k, v);
  }
  return `${basePath}?${qp.toString()}`;
}

function normalizeConstructionLink(basePath: string, rawLink: string): string {
  if (rawLink.startsWith("/edit/construction") || rawLink.startsWith("/presentation/construction")) {
    const idx = rawLink.indexOf("?");
    return idx >= 0 ? `${basePath}${rawLink.slice(idx)}` : basePath;
  }
  return rawLink;
}

function DeviationInfo({
  deviations,
  blockedReasons,
  taskId,
  constructionBasePath,
}: {
  deviations: RelatedDeviation[];
  blockedReasons: string[];
  taskId: string;
  constructionBasePath: string;
}) {
  if (deviations.length === 0 && blockedReasons.length === 0) return null;

  return (
    <>
      {deviations.length > 0 ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-2 text-[11px] text-amber-900">
          <div className="mb-1 font-semibold">⚠ Есть отклонения в других разделах</div>
          <div className="space-y-1">
            {deviations.map((r, idx) => (
              <div key={`${taskId}-rel-${idx}`}>
                {"→ "}
                <Link
                  href={normalizeConstructionLink(constructionBasePath, r.link)}
                  className="underline hover:no-underline"
                >
                  {r.section}
                </Link>
                {`: +${r.deviation_days} дней (${r.comment})`}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {blockedReasons.length > 0 ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-2 py-2 text-[11px] text-red-800">
          <div className="mb-1 font-semibold">Причина: не закуплен материал</div>
          <div className="space-y-1">
            {blockedReasons.map((name, idx) => (
              <div key={`${taskId}-blocked-${idx}`}>
                -{" "}
                <Link
                  href={buildConstructionSectionHref(constructionBasePath, "material", {
                    item: name,
                  })}
                  className="cursor-pointer underline decoration-red-500 underline-offset-2 transition-colors hover:text-red-600"
                  title="Перейти в раздел ТМЦ"
                >
                  {name}
                </Link>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

function updateTaskField(
  tasks: GPRTask[],
  id: string,
  field: keyof Pick<
    GPRTask,
    "planStart" | "planEnd" | "factStart" | "factEnd" | "completion" | "comment"
  >,
  value: string | number | null,
): GPRTask[] {
  return tasks.map((task) => (task.id === id ? { ...task, [field]: value } : task));
}

function updateTaskName(tasks: GPRTask[], id: string, name: string): GPRTask[] {
  return tasks.map((task) => (task.id === id ? { ...task, name } : task));
}

function updateTaskNameAndCode(tasks: GPRTask[], id: string, name: string, code: string): GPRTask[] {
  return tasks.map((task) => (task.id === id ? { ...task, name, code } : task));
}

function createId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parentCode(code: string) {
  const parts = code.split(".");
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join(".");
}

function nextChildIndex(tasks: GPRTask[], parent: string | null) {
  const directChildNumbers = tasks
    .map((t) => t.code)
    .filter((code) => {
      if (parent === null) return !code.includes(".");
      if (!code.startsWith(`${parent}.`)) return false;
      const rest = code.slice(parent.length + 1);
      return /^\d+$/.test(rest);
    })
    .map((code) => Number(code.split(".").pop() ?? "0"))
    .filter((n) => Number.isFinite(n) && n > 0);

  return (directChildNumbers.length > 0 ? Math.max(...directChildNumbers) : 0) + 1;
}

function branchEndIndex(tasks: GPRTask[], fromCode: string, fromIndex: number) {
  let idx = fromIndex + 1;
  while (idx < tasks.length && tasks[idx]?.code.startsWith(`${fromCode}.`)) idx += 1;
  return idx;
}

function insertChild(tasks: GPRTask[], parentId: string, child: GPRTask): GPRTask[] {
  const parentIndex = tasks.findIndex((t) => t.id === parentId);
  if (parentIndex < 0) return tasks;
  const insertIndex = branchEndIndex(tasks, tasks[parentIndex]!.code, parentIndex);
  return [...tasks.slice(0, insertIndex), child, ...tasks.slice(insertIndex)];
}

function insertSibling(tasks: GPRTask[], siblingId: string, newSibling: GPRTask): GPRTask[] {
  const siblingIndex = tasks.findIndex((t) => t.id === siblingId);
  if (siblingIndex < 0) return tasks;
  const insertIndex = branchEndIndex(tasks, tasks[siblingIndex]!.code, siblingIndex);
  return [...tasks.slice(0, insertIndex), newSibling, ...tasks.slice(insertIndex)];
}

function removeByCodePrefix(tasks: GPRTask[], targetCode: string): GPRTask[] {
  const isTarget = (code: string) =>
    code === targetCode || code.startsWith(`${targetCode}.`);

  return tasks.filter((task) => !isTarget(task.code));
}

function cloneTasks(tasks: GPRTask[]): GPRTask[] {
  return tasks.map((task) => ({ ...task }));
}

export type GPRTableHandle = {
  save: () => void;
  cancel: () => void;
};

type GPRTableProps = {
  tasks: GPRTask[];
  mode: "edit" | "presentation";
  onSaveTasks: (tasks: GPRTask[]) => void;
  /** Часть проекта: ТМЦ и блокировки считаются только по ней. */
  activePartId: number;
  /** Скрыть дублирующие кнопки (если шапка в EditLayout) */
  hideEditToolbar?: boolean;
  /** Вложить в EditLayout: без внешней «карточки» */
  embedded?: boolean;
};

export const GPRTable = forwardRef<GPRTableHandle, GPRTableProps>(function GPRTable(
  { tasks, mode, onSaveTasks, activePartId, hideEditToolbar = false, embedded = false },
  ref,
) {
  const pathname = usePathname();
  const constructionBasePath = pathname.startsWith("/presentation")
    ? "/presentation/construction"
    : pathname.startsWith("/edit")
      ? "/edit/construction"
      : "/construction";
  const todayIso = new Date().toISOString().slice(0, 10);
  const [draftTasks, setDraftTasks] = useState<GPRTask[]>(() => cloneTasks(tasks));
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const focusRefs = useRef(new Map<string, HTMLInputElement>());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(collectExpandableIds(tasks)),
  );
  const [workTypeOpenId, setWorkTypeOpenId] = useState<string | null>(null);
  const [extraWorkCatalog, setExtraWorkCatalog] = useState<GprWorkCatalogItem[]>([]);

  useEffect(() => {
    setDraftTasks(cloneTasks(tasks));
  }, [tasks]);

  const sourceTasks = mode === "edit" ? draftTasks : tasks;
  const blockedReasonsByTaskId = useMemo(() => {
    const todayMs = new Date(`${todayIso}T00:00:00`).getTime();
    const tmcById = new Map(
      getTmcData(partIdToProjectPartKey(activePartId)).map((x) => [x.id, x]),
    );
    const out = new Map<string, string[]>();
    for (const task of sourceTasks) {
      const reasons: string[] = [];
      for (const tmcId of task.relatedTmcIds ?? []) {
        const item = tmcById.get(tmcId);
        if (!item) continue;
        const planMs = new Date(`${item.planDate}T00:00:00`).getTime();
        const factMs = item.factDate ? new Date(`${item.factDate}T00:00:00`).getTime() : null;
        const notPurchasedOverdue = !item.factDate && Number.isFinite(planMs) && planMs < todayMs;
        const overdue = factMs !== null && Number.isFinite(planMs) && factMs > planMs;
        if (notPurchasedOverdue || overdue) reasons.push(item.name);
      }
      out.set(task.id, reasons);
    }
    return out;
  }, [sourceTasks, todayIso, activePartId]);
  const allRows = useMemo(() => flattenTasks(sourceTasks), [sourceTasks]);
  const rowById = useMemo(
    () => new Map(allRows.map((row) => [row.id, row])),
    [allRows],
  );
  const hasChildrenById = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const row of allRows) map.set(row.id, false);
    for (const row of allRows) {
      if (row.parentId) map.set(row.parentId, true);
    }
    return map;
  }, [allRows]);

  const visibleRows = useMemo(() => {
    return allRows.filter((row) => {
      if (!row.parentId) return true;
      let currentParent: string | undefined = row.parentId;
      while (currentParent) {
        if (!expandedIds.has(currentParent)) return false;
        const parent = rowById.get(currentParent);
        currentParent = parent?.parentId;
      }
      return true;
    });
  }, [allRows, expandedIds, rowById]);

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
    const normalizedValue =
      field === "completion"
        ? Number(value) || 0
        : (field === "factStart" || field === "factEnd") && value.trim() === ""
          ? null
          : value;
    setDraftTasks((prev) => updateTaskField(prev, id, field, normalizedValue));
  };

  const onNameInput = (id: string, value: string) => {
    setDraftTasks((prev) => updateTaskName(prev, id, value));
  };

  const onSelectWorkTypeFromCatalog = (id: string, code: string, nameValue: string) => {
    setDraftTasks((prev) => updateTaskNameAndCode(prev, id, nameValue, code));
  };

  const saveDraft = useCallback(() => {
    onSaveTasks(cloneTasks(draftTasks));
  }, [draftTasks, onSaveTasks]);

  const cancelDraft = useCallback(() => {
    setDraftTasks(cloneTasks(tasks));
  }, [tasks]);

  useImperativeHandle(
    ref,
    () =>
      mode === "edit"
        ? { save: saveDraft, cancel: cancelDraft }
        : { save: () => {}, cancel: () => {} },
    [mode, saveDraft, cancelDraft],
  );

  const addSubtask = (parent: FlatTask) => {
    const nextIndex = nextChildIndex(allRows, parent.code);
    const code = `${parent.code}.${nextIndex}`;
    const newTask: GPRTask = {
      id: createId(),
      globalTaskId: code,
      code,
      name: "",
      partId: parent.partId,
      relatedTmcIds: [],
      level: parent.level + 1,
      planStart: todayIso,
      planEnd: todayIso,
      factStart: null,
      factEnd: null,
      completion: 0,
      comment: "",
    };

    setDraftTasks((prev) => insertChild(prev, parent.id, newTask));
    setExpandedIds((prev) => new Set(prev).add(parent.id));
    setPendingFocusId(newTask.id);
  };

  const addLevel = (task: FlatTask) => {
    const parent = parentCode(task.code);
    const nextIndex = nextChildIndex(allRows, parent);
    const code = parent ? `${parent}.${nextIndex}` : `${nextIndex}`;
    const newTask: GPRTask = {
      id: createId(),
      globalTaskId: code,
      code,
      name: "",
      partId: task.partId,
      relatedTmcIds: [],
      level: task.level,
      planStart: todayIso,
      planEnd: todayIso,
      factStart: null,
      factEnd: null,
      completion: 0,
      comment: "",
    };

    setDraftTasks((prev) => insertSibling(prev, task.id, newTask));
    setPendingFocusId(newTask.id);
  };

  const removeTask = (task: FlatTask) => {
    const ok = window.confirm("Удалить задачу и все вложенные элементы?");
    if (!ok) return;

    setDraftTasks((prev) => removeByCodePrefix(prev, task.code));
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(task.id);
      return next;
    });
    setPendingFocusId((prev) => (prev === task.id ? null : prev));
  };

  useEffect(() => {
    if (!pendingFocusId) return;
    const el = focusRefs.current.get(pendingFocusId);
    if (el) {
      el.focus();
      el.select();
      setPendingFocusId(null);
    }
  }, [pendingFocusId, visibleRows.length]);

  if (mode === "presentation") {
    const rows = allRows.filter((t) => t.level === 1);

    const statusSummary = rows.reduce(
      (acc, task) => {
        const s = getStatus(task);
        if (s === "green") acc.green += 1;
        else if (s === "yellow") acc.yellow += 1;
        else if (s === "red") acc.red += 1;
        return acc;
      },
      { green: 0, yellow: 0, red: 0 },
    );

    return (
      <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-b from-[#111827] to-[#0b1223] p-6 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3">
            <span
              className="inline-flex rounded-full px-2 py-1 text-xs font-medium"
              style={{ backgroundColor: `${COLORS.green}22`, color: COLORS.green }}
            >
              В срок
            </span>
            <div className="mt-2 text-2xl font-bold tabular-nums text-slate-50">{statusSummary.green}</div>
          </div>
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3">
            <span
              className="inline-flex rounded-full px-2 py-1 text-xs font-medium"
              style={{ backgroundColor: `${COLORS.yellow}22`, color: COLORS.yellow }}
            >
              Риск
            </span>
            <div className="mt-2 text-2xl font-bold tabular-nums text-slate-50">{statusSummary.yellow}</div>
          </div>
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3">
            <span
              className="inline-flex rounded-full px-2 py-1 text-xs font-medium"
              style={{ backgroundColor: `${COLORS.red}22`, color: COLORS.red }}
            >
              Отставание
            </span>
            <div className="mt-2 text-2xl font-bold tabular-nums text-slate-50">{statusSummary.red}</div>
          </div>
        </div>

        <h3 className="mt-6 text-sm font-semibold text-slate-300">Ключевые этапы</h3>
        <ul className="mt-3 space-y-2">
          {rows.map((task) => {
            const status = getStatus(task);
            const deviation = calculateDeviation(task);
            const deviationText =
              deviation === null || deviation === undefined
                ? "—"
                : deviation > 0
                  ? `+${deviation} дн.`
                  : `${deviation} дн.`;
            const accent =
              status === "red"
                ? { borderLeft: `4px solid ${COLORS.red}`, boxShadow: "0 0 14px rgba(239,68,68,0.18)" as const }
                : undefined;

            return (
              <li
                key={task.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-700/50 bg-slate-900/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                style={accent}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-100">{task.name}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    <span className="font-mono tabular-nums text-slate-500">{task.code}</span>
                    <span className="mx-1.5 text-slate-600">·</span>
                    план {formatShortDate(task.planStart)} — {formatShortDate(task.planEnd)}
                    <span className="mx-1.5 text-slate-600">·</span>
                    факт {formatRange(task.factStart, task.factEnd)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:shrink-0 sm:justify-end">
                  <span className="text-sm tabular-nums text-slate-200">{task.completion}%</span>
                  <span
                    className="inline-flex rounded-full px-2 py-1 text-xs font-medium"
                    style={statusPillStyle(status)}
                  >
                    {getStatusLabel(status)}
                  </span>
                  <span
                    className="text-xs font-semibold tabular-nums"
                    style={{ color: deviationHex(deviation) }}
                  >
                    {deviationText}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const panelClass = embedded
    ? "space-y-4"
    : "rounded-2xl border border-slate-200 bg-[#f8fafc] p-4 shadow-sm";
  const stickyHeaderBg = embedded
    ? "bg-white/95 supports-[backdrop-filter]:bg-white/90"
    : "bg-[#f8fafc]/95 supports-[backdrop-filter]:bg-[#f8fafc]/90";

  return (
    <div className="space-y-4">
      <section className={panelClass}>
        {!hideEditToolbar ? (
          <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
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
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Сохранить
            </button>
          </div>
        ) : null}

        <div className="relative">
          <div
            className={`sticky top-0 z-20 -mx-1 mb-2 hidden rounded-xl border border-slate-200 px-3 py-2.5 shadow-sm backdrop-blur xl:grid ${stickyHeaderBg} ${XL_TASK_GRID_TEMPLATE}`}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Задача
            </div>
            <div className="text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              План
            </div>
            <div className="text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Факт
            </div>
            <div className="text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Контроль
            </div>
            <div className="text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Действия
            </div>
          </div>

          <div className="space-y-2">
            {visibleRows.map((task) => {
              const hasChildren = hasChildrenById.get(task.id) ?? false;
              const deviation = calculateDeviation(task);
              const deviationText =
                deviation === null || deviation === undefined
                  ? "—"
                  : deviation > 0
                    ? `+${deviation}`
                    : `${deviation}`;
              const blockedReasons = blockedReasonsByTaskId.get(task.id) ?? [];
              const status = blockedReasons.length > 0 ? "blocked" : getStatus(task);
              const planDuration = durationDays(task.planStart, task.planEnd);
              const factDuration =
                task.factStart && task.factEnd
                  ? durationDays(task.factStart, task.factEnd)
                  : null;
              const treePad = Math.max(0, task.level - 1) * 16;
              const relatedDeviations = getRelatedDeviations(task.globalTaskId);

              return (
                <div
                  key={task.id}
                  className={`group grid ${XL_TASK_GRID_TEMPLATE} rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${
                    status === "blocked" ? "border-red-300 bg-red-50/30" : "border-slate-200"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-start gap-2" style={{ paddingLeft: treePad }}>
                      {hasChildren ? (
                        <button
                          type="button"
                          onClick={() => toggle(task.id)}
                          className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm text-slate-600 transition hover:bg-slate-100"
                          aria-label={
                            expandedIds.has(task.id)
                              ? "Свернуть дочерние задачи"
                              : "Развернуть дочерние задачи"
                          }
                        >
                          {expandedIds.has(task.id) ? "▼" : "▶"}
                        </button>
                      ) : (
                        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0" aria-hidden />
                      )}
                      <div className="min-w-0 flex-1 space-y-2">
                        <div
                          className={`font-mono tabular-nums ${
                            hasChildren
                              ? "text-sm font-bold text-slate-900"
                              : "text-xs font-normal text-slate-600"
                          }`}
                        >
                          {task.code}
                        </div>
                        <GPRWorkTypeCombobox
                          taskId={task.id}
                          name={task.name}
                          taskCode={task.code}
                          open={workTypeOpenId === task.id}
                          onOpenChange={(next) => setWorkTypeOpenId(next ? task.id : null)}
                          onNameChange={(v) => onNameInput(task.id, v)}
                          onSelectCatalog={(code, nameValue) =>
                            onSelectWorkTypeFromCatalog(task.id, code, nameValue)
                          }
                          extraItems={extraWorkCatalog}
                          onAddCustomItem={(item) =>
                            setExtraWorkCatalog((prev) =>
                              prev.some((p) => p.code === item.code && p.name === item.name)
                                ? prev
                                : [...prev, item],
                            )
                          }
                          inputClassName={
                            hasChildren
                              ? "font-bold text-sm leading-snug lg:text-[15px]"
                              : "font-normal text-xs"
                          }
                          inputRef={(el) => {
                            if (!el) {
                              focusRefs.current.delete(task.id);
                              return;
                            }
                            focusRefs.current.set(task.id, el);
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-50/90 p-3 ring-1 ring-slate-100">
                    <div className="flex flex-col gap-2">
                      <input
                        value={task.planStart}
                        onChange={(e) => onInput(task.id, "planStart", e.target.value)}
                        className={INPUT_ROW}
                        title="Начало (план)"
                      />
                      <input
                        value={task.planEnd}
                        onChange={(e) => onInput(task.id, "planEnd", e.target.value)}
                        className={INPUT_ROW}
                        title="Окончание (план)"
                      />
                    </div>
                    <p className="mt-2 text-center text-[11px] tabular-nums text-slate-500">
                      {planDuration} дн.
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-50/90 p-3 ring-1 ring-slate-100">
                    <div className="flex flex-col gap-2">
                      <input
                        value={task.factStart ?? ""}
                        onChange={(e) => onInput(task.id, "factStart", e.target.value)}
                        className={INPUT_ROW}
                        title="Начало (факт)"
                      />
                      <input
                        value={task.factEnd ?? ""}
                        onChange={(e) => onInput(task.id, "factEnd", e.target.value)}
                        className={INPUT_ROW}
                        title="Окончание (факт)"
                      />
                    </div>
                    <p className="mt-2 text-center text-[11px] tabular-nums text-slate-500">
                      {factDuration != null ? `${factDuration} дн.` : "—"}
                    </p>
                  </div>

                  <div className="flex flex-col justify-center gap-3 rounded-xl bg-slate-50/90 p-3 ring-1 ring-slate-100 xl:min-h-[5.5rem]">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={task.completion}
                      onChange={(e) => onInput(task.id, "completion", e.target.value)}
                      className={INPUT_ROW}
                      title="% выполнения"
                    />
                    <div
                      className="text-center text-sm font-semibold tabular-nums"
                      style={{ color: deviationHex(deviation) }}
                    >
                      {deviationText}
                      {deviation !== null && deviation !== undefined ? (
                        <span className="text-xs font-medium text-slate-500"> дн.</span>
                      ) : null}
                    </div>
                    <div className="flex justify-center">
                      <span
                        className="inline-flex rounded-full px-2 py-1 text-xs font-medium"
                        style={statusPillStyle(status)}
                      >
                        {getStatusLabel(status)}
                      </span>
                    </div>
                    <DeviationInfo
                      deviations={relatedDeviations}
                      blockedReasons={blockedReasons}
                      taskId={task.id}
                      constructionBasePath={constructionBasePath}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-1 border-t border-slate-100 pt-3 xl:border-t-0 xl:pt-0 xl:pl-2">
                    <div className="flex flex-wrap justify-end gap-1 xl:opacity-0 xl:transition-opacity xl:group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => addSubtask(task)}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        + Под
                      </button>
                      <button
                        type="button"
                        onClick={() => addLevel(task)}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        + Ур
                      </button>
                      <button
                        type="button"
                        onClick={() => removeTask(task)}
                        className="rounded-lg border border-rose-300 bg-white px-2 py-1.5 text-xs text-rose-700 hover:bg-rose-50"
                        aria-label="Удалить задачу"
                        title="Удалить"
                      >
                        🗑
                      </button>
                    </div>
                  </div>

                  <div className="col-span-full border-t border-slate-100 pt-3">
                    <input
                      value={task.comment ?? ""}
                      onChange={(e) => onInput(task.id, "comment", e.target.value)}
                      placeholder="Комментарий"
                      className={`${INPUT_ROW} h-9`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
});
