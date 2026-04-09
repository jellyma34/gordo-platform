"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import {
  filterByObjectAndDealType,
  marketingMockData,
  mergeSalesPlanFact,
  type FunnelStageRow,
} from "@/lib/marketingMockData";
import type { MarketingPeriodGranularity } from "./MarketingFilters";

const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false });
const BarChart = dynamic(() => import("recharts").then((m) => m.BarChart), { ssr: false });
const Bar = dynamic(() => import("recharts").then((m) => m.Bar), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((m) => m.CartesianGrid), { ssr: false });
const LineChart = dynamic(() => import("recharts").then((m) => m.LineChart), { ssr: false });
const Line = dynamic(() => import("recharts").then((m) => m.Line), { ssr: false });
const Cell = dynamic(() => import("recharts").then((m) => m.Cell), { ssr: false });

const PLAN_FILL = "rgba(148, 163, 184, 0.55)";
const CARD = "rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4 shadow-sm sm:p-5";
const CARD_EDIT = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5";

function factColor(plan: number, fact: number): string {
  if (fact >= plan) return "#22c55e";
  const gap = plan - fact;
  const pct = plan > 0 ? (gap / plan) * 100 : 0;
  if (pct > 15 || gap > 8) return "#ef4444";
  return "#f59e0b";
}

function SalesPlanFactTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { label: string; plan: number; fact: number; planDeals: number; factDeals: number; lagDays: number | null | undefined } }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]!.payload;
  const { plan, fact, planDeals, factDeals, lagDays } = p;
  const behind = fact < plan;
  const pctLag = plan > 0 && behind ? Math.round(((plan - fact) / plan) * 100) : 0;
  return (
    <div className="max-w-xs rounded-lg border border-slate-500/50 bg-[#0f172a] p-3 text-xs text-slate-200 shadow-xl">
      <div className="font-semibold text-slate-100">{p.label}</div>
      <div className="mt-2 space-y-1">
        <div>План: {plan} ед. · {planDeals} сделок</div>
        <div>Факт: {fact} ед. · {factDeals} сделок</div>
        {behind ? (
          <>
            <div className="text-amber-200/90">Отставание: {pctLag}% к плану</div>
            {lagDays != null && lagDays > 0 ? (
              <div className="text-slate-400">Задержка (оценка): {lagDays} дн.</div>
            ) : null}
          </>
        ) : (
          <div className="text-emerald-300/90">План выполнен или перевыполнен</div>
        )}
      </div>
    </div>
  );
}

function FunnelBlock({ stages, presentation }: { stages: FunnelStageRow[]; presentation: boolean }) {
  const conversions = useMemo(() => {
    const out: { from: string; to: string; pct: number }[] = [];
    for (let i = 0; i < stages.length - 1; i++) {
      const a = stages[i]!.count;
      const b = stages[i + 1]!.count;
      const pct = a > 0 ? Math.round((b / a) * 1000) / 10 : 0;
      out.push({ from: stages[i]!.name, to: stages[i + 1]!.name, pct });
    }
    return out;
  }, [stages]);

  const max = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className="space-y-3">
      {stages.map((s, i) => {
        const w = Math.max(18, (s.count / max) * 100);
        return (
          <div key={s.stage}>
            <div className="mb-1 flex justify-between text-xs">
              <span className={presentation ? "text-slate-300" : "text-slate-700"}>{s.name}</span>
              <span className={presentation ? "tabular-nums text-slate-200" : "tabular-nums text-slate-800"}>
                {s.count}
              </span>
            </div>
            <div
              className={
                presentation
                  ? "h-9 rounded-lg border border-slate-600/50 bg-slate-900/40"
                  : "h-9 rounded-lg border border-slate-200 bg-slate-50"
              }
              style={{ width: `${w}%` }}
            >
              <div
                className="flex h-full items-center justify-end rounded-lg bg-sky-600/80 pr-2 text-[11px] font-medium text-white"
                style={{ width: "100%" }}
              >
                {s.count}
              </div>
            </div>
            {i < conversions.length ? (
              <div
                className={
                  presentation ? "py-1.5 pl-2 text-[11px] text-sky-300/90" : "py-1.5 pl-2 text-[11px] text-sky-700"
                }
              >
                → {conversions[i]!.to}: {conversions[i]!.pct}% конверсия
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

type Props = {
  presentation: boolean;
  period: MarketingPeriodGranularity;
  objectId: string;
  dealTypeId: string;
};

export function SalesPlanPanel({ presentation, period, objectId, dealTypeId }: Props) {
  const card = presentation ? CARD : CARD_EDIT;
  const h4 = presentation ? "mb-1 text-sm font-semibold text-slate-100" : "mb-1 text-sm font-semibold text-slate-900";
  const sub = presentation ? "mb-3 text-[11px] text-slate-500" : "mb-3 text-[11px] text-slate-600";
  const foot = presentation ? "mt-2 text-[10px] text-slate-500" : "mt-2 text-[10px] text-slate-500";

  const merged = useMemo(() => {
    const gran = period === "month" ? "month" : "quarter";
    const plan = filterByObjectAndDealType(marketingMockData.salesPlan[gran], objectId, dealTypeId);
    const fact = filterByObjectAndDealType(marketingMockData.salesFact[gran], objectId, dealTypeId);
    return mergeSalesPlanFact(plan, fact);
  }, [period, objectId, dealTypeId]);

  const dynamics = useMemo(() => {
    return filterByObjectAndDealType(marketingMockData.salesDynamics, objectId, dealTypeId).map((d) => ({
      ...d,
      dateLabel: d.date,
    }));
  }, [objectId, dealTypeId]);

  const funnel = marketingMockData.funnel;

  const chartData = merged.map((r) => ({
    ...r,
    factFill: factColor(r.plan, r.fact),
  }));

  const axisColor = presentation ? "#94a3b8" : "#64748b";
  const gridColor = presentation ? "rgba(148,163,184,0.12)" : "rgba(100,116,139,0.15)";

  return (
    <div className="flex flex-col gap-4">
      <div className={card}>
        <h4 className={h4}>План / Факт продаж</h4>
        <p className={sub}>
          План — нижний ряд столбцов; факт — ряд сверху (сравнение по периодам). Цвет факта: зелёный при
          выполнении, жёлтый / красный при отставании.
        </p>
        <div className="h-[280px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 10 }} axisLine={{ stroke: gridColor }} />
              <YAxis tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} />
              <Tooltip content={<SalesPlanFactTooltip />} />
              <Bar dataKey="plan" name="План" fill={PLAN_FILL} radius={[4, 4, 0, 0]} maxBarSize={36} />
              <Bar dataKey="fact" name="Факт" radius={[4, 4, 0, 0]} maxBarSize={36}>
                {chartData.map((entry, i) => (
                  <Cell key={entry.periodKey} fill={entry.factFill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className={foot}>
          Подсказка: наведите на столбец — % отставания, число сделок, при наличии — дни задержки.
        </p>
      </div>

      <div className={card}>
        <h4 className={h4.replace("mb-1", "mb-3")}>Динамика продаж</h4>
        <div className="h-[220px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dynamics} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: axisColor, fontSize: 9 }} axisLine={{ stroke: gridColor }} />
              <YAxis tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid rgba(148,163,184,0.35)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#e2e8f0" }}
              />
              <Line type="monotone" dataKey="deals" name="Сделки" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={card}>
        <h4 className={h4.replace("mb-1", "mb-3")}>Воронка продаж</h4>
        <FunnelBlock stages={funnel} presentation={presentation} />
      </div>
    </div>
  );
}
