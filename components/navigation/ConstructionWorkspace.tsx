"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { GPRSection } from "@/components/construction/GPRSection";
import { TendersSection } from "@/components/construction/TendersSection";
import { TMCSection } from "@/components/construction/TMCSection";
import { useAuth } from "@/components/auth/AuthProvider";
import { gprMockData } from "@/lib/gprMockData";
import {
  canAccessConstructionSection,
  createGprTaskApi,
  listGprTasksApi,
  uiToApi,
  updateGprTaskApi,
  type UiConstructionSection,
} from "@/lib/auth";
import { gprTaskFromApiItem, gprTaskToApiWritePayload, type GPRTask } from "@/lib/gprUtils";

type ActiveSection = "menu" | UiConstructionSection;

function cloneTasks(tasks: GPRTask[]): GPRTask[] {
  return tasks.map((task) => ({ ...task }));
}

function sectionLabel(section: ActiveSection) {
  if (section === "gpr") return "ГПР";
  if (section === "tenders") return "Тендеры";
  if (section === "tmc") return "ТМЦ";
  return "Выбор раздела";
}

function parseSectionParam(v: string | null): UiConstructionSection | null {
  if (v === "gpr" || v === "tenders" || v === "tmc") return v;
  return null;
}

function firstAllowedTab(isAdmin: boolean, allowed: string[]): UiConstructionSection {
  if (isAdmin) return "gpr";
  const order: UiConstructionSection[] = ["gpr", "tenders", "tmc"];
  for (const ui of order) {
    if (allowed.includes(uiToApi(ui))) return ui;
  }
  return "gpr";
}

function resolveTab(
  isPresentation: boolean,
  sectionParam: string | null,
  isAdmin: boolean,
  allowed: string[],
): UiConstructionSection {
  const parsed = parseSectionParam(sectionParam);
  if (parsed && (isAdmin || allowed.includes(uiToApi(parsed)))) return parsed;
  return firstAllowedTab(isAdmin, allowed);
}

function SectionTabButton({
  active,
  onClick,
  children,
  presentation,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  presentation: boolean;
}) {
  if (presentation) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
          active ? "bg-slate-50 text-slate-900 shadow" : "bg-white/5 text-slate-200 hover:bg-white/10"
        }`}
      >
        {children}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        active ? "bg-slate-900 text-white shadow" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function ConstructionWorkspaceInner({
  modeLabel,
  onBackToBlocks,
}: {
  modeLabel: string;
  onBackToBlocks: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { role, hasFullConstructionAccess, allowedSections, token, hydrated } = useAuth();

  const prefix = pathname.startsWith("/presentation") ? "/presentation" : "/edit";
  const sectionParam = searchParams.get("section");

  const isPresentation = useMemo(() => pathname.startsWith("/presentation"), [pathname]);
  const mode: "edit" | "presentation" = isPresentation ? "presentation" : "edit";

  const [tasks, setTasks] = useState<GPRTask[]>(() => cloneTasks(gprMockData));
  const [activeGprPartId, setActiveGprPartId] = useState<number>(1);
  const gprTasksForActivePart = useMemo(
    () => tasks.filter((task) => task.partId === activeGprPartId),
    [tasks, activeGprPartId],
  );

  const saveGprTasksForActivePart = async (partTasks: GPRTask[]) => {
    const normalized = partTasks.map((task) => ({ ...task, partId: activeGprPartId }));
    setTasks((prev) => [...prev.filter((task) => task.partId !== activeGprPartId), ...normalized]);

    if (!token) {
      console.warn("[GPR] Сохранение без токена: запрос к API не отправляется");
      return;
    }

    try {
      const synced: GPRTask[] = [];
      for (const t of normalized) {
        const idNum = Number(t.id);
        const body = gprTaskToApiWritePayload(t);
        if (Number.isFinite(idNum)) {
          const row = await updateGprTaskApi(token, idNum, body);
          synced.push(gprTaskFromApiItem(row));
        } else {
          const row = await createGprTaskApi(token, body);
          synced.push(gprTaskFromApiItem(row));
        }
      }
      setTasks((prev) => [...prev.filter((task) => task.partId !== activeGprPartId), ...synced]);
    } catch (e) {
      console.error("[GPR] Сохранение в backend не удалось:", e);
      throw e;
    }
  };

  const allowedApi = useMemo(() => allowedSections, [allowedSections]);

  const showSection = (ui: UiConstructionSection) =>
    role ? canAccessConstructionSection(role, allowedApi, ui) : false;

  const activeTab = useMemo(() => {
    if (!isPresentation && !sectionParam) return "menu" as const;
    return resolveTab(isPresentation, sectionParam, hasFullConstructionAccess, allowedApi);
  }, [isPresentation, sectionParam, hasFullConstructionAccess, allowedApi]);

  const gprTasksFetchDoneRef = useRef(false);
  useEffect(() => {
    if (!token) gprTasksFetchDoneRef.current = false;
  }, [token]);

  useEffect(() => {
    if (!hydrated || !token || activeTab !== "gpr" || gprTasksFetchDoneRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await listGprTasksApi(token);
        if (cancelled) return;
        gprTasksFetchDoneRef.current = true;
        if (rows.length > 0) setTasks(rows.map(gprTaskFromApiItem));
      } catch {
        if (!cancelled) gprTasksFetchDoneRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, token, activeTab]);

  useEffect(() => {
    if (!isPresentation && !sectionParam) return;
    const resolved = resolveTab(isPresentation, sectionParam, hasFullConstructionAccess, allowedApi);
    if (sectionParam !== resolved) {
      router.replace(`${prefix}/construction?section=${resolved}`);
    }
  }, [isPresentation, sectionParam, hasFullConstructionAccess, allowedApi, prefix, router]);

  function goSection(ui: UiConstructionSection) {
    router.replace(`${prefix}/construction?section=${ui}`);
  }

  function goMenu() {
    router.replace(`${prefix}/construction`);
  }

  if (!hasFullConstructionAccess && allowedApi.length === 0) {
    return (
      <section className="mx-auto w-full max-w-[1400px] p-4 md:p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          У вас нет доступа ни к одному разделу строительства. Обратитесь к администратору.
        </div>
      </section>
    );
  }

  const tabBar = (
    <div className="flex flex-wrap gap-2">
      {showSection("gpr") && (
        <SectionTabButton
          presentation={isPresentation}
          active={activeTab === "gpr"}
          onClick={() => goSection("gpr")}
        >
          ГПР
        </SectionTabButton>
      )}
      {showSection("tenders") && (
        <SectionTabButton
          presentation={isPresentation}
          active={activeTab === "tenders"}
          onClick={() => goSection("tenders")}
        >
          Тендеры
        </SectionTabButton>
      )}
      {showSection("tmc") && (
        <SectionTabButton
          presentation={isPresentation}
          active={activeTab === "tmc"}
          onClick={() => goSection("tmc")}
        >
          ТМЦ
        </SectionTabButton>
      )}
    </div>
  );

  if (isPresentation) {
    return (
      <section className="w-full">
        <div className="mx-auto w-full max-w-[1400px] space-y-6">
          <div className="rounded-2xl border border-slate-700/60 bg-[#1e293b] p-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-300">
                <span className="font-semibold text-slate-50">Строительство</span>
              </div>
              {tabBar}
            </div>
          </div>

          {activeTab === "gpr" && (
            <GPRSection
              mode={mode}
              tasks={gprTasksForActivePart}
              onSaveTasks={saveGprTasksForActivePart}
              activePartId={activeGprPartId}
              onChangePart={setActiveGprPartId}
            />
          )}
          {activeTab === "tenders" && (
            <TendersSection activePartId={activeGprPartId} onChangePart={setActiveGprPartId} />
          )}
          {activeTab === "tmc" && (
            <TMCSection activePartId={activeGprPartId} onChangePart={setActiveGprPartId} />
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto min-h-[60vh] w-full max-w-[1400px] space-y-6 bg-slate-50 p-4 md:p-6">
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBackToBlocks}
            className="inline-flex rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ← К блокам
          </button>

          <div className="text-sm text-slate-600">
            <span className="font-medium text-slate-900">{modeLabel}</span>
            <span className="mx-2 text-slate-400">→</span>
            <span className="font-medium text-slate-900">Строительство</span>
            <span className="mx-2 text-slate-400">→</span>
            <span className="text-slate-700">{sectionLabel(activeTab)}</span>
          </div>

          {tabBar}
        </div>
      </div>

      {activeTab === "menu" ? (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-semibold text-slate-900">Строительство</h1>
            <p className="mt-2 text-sm text-slate-600">Выберите раздел для работы.</p>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {showSection("gpr") && (
              <button
                type="button"
                onClick={() => goSection("gpr")}
                className="rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-slate-300 hover:shadow"
              >
                <h2 className="text-lg font-semibold text-slate-900">ГПР</h2>
                <p className="mt-2 text-sm text-slate-600">
                  План-факт анализ выполнения работ и управленческая аналитика.
                </p>
              </button>
            )}
            {showSection("tenders") && (
              <button
                type="button"
                onClick={() => goSection("tenders")}
                className="rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-slate-300 hover:shadow"
              >
                <h2 className="text-lg font-semibold text-slate-900">Закупка услуг (тендеры)</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Реестр и аналитика тендерных процедур, привязка к этапам ГПР и датам договоров.
                </p>
              </button>
            )}
            {showSection("tmc") && (
              <button
                type="button"
                onClick={() => goSection("tmc")}
                className="rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-slate-300 hover:shadow"
              >
                <h2 className="text-lg font-semibold text-slate-900">Закупка ТМЦ</h2>
                <p className="mt-2 text-sm text-slate-600">Раздел в разработке.</p>
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={goMenu}
              className="text-sm font-medium text-slate-600 underline hover:text-slate-900"
            >
              ← К выбору раздела
            </button>
          </div>
          {activeTab === "gpr" && (
            <GPRSection
              mode={mode}
              tasks={gprTasksForActivePart}
              onSaveTasks={saveGprTasksForActivePart}
              activePartId={activeGprPartId}
              onChangePart={setActiveGprPartId}
            />
          )}
          {activeTab === "tenders" && (
            <TendersSection activePartId={activeGprPartId} onChangePart={setActiveGprPartId} />
          )}
          {activeTab === "tmc" && (
            <TMCSection activePartId={activeGprPartId} onChangePart={setActiveGprPartId} />
          )}
        </>
      )}
    </section>
  );
}

export function ConstructionWorkspace({
  modeLabel,
  onBackToBlocks,
}: {
  modeLabel: string;
  onBackToBlocks: () => void;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[30vh] items-center justify-center text-sm text-slate-500">
          Загрузка раздела…
        </div>
      }
    >
      <ConstructionWorkspaceInner modeLabel={modeLabel} onBackToBlocks={onBackToBlocks} />
    </Suspense>
  );
}
