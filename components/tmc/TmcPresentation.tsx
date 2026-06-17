"use client";

import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { CalendarDays, ChevronDown, ShoppingCart, Wallet } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { listTendersFromDb, listTmcFromDb } from "@/lib/constructionApi";
import { isGprLocalStorageMode } from "@/lib/gprStorageMode";
import { getGprProjectId, loadPersistedTmcItems } from "@/lib/tmcImportPersistence";
import { loadPersistedTenderItems } from "@/lib/tenderImportPersistence";
import type { Tender } from "@/lib/tenderData";
import { AnalyticsLegendItem, AnalyticsLegendList } from "@/components/construction/AnalyticsLegendItem";
import { TmcMaterialCostDynamicsChart } from "@/components/tmc/TmcMaterialCostDynamicsChart";
import { TmcMaterialPlanFactChart } from "@/components/tmc/TmcMaterialPlanFactChart";
import {
  TmcDynamicsChartLegend,
  TmcProcurementDynamicsChart,
  type TmcDynamicsChartLabels,
} from "@/components/tmc/TmcProcurementDynamicsChart";
import {
  TmcRequestDynamicsChartLegend,
  TmcRequestPlanFactChart,
} from "@/components/tmc/TmcRequestPlanFactChart";
import { TmcVolumeDynamicsChart } from "@/components/tmc/TmcVolumeDynamicsChart";
import { KpiDonutChart } from "@/components/tmc/KpiDonutChart";
import { useTmcKpiDonutSegments } from "@/components/tmc/useTmcKpiDonutSegments";
import { segmentedControlTabClass } from "@/components/marketing/marketingSegmentedControlClasses";
import { formatCurrencyCompact } from "@/lib/chartFormatters";
import { partIdToProjectPartKey, type ConstructionObjectScope } from "@/lib/gprUtils";
import {
  alignTmcMonthlySeriesToTimeline,
  buildTmcMonthlyDeliverySeries,
  type TmcDynamicsValueMode,
  buildTmcMonthlyProcurementSeries,
  buildTmcMonthlyRequestSeries,
  computeTmcProcurementKpi,
  computeTmcProcurementFinancialResult,
  computeTmcMaterialPlanFact,
  computeTmcArmaturePlanFactDiagnostics,
  computeTmcMaterialCostDynamics,
  diagnoseTmcMaterialCostDynamicsChain,
  computeTmcMaterialPriceIndexLineDataset,
  computeTmcVolumeDynamics,
  buildTmcPriceIndexTimeline,
  computeTmcDataDiagnostics,
  computeTmcOverdueReasonBreakdown,
  logTmcDataPipelineDiagnostics,
  logTmcPipelineStatusDiagnostic,
  logTmcPurchasedVsRequestDiagnostic,
  logTmcContractFactKpiChartDiagnostic,
  getTmcRequestChartFactCumulative,
  type TmcMaterialCostDynamicsMode,
  diagnoseTmcDeliveryDynamicsMonths,
  diagnoseTmcProcurementDynamicsMonths,
  type TmcMaterialPlanFactMode,
  enrichTmcItems,
  fillTmcMonthlyProcurementTimeline,
  classifyTmcPipelineStatus,
  tmcItemFactCostRub,
} from "@/lib/tmcPresentationAnalytics";

const tmcLocalMode = isGprLocalStorageMode();
const tenderLocalMode = isGprLocalStorageMode();

function filterTendersForScope(list: Tender[], scope: ConstructionObjectScope): Tender[] {
  if (scope === "project") {
    return list.filter((t) => t.partId === 1 || t.partId === 2);
  }
  return list.filter((t) => t.partId === scope);
}

function formatTmcPlanDate(iso: string | null): string {
  if (!iso?.trim()) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

function TmcOverdueDetailsPanel({
  rows,
  onClose,
}: {
  rows: ReturnType<typeof computeTmcOverdueReasonBreakdown>["rows"];
  onClose: () => void;
}) {
  if (rows.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-slate-600/45 bg-slate-950/55">
      <div className="flex items-center justify-between gap-2 border-b border-slate-600/35 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Детализация просрочки
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] font-medium text-slate-500 transition-colors hover:text-slate-300"
        >
          Свернуть
        </button>
      </div>
      <div className="max-h-[220px] overflow-auto">
        <table className="w-full min-w-[520px] border-collapse text-left text-[10px]">
          <thead className="sticky top-0 bg-slate-950/95 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Наименование ТМЦ</th>
              <th className="px-3 py-2 font-semibold">Статус / причина</th>
              <th className="px-3 py-2 font-semibold">Плановая дата</th>
              <th className="px-3 py-2 font-semibold">Просрочка (дней)</th>
              <th className="px-3 py-2 font-semibold">Ответственный контрагент</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-700/35 text-slate-300">
                <td className="max-w-[160px] px-3 py-2 align-top font-medium text-slate-100">
                  <span className="line-clamp-2 break-words">{row.name}</span>
                </td>
                <td className="px-3 py-2 align-top text-slate-300">{row.reason}</td>
                <td className="whitespace-nowrap px-3 py-2 align-top tabular-nums">
                  {formatTmcPlanDate(row.planDate)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-top tabular-nums font-semibold text-rose-300">
                  {row.overdueDays}
                </td>
                <td className="max-w-[140px] px-3 py-2 align-top break-words text-slate-400">
                  {row.contractor}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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

const DELIVERY_DYNAMICS_LABELS: TmcDynamicsChartLabels = {
  planTooltip: "План поставок",
  factTooltip: "Факт поставок",
  legendPlan: "План поставок (пунктир)",
  legendFact: "Факт поставок",
};

const TMC_PURCHASED_DEVIATION_CARD_TITLE = "ОТКЛОНЕНИЕ ОТ ЗАКУПЛЕННОГО";
const TMC_PURCHASED_DEVIATION_PCT_LABEL = "ОТКЛОНЕНИЕ ОТ ЗАКУПЛЕННОГО, %";

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
  title,
}: {
  label: string;
  primaryCount: number;
  totalCount: number;
  accentColor: string;
  title?: string;
}) {
  return (
    <div className="space-y-1.5">
      <TmcKpiDivider />
      <div className="pt-5 pl-0.5" title={title}>
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
      className="relative flex h-full min-h-[400px] flex-col overflow-hidden rounded-[20px] border p-6 backdrop-blur-[16px]"
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
  const [allTenders, setAllTenders] = useState<Tender[]>([]);
  const [overdueDetailsOpen, setOverdueDetailsOpen] = useState(false);
  const [chartMode, setChartMode] = useState<ChartMode>("monthly");
  const [procurementValueMode, setProcurementValueMode] = useState<TmcDynamicsValueMode>("cost");
  const [deliveryChartMode, setDeliveryChartMode] = useState<ChartMode>("monthly");
  const [deliveryValueMode, setDeliveryValueMode] = useState<TmcDynamicsValueMode>("cost");
  const [requestChartMode, setRequestChartMode] = useState<ChartMode>("monthly");
  const [workTypeChartMode, setWorkTypeChartMode] = useState<MaterialChartMode>("cost");
  const [costDynamicsMode, setCostDynamicsMode] = useState<TmcMaterialCostDynamicsMode>("byMaterial");
  const today = useMemo(() => new Date(), []);

  const reloadTmc = useCallback(async () => {
    if (tmcLocalMode) {
      try {
        const r = await loadPersistedTmcItems(projectId);
        setAllTmc(r.items);
        console.log(
          "[TMC debug] TMC loaded in presentation:",
          r.items.length,
          `(projectId: ${projectId})`,
        );
      } catch (e) {
        console.error(e);
      }
      return;
    }
    if (!token) return;
    try {
      const rows = await listTmcFromDb(token);
      setAllTmc(rows);
      console.log("[TMC debug] TMC loaded in presentation:", rows.length, "(from DB)");
    } catch (e) {
      console.error(e);
    }
  }, [projectId, token]);

  const reloadTenders = useCallback(async () => {
    if (tenderLocalMode) {
      try {
        const r = await loadPersistedTenderItems(projectId);
        setAllTenders(r.tenders);
      } catch (e) {
        console.error(e);
      }
      return;
    }
    if (!token) return;
    try {
      setAllTenders(await listTendersFromDb(token));
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

  useEffect(() => {
    if (tenderLocalMode) {
      void reloadTenders();
      const bump = () => void reloadTenders();
      window.addEventListener("gordo-tenders-saved", bump);
      return () => window.removeEventListener("gordo-tenders-saved", bump);
    }
    if (!hydrated || !token) return;
    void reloadTenders();
    const bump = () => void reloadTenders();
    window.addEventListener("gordo-tenders-saved", bump);
    return () => window.removeEventListener("gordo-tenders-saved", bump);
  }, [tenderLocalMode, hydrated, token, reloadTenders]);

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

  const scopedTenders = useMemo(
    () => filterTendersForScope(allTenders, activePartScope),
    [allTenders, activePartScope],
  );

  const kpi = useMemo(
    () => computeTmcProcurementKpi(enriched, today, scopedTenders),
    [enriched, today, scopedTenders],
  );
  const monthlySeries = useMemo(
    () => buildTmcMonthlyProcurementSeries(enriched, today, procurementValueMode),
    [enriched, today, procurementValueMode],
  );
  const chartTimeline = useMemo(
    () => fillTmcMonthlyProcurementTimeline(monthlySeries, today),
    [monthlySeries, today],
  );

  const priceIndexTimeline = useMemo(
    () => buildTmcPriceIndexTimeline(enriched, today),
    [enriched, today],
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

  const deliverySeries = useMemo(
    () => buildTmcMonthlyDeliverySeries(enriched, today, deliveryValueMode),
    [enriched, today, deliveryValueMode],
  );

  const deliveryTimeline = useMemo(() => {
    const integerCumulative = deliveryValueMode === "quantity";
    if (chartTimeline.length > 0) {
      return alignTmcMonthlySeriesToTimeline(deliverySeries, chartTimeline, today, {
        integerCumulative,
      });
    }
    return fillTmcMonthlyProcurementTimeline(deliverySeries, today);
  }, [chartTimeline, deliverySeries, today, deliveryValueMode]);

  const deliveryChartData = useMemo(
    () =>
      deliveryTimeline.map((p) => ({
        label: p.label,
        plan: deliveryChartMode === "monthly" ? p.planMln : p.planCumMln,
        fact: deliveryChartMode === "monthly" ? p.factMln : p.factCumMln,
      })),
    [deliveryTimeline, deliveryChartMode],
  );

  const requestSeries = useMemo(
    () => buildTmcMonthlyRequestSeries(enriched, today),
    [enriched, today],
  );

  const requestTimeline = useMemo(() => {
    if (chartTimeline.length > 0) {
      return alignTmcMonthlySeriesToTimeline(requestSeries, chartTimeline, today);
    }
    return fillTmcMonthlyProcurementTimeline(requestSeries, today);
  }, [chartTimeline, requestSeries, today]);

  const requestChartData = useMemo(
    () =>
      requestTimeline.map((p) => ({
        label: p.label,
        plan: requestChartMode === "monthly" ? p.planMln : p.planCumMln,
        fact: requestChartMode === "monthly" ? p.factMln : p.factCumMln,
      })),
    [requestTimeline, requestChartMode],
  );

  const requestContractFactCount = useMemo(
    () => getTmcRequestChartFactCumulative(requestTimeline, today),
    [requestTimeline, today],
  );

  const materialPlanFact = useMemo(
    () => computeTmcMaterialPlanFact(enriched, undefined, today),
    [enriched, today],
  );

  useEffect(() => {
    const scopeLabel =
      activePartScope === "project" ? "project (all parts)" : String(activeProjectPart);
    logTmcDataPipelineDiagnostics(
      computeTmcDataDiagnostics(
        activePartScope === "project" ? allTmc : allTmc.filter((i) => i.projectPart === activeProjectPart),
        "presentation",
        scopeLabel,
      ),
    );
    logTmcDataPipelineDiagnostics(computeTmcDataDiagnostics(enriched, "analytics", scopeLabel));
  }, [allTmc, enriched, activePartScope, activeProjectPart]);

  useEffect(() => {
    const procurementDiag = diagnoseTmcProcurementDynamicsMonths(enriched, chartTimeline, today);
    console.group("[TMC] Динамика закупок — помесячная диагностика");
    for (const entry of procurementDiag) {
      console.log({
        month: entry.month,
        plan: entry.plan,
        fact: entry.fact,
        sourceRows: entry.sourceRows,
      });
    }
    console.groupEnd();

    const deliveryDiag = diagnoseTmcDeliveryDynamicsMonths(enriched, deliveryTimeline, today);
    console.group("[TMC] Динамика поставок — помесячная диагностика");
    for (const entry of deliveryDiag) {
      console.log({
        month: entry.month,
        plan: entry.plan,
        fact: entry.fact,
        sourceRows: entry.sourceRows,
      });
    }
    console.groupEnd();
  }, [enriched, chartTimeline, deliveryTimeline, today]);

  useEffect(() => {
    const diagnostics = computeTmcArmaturePlanFactDiagnostics(enriched);
    console.table({
      belowPlan: diagnostics.belowPlan,
      belowFact: diagnostics.belowFact,
      abovePlan: diagnostics.abovePlan,
      aboveFact: diagnostics.aboveFact,
    });
    console.log("[TMC plan/fact] Арматура ниже 0.000 — этапы:", diagnostics.belowStages);
    console.log("[TMC plan/fact] Арматура выше 0.000 — этапы:", diagnostics.aboveStages);
  }, [enriched]);

  const materialCostDynamics = useMemo(() => {
    console.log("[TMC debug] Presentation TMC rows", enriched.length);
    const rows = computeTmcMaterialCostDynamics(enriched);
    const scopeLabel =
      activePartScope === "project" ? "project (all parts)" : String(activeProjectPart);
    diagnoseTmcMaterialCostDynamicsChain(enriched, rows, { scope: scopeLabel, limitApplied: null });
    return rows;
  }, [enriched, activePartScope, activeProjectPart]);

  const materialPriceIndexLineDataset = useMemo(
    () => computeTmcMaterialPriceIndexLineDataset(enriched, priceIndexTimeline),
    [enriched, priceIndexTimeline],
  );

  const volumeDynamics = useMemo(() => computeTmcVolumeDynamics(enriched), [enriched]);

  const receiptCostExecutionPct =
    kpi.planRub > 0
      ? Math.round((kpi.receiptsFactRub / kpi.planRub) * 1000) / 10
      : 0;

  const overdueFactCostRub = useMemo(
    () =>
      enriched
        .filter((item) => classifyTmcPipelineStatus(item, scopedTenders, today) === "deliveryOverdue")
        .reduce((sum, item) => sum + tmcItemFactCostRub(item), 0),
    [enriched, scopedTenders, today],
  );

  const receiptDeviation = useMemo(
    () => computeTmcReceiptDeviationDisplay(kpi.planRub, kpi.receiptsFactRub),
    [kpi.planRub, kpi.receiptsFactRub],
  );

  const financialResult = useMemo(
    () => computeTmcProcurementFinancialResult(enriched),
    [enriched],
  );

  const kpiDonutSegments = useTmcKpiDonutSegments(enriched, scopedTenders, today);

  const overdueReasonBreakdown = useMemo(
    () => computeTmcOverdueReasonBreakdown(enriched, scopedTenders, today),
    [enriched, scopedTenders, today],
  );

  useEffect(() => {
    logTmcPipelineStatusDiagnostic(enriched, scopedTenders, today);
  }, [enriched, scopedTenders, today]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    logTmcContractFactKpiChartDiagnostic(enriched, requestTimeline, today);
  }, [enriched, requestTimeline, today]);

  useEffect(() => {
    if (kpi.remainingItemCount === 0) setOverdueDetailsOpen(false);
  }, [kpi.remainingItemCount]);

  const financialCard = useMemo(() => {
    const { deviationRub } = financialResult;
    if (deviationRub < 0) {
      return {
        title: TMC_PURCHASED_DEVIATION_CARD_TITLE,
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
        title: TMC_PURCHASED_DEVIATION_CARD_TITLE,
        mainRub: deviationRub,
        glowColor: COLORS.red,
        gradient:
          "linear-gradient(145deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.92) 55%, rgba(127,29,29,0.16) 100%)",
        waveColor: COLORS.red,
        badgeTone: "red" as const,
      };
    }
    return {
      title: TMC_PURCHASED_DEVIATION_CARD_TITLE,
      mainRub: 0,
      glowColor: "#f59e0b",
      gradient:
        "linear-gradient(145deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.92) 55%, rgba(180,83,9,0.12) 100%)",
      waveColor: "#f59e0b",
      badgeTone: "amber" as const,
    };
  }, [financialResult]);

  const chartGradId = useId().replace(/:/g, "");
  const deliveryChartGradId = useId().replace(/:/g, "");

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
              label="ЗАКУПЛЕНО ТМЦ"
              primaryCount={kpi.purchasedItemCount}
              totalCount={kpi.totalItemCount}
              accentColor={COLORS.blue}
            />
            <TmcKpiCountBlock
              label="ЗАКУПЛЕНО ПО ДОГОВОРУ"
              primaryCount={requestContractFactCount}
              totalCount={kpi.totalItemCount}
              accentColor={COLORS.plan}
            />
            <TmcKpiMetricBlock
              label="ОСВОЕНИЕ БЮДЖЕТА"
              value={pct1(receiptCostExecutionPct)}
              tier="primary"
              accentColor={COLORS.blue}
              sectionPt="pt-5"
            />
          </div>

          <div className="mt-auto space-y-1.5">
            <TmcKpiDivider />
            <div className="pt-3">
              <KpiDonutChart segments={kpiDonutSegments.deliveryStatus} chartHeight={100} />
            </div>
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
              <TmcKpiLabel>В РАБОТЕ</TmcKpiLabel>
              <button
                type="button"
                onClick={() => {
                  if (kpi.remainingItemCount > 0) {
                    setOverdueDetailsOpen((open) => !open);
                  }
                }}
                className={`mt-1.5 flex w-full items-baseline gap-1 text-left tabular-nums tracking-tight transition-opacity ${
                  kpi.remainingItemCount > 0
                    ? "cursor-pointer hover:opacity-90"
                    : "cursor-default"
                }`}
                aria-expanded={overdueDetailsOpen}
                title={
                  kpi.remainingItemCount > 0
                    ? "Показать детализацию остатка"
                    : undefined
                }
              >
                <span className="text-4xl font-extrabold text-white">{kpi.overdueAmongRemainingCount}</span>
                <span className="text-3xl font-medium text-slate-300/65">
                  из {kpi.remainingItemCount}
                </span>
                {kpi.remainingItemCount > 0 ? (
                  <ChevronDown
                    className={`ml-1 h-5 w-5 shrink-0 text-slate-400 transition-transform ${
                      overdueDetailsOpen ? "rotate-180" : ""
                    }`}
                    aria-hidden
                  />
                ) : null}
              </button>
            </div>
          </div>

          {overdueDetailsOpen ? (
            <TmcOverdueDetailsPanel
              rows={overdueReasonBreakdown.rows}
              onClose={() => setOverdueDetailsOpen(false)}
            />
          ) : null}

          <div className="mt-2 flex flex-1 flex-col justify-evenly">
            <TmcKpiSplitMoneyBlock
              label="ПРОСРОЧЕННАЯ СТОИМОСТЬ"
              factRub={overdueFactCostRub}
              planRub={Math.abs(receiptDeviation.deviationAmount)}
              accentColor={COLORS.blue}
            />
            <TmcKpiCountBlock
              label="НЕ ЗАКУПЛЕНО"
              primaryCount={kpi.notPurchasedAmongRemainingCount}
              totalCount={kpi.remainingItemCount}
              accentColor={COLORS.red}
            />
            <TmcKpiMetricBlock
              label="ДОЛЯ ПРОСРОЧКИ"
              value={pct1(kpi.overdueAmongRemainingPct)}
              tier="primary"
              accentColor={COLORS.blue}
              sectionPt="pt-5"
            />
          </div>

          <div className="mt-auto space-y-1.5">
            <TmcKpiDivider />
            <div className="pt-3">
              <KpiDonutChart
                segments={kpiDonutSegments.overdueReasons}
                percentBase={kpi.remainingItemCount}
                chartHeight={100}
                reasonTooltip
              />
            </div>
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
              label={TMC_PURCHASED_DEVIATION_PCT_LABEL}
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

          <div className="mt-auto space-y-1.5">
            <TmcKpiDivider />
            <div className="pt-3">
              <KpiDonutChart segments={kpiDonutSegments.budgetDeviation} chartHeight={100} />
            </div>
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
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-600/70 bg-slate-900/50 p-0.5">
              {(
                [
                  { id: "cost" as const, label: "Стоимость" },
                  { id: "quantity" as const, label: "Количество" },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setProcurementValueMode(m.id)}
                  className={segmentedControlTabClass(procurementValueMode === m.id, "dark")}
                >
                  {m.label}
                </button>
              ))}
            </div>
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
              valueUnit={procurementValueMode === "quantity" ? "count" : "mln"}
              planFactDeviationTooltip
            />
          )}
        </div>
        <div className="mt-3 border-t border-slate-700/40 pt-3">
          <TmcDynamicsChartLegend />
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
          <h3 className="text-lg font-semibold text-slate-50">Динамика поставок</h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-600/70 bg-slate-900/50 p-0.5">
              {(
                [
                  { id: "cost" as const, label: "Стоимость" },
                  { id: "quantity" as const, label: "Количество" },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setDeliveryValueMode(m.id)}
                  className={segmentedControlTabClass(deliveryValueMode === m.id, "dark")}
                >
                  {m.label}
                </button>
              ))}
            </div>
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
                  onClick={() => setDeliveryChartMode(m.id)}
                  className={segmentedControlTabClass(deliveryChartMode === m.id, "dark")}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 h-[320px] w-full">
          {deliveryTimeline.length === 0 && chartTimeline.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Недостаточно дат план/факт поставки для построения динамики
            </div>
          ) : (
            <TmcProcurementDynamicsChart
              chartData={deliveryChartData}
              chartGradId={deliveryChartGradId}
              mode={deliveryChartMode}
              valueUnit={deliveryValueMode === "quantity" ? "count" : "mln"}
              labels={DELIVERY_DYNAMICS_LABELS}
              planFactDeviationTooltip
            />
          )}
        </div>
        <div className="mt-3 border-t border-slate-700/40 pt-3">
          <TmcDynamicsChartLegend labels={DELIVERY_DYNAMICS_LABELS} />
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
            План / факт договоров поставки
          </h3>
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
                onClick={() => setRequestChartMode(m.id)}
                className={segmentedControlTabClass(requestChartMode === m.id, "dark")}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 h-[320px] w-full">
          {requestTimeline.length === 0 && chartTimeline.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Недостаточно дат план/факт договоров для построения динамики
            </div>
          ) : (
            <TmcRequestPlanFactChart chartData={requestChartData} mode={requestChartMode} />
          )}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Учитываются позиции с заполненной датой договора (contractFactDate) на дату отчёта.
        </p>
        <div className="mt-3 border-t border-slate-700/40 pt-3">
          <TmcRequestDynamicsChartLegend />
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
                { id: "completion" as const, label: "% выполнения" },
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold uppercase tracking-wide text-slate-50">
            Динамика стоимости единицы ТМЦ
          </h3>
          <div className="inline-flex rounded-lg border border-slate-600/70 bg-slate-900/50 p-0.5">
            {(
              [
                { id: "byMaterial" as const, label: "По ТМЦ" },
                { id: "byPriceIndex" as const, label: "Индекс цены" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setCostDynamicsMode(m.id)}
                className={segmentedControlTabClass(costDynamicsMode === m.id, "dark")}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <TmcMaterialCostDynamicsChart
            rows={materialCostDynamics}
            mode={costDynamicsMode}
            priceIndexLineDataset={materialPriceIndexLineDataset}
          />
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
