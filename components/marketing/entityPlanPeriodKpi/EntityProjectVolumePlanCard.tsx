"use client";

import { numFmt } from "@/lib/salesPlanChartFormat";

import { DDU_REVENUE_PREMIUM_KPI_UI } from "./EntityPlanPeriodKpiCards";

type Props = {
  rub: number;
  caption?: string;
  subtitle?: string;
  presDark: boolean;
  skeleton?: boolean;
};

function BuildingWatermark({ presDark }: { presDark: boolean }) {
  const stroke = presDark ? "rgba(148,163,184,0.12)" : "rgba(15,23,42,0.08)";
  return (
    <svg
      className="pointer-events-none absolute bottom-2 right-2 h-[64px] w-[52px]"
      viewBox="0 0 72 88"
      fill="none"
      aria-hidden
      style={{ opacity: presDark ? 0.06 : 0.04 }}
    >
      <path
        d="M8 82V28l12-8 12 8v54M32 82V40l12-8 12 8v42M56 82V52l8-6 8 6v30"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 48h4M14 58h4M38 56h4M38 66h4M58 62h4M58 72h4" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Карточка «План проекта» в premium-сетке KPI (DDU / стоимость проекта). */
export function EntityProjectVolumePlanCard({
  rub,
  caption = "План проекта",
  subtitle = "Общий план продаж",
  presDark,
  skeleton = false,
}: Props) {
  if (!skeleton && (!Number.isFinite(rub) || rub <= 0)) return null;

  const UI = DDU_REVENUE_PREMIUM_KPI_UI;
  const surface = presDark
    ? { minHeight: UI.cardMinHeight, padding: UI.cardPadding }
    : {
        background: "#FFFFFF",
        border: UI.cardBorder,
        borderRadius: UI.cardRadius,
        boxShadow: UI.cardShadow,
        minHeight: UI.cardMinHeight,
        padding: UI.cardPadding,
      };

  return (
    <div
      className={`group relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden ${presDark ? "rounded-[20px] border border-white/10 bg-slate-900/50" : ""} ${skeleton ? "" : "transition-all duration-[250ms] ease hover:-translate-y-[1px]"}`}
      style={presDark ? { minHeight: surface.minHeight, padding: surface.padding } : surface}
      onMouseEnter={
        presDark || skeleton
          ? undefined
          : (e) => {
              (e.currentTarget as HTMLDivElement).style.boxShadow =
                "0 6px 28px rgba(15,23,42,0.08)";
            }
      }
      onMouseLeave={
        presDark || skeleton
          ? undefined
          : (e) => {
              (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 20px rgba(15,23,42,0.04)";
            }
      }
    >
      <BuildingWatermark presDark={presDark} />
      <div className="relative z-[1] flex min-h-0 flex-1 flex-col items-center justify-center px-2 py-1.5 text-center">
        <span
          className={`text-[10px] font-semibold leading-tight ${presDark ? "text-slate-400" : "text-[#64748B]"}`}
          style={{ letterSpacing: "0.02em" }}
        >
          {caption}
        </span>
        {skeleton ? (
          <div className={`mt-2 h-7 w-4/5 animate-pulse rounded-md ${presDark ? "bg-white/[0.08]" : "bg-slate-200/60"}`} />
        ) : (
          <>
            <p
              className={`mt-1.5 tabular-nums leading-[1.12] tracking-tight ${presDark ? "text-slate-50" : "text-slate-900"}`}
              style={{ fontSize: "clamp(1rem, 1.35vw, 1.25rem)", fontWeight: 700 }}
            >
              {numFmt.format(Math.round(rub))}{" "}
              <span className="text-[0.72em] font-semibold">₽</span>
            </p>
            <p className={`mt-1.5 text-[11px] font-medium leading-snug ${presDark ? "text-slate-500" : "text-[#64748B]"}`}>
              {subtitle}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
