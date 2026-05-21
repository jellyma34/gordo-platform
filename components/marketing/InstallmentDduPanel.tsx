"use client";

import { useMemo } from "react";
import { DduRevenueSection } from "@/components/marketing/dduRevenue/DduRevenueSection";
import { InstallmentAreaSection } from "@/components/marketing/installmentArea/InstallmentAreaSection";
import { ProjectValueSection } from "@/components/marketing/projectValue/ProjectValueSection";
import { useMarketingPresentationLight } from "@/components/marketing/marketingPresentationLightContext";
import {
  filterByObjectAndDealType,
  marketingMockData,
  mergeInstallmentPlanFact,
} from "@/lib/marketingMockData";
import type { MarketingPeriodGranularity } from "./MarketingFilters";
import { rechartsPresentationMiniTooltip } from "@/components/marketing/salesPlanCharts";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/charting/rechartsClient";

const PLAN_FILL = "rgba(148, 163, 184, 0.55)";
const CARD = "rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4 shadow-sm sm:p-5";
const CARD_EDIT = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5";

const moneyFmt = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

function factPayColor(plan: number, fact: number): string {
  if (fact >= plan) return "#22c55e";
  const gap = plan - fact;
  const pct = plan > 0 ? (gap / plan) * 100 : 0;
  if (pct > 8) return "#ef4444";
  return "#f59e0b";
}

type Props = {
  presentation: boolean;
  period: MarketingPeriodGranularity;
  objectId: string;
};

export function InstallmentDduPanel({ presentation, period, objectId }: Props) {
  const mplLight = useMarketingPresentationLight();
  const presDark = presentation && !mplLight;
  const card = presentation ? CARD : CARD_EDIT;
  const h4 = presentation ? "text-sm font-semibold text-slate-100" : "text-sm font-semibold text-slate-900";
  const sub = presentation ? "text-[11px] text-slate-500" : "text-[11px] text-slate-600";
  const axisColor = presentation ? "#94a3b8" : "#64748b";
  const gridColor = presentation ? "rgba(148,163,184,0.12)" : "rgba(100,116,139,0.15)";

  const { inst } = useMemo(() => {
    const gran = period === "month" ? "month" : "quarter";
    const plans = filterByObjectAndDealType(marketingMockData.installment.plans[gran], objectId, "all");
    const facts = filterByObjectAndDealType(marketingMockData.installment.facts[gran], objectId, "all");
    const merged = mergeInstallmentPlanFact(plans, facts).map((r) => ({
      ...r,
      factFill: factPayColor(r.plan, r.fact),
    }));
    const overdueItems = marketingMockData.installment.overdue.items.filter(
      (x) => objectId === "all" || !x.objectId || x.objectId === objectId,
    );
    return { inst: { ...marketingMockData.installment, merged, overdueItems } };
  }, [period, objectId]);

  return (
    <div className="flex flex-col gap-4">
      <InstallmentAreaSection
        presentation={presentation}
        presDark={presDark}
        mplPremium={mplLight}
        isEditMode={!presentation}
        period={period}
        objectId={objectId}
      />

      <DduRevenueSection
        presentation={presentation}
        presDark={presDark}
        mplPremium={mplLight}
        isEditMode={!presentation}
        period={period}
        objectId={objectId}
      />

      <ProjectValueSection
        presentation={presentation}
        presDark={presDark}
        mplPremium={mplLight}
        isEditMode={!presentation}
        period={period}
        objectId={objectId}
      />

      <div className={`${card} grid gap-4 sm:grid-cols-2`}>
        <div>
          <div className={`${sub} mb-1 uppercase tracking-wide`}>Сделки по ДДУ</div>
          <div className={`text-2xl font-bold tabular-nums ${presentation ? "text-slate-50" : "text-slate-900"}`}>
            {inst.totalDduDeals}
          </div>
        </div>
        <div>
          <div className={`${sub} mb-1 uppercase tracking-wide`}>Доля рассрочки</div>
          <div className={`text-2xl font-bold tabular-nums ${presentation ? "text-slate-50" : "text-slate-900"}`}>
            {inst.installmentSharePct}%
          </div>
          <div className={sub}>
            {inst.installmentDeals} из {inst.totalDduDeals} сделок с графиком платежей
          </div>
        </div>
      </div>

      <div className={card}>
        <h4 className={`${h4} mb-1`}>План / Факт поступлений (рассрочка)</h4>
        <p className={`${sub} mb-3`}>
          План — базовый столбец; факт — ряд для сравнения. Ниже плана — предупреждение / риск.
        </p>
        <div className="h-[280px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={inst.merged} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 10 }} axisLine={{ stroke: gridColor }} />
              <YAxis
                tick={{ fill: axisColor, fontSize: 9 }}
                axisLine={false}
                tickFormatter={(v) => `${Math.round(Number(v) / 1_000_000)}M`}
              />
              <Tooltip
                cursor={presentation ? { fill: "rgba(148,163,184,0.08)" } : undefined}
                content={
                  presentation ? rechartsPresentationMiniTooltip((n) => moneyFmt.format(n), { dataKey: "fact" }) : undefined
                }
                formatter={
                  presentation
                    ? undefined
                    : (value, name) => [moneyFmt.format(Number(value)), String(name) === "plan" ? "План" : "Факт"]
                }
                contentStyle={
                  presentation
                    ? undefined
                    : {
                        background: "#0f172a",
                        border: "1px solid rgba(148,163,184,0.35)",
                        borderRadius: 8,
                        fontSize: 12,
                      }
                }
                labelStyle={presentation ? undefined : { color: "#e2e8f0" }}
              />
              <Bar dataKey="plan" name="plan" fill={PLAN_FILL} radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Bar dataKey="fact" name="fact" radius={[4, 4, 0, 0]} maxBarSize={40}>
                {inst.merged.map((row) => (
                  <Cell key={row.periodKey} fill={row.factFill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={card}>
        <h4 className={`${h4} mb-3`}>Просрочки платежей</h4>
        <div className="mb-4 flex flex-wrap gap-4">
          <div
            className={
              presentation
                ? "rounded-xl border border-red-500/35 bg-red-950/20 px-4 py-3"
                : "rounded-xl border border-red-200 bg-red-50 px-4 py-3"
            }
          >
            <div className={sub}>Просроченных платежей</div>
            <div
              className={`text-xl font-bold tabular-nums ${presentation ? "text-red-300" : "text-red-700"}`}
            >
              {inst.overdue.count}
            </div>
          </div>
          <div
            className={
              presentation
                ? "rounded-xl border border-amber-500/35 bg-amber-950/20 px-4 py-3"
                : "rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
            }
          >
            <div className={sub}>Сумма просрочки</div>
            <div
              className={`text-xl font-bold tabular-nums ${presentation ? "text-amber-200" : "text-amber-900"}`}
            >
              {moneyFmt.format(inst.overdue.totalAmount)}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[280px] text-left text-xs">
            <thead>
              <tr className={presentation ? "border-b border-slate-600 text-slate-400" : "border-b border-slate-200 text-slate-600"}>
                <th className="py-2 pr-3 font-medium">Договор</th>
                <th className="py-2 pr-3 font-medium">Сумма</th>
                <th className="py-2 font-medium">Дней просрочки</th>
              </tr>
            </thead>
            <tbody>
              {inst.overdueItems.map((row) => (
                <tr
                  key={row.id}
                  className={
                    presentation
                      ? "border-b border-slate-700/50 text-slate-200"
                      : "border-b border-slate-100 text-slate-800"
                  }
                >
                  <td className="py-2 pr-3">{row.contract}</td>
                  <td className="py-2 pr-3 tabular-nums">{moneyFmt.format(row.amount)}</td>
                  <td className="py-2">
                    <span
                      className={
                        row.daysLate > 14
                          ? presentation
                            ? "font-semibold text-red-400"
                            : "font-semibold text-red-600"
                          : presentation
                            ? "font-medium text-amber-300"
                            : "font-medium text-amber-700"
                      }
                    >
                      {row.daysLate}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
