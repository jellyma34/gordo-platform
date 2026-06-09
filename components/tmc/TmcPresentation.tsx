"use client";

import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { CalendarDays, ShoppingCart, Wallet } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { listTmcFromDb } from "@/lib/constructionApi";
import { isGprLocalStorageMode } from "@/lib/gprStorageMode";
import { getGprProjectId, loadPersistedTmcItems } from "@/lib/tmcImportPersistence";
import { AnalyticsLegendItem, AnalyticsLegendList } from "@/components/construction/AnalyticsLegendItem";
import { TmcMaterialCostDynamicsChart } from "@/components/tmc/TmcMaterialCostDynamicsChart";
import { TmcMaterialPlanFactChart } from "@/components/tmc/TmcMaterialPlanFactChart";
import { TmcProcurementDynamicsChart } from "@/components/tmc/TmcProcurementDynamicsChart";
import { TmcVolumeDynamicsChart } from "@/components/tmc/TmcVolumeDynamicsChart";
import { segmentedControlTabClass } from "@/components/marketing/marketingSegmentedControlClasses";
import { partIdToProjectPartKey, type ConstructionObjectScope } from "@/lib/gprUtils";
import {
  buildTmcMonthlyProcurementSeries,
  computeTmcProcurementKpi,
  computeTmcProcurementFinancialResult,
  computeTmcMaterialPlanFact,
  computeTmcMaterialCostDynamics,
  computeTmcVolumeDynamics,
  type TmcMaterialPlanFactMode,
  enrichTmcItems,
  fillTmcMonthlyProcurementTimeline,
  isTmcOverduePosition,
  tmcItemFactCostRub,
} from "@/lib/tmcPresentationAnalytics";

const tmcLocalMode = isGprLocalStorageMode();

const COLORS = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
  gray: "#6b7280",
  card: "#1e293b",
  plan: "#94a3b8",
  blue: "#3b82f6",
} as const;

type ChartMode = "monthly" | "cumulative";

type MaterialChartMode = TmcMaterialPlanFactMode;

/** Сумма для KPI первой карточки ТМЦ — без символа ₽. */
function rubKpiAmount(value: number): string {
  const formatted = new Intl.NumberFormat("ru-RU").format(Math.round(Math.abs(value)));
  if (value < 0) return `−${formatted}`;
  return formatted;
}

/** Сумма отклонения: − / + / 0. */
function rubKpiSignedAmount(value: number): string {
  if (value === 0) return "0";
  const formatted = new Intl.NumberFormat("ru-RU").format(Math.round(Math.abs(value)));
  if (value < 0) return `−${formatted}`;
  return `+${formatted}`;
}

function pct1(n: number): string {
  return `${n.toFixed(1).replace(".", ",")}%`;
}

function pctSigned1(n: number): string {
  const formatted = Math.abs(n).toFixed(1).replace(".", ",");
  if (n < 0) return `−${formatted}%`;
  if (n > 0) return `+${formatted}%`;
  return `${formatted}%`;
}

/** Отображение отклонения: факт поступлений − план закупок (без изменения KPI в analytics). */
function computeTmcReceiptDeviationDisplay(planPurchase: number, factReceived: number) {
  const deviationAmount = factReceived - planPurchase;
  const deviationPercent =
    planPurchase > 0 ? Math.round((deviationAmount / planPurchase) * 1000) / 10 : null;
  return { deviationAmount, deviationPercent };
}

function TmcKpiDivider() {
  return <div className="border-t border-slate-600/35" />;
}

function TmcKpiLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{children}</div>
  );
}

type TmcKpiMetricTier = "primary" | "supporting" | "secondary" | "tertiary" | "deviation";

function TmcKpiMetricBlock({
  label,
  value,
  tier,
  accentColor,
  valueClassName,
  sectionPt = "pt-4",
}: {
  label: string;
  value: string;
  tier: TmcKpiMetricTier;
  accentColor?: string;
  valueClassName?: string;
  sectionPt?: string;
}) {
  const labelClass =
    tier === "primary"
      ? "flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-300"
      : tier === "supporting" || tier === "secondary"
        ? "text-[10px] font-medium uppercase tracking-wider text-slate-500"
        : "text-[10px] font-medium uppercase tracking-wider text-slate-500/70";

  const valueClass =
    tier === "primary"
      ? "mt-1.5 text-2xl font-extrabold tabular-nums tracking-tight text-white"
      : tier === "supporting"
        ? "mt-1 text-base font-semibold tabular-nums text-white"
        : tier === "secondary"
          ? "mt-1 text-base font-semibold tabular-nums text-slate-300/80"
          : tier === "tertiary"
            ? "mt-1 text-sm font-medium tabular-nums text-slate-400/70"
            : "mt-1 text-base font-bold tabular-nums";

  const primaryGlow =
    tier === "primary" && accentColor === COLORS.blue
      ? { textShadow: "0 0 22px rgba(59,130,246,0.42)" }
      : tier === "primary" && accentColor === COLORS.green
        ? { textShadow: "0 0 18px rgba(34,197,94,0.32)" }
        : tier === "primary" && accentColor === COLORS.red
          ? { textShadow: "0 0 22px rgba(239,68,68,0.38)" }
          : undefined;

  return (
    <div className="space-y-1.5">
      <TmcKpiDivider />
      <div className={`${sectionPt} ${tier === "primary" ? "pl-0.5" : ""}`}>
        <div className={labelClass}>
          {tier === "primary" && accentColor ? (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{
                backgroundColor: accentColor,
                boxShadow: `0 0 10px ${accentColor}cc`,
              }}
              aria-hidden
            />
          ) : null}
          {label}
        </div>
        <div className={`${valueClass} ${valueClassName ?? ""}`} style={primaryGlow}>
          {value}
        </div>
      </div>
    </div>
  );
}

function TmcKpiAmountBlock({
  label,
  amountRub,
  accentColor,
  showRubSuffix = false,
  valueClassName,
}: {
  label: string;
  amountRub: number;
  accentColor: string;
  showRubSuffix?: boolean;
  valueClassName?: string;
}) {
  const primaryGlow =
    accentColor === COLORS.blue
      ? { textShadow: "0 0 22px rgba(59,130,246,0.42)" }
      : accentColor === COLORS.red
        ? { textShadow: "0 0 22px rgba(239,68,68,0.38)" }
        : accentColor === COLORS.green
          ? { textShadow: "0 0 22px rgba(34,197,94,0.38)" }
          : undefined;
  const suffix = showRubSuffix ? " ₽" : "";

  return (
    <div className="space-y-1.5">
      <TmcKpiDivider />
      <div className="pt-5 pl-0.5">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-300">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{
              backgroundColor: accentColor,
              boxShadow: `0 0 10px ${accentColor}cc`,
            }}
            aria-hidden
          />
          {label}
        </div>
        <div className="mt-2 tabular-nums tracking-tight">
          <span
            className={`text-2xl font-extrabold text-white ${valueClassName ?? ""}`}
            style={primaryGlow}
          >
            {rubKpiAmount(amountRub)}
            {suffix}
          </span>
        </div>
      </div>
    </div>
  );
}

function TmcKpiCountBlock({
  label,
  primaryCount,
  totalCount,
  accentColor,
}: {
  label: string;
  primaryCount: number;
  totalCount: number;
  accentColor: string;
}) {
  return (
    <div className="space-y-1.5">
      <TmcKpiDivider />
      <div className="pt-5 pl-0.5">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-300">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{
              backgroundColor: accentColor,
              boxShadow: `0 0 10px ${accentColor}cc`,
            }}
            aria-hidden
          />
          {label}
        </div>
        <div className="mt-2 flex items-baseline gap-1 tabular-nums tracking-tight">
          <span className="text-2xl font-extrabold text-white">{primaryCount}</span>
          <span className="text-xl font-medium text-slate-300/65">из {totalCount}</span>
        </div>
      </div>
    </div>
  );
}

function TmcKpiSplitMoneyBlock({
  label,
  factRub,
  planRub,
  accentColor,
  showRubSuffix = false,
}: {
  label: string;
  factRub: number;
  planRub: number;
  accentColor: string;
  showRubSuffix?: boolean;
}) {
  const primaryGlow = { textShadow: "0 0 22px rgba(59,130,246,0.42)" };
  const suffix = showRubSuffix ? " ₽" : "";

  return (
    <div className="space-y-1.5">
      <TmcKpiDivider />
      <div className="pt-5 pl-0.5">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-300">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{
              backgroundColor: accentColor,
              boxShadow: `0 0 10px ${accentColor}cc`,
            }}
            aria-hidden
          />
          {label}
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-1.5 tabular-nums tracking-tight">
          <span className="text-2xl font-extrabold text-white" style={primaryGlow}>
            {rubKpiAmount(factRub)}
            {suffix}
          </span>
          <span className="text-xl font-medium text-slate-300/65">
            из {rubKpiAmount(planRub)}
            {suffix}
          </span>
        </div>
      </div>
    </div>
  );
}

function TmcKpiProgressBar({
  value,
  color,
  prominent,
  hidePct,
}: {
  value: number;
  color: string;
  prominent?: boolean;
  hidePct?: boolean;
}) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className={hidePct ? "w-full" : "flex items-center gap-3"}>
      <div
        className={`w-full overflow-hidden rounded-full bg-slate-800/80 ${prominent ? "h-4" : "h-3"} ${hidePct ? "" : "flex-1"}`}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            backgroundColor: color,
            boxShadow: prominent ? `0 0 14px ${color}88` : undefined,
          }}
        />
      </div>
      {hidePct ? null : (
        <span
          className={`shrink-0 font-semibold tabular-nums text-slate-200 ${prominent ? "text-base" : "text-sm"}`}
        >
          {pct1(value)}
        </span>
      )}
    </div>
  );
}

function TmcKpiWave({ color, opacity = 0.45 }: { color: string; opacity?: number }) {
  const gradId = useId().replace(/:/g, "");
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-28">
      <svg viewBox="0 0 400 96" preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity={opacity} />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0,52 C90,88 170,24 260,56 S350,82 400,48 L400,96 L0,96 Z"
          fill={`url(#${gradId})`}
        />
        <path
          d="M0,60 C110,74 210,40 310,64 S380,70 400,58"
          fill="none"
          stroke={color}
          strokeOpacity={opacity * 0.7}
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}

function TmcPremiumKpiCard({
  glowColor,
  gradient,
  waveColor,
  waveOpacity,
  children,
}: {
  glowColor: string;
  gradient: string;
  waveColor?: string;
  waveOpacity?: number;
  children: ReactNode;
}) {
  return (
    <div
      className="relative flex h-full min-h-[340px] flex-col overflow-hidden rounded-[20px] border p-6 backdrop-blur-[16px]"
      style={{
        background: gradient,
        borderColor: `${glowColor}55`,
        boxShadow: `0 22px 56px rgba(0,0,0,0.52), 0 0 36px ${glowColor}28, inset 0 1px 0 rgba(255,255,255,0.1)`,
      }}
    >
      {waveColor ? <TmcKpiWave color={waveColor} opacity={waveOpacity} /> : null}
      <div className="relative z-[1] flex flex-1 flex-col">{children}</div>
    </div>
  );
}

function TmcKpiIconBadge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "blue" | "red" | "amber" | "green";
}) {
  const toneClass =
    tone === "blue"
      ? "bg-blue-500/15 text-blue-400 ring-blue-400/20"
      : tone === "red"
        ? "bg-rose-500/15 text-rose-400 ring-rose-400/20"
        : tone === "green"
          ? "bg-emerald-500/15 text-emerald-400 ring-emerald-400/20"
          : "bg-amber-500/15 text-amber-400 ring-amber-400/20";
  return (
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${toneClass}`}
    >
      {children}
    </div>
  );
}

export function TmcPresentation({
  activePartScope,
}: {
  activePartScope: ConstructionObjectScope;
}) {
  const { token, hydrated } = useAuth();
  const projectId = useMemo(() => getGprProjectId(), []);
  const [allTmc, setAllTmc] = useState<Awaited<ReturnType<typeof listTmcFromDb>>>([]);
  const [chartMode, setChartMode] = useState<ChartMode>("monthly");
  const [workTypeChartMode, setWorkTypeChartMode] = useState<MaterialChartMode>("cost");
  const today = useMemo(() => new Date(), []);

  const reloadTmc = useCallback(async () => {
    if (tmcLocalMode) {
      try {
        const r = await loadPersistedTmcItems(projectId);
        setAllTmc(r.items);
      } catch (e) {
        console.error(e);
      }
      return;
    }
    if (!token) return;
    try {
      setAllTmc(await listTmcFromDb(token));
    } catch (e) {
      console.error(e);
    }
  }, [projectId, token]);

  useEffect(() => {
    if (tmcLocalMode) {
      void reloadTmc();
      const bump = () => void reloadTmc();
      window.addEventListener("gordo-tmc-saved", bump);
      return () => window.removeEventListener("gordo-tmc-saved", bump);
    }
    if (!hydrated || !token) return;
    void reloadTmc();
    const bump = () => void reloadTmc();
    window.addEventListener("gordo-tmc-saved", bump);
    return () => window.removeEventListener("gordo-tmc-saved", bump);
  }, [tmcLocalMode, hydrated, token, reloadTmc]);

  const activeProjectPart = partIdToProjectPartKey(
    activePartScope === "project" ? 1 : activePartScope,
  );

  const enriched = useMemo(() => {
    const items =
      activePartScope === "project"
        ? allTmc
        : allTmc.filter((i) => i.projectPart === activeProjectPart);
    return enrichTmcItems(items, today);
  }, [activePartScope, activeProjectPart, allTmc, today]);

  const kpi = useMemo(() => computeTmcProcurementKpi(enriched, today), [enriched, today]);
  const monthlySeries = useMemo(() => buildTmcMonthlyProcurementSeries(enriched, today), [enriched, today]);
  const chartTimeline = useMemo(
    () => fillTmcMonthlyProcurementTimeline(monthlySeries, today),
    [monthlySeries, today],
  );

  const chartData = useMemo(
    () =>
      chartTimeline.map((p) => ({
        label: p.label,
        plan: chartMode === "monthly" ? p.planMln : p.planCumMln,
        fact: chartMode === "monthly" ? p.factMln : p.factCumMln,
      })),
    [chartTimeline, chartMode],
  );

  const materialPlanFact = useMemo(
    () => computeTmcMaterialPlanFact(enriched, workTypeChartMode),
    [enriched, workTypeChartMode],
  );

  const materialCostDynamics = useMemo(
    () => computeTmcMaterialCostDynamics(enriched),
    [enriched],
  );

  const volumeDynamics = useMemo(() => computeTmcVolumeDynamics(enriched), [enriched]);

  const overdueItemPct =
    kpi.totalItemCount > 0
      ? Math.round((kpi.overdueCount / kpi.totalItemCount) * 1000) / 10
      : 0;

  const receiptCostExecutionPct =
    kpi.planRub > 0
      ? Math.round((kpi.receiptsFactRub / kpi.planRub) * 1000) / 10
      : 0;

  const overdueFactCostRub = useMemo(
    () =>
      enriched
        .filter(isTmcOverduePosition)
        .reduce((sum, item) => sum + tmcItemFactCostRub(item), 0),
    [enriched],
  );

  const receiptDeviation = useMemo(
    () => computeTmcReceiptDeviationDisplay(kpi.planRub, kpi.receiptsFactRub),
    [kpi.planRub, kpi.receiptsFactRub],
  );

  const financialResult = useMemo(
    () => computeTmcProcurementFinancialResult(enriched),
    [enriched],
  );

  const financialCard = useMemo(() => {
    const { deviationRub } = financialResult;
    if (deviationRub < 0) {
      return {
        title: "ОТКЛОНЕНИЕ БЮДЖЕТА",
        mainRub: deviationRub,
        glowColor: COLORS.green,
        gradient:
          "linear-gradient(145deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.92) 55%, rgba(21,128,61,0.14) 100%)",
        waveColor: COLORS.green,
        badgeTone: "green" as const,
      };
    }
    if (deviationRub > 0) {
      return {
        title: "ОТКЛОНЕНИЕ БЮДЖЕТА",
        mainRub: deviationRub,
        glowColor: COLORS.red,
        gradient:
          "linear-gradient(145deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.92) 55%, rgba(127,29,29,0.16) 100%)",
        waveColor: COLORS.red,
        badgeTone: "red" as const,
      };
    }
    return {
      title: "ОТКЛОНЕНИЕ БЮДЖЕТА",
      mainRub: 0,
      glowColor: "#f59e0b",
      gradient:
        "linear-gradient(145deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.92) 55%, rgba(180,83,9,0.12) 100%)",
      waveColor: "#f59e0b",
      badgeTone: "amber" as const,
    };
  }, [financialResult]);

  const chartGradId = useId().replace(/:/g, "");

  return (
    <section className="space-y-4">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-slate-50">Закупка ТМЦ</h2>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <TmcPremiumKpiCard
          glowColor={COLORS.blue}
          gradient="linear-gradient(145deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.92) 55%, rgba(30,58,138,0.14) 100%)"
          waveColor={COLORS.blue}
        >
          <div className="flex items-start gap-3">
            <TmcKpiIconBadge tone="blue">
              <ShoppingCart className="h-5 w-5" strokeWidth={2} />
            </TmcKpiIconBadge>
            <div className="min-w-0 flex-1">
              <TmcKpiLabel>ПОСТАВЛЕНО</TmcKpiLabel>
              <div className="mt-1.5 flex items-baseline gap-1 tabular-nums tracking-tight">
                <span className="text-4xl font-extrabold text-white">{kpi.deliveryCount}</span>
                <span className="text-3xl font-medium text-slate-300/65">
                  из {kpi.totalItemCount}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-1 flex-col justify-evenly">
            <TmcKpiSplitMoneyBlock
              label="ФАКТИЧЕСКАЯ СТОИМОСТЬ ПОСТАВОК"
              factRub={kpi.receiptsFactRub}
              planRub={kpi.planRub}
              accentColor={COLORS.blue}
            />
            <TmcKpiCountBlock
              label="ЗАКУПЛЕНО"
              primaryCount={kpi.purchasedItemCount}
              totalCount={kpi.totalItemCount}
              accentColor={COLORS.blue}
            />
            <TmcKpiMetricBlock
              label="ОСВОЕНИЕ БЮДЖЕТА"
              value={pct1(receiptCostExecutionPct)}
              tier="primary"
              accentColor={COLORS.blue}
              sectionPt="pt-5"
            />
          </div>
        </TmcPremiumKpiCard>

        <TmcPremiumKpiCard
          glowColor={COLORS.red}
          gradient="linear-gradient(145deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.92) 55%, rgba(127,29,29,0.16) 100%)"
          waveColor={COLORS.red}
          waveOpacity={0.25}
        >
          <div className="flex items-start gap-3">
            <TmcKpiIconBadge tone="red">
              <CalendarDays className="h-5 w-5" strokeWidth={2} />
            </TmcKpiIconBadge>
            <div className="min-w-0 flex-1">
              <TmcKpiLabel>ПРОСРОЧЕНО</TmcKpiLabel>
              <div className="mt-1.5 flex items-baseline gap-1 tabular-nums tracking-tight">
                <span className="text-4xl font-extrabold text-white">{kpi.overdueCount}</span>
                <span className="text-3xl font-medium text-slate-300/65">
                  из {kpi.totalItemCount}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-1 flex-col justify-evenly">
            <TmcKpiSplitMoneyBlock
              label="ПРОСРОЧЕННАЯ СТОИМОСТЬ"
              factRub={overdueFactCostRub}
              planRub={Math.abs(receiptDeviation.deviationAmount)}
              accentColor={COLORS.blue}
            />
            <TmcKpiCountBlock
              label="НЕ ЗАКУПЛЕНО"
              primaryCount={kpi.overdueNotStartedCount}
              totalCount={kpi.totalItemCount}
              accentColor={COLORS.red}
            />
            <TmcKpiMetricBlock
              label="ДОЛЯ ПРОСРОЧКИ"
              value={pct1(overdueItemPct)}
              tier="primary"
              accentColor={COLORS.blue}
              sectionPt="pt-5"
            />
          </div>
        </TmcPremiumKpiCard>

        <TmcPremiumKpiCard
          glowColor={financialCard.glowColor}
          gradient={financialCard.gradient}
          waveColor={financialCard.waveColor}
          waveOpacity={0.25}
        >
          <div className="flex items-start gap-3">
            <TmcKpiIconBadge tone={financialCard.badgeTone}>
              <Wallet className="h-5 w-5" strokeWidth={2} />
            </TmcKpiIconBadge>
            <div className="min-w-0 flex-1">
              <TmcKpiLabel>{financialCard.title}</TmcKpiLabel>
              <div className="mt-1.5 tabular-nums tracking-tight">
                <span
                  className={`text-4xl font-extrabold text-white ${
                    financialResult.deviationRub < 0
                      ? "text-emerald-400"
                      : financialResult.deviationRub > 0
                        ? "text-[#ff5b6b]"
                        : ""
                  }`}
                >
                  {rubKpiSignedAmount(financialCard.mainRub)} ₽
                </span>
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-1 flex-col justify-evenly">
            <TmcKpiSplitMoneyBlock
              label="ЭКОНОМИЯ"
              factRub={financialResult.economyRub}
              planRub={financialResult.purchasedPlanRub}
              accentColor={COLORS.green}
              showRubSuffix
            />
            <TmcKpiAmountBlock
              label="ПЕРЕРАСХОД"
              amountRub={financialResult.overrunRub}
              accentColor={COLORS.red}
              showRubSuffix
              valueClassName={financialResult.overrunRub > 0 ? "text-[#ff5b6b]" : undefined}
            />
            <TmcKpiMetricBlock
              label="ДОЛЯ ОТКЛОНЕНИЯ"
              value={pctSigned1(financialResult.deviationPct)}
              tier="primary"
              accentColor={
                financialResult.deviationPct < 0
                  ? COLORS.green
                  : financialResult.deviationPct > 0
                    ? COLORS.red
                    : "#f59e0b"
              }
              sectionPt="pt-5"
              valueClassName={
                financialResult.deviationPct < 0
                  ? "text-emerald-400"
                  : financialResult.deviationPct > 0
                    ? "text-[#ff5b6b]"
                    : undefined
              }
            />
          </div>
        </TmcPremiumKpiCard>
      </div>

      <div
        className="rounded-2xl border border-slate-600/45 bg-[#1e293b] p-6 shadow-[0_18px_48px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/[0.06]"
        style={{
          background:
            "linear-gradient(160deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.95) 100%)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-50">Динамика закупок</h3>
          <div className="inline-flex rounded-lg border border-slate-600/70 bg-slate-900/50 p-0.5">
            {(
              [
                { id: "monthly" as const, label: "Помесячно" },
                { id: "cumulative" as const, label: "Нарастающим итогом" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setChartMode(m.id)}
                className={segmentedControlTabClass(chartMode === m.id, "dark")}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 h-[320px] w-full">
          {chartTimeline.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Недостаточно дат план/факт для построения динамики
            </div>
          ) : (
            <TmcProcurementDynamicsChart
              chartData={chartData}
              chartGradId={chartGradId}
              mode={chartMode}
            />
          )}
        </div>
        <div className="mt-3 border-t border-slate-700/40 pt-3">
          <AnalyticsLegendList>
            <AnalyticsLegendItem
              markerColor="rgba(148,163,184,0.7)"
              label="План закупок (пунктир)"
            />
            <AnalyticsLegendItem markerColor={COLORS.green} label="Факт закупок" />
          </AnalyticsLegendList>
        </div>
      </div>

      <div
        className="rounded-2xl border border-slate-600/45 bg-[#1e293b] p-6 shadow-[0_18px_48px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/[0.06]"
        style={{
          background:
            "linear-gradient(160deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.95) 100%)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold uppercase tracking-wide text-slate-50">
            План / факт по ТМЦ
          </h3>
          <div className="inline-flex rounded-lg border border-slate-600/70 bg-slate-900/50 p-0.5">
            {(
              [
                { id: "cost" as const, label: "Стоимость" },
                { id: "volume" as const, label: "Количество" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setWorkTypeChartMode(m.id)}
                className={segmentedControlTabClass(workTypeChartMode === m.id, "dark")}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <TmcMaterialPlanFactChart rows={materialPlanFact} mode={workTypeChartMode} />
        </div>
      </div>

      <div
        className="rounded-2xl border border-slate-600/45 bg-[#1e293b] p-6 shadow-[0_18px_48px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/[0.06]"
        style={{
          background:
            "linear-gradient(160deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.95) 100%)",
        }}
      >
        <h3 className="text-lg font-semibold uppercase tracking-wide text-slate-50">
          Динамика стоимости единицы ТМЦ
        </h3>
        <div className="mt-4">
          <TmcMaterialCostDynamicsChart rows={materialCostDynamics} />
        </div>
      </div>

      <div
        className="rounded-2xl border border-slate-600/45 bg-[#1e293b] p-6 shadow-[0_18px_48px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/[0.06]"
        style={{
          background:
            "linear-gradient(160deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.95) 100%)",
        }}
      >
        <h3 className="text-lg font-semibold uppercase tracking-wide text-slate-50">
          Динамика объёмов закупок ТМЦ, %
        </h3>
        <div className="mt-4">
          <TmcVolumeDynamicsChart rows={volumeDynamics} />
        </div>
      </div>
    </section>
  );
}
