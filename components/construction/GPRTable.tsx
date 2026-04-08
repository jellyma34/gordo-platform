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
  gprTaskFromApiItem,
  getStatus,
  getStatusByDeviation,
  getStatusLabel,
  PROJECT_PARTS,
  partIdToProjectPartKey,
  type GPRTask,
} from "@/lib/gprUtils";
import { filterTaskTree, useTaskFilter, type TaskStatusFilter } from "@/lib/filters/useTaskFilter";
import { getRelatedDeviations, type RelatedDeviation } from "@/lib/gprRelatedDeviations";
import type { GprWorkCatalogItem } from "@/lib/gprWorkCatalog";
import { getTmcData } from "@/lib/tmcData";
import { GPRWorkTypeCombobox } from "@/components/construction/GPRWorkTypeCombobox";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  deleteEntityHistoryVersion,
  getTask,
  getEntityHistoryItem,
  listEntityHistory,
  rollbackEntityVersion,
  type EntityVersionDetail,
  type EntityVersionListItem,
} from "@/lib/auth";
import { historyDetailToVersionDetail, historyRowsToVersionListItems } from "@/lib/gprHistoryMap";

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

function collectExpandableIds(tasks: GPRTask[]): string[] {
  return tasks
    .filter((task) => tasks.some((candidate) => candidate.code.startsWith(`${task.code}.`)))
    .map((task) => task.id);
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
  "grid-cols-1 gap-4 xl:grid-cols-[300px_200px_200px_200px_auto] xl:gap-x-16 xl:items-start";

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
  save: () => Promise<void>;
  cancel: () => void;
  /** После успешного сохранения на backend — обновить список истории, если открыто окно. */
  refreshHistoryIfOpen: () => Promise<void>;
};

type GPRTableProps = {
  tasks: GPRTask[];
  onSaveTasks: (tasks: GPRTask[]) => void | Promise<void>;
  /** Часть проекта: ТМЦ и блокировки считаются только по ней. */
  activePartId: number;
  onChangePart?: (partId: number) => void;
  /** Скрыть дублирующие кнопки (если шапка в EditLayout) */
  hideEditToolbar?: boolean;
  /** Вложить в EditLayout: без внешней «карточки» */
  embedded?: boolean;
};

export const GPRTable = forwardRef<GPRTableHandle, GPRTableProps>(function GPRTable(
  { tasks, onSaveTasks, activePartId, onChangePart, hideEditToolbar = false, embedded = false },
  ref,
) {
  const { token, isAdmin } = useAuth();
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
  const [historyTask, setHistoryTask] = useState<FlatTask | null>(null);
  const [historyVersions, setHistoryVersions] = useState<EntityVersionListItem[]>([]);
  const [historySelected, setHistorySelected] = useState<EntityVersionDetail | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [rollbackBusy, setRollbackBusy] = useState(false);
  const [deleteHistoryBusyId, setDeleteHistoryBusyId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>("all");
  const historySelectedIdRef = useRef<number | null>(null);

  useEffect(() => {
    historySelectedIdRef.current = historySelected?.id ?? null;
  }, [historySelected]);

  useEffect(() => {
    setDraftTasks(cloneTasks(tasks));
  }, [tasks]);

  const sourceTasks = draftTasks;
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

  const rowStatus = useCallback(
    (task: FlatTask): "blocked" | "delay" | "ok" => {
      const blockedReasons = blockedReasonsByTaskId.get(task.id) ?? [];
      if (blockedReasons.length > 0) return "blocked";
      const d = calculateDeviation(task);
      if (d != null && d > 0) return "delay";
      return "ok";
    },
    [blockedReasonsByTaskId],
  );

  const directMatches = useTaskFilter(allRows, search, statusFilter, rowStatus);
  const directMatchIds = useMemo(() => new Set(directMatches.map((x) => x.id)), [directMatches]);
  const hasActiveFilters = search.trim().length > 0 || statusFilter !== "all";
  const filteredTreeRows = useMemo(
    () => filterTaskTree(allRows, (item) => directMatchIds.has(item.id)),
    [allRows, directMatchIds],
  );
  const rowsForRender = hasActiveFilters ? filteredTreeRows : visibleRows;

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

  const saveDraft = useCallback(async () => {
    await onSaveTasks(cloneTasks(draftTasks));
  }, [draftTasks, onSaveTasks]);

  const cancelDraft = useCallback(() => {
    setDraftTasks(cloneTasks(tasks));
  }, [tasks]);

  const refreshHistoryIfOpen = useCallback(async () => {
    if (!token || !historyTask) return;
    const entityId = Number(historyTask.id);
    if (!Number.isFinite(entityId)) return;
    try {
      const rows = await listEntityHistory(token, entityId, "gpr");
      const versions = historyRowsToVersionListItems(rows);
      setHistoryVersions(versions);
      if (versions.length === 0) {
        setHistorySelected(null);
        return;
      }
      const sid = historySelectedIdRef.current;
      const pick =
        sid != null && versions.some((v) => v.id === sid)
          ? versions.find((v) => v.id === sid)!
          : versions[0]!;
      const d = await getEntityHistoryItem(token, entityId, pick.id, "gpr");
      setHistorySelected(historyDetailToVersionDetail(d, pick.version_number));
    } catch {
      /* окно истории не должно ломать сохранение */
    }
  }, [token, historyTask]);

  useImperativeHandle(
    ref,
    () => ({
      save: saveDraft,
      cancel: cancelDraft,
      refreshHistoryIfOpen,
    }),
    [saveDraft, cancelDraft, refreshHistoryIfOpen],
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

  const panelClass = embedded
    ? "space-y-4"
    : "rounded-2xl border border-slate-200 bg-[#f8fafc] p-4 shadow-sm";
  const stickyHeaderBg = embedded
    ? "bg-white/95 supports-[backdrop-filter]:bg-white/90"
    : "bg-[#f8fafc]/95 supports-[backdrop-filter]:bg-[#f8fafc]/90";

  const openHistory = async (task: FlatTask) => {
    if (!token) return;
    const entityId = Number(task.id);
    if (!Number.isFinite(entityId)) {
      setHistoryTask(task);
      setHistoryVersions([]);
      setHistorySelected(null);
      setHistoryError("История доступна для записей, сохранённых в backend.");
      return;
    }
    setHistoryTask(task);
    setHistoryLoading(true);
    setHistoryError(null);
    setHistorySelected(null);
    try {
      const rows = await listEntityHistory(token, entityId, "gpr");
      const versions = historyRowsToVersionListItems(rows);
      setHistoryVersions(versions);
      if (versions.length > 0) {
        const first = versions[0]!;
        const detail = await getEntityHistoryItem(token, entityId, first.id, "gpr");
        setHistorySelected(historyDetailToVersionDetail(detail, first.version_number));
      }
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Не удалось загрузить историю");
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadVersion = async (versionId: number) => {
    if (!token || !historyTask) return;
    const entityId = Number(historyTask.id);
    if (!Number.isFinite(entityId)) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const detail = await getEntityHistoryItem(token, entityId, versionId, "gpr");
      const meta = historyVersions.find((v) => v.id === versionId);
      setHistorySelected(
        historyDetailToVersionDetail(detail, meta?.version_number ?? versionId),
      );
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Не удалось загрузить версию");
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleDeleteHistoryVersion = async (versionId: number) => {
    if (!isAdmin || !token || !historyTask) return;
    const entityId = Number(historyTask.id);
    if (!Number.isFinite(entityId)) return;
    const ok = window.confirm("Удалить эту версию из истории?");
    if (!ok) return;
    setDeleteHistoryBusyId(versionId);
    setHistoryError(null);
    try {
      await deleteEntityHistoryVersion(token, entityId, versionId, "gpr");
      await refreshHistoryIfOpen();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не удалось удалить версию";
      console.error("deleteEntityHistoryVersion", e);
      window.alert(msg);
      setHistoryError(msg);
    } finally {
      setDeleteHistoryBusyId(null);
    }
  };

  const runRollback = async () => {
    if (!token || !historyTask || !historySelected) return;
    const entityId = Number(historyTask.id);
    if (!Number.isFinite(entityId)) return;
    const ok = window.confirm("Откатить текущую запись к выбранной версии?");
    if (!ok) return;
    setRollbackBusy(true);
    setHistoryError(null);
    try {
      await rollbackEntityVersion(token, entityId, historySelected.id, "gpr");
      const updatedTaskApi = await getTask(token, entityId);
      const updatedTask = gprTaskFromApiItem(updatedTaskApi);
      setDraftTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? { ...updatedTask } : t)));
      setHistoryTask((prev) => (prev && Number(prev.id) === entityId ? { ...prev, ...updatedTask } : prev));
      const rows = await listEntityHistory(token, entityId, "gpr");
      const versions = historyRowsToVersionListItems(rows);
      setHistoryVersions(versions);
      if (versions.length > 0) {
        const first = versions[0]!;
        const detail = await getEntityHistoryItem(token, entityId, first.id, "gpr");
        setHistorySelected(historyDetailToVersionDetail(detail, first.version_number));
      }
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Не удалось выполнить откат");
    } finally {
      setRollbackBusy(false);
    }
  };

  const compareFields: Array<{ key: keyof GPRTask | "related_tmc_ids"; label: string; current: unknown }> =
    historyTask
      ? [
          { key: "name", label: "Название", current: historyTask.name },
          { key: "code", label: "Шифр", current: historyTask.code },
          { key: "planStart", label: "План старт", current: historyTask.planStart },
          { key: "planEnd", label: "План финиш", current: historyTask.planEnd },
          { key: "factStart", label: "Факт старт", current: historyTask.factStart },
          { key: "factEnd", label: "Факт финиш", current: historyTask.factEnd },
          { key: "completion", label: "% выполнения", current: historyTask.completion },
          { key: "comment", label: "Комментарий", current: historyTask.comment },
          { key: "related_tmc_ids", label: "Связанные ТМЦ", current: historyTask.relatedTmcIds ?? [] },
        ]
      : [];

  return (
    <div className="w-full min-w-0 space-y-4 overflow-x-clip">
      <section className={panelClass}>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          {!hideEditToolbar ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={cancelDraft}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Отменить
              </button>
              <button
                type="button"
                onClick={() => void saveDraft()}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Сохранить
              </button>
            </div>
          ) : null}

          {onChangePart ? (
            <div className="flex flex-wrap gap-2">
              {PROJECT_PARTS.map((part) => (
                <button
                  key={part.id}
                  type="button"
                  onClick={() => onChangePart(part.id)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    activePartId === part.id
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {part.name}
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию или шифру"
              className="h-9 w-full min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 sm:min-w-[12rem]"
            />
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              {[
                { id: "all", label: "Все" },
                { id: "blocked", label: "Заблокировано" },
                { id: "delay", label: "Отставание" },
                { id: "ok", label: "В срок" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setStatusFilter(opt.id as "all" | "blocked" | "delay" | "ok")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    statusFilter === opt.id
                      ? "bg-slate-900 text-white"
                      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="relative">
          <div
            className={`sticky top-0 z-20 mb-2 hidden w-full rounded-xl border border-slate-200 px-3 py-2.5 shadow-sm backdrop-blur xl:grid ${stickyHeaderBg} ${XL_TASK_GRID_TEMPLATE}`}
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
            {rowsForRender.map((task) => {
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
              const factDurationRaw =
                task.factStart && task.factEnd
                  ? durationDays(task.factStart, task.factEnd)
                  : null;
              const factDuration =
                factDurationRaw != null && Number.isFinite(factDurationRaw) ? factDurationRaw : null;
              const treePad = Math.max(0, task.level - 1) * 16;
              const relatedDeviations = getRelatedDeviations(task.globalTaskId);

              return (
                <div
                  key={task.id}
                  className={`group grid w-full ${XL_TASK_GRID_TEMPLATE} rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md`}
                >
                  <div className="min-w-0" style={{ marginLeft: treePad }}>
                    <div className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-2">
                      {hasChildren ? (
                        <button
                          type="button"
                          onClick={() => toggle(task.id)}
                          className="mt-0.5 h-8 w-8 shrink-0 rounded-lg text-sm text-slate-600 transition hover:bg-slate-100"
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
                      {Number.isFinite(planDuration) ? `${planDuration} дн.` : "—"}
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
                      <button
                        type="button"
                        onClick={() => void openHistory(task)}
                        className="rounded-lg border border-sky-300 bg-white px-2 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-50"
                        title="История изменений"
                      >
                        История
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
      {historyTask ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">История изменений</h3>
                <p className="text-xs text-slate-500">
                  {historyTask.code} — {historyTask.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setHistoryTask(null);
                  setHistoryVersions([]);
                  setHistorySelected(null);
                  setHistoryError(null);
                }}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                ×
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-sm font-medium text-slate-800">Версии</div>
                {historyLoading && historyVersions.length === 0 ? (
                  <div className="text-sm text-slate-500">Загрузка…</div>
                ) : historyVersions.length === 0 ? (
                  <div className="text-sm text-slate-500">Нет сохранённых версий</div>
                ) : (
                  historyVersions.map((v) => {
                    const who =
                      v.changed_by_name ??
                      v.created_by ??
                      (typeof v.changed_by === "number" ? `id ${v.changed_by}` : "—");
                    const role = v.changed_by_role ?? "—";
                    const kind = v.change_type?.trim();
                    return (
                      <div key={v.id} className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => void loadVersion(v.id)}
                          className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-left text-xs ${
                            historySelected?.id === v.id
                              ? "border-sky-300 bg-sky-50 text-sky-800"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <div className="font-semibold">v{v.version_number}</div>
                          <div className="tabular-nums">{new Date(v.created_at).toLocaleString("ru-RU")}</div>
                          <div className="mt-0.5 text-slate-800">{who}</div>
                          <div className="text-slate-500">{role}</div>
                          {kind ? (
                            <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">{kind}</div>
                          ) : null}
                        </button>
                        {isAdmin ? (
                          <button
                            type="button"
                            title="Удалить версию из истории"
                            disabled={deleteHistoryBusyId !== null}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void handleDeleteHistoryVersion(v.id);
                            }}
                            className="shrink-0 self-start rounded-lg border border-red-200 bg-white px-2 py-1.5 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            {deleteHistoryBusyId === v.id ? "…" : "Удалить"}
                          </button>
                        ) : null}
                      </div>
                    );
                  })
                )}
                <button
                  type="button"
                  disabled={!historySelected || rollbackBusy}
                  onClick={() => void runRollback()}
                  className="mt-2 w-full rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {rollbackBusy ? "Откат…" : "Откатить к выбранной версии"}
                </button>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-2 text-sm font-medium text-slate-800">Сравнение (текущая vs выбранная)</div>
                {historySelected ? (
                  <p className="mb-2 text-xs text-slate-500">
                    Версия v{historySelected.version_number} ·{" "}
                    {historySelected.changed_by_name ?? historySelected.created_by ?? "—"} ·{" "}
                    {historySelected.changed_by_role ?? "—"}
                    {historySelected.change_type ? ` · ${historySelected.change_type}` : null}
                  </p>
                ) : null}
                {historyError ? <p className="mb-2 text-sm text-red-600">{historyError}</p> : null}
                <div className="grid grid-cols-1 gap-2">
                  {compareFields.map((f) => {
                    const leftVal = f.current == null ? "—" : Array.isArray(f.current) ? f.current.join(", ") : String(f.current);
                    const src = historySelected?.data ?? {};
                    const rawKey =
                      f.key === "planStart"
                        ? "plan_start"
                        : f.key === "planEnd"
                          ? "plan_end"
                          : f.key === "factStart"
                            ? "fact_start"
                            : f.key === "factEnd"
                              ? "fact_end"
                              : f.key === "related_tmc_ids"
                                ? "related_tmc_ids"
                                : (f.key as string);
                    const rightRaw =
                      src && typeof src === "object" && rawKey in src
                        ? (src as Record<string, unknown>)[rawKey]
                        : null;
                    const rightVal =
                      rightRaw == null ? "—" : Array.isArray(rightRaw) ? rightRaw.join(", ") : String(rightRaw);
                    const diff = leftVal !== rightVal;
                    return (
                      <div
                        key={String(f.key)}
                        className={`grid grid-cols-1 gap-2 rounded-lg border p-2 md:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)] ${
                          diff ? "border-amber-300 bg-amber-50/50" : "border-slate-200 bg-slate-50/50"
                        }`}
                      >
                        <div className="text-xs font-semibold text-slate-700">{f.label}</div>
                        <div className="text-xs text-slate-800">
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">Текущая</div>
                          <div>{leftVal}</div>
                        </div>
                        <div className="text-xs text-slate-800">
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">Выбранная</div>
                          <div>{rightVal}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});
