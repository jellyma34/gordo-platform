"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GPRSection } from "@/components/construction/GPRSection";
import { TendersSection } from "@/components/construction/TendersSection";
import { TMCSection } from "@/components/construction/TMCSection";
import { useAppMode } from "@/components/mode/ModeProvider";
import {
  getGprProjectId,
  loadPersistedGprTasks,
  postGprImportToApi,
  saveGprTasksToLocalStorage,
} from "@/lib/gprImportPersistence";
import { gprMockData } from "@/lib/gprMockData";
import { filterGprTasksByObjectScope, type ConstructionObjectScope, type GPRTask } from "@/lib/gprUtils";

type ActiveSection = "menu" | "gpr" | "tenders" | "tmc";

function cloneTasks(tasks: GPRTask[]): GPRTask[] {
  return tasks.map((task) => ({ ...task }));
}

export default function ConstructionPage() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<ActiveSection>("menu");
  const { mode: appMode } = useAppMode();
  const mode: "edit" | "presentation" = appMode === "edit" ? "edit" : "presentation";

  const gprProjectId = useMemo(() => getGprProjectId(), []);

  const [tasks, setTasks] = useState<GPRTask[]>(() => cloneTasks(gprMockData));
  const lastSavedGprJsonRef = useRef<string | null>(null);
  const [gprPersistReady, setGprPersistReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    lastSavedGprJsonRef.current = null;
    setGprPersistReady(false);
    (async () => {
      try {
        const r = await loadPersistedGprTasks(gprProjectId, gprMockData);
        if (cancelled) return;
        setTasks(cloneTasks(r.tasks));
        lastSavedGprJsonRef.current = r.bootstrapJson;
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          lastSavedGprJsonRef.current = JSON.stringify(cloneTasks(gprMockData));
        }
      } finally {
        if (!cancelled) setGprPersistReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gprProjectId]);

  useEffect(() => {
    if (!gprPersistReady || typeof window === "undefined") return;
    try {
      const next = JSON.stringify(tasks);
      if (next === lastSavedGprJsonRef.current) return;
      lastSavedGprJsonRef.current = next;
      saveGprTasksToLocalStorage(gprProjectId, tasks);
    } catch (e) {
      console.error(e);
    }
  }, [tasks, gprPersistReady, gprProjectId]);

  const [activePartScope, setActivePartScope] = useState<ConstructionObjectScope>(1);
  const gprTasksForPart = useMemo(
    () => filterGprTasksByObjectScope(tasks, activePartScope),
    [tasks, activePartScope],
  );
  const saveGprTasksForPart = (partTasks: GPRTask[]) => {
    const affectedPartIds =
      activePartScope === "project" ? new Set<number>([1, 2]) : new Set<number>([activePartScope]);
    setTasks((prev) => [
      ...prev.filter((task) => !affectedPartIds.has(task.partId)),
      ...(activePartScope === "project"
        ? partTasks.map((task) => ({ ...task }))
        : partTasks.map((task) => ({ ...task, partId: activePartScope }))),
    ]);
  };

  const replaceAllGprTasks = useCallback(
    (next: GPRTask[]) => {
      const list = cloneTasks(Array.isArray(next) ? next : []);
      setTasks(list);
      void postGprImportToApi(gprProjectId, list);
    },
    [gprProjectId],
  );

  return (
    <section className="mx-auto w-full min-w-0 max-w-[1400px] space-y-6 overflow-x-clip px-3 py-4 sm:px-4 md:p-6">
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="inline-flex rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ← Назад
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveSection("gpr")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeSection === "gpr"
                  ? "bg-slate-900 text-white shadow"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              ГПР
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("tenders")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeSection === "tenders"
                  ? "bg-slate-900 text-white shadow"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Тендеры
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("tmc")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeSection === "tmc"
                  ? "bg-slate-900 text-white shadow"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              ТМЦ
            </button>
          </div>
        </div>
      </div>

      {activeSection === "menu" ? (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-semibold text-slate-900">Строительство</h1>
            <p className="mt-2 text-sm text-slate-600">
              Выберите направление для перехода к рабочему интерфейсу.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-6">
            <button
              type="button"
              onClick={() => setActiveSection("gpr")}
              className="rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-slate-300 hover:shadow"
            >
              <h2 className="text-lg font-semibold text-slate-900">
                ГПР (график производства работ)
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                План-факт анализ выполнения работ, контроль сроков и статусов задач.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("tenders")}
              className="rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-slate-300 hover:shadow"
            >
              <h2 className="text-lg font-semibold text-slate-900">
                Закупка услуг (тендеры)
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Планирование и контроль тендерных процедур, подрядчиков и сроков.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("tmc")}
              className="rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-slate-300 hover:shadow"
            >
              <h2 className="text-lg font-semibold text-slate-900">Закупка ТМЦ</h2>
              <p className="mt-2 text-sm text-slate-600">
                Управление поставками, доступностью материалов и обеспечением стройки.
              </p>
            </button>
          </div>
        </>
      ) : (
        <>
          {activeSection === "gpr" && (
            <GPRSection
              mode={mode}
              tasks={gprTasksForPart}
              allGprTasks={tasks}
              onSaveTasks={saveGprTasksForPart}
              onReplaceAllGprTasks={replaceAllGprTasks}
              activePartScope={activePartScope}
              onChangePartScope={setActivePartScope}
            />
          )}
          {activeSection === "tenders" && (
            <TendersSection activePartScope={activePartScope} onChangePartScope={setActivePartScope} />
          )}
          {activeSection === "tmc" && (
            <TMCSection activePartScope={activePartScope} onChangePartScope={setActivePartScope} />
          )}
        </>
      )}
    </section>
  );
}
