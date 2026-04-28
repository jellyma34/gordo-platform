"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  analyzeFourPlanFactDates,
  analyzeGprCodeInList,
  compareGprCodesByNumericPath,
  getStatusByDeviation,
  GPR_CODE_FORMAT_RE,
  mergeGprRowIssues,
  normalizeGprCodeFinal,
  partIdToProjectPartKey,
  sanitizeGprCodeTyping,
  type ProjectPartKey,
} from "@/lib/gprUtils";
import { getGprProjectId } from "@/lib/gprImportPersistence";
import { normalizeTmcCsvRows, parseTmcCsvFile } from "@/lib/tmcCsvImport";
import { diffTmcImport, type TmcImportDiffStats } from "@/lib/tmcImportDiff";
import {
  loadTmcInitialItems,
  suggestNextTmcItemCode,
  TMC_DATA,
  tmcFactReferenceDate,
  tmcLifecycleLabel,
  tmcPlanReferenceDate,
  writeTmcSnapshotToStorage,
  type TMCItem,
} from "@/lib/tmcData";
import { formatStoredDateForUi } from "@/lib/ruIsoDate";
import { GprDateField } from "@/components/ui/GprDateField";
import { gprIssueStatusTitle } from "@/components/ui/GprRowIssueIndicator";

type Traffic = "green" | "yellow" | "red" | "gray" | "overdue_not_started";

const COLORS = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
  gray: "#6b7280",
  overdue_not_started: "#dc2626",
} as const;

function ms(iso: string | null | undefined) {
  if (!iso?.trim()) return null;
  const value = new Date(`${iso.trim()}T00:00:00`).getTime();
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

type EditableTmc = {
  id: string;
  itemCode: string;
  name: string;
  gprStage: string;
  planStart: string;
  planEnd: string;
  factStart: string;
  factEnd: string;
  planCost: string;
  factCost: string;
};

const EMPTY_FORM: EditableTmc = {
  id: "",
  itemCode: "",
  name: "",
  gprStage: "",
  planStart: "",
  planEnd: "",
  factStart: "",
  factEnd: "",
  planCost: "",
  factCost: "",
};

export type TmcTableHandle = {
  save: () => void;
  cancel: () => void;
};

type TmcTableProps = {
  embedded?: boolean;
  activePartId: number;
};

function sortTmcInPart(items: TMCItem[], part: ProjectPartKey): TMCItem[] {
  const rest = items.filter((x) => x.projectPart !== part);
  const partRows = items.filter((x) => x.projectPart === part);
  const sorted = [...partRows].sort(
    (a, b) =>
      compareGprCodesByNumericPath(a.itemCode, b.itemCode) || a.id.localeCompare(b.id),
  );
  return [...rest, ...sorted];
}

function isoOrEmptyOk(s: string): boolean {
  const t = s.trim();
  return !t || /^\d{4}-\d{2}-\d{2}$/.test(t);
}

export const TmcTable = forwardRef<TmcTableHandle, TmcTableProps>(function TmcTable(
  { embedded = false, activePartId },
  ref,
) {
  const activeProjectPart: ProjectPartKey = partIdToProjectPartKey(activePartId);

  const projectId = useMemo(() => getGprProjectId(), []);

  const [items, setItems] = useState<TMCItem[]>(() => loadTmcInitialItems(getGprProjectId()));
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [importStats, setImportStats] = useState<TmcImportDiffStats | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Traffic>("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EditableTmc>(EMPTY_FORM);

  useEffect(() => {
    setItems(loadTmcInitialItems(projectId));
  }, [projectId]);

  const rows = useMemo(
    () =>
      items
        .filter((item) => item.projectPart === activeProjectPart)
        .map((item) => {
          const deviation = deviationDays(item);
          const status = statusOf(item);
          return { ...item, deviation, status };
        }),
    [items, activeProjectPart],
  );

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const byQuery =
        !q ||
        row.name.toLowerCase().includes(q) ||
        row.itemCode.toLowerCase().includes(q) ||
        row.gprStage.toLowerCase().includes(q);
      const byStatus = statusFilter === "all" ? true : row.status === statusFilter;
      return byQuery && byStatus;
    });
  }, [rows, query, statusFilter]);

  const sortedFilteredRows = useMemo(() => {
    return [...filteredRows].sort(
      (a, b) =>
        compareGprCodesByNumericPath(a.itemCode, b.itemCode) || a.id.localeCompare(b.id),
    );
  }, [filteredRows]);

  const tmcRowIssues = useMemo(() => {
    const m = new Map<string, { errors: string[]; warnings: string[] }>();
    const peers = items.filter((t) => t.projectPart === activeProjectPart);
    for (const row of sortedFilteredRows) {
      const rowAsCode = { id: row.id, code: row.itemCode };
      const peersAsCode = peers.map((t) => ({ id: t.id, code: t.itemCode }));
      const merged = mergeGprRowIssues(
        analyzeGprCodeInList(rowAsCode, peersAsCode),
        analyzeFourPlanFactDates({
          planStart: row.planStart,
          planEnd: row.planEnd,
          factStart: row.factStart,
          factEnd: row.factEnd,
        }),
      );
      if (merged.errors.length > 0 || merged.warnings.length > 0) m.set(row.id, merged);
    }
    return m;
  }, [sortedFilteredRows, items, activeProjectPart]);

  const openCreate = () => {
    setEditingId(null);
    const prefix = activeProjectPart === "parking" ? "tmc-p-" : "tmc-";
    const id = `${prefix}${Date.now()}`;
    const suggested = suggestNextTmcItemCode(items, activeProjectPart, "Строительство зданий и сооружений");
    setForm({
      ...EMPTY_FORM,
      id,
      itemCode: suggested,
      gprStage: "Строительство зданий и сооружений",
    });
    setIsModalOpen(true);
  };

  const openEdit = (row: TMCItem) => {
    setEditingId(row.id);
    setForm({
      id: row.id,
      itemCode: row.itemCode,
      name: row.name,
      gprStage: row.gprStage,
      planStart: row.planStart ?? "",
      planEnd: row.planEnd ?? "",
      factStart: row.factStart ?? "",
      factEnd: row.factEnd ?? "",
      planCost: String(row.planCost),
      factCost: row.factCost === null ? "" : String(row.factCost),
    });
    setIsModalOpen(true);
  };

  const removeItem = (id: string) => {
    const ok = window.confirm("Удалить позицию ТМЦ?");
    if (!ok) return;
    setItems((prev) => prev.filter((x) => x.id !== id));
  };

  const persist = useCallback(() => {
    const peers = items.filter((t) => t.projectPart === activeProjectPart);
    const asCodes = peers.map((t) => ({ id: t.id, code: t.itemCode }));
    for (const t of peers) {
      const merged = mergeGprRowIssues(
        analyzeGprCodeInList({ id: t.id, code: t.itemCode }, asCodes),
        analyzeFourPlanFactDates({
          planStart: t.planStart,
          planEnd: t.planEnd,
          factStart: t.factStart,
          factEnd: t.factEnd,
        }),
      );
      if (merged.errors.length > 0) {
        window.alert(`Исправьте ошибки перед сохранением: ${t.itemCode} — ${merged.errors.join("; ")}`);
        return;
      }
    }
    try {
      writeTmcSnapshotToStorage(projectId, items);
      window.dispatchEvent(new Event("gordo-tmc-saved"));
    } catch {
      /* ignore */
    }
  }, [items, activeProjectPart, projectId]);

  const handleTmcCsvImport = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      try {
        const { rows, headers } = await parseTmcCsvFile(file);
        const normalized = normalizeTmcCsvRows(rows, headers);
        console.log("Строк данных (после поиска шапки):", rows.length);
        console.log("После фильтра и группировки:", normalized.length);

        if (normalized.length === 0) {
          setImportStats({
            total: 0,
            added: 0,
            updated: 0,
            unchanged: 0,
            skippedInvalid: rows.length,
          });
          window.alert(
            "В файле нет строк с распознаваемым наименованием позиции (или некорректный формат). Смотрите консоль: CSV columns.",
          );
          return;
        }

        const { result, stats } = diffTmcImport(items, normalized, rows.length);
        setImportStats(stats);
        setItems(result);
        writeTmcSnapshotToStorage(projectId, result);
        window.dispatchEvent(new Event("gordo-tmc-saved"));
      } catch (err) {
        console.error(err);
        window.alert(err instanceof Error ? err.message : "Не удалось разобрать CSV.");
      }
    },
    [projectId, items],
  );

  const resetToSeed = useCallback(() => {
    setItems((prev) => {
      const rest = prev.filter((x) => x.projectPart !== activeProjectPart);
      const seedForPart = TMC_DATA.filter((x) => x.projectPart === activeProjectPart);
      return [...rest, ...seedForPart];
    });
  }, [activeProjectPart]);

  useImperativeHandle(ref, () => ({ save: persist, cancel: resetToSeed }), [persist, resetToSeed]);

  const saveForm = () => {
    if (!form.name.trim() || !form.gprStage.trim() || !form.planCost.trim()) return;
    const itemCode = normalizeGprCodeFinal(form.itemCode);
    if (!itemCode || !GPR_CODE_FORMAT_RE.test(itemCode)) {
      window.alert("Укажите корректный код позиции (цифры и точки).");
      return;
    }
    if (
      !isoOrEmptyOk(form.planStart) ||
      !isoOrEmptyOk(form.planEnd) ||
      !isoOrEmptyOk(form.factStart) ||
      !isoOrEmptyOk(form.factEnd)
    ) {
      window.alert("Даты должны быть пустыми или в формате ГГГГ-ММ-ДД.");
      return;
    }

    const probeId = form.id || `tmc-${Date.now()}`;
    const peers = items.filter((x) => x.projectPart === activeProjectPart && x.id !== editingId);
    const probeRow: TMCItem = {
      id: probeId,
      itemCode,
      name: form.name.trim(),
      gprStage: form.gprStage.trim(),
      planCost: Number(form.planCost) || 0,
      factCost: form.factCost.trim() ? Number(form.factCost) || 0 : null,
      planStart: form.planStart.trim() || null,
      planEnd: form.planEnd.trim() || null,
      factStart: form.factStart.trim() || null,
      factEnd: form.factEnd.trim() || null,
      projectPart: editingId
        ? items.find((x) => x.id === editingId)?.projectPart ?? activeProjectPart
        : activeProjectPart,
    };

    const peersAsCode = peers.map((t) => ({ id: t.id, code: t.itemCode }));
    const merged = mergeGprRowIssues(
      analyzeGprCodeInList({ id: probeRow.id, code: probeRow.itemCode }, [
        ...peersAsCode,
        { id: probeRow.id, code: probeRow.itemCode },
      ]),
      analyzeFourPlanFactDates({
        planStart: probeRow.planStart,
        planEnd: probeRow.planEnd,
        factStart: probeRow.factStart,
        factEnd: probeRow.factEnd,
      }),
    );
    if (merged.errors.length > 0) {
      window.alert(merged.errors.join("\n"));
      return;
    }

    const payload: TMCItem = { ...probeRow, id: editingId ?? probeId };

    setItems((prev) => {
      const next = editingId
        ? prev.map((x) => (x.id === editingId ? payload : x))
        : [payload, ...prev];
      return sortTmcInPart(next, payload.projectPart);
    });
    setIsModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const shellClass = embedded
    ? "space-y-6"
    : "rounded-2xl border border-slate-200 bg-[#f8fafc] p-4 shadow-sm";

  return (
    <section className={shellClass}>
      {!embedded ? (
        <>
          <h2 className="text-lg font-semibold text-slate-900">Закупка ТМЦ</h2>
          <p className="mt-1 text-xs text-slate-600">
            Рабочий режим: позиции привязаны к выбранной части проекта (
            {activeProjectPart === "residential" ? "жилой дом" : "автостоянка"}).
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
            onChange={(ev) => void handleTmcCsvImport(ev)}
          />
          <button
            type="button"
            onClick={() => csvInputRef.current?.click()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Импорт CSV
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            + Добавить ТМЦ
          </button>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск: код, название, этап"
            className="h-10 min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | Traffic)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
          >
            <option value="all">Все статусы</option>
            <option value="green">В срок</option>
            <option value="yellow">Риск</option>
            <option value="red">Отставание</option>
            <option value="overdue_not_started">Не закуплено</option>
            <option value="gray">Нет данных</option>
          </select>
        </div>
        {importStats ? (
          <p className="mt-2 text-xs leading-snug text-slate-600">
            Файл: {importStats.total} записей после разбора.
            {importStats.skippedInvalid > 0 ? (
              <> Пропущено строк без наименования: {importStats.skippedInvalid}.</>
            ) : null}{" "}
            Обновлено: {importStats.updated}, добавлено: {importStats.added}, без изменений:{" "}
            {importStats.unchanged}.
          </p>
        ) : null}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2 text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="px-3 py-2">Код</th>
              <th className="px-3 py-2">Название</th>
              <th className="px-3 py-2">Этап ГПР</th>
              <th className="px-3 py-2">Цикл</th>
              <th className="px-3 py-2">План нач.</th>
              <th className="px-3 py-2">План кон.</th>
              <th className="px-3 py-2">Факт нач.</th>
              <th className="px-3 py-2">Факт кон.</th>
              <th className="px-3 py-2">План ₽</th>
              <th className="px-3 py-2">Факт ₽</th>
              <th className="px-3 py-2">Отклонение</th>
              <th className="px-3 py-2">Статус</th>
              <th className="px-3 py-2 text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {sortedFilteredRows.map((row) => {
              const statusColor = COLORS[row.status];
              const statusLabel =
                row.status === "green"
                  ? "В срок"
                  : row.status === "yellow"
                    ? "Риск"
                    : row.status === "overdue_not_started"
                      ? "Не закуплено"
                      : row.status === "red"
                        ? "Отставание"
                        : "Нет данных";
              const rowIssues = tmcRowIssues.get(row.id);
              const statusTitle = gprIssueStatusTitle(rowIssues);
              return (
                <tr
                  key={row.id}
                  className="rounded-lg border border-slate-200 bg-white text-slate-800 shadow-sm"
                >
                  <td className="rounded-l-lg px-3 py-3 font-mono text-xs">{row.itemCode}</td>
                  <td className="px-3 py-3 font-medium">{row.name}</td>
                  <td className="px-3 py-3 text-slate-600">{row.gprStage}</td>
                  <td className="px-3 py-3 text-xs text-slate-700">{tmcLifecycleLabel(row)}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{formatStoredDateForUi(row.planStart)}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{formatStoredDateForUi(row.planEnd)}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{formatStoredDateForUi(row.factStart)}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{formatStoredDateForUi(row.factEnd)}</td>
                  <td className="px-3 py-3 tabular-nums">{(row.planCost / 1_000_000).toFixed(2)} млн</td>
                  <td className="px-3 py-3 tabular-nums">
                    {row.factCost === null ? "—" : `${(row.factCost / 1_000_000).toFixed(2)} млн`}
                  </td>
                  <td className="px-3 py-3 tabular-nums" style={{ color: statusColor }}>
                    {row.deviation === null ? "—" : row.deviation > 0 ? `+${row.deviation} дн` : `${row.deviation} дн`}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className="inline-flex cursor-default rounded-full px-2 py-1 text-xs font-medium"
                      style={{
                        backgroundColor: `${statusColor}22`,
                        color: statusColor,
                        fontWeight: 500,
                      }}
                      title={statusTitle}
                    >
                      {statusLabel}
                    </span>
                  </td>
                  <td className="rounded-r-lg px-3 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(row.id)}
                        className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">
              {editingId ? "Редактировать ТМЦ" : "Добавить ТМЦ"}
            </h3>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                value={form.itemCode}
                onChange={(e) => setForm((p) => ({ ...p, itemCode: sanitizeGprCodeTyping(e.target.value) }))}
                onBlur={() => setForm((p) => ({ ...p, itemCode: normalizeGprCodeFinal(p.itemCode) }))}
                placeholder="Код позиции (2.05.01.1)"
                className="h-10 rounded-lg border border-slate-300 px-3 font-mono text-sm text-slate-900"
              />
              <input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Название"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900"
              />
              <input
                value={form.gprStage}
                onChange={(e) => {
                  const gprStage = e.target.value;
                  setForm((p) => {
                    if (editingId) return { ...p, gprStage };
                    const sugg = suggestNextTmcItemCode(items, activeProjectPart, gprStage);
                    return { ...p, gprStage, itemCode: sugg };
                  });
                }}
                placeholder="Этап ГПР (подпись)"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 md:col-span-2"
              />
              <GprDateField
                value={form.planStart}
                onIso={(iso) => setForm((p) => ({ ...p, planStart: iso }))}
                title="План: начало"
                fieldClassName="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
              <GprDateField
                value={form.planEnd}
                onIso={(iso) => setForm((p) => ({ ...p, planEnd: iso }))}
                title="План: окончание"
                fieldClassName="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
              <GprDateField
                value={form.factStart}
                onIso={(iso) => setForm((p) => ({ ...p, factStart: iso }))}
                title="Факт: начало"
                fieldClassName="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
              <GprDateField
                value={form.factEnd}
                onIso={(iso) => setForm((p) => ({ ...p, factEnd: iso }))}
                title="Факт: окончание"
                fieldClassName="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
              <input
                value={form.planCost}
                onChange={(e) => setForm((p) => ({ ...p, planCost: e.target.value }))}
                placeholder="План стоимость"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900"
              />
              <input
                value={form.factCost}
                onChange={(e) => setForm((p) => ({ ...p, factCost: e.target.value }))}
                placeholder="Факт стоимость (опц.)"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingId(null);
                  setForm(EMPTY_FORM);
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={saveForm}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
});
