"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { Loader2, Upload } from "lucide-react";

import type { ApartmentKpiHue, ApartmentPlanKpiPlanCalcDebug, ApartmentPlanPeriodKpiUiData } from "@/lib/apartmentsPlanPeriodKpi";
import type { ApartmentPlanKpiDealFactDebug } from "@/lib/apartmentPlanFactsFromDeals";
import type { ApartmentPlanCsvParseDiagnostics } from "@/lib/planDataSource/types";
import { apartmentKpiExecutionHue, apartmentKpiExecutionPercent } from "@/lib/apartmentsPlanPeriodKpi";
import { dec1Fmt, numFmt } from "@/lib/salesPlanChartFormat";

const KPI_FACT_BAR_COLOR = "#2563EB";
const KPI_PLAN_BAR_COLOR = "#F97316";
const MINI_CHART_MAX_BAR_PX = 88;

function useSmoothScalar(target: number, durationMs = 480) {
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(display);
  displayRef.current = display;

  useEffect(() => {
    const from = displayRef.current;
    let start: number | null = null;
    let raf = 0;
    const tick = (now: number) => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return display;
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function pctToneClasses(hue: ApartmentKpiHue, presDark: boolean, presentation: boolean): string {
  if (presDark) {
    if (hue === "green") return "text-emerald-300";
    if (hue === "yellow") return "text-amber-300";
    return "text-rose-300";
  }
  if (presentation) {
    if (hue === "green") return "text-emerald-700";
    if (hue === "yellow") return "text-amber-700";
    return "text-rose-700";
  }
  if (hue === "green") return "text-emerald-700";
  if (hue === "yellow") return "text-amber-700";
  return "text-rose-700";
}

function deviationToneClass(dev: number, presDark: boolean, presentation: boolean): string {
  if (dev >= 0) {
    return presDark ? "text-emerald-300" : presentation ? "text-emerald-700" : "text-emerald-700";
  }
  return presDark ? "text-rose-300" : presentation ? "text-rose-700" : "text-rose-700";
}

function formatKpiCount(n: number): string {
  return numFmt.format(Math.round(n));
}

type MiniFactPlanColumnChartProps = {
  fact: number;
  plan: number | null;
  hasPlan: boolean;
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
};

function MiniFactPlanColumnChart({
  fact,
  plan,
  hasPlan,
  presDark,
  presentation,
  mplPremium,
}: MiniFactPlanColumnChartProps) {
  const [hovered, setHovered] = useState(false);
  const planVal = hasPlan && plan != null ? plan : 0;
  const maxValue = Math.max(fact, planVal, 1);
  const factHeightPct = (fact / maxValue) * 100;
  const planHeightPct = hasPlan && plan != null ? (plan / maxValue) * 100 : 0;
  const animFactH = useSmoothScalar(factHeightPct);
  const animPlanH = useSmoothScalar(planHeightPct);
  const deviation = hasPlan && plan != null ? fact - plan : null;

  const tooltipShell = presDark
    ? "border border-slate-500/40 bg-[#0b1220]/95 text-slate-100"
    : mplPremium && presentation
      ? "border border-white/50 bg-white/95 text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
      : "border border-slate-200 bg-white text-slate-900 shadow-lg";

  const mutedTip = presDark ? "text-slate-400" : "text-slate-500";
  const axisLabel = presDark ? "text-slate-500" : presentation ? "text-mpl-muted" : "text-slate-500";

  return (
    <div
      className="relative shrink-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      tabIndex={0}
      role="img"
      aria-label={`Факт ${formatKpiCount(fact)}, план ${hasPlan && plan != null ? formatKpiCount(plan) : "—"}`}
    >
      {hovered ? (
        <div
          className={`pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max min-w-[9.5rem] -translate-x-1/2 rounded-lg px-3 py-2 text-xs ${tooltipShell}`}
          role="tooltip"
        >
          <div className="space-y-1 tabular-nums">
            <div>
              <span className={mutedTip}>Факт: </span>
              <span className="font-semibold" style={{ color: KPI_FACT_BAR_COLOR }}>
                {formatKpiCount(fact)}
              </span>
            </div>
            <div>
              <span className={mutedTip}>План: </span>
              <span className="font-semibold" style={{ color: KPI_PLAN_BAR_COLOR }}>
                {hasPlan && plan != null ? formatKpiCount(planVal) : "—"}
              </span>
            </div>
            <div>
              <span className={mutedTip}>Отклонение: </span>
              {deviation != null ? (
                <span className={`font-semibold ${deviationToneClass(deviation, presDark, presentation)}`}>
                  {formatKpiCount(deviation)}
                </span>
              ) : (
                <span className="font-semibold">—</span>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex items-end justify-center gap-3 sm:gap-4">
        <div className="flex flex-col items-center">
          <span
            className="mb-1 text-xs font-bold tabular-nums leading-none"
            style={{ color: KPI_FACT_BAR_COLOR }}
          >
            {formatKpiCount(fact)}
          </span>
          <div
            className="flex w-9 items-end justify-center sm:w-10"
            style={{ height: MINI_CHART_MAX_BAR_PX }}
          >
            <div
              className="w-full min-h-[2px] rounded-t-md transition-[height] duration-500 ease-out will-change-[height]"
              style={{
                height: `${Math.max(2, (animFactH / 100) * MINI_CHART_MAX_BAR_PX)}px`,
                backgroundColor: KPI_FACT_BAR_COLOR,
              }}
            />
          </div>
          <span className={`mt-1.5 text-[10px] font-semibold uppercase tracking-wide ${axisLabel}`}>Факт</span>
        </div>

        <div className="flex flex-col items-center">
          <span
            className="mb-1 text-xs font-bold tabular-nums leading-none"
            style={{ color: KPI_PLAN_BAR_COLOR }}
          >
            {hasPlan && plan != null ? formatKpiCount(plan) : "—"}
          </span>
          <div
            className="flex w-9 items-end justify-center sm:w-10"
            style={{ height: MINI_CHART_MAX_BAR_PX }}
          >
            {hasPlan && plan != null ? (
              <div
                className="w-full min-h-[2px] rounded-t-md transition-[height] duration-500 ease-out will-change-[height]"
                style={{
                  height: `${Math.max(2, (animPlanH / 100) * MINI_CHART_MAX_BAR_PX)}px`,
                  backgroundColor: KPI_PLAN_BAR_COLOR,
                }}
              />
            ) : (
              <div className={`h-[2px] w-full rounded-t-md ${presDark ? "bg-white/10" : "bg-slate-200"}`} />
            )}
          </div>
          <span className={`mt-1.5 text-[10px] font-semibold uppercase tracking-wide ${axisLabel}`}>План</span>
        </div>
      </div>
    </div>
  );
}

type KpiFactPlanCardBodyProps = {
  fact: number;
  plan: number | null;
  hasPlan: boolean;
  executionPct: number | null;
  factLabel: string;
  planLabel: string;
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
  labelCls: string;
  dashCls: string;
};

function KpiFactPlanCardBody({
  fact,
  plan,
  hasPlan,
  executionPct,
  factLabel,
  planLabel,
  presDark,
  presentation,
  mplPremium,
  labelCls,
  dashCls,
}: KpiFactPlanCardBodyProps) {
  const hue = executionPct != null ? apartmentKpiExecutionHue(executionPct) : null;
  const deviation = hasPlan && plan != null ? fact - plan : null;
  const rowValue = presDark ? "text-slate-100" : presentation ? "text-mpl-text" : "text-slate-950";

  return (
    <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex justify-center sm:min-w-[7.5rem] sm:justify-start">
        <MiniFactPlanColumnChart
          fact={fact}
          plan={plan}
          hasPlan={hasPlan}
          presDark={presDark}
          presentation={presentation}
          mplPremium={mplPremium}
        />
      </div>
      <div className="min-w-0 flex-1 space-y-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className={`text-[11px] font-medium ${labelCls}`}>{factLabel}</span>
          <span className={`text-sm font-bold tabular-nums sm:text-base ${rowValue}`}>{formatKpiCount(fact)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className={`text-[11px] font-medium ${labelCls}`}>{planLabel}</span>
          <span className={`text-sm font-bold tabular-nums sm:text-base ${rowValue}`}>
            {hasPlan && plan != null ? formatKpiCount(plan) : <span className={dashCls}>—</span>}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className={`text-[11px] font-medium ${labelCls}`}>Отклонение</span>
          <span
            className={`text-sm font-bold tabular-nums sm:text-base ${
              deviation != null ? deviationToneClass(deviation, presDark, presentation) : dashCls
            }`}
          >
            {deviation != null ? (
              formatKpiCount(deviation)
            ) : (
              <span className={dashCls}>—</span>
            )}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-slate-200/70 pt-2.5 dark:border-white/10">
          <span className={`text-[11px] font-semibold ${labelCls}`}>Выполнение</span>
          {executionPct != null && hue != null ? (
            <span className={`text-base font-extrabold tabular-nums sm:text-lg ${pctToneClasses(hue, presDark, presentation)}`}>
              {dec1Fmt.format(Math.round(executionPct * 10) / 10)}%
            </span>
          ) : (
            <span className={`text-base font-extrabold ${dashCls}`}>—</span>
          )}
        </div>
      </div>
    </div>
  );
}

type CardShellProps = {
  title: string;
  children: ReactNode;
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
  skeleton?: boolean;
  centered?: boolean;
};

function KpiCardShell({ title, children, presDark, presentation, mplPremium, skeleton, centered }: CardShellProps) {
  const surface = presDark
    ? "rounded-2xl border border-white/10 bg-slate-900/40 p-6 shadow-[0_10px_40px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-7"
    : mplPremium && presentation
      ? "rounded-2xl border border-white/45 bg-gradient-to-br from-white/95 via-white/75 to-slate-50/85 p-6 shadow-[0_12px_40px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:p-7"
      : presentation
        ? "rounded-2xl border border-mpl-border bg-mpl-card p-6 shadow-[0_10px_36px_rgba(15,23,42,0.07)] sm:p-7"
        : "rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-50/95 p-6 shadow-[0_12px_40px_rgba(15,23,42,0.07)] sm:p-7";

  const titleCls = presDark ? "text-slate-400" : presentation ? "text-mpl-muted" : "text-slate-500";
  const hoverLift = skeleton
    ? ""
    : presDark
      ? "hover:-translate-y-1 hover:border-white/[0.14] hover:shadow-[0_18px_48px_rgba(0,0,0,0.4)]"
      : "hover:-translate-y-1 hover:border-slate-300/80 hover:shadow-[0_20px_48px_rgba(15,23,42,0.11)]";

  return (
    <div
      className={`group flex h-full min-h-0 min-w-0 w-full flex-col ${surface} ${hoverLift} transition-all duration-300 ease-out`}
    >
      <div className={`text-[11px] font-semibold uppercase tracking-wider ${titleCls}`}>{title}</div>
      <div
        className={`mt-auto flex min-w-0 flex-1 flex-col pt-5 ${
          centered ? "items-center justify-center" : "justify-end"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function KpiSkeletonLine({ presDark }: { presDark: boolean }) {
  const track = presDark ? "bg-white/[0.08]" : "bg-slate-200/60";
  return <div className={`h-8 w-2/3 animate-pulse rounded-md ${track}`} aria-hidden />;
}

type CsvMeta = { fileName: string; updatedAt: string };

function CsvKpiDiagnosticsPanel({
  diagnostics,
  presDark,
  presentation,
}: {
  diagnostics: ApartmentPlanCsvParseDiagnostics;
  presDark: boolean;
  presentation: boolean;
}) {
  const { columnMapping, previewRows, delimiter, rawHeaders } = diagnostics;
  const titleCls = presDark ? "text-slate-200" : presentation ? "text-mpl-text" : "text-slate-900";
  const mutedCls = presDark ? "text-slate-400" : presentation ? "text-mpl-muted" : "text-slate-600";
  const box = presDark
    ? "rounded-xl border border-white/10 bg-slate-900/40"
    : presentation
      ? "rounded-xl border border-mpl-border/80 bg-mpl-card/80"
      : "rounded-xl border border-slate-200/90 bg-white/90";

  const cols = rawHeaders.length ? rawHeaders : columnMapping ? Object.values(columnMapping) : [];

  return (
    <div className={`mb-4 ${box} p-4 text-left`}>
      <div className={`text-xs font-semibold uppercase tracking-wide ${mutedCls}`}>Разбор CSV (отладка)</div>
      {diagnostics.csvType ? (
        <p className={`mt-2 text-xs ${mutedCls}`}>
          Тип CSV:{" "}
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {diagnostics.csvType === "bi_report" ? "BI Report" : "Широкая таблица (сырые строки)"}
          </span>
          {diagnostics.monthKeyUsed ? (
            <>
              {" "}
              · месяц для строк: <span className="font-mono font-semibold">{diagnostics.monthKeyUsed}</span>
            </>
          ) : null}
        </p>
      ) : null}
      {diagnostics.importedSegmentRows != null || diagnostics.ignoredSummaryRows != null ? (
        <p className={`mt-1 text-xs ${mutedCls}`}>
          Импортировано сегментов:{" "}
          <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
            {diagnostics.importedSegmentRows ?? "—"}
          </span>
          {diagnostics.ignoredSummaryRows != null ? (
            <>
              {" "}
              · пропущено агрегирующих строк:{" "}
              <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                {diagnostics.ignoredSummaryRows}
              </span>
            </>
          ) : null}
        </p>
      ) : null}
      {diagnostics.factSource === "system_json" ? (
        <p className={`mt-2 text-xs ${mutedCls}`}>
          Fact source: <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">SYSTEM JSON</span>
        </p>
      ) : null}
      {delimiter ? (
        <p className={`mt-2 text-xs ${mutedCls}`}>
          Разделитель: <span className="font-mono font-semibold">{delimiter === "\t" ? "TAB" : delimiter}</span>
        </p>
      ) : null}
      {columnMapping && Object.keys(columnMapping).length > 0 ? (
        <div className="mt-3">
          <div className={`text-xs font-semibold ${titleCls}`}>Сопоставление колонок</div>
          <ul className={`mt-1.5 list-inside list-disc space-y-0.5 text-xs ${mutedCls}`}>
            {Object.entries(columnMapping).map(([canonical, original]) => (
              <li key={canonical}>
                <span className="font-mono text-[11px] font-semibold text-sky-600/90 dark:text-sky-300/90">{canonical}</span>
                {" → "}
                <span className="text-slate-700 dark:text-slate-200">&quot;{original}&quot;</span>
              </li>
            ))}
          </ul>
        </div>
      ) : rawHeaders.length > 0 ? (
        <div className="mt-3">
          <div className={`text-xs font-semibold ${titleCls}`}>Заголовки в файле</div>
          <p className={`mt-1 font-mono text-[11px] leading-snug ${mutedCls}`}>{rawHeaders.join(" · ")}</p>
        </div>
      ) : null}

      {previewRows.length > 0 && cols.length > 0 ? (
        <div className="mt-4 min-w-0">
          <div className={`text-xs font-semibold ${titleCls}`}>Превью распознанных строк</div>
          <div className="mt-2 max-h-[220px] overflow-auto rounded-lg border border-slate-200/40 dark:border-white/10">
            <table className="w-full min-w-[480px] border-collapse text-left text-[11px]">
              <thead>
                <tr className={presDark ? "border-b border-white/10 bg-slate-950/50" : "border-b border-slate-200 bg-slate-50"}>
                  {cols.map((c) => (
                    <th key={c} className={`max-w-[10rem] whitespace-normal px-2 py-1.5 font-semibold ${mutedCls}`}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, ri) => (
                  <tr key={ri} className={presDark ? "border-b border-white/[0.06]" : "border-b border-slate-100"}>
                    {cols.map((c) => (
                      <td key={c} className="max-w-[10rem] whitespace-pre-wrap break-words px-2 py-1.5 tabular-nums text-slate-700 dark:text-slate-200">
                        {row[c] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PlanCalcKpiDebugPanel({
  debug,
  presDark,
  presentation,
}: {
  debug: ApartmentPlanKpiPlanCalcDebug;
  presDark: boolean;
  presentation: boolean;
}) {
  const mutedCls = presDark ? "text-slate-400" : presentation ? "text-mpl-muted" : "text-slate-600";
  const box = presDark
    ? "rounded-xl border border-white/10 bg-slate-900/40"
    : presentation
      ? "rounded-xl border border-mpl-border/80 bg-mpl-card/80"
      : "rounded-xl border border-slate-200/90 bg-white/90";

  return (
    <div className={`mb-4 ${box} p-4 text-left`}>
      <div className={`text-xs font-semibold uppercase tracking-wide ${mutedCls}`}>План KPI (отладка)</div>
      <p className={`mt-2 text-xs ${mutedCls}`}>
        Calculation strategy:{" "}
        <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">
          {debug.calculationStrategyLabel}
        </span>
      </p>
      {debug.kpiEntity ? (
        <p className={`mt-1 text-xs ${mutedCls}`}>
          KPI Entity: <span className="font-mono font-semibold">{debug.kpiEntity}</span>
        </p>
      ) : null}
      {debug.csvSummaryRow ? (
        <p className={`mt-1 text-xs ${mutedCls}`}>
          Using CSV row: <span className="font-semibold text-slate-800 dark:text-slate-100">{debug.csvSummaryRow}</span>
        </p>
      ) : null}
      {debug.selectedMonthLabel ? (
        <p className={`mt-1 text-xs ${mutedCls}`}>
          Selected month:{" "}
          <span className="font-semibold text-slate-800 dark:text-slate-100">{debug.selectedMonthLabel}</span>
        </p>
      ) : null}
      {debug.planCumulativeSource != null ? (
        <p className={`mt-1 text-xs ${mutedCls}`}>
          Plan cumulative source:{" "}
          <span className="font-mono font-semibold tabular-nums text-slate-800 dark:text-slate-100">
            {debug.planCumulativeSource}
          </span>
        </p>
      ) : null}
      <p className={`mt-1 text-xs ${mutedCls}`}>{debug.cumulativeDebugEn}</p>
      <p className={`mt-1 text-xs ${mutedCls} opacity-90`}>{debug.cumulativeDebugRu}</p>
    </div>
  );
}

function DealApartmentKpiDebugPanel({
  debug,
  presDark,
  presentation,
}: {
  debug: ApartmentPlanKpiDealFactDebug;
  presDark: boolean;
  presentation: boolean;
}) {
  const mutedCls = presDark ? "text-slate-400" : presentation ? "text-mpl-muted" : "text-slate-600";
  const box = presDark
    ? "rounded-xl border border-white/10 bg-slate-900/40"
    : presentation
      ? "rounded-xl border border-mpl-border/80 bg-mpl-card/80"
      : "rounded-xl border border-slate-200/90 bg-white/90";

  return (
    <div className={`mb-4 ${box} p-4 text-left`}>
      <div className={`text-xs font-semibold uppercase tracking-wide ${mutedCls}`}>Факт KPI (отладка)</div>
      <p className={`mt-2 text-xs ${mutedCls}`}>
        Fact source:{" "}
        <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">SYSTEM JSON</span>
      </p>
      <p className={`mt-1 text-xs ${mutedCls}`}>
        Deals loaded:{" "}
        <span className="font-mono font-semibold tabular-nums text-slate-800 dark:text-slate-100">{debug.dealsLoaded}</span>
      </p>
      <p className={`mt-1 text-xs ${mutedCls}`}>
        Unique sold apartments:{" "}
        <span className="font-mono font-semibold tabular-nums text-slate-800 dark:text-slate-100">
          {debug.uniqueSoldApartments}
        </span>
      </p>
      <p className={`mt-1 text-xs ${mutedCls}`}>
        Selected month:{" "}
        <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">{debug.selectedMonth}</span>
        {" · end "}
        <span className="font-mono font-semibold">{debug.endMonthKey}</span>
      </p>
      <p className={`mt-1 text-xs ${mutedCls}`}>
        Apartment rows in feed:{" "}
        <span className="font-mono font-semibold tabular-nums">{debug.apartmentRowsInFeed}</span>
        {" · status rejected: "}
        <span className="font-mono font-semibold tabular-nums">{debug.statusRejected}</span>
      </p>
      <p className={`mt-1 text-xs ${mutedCls}`}>
        Duplicate deals removed:{" "}
        <span className="font-mono font-semibold tabular-nums text-slate-800 dark:text-slate-100">
          {debug.duplicateDealRowsRemoved}
        </span>
        {" · rows after status: "}
        <span className="font-mono font-semibold tabular-nums">{debug.factRowsConsidered}</span>
      </p>
    </div>
  );
}

function KpiPlanDebugStrip({
  presDark,
  presentation,
}: {
  presDark: boolean;
  presentation: boolean;
}) {
  const mutedCls = presDark ? "text-slate-400" : presentation ? "text-mpl-muted" : "text-slate-600";
  const box = presDark
    ? "rounded-xl border border-white/10 bg-slate-900/40"
    : presentation
      ? "rounded-xl border border-mpl-border/80 bg-mpl-card/80"
      : "rounded-xl border border-slate-200/90 bg-white/90";

  return (
    <div className={`mb-4 ${box} p-4 text-left`}>
      <div className={`text-xs font-semibold uppercase tracking-wide ${mutedCls}`}>Разбор CSV (отладка)</div>
      <p className={`mt-2 text-xs ${mutedCls}`}>
        Plan source:{" "}
        <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">NOT LOADED</span>
      </p>
      <p className={`mt-1 text-xs ${mutedCls}`}>
        Fact source: <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">SYSTEM JSON</span>
      </p>
    </div>
  );
}

type Props = {
  data: ApartmentPlanPeriodKpiUiData;
  presentation: boolean;
  presDark: boolean;
  mplPremium: boolean;
  isEditMode?: boolean;
  csvHydrated?: boolean;
  csvLoading?: boolean;
  csvError?: string | null;
  csvMeta?: CsvMeta | null;
  hasCsv?: boolean;
  onCsvUpload?: (file: File) => Promise<void>;
  onCsvClear?: () => Promise<void>;
  csvDiagnostics?: ApartmentPlanCsvParseDiagnostics | null;
};

export function ApartmentPlanPeriodKpiBlock({
  data,
  presentation,
  presDark,
  mplPremium,
  isEditMode = false,
  csvHydrated = true,
  csvLoading = false,
  csvError = null,
  csvMeta = null,
  hasCsv = false,
  onCsvUpload,
  onCsvClear,
  csvDiagnostics = null,
}: Props) {
  const safeData: ApartmentPlanPeriodKpiUiData =
    data && typeof data === "object"
      ? data
      : { hasCsvPlan: false, factMonth: 0, factCumulative: 0 };
  const debouncedData = useDebouncedValue(safeData, 120);

  if (!data || typeof data !== "object") return null;

  const hasPlanKpi = debouncedData.hasCsvPlan;
  const planMonthDen = hasPlanKpi ? debouncedData.planMonth : null;
  const planCumDen = hasPlanKpi ? debouncedData.planCumulative : null;
  const totalVolDen = hasPlanKpi ? debouncedData.totalVolume : null;

  const titleCls = presDark ? "text-slate-100" : presentation ? "text-mpl-text" : "text-slate-950";
  const labelCls = presDark ? "text-slate-500" : presentation ? "text-mpl-muted" : "text-slate-500";
  const valueLight = presDark ? "text-slate-100" : presentation ? "text-mpl-text" : "text-slate-950";
  const dashCls = presDark ? "text-slate-500" : presentation ? "text-mpl-muted" : "text-slate-400";

  const pctMonth = apartmentKpiExecutionPercent(debouncedData.factMonth, planMonthDen);
  const pctCum = apartmentKpiExecutionPercent(debouncedData.factCumulative, planCumDen);
  const pctTotal = apartmentKpiExecutionPercent(debouncedData.factCumulative, totalVolDen);

  const spctT = useSmoothScalar(pctTotal ?? 0);

  const factExceedsTotalVolume = hasPlanKpi && debouncedData.factCumulative > debouncedData.totalVolume;

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const busy = csvLoading;

  const processFile = useCallback(
    async (file: File) => {
      if (!onCsvUpload) return;
      if (!file.name.toLowerCase().endsWith(".csv")) {
        setLocalErr("Разрешены только файлы .csv");
        return;
      }
      setLocalErr(null);
      try {
        await onCsvUpload(file);
      } catch (e) {
        setLocalErr(e instanceof Error ? e.message : "Не удалось загрузить файл");
      }
    },
    [onCsvUpload],
  );

  const onInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) void processFile(file);
    },
    [processFile],
  );

  const onDragOver = useCallback((e: DragEvent) => {
    if (!isEditMode || !onCsvUpload || busy) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, [isEditMode, onCsvUpload, busy]);

  const onDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      if (!isEditMode || !onCsvUpload || busy) return;
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void processFile(file);
    },
    [isEditMode, onCsvUpload, busy, processFile],
  );

  const err = localErr || csvError;
  const isSoftCsvIssue = !localErr && !!csvError;

  const uploadBtnCls = presDark
    ? "inline-flex items-center gap-1.5 rounded-lg border border-slate-500/50 bg-slate-800/50 px-3 py-1.5 text-xs font-semibold text-slate-200 shadow-sm hover:border-slate-400/60 hover:bg-slate-800/80 disabled:cursor-not-allowed disabled:opacity-40"
    : "inline-flex items-center gap-1.5 rounded-lg border border-slate-300/90 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

  const showSkeleton = busy && isEditMode;

  return (
    <div
      className={`relative z-0 mt-6 w-full min-w-0 overflow-visible border-t pt-6 ${
        presDark ? "border-white/10" : presentation ? "border-mpl-border/70" : "border-slate-200/70"
      } ${dragOver && isEditMode ? (presDark ? "ring-2 ring-sky-500/40 ring-offset-2 ring-offset-slate-900" : "ring-2 ring-sky-400/50 ring-offset-2") : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isEditMode && onCsvUpload ? <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onInputChange} /> : null}

      <div className="relative z-[1] mb-4 flex min-w-0 flex-col gap-3 md:mb-5 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className={`text-base font-semibold leading-snug tracking-tight sm:text-lg ${titleCls}`}>
            Выполнение плана отчетного периода
          </h2>
        </div>
        {isEditMode && onCsvUpload ? (
          <div className="flex w-full min-w-0 flex-col gap-2 md:w-auto md:flex-row md:items-center md:justify-end">
            {hasCsv && csvMeta ? (
              <span
                className={`order-2 hidden truncate text-xs font-semibold tabular-nums md:order-1 md:block md:max-w-[14rem] md:pe-1 md:text-right ${
                  presDark ? "text-slate-400" : presentation ? "text-mpl-muted" : "text-slate-600"
                }`}
                title={csvMeta.fileName}
              >
                {csvMeta.fileName}
              </span>
            ) : null}
            <div className="order-1 flex min-w-0 flex-wrap items-center gap-2 md:order-2">
              <button
                type="button"
                disabled={busy}
                className={`${uploadBtnCls} shrink-0 transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] ${
                  hasCsv && !busy
                    ? presDark
                      ? "border-emerald-500/40 text-emerald-200"
                      : "border-emerald-500/50 text-emerald-800"
                    : ""
                }`}
                title={hasCsv ? "Нажмите, чтобы подгрузить другой CSV" : "Перетащите CSV сюда или выберите файл"}
                onClick={() => inputRef.current?.click()}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                {busy ? "Загрузка…" : hasCsv ? "CSV загружен" : "Подгрузить CSV"}
              </button>
              {hasCsv && onCsvClear ? (
                <button
                  type="button"
                  disabled={busy}
                  className="shrink-0 text-xs font-semibold text-rose-600 hover:text-rose-500 disabled:opacity-40"
                  onClick={() => void onCsvClear().catch((e) => setLocalErr(e instanceof Error ? e.message : "Ошибка сброса"))}
                >
                  Сбросить
                </button>
              ) : null}
            </div>
            {hasCsv && csvMeta ? (
              <span
                className={`order-3 truncate text-xs font-semibold tabular-nums md:hidden ${
                  presDark ? "text-slate-400" : presentation ? "text-mpl-muted" : "text-slate-600"
                }`}
                title={csvMeta.fileName}
              >
                {csvMeta.fileName}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {err ? (
        <div
          role="alert"
          className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${
            isSoftCsvIssue
              ? presDark
                ? "border-amber-500/40 bg-amber-950/35 text-amber-100"
                : "border-amber-200 bg-amber-50 text-amber-950"
              : presDark
                ? "border-rose-500/35 bg-rose-950/50 text-rose-100"
                : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          <div>{err}</div>
          {isSoftCsvIssue ? (
            <p className={`mt-2 text-xs font-normal ${presDark ? "text-amber-200/85" : "text-amber-900/85"}`}>
              Факт на карточках — из системы (сделки / отчёт). План и проценты выполнения по этому CSV не применены.
            </p>
          ) : null}
        </div>
      ) : null}

      {factExceedsTotalVolume ? (
        <div
          role="alert"
          className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${
            presDark
              ? "border-amber-500/40 bg-amber-950/35 text-amber-100"
              : "border-amber-200 bg-amber-50 text-amber-950"
          }`}
        >
          Fact data exceeds total apartment volume. Check deal deduplication.
        </div>
      ) : null}

      {isEditMode && csvHydrated && !hasCsv ? <KpiPlanDebugStrip presDark={presDark} presentation={presentation} /> : null}

      {isEditMode && hasCsv && debouncedData.hasCsvPlan && debouncedData.planCalcDebug ? (
        <PlanCalcKpiDebugPanel
          debug={debouncedData.planCalcDebug}
          presDark={presDark}
          presentation={presentation}
        />
      ) : null}

      {isEditMode && debouncedData.dealFactDebug ? (
        <DealApartmentKpiDebugPanel debug={debouncedData.dealFactDebug} presDark={presDark} presentation={presentation} />
      ) : isEditMode ? (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-xs ${
            presDark ? "border-white/10 bg-slate-900/30 text-slate-400" : "border-slate-200/90 bg-slate-50/80 text-slate-600"
          }`}
        >
          Fact source: <span className="font-mono font-semibold">SYSTEM JSON</span> — сделки ещё не загружены или пустой
          список.
        </div>
      ) : null}

      {isEditMode && csvDiagnostics && (csvDiagnostics.rawHeaders.length > 0 || (csvDiagnostics.previewRows?.length ?? 0) > 0) ? (
        <CsvKpiDiagnosticsPanel diagnostics={csvDiagnostics} presDark={presDark} presentation={presentation} />
      ) : null}

      {csvHydrated ? (
        <div
          className={`mb-4 rounded-xl border px-4 py-2.5 text-xs ${
            presDark ? "border-white/10 bg-slate-900/30 text-slate-400" : "border-slate-200/90 bg-slate-50/80 text-slate-600"
          }`}
        >
          {!hasCsv ? (
            <span>
              CSV файл плана не загружен. Загрузите плановый отчёт для расчёта KPI выполнения. Факт отображается из системы.
            </span>
          ) : csvMeta ? (
            <div className="tabular-nums font-medium">
              <span className={presDark ? "text-slate-500" : "text-slate-500"}>Обновлено: </span>
              <span>
                {new Date(csvMeta.updatedAt).toLocaleString("ru-RU", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
        <div className="flex min-h-[220px] min-w-0 md:min-h-[240px]">
          <KpiCardShell
            title="План на отчетный месяц"
            presDark={presDark}
            presentation={presentation}
            mplPremium={mplPremium}
            skeleton={showSkeleton}
          >
            {showSkeleton ? (
              <KpiSkeletonLine presDark={presDark} />
            ) : (
              <KpiFactPlanCardBody
                fact={debouncedData.factMonth}
                plan={planMonthDen}
                hasPlan={hasPlanKpi}
                executionPct={pctMonth}
                factLabel="Факт"
                planLabel="План"
                presDark={presDark}
                presentation={presentation}
                mplPremium={mplPremium}
                labelCls={labelCls}
                dashCls={dashCls}
              />
            )}
          </KpiCardShell>
        </div>

        <div className="flex min-h-[220px] min-w-0 md:min-h-[240px]">
          <KpiCardShell
            title="План накопительно итогом"
            presDark={presDark}
            presentation={presentation}
            mplPremium={mplPremium}
            skeleton={showSkeleton}
          >
            {showSkeleton ? (
              <KpiSkeletonLine presDark={presDark} />
            ) : (
              <KpiFactPlanCardBody
                fact={debouncedData.factCumulative}
                plan={planCumDen}
                hasPlan={hasPlanKpi}
                executionPct={pctCum}
                factLabel="Факт накопительно"
                planLabel="План накопительно"
                presDark={presDark}
                presentation={presentation}
                mplPremium={mplPremium}
                labelCls={labelCls}
                dashCls={dashCls}
              />
            )}
          </KpiCardShell>
        </div>

        <div className="flex min-h-[220px] min-w-0 md:min-h-[240px]">
          <KpiCardShell
            title="% выполнения от общего объема"
            presDark={presDark}
            presentation={presentation}
            mplPremium={mplPremium}
            skeleton={showSkeleton}
            centered
          >
            {showSkeleton ? (
              <KpiSkeletonLine presDark={presDark} />
            ) : (
              <div className="flex w-full flex-col items-center justify-center px-2 py-3 text-center">
                <div className={`text-[11px] font-medium uppercase tracking-wide ${labelCls}`}>Реализовано</div>
                {pctTotal != null ? (
                  <div
                    className={`mt-2 text-4xl font-extrabold tabular-nums leading-none tracking-tight transition-opacity duration-500 sm:text-[2.75rem] ${valueLight}`}
                  >
                    {dec1Fmt.format(Math.round(spctT * 10) / 10)}%
                  </div>
                ) : (
                  <div className={`mt-2 text-4xl font-extrabold tabular-nums sm:text-[2.75rem] ${dashCls}`}>—</div>
                )}
              </div>
            )}
          </KpiCardShell>
        </div>
      </div>
    </div>
  );
}
