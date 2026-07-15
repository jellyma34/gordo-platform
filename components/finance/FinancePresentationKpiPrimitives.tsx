"use client";

import { useId, type ReactNode } from "react";

const COLORS = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
  plan: "#94a3b8",
  blue: "#3b82f6",
  teal: "#14b8a6",
} as const;

export { COLORS as FINANCE_KPI_COLORS };

/** Сумма для KPI — без символа ₽ (как в ТМЦ). */
export function financeRubKpiAmount(value: number): string {
  const formatted = new Intl.NumberFormat("ru-RU").format(Math.round(Math.abs(value)));
  if (value < 0) return `−${formatted}`;
  return formatted;
}

/** Компактная сумма для легенды donut: «261,1 млн». */
export function financeRubKpiAmountMln(value: number): string {
  const sign = value < 0 ? "−" : "";
  const mln = Math.abs(value) / 1_000_000;
  const rounded = Math.round(mln * 10) / 10;
  return `${sign}${rounded.toFixed(1).replace(".", ",")} млн`;
}

export function financePct1(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(1).replace(".", ",")}%`;
}

export function FinanceKpiDivider() {
  return <div className="border-t border-slate-600/35" />;
}

export function FinanceKpiLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{children}</div>
  );
}

type FinanceKpiMetricTier = "primary" | "supporting" | "secondary" | "tertiary" | "deviation";

export function FinanceKpiMetricBlock({
  label,
  value,
  tier,
  accentColor,
  valueClassName,
  sectionPt = "pt-4",
}: {
  label: string;
  value: string;
  tier: FinanceKpiMetricTier;
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

  const valueClass = valueClassName
    ? tier === "primary"
      ? "mt-1.5 text-2xl font-extrabold tabular-nums tracking-tight"
      : tier === "supporting"
        ? "mt-1 text-base font-semibold tabular-nums"
        : tier === "secondary"
          ? "mt-1 text-base font-semibold tabular-nums"
          : tier === "tertiary"
            ? "mt-1 text-sm font-medium tabular-nums"
            : "mt-1 text-base font-bold tabular-nums"
    : tier === "primary"
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
      <FinanceKpiDivider />
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

export function FinanceKpiAmountBlock({
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
      <FinanceKpiDivider />
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
            {financeRubKpiAmount(amountRub)}
            {suffix}
          </span>
        </div>
      </div>
    </div>
  );
}

export function FinanceKpiSplitMoneyBlock({
  label,
  factRub,
  planRub,
  accentColor,
  showRubSuffix = false,
  completionPct,
  completionLabel = "Выполнение",
  compact = false,
}: {
  label: string;
  factRub: number | null;
  planRub: number | null;
  accentColor: string;
  showRubSuffix?: boolean;
  completionPct?: number | null;
  completionLabel?: string;
  compact?: boolean;
}) {
  const primaryGlow = { textShadow: "0 0 22px rgba(59,130,246,0.42)" };
  const suffix = showRubSuffix ? " ₽" : "";
  const hasFact = factRub != null;
  const hasPlan = planRub != null;

  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      <FinanceKpiDivider />
      <div className={`${compact ? "pt-3" : "pt-5"} pl-0.5`}>
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
            {hasFact ? financeRubKpiAmount(factRub) : "—"}
            {suffix}
          </span>
          <span className="text-xl font-medium text-slate-300/65">
            из {hasPlan ? financeRubKpiAmount(planRub) : "—"}
            {suffix}
          </span>
        </div>
        {completionPct != null ? (
          <div className="mt-1.5 text-sm font-semibold uppercase tracking-wider text-slate-500">
            {completionLabel}{" "}
            <span className="text-base font-extrabold text-sky-400">{financePct1(completionPct)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FinanceKpiWave({ color, opacity = 0.45 }: { color: string; opacity?: number }) {
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

export function FinancePremiumKpiCard({
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
      {waveColor ? <FinanceKpiWave color={waveColor} opacity={waveOpacity} /> : null}
      <div className="relative z-[1] flex flex-1 flex-col">{children}</div>
    </div>
  );
}

export function FinanceKpiIconBadge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "blue" | "red" | "amber" | "green" | "teal";
}) {
  const toneClass =
    tone === "blue"
      ? "bg-blue-500/15 text-blue-400 ring-blue-400/20"
      : tone === "red"
        ? "bg-rose-500/15 text-rose-400 ring-rose-400/20"
        : tone === "green"
          ? "bg-emerald-500/15 text-emerald-400 ring-emerald-400/20"
          : tone === "teal"
            ? "bg-teal-500/15 text-teal-400 ring-teal-400/20"
            : "bg-amber-500/15 text-amber-400 ring-amber-400/20";
  return (
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${toneClass}`}
    >
      {children}
    </div>
  );
}
