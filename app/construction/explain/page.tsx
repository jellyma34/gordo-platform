"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useAuth } from "@/components/auth/AuthProvider";
import { ConstructionWorkExplainView } from "@/components/construction/ConstructionWorkExplainView";
import { useAppMode } from "@/components/mode/ModeProvider";
import { buildConstructionPresentationExplain } from "@/lib/buildConstructionPresentationExplain";
import { listTendersFromDb, listTmcFromDb } from "@/lib/constructionApi";
import { getGprProjectId } from "@/lib/gprImportPersistence";
import { isGprLocalStorageMode } from "@/lib/gprStorageMode";
import { loadPersistedTenderItems } from "@/lib/tenderImportPersistence";
import { loadPersistedTmcItems } from "@/lib/tmcImportPersistence";
import { gprMockData } from "@/lib/gprMockData";
import { partIdToProjectPartKey, PROJECT_PARTS, urlParamToPartScope, type ConstructionObjectScope } from "@/lib/gprUtils";
import { type Tender } from "@/lib/tenderData";
import { type TMCItem } from "@/lib/tmcData";

function parseFocusSection(v: string | null): string | null {
  if (v === "gpr" || v === "structure" || v === "tenders" || v === "tmc") return v;
  return null;
}

const constructionLocalMode = isGprLocalStorageMode();

function ConstructionExplainPageInner() {
  const { setMode } = useAppMode();
  const { token, hydrated } = useAuth();
  const projectId = useMemo(() => getGprProjectId(), []);
  const sp = useSearchParams();
  const source = sp.get("source");
  const partScope: ConstructionObjectScope = urlParamToPartScope(sp.get("partId"));
  const partId = partScope === "project" ? 1 : partScope;
  const focusSection = parseFocusSection(sp.get("section"));
  const partLabel =
    partScope === "project"
      ? "Проект (сводно)"
      : (PROJECT_PARTS.find((p) => p.id === partId)?.name ?? "Часть проекта");
  const [tick, setTick] = useState(0);
  const [allTenders, setAllTenders] = useState<Tender[]>([]);
  const [allTmc, setAllTmc] = useState<TMCItem[]>([]);

  useEffect(() => {
    setMode("edit");
  }, [setMode]);

  useEffect(() => {
    const bump = () => setTick((x) => x + 1);
    window.addEventListener("gordo-tenders-saved", bump);
    window.addEventListener("gordo-tmc-saved", bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("gordo-tenders-saved", bump);
      window.removeEventListener("gordo-tmc-saved", bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (constructionLocalMode) {
          const [tenderResult, tmcResult] = await Promise.all([
            loadPersistedTenderItems(projectId),
            loadPersistedTmcItems(projectId),
          ]);
          if (!cancelled) {
            setAllTenders(tenderResult.tenders);
            setAllTmc(tmcResult.items);
          }
          return;
        }
        if (!hydrated || !token) return;
        const [tenders, tmc] = await Promise.all([listTendersFromDb(token), listTmcFromDb(token)]);
        if (!cancelled) {
          setAllTenders(tenders);
          setAllTmc(tmc);
        }
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [constructionLocalMode, hydrated, token, projectId, tick]);

  const { partName, sections } = useMemo(() => {
    void tick;
    const tasks =
      partScope === "project"
        ? gprMockData
        : gprMockData.filter((t) => t.partId === partId);
    const tenderFilter = (t: Tender) =>
      partScope === "project" ? t.partId === 1 || t.partId === 2 : t.partId === partId;
    const tenders: Tender[] = allTenders.filter(tenderFilter);
    const tmcItems: TMCItem[] =
      partScope === "project"
        ? allTmc.filter((i) => i.projectPart === "residential" || i.projectPart === "parking")
        : allTmc.filter((i) => i.projectPart === partIdToProjectPartKey(partId));
    return buildConstructionPresentationExplain(
      partScope === "project" ? "all" : partId,
      tasks,
      tenders,
      tmcItems,
    );
  }, [partId, partScope, allTenders, allTmc]);

  const backHref = `/edit/construction?section=${focusSection ?? "gpr"}&partId=${
    partScope === "project" ? "project" : partId
  }`;

  if (source !== "work") {
    return (
      <main className="min-h-screen bg-[#0f172a] px-3 py-6 text-slate-100 sm:px-4 md:px-6">
        <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-rose-500/40 bg-slate-900/80 p-6">
          <h1 className="text-lg font-bold text-white">Некорректный переход</h1>
          <p className="text-sm text-slate-300">
            Разбор показателей доступен только из рабочего режима. Откройте ссылку с параметром{" "}
            <code className="text-sky-200">source=work</code> или перейдите из раздела «Строительство» → «Пояснение к
            показателям».
          </p>
          <Link
            href="/edit/construction"
            className="inline-flex rounded-lg border border-slate-600 bg-slate-950/80 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
          >
            ← К строительству
          </Link>
        </div>
      </main>
    );
  }

  return (
    <ConstructionWorkExplainView
      partLabel={partName || partLabel}
      sections={sections}
      backHref={backHref}
      focusSection={focusSection}
    />
  );
}

export default function ConstructionExplainPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0f172a] p-6 text-slate-400">Загрузка…</div>}>
      <ConstructionExplainPageInner />
    </Suspense>
  );
}
