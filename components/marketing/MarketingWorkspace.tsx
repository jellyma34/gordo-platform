"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { marketingMockData } from "@/lib/marketingMockData";
import { InstallmentDduPanel } from "./InstallmentDduPanel";
import { MarketingFilters, type MarketingPeriodGranularity } from "./MarketingFilters";
import { MarketingPresentationTabs } from "./MarketingPresentationTabs";
import { SalesDealsSection } from "./SalesDealsSection";
import { SalesPlanPanel, type PlanScenario } from "./SalesPlanPanel";
import { MPL_PREMIUM_GLASS_HEADER, MPL_PREMIUM_GLASS_MAIN } from "@/lib/marketingPremiumUi";
import { SALES_PLAN_SPA } from "@/lib/salesPlanSpaRoutes";
import { useMarketingPresentationLight, useMarketingPresVisual } from "./marketingPresentationLightContext";
import { segmentedControlTabClass, type SegmentedControlSurface } from "./marketingSegmentedControlClasses";

export type MarketingTab = "sales" | "deals" | "installment";

type Props = {
  modeLabel: string;
  presentation: boolean;
  onBackToBlocks: () => void;
  /** В презентации по маршруту /presentation/marketing/* — какой блок показать. */
  presentationActiveTab?: MarketingTab;
  /** Синхронизация с URL при открытии из пояснения. */
  initialPeriod?: MarketingPeriodGranularity;
  initialObjectId?: string;
  initialDealTypeId?: string;
  initialPlanScenario?: PlanScenario;
};

function TabButton({
  active,
  onClick,
  children,
  surface,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  surface: SegmentedControlSurface;
}) {
  return (
    <button type="button" onClick={onClick} className={segmentedControlTabClass(active, surface)}>
      {children}
    </button>
  );
}

export function MarketingWorkspace({
  modeLabel,
  presentation,
  onBackToBlocks,
  presentationActiveTab,
  initialPeriod,
  initialObjectId,
  initialDealTypeId,
  initialPlanScenario,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mplLight = useMarketingPresentationLight();
  const presDark = useMarketingPresVisual(presentation) === "presDark";

  const [editTab, setEditTab] = useState<MarketingTab>("sales");
  const [period, setPeriod] = useState<MarketingPeriodGranularity>(initialPeriod ?? "month");
  const [objectId, setObjectId] = useState(initialObjectId ?? "all");
  const [dealTypeId, setDealTypeId] = useState(initialDealTypeId ?? "all");

  const activeTab = presentation ? (presentationActiveTab ?? "sales") : editTab;

  useEffect(() => {
    if (!presentation) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set("period", period);
    next.set("objectId", objectId);
    next.set("dealTypeId", dealTypeId);
    const newQs = next.toString();
    if (newQs !== searchParams.toString()) {
      router.replace(newQs ? `${pathname}?${newQs}` : pathname, { scroll: false });
    }
  }, [presentation, period, objectId, dealTypeId, pathname, router, searchParams]);

  const outer = "mx-auto w-full min-w-0 max-w-[1400px] space-y-6";

  const premiumLight = presentation && mplLight && !presDark;

  const headerCard = presDark
    ? "rounded-2xl border border-slate-700/60 bg-[#1e293b] p-3 shadow-sm sm:p-4"
    : premiumLight
      ? `${MPL_PREMIUM_GLASS_HEADER} p-3 sm:p-4`
      : presentation
        ? "rounded-2xl border border-mpl-border bg-mpl-card p-3 shadow-sm sm:p-4"
        : "rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4";

  const titleCls = presDark ? "font-semibold text-slate-50" : "font-semibold text-mpl-text";
  const crumbCls = presDark ? "text-sm text-slate-300" : presentation ? "text-sm text-mpl-muted" : "text-sm text-slate-600";

  const backBtn =
    presDark
      ? "inline-flex rounded-lg border border-slate-600/70 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10"
      : premiumLight
        ? "inline-flex rounded-xl border border-black/[0.05] bg-white/60 px-4 py-2 text-sm font-medium text-[#2563eb] shadow-[0_4px_14px_rgba(37,99,235,0.12)] hover:bg-white/85"
        : presentation
          ? "inline-flex rounded-lg border border-mpl-border bg-white px-4 py-2 text-sm font-medium text-mpl-primary hover:bg-slate-50"
          : "inline-flex rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50";

  const tabsDivider = presDark
    ? "mt-4 flex flex-wrap items-center gap-2 border-t border-slate-600/40 pt-4"
    : premiumLight
      ? "mt-4 flex flex-wrap items-center gap-2 border-t border-black/[0.05] pt-4"
      : "mt-4 flex flex-wrap items-center gap-2 border-t border-mpl-border pt-4";

  const editTabSurface: SegmentedControlSurface = "light";

  const filterWell = presDark
    ? "rounded-2xl border border-slate-700/60 bg-[#1e293b]/80 p-4 sm:p-5"
    : premiumLight
      ? `${MPL_PREMIUM_GLASS_MAIN} p-4 sm:p-5`
      : presentation
        ? "rounded-2xl border border-mpl-border bg-mpl-card p-4 sm:p-5"
        : "rounded-xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5";

  return (
    <section className={outer}>
      <div className={headerCard}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onBackToBlocks} className={backBtn}>
            ← К блокам
          </button>
          <div className="min-w-0 max-w-full text-right text-sm">
            <span className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 break-words ${crumbCls}`}>
              <span className={titleCls}>{modeLabel}</span>
              <span className={presDark ? "text-slate-500" : mplLight ? "text-mpl-muted" : "text-slate-400"}>→</span>
              <span className={presDark ? "text-slate-200" : mplLight ? "text-mpl-text" : "text-slate-800"}>Маркетинг</span>
            </span>
          </div>
        </div>

        <div className={tabsDivider}>
          {presentation ? (
            <MarketingPresentationTabs />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <TabButton surface={editTabSurface} active={editTab === "sales"} onClick={() => setEditTab("sales")}>
                План продаж
              </TabButton>
              <TabButton surface={editTabSurface} active={editTab === "deals"} onClick={() => setEditTab("deals")}>
                Сделки
              </TabButton>
              <TabButton surface={editTabSurface} active={editTab === "installment"} onClick={() => setEditTab("installment")}>
                Рассрочка ДДУ
              </TabButton>
            </div>
          )}
          {!presentation ? (
            <Link
              href={SALES_PLAN_SPA.work}
              className="ml-auto inline-flex rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
            >
              Рабочий режим таблицы
            </Link>
          ) : null}
        </div>
      </div>

      <div className={filterWell}>
        <MarketingFilters
          presentation={presentation}
          period={period}
          onPeriodChange={setPeriod}
          objectId={objectId}
          onObjectIdChange={setObjectId}
          dealTypeId={dealTypeId}
          onDealTypeIdChange={setDealTypeId}
          objects={marketingMockData.objects}
          dealTypes={marketingMockData.dealTypes}
        />

        <div className="mt-5 min-w-0">
          {activeTab === "sales" ? (
            <SalesPlanPanel
              presentation={presentation}
              period={period}
              objectId={objectId}
              dealTypeId={dealTypeId}
              initialPlanScenario={initialPlanScenario}
            />
          ) : activeTab === "deals" ? (
            <SalesDealsSection presentation={presentation} period={period} objectId={objectId} dealTypeId={dealTypeId} />
          ) : (
            <InstallmentDduPanel presentation={presentation} period={period} objectId={objectId} />
          )}
        </div>
      </div>
    </section>
  );
}
