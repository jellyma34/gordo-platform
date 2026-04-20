"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";

import { numFmt } from "@/lib/salesPlanChartFormat";
import {
  funnelStepConversionRates,
  type SalesDealsMockDataset,
  type SalesFunnelStageRow,
} from "@/lib/salesDealsMockData";
import type { MarketingPeriodGranularity } from "./MarketingFilters";

const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false });
const BarChart = dynamic(() => import("recharts").then((m) => m.BarChart), { ssr: false });
const LineChart = dynamic(() => import("recharts").then((m) => m.LineChart), { ssr: false });
const Bar = dynamic(() => import("recharts").then((m) => m.Bar), { ssr: false });
const Line = dynamic(() => import("recharts").then((m) => m.Line), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((m) => m.CartesianGrid), { ssr: false });

const CARD_PRESENTATION =
  "rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4 shadow-sm sm:p-5";
const CARD_EDIT = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5";

type TrankeysDealRow = {
  deal?: {
    deal_date?: string;
  };
};

type TrankeysEnvelope = {
  status?: string;
  data?: TrankeysDealRow[];
};

function normalizeDealsApiJson(json: unknown): SalesDealsMockDataset | null {
  if (json == null || typeof json !== "object") return null;
  const root = json as TrankeysEnvelope;
  if (root.status !== "ok" || !Array.isArray(root.data)) return null;

  const items = root.data;
  const totalDeals = items.length;

  const byMonth = new Map<string, number>();
  for (const row of items) {
    const d = row.deal?.deal_date;
    if (typeof d !== "string" || d.length < 7) continue;
    const key = d.slice(0, 7);
    byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
  }

  const sortedKeys = [...byMonth.keys()].sort();
  const monthly = sortedKeys.map((periodKey) => {
    const factMonth = byMonth.get(periodKey) ?? 0;
    const [ys, ms] = periodKey.split("-");
    const y = Number(ys);
    const m = Number(ms);
    const label =
      Number.isFinite(y) && Number.isFinite(m)
        ? new Date(y, m - 1, 1).toLocaleDateString("ru-RU", { month: "short", year: "2-digit" })
        : periodKey;
    return {
      periodKey,
      label,
      factMonth,
      leadsMonth: 0,
      conversionPct: 0,
    };
  });

  const funnel: SalesFunnelStageRow[] = [
    { id: "leads", label: "Лиды", count: 0 },
    { id: "meetings", label: "Встречи", count: 0 },
    { id: "reservations", label: "Брони", count: 0 },
    { id: "deals", label: "Сделки", count: totalDeals },
  ];

  return {
    funnel,
    monthly,
    avgDealCycleDays: null,
  };
}

type Props = {
  presentation: boolean;
  period: MarketingPeriodGranularity;
  objectId: string;
  dealTypeId: string;
};

export function SalesDealsSection({ presentation, period, objectId, dealTypeId }: Props) {
  const [dataset, setDataset] = useState<SalesDealsMockDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const dealsUrl = new URL("/api/deals", window.location.origin).href;
      const res = await fetch(dealsUrl);
      const json: unknown = await res.json();
      if (!res.ok) {
        const msg =
          json && typeof json === "object" && "error" in json && typeof (json as { error: unknown }).error === "string"
            ? (json as { error: string }).error
            : `Ошибка ${res.status}`;
        setError(msg);
        setDataset(null);
        return;
      }
      const normalized = normalizeDealsApiJson(json);
      if (!normalized) {
        setError("Не удалось разобрать ответ API");
        setDataset(null);
        return;
      }
      setDataset(normalized);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
      setDataset(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const card = presentation ? CARD_PRESENTATION : CARD_EDIT;
  const h4 = presentation ? "text-sm font-semibold text-slate-100" : "text-sm font-semibold text-slate-900";
  const sub = presentation ? "text-[11px] text-slate-500" : "text-[11px] text-slate-600";
  const muted = presentation ? "text-slate-400" : "text-slate-500";
  const axisTick = presentation ? "#94a3b8" : "#64748b";
  const gridStroke = presentation ? "rgba(148,163,184,0.12)" : "rgba(100,116,139,0.15)";
  const tooltipShell = presentation
    ? "rounded-lg border border-slate-600/50 bg-[#0f172a]/95 px-2.5 py-1.5 text-[11px] text-slate-200"
    : "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-800";

  const stepRates = useMemo(
    () => (dataset ? funnelStepConversionRates(dataset.funnel) : []),
    [dataset],
  );

  const hasLeadsInMonthly = useMemo(
    () => dataset?.monthly.some((r) => r.leadsMonth > 0) ?? false,
    [dataset],
  );

  const funnelKpiSurface = presentation
    ? "relative overflow-hidden rounded-xl border border-cyan-500/20 bg-gradient-to-br from-slate-900/80 via-slate-900/50 to-slate-950/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    : "relative overflow-hidden rounded-xl border border-slate-200/90 bg-gradient-to-br from-white to-slate-50 p-3 shadow-sm";

  const cycleSurface = presentation
    ? "relative overflow-hidden rounded-xl border border-amber-500/15 bg-gradient-to-br from-slate-900/80 via-slate-900/50 to-slate-950/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    : "relative overflow-hidden rounded-xl border border-slate-200/90 bg-gradient-to-br from-white to-slate-50 p-3 shadow-sm";

  void period;
  void objectId;
  void dealTypeId;

  if (loading) {
    return (
      <div className={card}>
        <div className={`flex min-h-[200px] flex-col items-center justify-center gap-3 ${muted}`}>
          <div
            className={`h-8 w-8 animate-spin rounded-full border-2 border-t-transparent ${
              presentation ? "border-sky-400" : "border-slate-400"
            }`}
            aria-hidden
          />
          <p className="text-sm">Загрузка данных по сделкам…</p>
        </div>
      </div>
    );
  }

  if (error || !dataset) {
    return (
      <div className={card}>
        <div className={`rounded-lg border p-4 ${presentation ? "border-rose-500/30 bg-rose-950/20" : "border-rose-200 bg-rose-50"}`}>
          <p className={`text-sm font-medium ${presentation ? "text-rose-200" : "text-rose-800"}`}>
            Не удалось загрузить сделки
          </p>
          <p className={`mt-1 text-xs ${presentation ? "text-rose-300/90" : "text-rose-700"}`}>{error ?? "Неизвестная ошибка"}</p>
          <button
            type="button"
            onClick={() => void load()}
            className={
              presentation
                ? "mt-3 rounded-lg border border-slate-500/50 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10"
                : "mt-3 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
            }
          >
            Повторить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className={card}>
        <h3 className={h4}>Воронка продаж</h3>
        <p className={`mt-1 ${sub}`}>Этапы: лиды → встречи → брони → сделки. Доли перехода между этапами.</p>
        <p className={`mt-2 text-[10px] ${muted}`}>
          В выгрузке есть только зарегистрированные сделки; промежуточные этапы в JSON не передаются.
        </p>
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-stretch lg:justify-between">
          {dataset.funnel.map((stage, idx) => (
            <div key={stage.id} className="flex min-w-0 flex-1 items-center gap-2 lg:max-w-[22%]">
              <div className={`min-w-0 flex-1 ${funnelKpiSurface}`}>
                <div className={`text-[10px] font-bold uppercase tracking-wide ${presentation ? "text-cyan-200/80" : "text-slate-600"}`}>
                  {stage.label}
                </div>
                <div className={`mt-1 text-xl font-semibold tabular-nums ${presentation ? "text-slate-50" : "text-slate-900"}`}>
                  {stage.count > 0 || stage.id === "deals" ? numFmt.format(stage.count) : "—"}
                </div>
              </div>
              {idx < dataset.funnel.length - 1 ? (
                <div className={`hidden shrink-0 flex-col items-center px-1 text-center lg:flex`}>
                  <span className="text-lg text-slate-500" aria-hidden>
                    →
                  </span>
                  <span
                    className={`mt-0.5 text-[10px] font-semibold tabular-nums ${presentation ? "text-sky-300" : "text-sky-700"}`}
                  >
                    {stepRates[idx] != null && dataset.funnel[idx]!.count > 0
                      ? `${stepRates[idx]!.toFixed(1)}%`
                      : "—"}
                  </span>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div className={`mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] ${muted}`}>
          {dataset.funnel.slice(0, -1).map((stage, idx) => (
            <span key={`${stage.id}-rate`}>
              {stage.label} → {dataset.funnel[idx + 1]!.label}:{" "}
              <span className={`font-semibold tabular-nums ${presentation ? "text-slate-300" : "text-slate-700"}`}>
                {stepRates[idx] != null && stage.count > 0 ? `${stepRates[idx]!.toFixed(1)}%` : "—"}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className={card}>
          <h3 className={h4}>Сделки по месяцам</h3>
          <p className={`mt-1 ${sub}`}>Факт по месяцам (шт.) по дате сделки в выгрузке.</p>
          {dataset.monthly.length === 0 ? (
            <p className={`mt-8 text-center text-sm ${muted}`}>Нет сделок с датой для группировки по месяцам.</p>
          ) : (
            <div className="mt-3 h-[280px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dataset.monthly} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: axisTick, fontSize: 10 }} axisLine={{ stroke: gridStroke }} tickLine={false} />
                  <YAxis tick={{ fill: axisTick, fontSize: 10 }} axisLine={false} width={36} tickFormatter={(v) => numFmt.format(v)} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0]?.payload as (typeof dataset.monthly)[0] | undefined;
                      if (!row) return null;
                      return (
                        <div className={tooltipShell}>
                          <div className="font-semibold">{label}</div>
                          <div className="tabular-nums">Сделок: {numFmt.format(row.factMonth)}</div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="factMonth"
                    name="Сделки"
                    fill={presentation ? "#38bdf8" : "#0284c7"}
                    radius={[6, 6, 2, 2]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className={card}>
          <h3 className={h4}>Конверсия</h3>
          <p className={`mt-1 ${sub}`}>Сделки / лиды (%), динамика по месяцам.</p>
          {!hasLeadsInMonthly ? (
            <p className={`mt-8 text-center text-sm ${muted}`}>
              В этой выгрузке нет помесячных лидов — конверсию посчитать нельзя.
            </p>
          ) : (
            <div className="mt-3 h-[280px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dataset.monthly} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: axisTick, fontSize: 10 }} axisLine={{ stroke: gridStroke }} tickLine={false} />
                  <YAxis
                    tick={{ fill: axisTick, fontSize: 10 }}
                    axisLine={false}
                    width={40}
                    tickFormatter={(v) => `${v}%`}
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0]?.payload as (typeof dataset.monthly)[0] | undefined;
                      if (!row) return null;
                      return (
                        <div className={tooltipShell}>
                          <div className="font-semibold">{label}</div>
                          <div className="tabular-nums">Конверсия: {row.conversionPct.toFixed(1)}%</div>
                          <div className={`tabular-nums ${muted}`}>
                            Сделок {numFmt.format(row.factMonth)} / лидов {numFmt.format(row.leadsMonth)}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="conversionPct"
                    name="Сделки / лиды"
                    stroke={presentation ? "#a78bfa" : "#7c3aed"}
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: presentation ? "#c4b5fd" : "#7c3aed" }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {dataset.avgDealCycleDays != null ? (
        <div className={card}>
          <h3 className={h4}>Средний цикл сделки</h3>
          <p className={`mt-1 ${sub}`}>От лида до регистрации сделки.</p>
          <div className={`mt-3 ${cycleSurface}`}>
            <div className={`text-[10px] font-bold uppercase tracking-wide ${presentation ? "text-amber-200/75" : "text-slate-600"}`}>
              Дней
            </div>
            <div className={`mt-1 text-2xl font-semibold tabular-nums ${presentation ? "text-slate-50" : "text-slate-900"}`}>
              {numFmt.format(dataset.avgDealCycleDays)}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
