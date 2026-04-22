"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, CalendarDays, Handshake, LayoutDashboard, Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { MARKETING_PRESENTATION, marketingPresentationUrl } from "@/lib/marketingPresentationRoutes";
import { SALES_PLAN_SPA } from "@/lib/salesPlanSpaRoutes";
import { useMarketingLayoutChrome } from "@/components/marketing/marketingLayoutChromeContext";
import { useMarketingEditTabOptional } from "@/components/marketing/marketingEditTabContext";
import type { MarketingTab } from "@/components/marketing/marketingTypes";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "gordo-marketing-sidebar-collapsed";

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

function SidebarLabel({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  return (
    <span
      className={`inline-block overflow-hidden whitespace-nowrap transition-all duration-300 ${
        collapsed ? "max-w-0 opacity-0" : "max-w-[220px] opacity-100"
      }`}
    >
      {children}
    </span>
  );
}

function navItemClass(active: boolean, collapsed: boolean) {
  const align = collapsed ? "justify-center gap-0 px-0" : "justify-start gap-3 px-3";
  return `flex w-full items-center rounded-md py-2.5 text-sm font-medium transition-all duration-300 ${align} ${
    active ? "bg-blue-500/10 text-blue-600" : "text-slate-500 hover:bg-slate-100"
  }`;
}

type Props = {
  variant: "presentation" | "edit";
};

function SidebarBottomWorkMode({ variant, collapsed }: { variant: "presentation" | "edit"; collapsed: boolean }) {
  const presentation = variant === "presentation";
  const href = presentation ? "/edit" : SALES_PLAN_SPA.work;
  const label = presentation ? "В рабочий режим" : "Рабочий режим таблицы";

  const linkClass = `flex w-full items-center rounded-lg bg-slate-100 text-sm font-medium text-slate-700 transition-all duration-300 hover:bg-slate-200 ${
    collapsed ? "justify-center px-0 py-2" : "justify-start gap-2 px-3 py-2"
  }`;

  return (
    <div className={`shrink-0 border-t border-slate-200 transition-all duration-300 ${collapsed ? "px-1 py-2" : "p-3"}`}>
      <Link href={href} className={linkClass} title={label}>
        <LayoutDashboard className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
        <SidebarLabel collapsed={collapsed}>
          <span>{label}</span>
        </SidebarLabel>
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

  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    try {
      const v = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
      if (v === null) return;
      setCollapsed(v === "1" || v === "true");
    } catch {
      /* ignore */
    }
  }, []);

  const presentation = variant === "presentation";

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const asideWidth = collapsed ? "w-[64px]" : "w-[240px]";
  const topPad = collapsed ? "px-1 pt-2" : "px-3 pt-2";

  return (
    <aside
      className={`flex h-full shrink-0 flex-col justify-between overflow-hidden border-r border-slate-200 bg-slate-50 transition-all duration-300 ${asideWidth}`}
      aria-label="Навигация маркетинга"
    >
      <div className={`min-h-0 flex-1 overflow-hidden transition-all duration-300 ${topPad}`}>
        <div className="flex flex-col gap-3">
          <div className={`flex w-full transition-all duration-300 ${collapsed ? "justify-center" : "justify-start"}`}>
            <button
              type="button"
              onClick={toggleCollapsed}
              className="rounded-md p-2 text-slate-600 transition-colors hover:bg-slate-100"
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Развернуть боковое меню" : "Свернуть боковое меню"}
            >
              <Menu className="h-5 w-5 shrink-0" aria-hidden />
            </button>
          </div>

          {chrome ? (
            <>
              <button
                type="button"
                onClick={() => chrome.onBackToBlocks()}
                title="К блокам"
                className={`flex w-full items-center rounded-md py-2 text-sm font-medium text-slate-700 transition-all duration-300 hover:bg-slate-100 ${
                  collapsed ? "justify-center px-0" : "justify-start gap-2 px-3"
                }`}
              >
                <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
                <SidebarLabel collapsed={collapsed}>
                  <span>К блокам</span>
                </SidebarLabel>
              </button>
              <p
                className={`border-b border-slate-200 pb-3 text-xs leading-snug text-slate-500 transition-all duration-300 ${
                  collapsed ? "max-h-0 overflow-hidden border-transparent py-0 opacity-0" : "max-h-24 px-1 opacity-100"
                }`}
              >
                <span className="font-medium text-slate-700">{chrome.modeLabel}</span>
                <span className="text-slate-400"> → </span>
                <span>Маркетинг</span>
              </p>
            </>
          ) : (
            <div
              className={`animate-pulse rounded-md bg-slate-100 transition-all duration-300 ${collapsed ? "mx-auto h-10 w-8" : "h-16 w-full"}`}
              aria-hidden
            />
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
                  title={item.label}
                  onClick={() => {
                    if (presentation) {
                      router.push(marketingPresentationUrl(item.href, searchParams), { scroll: false });
                    } else if (editCtx) {
                      editCtx.setActiveTab(item.tab);
                    }
                  }}
                  className={navItemClass(active, collapsed)}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <SidebarLabel collapsed={collapsed}>
                    <span>{item.label}</span>
                  </SidebarLabel>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <SidebarBottomWorkMode variant={variant} collapsed={collapsed} />
    </aside>
  );
}
