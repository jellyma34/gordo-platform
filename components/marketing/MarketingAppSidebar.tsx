"use client";

import Link from "next/link";
import { BarChart3, CalendarDays, Handshake, LayoutDashboard } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { MARKETING_PRESENTATION, marketingPresentationUrl } from "@/lib/marketingPresentationRoutes";
import { SALES_PLAN_SPA } from "@/lib/salesPlanSpaRoutes";
import { useMarketingLayoutChrome } from "@/components/marketing/marketingLayoutChromeContext";
import { useMarketingEditTabOptional } from "@/components/marketing/marketingEditTabContext";
import type { MarketingTab } from "@/components/marketing/marketingTypes";

const marketingMenu: {
  id: string;
  tab: MarketingTab;
  label: string;
  icon: typeof BarChart3;
  href: (typeof MARKETING_PRESENTATION)[keyof typeof MARKETING_PRESENTATION];
}[] = [
  { id: "sales-plan", tab: "sales", label: "План продаж", icon: BarChart3, href: MARKETING_PRESENTATION.salesPlan },
  { id: "deals", tab: "deals", label: "Сделки", icon: Handshake, href: MARKETING_PRESENTATION.deals },
  { id: "installments", tab: "installment", label: "Рассрочка ДДУ", icon: CalendarDays, href: MARKETING_PRESENTATION.installments },
];

const itemBase =
  "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium transition";

function itemClass(active: boolean) {
  return `${itemBase} ${
    active ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
  }`;
}

const workModeBtnClass =
  "flex w-full items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-200";

type Props = {
  variant: "presentation" | "edit";
};

function SidebarBottomWorkMode({ variant }: { variant: "presentation" | "edit" }) {
  const presentation = variant === "presentation";
  const href = presentation ? "/edit" : SALES_PLAN_SPA.work;
  const label = presentation ? "В рабочий режим" : "Рабочий режим таблицы";

  return (
    <div className="shrink-0 border-t border-slate-200 p-3">
      <Link href={href} className={workModeBtnClass}>
        <LayoutDashboard className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
        <span>{label}</span>
      </Link>
    </div>
  );
}

export function MarketingAppSidebar({ variant }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const chrome = useMarketingLayoutChrome();
  const editCtx = useMarketingEditTabOptional();

  const presentation = variant === "presentation";

  return (
    <aside
      className="sticky top-0 flex h-screen w-[240px] shrink-0 flex-col border-r border-slate-200 bg-slate-50"
      aria-label="Навигация маркетинга"
    >
      <div className="flex min-h-0 w-full flex-1 flex-col justify-between">
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="flex flex-col gap-4">
            {chrome ? (
              <>
                <button
                  type="button"
                  onClick={() => chrome.onBackToBlocks()}
                  className="rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  ← К блокам
                </button>
                <p className="border-b border-slate-200 px-1 pb-3 text-xs leading-snug text-slate-500">
                  <span className="font-medium text-slate-700">{chrome.modeLabel}</span>
                  <span className="text-slate-400"> → </span>
                  <span>Маркетинг</span>
                </p>
              </>
            ) : (
              <div className="h-16 animate-pulse rounded-md bg-slate-100" aria-hidden />
            )}

            <nav className="flex flex-col gap-1">
              {marketingMenu.map((item) => {
                const Icon = item.icon;
                const active = presentation
                  ? pathname === item.href || pathname.startsWith(`${item.href}/`)
                  : editCtx
                    ? editCtx.activeTab === item.tab
                    : false;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (presentation) {
                        router.push(marketingPresentationUrl(item.href, searchParams), { scroll: false });
                      } else if (editCtx) {
                        editCtx.setActiveTab(item.tab);
                      }
                    }}
                    className={itemClass(active)}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        <SidebarBottomWorkMode variant={variant} />
      </div>
    </aside>
  );
}
