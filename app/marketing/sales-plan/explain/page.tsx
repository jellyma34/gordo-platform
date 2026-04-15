"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { SalesPlanPresentationExplainView } from "@/components/marketing/SalesPlanPresentationExplainView";
import {
  buildSalesPlanChartExplainBundle,
  buildSalesPlanPresentationExplainBlocks,
  computeSalesPlanDashboardExplainContext,
} from "@/lib/buildSalesPlanPresentationExplain";
import { buildSalesPlanWorkModeExplainBlocks } from "@/lib/buildSalesPlanWorkModeExplain";
import { marketingSalesReportMock } from "@/lib/marketingSalesReportData";
import {
  buildDynamicsKpiInputFromReport,
  buildDynamicsKpiItems,
  type SalesPlanKpiPeriod,
} from "@/lib/salesPlanDynamicsKpi";
import { parseSalesPlanExplainSession, readSalesPlanExplainSessionRaw } from "@/lib/salesPlanExplainSession";
import type { SalesPlanExplainSessionPayload } from "@/lib/salesPlanExplainSession";
import type { SalesPlanPresentationExplainBlock } from "@/lib/buildSalesPlanPresentationExplain";
import {
  SALES_PLAN_SPA,
  parsePresentationScenarioQuery,
  workScenarioToPresentationScenario,
} from "@/lib/salesPlanSpaRoutes";
import {
  SALES_PLAN_METRIC_LABELS,
  SALES_PLAN_SCENARIO_LABELS,
  SALES_PLAN_TERMINATION_LABELS,
} from "@/lib/salesPlanWorkModel";

function pick(v: string | null, fallback: string) {
  if (!v || v.trim() === "") return fallback;
  return v;
}

function parsePeriodForPresentation(v: string | null): SalesPlanKpiPeriod {
  if (v === "quarter" || v === "month") return v;
  return "month";
}

function SalesPlanPresentationExplainPageInner() {
  const sp = useSearchParams();
  const source = sp.get("source") === "work" ? "work" : "dashboard";
  const objectId = pick(sp.get("objectId"), "all");
  const dealTypeId = pick(sp.get("dealTypeId"), "all");
  const from = sp.get("from");
  const backHref =
    source === "work" && (from === "work" || from === "plan_edit")
      ? SALES_PLAN_SPA.work
      : from === "marketing_edit"
        ? "/edit/marketing"
        : from === "edit"
          ? SALES_PLAN_SPA.work
          : SALES_PLAN_SPA.presentation;

  const periodParam = sp.get("period");
  const scenarioParam = sp.get("scenario");
  const kpiGranularity = parsePeriodForPresentation(periodParam);
  const explainKpiItems = useMemo(
    () =>
      buildDynamicsKpiItems(
        buildDynamicsKpiInputFromReport(marketingSalesReportMock, objectId, dealTypeId, kpiGranularity),
        true,
      ),
    [objectId, dealTypeId, kpiGranularity],
  );
  const dashboardPresentationHref = useMemo(() => {
    const scen = parsePresentationScenarioQuery(scenarioParam);
    const q = new URLSearchParams({
      from: "explain",
      source: "dashboard",
      objectId,
      dealTypeId,
      scenario: scen,
      period: parsePeriodForPresentation(periodParam),
    });
    return `${SALES_PLAN_SPA.presentation}?${q.toString()}`;
  }, [objectId, dealTypeId, periodParam, scenarioParam]);

  const dashboardExplainContext = useMemo(
    () => computeSalesPlanDashboardExplainContext(marketingSalesReportMock, objectId, dealTypeId, kpiGranularity),
    [objectId, dealTypeId, kpiGranularity],
  );
  const dashboardChartExplainBundle = useMemo(
    () => buildSalesPlanChartExplainBundle(dashboardExplainContext),
    [dashboardExplainContext],
  );
  const dashboardBlocks = useMemo(
    () => buildSalesPlanPresentationExplainBlocks(marketingSalesReportMock, objectId, dealTypeId, kpiGranularity),
    [objectId, dealTypeId, kpiGranularity],
  );

  const [workReady, setWorkReady] = useState<{
    blocks: SalesPlanPresentationExplainBlock[];
    payload: SalesPlanExplainSessionPayload;
  } | null>(null);
  const [workErr, setWorkErr] = useState<string | null>(null);

  useEffect(() => {
    if (source !== "work") return;
    const raw = readSalesPlanExplainSessionRaw();
    const p = parseSalesPlanExplainSession(raw);
    if (!p) {
      setWorkErr(
        "Не удалось прочитать снимок таблицы. Вернитесь в рабочий режим, откройте план и нажмите «Сформировать презентацию» снова.",
      );
      setWorkReady(null);
      return;
    }
    setWorkErr(null);
    setWorkReady({ payload: p, blocks: buildSalesPlanWorkModeExplainBlocks(p) });
  }, [source]);

  if (source === "work") {
    if (workErr) {
      return (
        <main className="min-h-screen bg-[#0f172a] px-3 py-6 text-slate-100 sm:px-4 md:px-6">
          <div className="mx-auto w-full max-w-[900px] space-y-4 rounded-2xl border border-rose-500/40 bg-slate-900/80 p-6">
            <h1 className="text-lg font-bold text-white">Нет данных для пояснения</h1>
            <p className="text-sm text-slate-300">{workErr}</p>
            <Link
              href={backHref}
              className="inline-flex rounded-lg border border-slate-600 bg-slate-950/80 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              ← Назад в рабочий режим
            </Link>
          </div>
        </main>
      );
    }
    if (!workReady) {
      return <div className="min-h-screen bg-[#0f172a] p-6 text-slate-400">Загрузка…</div>;
    }
    const { payload: p, blocks } = workReady;
    const scenarioLabel = SALES_PLAN_SCENARIO_LABELS[p.scenario];
    const metricLabel = SALES_PLAN_METRIC_LABELS[p.metricTab];
    const termLabel = SALES_PLAN_TERMINATION_LABELS[p.termination ?? "with_terminations"];
    const metaLine = `Сценарий: ${scenarioLabel} · ${termLabel} · Метрика: ${metricLabel} · Снимок: ${new Date(p.savedAt).toLocaleString("ru-RU")}`;
    const planScen = workScenarioToPresentationScenario(p.scenario);
    const presentationQ = new URLSearchParams({
      from: "explain",
      source: "work",
      scenario: planScen,
      workScenario: p.scenario,
      return: "work",
    });
    const presentationHref = `${SALES_PLAN_SPA.presentation}?${presentationQ.toString()}`;
    return (
      <SalesPlanPresentationExplainView
        backHref={backHref}
        blocks={blocks}
        introLead="Данные текущего рабочего режима на момент нажатия кнопки, включая несохранённые правки. Сценарий и сетка совпадают с тем, что вы редактировали."
        metaLine={metaLine}
        presentationHref={presentationHref}
        kpiItems={explainKpiItems}
        dashboardExplainContext={null}
        chartExplainBundle={null}
      />
    );
  }

  return (
    <SalesPlanPresentationExplainView
      backHref={backHref}
      blocks={dashboardBlocks}
      introLead="Те же данные, что и в дашборде презентации: отчёт по продажам и помесячный план/факт сделок с учётом выбранных фильтров объекта и типа сделки."
      metaLine={`Объект: ${objectId} · Тип сделки: ${dealTypeId}`}
      presentationHref={dashboardPresentationHref}
      kpiItems={explainKpiItems}
      dashboardExplainContext={dashboardExplainContext}
      chartExplainBundle={dashboardChartExplainBundle}
    />
  );
}

export default function SalesPlanPresentationExplainPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0f172a] p-6 text-slate-400">Загрузка…</div>}>
      <SalesPlanPresentationExplainPageInner />
    </Suspense>
  );
}
