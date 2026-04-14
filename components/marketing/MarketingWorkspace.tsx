"use client";

import Link from "next/link";
import { useState } from "react";

import { marketingMockData } from "@/lib/marketingMockData";
import { InstallmentDduPanel } from "./InstallmentDduPanel";
import { MarketingFilters, type MarketingPeriodGranularity } from "./MarketingFilters";
import { SalesPlanPanel } from "./SalesPlanPanel";

type MarketingTab = "sales" | "installment";

type Props = {
  modeLabel: string;
  presentation: boolean;
  onBackToBlocks: () => void;
};

function TabButton({
  active,
  onClick,
  children,
  presentation,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  presentation: boolean;
}) {
  if (presentation) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
          active ? "bg-slate-50 text-slate-900 shadow" : "bg-white/5 text-slate-200 hover:bg-white/10"
        }`}
      >
        {children}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        active ? "bg-slate-900 text-white shadow" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

export function MarketingWorkspace({ modeLabel, presentation, onBackToBlocks }: Props) {
  const [tab, setTab] = useState<MarketingTab>("sales");
  const [period, setPeriod] = useState<MarketingPeriodGranularity>("month");
  const [objectId, setObjectId] = useState("all");
  const [dealTypeId, setDealTypeId] = useState("all");

  const outer = presentation
    ? "mx-auto w-full min-w-0 max-w-[1400px] space-y-6"
    : "mx-auto w-full min-w-0 max-w-[1400px] space-y-6";

  const headerCard = presentation
    ? "rounded-2xl border border-slate-700/60 bg-[#1e293b] p-3 shadow-sm sm:p-4"
    : "rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4";

  const titleCls = presentation ? "font-semibold text-slate-50" : "font-semibold text-slate-900";
  const crumbCls = presentation ? "text-sm text-slate-300" : "text-sm text-slate-600";

  return (
    <section className={outer}>
      <div className={headerCard}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBackToBlocks}
            className={
              presentation
                ? "inline-flex rounded-lg border border-slate-600/70 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10"
                : "inline-flex rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            }
          >
            ← К блокам
          </button>
          <div className="min-w-0 max-w-full text-right text-sm">
            <span className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 break-words ${crumbCls}`}>
              <span className={titleCls}>{modeLabel}</span>
              <span className={presentation ? "text-slate-500" : "text-slate-400"}>→</span>
              <span className={presentation ? "text-slate-200" : "text-slate-800"}>Маркетинг</span>
            </span>
          </div>
        </div>

        <div
          className={
            presentation
              ? "mt-4 flex flex-wrap items-center gap-2 border-t border-slate-600/40 pt-4"
              : "mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4"
          }
        >
          <TabButton presentation={presentation} active={tab === "sales"} onClick={() => setTab("sales")}>
            План продаж
          </TabButton>
          <TabButton
            presentation={presentation}
            active={tab === "installment"}
            onClick={() => setTab("installment")}
          >
            Рассрочка ДДУ
          </TabButton>
          {!presentation ? (
            <Link
              href="/marketing/plan/edit"
              className="ml-auto inline-flex rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
            >
              Рабочий режим таблицы
            </Link>
          ) : null}
        </div>
      </div>

      <div
        className={
          presentation
            ? "rounded-2xl border border-slate-700/60 bg-[#1e293b]/80 p-4 sm:p-5"
            : "rounded-xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5"
        }
      >
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
          {tab === "sales" ? (
            <SalesPlanPanel
              presentation={presentation}
              period={period}
              objectId={objectId}
              dealTypeId={dealTypeId}
            />
          ) : (
            <InstallmentDduPanel presentation={presentation} period={period} objectId={objectId} />
          )}
        </div>
      </div>
    </section>
  );
}
