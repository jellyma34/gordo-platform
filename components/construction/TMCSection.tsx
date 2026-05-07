"use client";

import { useMemo, useRef, useState } from "react";
import { EditLayout } from "@/components/EditLayout";
import { useAppMode } from "@/components/mode/ModeProvider";
import { SuppliersBlock } from "@/components/tmc/SuppliersBlock";
import { TmcTable, type TmcTableHandle } from "@/components/tmc/TmcTable";
import { segmentedControlTabClass } from "@/components/marketing/marketingSegmentedControlClasses";
import {
  getStatusByDeviation,
  partIdToProjectPartKey,
  PROJECT_PARTS,
  type ConstructionObjectScope,
} from "@/lib/gprUtils";
import { getGprProjectId } from "@/lib/gprImportPersistence";
import {
  getTmcData,
  loadTmcInitialItems,
  tmcFactReferenceDate,
  tmcPlanReferenceDate,
  type TMCItem,
} from "@/lib/tmcData";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/charting/rechartsClient";

type Traffic = "green" | "yellow" | "red" | "gray" | "overdue_not_started";
type DrillKey = "completion" | "saving" | "delays" | "planned";

const COLORS = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
  gray: "#6b7280",
  overdue_not_started: "#dc2626",
  card: "#1e293b",
} as const;

function ms(iso: string | null) {
  if (!iso) return null;
  const value = new Date(`${iso}T00:00:00`).getTime();
  return Number.isNaN(value) ? null : value;
}

function deviationDays(item: TMCItem): number | null {
  const pr = tmcPlanReferenceDate(item);
  const fr = tmcFactReferenceDate(item);
  if (!pr || !fr) return null;
  const p = ms(pr);
  const f = ms(fr);
  if (p === null || f === null) return null;
  return Math.round((f - p) / (1000 * 60 * 60 * 24));
}

function statusOf(item: TMCItem): Traffic {
  const factRef = tmcFactReferenceDate(item);
  if (!factRef) {
    const planRef = tmcPlanReferenceDate(item);
    if (!planRef) return "gray";
    const p = ms(planRef);
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    if (p !== null && p < todayStart) return "overdue_not_started";
    return "gray";
  }
  const d = deviationDays(item);
  if (d === null) return "gray";
  return getStatusByDeviation(d) as Traffic;
}

export function TMCSection({
  activePartScope,
  onChangePartScope,
  hidePresentationPartStrip,
}: {
  activePartScope: ConstructionObjectScope;
  onChangePartScope: (scope: ConstructionObjectScope) => void;
  hidePresentationPartStrip?: boolean;
}) {
  const { mode } = useAppMode();
  const isPresentationSkin = mode === "presentation";
  const [activeDrill, setActiveDrill] = useState<DrillKey | null>(null);
  const tmcRef = useRef<TmcTableHandle>(null);
  const editPartId: 1 | 2 = activePartScope === "project" ? 1 : activePartScope;
  const activeProjectPart = partIdToProjectPartKey(editPartId);

  const partTabs =
    isPresentationSkin && hidePresentationPartStrip ? null : (
      <div className="mb-4 flex flex-wrap justify-center sm:justify-start">
        {isPresentationSkin ? (
          <div className="inline-flex rounded-lg border border-slate-600/70 bg-slate-900/50 p-0.5">
            {PROJECT_PARTS.map((part) => {
              const active = activePartScope === part.id;
              return (
                <button
                  key={part.id}
                  type="button"
                  onClick={() => onChangePartScope(part.id)}
                  className={segmentedControlTabClass(active, "dark")}
                >
                  {part.name}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {PROJECT_PARTS.map((part) => {
              const active = activePartScope === part.id;
              return (
                <button
                  key={part.id}
                  type="button"
                  onClick={() => onChangePartScope(part.id)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {part.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );

  if (mode !== "presentation") {
    return (
      <EditLayout
        title="Закупка ТМЦ"
        subtitle="Позиции по части проекта (жилой дом / автостоянка); график ГПР—ТМЦ использует те же данные."
        onSave={() => tmcRef.current?.save()}
        onCancel={() => tmcRef.current?.cancel()}
      >
        {partTabs}
        <TmcTable ref={tmcRef} embedded activePartId={editPartId} />
        <SuppliersBlock activePartId={editPartId} />
      </EditLayout>
    );
  }

  const enriched = useMemo(() => {
    const fromSnapshot = (part: "residential" | "parking"): TMCItem[] => {
      if (typeof window === "undefined") {
        return getTmcData(part);
      }
      try {
        return loadTmcInitialItems(getGprProjectId()).filter((i) => i.projectPart === part);
      } catch {
        return getTmcData(part);
      }
    };
    let items: TMCItem[] =
      activePartScope === "project"
        ? [...fromSnapshot("residential"), ...fromSnapshot("parking")]
        : fromSnapshot(activeProjectPart);
    return items.map((item) => {
      const traffic = statusOf(item);
      const dev = deviationDays(item);
      return { ...item, traffic, deviation: dev };
    });
  }, [activePartScope, activeProjectPart]);

  const supplierFeedItems = useMemo(
    () =>
      enriched.map((row) => {
        const { traffic: _tr, deviation: _dv, ...rest } = row;
        return rest;
      }),
    [enriched],
  );

  const totals = useMemo(() => {
    const plan = enriched.reduce((sum, i) => sum + i.planCost, 0);
    const fact = enriched.reduce((sum, i) => sum + (i.factCost ?? 0), 0);
    const completionPct = plan > 0 ? Math.round((fact / plan) * 100) : 0;
    const saving = enriched.reduce((sum, i) => sum + (i.planCost - (i.factCost ?? 0)), 0);
    const delays = enriched.filter((i) => (i.deviation ?? -999) > 0).length;
    const planned = enriched.filter((i) => !tmcFactReferenceDate(i)).length;
    const pie = {
      delivered: enriched.filter((i) => i.traffic === "green").length,
      risk: enriched.filter((i) => i.traffic === "yellow").length,
      overdue: enriched.filter((i) => i.traffic === "red").length,
      planned,
    };
    return { plan, fact, completionPct, saving, delays, planned, pie };
  }, [enriched]);

  const drillRows = useMemo(() => {
    if (!activeDrill) return [] as typeof enriched;
    if (activeDrill === "completion") return enriched;
    if (activeDrill === "saving") return enriched.filter((i) => i.factCost !== null);
    if (activeDrill === "delays") return enriched.filter((i) => (i.deviation ?? 0) > 0);
    return enriched.filter((i) => !tmcFactReferenceDate(i));
  }, [activeDrill, enriched]);

  return (
    <section className="space-y-4">
      {partTabs}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            key: "completion" as const,
            label: "Выполнение",
            value: `${totals.completionPct}%`,
            sub: `${(totals.fact / 1_000_000).toFixed(1)} / ${(totals.plan / 1_000_000).toFixed(1)} млн`,
            color: COLORS.green,
            traffic: (totals.completionPct > 0 ? "green" : "gray") as Traffic,
          },
          {
            key: "saving" as const,
            label: "Экономия / перерасход",
            value: `${totals.saving > 0 ? "+" : ""}${(totals.saving / 1_000_000).toFixed(1)} млн`,
            sub: "суммарно план − факт",
            color: totals.saving >= 0 ? COLORS.green : COLORS.red,
            traffic: (totals.saving > 0 ? "green" : totals.saving < 0 ? "red" : "gray") as Traffic,
          },
          {
            key: "delays" as const,
            label: "Просрочки",
            value: totals.delays,
            sub: "факт позже плана",
            color: COLORS.red,
            traffic: (totals.delays > 0 ? "red" : "gray") as Traffic,
          },
          {
            key: "planned" as const,
            label: "Не закуплено",
            value: totals.planned,
            sub: "status = план",
            color: COLORS.gray,
            traffic: "gray" as Traffic,
          },
        ].map((card) => {
          const active = activeDrill === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => setActiveDrill((prev) => (prev === card.key ? null : card.key))}
              data-traffic-card={card.traffic}
              className={`top-card card text-left p-5 backdrop-blur-[12px] transition-all ${
                active ? "scale-[1.02]" : ""
              }`}
              style={{
                borderLeft: `6px solid ${card.color}`,
                boxShadow: active ? `0 0 24px ${card.color}66` : undefined,
              }}
            >
              <div className="text-xs text-slate-300">{card.label}</div>
              <div className="mt-2 text-3xl font-bold text-white tabular-nums">{card.value}</div>
              <div className="mt-1 text-xs text-slate-400">{card.sub}</div>
              <div className="mt-3 h-1.5 w-full rounded-full bg-white/10">
                <div className="h-1.5 rounded-full" style={{ width: card.key === "completion" ? `${Math.min(100, totals.completionPct)}%` : "100%", backgroundColor: card.color }} />
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-700/60 bg-[#1e293b] p-6 shadow-sm lg:col-span-2">
          <h3 className="text-lg font-semibold text-slate-50">План vs Факт (стоимость)</h3>
          <div className="mt-4 h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={enriched.map((i) => ({ name: i.name, plan: i.planCost, fact: i.factCost ?? 0 }))}>
                <CartesianGrid stroke="rgba(148,163,184,0.18)" />
                <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} interval={0} angle={-15} height={60} textAnchor="end" />
                <YAxis tick={{ fill: "#94a3b8" }} />
                <Tooltip contentStyle={{ background: COLORS.card, border: "1px solid rgba(148,163,184,0.35)", color: "#e2e8f0" }} />
                <Line type="monotone" dataKey="plan" stroke="#94a3b8" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="fact" stroke={COLORS.green} strokeWidth={2.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700/60 bg-[#1e293b] p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-50">Распределение статусов</h3>
          <div className="mt-4 h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: "Поставлено", value: totals.pie.delivered },
                    { name: "Риск", value: totals.pie.risk },
                    { name: "Просрочка", value: totals.pie.overdue },
                    { name: "Не закуплено", value: totals.pie.planned },
                  ]}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={42}
                  outerRadius={78}
                  paddingAngle={2}
                >
                  <Cell fill={COLORS.green} />
                  <Cell fill={COLORS.yellow} />
                  <Cell fill={COLORS.red} />
                  <Cell fill={COLORS.gray} />
                </Pie>
                <Tooltip contentStyle={{ background: COLORS.card, border: "1px solid rgba(148,163,184,0.35)", color: "#e2e8f0" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <SuppliersBlock activePartId={editPartId} items={supplierFeedItems} variant="dark" />

      <div className="rounded-2xl border border-slate-700/60 bg-[#1e293b] p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-50">Детализация</h3>
        {!activeDrill ? (
          <p className="mt-3 text-sm text-slate-300">Кликните на карточку сверху, чтобы показать список позиций ТМЦ.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {drillRows.map((i) => {
              const color =
                i.traffic === "green"
                  ? COLORS.green
                  : i.traffic === "yellow"
                    ? COLORS.yellow
                    : i.traffic === "red" || i.traffic === "overdue_not_started"
                      ? COLORS.red
                      : COLORS.gray;
              return (
                <div key={i.id} className="flex items-center justify-between gap-4 rounded-xl border border-slate-700/60 bg-slate-900/25 p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-100">{i.name}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      Этап: {i.gprStage} • План/Факт: {(i.planCost / 1_000_000).toFixed(2)} / {((i.factCost ?? 0) / 1_000_000).toFixed(2)} млн
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs">
                    <div className="font-semibold tabular-nums" style={{ color }}>
                      {i.deviation === null ? "—" : i.deviation > 0 ? `+${i.deviation}` : i.deviation} дн
                    </div>
                    <div className="mt-1 rounded-full px-2 py-0.5 text-[11px] text-slate-900" style={{ backgroundColor: color }}>
                      {i.traffic === "green"
                        ? "поставлено"
                        : i.traffic === "yellow"
                          ? "риск"
                          : i.traffic === "red"
                            ? "просрочка"
                            : i.traffic === "overdue_not_started"
                              ? "не закуплено"
                              : "не закуплено"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
