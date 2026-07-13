"use client";

import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { useAppMode } from "@/components/mode/ModeProvider";
import { HubReportingPeriodSelector } from "@/components/presentation/HubReportingPeriodSelector";
import { HubSectionCards } from "@/components/presentation/HubSectionCards";
import { listGprTasksFromDb, listTmcFromDb } from "@/lib/constructionApi";
import { getGprProjectId, loadPersistedGprTasks } from "@/lib/gprImportPersistence";
import { gprMockData } from "@/lib/gprMockData";
import { isGprLocalStorageMode } from "@/lib/gprStorageMode";
import { loadTenderRecordsForAnalytics } from "@/lib/tenderImportPersistence";
import { loadPersistedTmcItems } from "@/lib/tmcImportPersistence";
import { getHomeDashboardSnapshot, getHubNavStatusTone } from "@/lib/homeDashboardSnapshot";
import type { GPRTask } from "@/lib/gprUtils";
import type { Tender } from "@/lib/tenderData";
import type { TMCItem } from "@/lib/tmcData";

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
  const [tmcItems, setTmcItems] = useState<TMCItem[]>([]);

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
    let cancelled = false;
    const load = async () => {
      const loaded = await loadTenderRecordsForAnalytics(projectId, {
        token: gprLocalMode ? null : token,
      });
      if (!cancelled) setTenders(loaded.tenders);
    };
    if (!gprLocalMode && (!hydrated || !token)) return;

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
  }, [projectId, hydrated, token]);

  useEffect(() => {
    if (gprLocalMode) {
      let cancelled = false;
      const load = async () => {
        const r = await loadPersistedTmcItems(projectId);
        if (!cancelled) setTmcItems(r.items);
      };
      void load();
      const bump = () => {
        void load();
      };
      window.addEventListener("gordo-tmc-saved", bump);
      const onStorage = (event: StorageEvent) => {
        if (!event.key || !event.key.includes(`tmc_import_${projectId}`)) return;
        void load();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        cancelled = true;
        window.removeEventListener("gordo-tmc-saved", bump);
        window.removeEventListener("storage", onStorage);
      };
    }
    if (!hydrated || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await listTmcFromDb(token);
        if (!cancelled) setTmcItems(list);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, hydrated, token]);

  const snapshot = useMemo(
    () => getHomeDashboardSnapshot(new Date(), gprTasks, tenders, tmcItems),
    [gprTasks, tenders, tmcItems],
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
      tmcPurchasedDeviationKpi: snapshot.tmcPurchasedDeviationKpi,
    },
    {
      title: "Маркетинг",
      description: "План продаж, воронка и рассрочка по ДДУ.",
      href: "/presentation/marketing/sales-plan",
      status: getHubNavStatusTone(snapshot, "marketing"),
      marketingProjectKpi: snapshot.marketingProjectKpi,
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
