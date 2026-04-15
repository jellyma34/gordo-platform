"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAppMode } from "@/components/mode/ModeProvider";
import { MarketingWorkspace, type MarketingTab } from "@/components/marketing/MarketingWorkspace";
import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import { parsePresentationScenarioQuery, SALES_PLAN_SPA } from "@/lib/salesPlanSpaRoutes";

function pick(v: string | null, fallback: string) {
  if (!v || v.trim() === "") return fallback;
  return v;
}

function parsePeriod(v: string | null): MarketingPeriodGranularity {
  if (v === "quarter" || v === "month") return v;
  return "month";
}

type Props = {
  presentationActiveTab: MarketingTab;
};

export function MarketingPresentationRouteBody({ presentationActiveTab }: Props) {
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
    <MarketingWorkspace
      presentation
      presentationActiveTab={presentationActiveTab}
      modeLabel="Презентация"
      onBackToBlocks={onBackToBlocks}
      initialPeriod={period}
      initialObjectId={objectId}
      initialDealTypeId={dealTypeId}
      initialPlanScenario={scenario}
    />
  );
}
