"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { ConstructionWorkExplainView } from "@/components/construction/ConstructionWorkExplainView";
import { useAppMode } from "@/components/mode/ModeProvider";
import { buildConstructionPresentationExplain } from "@/lib/buildConstructionPresentationExplain";
import { gprMockData } from "@/lib/gprMockData";
import { partIdToProjectPartKey, PROJECT_PARTS } from "@/lib/gprUtils";
import { mergeTenderSnapshotWithSeed, readTenderSnapshotFromStorage, type Tender } from "@/lib/tenderData";
import { getTmcData, mergeTmcSnapshotWithSeed, type TMCItem } from "@/lib/tmcData";

function parsePartId(v: string | null): number {
  return v === "2" ? 2 : 1;
}

function parseFocusSection(v: string | null): string | null {
  if (v === "gpr" || v === "structure" || v === "tenders" || v === "tmc") return v;
  return null;
}

function ConstructionExplainPageInner() {
  const { setMode } = useAppMode();
  const sp = useSearchParams();
  const source = sp.get("source");
  const partId = parsePartId(sp.get("partId"));
  const focusSection = parseFocusSection(sp.get("section"));
  const partLabel = PROJECT_PARTS.find((p) => p.id === partId)?.name ?? "Часть проекта";
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setMode("edit");
  }, [setMode]);

  useEffect(() => {
    const bump = () => setTick((x) => x + 1);
    window.addEventListener("gordo-tenders-saved", bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("gordo-tenders-saved", bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  const { partName, sections } = useMemo(() => {
    void tick;
    const tasks = gprMockData.filter((t) => t.partId === partId);
    let tenders: Tender[] = mergeTenderSnapshotWithSeed(undefined).filter((t) => t.partId === partId);
    let tmcItems: TMCItem[] = getTmcData(partIdToProjectPartKey(partId));
    if (typeof window !== "undefined") {
      try {
        tenders = mergeTenderSnapshotWithSeed(readTenderSnapshotFromStorage()).filter((t) => t.partId === partId);
      } catch {
        tenders = mergeTenderSnapshotWithSeed(undefined).filter((t) => t.partId === partId);
      }
      try {
        const raw = window.localStorage.getItem("gordo_tmc_snapshot");
        const parsed = raw ? (JSON.parse(raw) as unknown) : undefined;
        tmcItems = mergeTmcSnapshotWithSeed(parsed).filter((i) => i.projectPart === partIdToProjectPartKey(partId));
      } catch {
        tmcItems = getTmcData(partIdToProjectPartKey(partId));
      }
    }
    return buildConstructionPresentationExplain(partId, tasks, tenders, tmcItems);
  }, [partId, tick]);

  const backHref = `/edit/construction?section=${focusSection ?? "gpr"}&partId=${partId}`;

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
