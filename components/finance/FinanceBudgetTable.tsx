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

import {
  getGprProjectId,
  loadPersistedFinanceBudget,
  persistFinanceBudgetSnapshot,
  type BootstrapFinanceBudgetResult,
} from "@/lib/financeImportPersistence";
import {
  importFinanceBudgetCsv,
  mergeFinanceBudgetImport,
  type FinanceBudgetCsvImportAudit,
} from "@/lib/financeBudgetCsvImport";
import { financeBudgetLinePlanTotalRub, type FinanceBudgetSnapshot } from "@/lib/financeBudgetData";

export type FinanceBudgetTableHandle = {
  save: () => Promise<void>;
  cancel: () => void;
};

type Props = {
  embedded?: boolean;
};

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
  const bootstrapRef = useRef<BootstrapFinanceBudgetResult | null>(null);

  const [snapshot, setSnapshot] = useState<FinanceBudgetSnapshot>({ lines: [] });
  const [importAudit, setImportAudit] = useState<FinanceBudgetCsvImportAudit | null>(null);
  const [query, setQuery] = useState("");

  const bootstrap = useCallback(async () => {
    const loaded = await loadPersistedFinanceBudget(projectId);
    bootstrapRef.current = loaded;
    setSnapshot(loaded.snapshot);
  }, [projectId]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const persist = useCallback(async () => {
    await persistFinanceBudgetSnapshot(projectId, snapshot);
    bootstrapRef.current = {
      snapshot,
      bootstrapJson: JSON.stringify(snapshot),
    };
  }, [projectId, snapshot]);

  const resetToBootstrap = useCallback(() => {
    if (!bootstrapRef.current) return;
    const restored = JSON.parse(bootstrapRef.current.bootstrapJson) as FinanceBudgetSnapshot;
    setSnapshot(restored);
    setImportAudit(null);
  }, []);

  useImperativeHandle(ref, () => ({ save: persist, cancel: resetToBootstrap }), [persist, resetToBootstrap]);

  const handleCsvImport = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;

    const { lines: imported, audit } = await importFinanceBudgetCsv(file);
    setImportAudit(audit);

    if (imported.length === 0) {
      window.alert(
        audit.skippedRows[0]?.reason ?? "Не удалось загрузить строки бюджета. Проверьте формат CSV.",
      );
      return;
    }

    const merged = mergeFinanceBudgetImport(snapshot.lines, imported);
    const periodKeys = [
      ...new Set(audit.monthColumns.filter((c) => c.kind === "plan").map((c) => c.periodKey)),
    ].sort();
    const factPeriodKeys = [
      ...new Set(audit.monthColumns.filter((c) => c.kind === "fact").map((c) => c.periodKey)),
    ].sort();

    const nextSnapshot: FinanceBudgetSnapshot = {
      lines: merged,
      updatedAt: new Date().toISOString(),
      importMeta: {
        sourceFileName: file.name,
        headerRowIndex: audit.headerRowIndex,
        periodKeys,
        factPeriodKeys,
        lastImportAt: new Date().toISOString(),
      },
    };

    setSnapshot(nextSnapshot);
    await persistFinanceBudgetSnapshot(projectId, nextSnapshot);
    bootstrapRef.current = {
      snapshot: nextSnapshot,
      bootstrapJson: JSON.stringify(nextSnapshot),
    };
  };

  const filteredLines = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return snapshot.lines;
    return snapshot.lines.filter(
      (line) =>
        line.code.toLowerCase().includes(q) ||
        line.name.toLowerCase().includes(q) ||
        (line.category ?? "").toLowerCase().includes(q),
    );
  }, [snapshot.lines, query]);

  const shellClass = embedded ? "space-y-6" : "rounded-2xl border border-slate-200 bg-[#f8fafc] p-4 shadow-sm";

  return (
    <section className={shellClass}>
      {!embedded ? (
        <>
          <h2 className="text-lg font-semibold text-slate-900">Бюджет проекта</h2>
          <p className="mt-1 text-xs text-slate-600">
            Импорт CSV бюджета — источник данных для финансового контура (поступления, выплаты, ДДС и др.).
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
            Импорт бюджета CSV
          </button>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск: код, наименование, раздел"
            className="h-10 min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
          />
        </div>

        {importAudit ? (
          <p className="mt-2 text-xs leading-snug text-slate-600">
            Строк прочитано: {importAudit.parsedRows}. Строк загружено: {importAudit.loaded}. Ошибок:{" "}
            {importAudit.errors}. Дата последнего импорта:{" "}
            {formatImportDate(snapshot.importMeta?.lastImportAt ?? snapshot.updatedAt)}.
          </p>
        ) : snapshot.importMeta?.lastImportAt ? (
          <p className="mt-2 text-xs leading-snug text-slate-600">
            Дата последнего импорта: {formatImportDate(snapshot.importMeta.lastImportAt)}. Статей бюджета:{" "}
            {snapshot.lines.length}.
          </p>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
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
            {filteredLines.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                  Нет данных бюджета. Импортируйте CSV через кнопку «Импорт бюджета CSV».
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
    </section>
  );
});
