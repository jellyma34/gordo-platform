"use client";

import { useMemo, useState } from "react";
import { useChartHeight, useChartWidth, usePlotArea, useXAxisScale, useYAxisScale } from "recharts";

import {
  cashflowRowsForChart,
  type CashflowChartMode,
  type CashflowChartRow,
  type CashflowSeriesRow,
} from "@/lib/buildCashflowSeries";
import { cashflowYAxisScale, formatCashShort, formatCashflowDynamicsChartLabel, formatCashflowYAxisMlnRub } from "@/lib/salesPlanChartFormat";
import { MPL_PREMIUM_CHART_SHELL } from "@/lib/marketingPremiumUi";
import { useMarketingPresentationLight, useMarketingPresVisual } from "@/components/marketing/marketingPresentationLightContext";
import { segmentedControlTabClass } from "@/components/marketing/marketingSegmentedControlClasses";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/charting/rechartsClient";

function formatRubLabel(n: number): string {
  return formatCashflowDynamicsChartLabel(n);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Минимальная сумма для подписи факта у точки (кроме последнего месяца) — жёсткий отбор. */
const CASHFLOW_LABEL_MIN_RUB_FACT = 20_000_000;
/** План — больше подписей для читаемости кривой. */
const CASHFLOW_PLAN_LABEL_MIN_RUB = 5_000_000;
const CHART_LABEL_FONT_PX = 11;
const APPROX_LABEL_H_PX = CHART_LABEL_FONT_PX + 3;
const CHART_MARGIN_TOP_LIGHT_LABELS = 40;
/** Отступ снизу: ось X + запас под тики месяцев (подписи значений не заходят в эту зону). */
const CHART_MARGIN_BOTTOM = 32;
/** Минимальный зазор (px) между низом области подписей значений и верхом зоны месяцев оси X. */
const X_AXIS_LABEL_BAND_RESERVE = 40;
/** Факт — выше точки, слева; план — выше точки, справа (без подписей под точкой — не заезжаем на ось X). */
const LABEL_OFFSET_FACT_ABOVE = 14;
const LABEL_OFFSET_PLAN_ABOVE = 14;
const LABEL_FACT_DX = 10;
const LABEL_PLAN_DX = 10;
/** Если маркер близко к нулю (низ графика), дополнительно поднимаем подписи. */
const NEAR_X_AXIS_PX = 72;
const NEAR_AXIS_LIFT_MAX = 28;

function isMajorDeviationRow(row: CashflowChartRow): boolean {
  if (row.fact == null || row.deviation == null) return false;
  const m = Math.max(row.plan, row.fact, 1);
  return Math.abs(row.deviation) >= CASHFLOW_LABEL_MIN_RUB_FACT || Math.abs(row.deviation) >= 0.22 * m;
}

function isStrictLocalPeak(arr: (number | null)[], i: number): boolean {
  const v = arr[i];
  if (v == null || v <= 0) return false;
  const n = arr.length;
  if (n === 1) return true;
  const l = i > 0 ? arr[i - 1] : null;
  const r = i < n - 1 ? arr[i + 1] : null;
  const lv = i > 0 ? (l ?? 0) : Number.NEGATIVE_INFINITY;
  const rv = i < n - 1 ? (r ?? 0) : Number.NEGATIVE_INFINITY;
  if (i === 0) return v > rv;
  if (i === n - 1) return v > lv;
  return v > lv && v > rv;
}

function argMaxIndexDefined(arr: (number | null)[]): number {
  let bi = -1;
  let bv = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v == null) continue;
    if (v > bv) {
      bv = v;
      bi = i;
    }
  }
  return bi;
}

function cashflowPointLabelSets(chartData: CashflowChartRow[]): {
  showFact: Set<number>;
  showPlan: Set<number>;
} {
  const n = chartData.length;
  const showFact = new Set<number>();
  const showPlan = new Set<number>();
  if (n === 0) return { showFact, showPlan };

  const facts = chartData.map((d) => d.fact);
  const plans = chartData.map((d) => d.plan);
  const maxFI = argMaxIndexDefined(facts);
  const maxPI = argMaxIndexDefined(plans);
  const last = n - 1;

  for (let i = 0; i < n; i++) {
    const d = chartData[i]!;
    const dev = isMajorDeviationRow(d);
    const peakF = isStrictLocalPeak(facts, i);
    const peakP = isStrictLocalPeak(plans, i);

    if (d.fact != null && d.fact !== 0) {
      const showFactHere =
        i === last ||
        (d.fact >= CASHFLOW_LABEL_MIN_RUB_FACT &&
          (peakF || (maxFI >= 0 && i === maxFI))) ||
        dev;
      if (showFactHere) showFact.add(i);
    }
    if (d.plan !== 0) {
      const showPlanHere =
        i === last ||
        d.plan >= CASHFLOW_PLAN_LABEL_MIN_RUB ||
        i % 2 === 0 ||
        peakP ||
        (maxPI >= 0 && i === maxPI) ||
        dev;
      if (showPlanHere) showPlan.add(i);
    }
  }

  return { showFact, showPlan };
}

function approxLabelWidthPx(text: string, fontPx: number): number {
  return Math.max(fontPx * 2, text.length * fontPx * 0.58);
}

function centeredRectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return Math.abs(ax - bx) < (aw + bw) / 2 && Math.abs(ay - by) < (ah + bh) / 2;
}

function CashflowTooltip({
  active,
  payload,
  darkChrome,
  mplPremium,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: CashflowChartRow }>;
  darkChrome: boolean;
  mplPremium: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as CashflowChartRow | undefined;
  if (!row) return null;
  const base = darkChrome
    ? "border-slate-500/45 bg-[#0b1220]/95 text-slate-100"
    : mplPremium
      ? "border-black/[0.04] bg-white/90 text-mpl-text backdrop-blur-md"
      : "border-mpl-border bg-mpl-card text-mpl-text";
  return (
    <div className={`rounded-lg px-3 py-2 text-xs shadow-lg ring-1 ${base}`}>
      <div className={`font-semibold ${darkChrome ? "text-slate-200" : "text-mpl-text"}`}>{row.label}</div>
      <div className={`font-semibold ${darkChrome ? "text-slate-200" : "text-mpl-text"}`}>{row.label}</div>
      <div className={`mt-1.5 text-[12px] font-medium leading-snug tabular-nums ${darkChrome ? "text-slate-200" : "text-mpl-text"}`}>
        {row.fact != null ? (
          <>
            <span className="text-[#1e40af]">Факт: {formatRubLabel(row.fact)}</span>
            <span className={darkChrome ? "text-slate-500" : "text-mpl-muted"}> / </span>
            <span className="text-orange-500">План: {formatRubLabel(row.plan)}</span>
          </>
        ) : (
          <span className="text-orange-500">План: {formatRubLabel(row.plan)}</span>
        )}
      </div>
      {row.fact != null && row.deviation != null ? (
        <div
          className={`mt-2 flex justify-between gap-4 border-t pt-1.5 tabular-nums ${darkChrome ? "border-slate-600/40" : mplPremium ? "border-black/[0.06]" : "border-mpl-border"}`}
        >
          <span className={darkChrome ? "text-slate-400" : "text-mpl-muted"}>Отклонение</span>
          <span className={row.deviation >= 0 ? "text-emerald-400" : "text-rose-400"}>{formatRubLabel(row.deviation)}</span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Подписи в координатах SVG (Recharts 3): масштабы из контекста графика.
 * Раньше использовался Customized + xAxisMap из Recharts 2 — в v3 эти props не приходят, слой был пустым.
 */
function CashflowDynamicsSvgLabels({
  chartData,
  presDark,
}: {
  chartData: CashflowChartRow[];
  presDark: boolean;
}) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const chartW = useChartWidth();
  const chartH = useChartHeight();
  const plot = usePlotArea();

  const presLight = !presDark;
  const factFill = presDark ? "#93c5fd" : "#1D4ED8";
  const planFill = presDark ? "#fdba74" : "#EA580C";
  const fontWeight = presLight ? 400 : 500;
  const opacity = presLight ? 0.9 : 1;

  const { showFact, showPlan } = useMemo(() => cashflowPointLabelSets(chartData), [chartData]);

  if (!xScale || !yScale || chartW == null || chartH == null || chartW <= 0 || chartH <= 0) {
    return null;
  }

  const halfH = APPROX_LABEL_H_PX / 2;
  const plotBottomY = plot && plot.height > 0 ? plot.y + plot.height : chartH - CHART_MARGIN_BOTTOM;
  /** Верхняя граница центра подписи (в координатах SVG): не опускаем в полосу тиков месяцев оси X. */
  const labelCenterYMax = plotBottomY - X_AXIS_LABEL_BAND_RESERVE - halfH;

  const padX = 8;
  const padTop = 8;

  function proximityLiftFromAxis(yPt: number): number {
    const dist = plotBottomY - yPt;
    if (dist >= NEAR_X_AXIS_PX) return 0;
    return NEAR_AXIS_LIFT_MAX * (1 - Math.max(0, dist) / NEAR_X_AXIS_PX);
  }

  return (
    <g pointerEvents="none">
      {chartData.map((row, i) => {
        const n = chartData.length;
        let cx = xScale(row.label, { position: "middle" }) ?? xScale(row.label);
        if (cx == null && plot && n > 0) {
          cx = plot.x + ((i + 0.5) / n) * plot.width;
        }
        const yPlanPt = yScale(row.plan);
        if (cx == null || yPlanPt == null) return null;
        const yFactPt = row.fact != null ? yScale(row.fact) : null;

        const showF = showFact.has(i);
        const showP = showPlan.has(i);

        const liftP = proximityLiftFromAxis(yPlanPt);
        const liftF = yFactPt != null ? proximityLiftFromAxis(yFactPt) : 0;
        let factY = yFactPt != null ? yFactPt - LABEL_OFFSET_FACT_ABOVE - liftF : 0;
        let planY = yPlanPt - LABEL_OFFSET_PLAN_ABOVE - liftP;

        let factX = cx - LABEL_FACT_DX;
        let planX = cx + LABEL_PLAN_DX;

        const factText = showF && row.fact != null ? formatCashShort(row.fact) : "";
        const planText = showP ? formatCashShort(row.plan) : "";
        if (!factText && !planText) return null;

        const wf = factText ? approxLabelWidthPx(factText, CHART_LABEL_FONT_PX) : 0;
        const wp = planText ? approxLabelWidthPx(planText, CHART_LABEL_FONT_PX) : 0;
        const hf = APPROX_LABEL_H_PX;
        const hp = APPROX_LABEL_H_PX;

        factX = clamp(factX, padX + wf, chartW - padX);
        planX = clamp(planX, padX, chartW - padX - wp);
        factY = clamp(factY, padTop + halfH, labelCenterYMax);
        planY = clamp(planY, padTop + halfH, labelCenterYMax);

        if (factText && planText) {
          const factCx = factX - wf / 2;
          const planCx = planX + wp / 2;
          if (centeredRectsOverlap(factCx, factY, wf, hf, planCx, planY, wp, hp)) {
            factY = clamp(factY - 10, padTop + halfH, labelCenterYMax);
            planY = clamp(planY - 6, padTop + halfH, labelCenterYMax);
          }
        }

        return (
          <g key={`${row.periodKey}-${i}`}>
            {factText ? (
              <text
                x={factX}
                y={factY}
                textAnchor="end"
                dominantBaseline="middle"
                fill={factFill}
                fontSize={CHART_LABEL_FONT_PX}
                fontWeight={fontWeight}
                opacity={opacity}
                className="tabular-nums"
              >
                {factText}
              </text>
            ) : null}
            {planText ? (
              <text
                x={planX}
                y={planY}
                textAnchor="start"
                dominantBaseline="middle"
                fill={planFill}
                fontSize={CHART_LABEL_FONT_PX}
                fontWeight={fontWeight}
                opacity={opacity}
                className="tabular-nums"
              >
                {planText}
              </text>
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

type Props = {
  rows: CashflowSeriesRow[];
  planScale: number;
  presentation: boolean;
  /** Пояснение к источникам плана / факта (под заголовком графика). */
  planSourceNote?: string;
};

const explainKicker = "text-[10px] font-semibold uppercase tracking-wide text-slate-600";

/** Блок «Источники и формулы» — только рабочий режим: светлая аналитика в духе KPI / сделок. */
function CashflowDynamicsWorkModeCalculationExplain() {
  const formulaCard =
    "rounded-lg border border-slate-200/80 bg-white/95 px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]";

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200/90 bg-gradient-to-br from-slate-100/90 via-white to-sky-50/45 p-3 shadow-[0_12px_28px_rgba(15,23,42,0.06)] shadow-[inset_0_1px_0_rgba(255,255,255,0.88)] sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="text-sm font-semibold tracking-tight text-slate-900">Источники данных и формулы</h4>
        <span className="inline-flex shrink-0 items-center rounded-md border border-amber-200/90 bg-amber-50/95 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
          CRM: не подключена
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="min-w-0 rounded-xl border border-amber-200/70 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/55 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
          <span className="inline-flex rounded-md border border-amber-200/80 bg-white/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
            План
          </span>
          <ul className="mt-2.5 space-y-2 text-[11px] leading-relaxed text-slate-700">
            <li className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400/90" aria-hidden />
              <span>
                Помесячные суммы по <span className="font-medium text-slate-900">графику платежей</span> (платёжный
                календарь).
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400/90" aria-hidden />
              <span>
                Источник: загруженный в рабочем режиме <span className="font-medium text-slate-900">CSV графика платежей</span>{" "}
                панели плана продаж.
              </span>
            </li>
          </ul>
        </div>
        <div className="min-w-0 rounded-xl border border-sky-200/70 bg-gradient-to-br from-sky-50/90 via-white to-blue-50/50 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
          <span className="inline-flex rounded-md border border-sky-200/80 bg-white/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-900">
            Факт
          </span>
          <ul className="mt-2.5 space-y-2 text-[11px] leading-relaxed text-slate-700">
            <li className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-sky-400/90" aria-hidden />
              <span>
                <span className="font-medium text-slate-900">Помесячный факт поступлений (mock)</span> — приращение
                показателя между соседними месяцами в локальном тестовом ряду (тот же принцип, что и у накопительного
                сальдо после подключения интеграции).
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-sky-400/90" aria-hidden />
              <span>
                Источник: <span className="font-medium text-slate-900">тестовые данные / локальный mock dataset</span>.
                CRM-интеграция пока не подключена.
              </span>
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200/80 bg-white/70 p-3 sm:p-3.5">
        <h5 className={explainKicker}>Формулы</h5>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className={formulaCard}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Помесячный план</div>
            <p className="mt-1 text-[12px] font-medium leading-snug tracking-tight text-slate-900 tabular-nums">
              Plan_month = Σ payments in month
            </p>
          </div>
          <div className={formulaCard}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Помесячный факт</div>
            <p className="mt-1 text-[12px] font-medium leading-snug tracking-tight text-slate-900 tabular-nums">
              Fact_month = Escrow_month − Escrow_previous_month
            </p>
          </div>
          <div className={formulaCard}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Нарастающий план</div>
            <p className="mt-1 text-[12px] font-medium leading-snug tracking-tight text-slate-900 tabular-nums">
              Plan_cum(n) = Σ Plan_i
            </p>
          </div>
          <div className={formulaCard}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Нарастающий факт</div>
            <p className="mt-1 text-[12px] font-medium leading-snug tracking-tight text-slate-900 tabular-nums">
              Fact_cum(n) = Σ Fact_i
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50/70 p-3 sm:p-3.5">
        <h5 className={explainKicker}>Почему линии обрываются по-разному</h5>
        <ul className="mt-2.5 space-y-2 text-[11px] leading-relaxed text-slate-700">
          <li className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden />
            <span>
              <span className="font-semibold text-slate-900">Факт</span> на графике строится из тестового ряда: после
              последнего месяца, для которого в mock заданы значения, точек нет — линия не продолжается в «будущее», чтобы
              не показывать выдуманные поступления.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden />
            <span>
              <span className="font-semibold text-slate-900">План</span> задан графиком платежей на весь горизонт CSV:
              будущие месяцы уже содержат запланированные суммы, поэтому пунктир плана продолжается вперёд по календарю
              графика.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}

export function SalesPlanCashflowDynamicsChart({ rows, planScale, presentation, planSourceNote }: Props) {
  const [mode, setMode] = useState<CashflowChartMode>("monthly");
  const mplPremium = useMarketingPresentationLight();
  const presDark = useMarketingPresVisual(presentation) === "presDark";

  const chartData = useMemo(() => cashflowRowsForChart(rows, mode, planScale), [rows, mode, planScale]);

  const { yDomainMax, yTicks } = useMemo(() => {
    const vals = chartData.flatMap((d) => [d.plan, d.fact].filter((x): x is number => x != null));
    const { domainMax, ticks } = cashflowYAxisScale(vals);
    return { yDomainMax: domainMax, yTicks: ticks };
  }, [chartData]);

  const segmentSurface = presDark ? "dark" : mplPremium && presentation ? "premium" : "light";

  if (chartData.length === 0) {
    return (
      <div
        className={
          presDark
            ? "rounded-xl border border-slate-600/45 bg-[#1e293b]/80 p-4 text-sm text-slate-400"
            : mplPremium && presentation
              ? `${MPL_PREMIUM_CHART_SHELL} p-4 text-sm text-mpl-muted`
              : presentation
                ? "rounded-xl border border-mpl-border bg-mpl-card p-4 text-sm text-mpl-muted"
                : "rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600"
        }
      >
        Нет данных поступлений по месяцам для графика.
      </div>
    );
  }

  const gridStroke = presDark ? "rgba(148,163,184,0.12)" : "rgba(148,163,184,0.35)";
  const axisColor = presDark ? "#94a3b8" : "#64748b";

  return (
    <div
      className={
        presDark
          ? "mb-7 overflow-visible rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4 shadow-sm sm:p-5"
          : mplPremium && presentation
            ? `mb-7 overflow-visible p-4 sm:p-5 ${MPL_PREMIUM_CHART_SHELL}`
            : presentation
              ? "mb-7 overflow-visible rounded-2xl border border-mpl-border bg-mpl-chart p-4 shadow-sm sm:p-5"
              : "mb-7 overflow-visible rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      }
    >
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className={`text-sm font-semibold ${presDark ? "text-slate-100" : presentation ? "text-mpl-text" : "text-slate-900"}`}>
            Динамика поступлений, ₽
          </h3>
          <p className={`mt-0.5 text-[11px] ${presDark ? "text-slate-500" : presentation ? "text-mpl-muted" : "text-slate-600"}`}>
            {planSourceNote ??
              "Факт — помесячные значения из локального mock dataset (CRM не подключена). План — загрузите CSV графика платежей в рабочем режиме панели плана продаж."}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode("monthly")}
            className={segmentedControlTabClass(mode === "monthly", segmentSurface)}
          >
            Помесячно
          </button>
          <button
            type="button"
            onClick={() => setMode("cumulative")}
            className={segmentedControlTabClass(mode === "cumulative", segmentSurface)}
          >
            Нарастающим итогом
          </button>
        </div>
      </div>

      <div className="min-w-0 overflow-visible overflow-x-visible overflow-y-visible pt-6 pb-4">
        <div className="h-[320px] min-h-[320px] w-full overflow-visible [&_svg]:overflow-visible">
          <ResponsiveContainer
            width="100%"
            height="100%"
            className="!overflow-visible [&_svg]:overflow-visible"
            style={{ overflow: "visible" }}
          >
            <LineChart
              data={chartData}
              margin={{
                top: presDark ? 30 : CHART_MARGIN_TOP_LIGHT_LABELS,
                right: 12,
                left: 10,
                bottom: CHART_MARGIN_BOTTOM,
              }}
            >
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 10 }} axisLine={{ stroke: gridStroke }} tickLine={false} />
            <YAxis
              domain={[0, yDomainMax]}
              ticks={yTicks}
              tick={{ fill: axisColor, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatCashflowYAxisMlnRub(Number(v))}
              width={88}
              allowDataOverflow
            />
            <Tooltip
              content={<CashflowTooltip darkChrome={presDark} mplPremium={mplPremium && presentation} />}
              cursor={{ stroke: presDark ? "rgba(148,163,184,0.35)" : "rgba(100,116,139,0.35)" }}
            />
            <Line
              type="monotone"
              dataKey="fact"
              name="Факт"
              stroke="#1e40af"
              strokeWidth={2.25}
              connectNulls={false}
              dot={{ r: 4, fill: "#1e40af", stroke: presDark ? "#0f172a" : "#fff", strokeWidth: 1 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="plan"
              name="План"
              stroke="#ea580c"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={{ r: 3.5, fill: "#ea580c", stroke: presDark ? "#0f172a" : "#fff", strokeWidth: 1 }}
              activeDot={{ r: 4.5 }}
              isAnimationActive={false}
            />
            <CashflowDynamicsSvgLabels chartData={chartData} presDark={presDark} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={`mt-3 flex flex-wrap items-center gap-4 text-[10px] ${presDark ? "text-slate-500" : presentation ? "text-mpl-muted" : "text-slate-600"}`}>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-6 rounded bg-[#1e40af]" />
          Факт
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-6 rounded border border-dashed border-orange-500 bg-transparent" />
          План
        </span>
      </div>
      {!presentation ? <CashflowDynamicsWorkModeCalculationExplain /> : null}
    </div>
  );
}
