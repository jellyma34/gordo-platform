"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

import { EditLayout } from "@/components/EditLayout";
import { DealsSection } from "@/components/marketing/DealsSection";
import { InstallmentsSection } from "@/components/marketing/InstallmentsSection";
import { SalesPlanWorkMode, type SalesPlanWorkModeHandle } from "@/components/marketing/SalesPlanWorkMode";
import { useMarketingEditTab } from "@/components/marketing/marketingEditTabContext";
import type { MarketingTab } from "@/components/marketing/marketingTypes";

function isMarketingTab(v: string | null): v is MarketingTab {
  return v === "sales" || v === "deals" || v === "installment";
}

export default function MarketingSalesPlanWorkPage() {
  const workRef = useRef<SalesPlanWorkModeHandle>(null);
  const { activeTab, setActiveTab } = useMarketingEditTab();
  const searchParams = useSearchParams();

  useEffect(() => {
    const t = searchParams.get("tab");
    if (isMarketingTab(t)) setActiveTab(t);
  }, [searchParams, setActiveTab]);

  const showPlanActions = activeTab === "sales";

  return (
    <div className="min-h-0 min-w-0 bg-slate-50 px-3 py-4 sm:px-4 md:p-6">
      <EditLayout
        showTitle={false}
        showActions={showPlanActions}
        onSave={() => workRef.current?.save() ?? Promise.resolve()}
        onCancel={() => workRef.current?.cancel()}
      >
        {activeTab === "sales" ? (
          <SalesPlanWorkMode ref={workRef} hideSectionTabs hideInlineSave />
        ) : activeTab === "deals" ? (
          <DealsSection mode="work" />
        ) : (
          <InstallmentsSection />
        )}
      </EditLayout>
    </div>
  );
}
