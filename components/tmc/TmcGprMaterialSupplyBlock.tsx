"use client";

import { useEffect, useMemo, useState } from "react";
import type { TMCItem } from "@/lib/tmcData";
import type { ConstructionObjectScope, GPRTask } from "@/lib/gprUtils";
import {
  buildGprTmcWorkLifecycleTimeline,
  buildTmcGprSupplyRiskRows,
  constructionScopeToPlanFactPartKey,
  logTmcGprProvisionManagementDiagnostic,
  summarizeTmcGprSupplyRisk,
} from "@/lib/tmcProcurementAnalytics";
import type { PlanFactTasksBarLevel } from "@/lib/planFactWorkTypeTimeline";
import { segmentedControlTabClass } from "@/components/marketing/marketingSegmentedControlClasses";
import { TmcGprSupplyRiskTable } from "@/components/tmc/TmcGprSupplyRiskTable";

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "red" | "amber" | "green" | "slate";
}) {
  const toneClass =
    tone === "red"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
      : tone === "amber"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
        : tone === "green"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : "border-slate-500/30 bg-slate-500/10 text-slate-300";

  return (
    <div className={`rounded-lg border px-4 py-3 text-center ${toneClass}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

export function TmcGprMaterialSupplyBlock({
  items,
  gprTasks = [],
  objectScope = 1,
  reportDate = new Date(),
}: {
  items: TMCItem[];
  gprTasks?: GPRTask[];
  objectScope?: ConstructionObjectScope;
  reportDate?: Date;
}) {
  const [barLevel, setBarLevel] = useState<PlanFactTasksBarLevel>("detailed");
  const [showAll, setShowAll] = useState(false);

  const partKey = useMemo(
    () => constructionScopeToPlanFactPartKey(objectScope),
    [objectScope],
  );

  const lifecycleRows = useMemo(
    () =>
      buildGprTmcWorkLifecycleTimeline({
        gprTasks,
        tmcItems: items,
        barLevel,
        partKey,
        reportDate,
      }),
    [gprTasks, items, barLevel, partKey, reportDate],
  );

  const riskRows = useMemo(
    () => buildTmcGprSupplyRiskRows(lifecycleRows, reportDate),
    [lifecycleRows, reportDate],
  );

  const summary = useMemo(() => summarizeTmcGprSupplyRisk(riskRows), [riskRows]);

  useEffect(() => {
    logTmcGprProvisionManagementDiagnostic(riskRows);
  }, [riskRows]);

  useEffect(() => {
    setShowAll(barLevel === "full");
  }, [barLevel]);

  const levelModes = [
    { id: "simplified" as const, label: "Упрощённо" },
    { id: "detailed" as const, label: "Детально" },
    { id: "full" as const, label: "Все этапы" },
  ];

  return (
    <div
      className="rounded-2xl border border-slate-600/45 bg-[#1e293b] p-6 shadow-[0_18px_48px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/[0.06]"
      data-pdf-chart-block
      data-pdf-section-title="Обеспечение ГПР материалами"
      style={{
        background: "linear-gradient(160deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.95) 100%)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-50">Обеспечение ГПР материалами</h3>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Контроль влияния ТМЦ на своевременное начало работ
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-600/70 bg-slate-900/50 p-0.5">
          {levelModes.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setBarLevel(m.id)}
              className={segmentedControlTabClass(barLevel === m.id, "dark")}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryCard label="Риск срыва" value={summary.disruption} tone="red" />
        <SummaryCard label="Риск" value={summary.risk} tone="amber" />
        <SummaryCard label="Обеспечено" value={summary.secured} tone="green" />
        <SummaryCard label="Ожидание" value={summary.waiting} tone="slate" />
      </div>

      <div className="mt-4 w-full min-w-0">
        {!showAll && riskRows.length > 10 ? (
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Топ-10 рисков
          </p>
        ) : null}
        <TmcGprSupplyRiskTable rows={riskRows} reportDate={reportDate} showAll={showAll} />
      </div>

      {!showAll && riskRows.length > 10 ? (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="rounded-lg border border-slate-600/60 bg-slate-900/50 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800/60"
          >
            Показать все ({riskRows.length})
          </button>
        </div>
      ) : null}

      {showAll && barLevel !== "full" && riskRows.length > 10 ? (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className="rounded-lg border border-slate-600/60 bg-slate-900/50 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800/60"
          >
            Топ-10 рисков
          </button>
        </div>
      ) : null}
    </div>
  );
}
