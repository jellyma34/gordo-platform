"use client";

import type { ReactNode } from "react";
import { Building2, FileText, Menu, MonitorPlay, Package, PencilLine, ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/components/auth/AuthProvider";
import { useConstructionLayoutChrome } from "@/components/construction/constructionLayoutChromeContext";
import { canAccessConstructionSection, type UiConstructionSection } from "@/lib/auth";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "gordo-construction-sidebar-collapsed";

const constructionMenu: {
  id: string;
  section: UiConstructionSection;
  label: string;
  icon: typeof Building2;
}[] = [
  { id: "gpr", section: "gpr", label: "ГПР", icon: Building2 },
  { id: "tenders", section: "tenders", label: "Тендеры", icon: FileText },
  { id: "tmc", section: "tmc", label: "ТМЦ", icon: Package },
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

function navItemClassDark(active: boolean, collapsed: boolean) {
  const align = collapsed ? "justify-center gap-0 px-0" : "justify-start gap-3 px-3";
  return `flex w-full items-center rounded-md py-2.5 text-sm font-medium transition-all duration-300 ${align} ${
    active
      ? "bg-white/[0.08] text-slate-100 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
      : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
  }`;
}

export function ConstructionAppSidebar() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const chrome = useConstructionLayoutChrome();
  const { role, allowedSections } = useAuth();

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

  const allowedApi = Array.isArray(allowedSections) ? allowedSections : [];
  const showSection = (ui: UiConstructionSection) =>
    role ? canAccessConstructionSection(role, allowedApi, ui) : false;

  const partId = searchParams.get("partId") === "2" ? 2 : 1;
  const sectionParam = searchParams.get("section");
  const resolvedSection: UiConstructionSection =
    sectionParam === "tenders" || sectionParam === "tmc" || sectionParam === "gpr" ? sectionParam : "gpr";

  const goSection = (ui: UiConstructionSection) => {
    router.replace(`/presentation/construction?section=${ui}&partId=${partId}`, { scroll: false });
  };

  const asideWidth = collapsed ? "w-[64px]" : "w-[240px]";
  const topPad = collapsed ? "px-1 pt-2" : "px-3 pt-2";

  return (
    <aside
      className={`sticky top-0 flex h-full min-h-0 shrink-0 flex-col justify-between self-stretch overflow-hidden border-r border-white/[0.08] bg-[#0c1220] transition-all duration-300 ${asideWidth}`}
      aria-label="Навигация строительства"
    >
      <div className={`min-h-0 flex-1 overflow-hidden transition-all duration-300 ${topPad}`}>
        <div className="flex flex-col gap-3">
          <div className={`flex w-full transition-all duration-300 ${collapsed ? "justify-center" : "justify-start"}`}>
            <button
              type="button"
              onClick={toggleCollapsed}
              className="rounded-md p-2 text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
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
                className={`flex w-full items-center rounded-md py-2 text-sm font-medium text-slate-300 transition-all duration-300 hover:bg-white/[0.05] hover:text-slate-100 ${
                  collapsed ? "justify-center px-0" : "justify-start gap-2 px-3"
                }`}
              >
                <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
                <SidebarLabel collapsed={collapsed}>
                  <span>К блокам</span>
                </SidebarLabel>
              </button>
              <p
                className={`border-b border-white/[0.08] pb-3 text-xs leading-snug text-slate-500 transition-all duration-300 ${
                  collapsed ? "max-h-0 overflow-hidden border-transparent py-0 opacity-0" : "max-h-24 px-1 opacity-100"
                }`}
              >
                <span className="font-medium text-slate-300">{chrome.modeLabel}</span>
                <span className="text-slate-600"> → </span>
                <span className="text-slate-400">Строительство</span>
              </p>
            </>
          ) : (
            <div
              className={`animate-pulse rounded-md bg-white/[0.06] transition-all duration-300 ${collapsed ? "mx-auto h-10 w-8" : "h-16 w-full"}`}
              aria-hidden
            />
          )}

          <nav className="flex flex-col gap-1" aria-label="Разделы строительства">
            {constructionMenu.map((item) => {
              if (!showSection(item.section)) return null;
              const Icon = item.icon;
              const active = pathname.startsWith("/presentation/construction") && resolvedSection === item.section;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={item.label}
                  onClick={() => goSection(item.section)}
                  className={navItemClassDark(active, collapsed)}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                  <SidebarLabel collapsed={collapsed}>
                    <span>{item.label}</span>
                  </SidebarLabel>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <div
        className={`flex shrink-0 flex-col gap-1 border-t border-white/[0.08] transition-all duration-300 ${
          collapsed ? "px-1 pt-2 pb-20" : "px-3 pt-3 pb-20"
        }`}
      >
        <div
          className={`flex w-full items-center rounded-lg bg-white/[0.06] text-sm font-medium text-slate-200 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] ${
            collapsed ? "justify-center gap-0 px-0 py-2" : "justify-start gap-2 px-3 py-2"
          }`}
          title="Презентация"
          aria-current="page"
        >
          <MonitorPlay className="h-4 w-4 shrink-0" aria-hidden />
          <SidebarLabel collapsed={collapsed}>
            <span>Презентация</span>
          </SidebarLabel>
        </div>

        <Link
          href={`/edit/construction?section=${resolvedSection}&partId=${partId}`}
          className={`flex w-full items-center rounded-lg border border-transparent text-sm font-medium text-slate-400 transition-all duration-300 hover:bg-white/[0.05] hover:text-slate-200 ${
            collapsed ? "justify-center gap-0 px-0 py-2" : "justify-start gap-2 px-3 py-2"
          }`}
          title="Редактирование"
        >
          <PencilLine className="h-4 w-4 shrink-0" aria-hidden />
          <SidebarLabel collapsed={collapsed}>
            <span>Редактирование</span>
          </SidebarLabel>
        </Link>
      </div>
    </aside>
  );
}
