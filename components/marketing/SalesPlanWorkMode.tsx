"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth/AuthProvider";
import { SALES_PLAN_EXPLAIN_SESSION_KEY } from "@/lib/salesPlanExplainSession";
import { SALES_PLAN_SPA } from "@/lib/salesPlanSpaRoutes";
import {
  SALES_PLAN_AVG_AUTO_TOLERANCE,
  SALES_PLAN_AVG_PRICE_METRICS,
  SALES_PLAN_CATEGORY_IDS,
  SALES_PLAN_CATEGORY_LABELS,
  SALES_PLAN_MAX_PERCENT_EXECUTION,
  SALES_PLAN_METRIC_LABELS,
  SALES_PLAN_METRIC_ORDER,
  SALES_PLAN_SCENARIO_LABELS,
  SALES_PLAN_TERMINATION_LABELS,
  type SalesPlanCategoryId,
  type SalesPlanCategoryValues,
  type SalesPlanHistoryEntry,
  type SalesPlanHistoryField,
  type SalesPlanMetricKind,
  type SalesPlanScenarioId,
  type SalesPlanTerminationId,
  type SalesPlanWorkGrid,
  buildDefaultSalesPlanWorkGrid,
  cloneGrid,
  computeAvgPriceFromRevenueArea,
  deriveSalesPlanRow,
  diffGridsToHistory,
  gapDduVsEscrow,
  getEffectiveCategoryValues,
  loadSalesPlanWorkPersisted,
  percentOfTotalFact,
  persistSalesPlanWork,
  sumFactCumulativeForMetric,
  syncAutoAvgPriceRows,
  validateAvgPriceAutoVsComputed,
  validateSalesPlanCategoryValues,
} from "@/lib/salesPlanWorkModel";

const INPUT_ROW =
  "h-9 w-full min-w-[3.5rem] rounded-lg border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-900 tabular-nums disabled:bg-slate-100 disabled:text-slate-500";

const panelClass = "rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4";

const numFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const pctFmt = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const rubFmt = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

function compactRub(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${n < 0 ? "−" : ""}${numFmt.format(Math.round(abs / 1_000_000))} млн ₽`;
  return rubFmt.format(n);
}

function formatCell(metric: SalesPlanMetricKind, n: number): string {
  if (metric === "quantity") return numFmt.format(Math.round(n));
  if (metric === "area_total" || metric === "area_weighted") return numFmt.format(Math.round(n * 100) / 100);
  if (metric === "revenue_ddu" || metric === "cashflow_escrow") return compactRub(n);
  if (metric === "avg_price_total_m2" || metric === "avg_price_weighted_m2") return compactRub(n);
  return numFmt.format(n);
}

/** Значения в журнале могли быть сохранены со старыми идентификаторами метрик. */
function formatHistoryCell(metric: string, n: number): string {
  if (metric === "units") return formatCell("quantity", n);
  if (metric === "revenue") return formatCell("revenue_ddu", n);
  if (metric === "avgPrice") return `${numFmt.format(Math.round(n))} ₽`;
  return formatCell(metric as SalesPlanMetricKind, n);
}

function historyMetricLabel(m: string): string {
  if (m === "units") return `${SALES_PLAN_METRIC_LABELS.quantity} (импорт)`;
  if (m === "revenue") return `${SALES_PLAN_METRIC_LABELS.revenue_ddu} (импорт)`;
  if (m === "avgPrice") return "Средняя цена (старый формат)";
  return SALES_PLAN_METRIC_LABELS[m as SalesPlanMetricKind] ?? m;
}

function historyFieldLabel(f: SalesPlanHistoryField): string {
  if (f === "planProject") return "План (проект)";
  if (f === "planMonth") return "План (мес.)";
  if (f === "factMonth") return "Факт (мес.)";
  if (f === "planCumulative") return "План (накопит.)";
  if (f === "factCumulative") return "Факт (накопит.)";
  return "Режим ввода (0=авто, 1=вручную)";
}

function gridsEqual(a: SalesPlanWorkGrid, b: SalesPlanWorkGrid) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const NON_NEGATIVE_FIELDS = new Set<keyof SalesPlanCategoryValues>([
  "planProject",
  "planMonth",
  "planCumulative",
  "factMonth",
  "factCumulative",
]);

export type SalesPlanWorkModeHandle = {
  save: () => Promise<void>;
  cancel: () => void;
};

type Props = {
  /** Показать компактную ссылку «к дашборду» сверху */
  dashboardHref?: string;
};

export const SalesPlanWorkMode = forwardRef<SalesPlanWorkModeHandle, Props>(function SalesPlanWorkMode(
  { dashboardHref },
  ref,
) {
  const router = useRouter();
  const { hydrated: authHydrated, role, token } = useAuth();
  const saveLockRef = useRef(false);
  const userLabel = useMemo(() => {
    if (!authHydrated) return "…";
    if (role === "admin") return "Администратор";
    if (role === "manager") return "Руководитель";
    if (role === "employee") return "Сотрудник";
    if (token) return "Пользователь";
    return "Гость";
  }, [authHydrated, role, token]);

  const [hydrated, setHydrated] = useState(false);
  const [committed, setCommitted] = useState<SalesPlanWorkGrid>(() => buildDefaultSalesPlanWorkGrid());
  const [draft, setDraft] = useState<SalesPlanWorkGrid>(() => cloneGrid(buildDefaultSalesPlanWorkGrid()));
  const [history, setHistory] = useState<SalesPlanHistoryEntry[]>([]);
  const [scenario, setScenario] = useState<SalesPlanScenarioId>("base");
  const [termination, setTermination] = useState<SalesPlanTerminationId>("with_terminations");
  const [metric, setMetric] = useState<SalesPlanMetricKind>("quantity");
  const [editingEnabled, setEditingEnabled] = useState(false);

  useEffect(() => {
    const loaded = loadSalesPlanWorkPersisted();
    if (loaded) {
      setCommitted(loaded.grid);
      setDraft(cloneGrid(loaded.grid));
      setHistory(loaded.history);
    } else {
      const def = buildDefaultSalesPlanWorkGrid();
      setCommitted(def);
      setDraft(cloneGrid(def));
      setHistory([]);
    }
    setHydrated(true);
  }, []);

  const dirty = useMemo(() => !gridsEqual(draft, committed), [draft, committed]);

  const dataSlice = useMemo(
    () => (editingEnabled ? draft : committed)[scenario][termination],
    [editingEnabled, draft, committed, scenario, termination],
  );

  const sumFactForMetric = useMemo(() => sumFactCumulativeForMetric(dataSlice, metric), [dataSlice, metric]);

  const setCell = useCallback(
    (categoryId: SalesPlanCategoryId, field: keyof SalesPlanCategoryValues, raw: string) => {
      if (!editingEnabled) return;
      const v = Number(raw.replace(/\s/g, "").replace(",", "."));
      if (Number.isNaN(v)) return;
      const value = NON_NEGATIVE_FIELDS.has(field) ? Math.max(0, v) : v;
      setDraft((prev) => {
        const next = cloneGrid(prev);
        const row = next[scenario][termination][metric][categoryId];
        next[scenario][termination][metric][categoryId] = { ...row, [field]: value };
        return next;
      });
    },
    [editingEnabled, scenario, termination, metric],
  );

  const setAvgCell = useCallback(
    (
      avgMetric: (typeof SALES_PLAN_AVG_PRICE_METRICS)[number],
      categoryId: SalesPlanCategoryId,
      field: keyof SalesPlanCategoryValues,
      raw: string,
    ) => {
      if (!editingEnabled) return;
      const v = Number(raw.replace(/\s/g, "").replace(",", "."));
      if (Number.isNaN(v)) return;
      const value = NON_NEGATIVE_FIELDS.has(field) ? Math.max(0, v) : v;
      setDraft((prev) => {
        const next = cloneGrid(prev);
        const row = next[scenario][termination][avgMetric][categoryId];
        if (row.isManualOverride !== true) return prev;
        next[scenario][termination][avgMetric][categoryId] = { ...row, [field]: value };
        return next;
      });
    },
    [editingEnabled, scenario, termination],
  );

  const setAvgManualOverride = useCallback(
    (
      avgMetric: (typeof SALES_PLAN_AVG_PRICE_METRICS)[number],
      categoryId: SalesPlanCategoryId,
      manual: boolean,
    ) => {
      if (!editingEnabled) return;
      setDraft((prev) => {
        const next = cloneGrid(prev);
        const slice = next[scenario][termination];
        if (manual) {
          const eff = getEffectiveCategoryValues(slice, avgMetric, categoryId);
          slice[avgMetric][categoryId] = { ...eff, isManualOverride: true };
        } else {
          const rev = slice.revenue_ddu[categoryId];
          const area =
            avgMetric === "avg_price_total_m2" ? slice.area_total[categoryId] : slice.area_weighted[categoryId];
          slice[avgMetric][categoryId] = { ...computeAvgPriceFromRevenueArea(rev, area), isManualOverride: false };
        }
        return next;
      });
    },
    [editingEnabled, scenario, termination],
  );

  const save = useCallback(async () => {
    if (saveLockRef.current) return;
    saveLockRef.current = true;
    try {
      const synced = syncAutoAvgPriceRows(draft);
      const changes = diffGridsToHistory({
        before: committed,
        after: synced,
        userLabel,
        fields: ["planProject", "planMonth", "factMonth", "planCumulative", "factCumulative", "isManualOverride"],
      });
      setHistory((prev) => {
        const nextHistory = [...changes, ...prev];
        persistSalesPlanWork(synced, nextHistory);
        return nextHistory;
      });
      setCommitted(cloneGrid(synced));
      setDraft(cloneGrid(synced));
    } finally {
      saveLockRef.current = false;
    }
  }, [committed, draft, userLabel]);

  const cancel = useCallback(() => {
    setDraft(cloneGrid(committed));
  }, [committed]);

  useImperativeHandle(ref, () => ({ save, cancel }), [save, cancel]);

  const openPresentationExplain = useCallback(() => {
    const payload = {
      v: 2 as const,
      scenario,
      termination,
      grid: cloneGrid(draft),
      metricTab: metric,
      savedAt: new Date().toISOString(),
    };
    sessionStorage.setItem(SALES_PLAN_EXPLAIN_SESSION_KEY, JSON.stringify(payload));
    router.push(`${SALES_PLAN_SPA.explain}?source=work&from=work`);
  }, [scenario, termination, draft, metric, router]);

  const toggleEditing = (next: boolean) => {
    if (!next && editingEnabled && dirty) {
      const ok = window.confirm("Есть несохранённые изменения. Отключить редактирование и отменить их?");
      if (!ok) return;
      setDraft(cloneGrid(committed));
    }
    if (next) {
      setDraft(cloneGrid(committed));
    }
    setEditingEnabled(next);
  };

  const gridCols =
    "grid grid-cols-[minmax(6.5rem,1fr)_repeat(9,minmax(3.65rem,1fr))] gap-x-1 gap-y-1 text-[11px] sm:text-xs";
  const gridColsAvg =
    "grid grid-cols-[minmax(6.5rem,1fr)_minmax(4.25rem,0.9fr)_repeat(9,minmax(3.65rem,1fr))] gap-x-1 gap-y-1 text-[11px] sm:text-xs";

  const totals = useMemo(() => {
    let planProject = 0;
    let planMonth = 0;
    let factMonth = 0;
    let planCumulative = 0;
    let factCumulative = 0;
    for (const id of SALES_PLAN_CATEGORY_IDS) {
      const v = dataSlice[metric][id];
      planProject += v.planProject;
      planMonth += v.planMonth;
      factMonth += v.factMonth;
      planCumulative += v.planCumulative;
      factCumulative += v.factCumulative;
    }
    const d = deriveSalesPlanRow({
      planProject,
      planMonth,
      planCumulative,
      factMonth,
      factCumulative,
    });
    return { planProject, planMonth, factMonth, planCumulative, factCumulative, d };
  }, [dataSlice, metric]);

  return (
    <div className="w-full min-w-0 space-y-4 overflow-x-clip">
      {dashboardHref ? (
        <div className="text-sm text-slate-600">
          <Link href={dashboardHref} className="font-medium text-slate-800 underline-offset-2 hover:underline">
            ← К дашборду маркетинга
          </Link>
        </div>
      ) : null}

      <section className={panelClass}>
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">План продаж — рабочий режим</h2>
            <p className="mt-1 text-sm text-slate-600">
              Сценарий ГПР, учёт расторжений и отдельные блоки метрик (шт, м², ДДУ, эскроу). Правки сохраняются локально,
              ведётся журнал.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Редактирование</span>
            <button
              type="button"
              onClick={() => toggleEditing(!editingEnabled)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                editingEnabled ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-slate-100 text-slate-800 hover:bg-slate-200"
              }`}
            >
              {editingEnabled ? "Включено" : "Выключено"}
            </button>
            <button
              type="button"
              disabled={!editingEnabled || !dirty}
              onClick={() => void save()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Сохранить изменения
            </button>
            <button
              type="button"
              onClick={openPresentationExplain}
              disabled={!hydrated}
              className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 shadow-sm hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              💡 Сформировать презентацию
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap gap-2">
            <span className="w-full text-xs font-medium uppercase tracking-wide text-slate-500 sm:w-auto sm:py-1.5">
              Сценарий плана
            </span>
            {(["base", "updated", "forecast"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScenario(s)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  scenario === s ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {SALES_PLAN_SCENARIO_LABELS[s]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            <span className="w-full text-xs font-medium uppercase tracking-wide text-slate-500 sm:w-auto sm:py-1.5">
              Расторжения
            </span>
            {(["with_terminations", "without_terminations"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTermination(t)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  termination === t ? "bg-indigo-700 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {SALES_PLAN_TERMINATION_LABELS[t]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            <span className="w-full text-xs font-medium uppercase tracking-wide text-slate-500 sm:w-auto sm:py-1.5">
              Метрика
            </span>
            {SALES_PLAN_METRIC_ORDER.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetric(m)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition sm:text-sm ${
                  metric === m ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {SALES_PLAN_METRIC_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        {!hydrated ? <p className="text-sm text-slate-500">Загрузка данных…</p> : null}
        {dirty && editingEnabled ? (
          <p className="text-sm text-amber-800">Есть несохранённые правки в черновике.</p>
        ) : null}
      </section>

      <section className={panelClass}>
        <div className="overflow-x-auto">
          <div className={`min-w-[920px] ${gridCols} border-b border-slate-200 pb-2 font-semibold text-slate-500`}>
            <div className="py-1 uppercase tracking-wide">Категория</div>
            <div className="py-1 text-center uppercase tracking-wide">Проект</div>
            <div className="py-1 text-center uppercase tracking-wide">План мес.</div>
            <div className="py-1 text-center uppercase tracking-wide">Факт мес.</div>
            <div className="py-1 text-center uppercase tracking-wide">Δ мес.</div>
            <div className="py-1 text-center uppercase tracking-wide">План нак.</div>
            <div className="py-1 text-center uppercase tracking-wide">Факт нак.</div>
            <div className="py-1 text-center uppercase tracking-wide">Δ нак.</div>
            <div className="py-1 text-center uppercase tracking-wide">Вып. %</div>
            <div className="py-1 text-center uppercase tracking-wide">% итого</div>
          </div>
          {SALES_PLAN_CATEGORY_IDS.map((catId) => {
            const src = dataSlice[metric][catId];
            const d = deriveSalesPlanRow(src);
            const val = validateSalesPlanCategoryValues(src, d);
            const pctTotal = percentOfTotalFact(src.factCumulative, sumFactForMetric);
            const execDisplay = d.percentExecution == null ? "—" : `${pctFmt.format(d.percentExecution)}%`;
            return (
              <div key={catId} className="space-y-0.5">
                <div
                  className={`${gridCols} items-center border-b border-slate-100 py-1.5 last:border-b-0 hover:bg-slate-50/80`}
                >
                  <div className="font-medium text-slate-900">{SALES_PLAN_CATEGORY_LABELS[catId]}</div>
                  <input
                    className={INPUT_ROW}
                    disabled={!editingEnabled}
                    value={src.planProject}
                    onChange={(e) => setCell(catId, "planProject", e.target.value)}
                  />
                  <input
                    className={INPUT_ROW}
                    disabled={!editingEnabled}
                    value={src.planMonth}
                    onChange={(e) => setCell(catId, "planMonth", e.target.value)}
                  />
                  <input
                    className={INPUT_ROW}
                    disabled={!editingEnabled}
                    value={src.factMonth}
                    onChange={(e) => setCell(catId, "factMonth", e.target.value)}
                  />
                  <div className="text-center tabular-nums text-slate-700">{formatCell(metric, d.deviationMonth)}</div>
                  <input
                    className={INPUT_ROW}
                    disabled={!editingEnabled}
                    value={src.planCumulative}
                    onChange={(e) => setCell(catId, "planCumulative", e.target.value)}
                  />
                  <input
                    className={INPUT_ROW}
                    disabled={!editingEnabled}
                    value={src.factCumulative}
                    onChange={(e) => setCell(catId, "factCumulative", e.target.value)}
                  />
                  <div className="text-center tabular-nums text-slate-700">{formatCell(metric, d.deviationCumulative)}</div>
                  <div
                    className={`text-center tabular-nums ${
                      d.percentExecution != null && d.percentExecution > SALES_PLAN_MAX_PERCENT_EXECUTION
                        ? "text-amber-800"
                        : "text-slate-800"
                    }`}
                  >
                    {execDisplay}
                  </div>
                  <div className="text-center tabular-nums text-slate-700">
                    {pctTotal == null ? "—" : `${pctFmt.format(pctTotal)}%`}
                  </div>
                </div>
                {(val.errors.length > 0 || val.warnings.length > 0) && (
                  <ul className="mb-1 ml-2 list-inside list-disc text-[10px] text-amber-900">
                    {val.errors.map((x) => (
                      <li key={`e-${x}`}>{x}</li>
                    ))}
                    {val.warnings.map((x) => (
                      <li key={`w-${x}`}>{x}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          <div className={`${gridCols} items-center border-t-2 border-slate-300 bg-slate-50 py-2 font-semibold text-slate-800`}>
            <div>Итого</div>
            <div className="text-center tabular-nums">{formatCell(metric, totals.planProject)}</div>
            <div className="text-center tabular-nums">{formatCell(metric, totals.planMonth)}</div>
            <div className="text-center tabular-nums">{formatCell(metric, totals.factMonth)}</div>
            <div className="text-center tabular-nums">{formatCell(metric, totals.d.deviationMonth)}</div>
            <div className="text-center tabular-nums">{formatCell(metric, totals.planCumulative)}</div>
            <div className="text-center tabular-nums">{formatCell(metric, totals.factCumulative)}</div>
            <div className="text-center tabular-nums">{formatCell(metric, totals.d.deviationCumulative)}</div>
            <div className="text-center tabular-nums">
              {totals.d.percentExecution == null ? "—" : `${pctFmt.format(totals.d.percentExecution)}%`}
            </div>
            <div className="text-center tabular-nums">100%</div>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Выполнение % = факт накопит. / план накопит. «% итого» — доля факта накопит. строки в сумме по категориям (текущая
          метрика). Средняя стоимость ₽/м² — отдельный блок ниже; сводка ДДУ − эскроу — внизу.
        </p>
      </section>

      <section className={panelClass}>
        <h3 className="text-base font-semibold text-slate-900">Средняя стоимость</h3>
        <p className="text-xs text-slate-500">
          Две метрики: по общей и по приведённой площади. Режим «Авто» — значения из продаж ДДУ и м²; «Вручную» — как в PDF.
          При авто проверяется согласованность с ДДУ/м² (допуск {Math.round(SALES_PLAN_AVG_AUTO_TOLERANCE * 100)}%).
        </p>

        {(
          [
            { metric: "avg_price_total_m2" as const, subtitle: "По общей площади" },
            { metric: "avg_price_weighted_m2" as const, subtitle: "По приведённой площади" },
          ] as const
        ).map(({ metric: avgMetric, subtitle }) => {
          const sumFactAvg = sumFactCumulativeForMetric(dataSlice, avgMetric);
          let tPlanProject = 0;
          let tPlanMonth = 0;
          let tFactMonth = 0;
          let tPlanCumulative = 0;
          let tFactCumulative = 0;
          for (const id of SALES_PLAN_CATEGORY_IDS) {
            const v = getEffectiveCategoryValues(dataSlice, avgMetric, id);
            tPlanProject += v.planProject;
            tPlanMonth += v.planMonth;
            tFactMonth += v.factMonth;
            tPlanCumulative += v.planCumulative;
            tFactCumulative += v.factCumulative;
          }
          const tDerived = deriveSalesPlanRow({
            planProject: tPlanProject,
            planMonth: tPlanMonth,
            planCumulative: tPlanCumulative,
            factMonth: tFactMonth,
            factCumulative: tFactCumulative,
          });
          return (
            <div key={avgMetric} className="space-y-2 border-t border-slate-100 pt-4 first:border-t-0 first:pt-0">
              <h4 className="text-sm font-semibold text-slate-800">{subtitle}</h4>
              <p className="text-[11px] text-slate-500">{SALES_PLAN_METRIC_LABELS[avgMetric]}</p>
              <div className="overflow-x-auto">
                <div className={`min-w-[980px] ${gridColsAvg} border-b border-slate-200 pb-2 font-semibold text-slate-500`}>
                  <div className="py-1 uppercase tracking-wide">Категория</div>
                  <div className="py-1 text-center uppercase tracking-wide">Режим</div>
                  <div className="py-1 text-center uppercase tracking-wide">Проект</div>
                  <div className="py-1 text-center uppercase tracking-wide">План мес.</div>
                  <div className="py-1 text-center uppercase tracking-wide">Факт мес.</div>
                  <div className="py-1 text-center uppercase tracking-wide">Δ мес.</div>
                  <div className="py-1 text-center uppercase tracking-wide">План нак.</div>
                  <div className="py-1 text-center uppercase tracking-wide">Факт нак.</div>
                  <div className="py-1 text-center uppercase tracking-wide">Δ нак.</div>
                  <div className="py-1 text-center uppercase tracking-wide">Вып. %</div>
                  <div className="py-1 text-center uppercase tracking-wide">% итого</div>
                </div>
                {SALES_PLAN_CATEGORY_IDS.map((catId) => {
                  const stored = dataSlice[avgMetric][catId];
                  const manual = stored.isManualOverride === true;
                  const display = manual ? stored : getEffectiveCategoryValues(dataSlice, avgMetric, catId);
                  const d = deriveSalesPlanRow(display);
                  const valBase = validateSalesPlanCategoryValues(display, d);
                  const valAuto = manual ? { errors: [] as string[], warnings: [] as string[] } : validateAvgPriceAutoVsComputed(dataSlice, avgMetric, catId);
                  const val = {
                    errors: [...valBase.errors],
                    warnings: [...valBase.warnings, ...valAuto.warnings],
                  };
                  const pctTotal = percentOfTotalFact(display.factCumulative, sumFactAvg);
                  const execDisplay = d.percentExecution == null ? "—" : `${pctFmt.format(d.percentExecution)}%`;
                  const modeCol = (
                    <div className="flex flex-col gap-1">
                      <div className="flex gap-0.5">
                        <button
                          type="button"
                          disabled={!editingEnabled}
                          onClick={() => setAvgManualOverride(avgMetric, catId, false)}
                          className={`flex-1 rounded px-1 py-0.5 text-[10px] font-medium ${
                            !manual ? "bg-indigo-600 text-white" : "border border-slate-300 bg-white text-slate-600"
                          } disabled:opacity-50`}
                        >
                          Авто
                        </button>
                        <button
                          type="button"
                          disabled={!editingEnabled}
                          onClick={() => setAvgManualOverride(avgMetric, catId, true)}
                          className={`flex-1 rounded px-1 py-0.5 text-[10px] font-medium ${
                            manual ? "bg-indigo-600 text-white" : "border border-slate-300 bg-white text-slate-600"
                          } disabled:opacity-50`}
                        >
                          Вручную
                        </button>
                      </div>
                    </div>
                  );
                  return (
                    <div key={catId} className="space-y-0.5">
                      <div
                        className={`${gridColsAvg} items-center border-b border-slate-100 py-1.5 last:border-b-0 hover:bg-slate-50/80`}
                      >
                        <div className="font-medium text-slate-900">{SALES_PLAN_CATEGORY_LABELS[catId]}</div>
                        {modeCol}
                        <input
                          className={INPUT_ROW}
                          disabled={!editingEnabled || !manual}
                          value={Number.isFinite(display.planProject) ? display.planProject : 0}
                          onChange={(e) => setAvgCell(avgMetric, catId, "planProject", e.target.value)}
                        />
                        <input
                          className={INPUT_ROW}
                          disabled={!editingEnabled || !manual}
                          value={Number.isFinite(display.planMonth) ? display.planMonth : 0}
                          onChange={(e) => setAvgCell(avgMetric, catId, "planMonth", e.target.value)}
                        />
                        <input
                          className={INPUT_ROW}
                          disabled={!editingEnabled || !manual}
                          value={Number.isFinite(display.factMonth) ? display.factMonth : 0}
                          onChange={(e) => setAvgCell(avgMetric, catId, "factMonth", e.target.value)}
                        />
                        <div className="text-center tabular-nums text-slate-700">{formatCell(avgMetric, d.deviationMonth)}</div>
                        <input
                          className={INPUT_ROW}
                          disabled={!editingEnabled || !manual}
                          value={Number.isFinite(display.planCumulative) ? display.planCumulative : 0}
                          onChange={(e) => setAvgCell(avgMetric, catId, "planCumulative", e.target.value)}
                        />
                        <input
                          className={INPUT_ROW}
                          disabled={!editingEnabled || !manual}
                          value={Number.isFinite(display.factCumulative) ? display.factCumulative : 0}
                          onChange={(e) => setAvgCell(avgMetric, catId, "factCumulative", e.target.value)}
                        />
                        <div className="text-center tabular-nums text-slate-700">{formatCell(avgMetric, d.deviationCumulative)}</div>
                        <div
                          className={`text-center tabular-nums ${
                            d.percentExecution != null && d.percentExecution > SALES_PLAN_MAX_PERCENT_EXECUTION
                              ? "text-amber-800"
                              : "text-slate-800"
                          }`}
                        >
                          {execDisplay}
                        </div>
                        <div className="text-center tabular-nums text-slate-700">
                          {pctTotal == null ? "—" : `${pctFmt.format(pctTotal)}%`}
                        </div>
                      </div>
                      {(val.errors.length > 0 || val.warnings.length > 0) && (
                        <ul className="mb-1 ml-2 list-inside list-disc text-[10px] text-amber-900">
                          {val.errors.map((x) => (
                            <li key={`e-${avgMetric}-${catId}-${x}`}>{x}</li>
                          ))}
                          {val.warnings.map((x) => (
                            <li key={`w-${avgMetric}-${catId}-${x}`}>{x}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
                <div
                  className={`${gridColsAvg} items-center border-t-2 border-slate-300 bg-slate-50 py-2 font-semibold text-slate-800`}
                >
                  <div>Итого</div>
                  <div className="text-center text-[10px] text-slate-500">—</div>
                  <div className="text-center tabular-nums">{formatCell(avgMetric, tPlanProject)}</div>
                  <div className="text-center tabular-nums">{formatCell(avgMetric, tPlanMonth)}</div>
                  <div className="text-center tabular-nums">{formatCell(avgMetric, tFactMonth)}</div>
                  <div className="text-center tabular-nums">{formatCell(avgMetric, tDerived.deviationMonth)}</div>
                  <div className="text-center tabular-nums">{formatCell(avgMetric, tPlanCumulative)}</div>
                  <div className="text-center tabular-nums">{formatCell(avgMetric, tFactCumulative)}</div>
                  <div className="text-center tabular-nums">{formatCell(avgMetric, tDerived.deviationCumulative)}</div>
                  <div className="text-center tabular-nums">
                    {tDerived.percentExecution == null ? "—" : `${pctFmt.format(tDerived.percentExecution)}%`}
                  </div>
                  <div className="text-center tabular-nums">100%</div>
                </div>
              </div>
            </div>
          );
        })}

        <div className="border-t border-slate-200 pt-4">
          <h4 className="text-sm font-semibold text-slate-800">Сводка: ДДУ − эскроу (факт накопит.)</h4>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 pr-2 font-semibold">Линейка</th>
                  <th className="py-2 font-semibold">Разрыв, ₽</th>
                </tr>
              </thead>
              <tbody>
                {SALES_PLAN_CATEGORY_IDS.map((catId) => {
                  const r = dataSlice.revenue_ddu[catId];
                  const esc = dataSlice.cashflow_escrow[catId];
                  const gap = gapDduVsEscrow(r.factCumulative, esc.factCumulative);
                  return (
                    <tr key={catId} className="border-b border-slate-100">
                      <td className="py-2 font-medium text-slate-900">{SALES_PLAN_CATEGORY_LABELS[catId]}</td>
                      <td className="py-2 tabular-nums text-slate-800">{compactRub(gap)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className={panelClass}>
        <h3 className="text-sm font-semibold text-slate-900">Журнал изменений</h3>
        <p className="text-xs text-slate-500">
          После «Сохранить» фиксируются поле, старое и новое значение, сценарий, учёт расторжений, метрика и пользователь (роль из
          сессии).
        </p>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
          {history.length === 0 ? (
            <div className="p-4 text-sm text-slate-500">Записей пока нет.</div>
          ) : (
            <ul className="divide-y divide-slate-100 text-xs">
              {history.slice(0, 80).map((h) => (
                <li key={h.id} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-2">
                  <span className="shrink-0 font-mono text-slate-400">{new Date(h.at).toLocaleString("ru-RU")}</span>
                  <span className="font-medium text-slate-800">{h.userLabel}</span>
                  <span className="text-slate-600">
                    {SALES_PLAN_SCENARIO_LABELS[h.scenario]} ·{" "}
                    {SALES_PLAN_TERMINATION_LABELS[h.termination ?? "with_terminations"]} · {historyMetricLabel(String(h.metric))}{" "}
                    · {SALES_PLAN_CATEGORY_LABELS[h.categoryId]}
                  </span>
                  <span className="text-slate-700">
                    {h.field === "isManualOverride" ? (
                      <>
                        {historyFieldLabel(h.field)}: {h.oldValue ? "вручную" : "авто"} →{" "}
                        {h.newValue ? "вручную" : "авто"}
                      </>
                    ) : (
                      <>
                        {historyFieldLabel(h.field)}: {formatHistoryCell(String(h.metric), h.oldValue)} →{" "}
                        {formatHistoryCell(String(h.metric), h.newValue)}
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
});
