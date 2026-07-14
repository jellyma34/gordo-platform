"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

import { useRegisterConstructionLayoutChrome } from "@/components/construction/constructionLayoutChromeContext";
import { FinanceSection } from "@/components/finance/FinanceSection";
import { useAppMode } from "@/components/mode/ModeProvider";

const FILTER_WELL = "rounded-2xl border border-slate-700/60 bg-[#1e293b]/80 p-4 sm:p-5";

export default function PresentationFinancePage() {
  const { setMode } = useAppMode();
  const router = useRouter();

  useEffect(() => {
    setMode("presentation");
  }, [setMode]);

  const chromeRegistration = useMemo(
    () => ({
      modeLabel: "Презентация",
      sectionLabel: "Экономика и финансы",
      onBackToBlocks: () => router.push("/presentation"),
    }),
    [router],
  );
  useRegisterConstructionLayoutChrome(chromeRegistration);

  return (
    <section className="w-full min-w-0 text-[13px] leading-normal">
      <div className="mx-auto w-full min-w-0 max-w-[1400px]">
        <div className={FILTER_WELL}>
          <div className="min-w-0 space-y-4">
            <FinanceSection />
          </div>
        </div>
      </div>
    </section>
  );
}
