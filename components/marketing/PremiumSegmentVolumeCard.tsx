"use client";

import type { DealSegmentKey } from "@/components/marketing/DealsSection";
import { PremiumSegmentIllustration } from "@/components/marketing/PremiumSegmentIllustration";
import { DDU_REVENUE_PREMIUM_KPI_UI } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiCards";
import { numFmt } from "@/lib/salesPlanChartFormat";

type BaseProps = {
  illustrationSegment: DealSegmentKey;
  caption?: string;
  subtitle?: string;
  presDark: boolean;
  skeleton?: boolean;
};

type CurrencyProps = BaseProps & {
  mode?: "currency";
  rub: number;
};

type UnitsProps = BaseProps & {
  mode: "units";
  count: number;
  unit: string;
};

export type PremiumSegmentVolumeCardProps = CurrencyProps | UnitsProps;

/** Premium rail: illustration + «План проекта» / объём сущности (как у квартир в ДДУ). */
export function PremiumSegmentVolumeCard(props: PremiumSegmentVolumeCardProps) {
  const {
    illustrationSegment,
    caption = "План проекта",
    subtitle = "Общий план продаж",
    presDark,
    skeleton = false,
  } = props;

  const hasValue =
    props.mode === "units"
      ? Number.isFinite(props.count) && props.count > 0
      : Number.isFinite(props.rub) && props.rub > 0;

  if (!skeleton && !hasValue) return null;

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
              (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 28px rgba(15,23,42,0.08)";
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
      <div className="relative z-[1] flex min-h-0 flex-1 flex-col items-center justify-center px-2 py-2">
        {skeleton ? (
          <div
            className={`aspect-square h-24 w-24 shrink-0 animate-pulse rounded-full ${presDark ? "bg-white/[0.08]" : "bg-[#F3F6FF]"}`}
            aria-hidden
          />
        ) : (
          <PremiumSegmentIllustration segment={illustrationSegment} />
        )}

        <div className="mt-6 w-full min-w-0 text-center">
          <div
            className={`text-[10px] font-semibold leading-tight ${presDark ? "text-slate-400" : "text-[#64748B]"}`}
            style={{ letterSpacing: "0.02em" }}
          >
            {caption}
          </div>
          {skeleton ? (
            <div
              className={`mx-auto mt-2 h-7 w-4/5 animate-pulse rounded-md ${presDark ? "bg-white/[0.08]" : "bg-slate-200/60"}`}
            />
          ) : props.mode === "units" ? (
            <>
              <p
                className={`mt-1.5 tabular-nums leading-[1.12] tracking-tight ${presDark ? "text-slate-50" : "text-slate-900"}`}
                style={{ fontSize: "clamp(1rem, 1.35vw, 1.25rem)", fontWeight: 700 }}
              >
                {numFmt.format(Math.round(props.count))}{" "}
                <span className="text-[0.72em] font-semibold">{props.unit}</span>
              </p>
              <p className={`mt-1.5 text-[11px] font-medium leading-snug ${presDark ? "text-slate-500" : "text-[#64748B]"}`}>
                {subtitle}
              </p>
            </>
          ) : (
            <>
              <p
                className={`mt-1.5 tabular-nums leading-[1.12] tracking-tight ${presDark ? "text-slate-50" : "text-slate-900"}`}
                style={{ fontSize: "clamp(1rem, 1.35vw, 1.25rem)", fontWeight: 700 }}
              >
                {numFmt.format(Math.round(props.rub))}{" "}
                <span className="text-[0.72em] font-semibold">₽</span>
              </p>
              <p className={`mt-1.5 text-[11px] font-medium leading-snug ${presDark ? "text-slate-500" : "text-[#64748B]"}`}>
                {subtitle}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Illustration card в premium-сетке KPI (alias). */
export { PremiumSegmentVolumeCard as PremiumSegmentIllustrationCard };
