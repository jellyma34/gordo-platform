"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { GPRSection } from "@/components/construction/GPRSection";
import { TendersSection } from "@/components/construction/TendersSection";
import { TMCSection } from "@/components/construction/TMCSection";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  canAccessConstructionSection,
  createGprTaskApi,
  uiToApi,
  updateGprTaskApi,
  type UiConstructionSection,
} from "@/lib/auth";
import {
  filterGprTasksByObjectScope,
  gprTaskFromApiItem,
  gprTaskToApiWritePayload,
  partScopeToUrlParam,
  urlParamToPartScope,
  type GPRTask,
  type ConstructionObjectScope,
} from "@/lib/gprUtils";
import { ConstructionPresentationFilters } from "@/components/construction/ConstructionPresentationFilters";
import { ConstructionRouteSuspenseFallback } from "@/components/construction/ConstructionRouteSuspenseFallback";
import { useRegisterConstructionLayoutChrome } from "@/components/construction/constructionLayoutChromeContext";
import { bulkImportGprTasksToDb, listGprTasksFromDb } from "@/lib/constructionApi";
import { gprMockData } from "@/lib/gprMockData";
import {
  getGprProjectId,
  loadPersistedGprTasks,
  postGprImportToApi,
  saveGprTasksToLocalStorage,
} from "@/lib/gprImportPersistence";
import { isGprLocalStorageMode } from "@/lib/gprStorageMode";

const gprLocalMode = isGprLocalStorageMode();

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
  const safe = Array.isArray(allowed) ? allowed : [];
  const order: UiConstructionSection[] = ["gpr", "tenders", "tmc"];
  for (const ui of order) {
    if (safe.includes(uiToApi(ui))) return ui;
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
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const { role, hasFullConstructionAccess, allowedSections, token, hydrated } = useAuth();

  const prefix = pathname.startsWith("/presentation") ? "/presentation" : "/edit";
  const sectionParam = searchParams.get("section");

  const isPresentation = useMemo(() => pathname.startsWith("/presentation"), [pathname]);
  const mode: "edit" | "presentation" = isPresentation ? "presentation" : "edit";

  const chromeRegistration = useMemo(
    () => ({ modeLabel, onBackToBlocks }),
    [modeLabel, onBackToBlocks],
  );
  useRegisterConstructionLayoutChrome(chromeRegistration);

  const gprProjectId = useMemo(() => getGprProjectId(), []);

  const [tasks, setTasks] = useState<GPRTask[]>(() => {
    if (!gprLocalMode) return [];
    try {
      return cloneTasks(Array.isArray(gprMockData) ? gprMockData : []);
    } catch (e) {
      console.error("Construction edit error:", e);
      return [];
    }
  });

  const lastSavedGprJsonRef = useRef<string | null>(null);
  const [gprPersistReady, setGprPersistReady] = useState(!gprLocalMode);

  useEffect(() => {
    if (!gprLocalMode) return;
    lastSavedGprJsonRef.current = null;
    setGprPersistReady(false);
    let cancelled = false;
    (async () => {
      try {
        const r = await loadPersistedGprTasks(gprProjectId, gprMockData);
        if (cancelled) return;
        setTasks(cloneTasks(r.tasks));
        lastSavedGprJsonRef.current = r.bootstrapJson;
      } catch (e) {
        console.error("Construction edit error:", e);
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
    if (!gprLocalMode || !gprPersistReady || typeof window === "undefined") return;
    try {
      const next = JSON.stringify(tasks);
      if (next === lastSavedGprJsonRef.current) return;
      lastSavedGprJsonRef.current = next;
      saveGprTasksToLocalStorage(gprProjectId, tasks);
    } catch (e) {
      console.error("Construction edit error:", e);
    }
  }, [tasks, gprPersistReady, gprProjectId]);

  const [activePartScope, setActivePartScope] = useState<ConstructionObjectScope>(1);
  const gprTasksForActivePart = useMemo(() => {
    const list = Array.isArray(tasks) ? tasks : [];
    return filterGprTasksByObjectScope(list, activePartScope);
  }, [tasks, activePartScope]);

  const saveGprTasksForActivePart = async (partTasks: GPRTask[]) => {
    const partId: 1 | 2 = activePartScope === "project" ? 1 : activePartScope;
    const list = Array.isArray(partTasks) ? partTasks : [];
    const normalized = list.map((task) => ({ ...task, partId }));
    setTasks((prev) => [
      ...Array.isArray(prev) ? prev.filter((task) => task.partId !== partId) : [],
      ...normalized,
    ]);

    if (gprLocalMode) return;

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
          try {
            synced.push(gprTaskFromApiItem(row));
          } catch (e) {
            console.error("Construction edit error:", e);
          }
        } else {
          const row = await createGprTaskApi(token, body);
          try {
            synced.push(gprTaskFromApiItem(row));
          } catch (e) {
            console.error("Construction edit error:", e);
          }
        }
      }
      if (synced.length > 0) {
        setTasks((prev) => [
          ...(Array.isArray(prev) ? prev.filter((task) => task.partId !== partId) : []),
          ...synced,
        ]);
      }
    } catch (e) {
      console.error("[GPR] Сохранение в backend не удалось:", e);
      throw e;
    }
  };

  const reloadGprTasksFromApi = useCallback(async () => {
    if (gprLocalMode) {
      try {
        const r = await loadPersistedGprTasks(gprProjectId, gprMockData);
        setTasks(cloneTasks(r.tasks));
      } catch (e) {
        console.error("Construction edit error:", e);
      }
      return;
    }
    if (!token) return;
    try {
      const mapped = await listGprTasksFromDb(token);
      setTasks(mapped);
    } catch (e) {
      console.error("Construction edit error:", e);
    }
  }, [gprProjectId, token]);

  const allowedApi = useMemo(
    () => (Array.isArray(allowedSections) ? allowedSections : []),
    [allowedSections],
  );

  const showSection = (ui: UiConstructionSection) =>
    role ? canAccessConstructionSection(role, allowedApi, ui) : false;

  const activeTab = useMemo(() => {
    if (!isPresentation && !sectionParam) return "menu" as const;
    return resolveTab(isPresentation, sectionParam, hasFullConstructionAccess, allowedApi);
  }, [isPresentation, sectionParam, hasFullConstructionAccess, allowedApi]);

  useEffect(() => {
    if (gprLocalMode || !hydrated || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const mapped = await listGprTasksFromDb(token);
        if (!cancelled) setTasks(mapped);
      } catch (e) {
        console.error("Construction edit error:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, token]);

  const partIdParam = searchParams.get("partId");

  useEffect(() => {
    const s = urlParamToPartScope(partIdParam);
    if (!isPresentation && s === "project") {
      setActivePartScope(1);
      return;
    }
    setActivePartScope(s);
  }, [partIdParam, isPresentation]);

  useEffect(() => {
    if (isPresentation || partIdParam !== "project") return;
    const tab =
      !sectionParam || sectionParam === "menu"
        ? "gpr"
        : resolveTab(false, sectionParam, hasFullConstructionAccess, allowedApi);
    if (!sectionParam) {
      router.replace(`${prefix}/construction?partId=1`);
    } else {
      router.replace(`${prefix}/construction?section=${tab}&partId=1`);
    }
  }, [isPresentation, partIdParam, sectionParam, hasFullConstructionAccess, allowedApi, prefix, router]);

  useEffect(() => {
    if (!isPresentation && !sectionParam) return;
    const resolved = resolveTab(isPresentation, sectionParam, hasFullConstructionAccess, allowedApi);
    const partQ = searchParams.get("partId");
    const partForUrl = partQ ? partScopeToUrlParam(urlParamToPartScope(partQ)) : "1";
    if (sectionParam !== resolved) {
      router.replace(`${prefix}/construction?section=${resolved}&partId=${partForUrl}`);
    }
  }, [isPresentation, sectionParam, hasFullConstructionAccess, allowedApi, prefix, router, searchParams]);

  const commitPartScope = useCallback(
    (scope: ConstructionObjectScope) => {
      setActivePartScope(scope);
      if (activeTab === "menu") return;
      if (!isPresentation && !sectionParam) return;
      router.replace(`${prefix}/construction?section=${activeTab}&partId=${partScopeToUrlParam(scope)}`);
    },
    [activeTab, isPresentation, sectionParam, prefix, router],
  );

  const replaceAllGprTasks = useCallback(
    (next: GPRTask[]) => {
      const list = cloneTasks(Array.isArray(next) ? next : []);
      setTasks(list);
      if (gprLocalMode) {
        void postGprImportToApi(gprProjectId, list);
        return;
      }
      if (!token) {
        console.warn("[GPR] CSV import без токена: данные не сохранены в БД");
        return;
      }
      void bulkImportGprTasksToDb(token, list)
        .then((saved) => setTasks(saved))
        .catch((e) => console.error("[GPR] bulk import failed:", e));
    },
    [gprProjectId, token],
  );

  function goSection(ui: UiConstructionSection) {
    router.replace(`${prefix}/construction?section=${ui}&partId=${partScopeToUrlParam(activePartScope)}`);
  }

  function goMenu() {
    router.replace(`${prefix}/construction`);
  }

  if (!hasFullConstructionAccess && allowedApi.length === 0) {
    return (
      <section className="mx-auto w-full min-w-0 max-w-[1400px] px-3 py-4 sm:px-4 md:p-6">
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
    const filterWell = "rounded-2xl border border-slate-700/60 bg-[#1e293b]/80 p-4 sm:p-5";
    return (
      <section className="w-full min-w-0 text-[13px] leading-normal">
        <div className="mx-auto w-full min-w-0 max-w-[1400px]">
          <div className={filterWell}>
            {activeTab === "gpr" && (
              <ConstructionPresentationFilters
                activePartScope={activePartScope}
                onPartScopeChange={commitPartScope}
              />
            )}

            <div className={`min-w-0 space-y-4${activeTab === "gpr" ? " mt-4" : ""}`}>
              {activeTab === "gpr" && (
                <GPRSection
                  mode={mode}
                  tasks={gprTasksForActivePart}
                  allGprTasks={Array.isArray(tasks) ? tasks : []}
                  onSaveTasks={saveGprTasksForActivePart}
                  onReloadGprTasks={reloadGprTasksFromApi}
                  onReplaceAllGprTasks={replaceAllGprTasks}
                  activePartScope={activePartScope}
                  onChangePartScope={commitPartScope}
                  hidePresentationPartStrip
                />
              )}
              {activeTab === "tenders" && (
                <TendersSection
                  activePartScope={activePartScope}
                  onChangePartScope={commitPartScope}
                  hidePresentationPartStrip
                />
              )}
              {activeTab === "tmc" && (
                <TMCSection
                  activePartScope={activePartScope}
                  onChangePartScope={commitPartScope}
                  hidePresentationPartStrip
                />
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto min-h-[60vh] w-full min-w-0 max-w-[1400px] space-y-6 overflow-x-clip bg-slate-50 px-3 py-4 sm:px-4 md:p-6">
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBackToBlocks}
            className="inline-flex rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ← К блокам
          </button>

          <div className="min-w-0 max-w-full text-sm text-slate-600">
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 break-words">
              <span className="font-medium text-slate-900">{modeLabel}</span>
              <span className="text-slate-400">→</span>
              <span className="font-medium text-slate-900">Строительство</span>
              <span className="text-slate-400">→</span>
              <span className="text-slate-700">{sectionLabel(activeTab)}</span>
            </span>
          </div>

          {tabBar}
        </div>
        {!isPresentation && activeTab !== "menu" ? (
          <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/presentation/construction?section=${activeTab}&partId=${partScopeToUrlParam(activePartScope)}`,
                )
              }
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              Сформировать презентацию
            </button>
            <Link
              href={`/construction/explain?source=work&section=${activeTab}&partId=${partScopeToUrlParam(activePartScope)}`}
              className="rounded-lg border border-sky-600/40 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900 hover:bg-sky-100"
            >
              Пояснение к показателям
            </Link>
          </div>
        ) : null}
      </div>

      {activeTab === "menu" ? (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-semibold text-slate-900">Строительство</h1>
            <p className="mt-2 text-sm text-slate-600">Выберите раздел для работы.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
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
              allGprTasks={Array.isArray(tasks) ? tasks : []}
              onSaveTasks={saveGprTasksForActivePart}
              onReloadGprTasks={reloadGprTasksFromApi}
              onReplaceAllGprTasks={replaceAllGprTasks}
              activePartScope={activePartScope}
              onChangePartScope={commitPartScope}
            />
          )}
          {activeTab === "tenders" && (
            <TendersSection activePartScope={activePartScope} onChangePartScope={commitPartScope} />
          )}
          {activeTab === "tmc" && (
            <TMCSection activePartScope={activePartScope} onChangePartScope={commitPartScope} />
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
    <Suspense fallback={<ConstructionRouteSuspenseFallback />}>
      <ConstructionWorkspaceInner modeLabel={modeLabel} onBackToBlocks={onBackToBlocks} />
    </Suspense>
  );
}
