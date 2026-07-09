"use client";

import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { useAppMode } from "@/components/mode/ModeProvider";
import { HubReportingPeriodSelector } from "@/components/presentation/HubReportingPeriodSelector";
import { HubSectionCards } from "@/components/presentation/HubSectionCards";
import { listGprTasksFromDb } from "@/lib/constructionApi";
import { getGprProjectId, loadPersistedGprTasks } from "@/lib/gprImportPersistence";
import { gprMockData } from "@/lib/gprMockData";
import { isGprLocalStorageMode } from "@/lib/gprStorageMode";
import { getHomeDashboardSnapshot, getHubNavStatusTone } from "@/lib/homeDashboardSnapshot";
import type { GPRTask } from "@/lib/gprUtils";

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

  const snapshot = useMemo(() => getHomeDashboardSnapshot(new Date(), gprTasks), [gprTasks]);

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
