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

import { FinanceExecutionImportPanel } from "@/components/finance/FinanceExecutionImportPanel";
import {
  getGprProjectId,
  loadPersistedFinanceBudget,
  loadPersistedFinanceBudgetExecution,
  persistFinanceBudgetExecutionSnapshot,
  persistFinanceBudgetSnapshot,
  type BootstrapFinanceBudgetResult,
} from "@/lib/financeImportPersistence";
import { importFinanceCsv } from "@/lib/financeCsvImport";
import type { FinanceBudgetCsvImportAudit } from "@/lib/financeBudgetCsvImport";
import {
  emptyFinanceExecutionImport,
  financeExecutionKpiHasData,
  type FinanceExecutionImport,
} from "@/lib/financeBudgetExecutionData";
import { financeBudgetLinePlanTotalRub, type FinanceBudgetImport } from "@/lib/financeBudgetData";

export type FinanceBudgetTableHandle = {
  save: () => Promise<void>;
  cancel: () => void;
};

type Props = {
  embedded?: boolean;
};

type EditorPanel = "budget" | "execution";

function formatImportDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function rub(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(value));
}

export const FinanceBudgetTable = forwardRef<FinanceBudgetTableHandle, Props>(function FinanceBudgetTable(
  { embedded = false },
  ref,
) {
  const projectId = useMemo(() => getGprProjectId(), []);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const budgetBootstrapRef = useRef<BootstrapFinanceBudgetResult | null>(null);
  const executionBootstrapRef = useRef<string | null>(null);

  const [budgetImport, setBudgetImport] = useState<FinanceBudgetImport>({ lines: [] });
  const [executionImport, setExecutionImport] = useState<FinanceExecutionImport>(
    emptyFinanceExecutionImport(),
  );
  const [activePanel, setActivePanel] = useState<EditorPanel>("budget");
  const [budgetImportAudit, setBudgetImportAudit] = useState<FinanceBudgetCsvImportAudit | null>(null);
  const [query, setQuery] = useState("");

  const bootstrap = useCallback(async () => {
    const [budgetLoaded, executionLoaded] = await Promise.all([
      loadPersistedFinanceBudget(projectId),
      loadPersistedFinanceBudgetExecution(projectId),
    ]);

    budgetBootstrapRef.current = budgetLoaded;
    executionBootstrapRef.current = JSON.stringify(executionLoaded.snapshot);

    setBudgetImport(budgetLoaded.snapshot);
    setExecutionImport(executionLoaded.snapshot);

    if (financeExecutionKpiHasData(executionLoaded.snapshot.kpi) && budgetLoaded.snapshot.lines.length === 0) {
      setActivePanel("execution");
    } else {
      setActivePanel("budget");
    }
  }, [projectId]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const persist = useCallback(async () => {
    await persistFinanceBudgetSnapshot(projectId, budgetImport);
    budgetBootstrapRef.current = {
      snapshot: budgetImport,
      bootstrapJson: JSON.stringify(budgetImport),
    };
  }, [projectId, budgetImport]);

  const resetToBootstrap = useCallback(() => {
    if (budgetBootstrapRef.current) {
      const restored = JSON.parse(budgetBootstrapRef.current.bootstrapJson) as FinanceBudgetImport;
      setBudgetImport(restored);
      setBudgetImportAudit(null);
    }
    if (executionBootstrapRef.current) {
      setExecutionImport(JSON.parse(executionBootstrapRef.current) as FinanceExecutionImport);
    }
  }, []);

  useImperativeHandle(ref, () => ({ save: persist, cancel: resetToBootstrap }), [persist, resetToBootstrap]);

  const handleCsvImport = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;

    const result = await importFinanceCsv(file);

    if (result.format === "unknown") {
      window.alert(result.error);
      return;
    }

    if (result.format === "budget_execution") {
      try {
        await persistFinanceBudgetExecutionSnapshot(projectId, result.snapshot);
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Не удалось сохранить исполнение в БД.");
        return;
      }
      executionBootstrapRef.current = JSON.stringify(result.snapshot);
      setExecutionImport(result.snapshot);
      setActivePanel("execution");
      window.alert(
        `Импорт «Исполнение бюджета» выполнен. Найдено KPI: ${result.audit.foundMetrics} из 8.`,
      );
      return;
    }

    const { lines: imported, audit, budgetVersion } = result;
    setBudgetImportAudit(audit);
    setActivePanel("budget");

    if (imported.length === 0) {
      window.alert(
        audit.skippedRows[0]?.reason ?? "Не удалось загрузить строки бюджета. Проверьте формат CSV.",
      );
      return;
    }

    const periodKeys = [
      ...new Set(audit.monthColumns.filter((c) => c.kind === "plan").map((c) => c.periodKey)),
    ].sort();
    const factPeriodKeys = [
      ...new Set(audit.monthColumns.filter((c) => c.kind === "fact").map((c) => c.periodKey)),
    ].sort();

    const nextSnapshot: FinanceBudgetImport = {
      lines: imported,
      updatedAt: new Date().toISOString(),
      importMeta: {
        sourceFileName: file.name,
        headerRowIndex: audit.headerRowIndex,
        periodKeys,
        factPeriodKeys,
        lastImportAt: new Date().toISOString(),
        budgetVersion: budgetVersion ?? file.name.replace(/\.csv$/i, ""),
      },
    };

    setBudgetImport(nextSnapshot);
    try {
      await persistFinanceBudgetSnapshot(projectId, nextSnapshot);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Не удалось сохранить бюджет в БД.");
      return;
    }
    budgetBootstrapRef.current = {
      snapshot: nextSnapshot,
      bootstrapJson: JSON.stringify(nextSnapshot),
    };
  };

  const filteredLines = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return budgetImport.lines;
    return budgetImport.lines.filter(
      (line) =>
        line.code.toLowerCase().includes(q) ||
        line.name.toLowerCase().includes(q) ||
        (line.category ?? "").toLowerCase().includes(q),
    );
  }, [budgetImport.lines, query]);

  const shellClass = embedded ? "space-y-6" : "rounded-2xl border border-slate-200 bg-[#f8fafc] p-4 shadow-sm";
  const hasBudgetData = budgetImport.lines.length > 0;

  return (
    <section className={shellClass}>
      {!embedded ? (
        <>
          <h2 className="text-lg font-semibold text-slate-900">Экономика и финансы</h2>
          <p className="mt-1 text-xs text-slate-600">
            Два независимых импорта: «Бюджет проекта» (график и статьи) и «Исполнение бюджета» (KPI).
          </p>
        </>
      ) : null}

      <div className={`rounded-xl border border-slate-200 bg-white p-3 ${embedded ? "" : "mt-4"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(ev) => void handleCsvImport(ev)}
          />
          <button
            type="button"
            onClick={() => csvInputRef.current?.click()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Импорт CSV
          </button>

          <div className="inline-flex rounded-lg border border-slate-300 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => setActivePanel("budget")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                activePanel === "budget"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Бюджет проекта
            </button>
            <button
              type="button"
              onClick={() => setActivePanel("execution")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                activePanel === "execution"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Исполнение бюджета
            </button>
          </div>

          {activePanel === "budget" ? (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск: код, наименование, раздел"
              className="h-10 min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
            />
          ) : null}
        </div>

        {activePanel === "budget" && budgetImportAudit ? (
          <p className="mt-2 text-xs leading-snug text-slate-600">
            Строк прочитано: {budgetImportAudit.parsedRows}. Строк загружено: {budgetImportAudit.loaded}.
            Ошибок: {budgetImportAudit.errors}. Дата последнего импорта:{" "}
            {formatImportDate(budgetImport.importMeta?.lastImportAt ?? budgetImport.updatedAt)}
            {budgetImport.importMeta?.budgetVersion
              ? `. Версия бюджета: ${budgetImport.importMeta.budgetVersion}`
              : ""}
            .
          </p>
        ) : activePanel === "budget" && budgetImport.importMeta?.lastImportAt ? (
          <p className="mt-2 text-xs leading-snug text-slate-600">
            Дата последнего импорта: {formatImportDate(budgetImport.importMeta.lastImportAt)}. Статей
            бюджета: {budgetImport.lines.length}
            {budgetImport.importMeta.budgetVersion
              ? `. Версия: ${budgetImport.importMeta.budgetVersion}`
              : ""}
            .
          </p>
        ) : activePanel === "execution" && executionImport.importMeta?.lastImportAt ? (
          <p className="mt-2 text-xs leading-snug text-slate-600">
            Дата последнего импорта: {formatImportDate(executionImport.importMeta.lastImportAt)}.
            Найдено KPI: {executionImport.importMeta.foundMetrics ?? 0} из 8
            {executionImport.reportingDate
              ? `. Отчётная дата: ${executionImport.reportingDate}`
              : ""}
            .
          </p>
        ) : null}
      </div>

      {activePanel === "budget" ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Бюджет проекта — статьи
            </h3>
          </div>
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Код</th>
                <th className="px-3 py-2.5">Наименование</th>
                <th className="px-3 py-2.5">Раздел</th>
                <th className="px-3 py-2.5 text-right">Итого, ₽</th>
                <th className="px-3 py-2.5 text-right">Месяцев</th>
              </tr>
            </thead>
            <tbody>
              {!hasBudgetData || filteredLines.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                    {hasBudgetData
                      ? "Ничего не найдено по запросу."
                      : "Нет данных бюджета. Импортируйте CSV «Бюджет проекта»."}
                  </td>
                </tr>
              ) : (
                filteredLines.map((line) => (
                  <tr key={line.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className="px-3 py-2 font-medium text-slate-900">{line.code}</td>
                    <td className="px-3 py-2 text-slate-800">{line.name}</td>
                    <td className="px-3 py-2 text-slate-600">{line.category ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-900">
                      {rub(financeBudgetLinePlanTotalRub(line))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                      {Object.keys(line.monthlyPlanRub).length}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <FinanceExecutionImportPanel snapshot={executionImport} />
      )}
    </section>
  );
});
