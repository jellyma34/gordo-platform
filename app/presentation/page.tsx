"use client";

import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { useAppMode } from "@/components/mode/ModeProvider";
import { HubReportingPeriodSelector } from "@/components/presentation/HubReportingPeriodSelector";
import { HubSectionCards } from "@/components/presentation/HubSectionCards";
import { listGprTasksFromDb, listTendersFromDb } from "@/lib/constructionApi";
import { getGprProjectId, loadPersistedGprTasks } from "@/lib/gprImportPersistence";
import { gprMockData } from "@/lib/gprMockData";
import { isGprLocalStorageMode } from "@/lib/gprStorageMode";
import { loadPersistedTenderItems } from "@/lib/tenderImportPersistence";
import { getHomeDashboardSnapshot, getHubNavStatusTone } from "@/lib/homeDashboardSnapshot";
import type { GPRTask } from "@/lib/gprUtils";
import type { Tender } from "@/lib/tenderData";

const gprLocalMode = isGprLocalStorageMode();

function cloneTasks(tasks: GPRTask[]): GPRTask[] {
  return tasks.map((task) => ({ ...task }));
}

export default function PresentationEntry() {
  const { setMode } = useAppMode();
  const { token, hydrated } = useAuth();
  const projectId = useMemo(() => getGprProjectId(), []);
  const [gprTasks, setGprTasks] = useState<GPRTask[]>(() => {
    if (!gprLocalMode) return [];
    return cloneTasks(Array.isArray(gprMockData) ? gprMockData : []);
  });
  const [tenders, setTenders] = useState<Tender[]>([]);

  useEffect(() => {
    if (!gprLocalMode) return;
    let cancelled = false;
    const bootstrap = async () => {
      const loaded = await loadPersistedGprTasks(projectId, gprMockData);
      if (!cancelled) setGprTasks(cloneTasks(loaded.tasks));
    };
    void bootstrap();

    const onStorage = (event: StorageEvent) => {
      if (!event.key || !event.key.includes(`gpr_import_${projectId}`)) return;
      void bootstrap();
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      void bootstrap();
    };

    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [projectId]);

  useEffect(() => {
    if (gprLocalMode || !hydrated || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const mapped = await listGprTasksFromDb(token);
        if (!cancelled) setGprTasks(mapped);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, token]);

  useEffect(() => {
    if (gprLocalMode) {
      let cancelled = false;
      const load = async () => {
        const r = await loadPersistedTenderItems(projectId);
        if (!cancelled) setTenders(r.tenders);
      };
      void load();
      const bump = () => {
        void load();
      };
      window.addEventListener("gordo-tenders-saved", bump);
      const onStorage = (event: StorageEvent) => {
        if (!event.key || !event.key.includes(`tender_import_${projectId}`)) return;
        void load();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        cancelled = true;
        window.removeEventListener("gordo-tenders-saved", bump);
        window.removeEventListener("storage", onStorage);
      };
    }
    if (!hydrated || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await listTendersFromDb(token);
        if (!cancelled) setTenders(list);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, hydrated, token]);

  const snapshot = useMemo(
    () => getHomeDashboardSnapshot(new Date(), gprTasks, tenders),
    [gprTasks, tenders],
  );

  useEffect(() => {
    setMode("presentation");
  }, [setMode]);

  const blocks = [
    {
      title: "Строительство",
      description: "ГПР, тендеры, ТМЦ — аналитика и график работ.",
      href: "/presentation/construction",
      status: getHubNavStatusTone(snapshot, "construction"),
      wide: true,
      constructionProjectKpi: snapshot.constructionProjectKpi,
      tenderBudgetKpi: snapshot.tenderBudgetKpi,
    },
    {
      title: "Маркетинг",
      description: "План продаж, воронка и рассрочка по ДДУ.",
      href: "/presentation/marketing/sales-plan",
      status: getHubNavStatusTone(snapshot, "marketing"),
    },
    {
      title: "Финансы",
      description: "Экономика и показатели (модуль в разработке).",
      href: "/presentation/finance",
      status: getHubNavStatusTone(snapshot, "finance"),
    },
  ] as const;

  return (
    <div className="presentation-hub">
      <div className="presentation-hub-bg" aria-hidden />
      <div className="presentation-content">
        <header className="presentation-hero">
          <h1 className="presentation-hero-title">
            Сводка проекта{" "}
            <span className="presentation-hero-accent">на сегодня</span>
          </h1>
          <HubReportingPeriodSelector />
        </header>

        <div className="presentation-cards-wrap">
          <HubSectionCards
            blocks={blocks}
            gridClassName="presentation-section-grid"
            variant="presentation"
          />
        </div>
      </div>
    </div>
  );
}
