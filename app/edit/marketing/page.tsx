"use client";

import { useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { EditLayout } from "@/components/EditLayout";
import { MarketingWorkspace } from "@/components/marketing/MarketingWorkspace";
import { useMarketingEditTab } from "@/components/marketing/marketingEditTabContext";
import type { MarketingTab } from "@/components/marketing/marketingTypes";

function isMarketingTab(v: string | null): v is MarketingTab {
  return v === "sales" || v === "deals" || v === "installment";
}

export default function EditMarketingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setActiveTab } = useMarketingEditTab();

  useEffect(() => {
    const t = searchParams.get("tab");
    if (isMarketingTab(t)) setActiveTab(t);
  }, [searchParams, setActiveTab]);

  const onBackToBlocks = useCallback(() => {
    router.push("/edit");
  }, [router]);

  return (
    <div className="min-h-0 min-w-0 bg-slate-50 px-3 py-4 sm:px-4 md:p-6">
      <EditLayout showTitle={false} showActions={false}>
        <MarketingWorkspace presentation={false} modeLabel="Редактирование" onBackToBlocks={onBackToBlocks} />
      </EditLayout>
    </div>
  );
}
