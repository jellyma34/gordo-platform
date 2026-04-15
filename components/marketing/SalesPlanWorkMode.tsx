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
  avgPricePerM2Total,
  avgPricePerM2Weighted,
  buildDefaultSalesPlanWorkGrid,
  cloneGrid,
  deriveSalesPlanRow,
  diffGridsToHistory,
  gapDduVsEscrow,
  loadSalesPlanWorkPersisted,
  percentOfTotalFact,
  persistSalesPlanWork,
  sumFactCumulativeForMetric,
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
  return "Факт (накопит.)";
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

  const save = useCallback(async () => {
    if (saveLockRef.current) return;
    saveLockRef.current = true;
    try {
      const changes = diffGridsToHistory({
        before: committed,
        after: draft,
        userLabel,
        fields: ["planProject", "planMonth", "factMonth", "planCumulative", "factCumulative"],
      });
      setHistory((prev) => {
        const nextHistory = [...changes, ...prev];
        persistSalesPlanWork(draft, nextHistory);
        return nextHistory;
      });
      setCommitted(cloneGrid(draft));
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
    "grid grid-cols-[minmax(6.5rem,1fr)_minmax(3.5rem,0.75fr)_repeat(9,minmax(3.75rem,1fr))] gap-x-1 gap-y-1 text-[11px] sm:text-xs";

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
          метрика). Средние ₽/м² и разрыв ДДУ−эскроу — в блоке ниже (по факту накопит.).
        </p>
      </section>

      <section className={panelClass}>
        <h3 className="text-sm font-semibold text-slate-900">Расчётные показатели (факт накопит.)</h3>
        <p className="text-xs text-slate-500">
          avg ₽/м² (общ.) = выручка ДДУ / общая площадь; avg ₽/м² (привед.) = ДДУ / приведённая площадь; разрыв = ДДУ − эскроу.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2 pr-2 font-semibold">Линейка</th>
                <th className="py-2 pr-2 font-semibold">₽/м² (общ.)</th>
                <th className="py-2 pr-2 font-semibold">₽/м² (привед.)</th>
                <th className="py-2 font-semibold">ДДУ − эскроу</th>
              </tr>
            </thead>
            <tbody>
              {SALES_PLAN_CATEGORY_IDS.map((catId) => {
                const r = dataSlice.revenue_ddu[catId];
                const at = dataSlice.area_total[catId];
                const aw = dataSlice.area_weighted[catId];
                const esc = dataSlice.cashflow_escrow[catId];
                const revF = r.factCumulative;
                const aTot = at.factCumulative;
                const aW = aw.factCumulative;
                const escF = esc.factCumulative;
                const p1 = avgPricePerM2Total(revF, aTot);
                const p2 = avgPricePerM2Weighted(revF, aW);
                const gap = gapDduVsEscrow(revF, escF);
                return (
                  <tr key={catId} className="border-b border-slate-100">
                    <td className="py-2 font-medium text-slate-900">{SALES_PLAN_CATEGORY_LABELS[catId]}</td>
                    <td className="py-2 tabular-nums text-slate-800">{p1 == null ? "—" : compactRub(p1)}</td>
                    <td className="py-2 tabular-nums text-slate-800">{p2 == null ? "—" : compactRub(p2)}</td>
                    <td className="py-2 tabular-nums text-slate-800">{compactRub(gap)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
                    {historyFieldLabel(h.field)}: {formatHistoryCell(String(h.metric), h.oldValue)} →{" "}
                    {formatHistoryCell(String(h.metric), h.newValue)}
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
