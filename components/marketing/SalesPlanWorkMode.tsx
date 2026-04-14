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
import {
  SALES_PLAN_CATEGORY_IDS,
  SALES_PLAN_CATEGORY_LABELS,
  SALES_PLAN_METRIC_LABELS,
  SALES_PLAN_SCENARIO_LABELS,
  type SalesPlanCategoryId,
  type SalesPlanCategoryValues,
  type SalesPlanHistoryEntry,
  type SalesPlanHistoryField,
  type SalesPlanMetricKind,
  type SalesPlanScenarioId,
  type SalesPlanWorkGrid,
  buildDefaultSalesPlanWorkGrid,
  cloneGrid,
  deriveSalesPlanRow,
  diffGridsToHistory,
  loadSalesPlanWorkPersisted,
  persistSalesPlanWork,
} from "@/lib/salesPlanWorkModel";

const INPUT_ROW =
  "h-9 w-full min-w-[4.5rem] rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 tabular-nums disabled:bg-slate-100 disabled:text-slate-500";

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
  if (metric === "units") return numFmt.format(Math.round(n));
  if (metric === "revenue") return compactRub(n);
  return `${numFmt.format(Math.round(n))} ₽`;
}

function historyFieldLabel(f: SalesPlanHistoryField): string {
  if (f === "planMonth") return "План (мес.)";
  if (f === "factMonth") return "Факт (мес.)";
  return "План (накопит.)";
}

function gridsEqual(a: SalesPlanWorkGrid, b: SalesPlanWorkGrid) {
  return JSON.stringify(a) === JSON.stringify(b);
}

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
  const [metric, setMetric] = useState<SalesPlanMetricKind>("units");
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

  const setCell = useCallback(
    (categoryId: SalesPlanCategoryId, field: keyof SalesPlanCategoryValues, raw: string) => {
      if (!editingEnabled) return;
      const v = Number(raw.replace(/\s/g, "").replace(",", "."));
      if (Number.isNaN(v)) return;
      setDraft((prev) => {
        const next = cloneGrid(prev);
        const row = next[scenario][metric][categoryId];
        next[scenario][metric][categoryId] = { ...row, [field]: v };
        return next;
      });
    },
    [editingEnabled, scenario, metric],
  );

  const save = useCallback(async () => {
    if (saveLockRef.current) return;
    saveLockRef.current = true;
    try {
      const changes = diffGridsToHistory({
        before: committed,
        after: draft,
        userLabel,
        fields: ["planMonth", "factMonth", "planCumulative"],
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
      v: 1 as const,
      scenario,
      grid: cloneGrid(draft),
      metricTab: metric,
      savedAt: new Date().toISOString(),
    };
    sessionStorage.setItem(SALES_PLAN_EXPLAIN_SESSION_KEY, JSON.stringify(payload));
    router.push("/marketing/sales-plan/explain?source=work&from=plan_edit");
  }, [scenario, draft, metric, router]);

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
    "grid grid-cols-[minmax(7rem,1fr)_repeat(7,minmax(4.5rem,1fr))] gap-x-2 gap-y-1 text-xs sm:text-sm";

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
              Сценарии, метрика и таблица в стиле ГПР: правки сохраняются локально, ведётся журнал изменений.
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

        <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex flex-wrap gap-2">
            <span className="w-full text-xs font-medium uppercase tracking-wide text-slate-500 sm:w-auto sm:py-1.5">
              Сценарий
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
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
            <span className="w-full text-xs font-medium uppercase tracking-wide text-slate-500 sm:w-auto sm:py-1.5">
              Метрика
            </span>
            {(["units", "revenue", "avgPrice"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetric(m)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
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
          <div className={`min-w-[720px] ${gridCols} border-b border-slate-200 pb-2 font-semibold text-slate-500`}>
            <div className="py-1 text-[11px] uppercase tracking-wide">Категория</div>
            <div className="py-1 text-center text-[11px] uppercase tracking-wide">План мес.</div>
            <div className="py-1 text-center text-[11px] uppercase tracking-wide">Факт мес.</div>
            <div className="py-1 text-center text-[11px] uppercase tracking-wide">Δ мес.</div>
            <div className="py-1 text-center text-[11px] uppercase tracking-wide">План нак.</div>
            <div className="py-1 text-center text-[11px] uppercase tracking-wide">Факт нак.</div>
            <div className="py-1 text-center text-[11px] uppercase tracking-wide">Δ нак.</div>
            <div className="py-1 text-center text-[11px] uppercase tracking-wide">Выполн. %</div>
          </div>
          {SALES_PLAN_CATEGORY_IDS.map((catId) => {
            const src = (editingEnabled ? draft : committed)[scenario][metric][catId];
            const d = deriveSalesPlanRow(src);
            return (
              <div
                key={catId}
                className={`${gridCols} items-center border-b border-slate-100 py-2 last:border-b-0 hover:bg-slate-50/80`}
              >
                <div className="font-medium text-slate-900">{SALES_PLAN_CATEGORY_LABELS[catId]}</div>
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
                <div className="text-center tabular-nums text-slate-700">{formatCell(metric, d.deltaMonth)}</div>
                <input
                  className={INPUT_ROW}
                  disabled={!editingEnabled}
                  value={src.planCumulative}
                  onChange={(e) => setCell(catId, "planCumulative", e.target.value)}
                />
                <div className="text-center tabular-nums text-slate-800">{formatCell(metric, d.factCumulative)}</div>
                <div className="text-center tabular-nums text-slate-700">{formatCell(metric, d.deltaCumulative)}</div>
                <div className="text-center tabular-nums text-slate-800">
                  {d.performancePct == null ? "—" : `${pctFmt.format(d.performancePct)}%`}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-slate-500">
          Накопленный факт считается как план накопит. + (факт мес. − план мес.). Выполнение % = факт нак. / план нак.
        </p>
      </section>

      <section className={panelClass}>
        <h3 className="text-sm font-semibold text-slate-900">Журнал изменений</h3>
        <p className="text-xs text-slate-500">
          После «Сохранить» фиксируются поле, старое и новое значение, сценарий, метрика и пользователь (роль из сессии).
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
                    {SALES_PLAN_SCENARIO_LABELS[h.scenario]} · {SALES_PLAN_METRIC_LABELS[h.metric]} ·{" "}
                    {SALES_PLAN_CATEGORY_LABELS[h.categoryId]}
                  </span>
                  <span className="text-slate-700">
                    {historyFieldLabel(h.field)}: {formatCell(h.metric, h.oldValue)} → {formatCell(h.metric, h.newValue)}
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
