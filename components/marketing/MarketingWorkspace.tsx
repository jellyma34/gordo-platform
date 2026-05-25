"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useAppMode } from "@/components/mode/ModeProvider";
import { MarketingDealsFeedProvider } from "./marketingDealsFeedContext";
import { InstallmentDduPanel } from "./InstallmentDduPanel";
import type { MarketingPeriodGranularity } from "./MarketingFilters";
import { SalesDealsSection } from "./SalesDealsSection";
import { SalesPlanPanel, type PlanScenario } from "./SalesPlanPanel";
import type { MarketingTab } from "./marketingTypes";
import { useRegisterMarketingLayoutChrome } from "@/components/marketing/marketingLayoutChromeContext";
import { useMarketingEditTabOptional } from "@/components/marketing/marketingEditTabContext";
import { MPL_PREMIUM_GLASS_MAIN } from "@/lib/marketingPremiumUi";
import { useMarketingPresentationLight, useMarketingPresVisual } from "./marketingPresentationLightContext";
import { MarketingPdfExport } from "@/components/reports/MarketingPdfExport";

export type { MarketingTab } from "./marketingTypes";

function parsePeriodParam(v: string | null): MarketingPeriodGranularity {
  return v === "quarter" ? "quarter" : "month";
}

function parseObjectIdParam(v: string | null, fallback: string): string {
  const t = v?.trim();
  return t && t.length > 0 ? t : fallback;
}

type Props = {
  modeLabel: string;
  presentation: boolean;
  onBackToBlocks: () => void;
  /** В презентации по маршруту /presentation/marketing/* — какой блок показать. */
  presentationActiveTab?: MarketingTab;
  /** Синхронизация с URL при открытии из пояснения. */
  initialPeriod?: MarketingPeriodGranularity;
  initialObjectId?: string;
  initialPlanScenario?: PlanScenario;
};

export function MarketingWorkspace({
  modeLabel,
  presentation,
  onBackToBlocks,
  presentationActiveTab,
  initialPeriod,
  initialObjectId,
  initialPlanScenario,
}: Props) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const { setMode } = useAppMode();
  const mplLight = useMarketingPresentationLight();
  const presDark = useMarketingPresVisual(presentation) === "presDark";
  const editCtx = useMarketingEditTabOptional();

  const [period, setPeriod] = useState<MarketingPeriodGranularity>(() => {
    const fromUrl = searchParams.get("period");
    if (fromUrl === "quarter" || fromUrl === "month") return fromUrl;
    return initialPeriod ?? "month";
  });
  const [objectId, setObjectId] = useState(() => {
    const fromUrl = searchParams.get("objectId")?.trim();
    if (fromUrl) return fromUrl;
    return initialObjectId ?? "all";
  });

  const activeTab = presentation
    ? (presentationActiveTab ?? "sales")
    : (editCtx?.activeTab ?? "sales");

  const chromeRegistration = useMemo(
    () => ({ modeLabel, presentation, onBackToBlocks }),
    [modeLabel, presentation, onBackToBlocks],
  );
  useRegisterMarketingLayoutChrome(chromeRegistration);

  useEffect(() => {
    if (!presentation) setMode("edit");
  }, [presentation, setMode]);

  useEffect(() => {
    const urlPeriod = parsePeriodParam(searchParams.get("period"));
    const urlObjectId = parseObjectIdParam(searchParams.get("objectId"), "all");
    if (urlPeriod !== period) setPeriod(urlPeriod);
    if (urlObjectId !== objectId) setObjectId(urlObjectId);
  }, [searchParams, period, objectId]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("period", period);
    next.set("objectId", objectId);
    if (presentation) next.delete("dealTypeId");
    const newQs = next.toString();
    if (newQs !== searchParams.toString()) {
      router.replace(newQs ? `${pathname}?${newQs}` : pathname, { scroll: false });
    }
  }, [presentation, period, objectId, pathname, router, searchParams]);

  const outer = "mx-auto w-full min-w-0 max-w-[1400px]";

  const premiumLight = presentation && mplLight && !presDark;

  const contentWell = presDark
    ? "rounded-2xl border border-slate-700/60 bg-[#1e293b]/80 p-4 sm:p-5"
    : premiumLight
      ? `${MPL_PREMIUM_GLASS_MAIN} p-5 sm:p-6`
      : presentation
        ? "rounded-2xl border border-mpl-border bg-mpl-card p-5 sm:p-6"
        : "rounded-2xl border border-slate-200/70 bg-white p-5 sm:p-6 shadow-[0_4px_24px_rgba(15,23,42,0.04)]";

  const pdfReportTitle =
    activeTab === "sales" ? "План продаж" : activeTab === "deals" ? "Сделки" : "Рассрочка ДДУ";

  const panel = (
    <>
      {activeTab === "sales" ? (
        <SalesPlanPanel
          presentation={presentation}
          period={period}
          objectId={objectId}
          initialPlanScenario={initialPlanScenario}
        />
      ) : activeTab === "deals" ? (
        <SalesDealsSection presentation={presentation} period={period} objectId={objectId} />
      ) : (
        <InstallmentDduPanel presentation={presentation} period={period} objectId={objectId} />
      )}
    </>
  );

  return (
    <MarketingDealsFeedProvider>
      <section className={outer}>
        <div className={contentWell}>
          <div
            className="min-w-0 bg-white"
            data-marketing-pdf-export-root={presentation ? true : undefined}
          >
            {panel}
          </div>
          {presentation ? (
            <div className="flex justify-center py-16" data-pdf-exclude>
              <MarketingPdfExport reportTitle={pdfReportTitle} period={period} objectId={objectId} />
            </div>
          ) : null}
        </div>
      </section>
    </MarketingDealsFeedProvider>
  );
}
