"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAppMode } from "@/components/mode/ModeProvider";
import { MarketingWorkspace } from "@/components/marketing/MarketingWorkspace";
import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import {
  SALES_PLAN_SPA,
  parsePresentationScenarioQuery,
} from "@/lib/salesPlanSpaRoutes";

function pick(v: string | null, fallback: string) {
  if (!v || v.trim() === "") return fallback;
  return v;
}

function parsePeriod(v: string | null): MarketingPeriodGranularity {
  if (v === "quarter" || v === "month") return v;
  return "month";
}

function SalesPlanPresentationSpaInner() {
  const { setMode } = useAppMode();
  const router = useRouter();
  const sp = useSearchParams();

  useEffect(() => {
    setMode("presentation");
  }, [setMode]);

  const objectId = pick(sp.get("objectId"), "all");
  const dealTypeId = pick(sp.get("dealTypeId"), "all");
  const period = parsePeriod(sp.get("period"));
  const scenario = parsePresentationScenarioQuery(sp.get("scenario"));
  const returnTo = sp.get("return");

  const onBackToBlocks = () => {
    if (returnTo === "work") {
      router.push(SALES_PLAN_SPA.work);
      return;
    }
    router.push("/presentation");
  };

  return (
    <div className="min-h-screen w-full min-w-0 overflow-x-clip bg-gradient-to-b from-[#020617] to-[#0f172a]">
      <div className="mx-auto min-h-screen w-full min-w-0 max-w-[1400px] px-3 py-4 sm:px-4 md:p-6">
        <MarketingWorkspace
          presentation
          modeLabel="Презентация"
          onBackToBlocks={onBackToBlocks}
          initialPeriod={period}
          initialObjectId={objectId}
          initialDealTypeId={dealTypeId}
          initialPlanScenario={scenario}
        />
      </div>
    </div>
  );
}

export default function MarketingSalesPlanPresentationPage() {
  return (
    <Suspense
      fallback={<div className="min-h-screen bg-[#0f172a] p-6 text-slate-400">Загрузка презентации…</div>}
    >
      <SalesPlanPresentationSpaInner />
    </Suspense>
  );
}
